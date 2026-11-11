const Clutter = imports.gi.Clutter;
const Mainloop = imports.mainloop;
const Meta = imports.gi.Meta;
const St = imports.gi.St;
const Main = imports.ui.main;
const SignalManager = imports.misc.signalManager;
const WindowUtils = imports.misc.windowUtils;

// Thumbnail size as a fraction of the primary monitor. Colors and spacing are in stylesheet.css.
const THUMBNAIL_SCALE = 0.12;
const ACTIVE_PSEUDO_CLASS = 'selected';

// Same rule as Scale's big view, so a thumbnail shows exactly the windows Scale shows
// (a sticky drop-down terminal would otherwise cover every thumbnail).
function isThumbnailWindow(windowActor, workspaceIndex, monitorIndex) {
    const metaWindow = windowActor.get_meta_window();
    if (!metaWindow || !Main.isInteresting(metaWindow))
        return false;
    if (metaWindow.get_monitor() !== monitorIndex)
        return false;

    return Main.isWindowActorDisplayedOnWorkspace(windowActor, workspaceIndex);
}

// One workspace: wallpaper, live window clones and the workspace name.
class WorkspaceThumbnail {
    constructor(metaWorkspace, monitor, monitorIndex) {
        this.metaWorkspace = metaWorkspace;
        this._monitor = monitor;
        this._monitorIndex = monitorIndex;

        const width = Math.round(monitor.width * THUMBNAIL_SCALE);
        const height = Math.round(monitor.height * THUMBNAIL_SCALE);

        this._desktop = new Clutter.Actor({ width, height, clip_to_allocation: true });
        this._addWallpaper();
        this._windows = new Clutter.Actor();
        this._desktop.add_actor(this._windows);

        const label = new St.Label({
            style_class: 'scale-strip-label',
            text: Main.getWorkspaceName(metaWorkspace.index()),
            x_expand: true,
            y_expand: true,
            x_align: Clutter.ActorAlign.END,
            y_align: Clutter.ActorAlign.END,
        });

        const content = new St.Widget({ layout_manager: new Clutter.BinLayout(), width, height });
        content.add_actor(this._desktop);
        content.add_actor(label);

        this.actor = new St.Bin({ style_class: 'scale-strip-thumbnail', child: content });
        this.refreshWindows();
    }

    _addWallpaper() {
        if (Meta.is_wayland_compositor())
            return;

        // The background actor spans the whole screen: shift it so the monitor's corner is at 0,0.
        const wallpaper = Meta.X11BackgroundActor.new_for_display(global.display);
        wallpaper.set_scale(THUMBNAIL_SCALE, THUMBNAIL_SCALE);
        wallpaper.set_position(-this._monitor.x * THUMBNAIL_SCALE, -this._monitor.y * THUMBNAIL_SCALE);
        this._desktop.add_actor(wallpaper);
    }

    // global.get_window_actors() is in stacking order, so clones are added bottom to top.
    refreshWindows() {
        this._windows.destroy_all_children();

        const workspaceIndex = this.metaWorkspace.index();
        for (const windowActor of global.get_window_actors()) {
            if (isThumbnailWindow(windowActor, workspaceIndex, this._monitorIndex))
                this._addWindowClone(windowActor);
        }
    }

    _addWindowClone(windowActor) {
        const clone = WindowUtils.getCloneOrContent(windowActor);
        if (!clone)
            return;

        const [x, y] = windowActor.get_position();
        const [width, height] = windowActor.get_size();
        clone.set_position((x - this._monitor.x) * THUMBNAIL_SCALE, (y - this._monitor.y) * THUMBNAIL_SCALE);
        clone.set_size(width * THUMBNAIL_SCALE, height * THUMBNAIL_SCALE);
        this._windows.add_actor(clone);
    }

    setActive(isActive) {
        if (isActive)
            this.actor.add_style_pseudo_class(ACTIVE_PSEUDO_CLASS);
        else
            this.actor.remove_style_pseudo_class(ACTIVE_PSEUDO_CLASS);
    }
}

