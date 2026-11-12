const Clutter = imports.gi.Clutter;
const Meta = imports.gi.Meta;
const Main = imports.ui.main;
const WorkspacesView = imports.ui.workspacesView;
const WorkspaceStrip = require('./workspaceStrip');
const WindowDrag = require('./windowDrag');
const MonitorDrop = require('./monitorDrop');
const WindowClick = require('./windowClick');
const SuperKey = require('./superKey');
const AppSearch = require('./appSearch');
const UiHelpers = require('./uiHelpers');

// One switch per slide animation, so a touchpad flick does not skip workspaces.
const COOLDOWN_MS = WorkspacesView.WORKSPACE_SWITCH_TIME * 1000;
// Smooth-scroll delta that counts as one wheel notch.
const SMOOTH_STEP = 1.0;

let scrollId = 0;
let overviewSignalIds = [];
let strip = null;
let search = null;
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
    if (!UiHelpers.isScaleTheOnlyModal() || Main.overview.animationInProgress)
        return Clutter.EVENT_PROPAGATE;

    const direction = directionFromEvent(event);
    if (direction === null || Date.now() - lastSwitchTime < COOLDOWN_MS)
        return Clutter.EVENT_STOP;

    switchWorkspace(direction);
    return Clutter.EVENT_STOP;
}

// Top of the primary monitor, in order: search field, workspace strip, then Scale's windows.
function showHeader() {
    if (search || strip)
        return;

    try {
        search = new AppSearch.AppSearch();
        strip = new WorkspaceStrip.WorkspaceStrip(search.getHeight());
        search.setResultsArea(strip.getBigViewArea());
    } catch (e) {
        hideHeader();
        throw e;
    }
}

// Each part is torn down on its own: one may exist without the other after a failure.
function hideHeader() {
    if (search) {
        search.destroy();
        search = null;
    }
    if (strip) {
        strip.destroy();
        strip = null;
    }
}

function init(metadata) {}

// Cinnamon never calls disable() after a failed enable(): undo here, or the handlers
// and prototype patches would stay until Cinnamon restarts.
function enable() {
    try {
        enableAll();
    } catch (e) {
        disable();
        throw e;
    }
}

function enableAll() {
    // Captured on the stage: scroll events never bubble to the overview actors.
    scrollId = global.stage.connect('captured-event', onCapturedEvent);

    // Connected before Scale's own 'showing' handler, which lays the windows out:
    // the strip has already shrunk the big view when that runs.
    overviewSignalIds = [
        Main.overview.connect('showing', showHeader),
        Main.overview.connect('hidden', hideHeader),
    ];
    WindowDrag.enable();
    MonitorDrop.enable();
    WindowClick.enable();
    SuperKey.enable();
    AppSearch.enable();
    if (Main.overview.visible && !Main.overview._hideInProgress) {
        showHeader();
        strip.repositionBigView();
    }
}

function disable() {
    if (scrollId) {
        global.stage.disconnect(scrollId);
        scrollId = 0;
    }
    for (const id of overviewSignalIds)
        Main.overview.disconnect(id);
    overviewSignalIds = [];
    hideHeader();
    AppSearch.disable();
    MonitorDrop.disable();
    WindowDrag.disable();
    WindowClick.disable();
    SuperKey.disable();
    smoothAccumulator = 0;
}
