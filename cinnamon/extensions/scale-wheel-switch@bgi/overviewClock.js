const Clutter = imports.gi.Clutter;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const St = imports.gi.St;
const Mainloop = imports.mainloop;
const Main = imports.ui.main;
const ClockFont = require('./clockFont');
const ClockText = require('./clockText');
const UiHelpers = require('./uiHelpers');

// Desktop setting of the 12 or 24-hour clock, read at each opening of Scale.
const DESKTOP_INTERFACE_SCHEMA = 'org.cinnamon.desktop.interface';
const DESKTOP_24H_KEY = 'clock-use-24h';
// logind's signal before a suspend (true) and after the resume (false): the minute timer
// does not count the time spent suspended.
const LOGIN1_BUS_NAME = 'org.freedesktop.login1';
const LOGIN1_MANAGER_INTERFACE = 'org.freedesktop.login1.Manager';
const LOGIN1_MANAGER_PATH = '/org/freedesktop/login1';
const PREPARE_FOR_SLEEP_SIGNAL = 'PrepareForSleep';
// Panel clocks whose label gives the row its font and colour, first found first used.
const PANEL_CLOCK_UUIDS = ['calendar@bgi', 'calendar@cinnamon.org'];

// The fallback to the stylesheet rule is logged once per session, not at each opening.
let fallbackLogged = false;

// What St resolved for the label of the first running panel clock: {family, size,
// isAbsolute, weight, color}, or null without a clock, a label or a style yet.
function readPanelClockFont() {
    for (const uuid of PANEL_CLOCK_UUIDS) {
        for (const applet of Main.AppletManager.getRunningInstancesForUuid(uuid)) {
            const label = applet._applet_label;
            const node = label && label.peek_theme_node();
            if (!node)
                continue;

            const font = node.get_font();
            return {
                family: font.get_family(),
                size: font.get_size(),
                isAbsolute: font.get_size_is_absolute(),
                weight: font.get_weight(),
                color: node.get_foreground_color(),
            };
        }
    }
    return null;
}

// The panel clock's look, read at each opening so a change of the panel's text size shows;
// the .scale-clock rule when it cannot be read.
function applyPanelClockStyle(label) {
    let style = null;
    try {
        style = ClockFont.panelClockStyle(readPanelClockFont());
    } catch (e) {
        logFallback(`reading the panel clock font failed: ${e}`);
        return;
    }
    if (style === null) {
        logFallback('no panel clock font found');
        return;
    }
    label.set_style(style);
}

function logFallback(reason) {
    if (fallbackLogged)
        return;

    fallbackLogged = true;
    global.logError(`[scale-wheel-switch] clock row: ${reason}, the stylesheet size is used`);
}

// Band at the top of the primary monitor, above the search field: the date and the local
// time. It lives only while Scale is open; its timer fires at each minute change and after
// a resume from suspend.
var OverviewClock = class OverviewClock {
    constructor() {
        this._monitor = Main.layoutManager.primaryMonitor;
        this._timeoutId = 0;
        this._sleepSubscriptionId = 0;
        this._use24h = new Gio.Settings({ schema_id: DESKTOP_INTERFACE_SCHEMA }).get_boolean(DESKTOP_24H_KEY);

        // Never focused, never clicked: like the other bands, it swallows the clicks so they
        // do not reach Scale's background.
        this._label = new St.Label({ style_class: 'scale-clock', x_align: Clutter.ActorAlign.CENTER });
        applyPanelClockStyle(this._label);
        this.actor = new St.Bin({ style_class: 'scale-clock-bar', child: this._label, reactive: true });
        UiHelpers.swallowClicks(this.actor);
        this.actor.set_position(this._monitor.x, this._monitor.y);
        this.actor.set_width(this._monitor.width);

        UiHelpers.destroyOnFailure(this, () => this._show());
    }

    _show() {
        this._tick();
        this._sleepSubscriptionId = Gio.DBus.system.signal_subscribe(LOGIN1_BUS_NAME, LOGIN1_MANAGER_INTERFACE,
            PREPARE_FOR_SLEEP_SIGNAL, LOGIN1_MANAGER_PATH, null, Gio.DBusSignalFlags.NONE,
            (connection, sender, path, iface, signal, parameters) => this._onPrepareForSleep(parameters));
        Main.overview._group.insert_child_below(this.actor, Main.overview._coverPane);
    }

    getHeight() {
        return UiHelpers.getNaturalHeight(this.actor);
    }

    // Shows the current minute, then waits for the next one.
    _tick() {
        const now = GLib.DateTime.new_now_local();
        this._label.set_text(ClockText.formatClock(ClockText.clockPartsOf(now), this._use24h));
        const delay = ClockText.msUntilNextMinute(now.get_second(), now.get_microsecond());
        this._timeoutId = Mainloop.timeout_add(delay, () => {
            this._timeoutId = 0;
            this._tick();
            return false;
        });
    }

    // After a resume: the current minute at once, and a timer aligned to it again.
    _onPrepareForSleep(parameters) {
        const [isSuspending] = parameters.deep_unpack();
        if (isSuspending)
            return;

        this._removeTimeout();
        this._tick();
    }

    _removeTimeout() {
        if (this._timeoutId) {
            Mainloop.source_remove(this._timeoutId);
            this._timeoutId = 0;
        }
    }

    destroy() {
        this._removeTimeout();
        if (this._sleepSubscriptionId) {
            Gio.DBus.system.signal_unsubscribe(this._sleepSubscriptionId);
            this._sleepSubscriptionId = 0;
        }
        this.actor.destroy();
    }
};
