// Hot corners that keep working over fullscreen windows.
// Cinnamon adds each hot corner as chrome without visibleInFullscreen, so a fullscreen
// window hides it on its monitor (layout.js _updateVisibility). HotCornerManager destroys
// and recreates every corner on each hot corner setting or monitor change: the patched
// update() sets the flag again on the new corners.
// This relies on Cinnamon internals: on failure it logs and keeps the stock behaviour, so
// the rest of the extension keeps running.
const Main = imports.ui.main;
const HotCorner = imports.ui.hotCorner;

let originalUpdate = null;

function setCornersVisibleInFullscreen(manager, visible) {
    if (!manager)
        return;

    const chrome = Main.layoutManager._chrome;
    for (const corner of Object.values(manager.corners)) {
        if (corner)
            chrome.modifyActorParams(corner.actor, { visibleInFullscreen: visible });
    }
    // modifyActorParams only queues the input region update: visibility is recomputed here.
    chrome._updateVisibility();
}

function logFailure(attempt, error) {
    global.logError(`[scale-wheel-switch] hot corners over fullscreen: ${attempt} failed: ${error}`);
}

function enable() {
    if (originalUpdate)
        return;

    originalUpdate = HotCorner.HotCornerManager.prototype.update;
    HotCorner.HotCornerManager.prototype.update = function (...args) {
        const result = originalUpdate.apply(this, args);
        try {
            setCornersVisibleInFullscreen(this, true);
        } catch (e) {
            logFailure('flagging the rebuilt corners (they keep the stock behaviour)', e);
        }
        return result;
    };
    try {
        setCornersVisibleInFullscreen(Main.layoutManager.hotCornerManager, true);
    } catch (e) {
        HotCorner.HotCornerManager.prototype.update = originalUpdate;
        originalUpdate = null;
        logFailure('enable (stock behaviour kept)', e);
    }
}

function disable() {
    if (!originalUpdate)
        return;

    HotCorner.HotCornerManager.prototype.update = originalUpdate;
    originalUpdate = null;
    try {
        setCornersVisibleInFullscreen(Main.layoutManager.hotCornerManager, false);
    } catch (e) {
        logFailure('disable', e);
    }
}
