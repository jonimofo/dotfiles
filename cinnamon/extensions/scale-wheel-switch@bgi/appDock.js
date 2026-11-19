const Cinnamon = imports.gi.Cinnamon;
const Clutter = imports.gi.Clutter;
const St = imports.gi.St;
const Mainloop = imports.mainloop;
const Main = imports.ui.main;
const Tooltips = imports.ui.tooltips;
const SignalManager = imports.misc.signalManager;
const UiHelpers = require('./uiHelpers');
const DockMenu = require('./dockMenu');

// The panel applet whose pinned apps the dock shows, and its settings key.
const PANEL_APPLET_UUID = 'grouped-window-list@cinnamon.org';
const PINNED_APPS_KEY = 'pinned-apps';
// Stylesheet property of the dock: icon size, which create_icon_texture needs as a number.
// It is reduced when the icons do not fit in the monitor's width.
const ICON_SIZE_PROPERTY = '-scale-dock-icon-size';
const RUNNING_DOT_STYLE_CLASS = 'scale-dock-dot-running';
// The buttons a dock icon answers (see AppDock._onIconClicked): side buttons do nothing.
const CLICK_BUTTONS = [Clutter.BUTTON_PRIMARY, Clutter.BUTTON_MIDDLE, Clutter.BUTTON_SECONDARY];

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

// Sequence number of the oldest of @windows: muffin numbers windows in creation order, so
// sorting on it keeps the apps in the order they opened, whatever gets the focus.
function getOldestWindowSequence(windows) {
    return Math.min(...windows.map(metaWindow => metaWindow.get_stable_sequence()));
}

// app -> sequence number of its oldest window, for the apps of @apps that are running.
function mapOldestWindowSequences(apps) {
    const sequences = new Map();
    for (const app of apps) {
        const windows = getAppWindows(app);
        if (windows.length > 0)
            sequences.set(app, getOldestWindowSequence(windows));
    }
    return sequences;
}

// The apps the dock shows: the panel's pinned apps, then the other running ones in the
// order they opened, and which of them are running. Window-backed apps (a window with no
// .desktop file) are left out: they cannot open a new window.
function getDockApps() {
    const pinned = getPinnedApps();
    const candidates = Cinnamon.AppSystem.get_default().get_running()
        .filter(app => !pinned.includes(app) && !app.is_window_backed());
    const sequences = mapOldestWindowSequences([...pinned, ...candidates]);
    const others = candidates
        .filter(app => sequences.has(app))
        .sort((a, b) => sequences.get(a) - sequences.get(b));
    return { pinned, others, running: new Set(sequences.keys()) };
}

// The windows the dock menu's Close asks to close: the ones Scale shows, on every workspace,
// except those muffin says cannot be closed. Their count is the one in the menu's label.
function getClosableWindows(app) {
    return getAppWindows(app).filter(metaWindow => metaWindow.can_close());
}

// Each window is asked to close as its title bar's close button does: an app may ask to
// save first, or refuse. Scale stays open on the same workspace.
function closeWindows(windows) {
    const time = global.get_current_time();
    for (const metaWindow of windows)
        metaWindow.delete(time);
}

// Of the windows counted when the menu opened, those still closable when Close is chosen:
// never more than the label says, none that closed meanwhile.
function getStillClosableWindows(app, countedWindows) {
    const closable = getClosableWindows(app);
    return countedWindows.filter(metaWindow => closable.includes(metaWindow));
}

// The workspaces where a prompt of @windows can appear: each window's own, and the active
// one for a window on every workspace.
function getPromptWorkspaces(windows) {
    const workspaces = new Set();
    for (const metaWindow of windows) {
        if (metaWindow.is_on_all_workspaces())
            workspaces.add(global.workspace_manager.get_active_workspace());
        else
            workspaces.add(metaWindow.get_workspace());
    }
    return workspaces;
}

// Stock Scale's close (WindowClone.closeWindow in workspace.js): a window asked to close
// can open a prompt attached to it ("save changes?"), which Scale shows no clone of. The
// first new window transient for one of @windows goes to @onPrompt, from an idle as stock
// does (the new window is not mapped yet). Stock stops at the first new window of any kind;
// this watch waits for a prompt until destroyed, and has no time limit, like stock.
var ClosePromptWatch = class ClosePromptWatch {
    constructor(windows, onPrompt) {
        this._windows = windows;
        this._onPrompt = onPrompt;
        this._idleId = 0;
        this._connections = [...getPromptWorkspaces(windows)].map(workspace =>
            [workspace, workspace.connect('window-added', (source, metaWindow) => this._onWindowAdded(metaWindow))]);
    }

    _onWindowAdded(metaWindow) {
        if (!this._windows.includes(metaWindow.get_transient_for()))
            return;

        this._disconnect();
        this._idleId = Mainloop.idle_add(() => {
            this._idleId = 0;
            this._onPrompt(metaWindow);
            return false;
        });
    }

    _disconnect() {
        for (const [workspace, id] of this._connections)
            workspace.disconnect(id);
        this._connections = [];
    }

    destroy() {
        this._disconnect();
        if (this._idleId) {
            Mainloop.source_remove(this._idleId);
            this._idleId = 0;
        }
    }
};

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

