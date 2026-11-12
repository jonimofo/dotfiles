// Logic tests of the quick-settings@bgi applet modules, run by cinnamon-quick-settings-test.sh.
// Dark style runs on the memory GSettings backend; Wi-Fi reads the real NetworkManager state
// and never writes it (the D-Bus write is intercepted); brightness runs against fake ddcutil
// and laptop backends fed with captured ddcutil output; NordVPN runs against a fake client
// fed with captured output; list building, the one-open-list rule and the BlueZ and VPN
// models run on plain data. No real setting is changed.
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

const [appletDir, fixturesRoot] = ARGV;
const fixturesDir = `${fixturesRoot}/ddcutil`;
const nordvpnFixtures = `${fixturesRoot}/nordvpn`;
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

// Commands the applet would start (settings pages): recorded, never run.
const spawned = [];
// GJS's imports, plus the Cinnamon modules the applet files import at load time.
const appletImports = new Proxy({}, {
    get: (target, name) => (name === 'misc' ? { util: { spawn: argv => spawned.push(argv) } } : imports[name]),
});

// Cinnamon's require(): every top-level declaration of the file is exported.
const modules = {};
function load(name) {
    const file = `${name.replace('./', '')}.js`;
    if (!modules[file]) {
        const source = readText(`${appletDir}/${file}`);
        const names = [...source.matchAll(/^(?:function|const|let|var|class) ([A-Za-z0-9_]+)/gm)].map(m => m[1]);
        modules[file] = new Function('require', 'imports', `${source}\nreturn { ${names.join(', ')} };`)(load, appletImports);
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
            const device = nm.get_devices().find(candidate => candidate instanceof imports.gi.NM.DeviceWifi);
            const stateBefore = device ? device.get_state() : null;
            // Regression: NM.Device.disconnect() shadows GObject's and takes the device offline.
            wifi.destroy();
            check('wifi: destroy leaves the Wi-Fi device as it was', !device || device.get_state() === stateBefore);
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

function testWifiNetworks() {
    const WifiNetworks = load('./wifiNetworks');
    const accessPoints = [
        { ssid: 'Cafe', strength: 30, secure: false },
        { ssid: 'HomeBox', strength: 60, secure: true },
        { ssid: 'HomeBox', strength: 90, secure: true },
        { ssid: null, strength: 99, secure: true },
        { ssid: 'Office-5G', strength: 70, secure: true },
    ];
    const list = WifiNetworks.buildNetworkList(accessPoints, 'Cafe', 8);
    check(`wifi list: deduped, hidden left out, strongest first (${list.map(n => n.ssid)})`,
        `${list.map(n => n.ssid)}` === 'HomeBox,Office-5G,Cafe');
    check('wifi list: one SSID keeps its strongest access point', list[0].strength === 90);
    check('wifi list: the active network is marked', list.filter(n => n.active).map(n => n.ssid).join() === 'Cafe');
    const many = Array.from({ length: 12 }, (_, i) => ({ ssid: `Net${i}`, strength: 100 - i, secure: false }));
    const capped = WifiNetworks.buildNetworkList(many, 'Net11', 8);
    check(`wifi list: capped at 8, the active one kept (${capped.map(n => n.ssid)})`,
        capped.length === 8 && capped[7].ssid === 'Net11' && capped[7].active);
    check('wifi list: signal icons use the stock thresholds',
        WifiNetworks.signalIconName(81) === 'network-wireless-signal-excellent-symbolic'
        && WifiNetworks.signalIconName(56) === 'network-wireless-signal-good-symbolic'
        && WifiNetworks.signalIconName(31) === 'network-wireless-signal-ok-symbolic'
        && WifiNetworks.signalIconName(6) === 'network-wireless-signal-weak-symbolic'
        && WifiNetworks.signalIconName(0) === 'network-wireless-signal-none-symbolic');
}

function testListHost() {
    const ListHost = load('./listHost');
    const view = { shown: [], hidden: 0, updated: 0 };
    view.show = (spec, anchor) => view.shown.push(`${spec.title}@${anchor}`);
    view.hide = () => view.hidden++;
    view.update = () => view.updated++;
    const expanded = {};
    const opened = [];
    const host = new ListHost.ListHost(view);
    for (const key of ['wifi', 'bluetooth']) {
        host.register(key, {
            anchor: `${key}-row`,
            build: () => ({ title: key, items: [], settings: null }),
            onExpanded: value => {
                expanded[key] = value;
            },
            onOpen: () => opened.push(key),
        });
    }
    host.toggle('wifi');
    check('lists: opening shows the list under its row and flips the arrow',
        `${view.shown}` === 'wifi@wifi-row' && expanded.wifi === true && `${opened}` === 'wifi');
    host.toggle('bluetooth');
    check('lists: opening another closes the first',
        host.openKey === 'bluetooth' && expanded.wifi === false && expanded.bluetooth === true && view.hidden === 1);
    host.refresh('wifi');
    check('lists: a closed list is not redrawn', view.updated === 0);
    host.refresh('bluetooth');
    check('lists: the open list is redrawn on change', view.updated === 1);
    host.toggle('bluetooth');
    check('lists: a second click closes it', host.openKey === null && expanded.bluetooth === false && view.hidden === 2);
    host.toggle('wifi');
    host.close();
    check('lists: closing the menu closes the list', host.openKey === null && expanded.wifi === false);
}

function testListSpecs() {
    const ListSpecs = load('./listSpecs');
    const calls = [];
    const nordvpn = ListSpecs.nordvpnSpec({ connected: true, country: 'United States' },
        [{ name: 'France', label: 'France' }, { name: 'United_States', label: 'United States' }],
        { connectTo: country => calls.push(country) });
    check('nordvpn list: quick connect first, connected country marked, no settings entry',
        nordvpn.items[0].label === 'Quick connect' && nordvpn.items[2].active && !nordvpn.items[1].active
        && nordvpn.settings === null);
    nordvpn.items[0].onActivate();
    nordvpn.items[2].onActivate();
    check(`nordvpn list: entries connect by CLI name (${calls})`, `${calls}` === ',United_States');

    const bluetooth = ListSpecs.bluetoothSpec({ powered: false, devices: [{ name: 'X' }] }, {});
    check('bluetooth list: no devices while the adapter is off', bluetooth.items.length === 0
        && bluetooth.settings.label === 'Bluetooth settings...');
    const devices = ListSpecs.deviceSpec('output', [{ id: 1, label: 'Speaker', active: true }, { id: 2, label: 'HDMI', active: false }],
        { selectDevice: id => calls.push(`device ${id}`), openSettings: () => calls.push('sound settings') });
    devices.items[1].onActivate();
    devices.settings.onActivate();
    check('device list: active marked, click selects, last entry opens sound settings',
        devices.items[0].active && calls.includes('device 2') && calls.includes('sound settings')
        && devices.settings.label === 'Sound settings...');
}

function testBluetoothModel() {
    const Model = load('./bluetoothModel');
    const adapter = '/org/bluez/hci0';
    const devices = [
        { path: 'b', adapter, name: 'WH-1000XM5', icon: 'audio-headset', paired: true, connected: false },
        { path: 'a', adapter, name: 'Speaker', icon: 'audio-card', paired: true, connected: true },
        { path: 'c', adapter, name: 'Stranger', icon: null, paired: false, connected: false },
    ];
    const on = Model.summarize([{ path: adapter, powered: true }], devices);
    check(`bluetooth: paired devices only, connected first (${on.devices.map(d => d.name)})`,
        `${on.devices.map(d => d.name)}` === 'Speaker,WH-1000XM5');
    check('bluetooth: one connected device names the tile', Model.tileLabel(on, 'Bluetooth') === 'Speaker');
    check('bluetooth: panel icon active while a device is connected', Model.panelIconName(on) === 'bluetooth-active-symbolic');
    const idle = Model.summarize([{ path: adapter, powered: true }], devices.map(d => ({ ...d, connected: false })));
    check('bluetooth: no connection keeps the label and the idle icon',
        Model.tileLabel(idle, 'Bluetooth') === 'Bluetooth' && Model.panelIconName(idle) === 'bluetooth-symbolic');
    const off = Model.summarize([{ path: adapter, powered: false }], devices);
    check('bluetooth: adapter off hides the panel icon', Model.panelIconName(off) === null && Model.tileLabel(off, 'Bluetooth') === 'Bluetooth');
    check('bluetooth: no adapter means unavailable', Model.summarize([], devices).available === false);
}

function testVpnModel() {
    const Model = load('./vpnModel');
    const seb = { uuid: 'u1', id: 'SEB', type: 'vpn', iface: null, timestamp: 0 };
    const wifi = { uuid: 'u2', id: 'HomeBox', type: '802-11-wireless', iface: null, timestamp: 9 };
    const nordlynx = { uuid: 'u3', id: 'nordlynx', type: 'wireguard', iface: 'nordlynx', timestamp: 9 };
    const today = Model.summarize([seb, wifi, nordlynx], []);
    check(`vpn: only VPN profiles, NordVPN's own left out (${today.profiles.map(p => p.id)})`,
        `${today.profiles.map(p => p.id)}` === 'SEB');
    check('vpn: a single profile names the tile "VPN SEB" and is the toggle target',
        today.label === 'VPN SEB' && today.target.id === 'SEB' && today.active === null);
    const work = { uuid: 'u4', id: 'Work', type: 'wireguard', iface: 'wg0', timestamp: 5 };
    const two = Model.summarize([seb, work], []);
    check('vpn: several profiles, none up: "VPN", last used is the target', two.label === 'VPN' && two.target.id === 'Work');
    const up = Model.summarize([seb, work], ['u1']);
    check('vpn: the active profile names the tile and is marked',
        up.label === 'VPN SEB' && up.target.id === 'SEB' && up.profiles.find(p => p.id === 'SEB').active);
    check('vpn: no profile means unavailable', Model.summarize([wifi], []).available === false);
}

function testNordvpnParser() {
    const Parser = load('./nordvpnParser');
    const off = Parser.parseStatus(readText(`${nordvpnFixtures}/status-disconnected.txt`), 'Connected');
    check('nordvpn: captured "Status: Disconnected" reads as off', !off.connected && off.country === null);
    const on = Parser.parseStatus(readText(`${nordvpnFixtures}/status-connected-constructed.txt`), 'Connected');
    check('nordvpn: connected status gives the country', on.connected && on.country === 'United States');
    const countries = Parser.parseCountries(readText(`${nordvpnFixtures}/countries.txt`));
    check(`nordvpn: captured country list parses (${countries.length} countries)`, countries.length === 150
        && countries[0].name === 'Afghanistan'
        && countries.some(c => c.name === 'United_States' && c.label === 'United States'));
}

async function testNordvpn() {
    const Nordvpn = load('./nordvpn');
    errors = [];
    const calls = [];
    let status = readText(`${nordvpnFixtures}/status-disconnected.txt`);
    const run = argv => {
        calls.push(argv.slice(1).join(' '));
        if (argv[1] === 'status')
            return Promise.resolve(status);
        if (argv[1] === 'connect') {
            status = readText(`${nordvpnFixtures}/status-connected-constructed.txt`);
            return Promise.resolve('');
        }
        if (argv[1] === 'disconnect') {
            status = readText(`${nordvpnFixtures}/status-disconnected.txt`);
            return Promise.resolve('');
        }
        return Promise.resolve(readText(`${nordvpnFixtures}/countries.txt`));
    };
    let changes = 0;
    const nordvpn = new Nordvpn.Nordvpn(run, () => changes++);
    await nordvpn.refresh();
    check('nordvpn: status read, available, off', nordvpn.available && !nordvpn.status.connected);
    await nordvpn.toggle();
    check(`nordvpn: toggle connects, then reads the status again (${calls})`,
        `${calls}` === 'status,connect,status' && nordvpn.connectedCountry === 'United States');
    await nordvpn.toggle();
    check('nordvpn: toggle while connected disconnects', calls[3] === 'disconnect' && !nordvpn.status.connected);
    calls.length = 0;
    await nordvpn.connectTo('France');
    check('nordvpn: a country entry runs "connect France"', calls[0] === 'connect France');
    const callsBeforeWait = calls.length;
    await wait(SCROLL_DELAY_MS * 3);
    check('nordvpn: nothing runs in the background', calls.length === callsBeforeWait);

    const missing = new Nordvpn.Nordvpn(() => Promise.reject(new Error('nordvpn: not found')), () => {});
    await missing.refresh();
    await missing.refresh();
    check('nordvpn: missing client means unavailable, logged once', !missing.available && errors.length === 1);
    errors = [];
}

async function main() {
    await testDarkStyle();
    await testWifi();
    testVolumeMapping();
    testDdcutilParser();
    await testReleaseCommit();
    await testBrightness();
    testWifiNetworks();
    testListHost();
    testListSpecs();
    testBluetoothModel();
    testVpnModel();
    testNordvpnParser();
    await testNordvpn();
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
