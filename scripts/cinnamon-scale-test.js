// Logic tests of scale-wheel-switch@bgi (Scale overview), run by cinnamon-scale-test.sh.
// Cinnamon's actors, Scale's overview and its window clones are fakes: no running Cinnamon
// is touched. Each block is a regression test of a fixed bug.
// Usage: gjs cinnamon-scale-test.js <extension folder> <calendar@bgi applet folder>
const GLib = imports.gi.GLib;
const ByteArray = imports.byteArray;

const [extensionDir, calendarDir] = ARGV;
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
        ScrollDirection: {},
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

    // The clock's time source and timers: the time is set by the test, timers fire on demand.
    const clockState = { now: GLib.DateTime.new_local(2026, 11, 17, 9, 22, 5), use24h: true, timers: new Map(), nextTimerId: 1 };
    const FakeGLib = { DateTime: { new_now_local: () => clockState.now } };
    const Gio = {
        Settings: class {
            get_boolean(key) {
                return key === 'clock-use-24h' && clockState.use24h;
            }
        },
    };
    const Mainloop = {
        timeout_add(delay, callback) {
            const id = clockState.nextTimerId++;
            clockState.timers.set(id, { delay, callback });
            return id;
        },
        source_remove(id) {
            if (!clockState.timers.delete(id))
                throw new Error(`No source ${id}`);
        },
    };

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
    globalThis.global.overlay_group.add_actor(overview.workspacesView.actor);

    const Main = {
        layoutManager: { monitors, primaryIndex, primaryMonitor: monitors[primaryIndex] },
        overview,
        modalCount: 0,
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
            gi: { Clutter, St, CMenu, Cinnamon, Gio, GLib: FakeGLib, Meta: { MotionDirection: {} } },
            ui: { main: Main, workspace: { Workspace, WindowClone }, workspacesView: { WORKSPACE_SWITCH_TIME: 0.25 } },
            mainloop: Mainloop,
        },
        Clutter, Main, Workspace, WindowClone, monitors, themeContext, keyPresses, buttonReleases, clockState, strips: [],
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

const ALL_MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
// Four years, one of them leap.
const DAYS_2024_TO_2027 = 4 * 365 + 1;
// Months whose full name is no longer than its abbreviation.
const SHORT_MONTH_NAMES = [5];

// The clock row: date as the calendar applet's header, local time after the 24h setting.
function testClockText() {
    const clockText = makeRequire({})('./clockText');
    const at = (year, month, day, hour = 0, minute = 0) =>
        clockText.clockPartsOf(GLib.DateTime.new_local(year, month, day, hour, minute, 0));

    const owner = clockText.formatClock(at(2026, 11, 17, 9, 22), true);
    print(`  2026-11-17 09:22 gives "${owner}"`);
    check('clock: 2026-11-17 09:22 in 24h reads "Tue 17 Nov. 2026   ·   09:22"',
        owner === 'Tue 17 Nov. 2026   ·   09:22');

    const dotted = ALL_MONTHS.every(month => {
        const date = clockText.formatDate(at(2026, month, 1));
        const shortName = SHORT_MONTH_NAMES.includes(month);
        return date.split(' ')[2].endsWith('.') === !shortName;
    });
    check('clock: a dot after every month but May, whose name has three letters', dotted);
    check('clock: "May" keeps its name without a dot', clockText.formatDate(at(2026, 5, 4)) === 'Mon 4 May 2026');
    check('clock: "Jun" and "Jul" take a dot (June, July are longer)',
        clockText.formatDate(at(2026, 6, 1)) === 'Mon 1 Jun. 2026' && clockText.formatDate(at(2026, 7, 1)) === 'Wed 1 Jul. 2026');
    check('clock: a single-digit day is not padded', clockText.formatDate(at(2026, 11, 3)) === 'Tue 3 Nov. 2026');
    check('clock: the year changes at midnight on 31 December',
        clockText.formatDate(at(2026, 12, 31, 23, 59)) === 'Thu 31 Dec. 2026' &&
        clockText.formatDate(at(2027, 1, 1, 0, 0)) === 'Fri 1 Jan. 2027');
    const week = [15, 16, 17, 18, 19, 20, 21].map(day => clockText.formatDate(at(2026, 11, day)).split(' ')[0]);
    check('clock: each weekday, Sunday 15 to Saturday 21 Nov. 2026', week.join() === 'Sun,Mon,Tue,Wed,Thu,Fri,Sat');

    check('clock: 24h pads the hour', clockText.formatTime(at(2026, 11, 17, 9, 5), true) === '09:05');
    check('clock: 24h at midnight and 23:59',
        clockText.formatTime(at(2026, 11, 17, 0, 0), true) === '00:00' &&
        clockText.formatTime(at(2026, 11, 17, 23, 59), true) === '23:59');
    check('clock: 12h morning', clockText.formatTime(at(2026, 11, 17, 9, 22), false) === '9:22 AM');
    check('clock: 12h midnight is 12 AM, noon is 12 PM',
        clockText.formatTime(at(2026, 11, 17, 0, 7), false) === '12:07 AM' &&
        clockText.formatTime(at(2026, 11, 17, 12, 7), false) === '12:07 PM');
    check('clock: 12h afternoon', clockText.formatTime(at(2026, 11, 17, 21, 40), false) === '9:40 PM');
    check('clock: 12h row text', clockText.formatClock(at(2026, 11, 17, 21, 40), false) === 'Tue 17 Nov. 2026   ·   9:40 PM');

    check('clock: next minute from 0 s is 60 s away', clockText.msUntilNextMinute(0, 0) === 60000);
    check('clock: next minute from 59.5 s is 500 ms away', clockText.msUntilNextMinute(59, 500000) === 500);
}

