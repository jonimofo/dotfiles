// Hot corners that keep working over fullscreen windows, with Scale open or not.
// Cinnamon hides chrome over a fullscreen window with Main.uiGroup.set_skip_paint, from two
// paths of layout.js _updateVisibility: the normal one, and the modal one used while Scale
// is open, which ignores visibleInFullscreen. A skipped actor is neither painted nor picked,
// so the corner gets no hover and Scale cannot be closed from it. The override refuses to
// skip the current hot corners, looked up at call time, so the corners Cinnamon rebuilds on
// each setting or monitor change are covered too.
// This relies on Cinnamon internals: on failure it logs and keeps the stock behaviour, so
// the rest of the extension keeps running.
const Main = imports.ui.main;

let patchedGroup = null;
let lookupFailureLogged = false;

function logFailure(attempt, error) {
    global.logError(`[scale-wheel-switch] hot corners over fullscreen: ${attempt} failed: ${error}`);
}

function isHotCorner(actor) {
    const manager = Main.layoutManager.hotCornerManager;
    if (!manager)
        return false;

    return Object.values(manager.corners).some(corner => corner && corner.actor === actor);
}

function shouldSkip(child, skip) {
    if (!skip)
        return false;

    try {
        return !isHotCorner(child);
    } catch (e) {
        // Called on every visibility update: log once, then let Cinnamon hide as usual.
        if (!lookupFailureLogged) {
            lookupFailureLogged = true;
            logFailure('finding the hot corners (they keep the stock behaviour)', e);
        }
        return true;
    }
}

function refreshVisibility() {
    Main.layoutManager._chrome._updateVisibility();
}

function enable() {
    if (patchedGroup)
        return;

    const uiGroup = Main.uiGroup;
    const originalSetSkipPaint = uiGroup.set_skip_paint;
    // An own property shadows UiActor's method for every caller, signal handlers included.
    uiGroup.set_skip_paint = function (child, skip) {
        return originalSetSkipPaint.call(this, child, shouldSkip(child, skip));
    };
    patchedGroup = uiGroup;
    lookupFailureLogged = false;
    try {
        refreshVisibility();
    } catch (e) {
        delete uiGroup.set_skip_paint;
        patchedGroup = null;
        logFailure('enable (stock behaviour kept)', e);
    }
}

function disable() {
    if (!patchedGroup)
        return;

    delete patchedGroup.set_skip_paint;
    patchedGroup = null;
    try {
        refreshVisibility();
    } catch (e) {
        logFailure('disable', e);
    }
}
