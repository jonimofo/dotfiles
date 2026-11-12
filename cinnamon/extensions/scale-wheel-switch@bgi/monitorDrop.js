const St = imports.gi.St;
const DND = imports.ui.dnd;
const Main = imports.ui.main;
const Workspace = imports.ui.workspace;
const UiHelpers = require('./uiHelpers');

const DROP_TARGET_STYLE_CLASS = 'scale-monitor-drop-target';

let dropTarget = null;

// Only Scale's window clones made draggable by windowDrag.js: a drag monitor sees every drag.
function isScaleWindow(source) {
    return source instanceof Workspace.WindowClone && Boolean(source._draggable);
}

// Scale lays a monitor's windows out in this rectangle: below the strip on the primary monitor.
function containsPoint(workspaceMonitor, x, y) {
    const { _x: left, _y: top, _width: width, _height: height } = workspaceMonitor;
    return x >= left && x < left + width && y >= top && y < top + height;
}

// The monitor of Scale's open view under the pointer that can take the window, or null.
function findDropMonitor(source, x, y) {
    const view = Main.overview.workspacesView;
    if (!view)
        return null;

    const workspaceMonitor = view.getActiveWorkspace()._monitors.find(
        candidate => containsPoint(candidate, x, y));
    if (!workspaceMonitor || !canDrop(source, workspaceMonitor))
        return null;

    return workspaceMonitor;
}

function canDrop(source, workspaceMonitor) {
    return isScaleWindow(source) && source.metaWindow.get_monitor() !== workspaceMonitor.monitorIndex;
}

// Scale's per-monitor objects take no drop, and dnd looks for a drop target among the
// parents of the actor under the pointer, never among its siblings: over a window clone,
// the monitor is out of reach. A drag monitor sees every motion instead and shows this
// border over the monitor's window area. Being on top, the border is then the actor under
// the pointer and takes the drop.
class MonitorDropTarget {
    constructor() {
        this._workspaceMonitor = null;
        this.actor = new St.Widget({ style_class: DROP_TARGET_STYLE_CLASS, visible: false });
        this.actor._delegate = this;
        this._hover = new UiHelpers.DragHover(() => this.actor.show(), () => this._onLeave());
        global.overlay_group.add_actor(this.actor);

        this._dragMonitor = { dragMotion: this._onDragMotion.bind(this) };
        DND.addDragMonitor(this._dragMonitor);
    }

    _onDragMotion(dragEvent) {
        const workspaceMonitor = findDropMonitor(dragEvent.source, dragEvent.x, dragEvent.y);
        if (workspaceMonitor !== this._workspaceMonitor)
            this._hover.leave();
        if (!workspaceMonitor)
            return DND.DragMotionResult.CONTINUE;

        this._enter(dragEvent.source, workspaceMonitor);
        return DND.DragMotionResult.MOVE_DROP;
    }

    _enter(source, workspaceMonitor) {
        if (this._workspaceMonitor === workspaceMonitor)
            return;

        this._workspaceMonitor = workspaceMonitor;
        const { _x: x, _y: y, _width: width, _height: height } = workspaceMonitor;
        this.actor.set_position(x, y);
        this.actor.set_size(width, height);
        // Scale adds its view to the same group each time it opens: stay above its windows.
        global.overlay_group.set_child_above_sibling(this.actor, null);
        this._hover.enter(source._draggable);
    }

    _onLeave() {
        this._workspaceMonitor = null;
        this.actor.hide();
    }

    // Drop target interface of imports.ui.dnd, reached only while the border is shown.
    acceptDrop(source) {
        const workspaceMonitor = this._workspaceMonitor;
        if (!workspaceMonitor || !canDrop(source, workspaceMonitor))
            return false;

        this._hover.leave();
        source.metaWindow.move_to_monitor(workspaceMonitor.monitorIndex);
        return true;
    }

    destroy() {
        DND.removeDragMonitor(this._dragMonitor);
        this._hover.leave();
        this.actor.destroy();
    }
}

function enable() {
    if (dropTarget)
        return;

    dropTarget = new MonitorDropTarget();
}

function disable() {
    if (!dropTarget)
        return;

    dropTarget.destroy();
    dropTarget = null;
}
