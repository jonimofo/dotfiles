// Logic tests of hotCornerFullscreen.js (scale-wheel-switch@bgi), run by
// cinnamon-hot-corner-test.sh. Cinnamon's layout chrome and HotCornerManager are fakes:
// no running Cinnamon is touched.
// Usage: gjs cinnamon-hot-corner-test.js <extension folder>
const GLib = imports.gi.GLib;
const ByteArray = imports.byteArray;

const [extensionDir] = ARGV;
let failures = 0;

function check(label, condition) {
    print(`${condition ? 'PASS' : 'FAIL'} ${label}`);
    if (!condition)
        failures++;
}

// Cinnamon's chrome: tracked actor params, and how often visibility was recomputed.
const chrome = {
    params: new Map(),
    visibilityUpdates: 0,
    track(actor) {
        this.params.set(actor, { visibleInFullscreen: false });
    },
    modifyActorParams(actor, params) {
        if (!this.params.has(actor))
            throw new Error('could not find actor in chrome');
        Object.assign(this.params.get(actor), params);
    },
    _updateVisibility() {
        this.visibilityUpdates++;
    },
};

// Cinnamon's HotCornerManager: update() destroys the corners and creates new ones.
let nextActorId = 0;
class FakeHotCornerManager {
    constructor() {
        this.corners = {};
        this.updateCalls = 0;
    }

    update() {
        this.updateCalls++;
        this.corners = { 0: { actor: { id: nextActorId++ } }, 1: undefined };
        chrome.track(this.corners[0].actor);
        return 'original result';
    }
}
const originalUpdate = FakeHotCornerManager.prototype.update;

const main = { layoutManager: { _chrome: chrome, hotCornerManager: null } };
const extensionImports = { ui: { main, hotCorner: { HotCornerManager: FakeHotCornerManager } } };

function readText(path) {
    return ByteArray.toString(GLib.file_get_contents(path)[1]);
}

// Cinnamon's require(): every top-level declaration of the file is exported.
function load(name) {
    const source = readText(`${extensionDir}/${name}.js`);
    const names = [...source.matchAll(/^(?:function|const|let|var|class) ([A-Za-z0-9_]+)/gm)].map(m => m[1]);
    return new Function('imports', `${source}\nreturn { ${names.join(', ')} };`)(extensionImports);
}

function visibleInFullscreen(manager) {
    return chrome.params.get(manager.corners[0].actor).visibleInFullscreen;
}

const HotCornerFullscreen = load('hotCornerFullscreen');
const manager = new FakeHotCornerManager();
manager.update();
main.layoutManager.hotCornerManager = manager;

HotCornerFullscreen.enable();
check('enable marks the existing corner visible in fullscreen', visibleInFullscreen(manager) === true);
check('enable recomputes the chrome visibility', chrome.visibilityUpdates === 1);

const result = manager.update();
check('a rebuilt corner is visible in fullscreen too', visibleInFullscreen(manager) === true);
check('the patched update returns the original result', result === 'original result');
check('the patched update runs the original once', manager.updateCalls === 2);

HotCornerFullscreen.enable();
manager.update();
check('a second enable does not wrap update twice', manager.updateCalls === 3);

HotCornerFullscreen.disable();
check('disable restores the original update', FakeHotCornerManager.prototype.update === originalUpdate);
check('disable gives the corner back to stock fullscreen hiding', visibleInFullscreen(manager) === false);

manager.update();
check('after disable a rebuilt corner keeps stock behaviour', visibleInFullscreen(manager) === false);

let secondDisableError = null;
try {
    HotCornerFullscreen.disable();
} catch (e) {
    secondDisableError = e;
}
check('a second disable is a no-op', secondDisableError === null);

main.layoutManager.hotCornerManager = null;
let noManagerError = null;
try {
    HotCornerFullscreen.enable();
    HotCornerFullscreen.disable();
} catch (e) {
    noManagerError = e;
}
check('enable and disable work before the manager exists', noManagerError === null);

if (failures > 0) {
    print(`${failures} failure(s)`);
    imports.system.exit(1);
}
print('All hot corner tests passed');
