const Cinnamon = imports.gi.Cinnamon;
const Clutter = imports.gi.Clutter;
const St = imports.gi.St;
const Main = imports.ui.main;
const Tooltips = imports.ui.tooltips;
const UiHelpers = require('./uiHelpers');

// The panel applet whose pinned apps the dock shows, and its settings key.
const PANEL_APPLET_UUID = 'grouped-window-list@cinnamon.org';
const PINNED_APPS_KEY = 'pinned-apps';
// Stylesheet property of the dock: icon size, which create_icon_texture needs as a number.
const ICON_SIZE_PROPERTY = '-scale-dock-icon-size';

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

// The apps the dock shows, in order.
function getDockApps() {
    return getPinnedApps();
}

// Windows Scale would show, most recently used first: an app with none is not running.
function getAppWindows(app) {
    return app.get_windows()
        .filter(metaWindow => Main.isInteresting(metaWindow))
        .sort((a, b) => b.get_user_time() - a.get_user_time());
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
// open. The full-width band around it swallows clicks, like the strip.
var AppDock = class AppDock {
    constructor(apps) {
        this._monitor = Main.layoutManager.primaryMonitor;

        this._box = new St.BoxLayout({ style_class: 'scale-dock' });
        this.actor = new St.Bin({ style_class: 'scale-dock-bar', child: this._box, reactive: true });
        UiHelpers.swallowClicks(this.actor);
        this.actor.set_width(this._monitor.width);

        // Below the cover pane, which blocks input during the Scale open and close animations.
        Main.overview._group.insert_child_below(this.actor, Main.overview._coverPane);

        this._buildIcons(apps);
        this.actor.set_position(this._monitor.x, this._monitor.y + this._monitor.height - this.getHeight());
    }

    getHeight() {
        return UiHelpers.getNaturalHeight(this.actor);
    }

    // Call once the dock is on the stage: the icon size comes from its theme node.
    _buildIcons(apps) {
        this._box.destroy_all_children();
        const iconSize = Math.round(this._box.get_theme_node().get_length(ICON_SIZE_PROPERTY));
        for (const app of apps)
            this._box.add_actor(this._createIcon(app, iconSize));
    }

    _createIcon(app, iconSize) {
        const icon = new St.Bin({
            style_class: 'scale-dock-icon',
            child: app.create_icon_texture(iconSize),
            reactive: true,
            track_hover: true,
        });
        // Destroyed with the icon.
        new Tooltips.Tooltip(icon, app.get_name());
        // Connected before swallowClicks, whose handlers stop the event.
        icon.connect('button-release-event', (actor, event) => onIconClicked(app, event.get_button()));
        UiHelpers.swallowClicks(icon);
        return icon;
    }

    destroy() {
        this.actor.destroy();
    }
};
