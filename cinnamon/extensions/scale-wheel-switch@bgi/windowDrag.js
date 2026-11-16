const Clutter = imports.gi.Clutter;
const DND = imports.ui.dnd;
const Main = imports.ui.main;
const Workspace = imports.ui.workspace;
const UiHelpers = require('./uiHelpers');
const WorkspaceStrip = require('./workspaceStrip');

// Longest side of the window picture that follows the pointer, as a fraction of a strip
// thumbnail's height: the highlighted drop target stays visible around it.
const DRAG_ACTOR_THUMBNAIL_FRACTION = 0.9;
const DRAG_ACTOR_OPACITY = Math.round(UiHelpers.OPAQUE * 0.8);
// The window left in the big view while its picture is being dragged.
const DRAG_SOURCE_OPACITY = Math.round(UiHelpers.OPAQUE * 0.4);

let originalAddWindowClone = null;
// windowClone -> its signal ids, for the clones of the Scale view currently open.
let draggableClones = new Map();

// A separate picture is dragged, so Scale's own clone stays in its layout.
// It is shrunk here, around the pointer: dnd's dragActorMaxSize measures the picture before
// it has an allocation and gets a wrong size.
function createDragActor(windowClone) {
    const [width, height] = windowClone.actor.get_transformed_size();
    const [x, y] = windowClone.actor.get_transformed_position();
    const [pointerX, pointerY] = global.get_pointer();
    const maxSize = WorkspaceStrip.getThumbnailHeight() * DRAG_ACTOR_THUMBNAIL_FRACTION;
    const scale = Math.min(1, maxSize / Math.max(width, height));

    const dragActor = new Clutter.Clone({ source: windowClone.actor, x, y, width, height });
    dragActor.set_pivot_point(clampUnit((pointerX - x) / width), clampUnit((pointerY - y) / height));
    dragActor.set_scale(scale, scale);
    return dragActor;
}

function clampUnit(value) {
    return Math.min(1, Math.max(0, value));
}

function makeDraggable(windowClone) {
    if (draggableClones.has(windowClone))
        return;

    windowClone.getDragActor = () => createDragActor(windowClone);
    windowClone.getDragActorSource = () => windowClone.actor;
    const draggable = DND.makeDraggable(windowClone.actor, { dragActorOpacity: DRAG_ACTOR_OPACITY });
    windowClone._draggable = draggable;

    draggable.connect('drag-begin', () => {
        windowClone.actor.opacity = DRAG_SOURCE_OPACITY;
    });
    draggable.connect('drag-end', () => {
        if (!windowClone.actor.is_finalized())
            windowClone.actor.opacity = UiHelpers.OPAQUE;
    });
    const destroyId = windowClone.actor.connect('destroy', () => draggableClones.delete(windowClone));
    draggableClones.set(windowClone, destroyId);
}

function removeDraggable(windowClone, destroyId) {
    const draggable = windowClone._draggable;
    windowClone.actor.disconnect(destroyId);
    windowClone.actor.disconnect(draggable.buttonPressEventId);
    windowClone.actor.disconnect(draggable.destroyEventId);
    draggable.disconnectAll();
    delete windowClone._draggable;
    delete windowClone.getDragActor;
    delete windowClone.getDragActorSource;
}

function forEachOpenClone(callback) {
    const view = Main.overview.workspacesView;
    if (!view)
        return;

    for (const workspace of view._workspaces) {
        for (const workspaceMonitor of workspace._monitors)
            workspaceMonitor._windows.forEach(callback);
    }
}

// Scale builds its window clones in WorkspaceMonitor._addWindowClone: wrap it, undo in disable().
function enable() {
    // Already patched: saving the wrapper as the original would make it permanent.
    if (originalAddWindowClone)
        return;

    const prototype = Workspace.WorkspaceMonitor.prototype;
    originalAddWindowClone = prototype._addWindowClone;
    prototype._addWindowClone = function(win) {
        const windowClone = originalAddWindowClone.call(this, win);
        makeDraggable(windowClone);
        return windowClone;
    };
    forEachOpenClone(makeDraggable);
}

function disable() {
    if (originalAddWindowClone) {
        Workspace.WorkspaceMonitor.prototype._addWindowClone = originalAddWindowClone;
        originalAddWindowClone = null;
    }
    draggableClones.forEach((destroyId, windowClone) => removeDraggable(windowClone, destroyId));
    draggableClones.clear();
}
