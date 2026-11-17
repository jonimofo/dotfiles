const Clutter = imports.gi.Clutter;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const St = imports.gi.St;
const Mainloop = imports.mainloop;
const Main = imports.ui.main;
const ClockText = require('./clockText');
const UiHelpers = require('./uiHelpers');

// Desktop setting of the 12 or 24-hour clock, read at each opening of Scale.
const DESKTOP_INTERFACE_SCHEMA = 'org.cinnamon.desktop.interface';
const DESKTOP_24H_KEY = 'clock-use-24h';

// Band at the top of the primary monitor, above the search field: the date and the local
// time. It lives only while Scale is open, and its timer fires at each minute change.
var OverviewClock = class OverviewClock {
    constructor() {
        this._monitor = Main.layoutManager.primaryMonitor;
        this._timeoutId = 0;
        this._use24h = new Gio.Settings({ schema_id: DESKTOP_INTERFACE_SCHEMA }).get_boolean(DESKTOP_24H_KEY);

        // Never focused, never clicked: like the other bands, it swallows the clicks so they
        // do not reach Scale's background.
        this._label = new St.Label({ style_class: 'scale-clock', x_align: Clutter.ActorAlign.CENTER });
        this.actor = new St.Bin({ style_class: 'scale-clock-bar', child: this._label, reactive: true });
        UiHelpers.swallowClicks(this.actor);
        this.actor.set_position(this._monitor.x, this._monitor.y);
        this.actor.set_width(this._monitor.width);

        UiHelpers.destroyOnFailure(this, () => this._show());
    }

    _show() {
        this._tick();
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

    destroy() {
        if (this._timeoutId) {
            Mainloop.source_remove(this._timeoutId);
            this._timeoutId = 0;
        }
        this.actor.destroy();
    }
};