// Top strip of workspace thumbnails, shown on the primary monitor while Scale is open.
// The big Scale view is pushed below it for as long as the strip exists.
var WorkspaceStrip = class WorkspaceStrip {
    constructor() {
        this._monitorIndex = Main.layoutManager.primaryIndex;
        this._monitor = Main.layoutManager.primaryMonitor;
        this._signals = new SignalManager.SignalManager(null);
        this._workspaceSignals = new SignalManager.SignalManager(null);
        this._refreshIdleId = 0;
        this._thumbnails = [];

        this.actor = new St.BoxLayout({ style_class: 'scale-strip' });
        this.actor.set_position(this._monitor.x, this._monitor.y);
        this.actor.set_width(this._monitor.width);

        // Below the cover pane, which blocks input during the Scale open and close animations.
        const overviewGroup = Main.overview._group;
        overviewGroup.insert_child_below(this.actor, Main.overview._coverPane);

        this._buildThumbnails();
        this._insetBigView(this._getHeight());

        const display = global.display;
        this._signals.connect(display, 'restacked', this._queueRefresh, this);
        this._signals.connect(display, 'window-entered-monitor', this._queueRefresh, this);
        this._signals.connect(display, 'window-left-monitor', this._queueRefresh, this);
        this._signals.connect(global.window_manager, 'switch-workspace', this._syncActive, this);
        this._signals.connect(global.workspace_manager, 'notify::n-workspaces', this._onWorkspacesChanged, this);
    }

    _getHeight() {
        const [, naturalHeight] = this.actor.get_preferred_height(-1);
        return Math.round(naturalHeight);
    }

    _buildThumbnails() {
        this._workspaceSignals.disconnectAllSignals();
        this.actor.destroy_all_children();
        this._thumbnails = [];

        const workspaceManager = global.workspace_manager;
        for (let i = 0; i < workspaceManager.n_workspaces; i++) {
            const metaWorkspace = workspaceManager.get_workspace_by_index(i);
            const thumbnail = new WorkspaceThumbnail(metaWorkspace, this._monitor, this._monitorIndex);
            this._workspaceSignals.connect(metaWorkspace, 'window-added', this._queueRefresh, this);
            this._workspaceSignals.connect(metaWorkspace, 'window-removed', this._queueRefresh, this);
            this._thumbnails.push(thumbnail);
            this.actor.add_actor(thumbnail.actor);
        }
        this._syncActive();
    }

    _syncActive() {
        const active = global.workspace_manager.get_active_workspace();
        for (const thumbnail of this._thumbnails)
            thumbnail.setActive(thumbnail.metaWorkspace === active);
    }

    _onWorkspacesChanged() {
        this._buildThumbnails();
        this._insetBigView(this._getHeight());
    }

    // Several window signals fire for one change: refresh once, when idle.
    _queueRefresh() {
        if (this._refreshIdleId)
            return;

        this._refreshIdleId = Mainloop.idle_add(() => {
            this._refreshIdleId = 0;
            for (const thumbnail of this._thumbnails)
                thumbnail.refreshWindows();
            return false;
        });
    }

    // Scale lays windows out in the geometry of each workspace's per-monitor object,
    // and centers its "no windows" placeholder on that object's monitor rectangle.
    // WorkspacesView.updateWindowPositions() is broken in Cinnamon 6.4, hence @reposition.
    _insetBigView(topInset, reposition = false) {
        const view = Main.overview.workspacesView;
        if (!view)
            return;

        const area = {
            x: this._monitor.x,
            y: this._monitor.y + topInset,
            width: this._monitor.width,
            height: this._monitor.height - topInset,
        };
        for (const workspace of view._workspaces) {
            const workspaceMonitor = workspace._monitors[this._monitorIndex];
            if (!workspaceMonitor)
                continue;
            workspaceMonitor.setGeometry(area.x, area.y, area.width, area.height, workspaceMonitor._margin);
            workspaceMonitor._monitor = topInset > 0 ? area : this._monitor;
            if (reposition) {
                workspaceMonitor.positionWindows(0);
                workspaceMonitor._updateEmptyPlaceholder();
            }
        }
    }

    // For a strip created while Scale is already open: Scale has laid its windows out full height.
    repositionBigView() {
        this._insetBigView(this._getHeight(), true);
    }

    destroy() {
        this._signals.disconnectAllSignals();
        this._workspaceSignals.disconnectAllSignals();
        if (this._refreshIdleId) {
            Mainloop.source_remove(this._refreshIdleId);
            this._refreshIdleId = 0;
        }

        this._thumbnails = [];
        this.actor.destroy();

        // Scale destroys its view when it closes; this only matters when the strip goes first.
        this._insetBigView(0, !Main.overview._hideInProgress);
    }
};
