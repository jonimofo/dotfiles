// Logic tests of scale-wheel-switch@bgi (Scale overview), run by cinnamon-scale-test.sh.
// Cinnamon's actors, Scale's overview and its window clones are fakes: no running Cinnamon
// is touched. Each block is a regression test of a fixed bug.
// Usage: gjs cinnamon-scale-test.js <extension folder>
const GLib = imports.gi.GLib;
const ByteArray = imports.byteArray;

const [extensionDir] = ARGV;
let failures = 0;

function check(label, condition) {
    print(`${condition ? 'PASS' : 'FAIL'} ${label}`);
    if (!condition)
        failures++;
}

function throws(action) {
    try {
        action();
        return false;
    } catch (e) {
        return true;
    }
}

function readText(path) {
    return ByteArray.toString(GLib.file_get_contents(path)[1]);
}

// Clutter's and GJS's signals: a handler returning true stops the emission, and
// disconnecting an id that is not connected throws, as imports.signals does.
class FakeSignals {
    constructor() {
        this._handlers = new Map();
        this._nextId = 1;
    }

    connect(name, callback) {
        const id = this._nextId++;
        this._handlers.set(id, { name, callback });
        return id;
    }

    disconnect(id) {
        if (!this._handlers.delete(id))
            throw new Error(`No signal connection ${id} found`);
    }

    signalHandlerIsConnected(id) {
        return this._handlers.has(id);
    }

    disconnectAll() {
        this._handlers.clear();
    }

    // A handler disconnected by an earlier one of the same emission is skipped, as in GJS.
    emit(name, ...args) {
        for (const [id, { name: handlerName, callback }] of [...this._handlers]) {
            if (!this._handlers.has(id) || handlerName !== name)
                continue;
            if (callback(this, ...args) === true)
                return true;
        }
        return false;
    }
}

// Natural heights of the fake bands, by style class: the clock row is above the search.
const NATURAL_HEIGHTS = { 'scale-clock-bar': 52, 'scale-search-bar': 50 };

class FakeActor extends FakeSignals {
    constructor(props = {}) {
        super();
        Object.assign(this, { x: 0, y: 0, width: 0, height: 0, opacity: 255, visible: true, reactive: false }, props);
        this.children = [];
        this.parent = null;
        this.destroyed = false;
        this.themeLengths = {};
        this.naturalHeight = NATURAL_HEIGHTS[props.style_class] || 0;
        this.naturalWidth = 0;
        // St.Bin's child is its child actor, as set_child() makes it.
        if (props.child)
            this.add_actor(props.child);
    }

    set_text(text) {
        this.text = text;
    }

    set_height(height) {
        this.height = height;
        this.naturalHeight = height;
    }

    set_child(child) {
        this.child = child;
        this.add_actor(child);
    }

    add_style_class_name(name) {
        this.style_classes = [...(this.style_classes || []), name];
    }

    get_transformed_position() {
        return [this.x, this.y];
    }

    get_transformed_size() {
        return [this.width, this.height];
    }

    add_actor(child) {
        child.parent = this;
        this.children.push(child);
    }

    insert_child_below(child, sibling) {
        child.parent = this;
        const index = this.children.indexOf(sibling);
        this.children.splice(index === -1 ? 0 : index, 0, child);
    }

    insert_child_above(child, sibling) {
        child.parent = this;
        this.children.splice(this.children.indexOf(sibling) + 1, 0, child);
    }

    is_finalized() {
        return this.destroyed;
    }

    get_size() {
        return [this.width, this.height];
    }

    raise_top() {
        const siblings = this.parent.children;
        siblings.splice(siblings.indexOf(this), 1);
        siblings.push(this);
    }

    contains(other) {
        for (let actor = other; actor; actor = actor.parent) {
            if (actor === this)
                return true;
        }
        return false;
    }

    destroy() {
        this.destroyed = true;
        if (this.parent)
            this.parent.children.splice(this.parent.children.indexOf(this), 1);
        this.parent = null;
    }

    destroy_all_children() {
        for (const child of [...this.children])
            child.destroy();
    }

    show() {
        this.visible = true;
    }

    hide() {
        this.visible = false;
    }

    set_position(x, y) {
        Object.assign(this, { x, y });
    }

    set_size(width, height) {
        Object.assign(this, { width, height });
    }

    set_pivot_point(pivotX, pivotY) {
        this.pivot = [pivotX, pivotY];
    }

    set_scale(scaleX, scaleY) {
        Object.assign(this, { scale_x: scaleX, scale_y: scaleY });
    }

    set_width(width) {
        this.width = width;
    }

    get_preferred_height() {
        return [0, this.naturalHeight];
    }

    get_preferred_width() {
        return [0, this.naturalWidth];
    }

    get_theme_node() {
        return { get_length: property => this.themeLengths[property] || 0, get_padding: () => 0 };
    }

    add_style_pseudo_class(name) {
        this.pseudo_classes = [...(this.pseudo_classes || []), name];
    }

    remove_style_pseudo_class(name) {
        this.pseudo_classes = (this.pseudo_classes || []).filter(pseudoClass => pseudoClass !== name);
    }
}

// dnd's Draggable: it sees the actor's button presses (when no earlier handler stops them)
// and emits 'drag-begin', 'drag-cancelled' and 'drag-end' when the test does.
class FakeDraggable extends FakeSignals {
    constructor(actor, params) {
        super();
        this.actor = actor;
        this.params = params;
        this.pressesSeen = 0;
        actor.connect('button-press-event', () => {
            this.pressesSeen++;
            return false;
        });
    }
}

// Only Clutter.Actor makes this kind: the search's click blockers.
class FakeClutterActor extends FakeActor {}

// Clutter.Clone: the overview's copy of the top panel, or of the panel clock in the band.
class FakeClone extends FakeActor {}

class FakeEntry extends FakeActor {
    constructor(props) {
        super(props);
        this._text = '';
        this.clutter_text = new FakeSignals();
    }

    get_text() {
        return this._text;
    }

    set_text(text) {
        this._text = text;
        this.clutter_text.emit('text-changed');
    }
}

// Cinnamon's popup menu and its item, as the dock menu uses them. A menu follows
// PopupMenuBase: the constructor calls _init, which subclasses override. An item's
// 'activate' closes its menu, as PopupMenuBase does; open() and close() only emit. Every
// menu made is listed in FakePopupMenu.made; its actor points back to it.
class FakePopupMenu extends FakeSignals {
    constructor(...args) {
        super();
        this._init(...args);
        FakePopupMenu.made.push(this);
    }

    _init(sourceActor, orientation) {
        this.sourceActor = sourceActor;
        this._orientation = orientation;
        this.actor = new FakeActor();
        this.actor.menu = this;
        this.items = [];
        this.isOpen = false;
        this.destroyed = false;
        this.destroyCount = 0;
    }

    addMenuItem(item) {
        this.items.push(item);
        item.connect('activate', () => this.close(true));
    }

    open() {
        this.isOpen = true;
        this.emit('open-state-changed', true);
    }

    close() {
        if (!this.isOpen)
            return;
        this.isOpen = false;
        this.emit('open-state-changed', false);
    }

    destroy() {
        this.destroyed = true;
        this.destroyCount++;
        this.actor.destroy();
        this.emit('destroy');
    }
}
FakePopupMenu.made = [];

class FakePopupMenuItem extends FakeSignals {
    constructor(label) {
        super();
        this.label = label;
    }

    activate() {
        this.emit('activate');
    }
}

// PopupMenuManager as stock: addMenu connects 'open-state-changed' and 'destroy'. Opening
// takes a modal grab (Main.modalCount + 1), closing the active menu releases it; removeMenu
// (on the menu's destroy) closes the active menu and destroys the manager with its last
// menu, without releasing the grab itself.
function makeFakePopupMenuManager(Main) {
    return class FakePopupMenuManager {
        constructor(owner) {
            this.owner = owner;
            this.menus = [];
            this.activeMenu = null;
            this.grabbed = false;
            this.destroyed = false;
        }

        addMenu(menu) {
            const ids = [
                menu.connect('open-state-changed', (source, isOpen) => this._onMenuOpenState(menu, isOpen)),
                menu.connect('destroy', () => this.removeMenu(menu)),
            ];
            this.menus.push({ menu, ids });
            menu.manager = this;
        }

        _onMenuOpenState(menu, isOpen) {
            if (isOpen) {
                this.activeMenu = menu;
                if (!this.grabbed) {
                    Main.modalCount++;
                    this.grabbed = true;
                }
            } else if (menu === this.activeMenu) {
                if (this.grabbed) {
                    Main.modalCount--;
                    this.grabbed = false;
                }
                this.activeMenu = null;
            }
        }

        removeMenu(menu) {
            if (menu === this.activeMenu)
                menu.close(true);
            const index = this.menus.findIndex(entry => entry.menu === menu);
            if (index === -1)
                return;
            for (const id of this.menus[index].ids)
                menu.disconnect(id);
            this.menus.splice(index, 1);
            if (this.menus.length === 0)
                this.destroyed = true;
        }
    };
}

// Tooltips.Tooltip: preventShow and hide(), as the dock menu uses them.
class FakeTooltip {
    constructor(item, text) {
        this.item = item;
        this.text = text;
        this.preventShow = false;
        this.hideCalls = 0;
        FakeTooltip.made.push(this);
    }

    hide() {
        this.hideCalls++;
    }
}
FakeTooltip.made = [];

const BUTTON = { PRIMARY: 1, MIDDLE: 2, SECONDARY: 3 };
const ESCAPE_KEY = 0xff1b;
// What a strip takes at the top of its screen, in the fake layout.
const STRIP_HEIGHT = 100;
const DEFAULT_ICON_SIZE = 48;
const ICON_SIZE_PROPERTY = '-test-icon-size';