// GNOME dash behaviour: a middle click always opens a new window, a left click goes to the
// app's most recent window, or launches the app when it has none.
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
// apps starting and stopping; the dock keeps the height it had at opening, so Scale's
// windows never move.
var AppDock = class AppDock {
    constructor(dockApps) {
        this._monitor = Main.layoutManager.primaryMonitor;
        this._signals = new SignalManager.SignalManager(null);
        this._rebuildIdleId = 0;
        this._menu = new DockMenu.DockMenu(this._monitor);
        this._promptWatch = null;

        this._box = new St.BoxLayout({ style_class: 'scale-dock' });
        this.actor = new St.Bin({ style_class: 'scale-dock-bar', child: this._box, reactive: true });
        UiHelpers.swallowClicks(this.actor);
        this.actor.set_width(this._monitor.width);

        UiHelpers.destroyOnFailure(this, () => this._show(dockApps));
    }

    _show(dockApps) {
        // Below the cover pane, which blocks input during the Scale open and close animations.
        Main.overview._group.insert_child_below(this.actor, Main.overview._coverPane);

        // Measured at the full icon size: a reduced size later never changes the height.
        this._defaultIconSize = UiHelpers.getIconSize(this._box, ICON_SIZE_PROPERTY);
        this._buildIcons(dockApps, this._defaultIconSize);
        this._height = UiHelpers.getNaturalHeight(this.actor);
        this.actor.set_height(this._height);
        this.actor.set_position(this._monitor.x, this._monitor.y + this._monitor.height - this._height);
        this._fitIcons(dockApps);

        this._signals.connect(Cinnamon.AppSystem.get_default(), 'app-state-changed', this._queueRebuild, this);
        this._signals.connect(Main.overview, 'hiding', this._onScaleHiding, this);
    }

    getHeight() {
        return this._height;
    }

    _onScaleHiding() {
        this._menu.close();
        this._stopPromptWatch();
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
    // size that fits. Measured in icon size units: icons are that size times the display scale.
    _fitIcons(dockApps) {
        const scaleFactor = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const fittingSize = UiHelpers.getFittingItemWidth(
            UiHelpers.getNaturalWidth(this._box) / scaleFactor,
            this._monitor.width / scaleFactor,
            countDockApps(dockApps),
            this._defaultIconSize);
        if (fittingSize !== null)
            this._buildIcons(dockApps, fittingSize);
    }

    // Call once the dock is on the stage. The separator only splits two non-empty parts.
    // An open menu closes: its icon is destroyed.
    _buildIcons({ pinned, others, running }, iconSize) {
        this._menu.close();
        this._box.destroy_all_children();
        for (const app of pinned)
            this._box.add_actor(this._createIcon(app, iconSize, running.has(app)));
        if (pinned.length > 0 && others.length > 0)
            this._box.add_actor(new St.Widget({ style_class: 'scale-dock-separator' }));
        for (const app of others)
            this._box.add_actor(this._createIcon(app, iconSize, true));
        this._box.visible = pinned.length + others.length > 0;
    }

    // The dot is always there, transparent when the app is not running, so icons never
    // shift when an app starts or stops.
    _createIcon(app, iconSize, isRunning) {
        const dot = new St.Widget({ style_class: 'scale-dock-dot', x_align: Clutter.ActorAlign.CENTER });
        if (isRunning)
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
        const tooltip = new Tooltips.Tooltip(icon, app.get_name());
        UiHelpers.connectClick(icon, CLICK_BUTTONS, button => this._onIconClicked(app, icon, tooltip, button));
        return icon;
    }

    // A right click opens the icon's menu, or closes it when it is already open on that icon.
    // The windows Close acts on are counted now, with the label.
    _onIconClicked(app, icon, tooltip, button) {
        if (button !== Clutter.BUTTON_SECONDARY) {
            onIconClicked(app, button);
            return;
        }

        const countedWindows = getClosableWindows(app);
        const entries = DockMenu.getDockMenuEntries(countedWindows.length);
        this._menu.toggle(icon, entries, action => this._runMenuAction(app, action, countedWindows), tooltip);
    }

    _runMenuAction(app, action, countedWindows) {
        switch (action) {
        case DockMenu.DockMenuAction.NEW_WINDOW:
            UiHelpers.openNewWindow(app);
            break;
        case DockMenu.DockMenuAction.CLOSE_WINDOWS:
            this._closeWindows(getStillClosableWindows(app, countedWindows));
            break;
        }
    }

    // Watched before the windows are asked to close, as stock does. A prompt goes to its
    // window as a left click would: its workspace, then Scale closes.
    _closeWindows(windows) {
        this._stopPromptWatch();
        this._promptWatch = new ClosePromptWatch(windows, activateWindow);
        closeWindows(windows);
    }

    _stopPromptWatch() {
        if (this._promptWatch) {
            this._promptWatch.destroy();
            this._promptWatch = null;
        }
    }

    destroy() {
        this._menu.destroy();
        this._stopPromptWatch();
        this._signals.disconnectAllSignals();
        if (this._rebuildIdleId) {
            Mainloop.source_remove(this._rebuildIdleId);
            this._rebuildIdleId = 0;
        }
        this.actor.destroy();
    }
};
