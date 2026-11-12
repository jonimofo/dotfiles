const Cinnamon = imports.gi.Cinnamon;
const Clutter = imports.gi.Clutter;
const St = imports.gi.St;
const Mainloop = imports.mainloop;
const Main = imports.ui.main;
const Tooltips = imports.ui.tooltips;
const SignalManager = imports.misc.signalManager;
const UiHelpers = require('./uiHelpers');

// The panel applet whose pinned apps the dock shows, and its settings key.
const PANEL_APPLET_UUID = 'grouped-window-list@cinnamon.org';
const PINNED_APPS_KEY = 'pinned-apps';
// Stylesheet property of the dock: icon size, which create_icon_texture needs as a number.
// It is reduced when the icons do not fit in the monitor's width.
const ICON_SIZE_PROPERTY = '-scale-dock-icon-size';
const RUNNING_DOT_STYLE_CLASS = 'scale-dock-dot-running';

// The pinned apps of the first window list applet on the panels, in its order. An id that
// no longer resolves (application removed) is left out.
function getPinnedApps() {
    const [applet] = Main.AppletManager.getRunningInstancesForUuid(PANEL_APPLET_UUID);
    if (!applet)
        return [];

    const appSystem = Cinnamon.AppSystem.get_default();
    const apps = (applet.settings.getValue(PINNED_APPS_KEY) || [])
        .map(id => appSystem.lookup_app(id))
        .filter(app => app);
    return Array.from(new Set(apps));
}

// Windows Scale would show, most recently used first: an app with none is not running.
function getAppWindows(app) {
    return app.get_windows()
        .filter(metaWindow => Main.isInteresting(metaWindow))
        .sort((a, b) => b.get_user_time() - a.get_user_time());
}

function isRunning(app) {
    return getAppWindows(app).length > 0;
}

// Sequence number of the app's oldest window: muffin numbers windows in creation order, so
// sorting on it keeps the apps in the order they opened, whatever gets the focus.
function getOldestWindowSequence(app) {
    return Math.min(...getAppWindows(app).map(metaWindow => metaWindow.get_stable_sequence()));
}

// Running apps that are not pinned, in the order they opened. Window-backed apps (a window
// with no .desktop file) are left out: they cannot open a new window.
function getOtherRunningApps(pinnedApps) {
    return Cinnamon.AppSystem.get_default().get_running()
        .filter(app => !pinnedApps.includes(app) && !app.is_window_backed() && isRunning(app))
        .sort((a, b) => getOldestWindowSequence(a) - getOldestWindowSequence(b));
}

// The apps the dock shows: the panel's pinned apps, then the other running ones.
function getDockApps() {
    const pinned = getPinnedApps();
    return { pinned, others: getOtherRunningApps(pinned) };
}

function countDockApps({ pinned, others }) {
    return pinned.length + others.length;
}

// Main.activateWindow only closes Scale when it does not have to switch workspace:
// the switch is done here first.
function activateWindow(metaWindow) {
    const time = global.get_current_time();
    const workspace = metaWindow.get_workspace();
    if (!metaWindow.is_on_all_workspaces() && workspace !== global.workspace_manager.get_active_workspace())
        workspace.activate(time);
    Main.activateWindow(metaWindow, time);
}

// GNOME dash behaviour: a middle click always opens a new window, any other click goes to
// the app's most recent window, or launches the app when it has none.
function onIconClicked(app, button) {
    if (button === Clutter.BUTTON_MIDDLE) {
        UiHelpers.openNewWindow(app);
        return;
    }

    const [mostRecentWindow] = getAppWindows(app);
    if (!mostRecentWindow) {
        UiHelpers.openNewWindow(app);
        return;
    }
    activateWindow(mostRecentWindow);
}

