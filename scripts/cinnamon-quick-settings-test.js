// Logic tests of the quick-settings@bgi applet modules, run by cinnamon-quick-settings-test.sh.
// Dark style runs on the memory GSettings backend; Wi-Fi reads the real NetworkManager state
// and never writes it (the D-Bus write is intercepted); brightness runs against fake ddcutil
// and laptop backends fed with captured ddcutil output. No real setting is changed.
// Usage: GSETTINGS_BACKEND=memory gjs cinnamon-quick-settings-test.js <applet folder> <fixtures folder>
const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const ByteArray = imports.byteArray;
const Signals = imports.signals;

// Without the memory backend the Dark style tests would write the user's real setting.
if (GLib.getenv('GSETTINGS_BACKEND') !== 'memory') {
    printerr('Refusing to run: set GSETTINGS_BACKEND=memory');
    imports.system.exit(2);
}

const [appletDir, fixturesDir] = ARGV;
const SCROLL_DELAY_MS = 30;
const VOLUME_NORM = 65536;
let failures = 0;
let errors = [];
globalThis.global = {
    logError: (...args) => errors.push(args.join(' ')),
    log: () => {},
};

function readText(path) {
    return ByteArray.toString(GLib.file_get_contents(path)[1]);
}

// Cinnamon's require(): every top-level declaration of the file is exported.
const modules = {};
function load(name) {
    const file = `${name.replace('./', '')}.js`;
    if (!modules[file]) {
        const source = readText(`${appletDir}/${file}`);
        const names = [...source.matchAll(/^(?:function|const|let|var|class) ([A-Za-z0-9_]+)/gm)].map(m => m[1]);
        modules[file] = new Function('require', `${source}\nreturn { ${names.join(', ')} };`)(load);
    }
    return modules[file];
}

function check(label, condition) {
    print(`${condition ? 'PASS' : 'FAIL'} ${label}`);
    if (!condition)
        failures++;
}

function wait(ms) {
    return new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
        resolve();
        return GLib.SOURCE_REMOVE;
    }));
}

// The signals and value of imports.ui.slider.Slider, without an actor.
class FakeSlider {
    constructor() {
        this.value = 0;
    }

    move(value) {
        this.value = value;
        this.emit('value-changed', value);
    }
}
Signals.addSignalMethods(FakeSlider.prototype);

async function testDarkStyle() {
    const Dark = load('./darkStyleState');
    const settings = new Gio.Settings({ schema_id: 'org.x.apps.portal' });
    settings.set_string('color-scheme', 'prefer-dark');
    let changes = 0;
    const dark = new Dark.DarkStyleState(() => changes++);
    check('dark: prefer-dark reads as on', dark.enabled === true);
    dark.toggle();
    check('dark: toggle off writes default', settings.get_string('color-scheme') === 'default' && !dark.enabled);
    dark.toggle();
    check('dark: toggle on writes prefer-dark', settings.get_string('color-scheme') === 'prefer-dark');
    settings.set_string('color-scheme', 'prefer-light');
    check('dark: prefer-light reads as off', dark.enabled === false);
    dark.toggle();
    check('dark: toggle from prefer-light writes prefer-dark', settings.get_string('color-scheme') === 'prefer-dark');
    await wait(0);
    check(`dark: external changes notify (${changes} changes seen)`, changes >= 4);
    dark.destroy();
}

function testWifi() {
    const Wifi = load('./wifiState');
    return new Promise(resolve => {
        let calls = 0;
        const wifi = new Wifi.WifiState(() => {
            if (++calls > 1)
                return;
            const nm = imports.gi.NM.Client.new(null);
            check('wifi: enabled matches NetworkManager', wifi.enabled === (nm.wireless_enabled && nm.wireless_hardware_enabled));
            let target = null;
            wifi._setWirelessEnabled = value => {
                target = value;
            };
            wifi.toggle();
            check(`wifi: toggle asks for ${!nm.wireless_enabled}`, target === !nm.wireless_enabled);
            wifi.destroy();
            resolve();
        });
    });
}

function testVolumeMapping() {
    const Mapping = load('./volumeMapping');
    const amplified = VOLUME_NORM * 1.5;
    check('volume: muted shows 0', Mapping.sliderValue(VOLUME_NORM, true, VOLUME_NORM) === 0);
    check('volume: 100% of norm shows at the end', Mapping.sliderValue(VOLUME_NORM, false, VOLUME_NORM) === 1);
    check('volume: amplified max puts 100% at two thirds',
        Math.abs(Mapping.sliderValue(VOLUME_NORM, false, amplified) - 2 / 3) < 1e-9);
    const zero = Mapping.streamVolume(0.001, VOLUME_NORM, VOLUME_NORM);
    check('volume: near 0 mutes at volume 0', zero.muted && zero.volume === 0);
    const half = Mapping.streamVolume(0.5, VOLUME_NORM, VOLUME_NORM);
    check('volume: 0.5 sets half of norm, unmuted', !half.muted && half.volume === VOLUME_NORM / 2);
    check('volume: near 100% snaps to 100%', Mapping.streamVolume(0.99, VOLUME_NORM, VOLUME_NORM).volume === VOLUME_NORM);
    check('volume: amplified 0.67 snaps to 100%', Mapping.streamVolume(0.67, VOLUME_NORM, amplified).volume === VOLUME_NORM);
    check('volume: icons', Mapping.outputIconName(0) === 'audio-volume-muted-symbolic'
        && Mapping.outputIconName(0.2) === 'audio-volume-low-symbolic'
        && Mapping.outputIconName(0.5) === 'audio-volume-medium-symbolic'
        && Mapping.outputIconName(1) === 'audio-volume-high-symbolic');
}

