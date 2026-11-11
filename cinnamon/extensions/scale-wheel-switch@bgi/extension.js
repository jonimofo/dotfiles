const Clutter = imports.gi.Clutter;
const Meta = imports.gi.Meta;
const Main = imports.ui.main;
const WorkspacesView = imports.ui.workspacesView;

// One switch per slide animation, so a touchpad flick does not skip workspaces.
const COOLDOWN_MS = WorkspacesView.WORKSPACE_SWITCH_TIME * 1000;
// Smooth-scroll delta that counts as one wheel notch.
const SMOOTH_STEP = 1.0;

let scrollId = 0;
let lastSwitchTime = 0;
let smoothAccumulator = 0;

function directionFromEvent(event) {
    switch (event.get_scroll_direction()) {
    case Clutter.ScrollDirection.UP:
    case Clutter.ScrollDirection.LEFT:
        return Meta.MotionDirection.LEFT;
    case Clutter.ScrollDirection.DOWN:
    case Clutter.ScrollDirection.RIGHT:
        return Meta.MotionDirection.RIGHT;
    case Clutter.ScrollDirection.SMOOTH:
        return directionFromSmooth(event);
    default:
        return null;
    }
}

function directionFromSmooth(event) {
    const [dx, dy] = event.get_scroll_delta();
    smoothAccumulator += Math.abs(dy) >= Math.abs(dx) ? dy : dx;
    if (Math.abs(smoothAccumulator) < SMOOTH_STEP)
        return null;

    const direction = smoothAccumulator < 0 ? Meta.MotionDirection.LEFT : Meta.MotionDirection.RIGHT;
    smoothAccumulator = 0;
    return direction;
}

function switchWorkspace(direction) {
    const active = global.workspace_manager.get_active_workspace();
    const neighbor = active.get_neighbor(direction);
    if (neighbor === active)
        return;

    lastSwitchTime = Date.now();
    neighbor.activate(global.get_current_time());
}

function onCapturedEvent(actor, event) {
    if (event.type() !== Clutter.EventType.SCROLL)
        return Clutter.EVENT_PROPAGATE;
    if (!Main.overview.visible || Main.overview.animationInProgress)
        return Clutter.EVENT_PROPAGATE;

    const direction = directionFromEvent(event);
    if (direction === null || Date.now() - lastSwitchTime < COOLDOWN_MS)
        return Clutter.EVENT_STOP;

    switchWorkspace(direction);
    return Clutter.EVENT_STOP;
}

function init(metadata) {}

// Captured on the stage: scroll events never bubble to the overview actors.
function enable() {
    scrollId = global.stage.connect('captured-event', onCapturedEvent);
}

function disable() {
    if (scrollId) {
        global.stage.disconnect(scrollId);
        scrollId = 0;
    }
    smoothAccumulator = 0;
}
