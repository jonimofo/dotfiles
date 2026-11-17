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

    emit(name, ...args) {
        for (const { name: handlerName, callback } of [...this._handlers.values()]) {
            if (handlerName === name && callback(this, ...args) === true)
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

    add_style_pseudo_class() {}

    remove_style_pseudo_class() {}
}

// Only Clutter.Actor makes this kind: the search's click blockers.
class FakeClutterActor extends FakeActor {}

// Clutter.Clone: the overview's copy of the panel clock.
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
        EventType: { SCROLL: 1 },
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
        Side: { LEFT: 0, RIGHT: 1 },
        ThemeContext: { get_for_stage: () => themeContext },
    };
    const CMenu = { TreeItemType: { INVALID: 0, DIRECTORY: 1, ENTRY: 2 } };
    const emptyMenu = { iter: () => ({ next: () => CMenu.TreeItemType.INVALID }) };
    const Cinnamon = {
        AppSystem: { get_default: () => ({ get_tree: () => ({ get_root_directory: () => emptyMenu }) }) },
        get_event_state: () => 0,
    };

    const Mainloop = {};

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
        overview,
        modalCount: 0,
        getWorkspaceName: index => `Workspace ${index + 1}`,
        // Running applets by uuid: the panel clock the overview copies.
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
                dnd: { DragMotionResult: { CONTINUE: 0, MOVE_DROP: 1 } },
            },
            misc: { signalManager: { SignalManager: class {} }, windowUtils: {} },
            mainloop: Mainloop,
        },
        Clutter, Main, Workspace, WindowClone, monitors, themeContext, keyPresses, buttonReleases, strips: [],
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

// The owner's top panel on a 1920x1080 primary screen: 40 px high, the clock in the centre.
const TOP_PANEL = { x: 0, y: 0, width: 1920, height: 40 };
const CLOCK_ON_TOP_PANEL = { x: 830.5, y: 6, width: 259, height: 28 };

// A running panel clock: its applet actor and its panel's actor at the given stage boxes.
function panelClock(clockBox, panelBox) {
    return { actor: new FakeActor(clockBox), panel: { actor: new FakeActor(panelBox) } };
}

// Owner's choice "Même position et même texte": with the clock on the primary screen's top
// panel, the copy sits on its pixels; anywhere else it is centred in a band.
function testClockPlacement() {
    const env = setUp();
    const { placeAtPanel, chooseClock } = env.require('./overviewClock');
    const monitor = env.monitors[0];

    const place = placeAtPanel(CLOCK_ON_TOP_PANEL, TOP_PANEL, monitor);
    print(`  top panel: ${JSON.stringify(place)}`);
    check('place: on the top panel, the copy takes the clock\'s position and the band the panel\'s height',
        place && place.x === 830.5 && place.y === 6 && place.bandHeight === 40);
    check('place: float noise in the stage coordinates still counts as the top edge',
        JSON.stringify(placeAtPanel(
            { x: 815, y: 0.0001220703125, width: 290, height: 29.9998779296875 },
            { x: 0.00011444091796875, y: 0.0001220703125, width: 1919.999755859375, height: 29.9998779296875 },
            { x: 0, y: 0, width: 1920, height: 1200 })) ===
        JSON.stringify({ x: 815, y: 0, bandHeight: 30 }));
    const second = { x: 1920, y: 0, width: 1920, height: 1080 };
    check('place: a top panel of a screen right of the primary, offsets stay relative to its screen',
        JSON.stringify(placeAtPanel({ ...CLOCK_ON_TOP_PANEL, x: 2750.5 }, { ...TOP_PANEL, x: 1920 }, second)) ===
        JSON.stringify({ x: 830.5, y: 6, bandHeight: 40 }));
    check('place: a bottom panel gives no place (centred band)',
        placeAtPanel({ ...CLOCK_ON_TOP_PANEL, y: 1046 }, { ...TOP_PANEL, y: 1040 }, monitor) === null);
    check('place: a top panel of another screen gives no place',
        placeAtPanel({ ...CLOCK_ON_TOP_PANEL, x: 2750.5 }, { ...TOP_PANEL, x: 1920 }, monitor) === null);
    check('place: a panel hidden by autohide (moved above the screen) gives no place',
        placeAtPanel({ ...CLOCK_ON_TOP_PANEL, y: -34 }, { ...TOP_PANEL, y: -40 }, monitor) === null);
    check('place: a clock outside its panel\'s box gives no place',
        placeAtPanel({ ...CLOCK_ON_TOP_PANEL, y: 30 }, TOP_PANEL, monitor) === null);

    const bottom = { clockBox: { ...CLOCK_ON_TOP_PANEL, y: 1046 }, panelBox: { ...TOP_PANEL, y: 1040 } };
    const top = { clockBox: CLOCK_ON_TOP_PANEL, panelBox: TOP_PANEL };
    check('place: the clock on the top panel wins over one listed before it', chooseClock([bottom, top], monitor).clock === top);
    const fallback = chooseClock([bottom], monitor);
    check('place: a clock elsewhere only is used, centred', fallback.clock === bottom && fallback.place === null);
    check('place: no clock, nothing chosen', chooseClock([], monitor) === null);
}