function testDdcutilParser() {
    const Parser = load('./ddcutilParser');
    const buses = Parser.parseDetectBuses(readText(`${fixturesDir}/detect-terse.txt`));
    check(`ddcutil: detect finds buses 18 and 19, skips the laptop panel (${buses})`, `${buses}` === '18,19');
    const vcp = Parser.parseVcpBrief(readText(`${fixturesDir}/getvcp-brief.txt`));
    check('ddcutil: getvcp brief reads 100 of 100', vcp !== null && vcp.current === 100 && vcp.max === 100);
    check('ddcutil: no monitor gives null', Parser.parseVcpBrief(readText(`${fixturesDir}/getvcp-no-monitor.txt`)) === null);
}

async function testReleaseCommit() {
    const ReleaseCommit = load('./releaseCommit');
    const slider = new FakeSlider();
    const commits = [];
    const commit = new ReleaseCommit.ReleaseCommit(slider, SCROLL_DELAY_MS, value => commits.push(value));

    slider.emit('drag-begin');
    slider.move(0.2);
    slider.move(0.4);
    slider.move(0.6);
    await wait(SCROLL_DELAY_MS * 2);
    check('release: nothing sent while dragging', commits.length === 0);
    slider.emit('drag-end');
    check('release: one value sent at drag end, the last one', `${commits}` === '0.6');

    commits.length = 0;
    slider.move(0.65);
    slider.move(0.7);
    check('release: a scroll sends nothing at once', commits.length === 0);
    await wait(SCROLL_DELAY_MS * 3);
    check('release: a scroll sends its last value once it stops', `${commits}` === '0.7');

    commits.length = 0;
    slider.move(0.8);
    slider.emit('drag-end');
    await wait(SCROLL_DELAY_MS * 3);
    check('release: an arrow key sends once, at once', `${commits}` === '0.8');
    commit.destroy();
}

// A ddcutil stand-in: answers from the fixtures and records every write.
function fakeDdcutil({ failBus = null } = {}) {
    const writes = [];
    const run = argv => {
        const args = argv.slice(1).join(' ');
        if (args === 'detect --terse')
            return Promise.resolve(readText(`${fixturesDir}/detect-terse.txt`));
        if (/^--bus \d+ getvcp 10 --brief$/.test(args))
            return Promise.resolve('VCP 10 C 50 100\n');
        const write = args.match(/^--bus (\d+) setvcp 10 (\d+)$/);
        if (write) {
            writes.push(`${write[1]}=${write[2]}`);
            if (Number(write[1]) === failBus)
                return Promise.reject(new Error('DDC communication failed'));
            return Promise.resolve('');
        }
        return Promise.reject(new Error(`unexpected ddcutil call: ${args}`));
    };
    return { run, writes };
}

function makeBrightness(ddcRun, screen) {
    const DdcBrightness = load('./ddcBrightness');
    const Brightness = load('./brightness');
    const shown = [];
    const availability = [];
    const brightness = new Brightness.Brightness({
        ddc: new DdcBrightness.DdcBrightness(ddcRun),
        screen,
        onValue: value => shown.push(value),
        onAvailable: available => availability.push(available),
    });
    return { brightness, shown, availability };
}

async function testBrightness() {
    errors = [];
    const ddc = fakeDdcutil();
    const { brightness, shown, availability } = makeBrightness(ddc.run, null);
    await brightness.detect();
    check('brightness: DDC monitors make the row available', `${availability}` === 'true');
    check('brightness: shows the first monitor value', `${shown}` === '0.5');
    await brightness.set(0.8);
    check(`brightness: both monitors set to 80 (${ddc.writes})`, `${ddc.writes}` === '18=80,19=80');
    check('brightness: no error on success', errors.length === 0);

    const failing = fakeDdcutil({ failBus: 19 });
    const failed = makeBrightness(failing.run, null);
    await failed.brightness.detect();
    await failed.brightness.set(0.3);
    check('brightness: failure logged with the bus and the value',
        errors.length === 1 && errors[0].includes('bus 19, value 30'));
    check(`brightness: failure puts the slider back to the last value (${failed.shown})`, `${failed.shown}` === '0.5,0.5');
    errors = [];

    const noDdc = () => Promise.resolve('No displays found.\n');
    const screenWrites = [];
    const screen = {
        read: () => Promise.resolve(0.3),
        write: value => {
            screenWrites.push(value);
            return Promise.resolve();
        },
    };
    const laptop = makeBrightness(noDdc, screen);
    await laptop.brightness.detect();
    await laptop.brightness.set(0.6);
    check('brightness: no DDC monitor falls back to the laptop panel',
        `${laptop.availability}` === 'true' && `${laptop.shown}` === '0.3' && `${screenWrites}` === '0.6');

    const noScreen = { read: () => Promise.reject(new Error('backlight not supported')) };
    const none = makeBrightness(noDdc, noScreen);
    await none.brightness.detect();
    check('brightness: neither backend dims the row', `${none.availability}` === 'false' && none.shown.length === 0);
    check('no logged error', errors.length === 0);
}

async function main() {
    await testDarkStyle();
    await testWifi();
    testVolumeMapping();
    testDdcutilParser();
    await testReleaseCommit();
    await testBrightness();
}

const loop = GLib.MainLoop.new(null, false);
main().catch(e => {
    print(`FAIL unexpected error: ${e}\n${e.stack}`);
    failures++;
}).finally(() => loop.quit());
loop.run();
if (failures > 0) {
    print(`${failures} failure(s)`);
    imports.system.exit(1);
}
print('ok: all tests passed');
