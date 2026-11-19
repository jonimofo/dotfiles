const Clutter = imports.gi.Clutter;
const Workspace = imports.ui.workspace;
const UiHelpers = require('./uiHelpers');

let originalOnButtonRelease = null;
const PRIMARY_BUTTON_EVENT = { get_button: () => Clutter.BUTTON_PRIMARY };

// The wrapper keeps its own reference to @original: the clones of a Scale view still open
// when the extension is disabled have it bound, and keep calling it. The button decides
// before Scale's handler runs; when reading it fails, the failure is logged and Scale's
// handler gets the click unchanged.
function wrapOnButtonRelease(original) {
    return function(actor, event) {
        let releaseEvent = event;
        try {
            const button = event.get_button();
            // Stock Scale closes the application on a middle click.
            if (button === Clutter.BUTTON_MIDDLE)
                return Clutter.EVENT_STOP;
            // Stock Scale opens the window menu on a right click: open the window instead.
            // The stock handler only reads get_button(), so a primary-button stand-in is enough.
            if (button === Clutter.BUTTON_SECONDARY)
                releaseEvent = PRIMARY_BUTTON_EVENT;
        } catch (e) {
            UiHelpers.logFailure('window click: reading the button', e);
        }
        return original.call(this, actor, releaseEvent);
    };
}

// Each WindowClone binds _onButtonRelease when Scale builds it, so the patch applies
// from the next time Scale opens.
function enable() {
    // Already patched: saving the wrapper as the original would make it permanent.
    if (originalOnButtonRelease)
        return;

    originalOnButtonRelease = UiHelpers.patchMethod(Workspace.WindowClone.prototype,
        '_onButtonRelease', wrapOnButtonRelease, 'window click');
}

function disable() {
    if (!originalOnButtonRelease)
        return;

    Workspace.WindowClone.prototype._onButtonRelease = originalOnButtonRelease;
    originalOnButtonRelease = null;
}
