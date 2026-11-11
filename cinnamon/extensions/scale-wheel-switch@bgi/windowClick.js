const Clutter = imports.gi.Clutter;
const Workspace = imports.ui.workspace;

let originalOnButtonRelease = null;

// Each WindowClone binds _onButtonRelease when Scale builds it, so the patch applies
// from the next time Scale opens.
function enable() {
    // Already patched: saving the wrapper as the original would make it permanent.
    if (originalOnButtonRelease)
        return;

    const prototype = Workspace.WindowClone.prototype;
    originalOnButtonRelease = prototype._onButtonRelease;
    prototype._onButtonRelease = function(actor, event) {
        // Stock Scale closes the application on a middle click.
        if (event.get_button() === Clutter.BUTTON_MIDDLE)
            return Clutter.EVENT_STOP;

        return originalOnButtonRelease.call(this, actor, event);
    };
}

function disable() {
    if (!originalOnButtonRelease)
        return;

    Workspace.WindowClone.prototype._onButtonRelease = originalOnButtonRelease;
    originalOnButtonRelease = null;
}