// The row's date must stay the calendar@bgi header date: compared over every day of 2024
// (leap year) to 2027.
function testClockMatchesCalendar() {
    const clockText = makeRequire({})('./clockText');
    const dateText = makeRequire({}, {}, calendarDir)('./dateText');
    const mismatches = [];
    let day = GLib.DateTime.new_local(2024, 1, 1, 12, 0, 0);
    const end = GLib.DateTime.new_local(2028, 1, 1, 12, 0, 0);
    let count = 0;
    while (day.compare(end) < 0) {
        const ours = clockText.formatDate(clockText.clockPartsOf(day));
        const calendar = dateText.headerDateOf(day);
        if (ours !== calendar)
            mismatches.push(`${ours} != ${calendar}`);
        count++;
        day = day.add_days(1);
    }
    print(`  ${count} days compared, first: "${dateText.headerDateOf(GLib.DateTime.new_local(2026, 11, 17, 9, 22, 0))}"`);
    for (const mismatch of mismatches.slice(0, 3))
        print(`  mismatch: ${mismatch}`);
    check('clock: same date as the calendar applet\'s header on every day of 2024 to 2027',
        count === DAYS_2024_TO_2027 && mismatches.length === 0);
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

// Fires the only pending clock timer at @now, as the main loop would.
function fireClockTimer(env, now) {
    const [[id, timer]] = [...env.clockState.timers];
    env.clockState.timers.delete(id);
    env.clockState.now = now;
    return timer.callback();
}

// The clock row: above the search on the primary screen, right at opening, updated at each
// minute change, no timer left once Scale is closed or the extension disabled.
function testClockRow() {
    // Two screens, the second one primary.
    const env = setUp(2, 1);
    const extension = env.loadExtension();
    extension.enable();
    check('clock: no row and no timer before Scale opens', clockBarsOf(env).length === 0 && env.clockState.timers.size === 0);

    openScale(env);
    const bars = clockBarsOf(env);
    const bar = bars[0];
    const label = bar && bar.child;
    const primary = env.monitors[1];
    print(`  row text at 2026-11-17 09:22:05: "${label && label.text}"`);
    check('clock: one row, on the primary screen only', bars.length === 1 && bar.x === primary.x && bar.y === primary.y &&
        bar.width === primary.width);
    check('clock: the row reads "Tue 17 Nov. 2026   ·   09:22" at opening', label.text === 'Tue 17 Nov. 2026   ·   09:22');
    check('clock: the row is below the cover pane, like the search field',
        env.Main.overview._group.children.indexOf(bar) < env.Main.overview._group.children.indexOf(env.Main.overview._coverPane));
    const search = searchBarOf(env);
    check('clock: the search field starts under the row', search.y === primary.y + NATURAL_HEIGHTS['scale-clock-bar']);
    const primaryStrip = env.strips.find(strip => strip.index === 1);
    const otherStrip = env.strips.find(strip => strip.index === 0);
    check('clock: the primary strip starts under the row and the search field',
        primaryStrip.topOffset === NATURAL_HEIGHTS['scale-clock-bar'] + NATURAL_HEIGHTS['scale-search-bar']);
    check('clock: the other screen keeps its strip at the very top', otherStrip.topOffset === 0);
    check('clock: a click on the row is swallowed and does nothing',
        bar.emit('button-press-event', buttonEvent(BUTTON.PRIMARY)) === true &&
        bar.emit('button-release-event', buttonEvent(BUTTON.PRIMARY)) === true);
    check('clock: no key focus on the row', !bar.can_focus && !label.can_focus);

    typeKey(env, keyEvent('f'));
    check('clock: typing still goes to the search', search.child.get_text() === 'f');
    typeKey(env, keyEvent(null, ESCAPE_KEY));

    const [timer] = [...env.clockState.timers.values()];
    check('clock: one timer, due at the next minute (55 s after 09:22:05)',
        env.clockState.timers.size === 1 && timer.delay === 55000);
    const keepsGoing = fireClockTimer(env, GLib.DateTime.new_local(2026, 11, 17, 9, 23, 0));
    check('clock: the minute change updates the row', label.text === 'Tue 17 Nov. 2026   ·   09:23');
    check('clock: the fired timer ends and a new one waits for the next minute',
        keepsGoing === false && env.clockState.timers.size === 1 && [...env.clockState.timers.values()][0].delay === 60000);
    fireClockTimer(env, GLib.DateTime.new_local(2027, 1, 1, 0, 0, 0));
    check('clock: midnight on 31 December changes the date and the year', label.text === 'Fri 1 Jan. 2027   ·   00:00');

    closeScale(env);
    check('clock: closing Scale removes the row and its timer', bar.destroyed && clockBarsOf(env).length === 0 &&
        env.clockState.timers.size === 0);

    env.clockState.use24h = false;
    env.clockState.now = GLib.DateTime.new_local(2026, 11, 17, 21, 40, 0);
    openScale(env);
    check('clock: the 12-hour setting is read at opening', clockBarsOf(env)[0].child.text === 'Tue 17 Nov. 2026   ·   9:40 PM');
    const reopened = clockBarsOf(env)[0];
    extension.disable();
    check('clock: disable() with Scale open removes the row and its timer', reopened.destroyed &&
        env.clockState.timers.size === 0);
}

testClockText();
testClockMatchesCalendar();
testClockRow();
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