// Dock of application icons, centered at the bottom of the primary monitor while Scale is
// open. The full-width band around it swallows clicks, like the strip. The icons follow
// apps opening their first window and closing their last one; the dock keeps the height it
// had at opening, so Scale's windows never move.
var AppDock = class AppDock {
    constructor(dockApps) {
        this._monitor = Main.layoutManager.primaryMonitor;
        this._signals = new SignalManager.SignalManager(null);
        this._rebuildIdleId = 0;

        this._box = new St.BoxLayout({ style_class: 'scale-dock' });
        this.actor = new St.Bin({ style_class: 'scale-dock-bar', child: this._box, reactive: true });
        UiHelpers.swallowClicks(this.actor);
        this.actor.set_width(this._monitor.width);

        // Below the cover pane, which blocks input during the Scale open and close animations.
        Main.overview._group.insert_child_below(this.actor, Main.overview._coverPane);

        // Measured at the full icon size: a reduced size later never changes the height.
        this._defaultIconSize = Math.round(this._box.get_theme_node().get_length(ICON_SIZE_PROPERTY));
        this._buildIcons(dockApps, this._defaultIconSize);
        this._height = UiHelpers.getNaturalHeight(this.actor);
        this.actor.set_height(this._height);
        this.actor.set_position(this._monitor.x, this._monitor.y + this._monitor.height - this._height);
        this._fitIcons(dockApps);

        this._signals.connect(Cinnamon.AppSystem.get_default(), 'app-state-changed', this._queueRebuild, this);
    }

    getHeight() {
        return this._height;
    }

    // Several state changes come for one launch: rebuild once, when idle.
    _queueRebuild() {
        if (this._rebuildIdleId)
            return;

        this._rebuildIdleId = Mainloop.idle_add(() => {
            this._rebuildIdleId = 0;
            const dockApps = getDockApps();
            this._buildIcons(dockApps, this._defaultIconSize);
            this._fitIcons(dockApps);
            return false;
        });
    }

    // Built at the full size first; when that is wider than the monitor, built again at the
    // size that fits. Only the icons shrink, what the stylesheet adds around them does not.
    _fitIcons(dockApps) {
        const count = countDockApps(dockApps);
        const naturalWidth = UiHelpers.getNaturalWidth(this._box);
        if (count === 0 || naturalWidth <= this._monitor.width)
            return;

        const fixedWidth = naturalWidth - count * this._defaultIconSize;
        const fittingSize = Math.max(1, Math.floor((this._monitor.width - fixedWidth) / count));
        this._buildIcons(dockApps, fittingSize);
    }

    // Call once the dock is on the stage. The separator only splits two non-empty parts.
    _buildIcons({ pinned, others }, iconSize) {
        this._box.destroy_all_children();
        for (const app of pinned)
            this._box.add_actor(this._createIcon(app, iconSize));
        if (pinned.length > 0 && others.length > 0)
            this._box.add_actor(new St.Widget({ style_class: 'scale-dock-separator' }));
        for (const app of others)
            this._box.add_actor(this._createIcon(app, iconSize));
        this._box.visible = pinned.length + others.length > 0;
    }

    // The dot is always there, transparent when the app is not running, so icons never
    // shift when an app starts or stops.
    _createIcon(app, iconSize) {
        const dot = new St.Widget({ style_class: 'scale-dock-dot', x_align: Clutter.ActorAlign.CENTER });
        if (isRunning(app))
            dot.add_style_class_name(RUNNING_DOT_STYLE_CLASS);

        const icon = new St.BoxLayout({
            style_class: 'scale-dock-icon',
            vertical: true,
            reactive: true,
            track_hover: true,
        });
        icon.add_actor(new St.Bin({ child: app.create_icon_texture(iconSize) }));
        icon.add_actor(dot);
        // Destroyed with the icon.
        new Tooltips.Tooltip(icon, app.get_name());
        // Connected before swallowClicks, whose handlers stop the event.
        icon.connect('button-release-event', (actor, event) => onIconClicked(app, event.get_button()));
        UiHelpers.swallowClicks(icon);
        return icon;
    }

    destroy() {
        this._signals.disconnectAllSignals();
        if (this._rebuildIdleId) {
            Mainloop.source_remove(this._rebuildIdleId);
            this._rebuildIdleId = 0;
        }
        this.actor.destroy();
    }
};
