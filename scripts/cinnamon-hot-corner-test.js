// Logic tests of hotCornerFullscreen.js (scale-wheel-switch@bgi), run by
// cinnamon-hot-corner-test.sh. Cinnamon's uiGroup, layout chrome and HotCornerManager are
// fakes: no running Cinnamon is touched.
// Usage: gjs cinnamon-hot-corner-test.js <extension folder>
const GLib = imports.gi.GLib;
const ByteArray = imports.byteArray;

const [extensionDir] = ARGV;
let failures = 0;

const loggedErrors = [];
globalThis.global = { logError: message => loggedErrors.push(message) };

function check(label, condition) {
    print(`${condition ? 'PASS' : 'FAIL'} ${label}`);
    if (!condition)
        failures++;
}

function noThrow(action) {
    try {
        action();
        return true;
    } catch (e) {
        return false;
    }
}

// Cinnamon's UiActor: set_skip_paint lives on the prototype, the skipped set on the instance.
class FakeUiGroup {
    constructor() {
        this.skipped = new Set();
        this.setSkipPaintCalls = 0;
    }

    set_skip_paint(child, skip) {
        this.setSkipPaintCalls++;
        if (skip)
            this.skipped.add(child);
        else
            this.skipped.delete(child);
    }

    get_skip_paint(child) {
        return this.skipped.has(child);
    }
}

// layout.js _updateVisibility, both paths reduced to their effect: over a fullscreen
// window, chrome is hidden through Main.uiGroup.set_skip_paint (as Cinnamon calls it).
function makeChrome(main) {
    return {
        tracked: new Set(),
        fullscreen: true,
        broken: false,
        _updateVisibility() {
            if (this.broken)
                throw new Error('_updateVisibility is gone');
            for (const actor of this.tracked)
                main.uiGroup.set_skip_paint(actor, this.fullscreen);
        },
    };
}

// Cinnamon's HotCornerManager: update() destroys the corners and creates new actors.
class FakeHotCornerManager {
    constructor(chrome) {
        this.chrome = chrome;
        this.corners = {};
    }

    update() {
        for (const corner of Object.values(this.corners)) {
            if (corner)
                this.chrome.tracked.delete(corner.actor);
        }
        this.corners = { 0: { actor: { name: 'corner' } }, 1: undefined };
        this.chrome.tracked.add(this.corners[0].actor);
    }
}

function readText(path) {
    return ByteArray.toString(GLib.file_get_contents(path)[1]);
}

// Cinnamon's require(): every top-level declaration of the file is exported.
function load(name, moduleImports) {
    const source = readText(`${extensionDir}/${name}.js`);
    const names = [...source.matchAll(/^(?:function|const|let|var|class) ([A-Za-z0-9_]+)/gm)].map(m => m[1]);
    return new Function('imports', `${source}\nreturn { ${names.join(', ')} };`)(moduleImports);
}

function setUp() {
    const main = { uiGroup: new FakeUiGroup(), layoutManager: {} };
    const chrome = makeChrome(main);
    const manager = new FakeHotCornerManager(chrome);
    manager.update();
    const panel = { name: 'panel' };
    chrome.tracked.add(panel);
    main.layoutManager._chrome = chrome;
    main.layoutManager.hotCornerManager = manager;
    const module = load('hotCornerFullscreen', { ui: { main } });
    return { main, chrome, manager, panel, module };
}

function cornerHidden(env) {
    return env.main.uiGroup.get_skip_paint(env.manager.corners[0].actor);
}

// Normal and modal visibility updates.
let env = setUp();
env.chrome._updateVisibility();
check('stock: the corner is hidden over a fullscreen window', cornerHidden(env));

env.module.enable();
check('enable shows the corner again over a fullscreen window', !cornerHidden(env));
check('other chrome is still hidden over a fullscreen window', env.main.uiGroup.get_skip_paint(env.panel));

env.chrome._updateVisibility();
check('a later visibility update (modal, Scale open) keeps the corner shown', !cornerHidden(env));

env.main.uiGroup.set_skip_paint(env.manager.corners[0].actor, true);
check('a direct hide request on the corner is refused', !cornerHidden(env));

env.manager.update();
env.chrome._updateVisibility();
check('a rebuilt corner (new actor) is protected too', !cornerHidden(env));

env.chrome.fullscreen = false;
env.chrome._updateVisibility();
check('without fullscreen the corner and other chrome are shown',
    !cornerHidden(env) && !env.main.uiGroup.get_skip_paint(env.panel));
env.chrome.fullscreen = true;

const callsBefore = env.main.uiGroup.setSkipPaintCalls;
env.module.enable();
env.main.uiGroup.set_skip_paint(env.panel, true);
check('a second enable does not wrap set_skip_paint twice', env.main.uiGroup.setSkipPaintCalls === callsBefore + 1);

env.module.disable();
check('disable removes the override', !Object.prototype.hasOwnProperty.call(env.main.uiGroup, 'set_skip_paint'));
check('disable gives the corner back to stock fullscreen hiding', cornerHidden(env));
check('a second disable is a no-op', noThrow(() => env.module.disable()));
check('no error was logged on the normal path', loggedErrors.length === 0);

// No hot corner manager yet.
env = setUp();
env.main.layoutManager.hotCornerManager = null;
check('enable and disable work before the manager exists', noThrow(() => {
    env.module.enable();
    env.main.uiGroup.set_skip_paint(env.panel, true);
    env.module.disable();
}));

// Cinnamon internals renamed or broken: log, keep the stock behaviour, never throw.
env = setUp();
env.chrome.broken = true;
loggedErrors.length = 0;
check('a failing enable does not throw (the other modules keep running)', noThrow(() => env.module.enable()));
check('a failing enable logs what failed',
    loggedErrors.length === 1 && loggedErrors[0].includes('enable (stock behaviour kept)') && loggedErrors[0].includes('_updateVisibility is gone'));
check('a failing enable leaves no override', !Object.prototype.hasOwnProperty.call(env.main.uiGroup, 'set_skip_paint'));

env = setUp();
env.module.enable();
Object.defineProperty(env.manager, 'corners', { get: () => { throw new Error('corners is gone'); } });
loggedErrors.length = 0;
const lookupOk = noThrow(() => {
    env.chrome._updateVisibility();
    env.chrome._updateVisibility();
});
check('a failing corner lookup does not throw into Cinnamon', lookupOk);
check('a failing corner lookup lets Cinnamon hide as usual', env.main.uiGroup.get_skip_paint(env.panel));
check('a failing corner lookup is logged once', loggedErrors.length === 1 && loggedErrors[0].includes('finding the hot corners'));

env = setUp();
env.module.enable();
env.chrome.broken = true;
loggedErrors.length = 0;
check('a failing disable does not throw', noThrow(() => env.module.disable()));
check('a failing disable logs what failed', loggedErrors.length === 1 && loggedErrors[0].includes('disable failed'));
check('a failing disable still removes the override', !Object.prototype.hasOwnProperty.call(env.main.uiGroup, 'set_skip_paint'));

if (failures > 0) {
    print(`${failures} failure(s)`);
    imports.system.exit(1);
}
print('All hot corner tests passed');