function makeImports(monitorCount, primaryIndex) {
    const Clutter = {
        Actor: FakeClutterActor,
        EVENT_STOP: true,
        EVENT_PROPAGATE: false,
        BUTTON_PRIMARY: BUTTON.PRIMARY,
        BUTTON_MIDDLE: BUTTON.MIDDLE,
        BUTTON_SECONDARY: BUTTON.SECONDARY,
        KEY_Escape: ESCAPE_KEY,
        KEY_BackSpace: 0xff08,
        KEY_Return: 0xff0d,
        KEY_KP_Enter: 0xff8d,
        KEY_Left: 0xff51,
        KEY_Up: 0xff52,
        KEY_Right: 0xff53,
        KEY_Down: 0xff54,
        ModifierType: { CONTROL_MASK: 1 << 2, MOD1_MASK: 1 << 3, MOD4_MASK: 1 << 6, SUPER_MASK: 1 << 26 },
        ActorAlign: { CENTER: 1, END: 2 },
        ScrollDirection: { UP: 0, DOWN: 1, LEFT: 2, RIGHT: 3, SMOOTH: 4 },
        EventType: { SCROLL: 1, KEY_PRESS: 2, KEY_RELEASE: 3 },
        BinLayout: class {},
        Clone: FakeClone,
    };
    const themeContext = { scale_factor: 1 };
    const St = {
        Entry: FakeEntry,
        Bin: FakeActor,
        BoxLayout: FakeActor,
        Widget: FakeActor,
        Label: FakeActor,
        Side: { LEFT: 0, RIGHT: 1, BOTTOM: 2 },
        ThemeContext: { get_for_stage: () => themeContext },
    };
    // One app system, as Cinnamon's: it emits 'app-state-changed'; get_running() is set by tests.
    const appSystem = Object.assign(new FakeSignals(), {
        running: [],
        get_tree: () => ({ get_root_directory: () => emptyMenu }),
        get_running: () => appSystem.running,
        lookup_app: () => null,
    });
    const CMenu = { TreeItemType: { INVALID: 0, DIRECTORY: 1, ENTRY: 2 } };
    const emptyMenu = { iter: () => ({ next: () => CMenu.TreeItemType.INVALID }) };
    const Cinnamon = {
        AppSystem: { get_default: () => appSystem },
        get_event_state: () => 0,
        util_set_hidden_from_pick: (actor, hidden) => (actor.hiddenFromPick = hidden),
        // Each fake actor's box on the stage, from its position and size.
        util_get_transformed_allocation: actor => ({ x1: actor.x, y1: actor.y, x2: actor.x + actor.width, y2: actor.y + actor.height }),
    };

    // Main loop timeouts: recorded, fired by the test.
    const timers = new Map();
    let nextTimerId = 1;
    const Mainloop = {
        timeout_add(delay, callback) {
            const id = nextTimerId++;
            timers.set(id, { delay, callback: () => {
                timers.delete(id);
                return callback();
            } });
            return id;
        },
        idle_add(callback) {
            return Mainloop.timeout_add('idle', callback);
        },
        source_remove(id) {
            if (!timers.delete(id))
                throw new Error(`No source ${id}`);
        },
    };

    const tweenRemovals = [];
    const monitors = [];
    for (let i = 0; i < monitorCount; i++)
        monitors.push({ x: i * 1920, y: 0, width: 1920, height: 1080 });

    const overview = new FakeSignals();
    Object.assign(overview, {
        visible: false,
        _hideInProgress: false,
        animationInProgress: false,
        _group: new FakeActor(),
        _coverPane: new FakeActor(),
        workspacesView: { actor: new FakeActor() },
    });
    overview._group.add_actor(overview._coverPane);
    // Scale's view, multi-screen, in the group of its windows.
    globalThis.global.overlay_group = new FakeActor();
    globalThis.global.overlay_group.add_actor(overview._group);
    globalThis.global.overlay_group.add_actor(overview.workspacesView.actor);

    const Main = {
        layoutManager: { monitors, primaryIndex, primaryMonitor: monitors[primaryIndex] },
        uiGroup: new FakeActor(),
        // A window Scale would show says so in the fake.
        isInteresting: metaWindow => metaWindow.interesting,
        overview,
        modalCount: 0,
        getWorkspaceName: index => `Workspace ${index + 1}`,
        // The panels: the top one is copied in Scale.
        panelManager: { panels: [], getPanelsInMonitor: index => Main.panelManager.panels.filter(panel => panel.monitorIndex === index) },
        // Running applets by uuid: the panel clock of the fallback band.
        AppletManager: { instances: {}, getRunningInstancesForUuid: uuid => Main.AppletManager.instances[uuid] || [] },
    };
    // Scale closing: counted, and visible drops as Cinnamon's hide() does.
    overview.hideCalls = 0;
    overview.hide = () => {
        overview.hideCalls++;
        overview.visible = false;
    };

    // Scale's own handlers, which the extension wraps; each records its calls.
    const keyPresses = [];
    const buttonReleases = [];
    class Workspace {}
    Workspace.prototype._onKeyPress = function(actor, event) {
        keyPresses.push(event);
        return false;
    };
    class WindowClone {}
    WindowClone.prototype._onButtonRelease = function(actor, event) {
        buttonReleases.push(event.get_button());
        return Clutter.EVENT_STOP;
    };

    return {
        imports: {
            gi: {
                Clutter, St, CMenu, Cinnamon,
                // Wayland: the thumbnails skip their X11 wallpaper.
                Meta: { MotionDirection: { LEFT: 'left', RIGHT: 'right' }, is_wayland_compositor: () => true },
            },
            ui: {
                main: Main,
                workspace: { Workspace, WindowClone },
                workspacesView: { WORKSPACE_SWITCH_TIME: 0.25 },
                popupMenu: { PopupMenu: FakePopupMenu, PopupMenuItem: FakePopupMenuItem, PopupMenuManager: makeFakePopupMenuManager(Main) },
                tooltips: { Tooltip: FakeTooltip },
                // Tweener: the objects whose animations were removed, in order.
                tweener: { removeTweens: scope => tweenRemovals.push(scope) > 0 },
                dnd: {
                    DragMotionResult: { CONTINUE: 0, MOVE_DROP: 1 },
                    makeDraggable: (actor, params) => new FakeDraggable(actor, params),
                },
            },
            misc: { signalManager: { SignalManager: class {} }, windowUtils: {} },
            mainloop: Mainloop,
        },
        Clutter, Main, Workspace, WindowClone, monitors, themeContext, keyPresses, buttonReleases, strips: [], timers, appSystem,
        tweenRemovals,
    };
}

// Cinnamon's require(): every top-level declaration of the file is exported. @stubs replaces
// the sibling modules a test does not exercise. @dir is the extension's folder by default.
function makeRequire(moduleImports, stubs = {}, dir = extensionDir) {
    const modules = {};
    const require = path => {
        const name = path.replace('./', '');
        if (stubs[name])
            return stubs[name];
        if (!modules[name]) {
            const source = readText(`${dir}/${name}.js`);
            const names = [...source.matchAll(/^(?:function|const|let|var|class) ([A-Za-z0-9_]+)/gm)].map(m => m[1]);
            modules[name] = new Function('require', 'imports', '_',
                `${source}\nreturn { ${names.join(', ')} };`)(require, moduleImports, text => text);
        }
        return modules[name];
    };
    return require;
}

function setUp(monitorCount = 1, primaryIndex = 0) {
    globalThis.global = { stage: new FakeSignals(), logError: () => {} };
    FakePopupMenu.made = [];
    FakeTooltip.made = [];
    const env = makeImports(monitorCount, primaryIndex);
    env.require = makeRequire(env.imports);
    // extension.js with every sibling but the search and the helpers replaced.
    env.loadExtension = () => makeRequire(env.imports, makeSiblingStubs(env))('./extension');
    return env;
}

// The modules extension.js wires, other than the search: no-ops, and one fake strip per
// screen whose big view is the screen below the strip.
function makeSiblingStubs(env) {
    const noop = { enable() {}, disable() {} };
    class WorkspaceStrip {
        constructor(index, topOffset, bottomInset) {
            const monitor = env.monitors[index];
            this.index = index;
            this.topOffset = topOffset;
            env.strips.push(this);
            this.area = {
                x: monitor.x,
                y: monitor.y + topOffset + STRIP_HEIGHT,
                width: monitor.width,
                height: monitor.height - topOffset - STRIP_HEIGHT - bottomInset,
            };
        }

        getBigViewArea() {
            return { ...this.area };
        }

        repositionBigView() {}

        destroy() {}
    }
    return {
        workspaceStrip: { WorkspaceStrip },
        appDock: { getDockApps: () => ({}), countDockApps: () => 0 },
        windowDrag: noop,
        monitorDrop: noop,
        windowClick: noop,
        superKey: noop,
        hotCornerFullscreen: noop,
    };
}

function keyEvent(character, symbol = 0) {
    return { get_key_unicode: () => character, get_key_symbol: () => symbol };
}

// A key typed in Scale: it reaches Workspace._onKeyPress, which the search wraps.
function typeKey(env, event) {
    return new env.Workspace()._onKeyPress(null, event);
}

function buttonEvent(button) {
    return { get_button: () => button };
}

function blockersOf() {
    return global.overlay_group.children.filter(actor => actor instanceof FakeClutterActor);
}

function sameArea(actor, area) {
    return actor.x === area.x && actor.y === area.y && actor.width === area.width && actor.height === area.height;
}

function bigViewArea(env, index) {
    const monitor = env.monitors[index];
    return { x: monitor.x, y: monitor.y + STRIP_HEIGHT, width: monitor.width, height: monitor.height - STRIP_HEIGHT };
}

function openScale(env) {
    env.Main.overview.visible = true;
    env.Main.overview.emit('showing');
}

// X-M1: while searching, Scale's windows are hidden on every screen but the result grid only
// covers the primary one. A click on another screen reached an invisible window, opened it
// and closed Scale.
function testSearchBlocksOtherScreens() {
    // Three screens, the middle one primary: blockers go on screens 0 and 2.
    const env = setUp(3, 1);
    const extension = env.loadExtension();
    extension.enable();
    openScale(env);
    check('X-M1: no click blocker while the search field is empty', blockersOf().length === 0);

    typeKey(env, keyEvent('f'));
    let blockers = blockersOf();
    check('X-M1: typing hides the windows of every screen', env.Main.overview.workspacesView.actor.opacity === 0);
    check('X-M1: searching puts one blocker on each non-primary screen', blockers.length === 2);
    check('X-M1: the blockers cover the big view areas of screens 0 and 2',
        blockers.length === 2 && sameArea(blockers[0], bigViewArea(env, 0)) && sameArea(blockers[1], bigViewArea(env, 2)));
    check('X-M1: no blocker on the primary screen (the result grid is there)',
        blockers.every(blocker => blocker.x !== env.monitors[1].x));
    const viewIndex = global.overlay_group.children.indexOf(env.Main.overview.workspacesView.actor);
    check('X-M1: the blockers are stacked above Scale\'s windows',
        blockers.every(blocker => global.overlay_group.children.indexOf(blocker) > viewIndex));
    check('X-M1: the blockers are reactive and fully transparent',
        blockers.every(blocker => blocker.reactive && blocker.opacity === 0));
    check('X-M1: a button press on a blocker is swallowed (no window opens, no drag starts)',
        blockers.every(blocker => blocker.emit('button-press-event', buttonEvent(BUTTON.PRIMARY)) === true));
    check('X-M1: a button release on a blocker is swallowed',
        blockers.every(blocker => blocker.emit('button-release-event', buttonEvent(BUTTON.PRIMARY)) === true));

    typeKey(env, keyEvent('i'));
    check('X-M1: more typing keeps the same two blockers', blockersOf().length === 2 && blockersOf()[0] === blockers[0]);

    typeKey(env, keyEvent(null, ESCAPE_KEY));
    check('X-M1: clearing the search removes the blockers',
        blockersOf().length === 0 && blockers.every(blocker => blocker.destroyed));
    check('X-M1: clearing the search shows the windows again', env.Main.overview.workspacesView.actor.opacity === 255);

    typeKey(env, keyEvent('f'));
    blockers = blockersOf();
    env.Main.overview.emit('hiding');
    check('X-M1: Scale starting to close with text removes the blockers',
        blockers.length === 2 && blockersOf().length === 0 && blockers.every(blocker => blocker.destroyed));
    env.Main.overview.visible = false;
    env.Main.overview.emit('hidden');

    openScale(env);
    typeKey(env, keyEvent('f'));
    env.Main.overview.visible = false;
    env.Main.overview.emit('hidden');
    check('X-M1: Scale hidden without a hiding signal leaves no blocker', blockersOf().length === 0);

    openScale(env);
    typeKey(env, keyEvent('f'));
    blockers = blockersOf();
    extension.disable();
    check('X-M1: disable() while searching removes the blockers',
        blockers.length === 2 && blockersOf().length === 0 && blockers.every(blocker => blocker.destroyed));

    const single = setUp(1, 0);
    const singleExtension = single.loadExtension();
    singleExtension.enable();
    openScale(single);
    typeKey(single, keyEvent('f'));
    check('X-M1: one screen only: searching adds no blocker', blockersOf().length === 0);
    singleExtension.disable();
}

