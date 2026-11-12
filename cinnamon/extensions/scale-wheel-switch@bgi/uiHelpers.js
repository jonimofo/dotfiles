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

// A new window of @app on the current workspace, then Scale closes.
function openNewWindow(app) {
    app.open_new_window(-1);
    Main.overview.hide();
}

// A drop target's look while a drag hovers it: @onEnter and @onLeave run once each per hover.
// dnd only reports a drag leaving when the pointer moves out: a drag cancelled with Escape
// over the target is caught through the draggable's 'drag-end'.
var DragHover = class DragHover {
    constructor(onEnter, onLeave) {
        this._onEnter = onEnter;
        this._onLeave = onLeave;
        this._draggable = null;
        this._dragEndId = 0;
    }

    enter(draggable) {
        if (this._draggable)
            return;

        this._draggable = draggable;
        this._dragEndId = draggable.connect('drag-end', () => this.leave());
        this._onEnter();
    }

    leave() {
        if (!this._draggable)
            return;

        this._draggable.disconnect(this._dragEndId);
        this._draggable = null;
        this._dragEndId = 0;
        this._onLeave();
    }
};
