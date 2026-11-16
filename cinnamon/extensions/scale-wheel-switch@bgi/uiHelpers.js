const Clutter = imports.gi.Clutter;
const St = imports.gi.St;
const Main = imports.ui.main;
const Workspace = imports.ui.workspace;

const OPAQUE = 255;
const TRANSPARENT = 0;
const SELECTED_PSEUDO_CLASS = 'selected';
// Smallest width, in pixels, an item shrunk to fit a row keeps.
const MIN_FITTING_ITEM_WIDTH = 1;
// Clutter numbers mouse buttons from 1.
const NO_BUTTON = 0;

// A click that reaches Scale's background starts its swipe, and closes Scale when the
// workspace is empty: the extension's own surfaces keep their clicks.
function swallowClicks(actor) {
    actor.connect('button-press-event', () => Clutter.EVENT_STOP);
    actor.connect('button-release-event', () => Clutter.EVENT_STOP);
}

// A click on @actor: press and release of one of @buttons, both on @actor. @onClick gets
// the button. Every click on @actor is swallowed, as with swallowClicks.
function connectClick(actor, buttons, onClick) {
    let pressedButton = NO_BUTTON;
    actor.connect('button-press-event', (source, event) => {
        const button = event.get_button();
        pressedButton = buttons.includes(button) ? button : NO_BUTTON;
        return Clutter.EVENT_STOP;
    });
    actor.connect('button-release-event', (source, event) => {
        const isClick = event.get_button() === pressedButton;
        pressedButton = NO_BUTTON;
        if (isClick)
            onClick(event.get_button());
        return Clutter.EVENT_STOP;
    });
    actor.connect('leave-event', () => {
        pressedButton = NO_BUTTON;
        return Clutter.EVENT_PROPAGATE;
    });
}

// A constructor that puts @object's actors on screen calls this for that part: when it
// fails, @object is destroyed, so nothing stays on screen, and the error goes on.
function destroyOnFailure(object, build) {
    try {
        build();
    } catch (e) {
        object.destroy();
        throw e;
    }
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

// A row of @count items that shrink, whose @naturalWidth has each item at @itemWidth:
// the width each item can have so the row fits in @availableWidth, or null when it fits
// already. Only the items shrink, what the stylesheet adds around them does not.
function getFittingItemWidth(naturalWidth, availableWidth, count, itemWidth) {
    if (count === 0 || naturalWidth <= availableWidth)
        return null;

    const fixedWidth = naturalWidth - count * itemWidth;
    return Math.max(MIN_FITTING_ITEM_WIDTH, Math.floor((availableWidth - fixedWidth) / count));
}

// An icon size read from the stylesheet, for create_icon_texture. St gives lengths already
// multiplied by the display scale, and icons multiply their size by it again.
function getIconSize(widget, property) {
    const scaleFactor = St.ThemeContext.get_for_stage(global.stage).scale_factor;
    return Math.round(widget.get_theme_node().get_length(property) / scaleFactor);
}

// Only Scale's window clones made draggable by windowDrag.js: drop targets and drag
// monitors see every drag.
function isScaleWindow(source) {
    return source instanceof Workspace.WindowClone && Boolean(source._draggable);
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

// The drop highlights currently shown.
const shownDragHovers = new Set();

// A drop target's look while a drag hovers it: @onEnter and @onLeave run once each per hover.
// dnd only reports a drag leaving when the pointer moves out: a drag cancelled with Escape
// over the target is caught through the draggable's 'drag-end'.
var DragHover = class DragHover {
    // @actor is the drop target's actor.
    constructor(actor, onEnter, onLeave) {
        this.actor = actor;
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
        shownDragHovers.add(this);
        this._onEnter();
    }

    leave() {
        if (!this._draggable)
            return;

        // A draggable whose actor is destroyed has already dropped its handlers.
        if (this._draggable.signalHandlerIsConnected(this._dragEndId))
            this._draggable.disconnect(this._dragEndId);
        shownDragHovers.delete(this);
        this._draggable = null;
        this._dragEndId = 0;
        this._onLeave();
    }
};

// For a drop on @targetActor, before any target takes it: the window that moves can be
// destroyed with its draggable before 'drag-end', so the highlights of the other targets
// are cleared here.
function leaveDragHoversOutside(targetActor) {
    for (const hover of shownDragHovers) {
        if (!targetActor || !hover.actor.contains(targetActor))
            hover.leave();
    }
}