// The copy at the panel clock's place: created on opening, removed on closing and on
// disable(); the search and the strip follow the band's height; clicks go nowhere.
function testClockAtPanel() {
    const env = setUp(2, 0);
    const extension = env.loadExtension();
    extension.enable();
    const source = panelClock(CLOCK_ON_TOP_PANEL, TOP_PANEL);
    env.Main.AppletManager.instances['calendar@bgi'] = [source];

    openScale(env);
    const [band] = clockBarsOf(env);
    const copies = global.overlay_group.children.filter(actor => actor instanceof env.Clutter.Clone);
    const copy = copies[0];
    check('clock: one copy of the panel clock, a live clone of the applet\'s actor',
        copies.length === 1 && copy.source === source.actor);
    check('clock: the copy sits on the panel clock\'s pixels, at its size',
        copy.x === 830.5 && copy.y === 6 && copy.width === 259 && copy.height === 28);
    check('clock: the copy is above Scale\'s group, so it does not fade with it',
        global.overlay_group.children.indexOf(copy) > global.overlay_group.children.indexOf(env.Main.overview._group));
    check('clock: the band behind it is the panel\'s height on the primary screen',
        band && band.x === 0 && band.y === 0 && band.width === 1920 && band.height === 40);
    check('clock: the search field starts under the band', searchBarOf(env).y === 40);
    check('clock: the primary strip follows the band and the search',
        env.strips.find(strip => strip.index === 0).topOffset === 40 + NATURAL_HEIGHTS['scale-search-bar']);
    check('clock: the other screen keeps its strip at the very top', env.strips.find(strip => strip.index === 1).topOffset === 0);
    check('clock: the copy takes no click (no calendar opens)', !copy.reactive);
    check('clock: a click on the band is swallowed',
        band.emit('button-press-event', buttonEvent(BUTTON.PRIMARY)) === true &&
        band.emit('button-release-event', buttonEvent(BUTTON.PRIMARY)) === true);
    typeKey(env, keyEvent('f'));
    check('clock: typing still goes to the search', searchBarOf(env).child.get_text() === 'f');
    typeKey(env, keyEvent(null, ESCAPE_KEY));

    closeScale(env);
    check('clock: closing Scale removes the copy and the band', copy.destroyed && band.destroyed &&
        clockBarsOf(env).length === 0 && !global.overlay_group.children.includes(copy));

    source.actor.x = 900;
    openScale(env);
    const moved = global.overlay_group.children.find(actor => actor instanceof env.Clutter.Clone);
    check('clock: the place is read again at each opening', moved.x === 900);
    extension.disable();
    check('clock: disable() with Scale open removes the copy and the band', moved.destroyed && clockBarsOf(env).length === 0);
}

// The clock off the primary screen's top panel: the copy centred in a band; no clock: no band.
function testClockFallbacks() {
    const env = setUp();
    const extension = env.loadExtension();
    extension.enable();
    const bottomClock = panelClock({ ...CLOCK_ON_TOP_PANEL, y: 1046 }, { ...TOP_PANEL, y: 1040 });
    env.Main.AppletManager.instances['calendar@cinnamon.org'] = [bottomClock];

    openScale(env);
    const [band] = clockBarsOf(env);
    check('fallback: a bottom panel clock is copied centred in a band (stock calendar used)',
        band && band.child instanceof env.Clutter.Clone && band.child.source === bottomClock.actor &&
        band.child.x_align === env.Clutter.ActorAlign.CENTER && band.style_classes.includes('scale-clock-bar-centred'));
    check('fallback: the search field starts under the centred band', searchBarOf(env).y === NATURAL_HEIGHTS['scale-clock-bar']);
    check('fallback: no copy above Scale\'s group', !global.overlay_group.children.some(actor => actor instanceof env.Clutter.Clone));
    closeScale(env);
    check('fallback: closing Scale removes the band and its copy', band.destroyed && band.child.destroyed);

    env.Main.AppletManager.instances = {};
    openScale(env);
    check('fallback: no panel clock, no band, the search field at the top',
        clockBarsOf(env).length === 0 && searchBarOf(env).y === 0);
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

testClockPlacement();
testClockAtPanel();
testClockFallbacks();
testThumbnailClickEntersWorkspace();
testWheelKeepsScaleOpen();
testSearchBlocksOtherScreens();
testMiddleClickDoesNothing();
testDragHighlightsClearedOnDrop();
testIconSizeAtDisplayScale();
testConstructorFailureDestroys();
testFittingItemWidth();

if (failures > 0) {
    print(`${failures} failure(s)`);
    imports.system.exit(1);
}
print('All Scale tests passed');
