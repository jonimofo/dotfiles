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

    const dragActor = UiHelpers.createDragClone(windowClone.actor);
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
    windowClone._draggable = UiHelpers.makeDraggable(windowClone.actor, DRAG_ACTOR_OPACITY, DRAG_SOURCE_OPACITY);
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

// Scale's own clone comes first and is always returned: a failure to make it draggable is
// logged, and Scale goes on with a window that cannot be dragged.
function wrapAddWindowClone(original) {
    return function(win) {
        const windowClone = original.call(this, win);
        try {
            makeDraggable(windowClone);
        } catch (e) {
            UiHelpers.logFailure('window drag: making a window draggable', e);
        }
        return windowClone;
    };
}

// Scale builds its window clones in WorkspaceMonitor._addWindowClone: wrap it, undo in disable().
function enable() {
    // Already patched: saving the wrapper as the original would make it permanent.
    if (originalAddWindowClone)
        return;

    originalAddWindowClone = UiHelpers.patchMethod(Workspace.WorkspaceMonitor.prototype,
        '_addWindowClone', wrapAddWindowClone, 'window drag');
    if (originalAddWindowClone)
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