// PR #24: stock Scale closes the application on a middle click on a window.
function testMiddleClickDoesNothing() {
    const env = setUp();
    const windowClick = env.require('./windowClick');
    windowClick.enable();
    windowClick.enable();
    const clone = new env.WindowClone();

    const result = clone._onButtonRelease(null, buttonEvent(BUTTON.MIDDLE));
    check('#24: a middle click on a window never reaches Scale (the app stays open)', env.buttonReleases.length === 0);
    check('#24: the middle click is swallowed', result === env.Clutter.EVENT_STOP);

    clone._onButtonRelease(null, buttonEvent(BUTTON.SECONDARY));
    check('#24: a right click opens the window like a left click', env.buttonReleases.join() === `${BUTTON.PRIMARY}`);
    clone._onButtonRelease(null, buttonEvent(BUTTON.PRIMARY));
    check('#24: a left click reaches Scale once (enable twice does not wrap twice)',
        env.buttonReleases.join() === `${BUTTON.PRIMARY},${BUTTON.PRIMARY}`);

    windowClick.disable();
    clone._onButtonRelease(null, buttonEvent(BUTTON.MIDDLE));
    check('#24: disable() gives the middle click back to Scale', env.buttonReleases.length === 3);
}

class FakeHover {
    constructor(uiHelpers) {
        this.actor = new FakeActor();
        this.shown = false;
        this.hover = new uiHelpers.DragHover(this.actor, () => (this.shown = true), () => (this.shown = false));
    }
}

// PR #29: after a fast sweep from one drop target to another, dnd never reported the drag
// leaving the first one, and its highlight stayed after the drop; a draggable destroyed
// with its window then made the hover throw and stay stuck.
function testDragHighlightsClearedOnDrop() {
    const env = setUp();
    const uiHelpers = env.require('./uiHelpers');
    const first = new FakeHover(uiHelpers);
    const second = new FakeHover(uiHelpers);
    const draggable = new FakeSignals();

    first.hover.enter(draggable);
    second.hover.enter(draggable);
    const dropTarget = new FakeActor();
    second.actor.add_actor(dropTarget);
    uiHelpers.leaveDragHoversOutside(dropTarget);
    check('#29: a fast drop clears the highlight of the target swept over', !first.shown);
    check('#29: a fast drop keeps the highlight of the target dropped on', second.shown);

    // The moved window is destroyed with its draggable before 'drag-end'.
    draggable.disconnectAll();
    check('#29: leaving after the draggable was destroyed does not throw', !throws(() => second.hover.leave()));
    check('#29: that leave clears the highlight', !second.shown);

    const nextDraggable = new FakeSignals();
    second.hover.enter(nextDraggable);
    check('#29: the next drag highlights the target again', second.shown);
    nextDraggable.emit('drag-end');
    check('#29: drag-end clears the highlight (drag cancelled over the target)', !second.shown);

    first.hover.enter(nextDraggable);
    uiHelpers.leaveDragHoversOutside(null);
    check('#29: a drop on no target clears every highlight', !first.shown);
}

// PR #29: St gives stylesheet lengths multiplied by the display scale, and icons multiply
// their size by it again: at 2x the dock icons were twice too big.
function testIconSizeAtDisplayScale() {
    const env = setUp();
    const uiHelpers = env.require('./uiHelpers');
    const widget = new FakeActor();

    env.themeContext.scale_factor = 1;
    widget.themeLengths[ICON_SIZE_PROPERTY] = DEFAULT_ICON_SIZE;
    check('#29: icon size at 1x is the stylesheet size', uiHelpers.getIconSize(widget, ICON_SIZE_PROPERTY) === DEFAULT_ICON_SIZE);

    env.themeContext.scale_factor = 2;
    widget.themeLengths[ICON_SIZE_PROPERTY] = DEFAULT_ICON_SIZE * 2;
    check('#29: icon size at 2x display scaling is still the stylesheet size',
        uiHelpers.getIconSize(widget, ICON_SIZE_PROPERTY) === DEFAULT_ICON_SIZE);
}

// PR #29: a constructor that threw after putting its bar on screen left it there.
function testConstructorFailureDestroys() {
    const env = setUp();
    const uiHelpers = env.require('./uiHelpers');
    let destroyed = false;
    const object = { destroy: () => (destroyed = true) };
    const error = new Error('build failed');
    let thrown = null;
    try {
        uiHelpers.destroyOnFailure(object, () => {
            throw error;
        });
    } catch (e) {
        thrown = e;
    }
    check('#29: destroyOnFailure destroys the object when its build throws', destroyed);
    check('#29: destroyOnFailure passes the error on', thrown === error);

    destroyed = false;
    uiHelpers.destroyOnFailure(object, () => {});
    check('#29: destroyOnFailure leaves a successful build alone', !destroyed);

    // A real constructor: the search bar fails while being put on screen.
    env.Main.overview._group.insert_child_below = () => {
        throw error;
    };
    const appSearch = env.require('./appSearch');
    const created = [];
    const OriginalBin = env.imports.gi.St.Bin;
    env.imports.gi.St.Bin = class extends OriginalBin {
        constructor(props) {
            super(props);
            created.push(this);
        }
    };
    check('#29: a failing search constructor throws', throws(() => new appSearch.AppSearch()));
    check('#29: a failing search constructor leaves no bar on screen', created.length > 0 && created.every(actor => actor.destroyed));
    env.imports.gi.St.Bin = OriginalBin;
}

// PR #29: one fit-to-width rule for the strip thumbnails and the dock icons. Only the items
// shrink, the paddings and spacing around them do not.
function testFittingItemWidth() {
    const env = setUp();
    const { getFittingItemWidth } = env.require('./uiHelpers');
    check('#29 fit: a row that fits keeps its size', getFittingItemWidth(800, 800, 4, 200) === null);
    check('#29 fit: an empty row keeps its size', getFittingItemWidth(1000, 800, 0, 200) === null);

    // 4 items of 200 plus 200 of padding and spacing, in 800: (800 - 200) / 4.
    const width = getFittingItemWidth(1000, 800, 4, 200);
    check('#29 fit: an overflowing row shrinks only its items', width === 150);
    check('#29 fit: the shrunk row fits the available width', 200 + 4 * width <= 800);
    check('#29 fit: the width is rounded down, never wider than the space', getFittingItemWidth(1010, 800, 3, 300) === 230);
    check('#29 fit: a row with no room left keeps items of the minimum width', getFittingItemWidth(1000, 10, 4, 200) === 1);
}

function clockBarsOf(env) {
    return env.Main.overview._group.children.filter(actor => actor.style_class === 'scale-clock-bar');
}

function searchBarOf(env) {
    return env.Main.overview._group.children.find(actor => actor.style_class === 'scale-search-bar');
}

function closeScale(env) {
    env.Main.overview.visible = false;
    env.Main.overview.emit('hidden');
}

// The owner's top panel on a 1920x1080 primary screen, 40 px high.
const TOP_PANEL = { x: 0, y: 0, width: 1920, height: 40 };
const BOTTOM_PANEL = { x: 0, y: 1040, width: 1920, height: 40 };

// A panel of Main.panelManager, its actor at @box; @isHideable for autohide or intellihide.
function fakePanel(box, monitorIndex = 0, isHideable = false) {
    return { monitorIndex, actor: new FakeActor(box), isHideable: () => isHideable };
}

// The copy of the panel above Scale's group, if any.
function panelCopiesOf(env) {
    return global.overlay_group.children.filter(actor => actor instanceof env.Clutter.Clone);
}

// The real panel fading back in after Scale closed: @steps opacities, each notified.
function fadePanelIn(panel, steps) {
    for (const opacity of steps) {
        panel.actor.opacity = opacity;
        panel.actor.emit('notify::opacity');
    }
}

// Which panel is copied: the one on the primary screen's top edge, despite float noise.
function testPanelChoice() {
    const env = setUp();
    const { isOnTopEdge, findTopPanel, isPanelShown, boxOf } = env.require('./topRow');
    const monitor = env.monitors[0];

    check('panel: a panel on the top edge is copied', isOnTopEdge(TOP_PANEL, monitor));
    const noisy = boxOf(new FakeActor({ x: 0.00011444091796875, y: 0.0001220703125, width: 1919.999755859375,
        height: 29.9998779296875 }));
    print(`  live panel box snapped: ${JSON.stringify(noisy)}`);
    check('panel: float noise in the stage coordinates still counts as the top edge (live panel at y 0.000122)',
        isOnTopEdge(noisy, monitor) && noisy.height === 30);
    check('panel: a bottom panel is not on the top edge', !isOnTopEdge(BOTTOM_PANEL, monitor));
    check('panel: a panel hidden by autohide (moved above the screen) is not on the top edge',
        !isOnTopEdge({ ...TOP_PANEL, y: -40 }, monitor));
    check('panel: a top panel of the screen right of the primary is not on its top edge',
        !isOnTopEdge({ ...TOP_PANEL, x: 1920 }, monitor));
    const bottom = { box: BOTTOM_PANEL };
    const top = { box: TOP_PANEL };
    check('panel: the top panel is chosen among the primary screen\'s panels', findTopPanel([bottom, top], monitor) === top);
    check('panel: no top panel, none chosen', findTopPanel([bottom], monitor) === null);
    check('panel: an autohide top panel is not copied (it would turn into an empty band)',
        findTopPanel([{ box: TOP_PANEL, isHideable: true }], monitor) === null);

    check('panel: shown only when visible at full opacity',
        isPanelShown({ visible: true, opacity: 255 }) && !isPanelShown({ visible: true, opacity: 254 }) &&
        !isPanelShown({ visible: false, opacity: 255 }));
}

