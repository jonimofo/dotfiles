const Cinnamon = imports.gi.Cinnamon;
const Clutter = imports.gi.Clutter;
const St = imports.gi.St;
const Main = imports.ui.main;
const PopupMenu = imports.ui.popupMenu;

const NEW_WINDOW_LABEL = "New window";
const CLOSE_LABEL = "Close";
const CLOSE_WINDOWS_LABEL = "Close %d windows";

// What a dock icon's menu entry does, read by appDock.js.
var DockMenuAction = {
    NEW_WINDOW: 'new-window',
    CLOSE_WINDOWS: 'close-windows',
};

// The entries of a dock icon's menu, top to bottom, for an app with @windowCount windows
// the menu can close: "New window" always, then "Close" for one, "Close N windows" for more.
function getDockMenuEntries(windowCount) {
    const entries = [{ action: DockMenuAction.NEW_WINDOW, label: _(NEW_WINDOW_LABEL) }];
    if (windowCount === 1)
        entries.push({ action: DockMenuAction.CLOSE_WINDOWS, label: _(CLOSE_LABEL) });
    else if (windowCount > 1)
        entries.push({ action: DockMenuAction.CLOSE_WINDOWS, label: _(CLOSE_WINDOWS_LABEL).replace('%d', String(windowCount)) });
    return entries;
}

// Top left corner of a @menuWidth x @menuHeight menu above @sourceBox (x1, y1, x2, y2 on the
// stage), centred on it and kept inside @area (x, y, width, height). Rounded: stage
// coordinates carry float noise.
function getMenuPosition(sourceBox, menuWidth, menuHeight, area) {
    const centeredX = (sourceBox.x1 + sourceBox.x2) / 2 - menuWidth / 2;
    const x = Math.max(area.x, Math.min(centeredX, area.x + area.width - menuWidth));
    const y = Math.max(area.y, sourceBox.y1 - menuHeight);
    return [Math.round(x), Math.round(y)];
}

// Cinnamon's themed popup menu, opened above its source inside @area. The stock placement
// for a menu attached below (St.Side.BOTTOM) puts it against the monitor's bottom edge,
// over the dock.
var DockIconMenu = class DockIconMenu extends PopupMenu.PopupMenu {
    _init(sourceActor, area) {
        this._area = area;
        super._init(sourceActor, St.Side.BOTTOM);
    }

    // Overrides PopupMenu._calculatePosition, which open() and every allocation change call.
    // sideFlipped tells the open and close animations that the menu is above its source.
    _calculatePosition() {
        const sourceBox = Cinnamon.util_get_transformed_allocation(this.sourceActor);
        const [, , naturalWidth, naturalHeight] = this.actor.get_preferred_size();
        this.sideFlipped = true;
        return getMenuPosition(sourceBox, naturalWidth, naturalHeight, this._area);
    }
};

function isKeyEvent(event) {
    const type = event.type();
    return type === Clutter.EventType.KEY_PRESS || type === Clutter.EventType.KEY_RELEASE;
}

// The dock's menu, one open at a time. Cinnamon's menu manager takes a modal grab on top of
// Scale's: a click outside the menu closes it and goes no further, Escape closes it, and
// the key focus goes back to Scale when it closes. The menu is destroyed each time it
// closes; an entry's action runs after that, with the grab released.
var DockMenu = class DockMenu {
    // @area: where the menu stays, the dock's monitor.
    constructor(area) {
        this._area = area;
        this._menu = null;
        this._pendingAction = null;
        this._escapeGuardId = 0;
        this._escapePressed = false;
    }

    isOpen() {
        return this._menu !== null;
    }

    // Opens the menu of @entries above @sourceActor; @onActivate gets the chosen entry's
    // action. A second call for the same source closes the menu instead.
    toggle(sourceActor, entries, onActivate) {
        const wasOpenOnSource = this._menu !== null && this._menu.sourceActor === sourceActor;
        this.close();
        if (!wasOpenOnSource)
            this._open(sourceActor, entries, onActivate);
    }

    _open(sourceActor, entries, onActivate) {
        const menu = new DockIconMenu(sourceActor, this._area);
        for (const { action, label } of entries) {
            const item = new PopupMenu.PopupMenuItem(label);
            // Connected before the menu's own handler, which closes and destroys the menu.
            item.connect('activate', () => {
                this._pendingAction = () => onActivate(action);
            });
            menu.addMenuItem(item);
        }
        Main.uiGroup.add_actor(menu.actor);
        menu.actor.hide();

        // The menu owns its grab: the modal is popped when its actor is destroyed. The
        // manager destroys itself with its last menu.
        const manager = new PopupMenu.PopupMenuManager(menu);
        manager.addMenu(menu);
        menu.connect('open-state-changed', (source, isOpen) => {
            if (!isOpen)
                this._onClosed(menu);
        });
        this._menu = menu;
        this._connectEscapeGuard();
        menu.open(true);
    }

    close() {
        if (this._menu)
            this._menu.close(false);
    }

    // Runs after the manager's own handler, which released the grab and gave the focus back.
    _onClosed(menu) {
        if (menu !== this._menu)
            return;

        this._menu = null;
        if (!this._escapePressed)
            this._disconnectEscapeGuard();
        menu.destroy();
        const action = this._pendingAction;
        this._pendingAction = null;
        if (action)
            action();
    }

    // The menu closes on Escape's press; the release would then reach Scale, which closes
    // on an Escape release. The rest of that key stroke is swallowed.
    _connectEscapeGuard() {
        this._escapePressed = false;
        if (!this._escapeGuardId)
            this._escapeGuardId = global.stage.connect('captured-event', (actor, event) => this._onCapturedKey(event));
    }

    _onCapturedKey(event) {
        if (!isKeyEvent(event))
            return Clutter.EVENT_PROPAGATE;

        const isPress = event.type() === Clutter.EventType.KEY_PRESS;
        if (event.get_key_symbol() !== Clutter.KEY_Escape) {
            if (isPress && !this._menu)
                this._disconnectEscapeGuard();
            else if (isPress)
                this._escapePressed = false;
            return Clutter.EVENT_PROPAGATE;
        }
        // The open menu takes the press and closes.
        if (this._menu) {
            if (isPress)
                this._escapePressed = true;
            return Clutter.EVENT_PROPAGATE;
        }
        if (!this._escapePressed)
            return Clutter.EVENT_PROPAGATE;
        // A repeated press is part of the same stroke; the release ends it.
        if (!isPress)
            this._disconnectEscapeGuard();
        return Clutter.EVENT_STOP;
    }

    _disconnectEscapeGuard() {
        this._escapePressed = false;
        if (this._escapeGuardId) {
            global.stage.disconnect(this._escapeGuardId);
            this._escapeGuardId = 0;
        }
    }

    // No entry's action runs once the dock is gone.
    destroy() {
        if (this._menu) {
            const menu = this._menu;
            this._menu = null;
            menu.close(false);
            menu.destroy();
        }
        this._pendingAction = null;
        this._disconnectEscapeGuard();
    }
};
