const Clutter = imports.gi.Clutter;
const Mainloop = imports.mainloop;
const Meta = imports.gi.Meta;
const St = imports.gi.St;
const DND = imports.ui.dnd;
const Main = imports.ui.main;
const SignalManager = imports.misc.signalManager;
const WindowUtils = imports.misc.windowUtils;
const UiHelpers = require('./uiHelpers');

// Thumbnail size as a fraction of the primary monitor, reduced when the workspaces do not
// fit in the monitor's width. Colors and spacing are in stylesheet.css.
const THUMBNAIL_SCALE = 0.12;
const DROP_TARGET_STYLE_CLASS = 'scale-strip-thumbnail-drop-target';
// Stylesheet property of a thumbnail: free space kept around each window of its grid.
const WINDOW_GAP_PROPERTY = '-scale-window-gap';
// Flags value of WorkspaceMonitor.positionWindows (its flag names are private to workspace.js).
const POSITION_WITHOUT_ANIMATION = 0;

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

// The windows of Scale's big view for this workspace, in Scale's own order, so a thumbnail
// is a small copy of that view. Empty when Scale has no view (it is closing).
function getScaleWindowOrder(metaWorkspace, monitorIndex) {
    const view = Main.overview.workspacesView;
    const workspace = view && view._workspaces.find(candidate => candidate.metaWorkspace === metaWorkspace);
    const workspaceMonitor = workspace && workspace._monitors[monitorIndex];
    if (!workspaceMonitor)
        return [];

    return workspaceMonitor._windows.map(windowClone => windowClone.metaWindow);
}

// Same grid as Scale: as many columns as rows (rounded up), a short last row centered.
// Returns one [x, y, width, height] cell per window, inside a width x height area.
function computeGridCells(count, width, height) {
    const columns = Math.ceil(Math.sqrt(count));
    const rows = Math.ceil(count / columns);
    const cellWidth = width / columns;
    const cellHeight = height / rows;
    const lastRowCount = count - (rows - 1) * columns;
    const lastRowShift = (columns - lastRowCount) * cellWidth / 2;

    const cells = [];
    for (let i = 0; i < count; i++) {
        const row = Math.floor(i / columns);
        const shift = row === rows - 1 ? lastRowShift : 0;
        cells.push([(i % columns) * cellWidth + shift, row * cellHeight, cellWidth, cellHeight]);
    }
    return cells;
}

// The strip of the Scale view currently open, if any.
let activeStrip = null;

// Height of a strip thumbnail, for the modules that size things after it.
function getThumbnailHeight() {
    const scale = activeStrip ? activeStrip.thumbnailScale : THUMBNAIL_SCALE;
    return Math.round(Main.layoutManager.primaryMonitor.height * scale);
}

// One workspace: wallpaper, live window clones and the workspace name.
class WorkspaceThumbnail {
    constructor(metaWorkspace, monitor, monitorIndex, scale) {
        this.metaWorkspace = metaWorkspace;
        this._monitor = monitor;
        this._monitorIndex = monitorIndex;
        this._scale = scale;

        const width = Math.round(monitor.width * scale);
        const height = Math.round(monitor.height * scale);

        this._desktop = new Clutter.Actor({ width, height, clip_to_allocation: true });
        this._addWallpaper();
        this._windows = new Clutter.Actor();
        this._desktop.add_actor(this._windows);

        this._label = new St.Label({
            style_class: 'scale-strip-label',
            text: Main.getWorkspaceName(metaWorkspace.index()),
            x_expand: true,
            y_expand: true,
            x_align: Clutter.ActorAlign.END,
            y_align: Clutter.ActorAlign.END,
        });

        const content = new St.Widget({ layout_manager: new Clutter.BinLayout(), width, height });
        content.add_actor(this._desktop);
        content.add_actor(this._label);

        this.actor = new St.Bin({ style_class: 'scale-strip-thumbnail', child: content, reactive: true });
        this.actor._delegate = this;
        this._dropHover = new UiHelpers.DragHover(
            () => this.actor.add_style_class_name(DROP_TARGET_STYLE_CLASS),
            () => this.actor.remove_style_class_name(DROP_TARGET_STYLE_CLASS));
        this.actor.connect('destroy', () => this._dropHover.leave());
        this._pressed = false;
        this.actor.connect('button-press-event', this._onButtonPress.bind(this));
        this.actor.connect('button-release-event', this._onButtonRelease.bind(this));
        this.actor.connect('leave-event', () => { this._pressed = false; });
    }

    // Stopped here on purpose: a press that reaches Scale's background starts its swipe,
    // and a click there closes Scale when the workspace is empty.
    _onButtonPress(actor, event) {
        this._pressed = event.get_button() === Clutter.BUTTON_PRIMARY;
        return Clutter.EVENT_STOP;
    }