// The copy of the top panel: at its pixels from the opening; after closing, kept until the
// real panel is fully back; removed in every other exit path.
function testPanelCopy() {
    const env = setUp(2, 0);
    const extension = env.loadExtension();
    extension.enable();
    const panel = fakePanel(TOP_PANEL);
    const otherScreenPanel = fakePanel({ ...TOP_PANEL, x: 1920 }, 1);
    env.Main.panelManager.panels = [panel, otherScreenPanel];

    openScale(env);
    let [copy] = panelCopiesOf(env);
    check('copy: one live clone of the primary screen\'s top panel', panelCopiesOf(env).length === 1 && copy.source === panel.actor);
    check('copy: at the panel\'s place and size', copy.x === 0 && copy.y === 0 && copy.width === 1920 && copy.height === 40);
    check('copy: above Scale\'s group, at its own full opacity',
        global.overlay_group.children.indexOf(copy) > global.overlay_group.children.indexOf(env.Main.overview._group) &&
        copy.opacity === 255);
    check('copy: no clock band', clockBarsOf(env).length === 0);
    const blocker = env.Main.overview._group.children.find(actor => actor.reactive && actor.height === 40);
    check('copy: the copy takes no click; a blocker as high as the panel swallows them',
        !copy.reactive && blocker && blocker.emit('button-press-event', buttonEvent(BUTTON.PRIMARY)) === true &&
        blocker.emit('button-release-event', buttonEvent(BUTTON.PRIMARY)) === true);
    check('copy: the search field starts under the panel', searchBarOf(env).y === 40);
    check('copy: the primary strip follows the panel and the search',
        env.strips.find(strip => strip.index === 0).topOffset === 40 + NATURAL_HEIGHTS['scale-search-bar']);
    typeKey(env, keyEvent('f'));
    check('copy: typing still searches', searchBarOf(env).child.get_text() === 'f');
    typeKey(env, keyEvent(null, ESCAPE_KEY));

    // Scale closes: the real panel starts its fade-in from 0.
    panel.actor.opacity = 0;
    closeScale(env);
    check('copy: Scale closed with the panel still fading in: the copy stays', !copy.destroyed &&
        panelCopiesOf(env).length === 1 && blocker.destroyed);
    check('copy: one safety timer while it waits', env.timers.size === 1 && [...env.timers.values()][0].delay === 1000);
    fadePanelIn(panel, [120, 254]);
    check('copy: still there while the panel is not fully opaque', !copy.destroyed);
    fadePanelIn(panel, [255]);
    check('copy: removed once the real panel is fully back, with its timer', copy.destroyed &&
        panelCopiesOf(env).length === 0 && env.timers.size === 0);
    check('copy: no opacity handler is left on the panel once the copy is gone',
        ![...panel.actor._handlers.values()].some(handler => handler.name === 'notify::opacity'));

    openScale(env);
    copy = panelCopiesOf(env)[0];
    closeScale(env);
    check('copy: closing with the panel already opaque removes the copy at once', copy.destroyed && env.timers.size === 0);

    panel.actor.opacity = 0;
    openScale(env);
    copy = panelCopiesOf(env)[0];
    closeScale(env);
    const [timer] = [...env.timers.values()];
    timer.callback();
    check('copy: the safety timer removes a copy whose panel never comes back', copy.destroyed &&
        panelCopiesOf(env).length === 0);

    openScale(env);
    const first = panelCopiesOf(env)[0];
    closeScale(env);
    closeScale(env);
    check('copy: Scale closed twice keeps one waiting copy', panelCopiesOf(env).length === 1 && env.timers.size === 1);
    openScale(env);
    check('copy: Scale opened again during the fade-in replaces the waiting copy',
        first.destroyed && panelCopiesOf(env).length === 1 && env.timers.size === 0);
    closeScale(env);
    extension.disable();
    check('copy: disable() during the fade-in removes the copy and its timer',
        panelCopiesOf(env).length === 0 && env.timers.size === 0);

    extension.enable();
    openScale(env);
    copy = panelCopiesOf(env)[0];
    extension.disable();
    check('copy: disable() with Scale open removes the copy', copy.destroyed && panelCopiesOf(env).length === 0 &&
        env.timers.size === 0);
}

// No top panel on the primary screen: the panel clock centred in a band; no clock: nothing.
function testPanelFallbacks() {
    const env = setUp();
    const extension = env.loadExtension();
    extension.enable();
    env.Main.panelManager.panels = [fakePanel(BOTTOM_PANEL)];
    const clockActor = new FakeActor({ x: 830, y: 1046, width: 259, height: 28 });
    env.Main.AppletManager.instances['calendar@cinnamon.org'] = [{ actor: clockActor }];

    openScale(env);
    const [band] = clockBarsOf(env);
    check('fallback: a bottom panel: its clock copied centred in a band (stock calendar used)',
        band && band.child instanceof env.Clutter.Clone && band.child.source === clockActor &&
        band.child.x_align === env.Clutter.ActorAlign.CENTER);
    check('fallback: no copy above Scale\'s group', panelCopiesOf(env).length === 0);
    check('fallback: the search field starts under the band', searchBarOf(env).y === NATURAL_HEIGHTS['scale-clock-bar']);
    closeScale(env);
    check('fallback: closing Scale removes the band and its copy at once', band.destroyed && env.timers.size === 0);

    env.Main.panelManager.panels = [fakePanel(TOP_PANEL, 0, true)];
    openScale(env);
    const [autohideBand] = clockBarsOf(env);
    check('fallback: an autohide top panel: the clock band, no panel copy',
        autohideBand && autohideBand.child.source === clockActor && panelCopiesOf(env).length === 0);
    closeScale(env);

    env.Main.AppletManager.instances = {};
    openScale(env);
    check('fallback: no top panel and no clock: nothing, the search field at the top',
        clockBarsOf(env).length === 0 && panelCopiesOf(env).length === 0 && searchBarOf(env).y === 0);
    extension.disable();
}

// Workspaces 1 to @count, the first one active. activate() records itself and makes the
// workspace the active one, as muffin does.
function setUpWorkspaces(count) {
    const activations = [];
    const workspaces = [];
    const manager = {
        active: null,
        n_workspaces: count,
        get_active_workspace: () => manager.active,
        get_workspace_by_index: index => workspaces[index],
    };
    for (let i = 0; i < count; i++) {
        const workspace = {
            index: () => i,
            activate() {
                activations.push(i);
                manager.active = workspace;
            },
            get_neighbor: direction => workspaces[Math.max(0, Math.min(count - 1, i + (direction === 'right' ? 1 : -1)))],
        };
        workspaces.push(workspace);
    }
    manager.active = workspaces[0];
    global.workspace_manager = manager;
    global.get_current_time = () => 0;
    global.get_window_actors = () => [];
    return { workspaces, activations, manager };
}

function clickActor(actor, button = BUTTON.PRIMARY) {
    actor.emit('button-press-event', buttonEvent(button));
    actor.emit('button-release-event', buttonEvent(button));
}

// Owner's choice "One click enters, always", "Everywhere": a click on a thumbnail of any
// strip enters that workspace and closes Scale; on the current one it only closes Scale.
function testThumbnailClickEntersWorkspace() {
    const env = setUp(2, 0);
    const { workspaces, activations, manager } = setUpWorkspaces(4);
    const strip = env.require('./workspaceStrip');
    env.Main.overview.visible = true;
    const thumbnail = (workspaceIndex, monitorIndex) =>
        new strip.WorkspaceThumbnail(workspaces[workspaceIndex], env.monitors[monitorIndex], monitorIndex, 0.12);

    // Scale's closing animation zooms the windows of the active workspace: it must already be
    // the clicked one when hide() runs.
    let activeAtHide = null;
    const countHide = env.Main.overview.hide;
    env.Main.overview.hide = () => {
        activeAtHide = manager.active;
        countHide();
    };
    clickActor(thumbnail(2, 0).actor);
    check('enter: the workspace is switched before Scale closes', activeAtHide === workspaces[2]);
    check('enter: a click on workspace 3 activates it once', activations.join() === '2' && manager.active === workspaces[2]);
    check('enter: the same click closes Scale once', env.Main.overview.hideCalls === 1);

    env.Main.overview.visible = true;
    clickActor(thumbnail(2, 0).actor);
    check('enter: a click on the current workspace does not activate it', activations.join() === '2');
    check('enter: a click on the current workspace closes Scale', env.Main.overview.hideCalls === 2);

    env.Main.overview.visible = true;
    clickActor(thumbnail(1, 1).actor);
    check('enter: a thumbnail of the second screen\'s strip enters too',
        activations.join() === '2,1' && env.Main.overview.hideCalls === 3);

    env.Main.overview.visible = true;
    const other = thumbnail(3, 0);
    clickActor(other.actor, BUTTON.SECONDARY);
    clickActor(other.actor, BUTTON.MIDDLE);
    check('enter: right and middle clicks do nothing', activations.join() === '2,1' && env.Main.overview.hideCalls === 3);

    // A drag ends with a release over the thumbnail, without a press on it.
    other.actor.emit('button-release-event', buttonEvent(BUTTON.PRIMARY));
    check('enter: a release without a press on the thumbnail (a drop) does not enter',
        activations.join() === '2,1' && env.Main.overview.hideCalls === 3);

    const draggedWindow = {
        is_on_all_workspaces: () => false,
        get_workspace: () => workspaces[0],
        get_monitor: () => 0,
        changedTo: null,
        change_workspace(workspace) {
            this.changedTo = workspace;
        },
        move_to_monitor() {},
    };
    const source = Object.assign(new env.WindowClone(), { metaWindow: draggedWindow, _draggable: new FakeSignals() });
    check('enter: a window dropped on a thumbnail moves there', other.acceptDrop(source) && draggedWindow.changedTo === workspaces[3]);
    check('enter: the drop does not close Scale or switch workspace',
        env.Main.overview.hideCalls === 3 && activations.join() === '2,1');
}

// The wheel keeps switching with Scale open.
function testWheelKeepsScaleOpen() {
    const env = setUp();
    const { workspaces, activations, manager } = setUpWorkspaces(4);
    const extension = env.loadExtension();
    extension.enable();
    openScale(env);
    env.Main.modalCount = 1;
    const scroll = { type: () => env.Clutter.EventType.SCROLL, get_scroll_direction: () => env.Clutter.ScrollDirection.DOWN };
    const stopped = global.stage.emit('captured-event', scroll);
    check('enter: the wheel switches to the next workspace', stopped && activations.join() === '1' && manager.active === workspaces[1]);
    check('enter: the wheel does not close Scale', env.Main.overview.hideCalls === 0 && env.Main.overview.visible);
    extension.disable();
}

