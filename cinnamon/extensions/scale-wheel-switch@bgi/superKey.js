const Main = imports.ui.main;
const UiHelpers = require('./uiHelpers');

const HOTKEY_NAME = 'scale-wheel-switch-toggle-scale';
// Cinnamon keybinding string: two bindings separated by '::'. A bare modifier fires when
// it is tapped alone, so Super+<key> shortcuts keep working (the Menu applet's default).
const HOTKEY_BINDINGS = 'Super_L::Super_R';
// Scale closes itself when Super is released: a second trigger from the same tap
// must not open it again.
const REOPEN_GUARD_MS = 300;

let hidingId = 0;
let lastHideTime = 0;

function toggleScale() {
    // Expo closes itself on Super (Main._stageEventHandler).
    if (Main.expo.visible)
        return;

    if (UiHelpers.isScaleTheOnlyModal()) {
        Main.overview.hide();
        return;
    }
    if (UiHelpers.isNothingModal() && Date.now() - lastHideTime >= REOPEN_GUARD_MS)
        Main.overview.show();
}

function enable() {
    if (hidingId)
        return;

    hidingId = Main.overview.connect('hiding', () => { lastHideTime = Date.now(); });
    // addHotKey keeps the old callback when the name and keys are already registered.
    Main.keybindingManager.removeHotKey(HOTKEY_NAME);
    const isBound = Main.keybindingManager.addHotKey(HOTKEY_NAME, HOTKEY_BINDINGS, toggleScale);
    if (!isBound)
        global.logError(`[scale-wheel-switch] Super is already bound elsewhere (Menu applet?): see cinnamon/README.md`);
}

function disable() {
    Main.keybindingManager.removeHotKey(HOTKEY_NAME);
    if (hidingId) {
        Main.overview.disconnect(hidingId);
        hidingId = 0;
    }
}