    _onButtonRelease(actor, event) {
        const isClick = this._pressed && event.get_button() === Clutter.BUTTON_PRIMARY;
        this._pressed = false;
        if (isClick)
            this._activateWorkspace();
        return Clutter.EVENT_STOP;
    }

    _activateWorkspace() {
        if (this.metaWorkspace === global.workspace_manager.get_active_workspace())
            return;

        this.metaWorkspace.activate(global.get_current_time());
    }

    _addWallpaper() {
        if (Meta.is_wayland_compositor())
            return;

        // The background actor spans the whole screen: shift it so the monitor's corner is at 0,0.
        const wallpaper = Meta.X11BackgroundActor.new_for_display(global.display);
        wallpaper.set_scale(this._scale, this._scale);
        wallpaper.set_position(-this._monitor.x * this._scale, -this._monitor.y * this._scale);
        this._desktop.add_actor(wallpaper);
    }

    // Call once the thumbnail is on the stage: the label and the stylesheet gap have no
    // value before that.
    refreshWindows() {
        this._windows.destroy_all_children();

        const windowActors = this._getWindowActors();
        const [width, height] = this._desktop.get_size();
        // The band behind the label stays free, so the name never covers a window.
        const labelHeight = UiHelpers.getNaturalHeight(this._label);
        const gap = this.actor.get_theme_node().get_length(WINDOW_GAP_PROPERTY);
        const cells = computeGridCells(windowActors.length, width, height - labelHeight);
        windowActors.forEach((windowActor, i) => this._addWindowClone(windowActor, cells[i], gap));
    }

    _getWindowActors() {
        const workspaceIndex = this.metaWorkspace.index();
        const windowActors = global.get_window_actors().filter(
            windowActor => isThumbnailWindow(windowActor, workspaceIndex, this._monitorIndex));

        // Windows Scale does not list yet (just opened) go last, in stacking order.
        const scaleOrder = getScaleWindowOrder(this.metaWorkspace, this._monitorIndex);
        const rank = windowActor => {
            const index = scaleOrder.indexOf(windowActor.get_meta_window());
            return index === -1 ? scaleOrder.length : index;
        };
        return windowActors.sort((a, b) => rank(a) - rank(b));
    }

    // Fits the window frame in its cell, keeping its aspect ratio. The actor is larger
    // than the frame (shadows), so its clone is offset inside a frame-sized holder.
    _addWindowClone(windowActor, [cellX, cellY, cellWidth, cellHeight], gap) {
        const clone = WindowUtils.getCloneOrContent(windowActor);
        if (!clone)
            return;

        const frame = windowActor.get_meta_window().get_frame_rect();
        const scale = Math.min((cellWidth - gap) / frame.width, (cellHeight - gap) / frame.height, 1);
        const [actorX, actorY] = windowActor.get_position();
        const [actorWidth, actorHeight] = windowActor.get_size();
        clone.set_position((actorX - frame.x) * scale, (actorY - frame.y) * scale);
        clone.set_size(actorWidth * scale, actorHeight * scale);

        const holder = new Clutter.Actor({
            x: Math.round(cellX + (cellWidth - frame.width * scale) / 2),
            y: Math.round(cellY + (cellHeight - frame.height * scale) / 2),
            width: frame.width * scale,
            height: frame.height * scale,
        });
        holder.add_actor(clone);
        this._windows.add_actor(holder);
    }

    // Drop target interface of imports.ui.dnd, called while a Scale window is dragged over.
    handleDragOver(source) {
        if (!this._canDrop(source))
            return DND.DragMotionResult.CONTINUE;

        this._dropHover.enter(source._draggable);
        return DND.DragMotionResult.MOVE_DROP;
    }

    handleDragOut() {
        this._dropHover.leave();
    }

    acceptDrop(source) {
        if (!this._canDrop(source))
            return false;

        this._dropHover.leave();
        source.metaWindow.change_workspace(this.metaWorkspace);
        return true;
    }

    // A sticky window is on every workspace already; a window on this workspace has nowhere to go.
    _canDrop(source) {
        const metaWindow = source && source.metaWindow;
        if (!metaWindow || metaWindow.is_on_all_workspaces())
            return false;

        return metaWindow.get_workspace() !== this.metaWorkspace;
    }

    setActive(isActive) {
        if (isActive)
            this.actor.add_style_pseudo_class(UiHelpers.SELECTED_PSEUDO_CLASS);
        else
            this.actor.remove_style_pseudo_class(UiHelpers.SELECTED_PSEUDO_CLASS);
    }
}