// Live stage coordinates carry float noise (thumbnails at x 412.000122 and the like).
const FLOAT_TOLERANCE = 0.01;
const THUMBNAIL_WIDTH = 230.4;
const THUMBNAIL_SPACING = 16;
// Where the fake strips start their row, from the left edge of their screen.
const ROW_LEFT = 412.000122;

function near(a, b) {
    return Math.abs(a - b) < FLOAT_TOLERANCE;
}

// The [x, width] of 4 thumbnails of a row, with live-like float noise.
function noisySpans(left = ROW_LEFT) {
    return [0, 1, 2, 3].map(i => [left + i * (THUMBNAIL_WIDTH + THUMBNAIL_SPACING) + (i % 2 ? -0.00009 : 0.00012),
        THUMBNAIL_WIDTH + (i % 2 ? 0.0000001 : -0.00001)]);
}

// Owner's choice "Insertion bar": where a dragged thumbnail lands, from the pointer.
function testReorderIndex() {
    const env = setUp();
    const { findInsertionSlot, getReorderIndex, getInsertionBarX } = env.require('./workspaceStrip');
    const spans = noisySpans();
    const middle = ([x, width]) => x + width / 2;

    check('reorder: left of the first thumbnail is slot 0', findInsertionSlot(ROW_LEFT - 5, spans) === 0);
    check('reorder: right of the last thumbnail is slot 4', findInsertionSlot(1600, spans) === 4);
    check('reorder: right half of thumbnail 3 is slot 3', findInsertionSlot(middle(spans[2]) + 1, spans) === 3);
    check('reorder: left half of thumbnail 3 is slot 2', findInsertionSlot(middle(spans[2]) - 1, spans) === 2);

    check('reorder: workspace 2 dropped after workspace 3 gets index 2 (position 3)', getReorderIndex(1, 3) === 2);
    check('reorder: workspace 2 dropped after the last gets the last index', getReorderIndex(1, 4) === 3);
    check('reorder: workspace 3 dropped before the first gets index 0', getReorderIndex(2, 0) === 0);
    check('reorder: workspace 4 dropped between 1 and 2 gets index 1', getReorderIndex(3, 1) === 1);
    check('reorder: the gap just before its own thumbnail changes nothing', getReorderIndex(1, 1) === null);
    check('reorder: the gap just after its own thumbnail changes nothing', getReorderIndex(1, 2) === null);
    check('reorder: the first workspace dropped before itself changes nothing', getReorderIndex(0, 0) === null);

    const noise = [-0.0002, -0.0000001, 0, 0.0000001, 0.0002];
    check('reorder: a drop on its own thumbnail\'s middle, with float noise, changes nothing',
        [0, 1, 2, 3].every(source => noise.every(delta =>
            getReorderIndex(source, findInsertionSlot(middle(spans[source]) + delta, spans)) === null)));
    check('reorder: a drop anywhere on its own thumbnail changes nothing',
        [spans[1][0] + 0.5, middle(spans[1]), spans[1][0] + spans[1][1] - 0.5].every(x =>
            getReorderIndex(1, findInsertionSlot(x, spans)) === null));

    const gapMiddle = spans[0][0] + THUMBNAIL_WIDTH + THUMBNAIL_SPACING / 2;
    check('reorder: the bar is in the middle of the gap between two thumbnails', near(getInsertionBarX(1, spans), gapMiddle));
    check('reorder: before the first thumbnail, the bar is half a gap left of it',
        near(getInsertionBarX(0, spans), ROW_LEFT - THUMBNAIL_SPACING / 2));
    check('reorder: after the last thumbnail, the bar is half a gap right of it',
        near(getInsertionBarX(4, spans), spans[3][0] + spans[3][1] + THUMBNAIL_SPACING / 2));
    const single = [[ROW_LEFT, THUMBNAIL_WIDTH]];
    check('reorder: one thumbnail: the bar sits on its edges',
        near(getInsertionBarX(0, single), ROW_LEFT) && near(getInsertionBarX(1, single), ROW_LEFT + THUMBNAIL_WIDTH));
}

// SignalManager of imports.misc: connects through the object's own connect().
class FakeSignalManager {
    constructor() {
        this._connections = [];
    }

    connect(object, name, callback, scope) {
        this._connections.push([object, object.connect(name, (emitter, ...args) => callback.call(scope, emitter, ...args))]);
    }

    disconnectAllSignals() {
        for (const [object, id] of this._connections)
            object.disconnect(id);
        this._connections = [];
    }
}

// Workspaces A to D, B active, that muffin can reorder: index() follows the list, and
// reorder_workspace emits 'workspaces-reordered' as muffin does, with no workspace switch.
function setUpReorderableWorkspaces() {
    const { workspaces, activations, manager } = setUpWorkspaces(4);
    const order = [];
    workspaces.forEach((workspace, i) => {
        Object.assign(workspace, new FakeSignals(), { name: 'ABCD'[i], index: () => order.indexOf(workspace) });
        Object.setPrototypeOf(workspace, FakeSignals.prototype);
        order.push(workspace);
    });
    const signals = new FakeSignals();
    const reorders = [];
    Object.assign(manager, {
        active: workspaces[1],
        get_workspace_by_index: index => order[index],
        get_active_workspace_index: () => order.indexOf(manager.active),
        connect: (...args) => signals.connect(...args),
        disconnect: id => signals.disconnect(id),
        reorder_workspace(workspace, index) {
            reorders.push([workspace.name, index]);
            order.splice(order.indexOf(workspace), 1);
            order.splice(index, 0, workspace);
            signals.emit('workspaces-reordered');
        },
    });
    global.display = new FakeSignals();
    global.window_manager = new FakeSignals();
    return { workspaces, activations, manager, order, reorders };
}

// Scale's big view, its workspaces in the order of their indexes at opening.
function fakeBigView(env, order) {
    const view = {
        actor: env.Main.overview.workspacesView.actor,
        _animatingScroll: false,
        layouts: [],
        _updateWorkspaceActors(animate) {
            view.layouts.push({ animate, names: view._workspaces.map(workspace => workspace.metaWorkspace.name).join('') });
        },
    };
    view._workspaces = order.map(metaWorkspace => ({
        metaWorkspace,
        _monitors: env.monitors.map(() => ({ _windows: [], _margin: 0, setGeometry() {}, positionWindows() {}, _updateEmptyPlaceholder() {} })),
    }));
    let scrollValue = global.workspace_manager.get_active_workspace_index();
    view.scrollSets = [];
    view._scrollAdjustment = {
        get value() {
            return scrollValue;
        },
        set value(value) {
            view.scrollSets.push({ value, guarded: view._animatingScroll,
                stopped: env.tweenRemovals.includes(view._scrollAdjustment) });
            scrollValue = value;
        },
    };
    env.Main.overview.workspacesView = view;
    return view;
}

// What the real layout gives: each strip's thumbnails in a row with spacing, float noise.
function layOutRow(strip, monitor) {
    noisySpans(monitor.x + ROW_LEFT).forEach(([x, width], i) => {
        Object.assign(strip._thumbnails[i].actor, { x, y: 12.0001, width, height: 129.6 });
    });
}

// The stage x of the gap before thumbnail @slot of a laid-out strip, as the strip's own x.
function gapX(strip, slot) {
    const [x, width] = noisySpans(strip.actor.x + ROW_LEFT)[Math.min(slot, 3)];
    return (slot > 3 ? x + width + THUMBNAIL_SPACING / 2 : x - THUMBNAIL_SPACING / 2) - strip.actor.x;
}

// dnd's search for a target (dnd.js _updateDragHover, _dragActorDropped): from the actor
// picked under the pointer at stage @stageX, up its parents, the first delegate whose
// handleDragOver answers MOVE_DROP, or whose acceptDrop takes @source. Coordinates are
// given local to each actor, as transform_stage_point does.
function findDropTarget(picked, stageX, takes) {
    for (let actor = picked; actor; actor = actor.parent) {
        const [actorX] = actor.get_transformed_position();
        if (actor._delegate && takes(actor._delegate, stageX - actorX))
            return actor;
    }
    return null;
}

function dragOverAt(picked, source, stageX) {
    return findDropTarget(picked, stageX, (delegate, x) =>
        Boolean(delegate.handleDragOver) && delegate.handleDragOver(source, null, x, 0) === 1);
}

function dropAt(picked, source, stageX) {
    return findDropTarget(picked, stageX, (delegate, x) =>
        Boolean(delegate.acceptDrop) && delegate.acceptDrop(source, null, x, 0));
}

function stripState(strip) {
    return strip._thumbnails.map(thumbnail => `${thumbnail.metaWorkspace.name}:${thumbnail._label.text}`).join(' ');
}

function isShownActive(thumbnail) {
    return (thumbnail.actor.pseudo_classes || []).includes('selected');
}

// Owner's choice "Insertion bar": dragging a thumbnail moves its workspace, with its
// windows, to the slot marked by a bar; the overview stays open on the same workspace.
// The window drag shares its draggable with the thumbnails (uiHelpers.makeDraggable): same
// opacities and drag picture as before the sharing.
function testWindowDragUnchanged() {
    const env = setUp();
    global.get_pointer = () => [500, 350];
    const windowDrag = env.require('./windowDrag');
    const windowClone = Object.assign(new env.WindowClone(), { actor: new FakeActor({ x: 100, y: 50, width: 800, height: 600 }) });
    windowDrag.makeDraggable(windowClone);
    const draggable = windowClone._draggable;
    check('window drag: the picture is shown at 80 % opacity', draggable.params.dragActorOpacity === Math.round(255 * 0.8));
    draggable.emit('drag-begin');
    check('window drag: the window left in Scale is at 40 % while dragged', windowClone.actor.opacity === Math.round(255 * 0.4));
    draggable.emit('drag-end');
    check('window drag: opaque again after the drag', windowClone.actor.opacity === 255);
    draggable.emit('drag-begin');
    windowClone.actor.destroy();
    draggable.emit('drag-end');
    check('window drag: a window destroyed by the drop is left alone', windowClone.actor.opacity === Math.round(255 * 0.4));

    const picture = windowClone.getDragActor();
    const scale = 1080 * 0.12 * 0.9 / 800;
    check('window drag: the picture is a clone at the window\'s place, shrunk around the pointer',
        picture instanceof env.Clutter.Clone && picture.source === windowClone.actor && picture.x === 100 &&
        picture.width === 800 && near(picture.scale_x, scale) && near(picture.pivot[0], 0.5) && near(picture.pivot[1], 0.5));
    check('window drag: the picture snaps back to the window', windowClone.getDragActorSource() === windowClone.actor);
}

