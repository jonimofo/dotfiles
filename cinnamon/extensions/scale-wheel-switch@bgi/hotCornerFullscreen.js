// Hot corners that keep working over fullscreen windows.
// Cinnamon adds each hot corner as chrome without visibleInFullscreen, so a fullscreen
// window hides it on its monitor (layout.js _updateVisibility). HotCornerManager destroys
// and recreates every corner on each hot corner setting or monitor change: the patched
// update() sets the flag again on the new corners.
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

function enable() {
    if (originalUpdate)
        return;

    originalUpdate = HotCorner.HotCornerManager.prototype.update;
    HotCorner.HotCornerManager.prototype.update = function (...args) {
        const result = originalUpdate.apply(this, args);
        setCornersVisibleInFullscreen(this, true);
        return result;
    };
    setCornersVisibleInFullscreen(Main.layoutManager.hotCornerManager, true);
}

function disable() {
    if (!originalUpdate)
        return;

    HotCorner.HotCornerManager.prototype.update = originalUpdate;
    originalUpdate = null;
    setCornersVisibleInFullscreen(Main.layoutManager.hotCornerManager, false);
}
