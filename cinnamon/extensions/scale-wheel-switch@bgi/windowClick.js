const Clutter = imports.gi.Clutter;
const Workspace = imports.ui.workspace;

let originalOnButtonRelease = null;
const PRIMARY_BUTTON_EVENT = { get_button: () => Clutter.BUTTON_PRIMARY };

// The wrapper keeps its own reference to @original: the clones of a Scale view still open
// when the extension is disabled have it bound, and keep calling it.
function wrapOnButtonRelease(original) {
    return function(actor, event) {
        const button = event.get_button();
        // Stock Scale closes the application on a middle click.
        if (button === Clutter.BUTTON_MIDDLE)
            return Clutter.EVENT_STOP;
        // Stock Scale opens the window menu on a right click: open the window instead.
        // The stock handler only reads get_button(), so a primary-button stand-in is enough.
        if (button === Clutter.BUTTON_SECONDARY)
            return original.call(this, actor, PRIMARY_BUTTON_EVENT);

        return original.call(this, actor, event);
    };
}

// Each WindowClone binds _onButtonRelease when Scale builds it, so the patch applies
// from the next time Scale opens.
function enable() {
    // Already patched: saving the wrapper as the original would make it permanent.
    if (originalOnButtonRelease)
        return;

    const prototype = Workspace.WindowClone.prototype;
    originalOnButtonRelease = prototype._onButtonRelease;
    prototype._onButtonRelease = wrapOnButtonRelease(originalOnButtonRelease);
}

function disable() {
    if (!originalOnButtonRelease)
        return;

    Workspace.WindowClone.prototype._onButtonRelease = originalOnButtonRelease;
    originalOnButtonRelease = null;
}