// Release audit M4: a throw in the extension's own step of a wrapped Scale method lost
// Scale's result and could leave Scale's input grab held; a Cinnamon without the method
// broke enable(). The original always runs and its result is returned, the failure is
// logged; a missing original leaves the prototype as it was.
function testPrototypeWrappersFailSafe() {
    const env = setUp();
    const logs = [];
    global.logError = message => logs.push(message);
    global.get_pointer = () => [0, 0];
    class WorkspaceMonitor {}
    const scaleClone = new env.WindowClone();
    WorkspaceMonitor.prototype._addWindowClone = () => scaleClone;
    env.imports.ui.workspace.WorkspaceMonitor = WorkspaceMonitor;
    env.Main.overview.workspacesView._workspaces = [];
    const windowDrag = env.require('./windowDrag');
    windowDrag.enable();
    const added = new WorkspaceMonitor()._addWindowClone(null);
    check(`wrappers: a failing drag setup still returns Scale's clone, and logs (${logs})`,
        added === scaleClone && logs.length === 1 && logs[0].startsWith('[scale-wheel-switch] window drag: making a window draggable failed: '));
    windowDrag.disable();

    logs.length = 0;
    const windowClick = env.require('./windowClick');
    windowClick.enable();
    let reads = 0;
    const flakyEvent = {
        get_button: () => {
            reads++;
            if (reads === 1)
                throw new Error('no button');
            return BUTTON.PRIMARY;
        },
    };
    const clickResult = new env.WindowClone()._onButtonRelease(null, flakyEvent);
    check(`wrappers: a failing button read still gives Scale the click and its result, and logs (${logs})`,
        clickResult === env.Clutter.EVENT_STOP && env.buttonReleases.join() === `${BUTTON.PRIMARY}`
        && logs.length === 1 && logs[0] === '[scale-wheel-switch] window click: reading the button failed: Error: no button');
    windowClick.disable();

    logs.length = 0;
    const extension = env.loadExtension();
    extension.enable();
    openScale(env);
    const brokenKey = { get_key_unicode: () => { throw new Error('no key'); }, get_key_symbol: () => 0 };
    const keyResult = typeKey(env, brokenKey);
    check(`wrappers: a failing search with an empty field still gives Scale the key and its result, and logs (${logs})`,
        keyResult === false && env.keyPresses.length === 1 && env.keyPresses[0] === brokenKey
        && logs.length === 1 && logs[0] === '[scale-wheel-switch] search: handling a key failed: Error: no key');
    extension.disable();

    // A Cinnamon without the three methods: nothing patched, one log each, disable() clean.
    const bare = setUp();
    const bareLogs = [];
    global.logError = message => bareLogs.push(message);
    class BareMonitor {}
    bare.imports.ui.workspace.WorkspaceMonitor = BareMonitor;
    delete bare.WindowClone.prototype._onButtonRelease;
    delete bare.Workspace.prototype._onKeyPress;
    const modules = ['./windowDrag', './windowClick', './appSearch'].map(name => bare.require(name));
    const enabled = modules.every(module => !throws(() => module.enable()));
    const untouched = !('_addWindowClone' in BareMonitor.prototype) && !('_onButtonRelease' in bare.WindowClone.prototype)
        && !('_onKeyPress' in bare.Workspace.prototype);
    check(`wrappers: a missing original leaves the prototype untouched and logs once each (${bareLogs})`,
        enabled && untouched && bareLogs.length === 3
        && bareLogs.every(message => message.includes('not a function')));
    const disabled = modules.every(module => !throws(() => module.disable()));
    check('wrappers: disable() after a skipped patch leaves the prototypes untouched',
        disabled && !('_addWindowClone' in BareMonitor.prototype) && !('_onButtonRelease' in bare.WindowClone.prototype)
        && !('_onKeyPress' in bare.Workspace.prototype));
}

// PR #67 review: a failing search with text in the field gave the key to Scale, which could
// open a window hidden by the search; a clone half made draggable stayed draggable after
// disable().
function testWrapperFailuresStayContained() {
    const env = setUp();
    const logs = [];
    global.logError = message => logs.push(message);
    const extension = env.loadExtension();
    extension.enable();
    openScale(env);
    typeKey(env, keyEvent('f'));
    const brokenKey = { get_key_unicode: () => 'x', get_key_symbol: () => { throw new Error('no key'); } };
    const result = typeKey(env, brokenKey);
    check(`wrappers: a failing search with text keeps the key from Scale, and logs (${logs})`,
        result === true && env.keyPresses.length === 0
        && logs.length === 1 && logs[0] === '[scale-wheel-switch] search: handling a key failed: Error: no key');
    extension.disable();

    const dragEnv = setUp();
    global.logError = () => {};
    global.get_pointer = () => [0, 0];
    // dnd's Draggable keeps the ids of its two handlers on the actor, as Cinnamon's does.
    dragEnv.imports.ui.dnd.makeDraggable = (actor, params) => {
        const draggable = new FakeSignals();
        draggable.params = params;
        draggable.buttonPressEventId = actor.connect('button-press-event', () => false);
        draggable.destroyEventId = actor.connect('destroy', () => {});
        return draggable;
    };
    const actor = new FakeActor({ width: 800, height: 600 });
    const connect = actor.connect.bind(actor);
    let destroyConnections = 0;
    actor.connect = (name, callback) => {
        if (name === 'destroy' && ++destroyConnections === 2)
            throw new Error('cannot connect');
        return connect(name, callback);
    };
    const windowClone = Object.assign(new dragEnv.WindowClone(), { actor });
    const windowDrag = dragEnv.require('./windowDrag');
    const thrown = throws(() => windowDrag.makeDraggable(windowClone));
    check('wrappers: a drag setup failing half way undoes the draggable at once',
        thrown && !('_draggable' in windowClone) && !('getDragActor' in windowClone)
        && !('getDragActorSource' in windowClone) && actor._handlers.size === 0);
    check('wrappers: disable() after a half-made draggable throws nothing', !throws(() => windowDrag.disable()));
}

function testThumbnailDragReordersWorkspaces() {
    const env = setUp(2, 0);
    env.imports.misc.signalManager.SignalManager = FakeSignalManager;
    const { workspaces, activations, manager, order, reorders } = setUpReorderableWorkspaces();
    const view = fakeBigView(env, order);
    env.Main.overview.visible = true;
    const stripModule = env.require('./workspaceStrip');
    const strips = [0, 1].map(index => new stripModule.WorkspaceStrip(index));
    strips.forEach((strip, index) => layOutRow(strip, env.monitors[index]));
    const bars = strips.map(strip => strip._insertionBar);
    // The stylesheet's bar width, which the strip centres on the gap.
    bars.forEach(bar => (bar.naturalWidth = 4));
    const group = env.Main.overview._group;
    const [first, second] = strips;

    const source = first._thumbnails[1];
    check('drag: a press on a thumbnail reaches dnd (the click handler does not stop it first)',
        (clickActor(source.actor), source._draggable.pressesSeen === 1));
    env.Main.overview.visible = true;
    env.Main.overview.hideCalls = 0;
    activations.length = 0;
    check('drag: the copy that follows the pointer is half transparent',
        source._draggable.params.dragActorOpacity === Math.round(255 * 0.5));
    const dragActor = source.getDragActor();
    check('drag: the copy is a clone of the thumbnail at its place and size',
        dragActor instanceof env.Clutter.Clone && dragActor.source === source.actor && near(dragActor.x, source.actor.x) &&
        near(dragActor.width, source.actor.width) && source.getDragActorSource() === source.actor);
    source.actor.emit('button-press-event', buttonEvent(BUTTON.PRIMARY));
    source._draggable.emit('drag-begin');
    check('drag: the dragged thumbnail\'s slot stays empty (transparent, still in the row)',
        source.actor.opacity === 0 && first._row.children.includes(source.actor));

    check('drag: the bars are never picked, so a drop over one reaches the strip',
        bars.every(bar => bar.hiddenFromPick && bar.visible === false));
    const overGap = first.handleDragOver(source, null, gapX(first, 3));
    check('drag: over the gap between workspaces 3 and 4, the strip takes the drop', overGap === 1);
    const barMiddle = env.monitors[0].x + ROW_LEFT + 3 * (THUMBNAIL_WIDTH + THUMBNAIL_SPACING) - THUMBNAIL_SPACING / 2;
    check('drag: the bar shows in that gap, as high as the thumbnails',
        bars[0].visible && Math.abs(bars[0].x + 2 - barMiddle) <= 0.5 && near(bars[0].height, 129.6));
    check('wiring: each bar is in Scale\'s group, right above its strip',
        bars.every((bar, i) => bar.parent === group &&
            group.children.indexOf(bar) === group.children.indexOf(strips[i].actor) + 1));
    first.handleDragOut();
    // Over the right half of thumbnail 3, dnd picks the thumbnail's label.
    const label3 = first._thumbnails[2]._label;
    const rightHalf3 = first._thumbnails[2].actor.x + THUMBNAIL_WIDTH * 0.75;
    check('wiring: from a thumbnail\'s label, dnd\'s parent walk reaches the strip, which shows the bar',
        dragOverAt(label3, source, rightHalf3) === first.actor && bars[0].visible);
    check('drag: the other screen\'s bar stays hidden', !bars[1].visible);
    check('drag: the bar is the violet insertion bar style', bars[0].style_class === 'scale-strip-insertion-bar');

    check('drag: over its own thumbnail, no bar and no drop',
        first.handleDragOver(source, null, source.actor.x + THUMBNAIL_WIDTH / 2 - first.actor.x) === 0 && !bars[0].visible);
    check('drag: over the gap right before its own thumbnail, no bar', first.handleDragOver(source, null, gapX(first, 1)) === 0 &&
        !bars[0].visible);
    first.handleDragOver(source, null, gapX(first, 3));
    first.handleDragOut();
    check('drag: leaving the strip hides the bar', !bars[0].visible);

    const windowSource = Object.assign(new env.WindowClone(), {
        metaWindow: { is_on_all_workspaces: () => false, get_workspace: () => workspaces[0], get_monitor: () => 0 },
        _draggable: new FakeSignals(),
    });
    check('drag: a window dragged over the strip shows no bar', first.handleDragOver(windowSource, null, gapX(first, 3)) === 0 &&
        !bars[0].visible && !first.acceptDrop(windowSource, null, gapX(first, 3)));
    check('drag: a thumbnail dropped on a thumbnail is never taken as a window',
        first._thumbnails[3].acceptDrop(source) === false && first._thumbnails[3].handleDragOver(source) === 0);

    check('drag: a drop on its own thumbnail is refused (dnd snaps it back) and changes nothing',
        !first.acceptDrop(source, null, source.actor.x + 3 - first.actor.x) && reorders.length === 0);

    dragOverAt(label3, source, rightHalf3);
    const taken = dropAt(label3, source, rightHalf3) === first.actor;
    check('drop: workspace 2 dropped after workspace 3 moves to index 2, once', taken && reorders.length === 1 &&
        reorders[0].join() === 'B,2' && order.map(workspace => workspace.name).join('') === 'ACBD');
    check('drop: every strip is rebuilt in the new order, labels by position',
        strips.every(strip => stripState(strip) === 'A:Workspace 1 C:Workspace 2 B:Workspace 3 D:Workspace 4'));
    check('drop: the dragged thumbnail is replaced (dnd ends on a destroyed source)', source.actor.destroyed);
    check('drop: the bars are hidden', bars.every(bar => !bar.visible));
    check('drop: the active workspace is still B, highlighted at its new place on every strip',
        manager.active === workspaces[1] && strips.every(strip =>
            strip._thumbnails.every(thumbnail => isShownActive(thumbnail) === (thumbnail.metaWorkspace === workspaces[1]))));
    check('drop: Scale stays open, no workspace switch', env.Main.overview.visible && env.Main.overview.hideCalls === 0 &&
        activations.length === 0);
    check('drop: Scale\'s big view is sorted to the new order once, without animation',
        view._workspaces.map(workspace => workspace.metaWorkspace.name).join('') === 'ACBD' &&
        view.layouts.length === 1 && view.layouts[0].animate === false && view.layouts[0].names === 'ACBD');
    check('drop: its scroll follows the active index without switching (guarded as Scale does)',
        view.scrollSets.length === 1 && view.scrollSets[0].value === 2 && view.scrollSets[0].guarded && !view._animatingScroll);
    check('drop: a running scroll animation (wheel switch just before) is stopped before the scroll is set',
        view.scrollSets[0].stopped);
    check('drop: each thumbnail reads its windows at its workspace\'s new index',
        strips.every(strip => strip._thumbnails.every((thumbnail, i) => thumbnail.metaWorkspace.index() === i)));

    strips.forEach((strip, index) => layOutRow(strip, env.monitors[index]));
    const fromFirst = first._thumbnails[3];
    check('drop: a thumbnail dropped on the other screen\'s strip moves too',
        second.acceptDrop(fromFirst, null, gapX(second, 0)) && reorders[1].join() === 'D,0' &&
        stripState(second).startsWith('D:Workspace 1'));

    strips.forEach((strip, index) => layOutRow(strip, env.monitors[index]));
    const cancelled = first._thumbnails[0];
    cancelled.actor.emit('button-press-event', buttonEvent(BUTTON.PRIMARY));
    cancelled._draggable.emit('drag-begin');
    second.handleDragOver(cancelled, null, gapX(second, 3));
    cancelled._draggable.emit('drag-cancelled');
    check('cancel: a drop outside the strips hides the bar at once', bars.every(bar => !bar.visible));
    cancelled._draggable.emit('drag-end');
    check('cancel: the thumbnail is shown again once it is back, nothing moved',
        cancelled.actor.opacity === 255 && reorders.length === 2);
    // dnd keeps the drag's release away from the thumbnail; a later release alone on it
    // (press in a gap, release on the thumbnail) must not complete the drag's press.
    cancelled.actor.emit('button-release-event', buttonEvent(BUTTON.PRIMARY));
    check('cancel: a release on the thumbnail after a finished drag does not enter the workspace',
        activations.length === 0 && env.Main.overview.hideCalls === 0);
    clickActor(cancelled.actor);
    check('cancel: the next short click enters again', activations.length === 1 && env.Main.overview.hideCalls === 1);

    for (const strip of strips)
        strip.destroy();
    check('destroy: the bars go with their strips', bars.every(bar => bar.destroyed));
    manager.reorder_workspace(workspaces[0], 3);
    check('destroy: a reorder after Scale closed rebuilds nothing', stripState(first) === '');
}

