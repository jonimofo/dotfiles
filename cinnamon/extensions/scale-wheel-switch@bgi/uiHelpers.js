const Clutter = imports.gi.Clutter;
const Main = imports.ui.main;

const OPAQUE = 255;
const TRANSPARENT = 0;
const SELECTED_PSEUDO_CLASS = 'selected';

// A click that reaches Scale's background starts its swipe, and closes Scale when the
// workspace is empty: the extension's own surfaces keep their clicks.
function swallowClicks(actor) {
    actor.connect('button-press-event', () => Clutter.EVENT_STOP);
    actor.connect('button-release-event', () => Clutter.EVENT_STOP);
}

// Only valid once the actor is on the stage: its theme gives the paddings and borders.
function getNaturalHeight(actor) {
    const [, naturalHeight] = actor.get_preferred_height(-1);
    return Math.round(naturalHeight);
}

function getNaturalWidth(actor) {
    const [, naturalWidth] = actor.get_preferred_width(-1);
    return Math.round(naturalWidth);
}

// Scale holds one modal grab while it is open. Anything more is a menu, a dialog or a
// window drag on top of it, which the wheel and Super must leave alone.
function isScaleTheOnlyModal() {
    return Main.overview.visible && Main.modalCount === 1;
}

function isNothingModal() {
    return !Main.overview.visible && Main.modalCount === 0;
}