// Strip of workspace thumbnails, shown on the primary monitor while Scale is open, @topOffset
// pixels below the top of the monitor. The big Scale view is pushed below it for as long
// as the strip exists.
var WorkspaceStrip = class WorkspaceStrip {
    constructor(topOffset = 0) {
        this._topOffset = topOffset;
        this._monitorIndex = Main.layoutManager.primaryIndex;
        this._monitor = Main.layoutManager.primaryMonitor;
        this._signals = new SignalManager.SignalManager(null);
        this._workspaceSignals = new SignalManager.SignalManager(null);
        this._refreshIdleId = 0;
        this._thumbnails = [];
        this.thumbnailScale = THUMBNAIL_SCALE;

        // Full-width band with the thumbnails centered in it, like the search field above.
        // Reactive, so a click in the gaps around the thumbnails is swallowed too.
        this._row = new St.BoxLayout({ style_class: 'scale-strip-row' });
        this.actor = new St.Bin({ style_class: 'scale-strip', child: this._row, reactive: true });
        UiHelpers.swallowClicks(this.actor);
        this.actor.set_position(this._monitor.x, this._monitor.y + topOffset);
        this.actor.set_width(this._monitor.width);

        // Below the cover pane, which blocks input during the Scale open and close animations.
        const overviewGroup = Main.overview._group;
        overviewGroup.insert_child_below(this.actor, Main.overview._coverPane);

        this._buildThumbnails();
        this._insetBigView(this._getInset());
        activeStrip = this;

        const display = global.display;
        this._signals.connect(display, 'restacked', this._queueRefresh, this);
        this._signals.connect(display, 'window-entered-monitor', this._queueRefresh, this);
        this._signals.connect(display, 'window-left-monitor', this._queueRefresh, this);
        this._signals.connect(global.window_manager, 'switch-workspace', this._syncActive, this);
        this._signals.connect(global.workspace_manager, 'notify::n-workspaces', this._onWorkspacesChanged, this);
    }

    // Height taken at the top of the monitor, down to the bottom edge of the strip.
    _getInset() {
        return this._topOffset + UiHelpers.getNaturalHeight(this.actor);
    }

    // What is left of the monitor for Scale's big view.
    getBigViewArea() {
        return this._getAreaBelow(this._getInset());
    }

    _getAreaBelow(topInset) {
        return {
            x: this._monitor.x,
            y: this._monitor.y + topInset,
            width: this._monitor.width,
            height: this._monitor.height - topInset,
        };
    }

    // Built at the default size first; when that is wider than the monitor (many
    // workspaces), built again at the size that fits.
    _buildThumbnails() {
        this.thumbnailScale = THUMBNAIL_SCALE;
        this._buildThumbnailsAtScale();

        const fittingScale = this._getFittingScale();
        if (fittingScale < this.thumbnailScale) {
            this.thumbnailScale = fittingScale;
            this._buildThumbnailsAtScale();
        }
    }

    // The strip's natural width is its thumbnails plus what the stylesheet adds (padding,
    // spacing, borders): only the thumbnails can shrink.
    _getFittingScale() {
        const count = this._thumbnails.length;
        const naturalWidth = UiHelpers.getNaturalWidth(this.actor);
        if (count === 0 || naturalWidth <= this._monitor.width)
            return this.thumbnailScale;

        const thumbnailsWidth = count * Math.round(this._monitor.width * this.thumbnailScale);
        const fixedWidth = naturalWidth - thumbnailsWidth;
        return Math.floor((this._monitor.width - fixedWidth) / count) / this._monitor.width;
    }

    _buildThumbnailsAtScale() {
        this._workspaceSignals.disconnectAllSignals();
        this._row.destroy_all_children();
        this._thumbnails = [];

        const workspaceManager = global.workspace_manager;
        for (let i = 0; i < workspaceManager.n_workspaces; i++) {
            const metaWorkspace = workspaceManager.get_workspace_by_index(i);
            const thumbnail = new WorkspaceThumbnail(
                metaWorkspace, this._monitor, this._monitorIndex, this.thumbnailScale);
            this._workspaceSignals.connect(metaWorkspace, 'window-added', this._queueRefresh, this);
            this._workspaceSignals.connect(metaWorkspace, 'window-removed', this._queueRefresh, this);
            this._thumbnails.push(thumbnail);
            this._row.add_actor(thumbnail.actor);
            thumbnail.refreshWindows();
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
        this._insetBigView(this._getInset());
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

        const area = this._getAreaBelow(topInset);
        for (const workspace of view._workspaces) {
            const workspaceMonitor = workspace._monitors[this._monitorIndex];
            if (!workspaceMonitor)
                continue;
            workspaceMonitor.setGeometry(area.x, area.y, area.width, area.height, workspaceMonitor._margin);
            workspaceMonitor._monitor = topInset > 0 ? area : this._monitor;
            if (reposition) {
                workspaceMonitor.positionWindows(POSITION_WITHOUT_ANIMATION);
                workspaceMonitor._updateEmptyPlaceholder();
            }
        }
    }

    // For a strip created while Scale is already open: Scale has laid its windows out full height.
    repositionBigView() {
        this._insetBigView(this._getInset(), true);
    }

    destroy() {
        if (activeStrip === this)
            activeStrip = null;
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