function keyStroke(env, symbol, isPress) {
    const type = isPress ? env.Clutter.EventType.KEY_PRESS : env.Clutter.EventType.KEY_RELEASE;
    return { type: () => type, get_key_symbol: () => symbol };
}

function stageHandlerCount() {
    return global.stage._handlers.size;
}

function menuLabels(menu) {
    return menu.items.map(item => item.label).join('|');
}

// Owner's choice "Right click menu", "Close all its windows": the entries for each app state.
function testDockMenuEntries() {
    const env = setUp();
    const { getDockMenuEntries, DockMenuAction } = env.require('./dockMenu');
    const labels = count => getDockMenuEntries(count).map(entry => entry.label).join('|');
    const actions = count => getDockMenuEntries(count).map(entry => entry.action).join('|');

    check('dock menu: an app not running shows only New window', labels(0) === 'New window');
    check('dock menu: one window shows New window, Close', labels(1) === 'New window|Close');
    check('dock menu: three windows show New window, Close 3 windows', labels(3) === 'New window|Close 3 windows');
    check('dock menu: New window comes first, then the close action',
        actions(2) === `${DockMenuAction.NEW_WINDOW}|${DockMenuAction.CLOSE_WINDOWS}` && actions(0) === DockMenuAction.NEW_WINDOW);
}

// The menu sits above the icon, centred on it, inside the dock's monitor. Live stage
// coordinates carry float noise: compared with a tolerance, or after rounding.
function testDockMenuPosition() {
    const env = setUp();
    const { getMenuPosition } = env.require('./dockMenu');
    const monitor = { x: 1920, y: 0, width: 1920, height: 1080 };
    const box = (x1, y1, width, height) => ({ x1, y1, x2: x1 + width, y2: y1 + height });

    const [x, y] = getMenuPosition(box(2812.000122, 1000.00009, 64.0000001, 72), 160.4, 80.2, monitor);
    check('dock menu: centred on the icon', Math.abs(x - (2812 + 32 - 80.2)) <= 1);
    check('dock menu: its bottom edge on the icon\'s top edge', Math.abs(y + 80.2 - 1000) <= 1);
    check('dock menu: whole pixels', Number.isInteger(x) && Number.isInteger(y));

    const [leftX] = getMenuPosition(box(1920.0001, 1000, 64, 72), 200, 80, monitor);
    check('dock menu: kept inside the monitor\'s left edge', leftX === 1920);
    const [rightX] = getMenuPosition(box(3840 - 64.00012, 1000, 64, 72), 200, 80, monitor);
    check('dock menu: kept inside the monitor\'s right edge', near(rightX + 200, 3840));
    const [, topY] = getMenuPosition(box(2500, 40.5, 64, 72), 200, 80, monitor);
    check('dock menu: kept below the monitor\'s top edge', topY === 0);

    const dockMenu = env.require('./dockMenu');
    const icon = new FakeActor({ x: 2812.5, y: 1000.25, width: 64, height: 72 });
    const menu = new dockMenu.DockIconMenu(icon, monitor);
    menu.actor.get_preferred_size = () => [0, 0, 160, 80];
    const [menuX, menuY] = menu._calculatePosition();
    check('dock menu: the popup is attached below, placed above its icon, animated as flipped',
        menu._orientation === env.imports.gi.St.Side.BOTTOM && menuX === 2765 && menuY === 920 && menu.sideFlipped === true);
}

// One menu at a time; it closes on a second right click, Escape, a click outside, close(),
// destroy(); each path gives Scale its grab back; the chosen action runs once the menu is
// gone and the grab released; nothing stays connected.
function testDockMenuLifecycle() {
    const env = setUp();
    const { DockMenu, getDockMenuEntries } = env.require('./dockMenu');
    const SCALE_MODALS = 1;
    env.Main.modalCount = SCALE_MODALS;
    const dockMenu = new DockMenu(env.monitors[0]);
    const iconA = new FakeActor();
    const iconB = new FakeActor();
    const tooltipA = new FakeTooltip(iconA, 'App A');
    const chosen = [];
    let stateAtAction = '';
    const onActivate = action => {
        stateAtAction = `${env.Main.modalCount}|${openMenusOf(env).length}|${env.Main.uiGroup.children.length}`;
        chosen.push(action);
    };
    const baseHandlers = stageHandlerCount();
    const open = (icon, count, tooltip) => {
        dockMenu.toggle(icon, getDockMenuEntries(count), onActivate, tooltip);
        return lastMenuMade();
    };
    const grabReleased = () => env.Main.modalCount === SCALE_MODALS;

    const first = open(iconA, 2, tooltipA);
    check('lifecycle: a right click opens a menu in the ui group, attached below',
        first.isOpen && env.Main.uiGroup.children.includes(first.actor) && first._orientation === env.imports.gi.St.Side.BOTTOM);
    check('lifecycle: the menu takes a grab on top of Scale\'s', env.Main.modalCount === SCALE_MODALS + 1);
    check('lifecycle: its entries', menuLabels(first) === 'New window|Close 2 windows');
    check('lifecycle: the Escape guard is connected while it is open', stageHandlerCount() === baseHandlers + 1);
    check('lifecycle: the icon\'s tooltip is hidden and kept hidden', tooltipA.preventShow && tooltipA.hideCalls === 1);

    const second = open(iconB, 0);
    check('lifecycle: one menu at a time', first.destroyCount === 1 && second.isOpen && openMenusOf(env).length === 1);
    check('lifecycle: the first icon\'s tooltip shows again', !tooltipA.preventShow);
    check('lifecycle: one grab only', env.Main.modalCount === SCALE_MODALS + 1);
    check('lifecycle: not running: only New window', menuLabels(second) === 'New window');

    open(iconB, 0);
    check('lifecycle: a second right click on the same icon closes it',
        second.destroyCount === 1 && openMenusOf(env).length === 0 && stageHandlerCount() === baseHandlers && grabReleased());

    const third = open(iconA, 1);
    third.items[1].activate();
    check('lifecycle: Close runs once, after the menu is destroyed, with the grab released',
        chosen.join() === 'close-windows' && stateAtAction === `${SCALE_MODALS}|0|0` && third.destroyCount === 1);
    check('lifecycle: nothing left connected after a choice', stageHandlerCount() === baseHandlers && grabReleased());

    // Escape: the menu closes on the press; the release must not reach Scale.
    const fourth = open(iconA, 1);
    const pressStopped = global.stage.emit('captured-event', keyStroke(env, ESCAPE_KEY, true));
    fourth.close(true);
    check('lifecycle: Escape\'s press goes to the open menu, which closes and releases its grab',
        !pressStopped && fourth.destroyCount === 1 && grabReleased());
    const repeatStopped = global.stage.emit('captured-event', keyStroke(env, ESCAPE_KEY, true));
    const releaseStopped = global.stage.emit('captured-event', keyStroke(env, ESCAPE_KEY, false));
    check('lifecycle: the rest of that Escape stroke is swallowed, Scale stays open',
        repeatStopped && releaseStopped && env.Main.overview.hideCalls === 0);
    check('lifecycle: the guard is gone after the release', stageHandlerCount() === baseHandlers);
    check('lifecycle: no action on Escape', chosen.join() === 'close-windows');

    // Closed by a click outside: the manager closes the menu; the next keys are Scale's.
    const fifth = open(iconA, 1);
    fifth.close(true);
    check('lifecycle: closed by a click outside, the guard and the grab go at once',
        stageHandlerCount() === baseHandlers && grabReleased() && fifth.destroyCount === 1);

    const sixth = open(iconA, 3);
    dockMenu.close();
    check('lifecycle: close() (a rebuild, Scale hiding) destroys the menu and releases the grab',
        sixth.destroyCount === 1 && openMenusOf(env).length === 0 && grabReleased());

    const seventh = open(iconA, 3, tooltipA);
    dockMenu.destroy();
    check('lifecycle: destroy closes the open menu and destroys it once',
        !seventh.isOpen && seventh.destroyCount === 1 && grabReleased());
    check('lifecycle: destroy leaves nothing connected on the stage, the tooltip free',
        stageHandlerCount() === baseHandlers && !tooltipA.preventShow);
    check('lifecycle: nothing left in the ui group', env.Main.uiGroup.children.length === 0);
    check('lifecycle: every menu destroyed exactly once, every manager gone with it',
        FakePopupMenu.made.every(menu => menu.destroyCount === 1 && menu.manager.destroyed && menu._handlers.size === 0));
}

function openMenusOf(env) {
    return env.Main.uiGroup.children.map(actor => actor.menu).filter(menu => menu && menu.isOpen);
}

function lastMenuMade() {
    return FakePopupMenu.made[FakePopupMenu.made.length - 1];
}

// A window of the fake app on @workspace: delete() records its timestamp.
function fakeAppWindow(workspace, { interesting = true, closable = true, userTime = 0, sticky = false, transientFor = null } = {}) {
    return {
        interesting,
        deletedAt: null,
        get_user_time: () => userTime,
        can_close: () => closable,
        get_workspace: () => workspace,
        is_on_all_workspaces: () => sticky,
        get_transient_for: () => transientFor,
        delete(time) {
            this.deletedAt = time;
        },
    };
}

// Workspaces that emit signals ('window-added'), as muffin's do.
function setUpSignalingWorkspaces(count) {
    const setup = setUpWorkspaces(count);
    for (const workspace of setup.workspaces) {
        Object.assign(workspace, new FakeSignals());
        Object.setPrototypeOf(workspace, FakeSignals.prototype);
    }
    return setup;
}

// The real AppDock with one pinned app on the fake overview. The app's windows are @windows,
// a list the test may change.
function makeDock(env, windows) {
    env.imports.misc.signalManager.SignalManager = FakeSignalManager;
    const appDock = env.require('./appDock');
    const newWindows = [];
    const app = {
        get_windows: () => windows,
        get_name: () => 'Editor',
        is_window_backed: () => false,
        create_icon_texture: () => new FakeActor(),
        open_new_window: workspace => newWindows.push(workspace),
    };
    const dockApps = { pinned: [app], others: [], running: new Set([app]) };
    const dock = new appDock.AppDock(dockApps);
    const iconOf = () => dock._box.children[0];
    return { appDock, app, dock, dockApps, newWindows, iconOf };
}

// The menu through the real dock: Scale hiding, a rebuild and destroy() close it; left and
// middle clicks are unchanged; Close acts on the windows counted at opening, still closable.
function testDockMenuThroughDock() {
    const env = setUp();
    const { workspaces, activations } = setUpSignalingWorkspaces(3);
    global.get_current_time = () => 4242;
    env.Main.modalCount = 1;
    env.Main.overview.visible = true;
    env.Main.activated = null;
    env.Main.activateWindow = (metaWindow, time) => (env.Main.activated = [metaWindow, time]);
    const here = fakeAppWindow(workspaces[0], { userTime: 2 });
    const elsewhere = fakeAppWindow(workspaces[2], { userTime: 5 });
    const hidden = fakeAppWindow(workspaces[1], { interesting: false });
    const stuck = fakeAppWindow(workspaces[1], { closable: false });
    const windows = [here, elsewhere, hidden, stuck];
    const { appDock, app, dock, dockApps, newWindows, iconOf } = makeDock(env, windows);
    const [tooltip] = FakeTooltip.made;

    check('close: the windows counted are the ones Scale shows that can close',
        appDock.getClosableWindows(app).length === 2);

    clickActor(iconOf(), BUTTON.SECONDARY);
    const first = lastMenuMade();
    check('right click: opens the menu with the counted windows', first.isOpen && menuLabels(first) === 'New window|Close 2 windows');
    check('right click: goes to no window and keeps Scale open',
        env.Main.activated === null && activations.length === 0 && env.Main.overview.hideCalls === 0 && newWindows.length === 0);
    check('right click: the app name tooltip stays hidden', tooltip.item === iconOf() && tooltip.preventShow);

    env.Main.overview.emit('hiding');
    check('dock: Scale hiding closes the menu', first.destroyCount === 1 && openMenusOf(env).length === 0 && env.Main.modalCount === 1);
    check('dock: the tooltip shows again once the menu is closed', !tooltip.preventShow);

    clickActor(iconOf(), BUTTON.SECONDARY);
    const second = lastMenuMade();
    dock._buildIcons(dockApps, DEFAULT_ICON_SIZE);
    check('dock: a rebuild of the icons closes the menu', second.destroyCount === 1 && openMenusOf(env).length === 0);

    // Counted at opening: a window opening or closing meanwhile changes nothing but itself.
    clickActor(iconOf(), BUTTON.SECONDARY);
    const third = lastMenuMade();
    const late = fakeAppWindow(workspaces[1], { userTime: 9 });
    windows.push(late);
    windows.splice(windows.indexOf(elsewhere), 1);
    third.items[1].activate();
    check('close: a counted window still open is asked to close', here.deletedAt === 4242);
    check('close: never more than the label: a window opened meanwhile is left alone, one gone is skipped',
        late.deletedAt === null && elsewhere.deletedAt === null);
    check('close: windows Scale does not show, or that cannot close, are left alone',
        hidden.deletedAt === null && stuck.deletedAt === null);
    check('close: Scale stays open on the same workspace',
        env.Main.overview.hideCalls === 0 && activations.length === 0 && global.workspace_manager.active === workspaces[0]);

    clickActor(iconOf(), BUTTON.SECONDARY);
    lastMenuMade().items[0].activate();
    check('new window: same as the middle click, a window on the current workspace, Scale closes',
        newWindows.join() === '-1' && env.Main.overview.hideCalls === 1);

    env.Main.overview.visible = true;
    clickActor(iconOf(), BUTTON.MIDDLE);
    check('middle click: unchanged, a new window, no menu', newWindows.length === 2 && openMenusOf(env).length === 0);
    clickActor(iconOf(), BUTTON.PRIMARY);
    check('left click: unchanged, goes to the most recent window, no menu',
        env.Main.activated[0] === late && activations.join() === '1' && openMenusOf(env).length === 0);

    clickActor(iconOf(), BUTTON.SECONDARY);
    const last = lastMenuMade();
    dock.destroy();
    check('dock: destroy() destroys the open menu once and releases its grab',
        last.destroyCount === 1 && !last.isOpen && env.Main.modalCount === 1);
}

// Owner's choice "Go to the prompt": a window asked to close that opens a prompt attached to
// it ("save changes?") takes the user there, on its workspace, and Scale closes, as stock
// Scale's close does. Any other new window changes nothing.
function testDockClosePrompt() {
    const env = setUp();
    const { workspaces, activations } = setUpSignalingWorkspaces(3);
    env.Main.overview.visible = true;
    env.Main.activated = null;
    env.Main.activateWindow = (metaWindow, time) => {
        env.Main.activated = [metaWindow, time];
        env.Main.overview.hide();
    };
    const unsaved = fakeAppWindow(workspaces[2]);
    const { dock, iconOf } = makeDock(env, [unsaved]);
    const watchers = workspace => workspace._handlers.size;
    const idles = () => [...env.timers.values()].filter(timer => timer.delay === 'idle');
    const chooseClose = () => {
        clickActor(iconOf(), BUTTON.SECONDARY);
        lastMenuMade().items[1].activate();
    };

    chooseClose();
    check('prompt: the closed window\'s workspace is watched', watchers(workspaces[2]) === 1 && unsaved.deletedAt !== null);
    workspaces[2].emit('window-added', fakeAppWindow(workspaces[2]));
    check('prompt: an unrelated new window changes nothing, the watch goes on',
        idles().length === 0 && watchers(workspaces[2]) === 1 && env.Main.overview.hideCalls === 0);
    const prompt = fakeAppWindow(workspaces[2], { transientFor: unsaved });
    workspaces[2].emit('window-added', prompt);
    check('prompt: the prompt stops the watch and is gone to from an idle',
        watchers(workspaces[2]) === 0 && idles().length === 1 && env.Main.activated === null);
    idles()[0].callback();
    check('prompt: Scale switches to its workspace, activates it and closes',
        env.Main.activated[0] === prompt && activations.join() === '2' && env.Main.overview.hideCalls === 1);

    env.Main.overview.visible = true;
    chooseClose();
    env.Main.overview.emit('hiding');
    check('prompt: Scale hiding stops the watch', watchers(workspaces[2]) === 0);

    const sticky = fakeAppWindow(null, { sticky: true });
    const { dock: stickyDock, iconOf: stickyIcon } = makeDock(env, [sticky]);
    clickActor(stickyIcon(), BUTTON.SECONDARY);
    lastMenuMade().items[1].activate();
    check('prompt: a window on every workspace is watched on the active one', watchers(global.workspace_manager.active) === 1);
    stickyDock.destroy();
    check('prompt: destroy() stops the watch', watchers(global.workspace_manager.active) === 0);

    chooseClose();
    workspaces[2].emit('window-added', fakeAppWindow(workspaces[2], { transientFor: unsaved }));
    const pending = idles().length;
    dock.destroy();
    check('prompt: destroy() also drops a prompt waiting for its idle', pending === 1 && idles().length === 0);
}

testPanelChoice();
testPanelCopy();
testPanelFallbacks();
testThumbnailClickEntersWorkspace();
testWheelKeepsScaleOpen();
testSearchBlocksOtherScreens();
testMiddleClickDoesNothing();
testDragHighlightsClearedOnDrop();
testIconSizeAtDisplayScale();
testConstructorFailureDestroys();
testFittingItemWidth();
testReorderIndex();
testThumbnailDragReordersWorkspaces();
testWindowDragUnchanged();
testPrototypeWrappersFailSafe();
testWrapperFailuresStayContained();
testDockMenuEntries();
testDockMenuPosition();
testDockMenuLifecycle();
testDockMenuThroughDock();
testDockClosePrompt();

if (failures > 0) {
    print(`${failures} failure(s)`);
    imports.system.exit(1);
}
print('All Scale tests passed');
