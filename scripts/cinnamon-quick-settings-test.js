// Logic tests of the quick-settings@bgi applet modules, run by cinnamon-quick-settings-test.sh.
// Dark style runs on the memory GSettings backend; Wi-Fi runs on fake NetworkManager objects
// (no test touches the real NetworkManager); brightness runs against fake ddcutil
// and laptop backends fed with captured ddcutil output; NordVPN runs against a fake client
// fed with captured output; list building, the one-open-list rule and the BlueZ and VPN
// models run on plain data; Night Light and Do Not Disturb run on the memory GSettings backend.
// No real setting is changed.
// Usage: GSETTINGS_BACKEND=memory gjs cinnamon-quick-settings-test.js <applet folder> <fixtures folder>
const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const GObject = imports.gi.GObject;
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
const powerFixtures = `${fixturesRoot}/power`;
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

// NetworkManager stand-ins. Like NM.Device, they define their own disconnect(), which on a
// real device takes it offline: the applet must only ever remove its handlers with
// GObject.signal_handler_disconnect(). Each fake records any call to its disconnect().
const FakeNmDevice = GObject.registerClass({
    Signals: { 'access-point-added': {}, 'access-point-removed': {} },
}, class FakeNmDevice extends GObject.Object {
    _init() {
        super._init();
        this.disconnectCalls = 0;
    }

    disconnect() {
        this.disconnectCalls++;
    }

    get_device_type() {
        return imports.gi.NM.DeviceType.WIFI;
    }

    get_active_access_point() {
        return null;
    }

    get_access_points() {
        return [];
    }
});

const FakeNmClient = GObject.registerClass({
    Signals: {
        'device-added': {}, 'device-removed': {},
        'connection-added': {}, 'connection-removed': {},
        'active-connection-added': {}, 'active-connection-removed': {},
    },
}, class FakeNmClient extends GObject.Object {
    _init(device) {
        super._init();
        this.device = device;
        this.wireless_enabled = true;
        this.wireless_hardware_enabled = true;
        this.disconnectCalls = 0;
        this.writes = [];
    }

    disconnect() {
        this.disconnectCalls++;
    }

    get_devices() {
        return [this.device];
    }

    dbus_set_property(path, iface, property, value, timeout, cancellable, callback) {
        this.writes.push(`${property}=${value.unpack()}`);
        callback(this, null);
    }

    dbus_set_property_finish() {
        return true;
    }
});

function testWifi() {
    const Wifi = load('./wifiState');
    const device = new FakeNmDevice();
    const client = new FakeNmClient(device);
    let changes = 0;
    const wifi = new Wifi.WifiState(() => changes++, (cancellable, onReady) => onReady(client, null));
    check('wifi: on while both switches are on', wifi.enabled && changes > 0);
    wifi.toggle();
    check(`wifi: toggle writes WirelessEnabled=false through D-Bus (${client.writes})`, `${client.writes}` === 'WirelessEnabled=false');
    const deviceIds = [...wifi._deviceSignalIds];
    const clientIds = [...wifi._clientSignalIds];
    wifi.destroy();
    // Regression: NM.Device.disconnect() shadows GObject's and takes the device offline.
    check('wifi: destroy never calls the device\'s or the client\'s own disconnect()',
        device.disconnectCalls === 0 && client.disconnectCalls === 0);
    check(`wifi: destroy removes its ${deviceIds.length} device and ${clientIds.length} client handlers`,
        deviceIds.length === 4 && clientIds.length === 4
        && deviceIds.every(id => !GObject.signal_handler_is_connected(device, id))
        && clientIds.every(id => !GObject.signal_handler_is_connected(client, id)));
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
    const drag = new ReleaseCommit.DragTracker(slider);
    const commit = new ReleaseCommit.ReleaseCommit(slider, drag, SCROLL_DELAY_MS, value => commits.push(value));

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
    check('release: a scrolled value waits as pending, so a value read meanwhile is not shown', commit.pending);
    await wait(SCROLL_DELAY_MS * 3);
    check('release: a scroll sends its last value once it stops', `${commits}` === '0.7' && !commit.pending);

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
            anchor: () => `${key}-row`,
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
        { path: 'b', adapter, name: 'Headset', icon: 'audio-headset', paired: true, connected: false },
        { path: 'a', adapter, name: 'Speaker', icon: 'audio-card', paired: true, connected: true },
        { path: 'c', adapter, name: 'Stranger', icon: null, paired: false, connected: false },
    ];
    const on = Model.summarize([{ path: adapter, powered: true }], devices);
    check(`bluetooth: paired devices only, connected first (${on.devices.map(d => d.name)})`,
        `${on.devices.map(d => d.name)}` === 'Speaker,Headset');
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
    const office = { uuid: 'u1', id: 'Office', type: 'vpn', iface: null, timestamp: 0 };
    const wifi = { uuid: 'u2', id: 'HomeBox', type: '802-11-wireless', iface: null, timestamp: 9 };
    const nordlynx = { uuid: 'u3', id: 'nordlynx', type: 'wireguard', iface: 'nordlynx', timestamp: 9 };
    const today = Model.summarize([office, wifi, nordlynx], []);
    check(`vpn: only VPN profiles, NordVPN's own left out (${today.profiles.map(p => p.id)})`,
        `${today.profiles.map(p => p.id)}` === 'Office');
    check('vpn: a single profile names the tile "VPN Office" and is the toggle target',
        today.label === 'VPN Office' && today.target.id === 'Office' && today.active === null);
    const work = { uuid: 'u4', id: 'Work', type: 'wireguard', iface: 'wg0', timestamp: 5 };
    const two = Model.summarize([office, work], []);
    check('vpn: several profiles, none up: "VPN", last used is the target', two.label === 'VPN' && two.target.id === 'Work');
    const up = Model.summarize([office, work], ['u1']);
    check('vpn: the active profile names the tile and is marked',
        up.label === 'VPN Office' && up.target.id === 'Office' && up.profiles.find(p => p.id === 'Office').active);
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

function testPowerProfileModel() {
    const Model = load('./powerProfileModel');
    const all = ['power-saver', 'balanced', 'performance'];
    check('power: from balanced, the first click goes to power saver', Model.toggleTarget('balanced', null, all) === 'power-saver');
    check('power: from balanced, back to the last other profile', Model.toggleTarget('balanced', 'performance', all) === 'performance');
    check('power: from any other profile, back to balanced',
        Model.toggleTarget('performance', 'performance', all) === 'balanced' && Model.toggleTarget('power-saver', null, all) === 'balanced');
    check('power: no power saver offered, no target', Model.toggleTarget('balanced', null, ['balanced', 'performance']) === null);
    check('power: labels are the stock names, without a prefix',
        Model.label('power-saver') === 'Power Saver' && Model.label('balanced') === 'Balanced' && Model.label('performance') === 'Performance');
    check('power: highlighted only when not balanced', !Model.isHighlighted('balanced') && Model.isHighlighted('power-saver'));
    const ListSpecs = load('./listSpecs');
    const picked = [];
    const spec = ListSpecs.powerProfileSpec(all, 'balanced', { select: p => picked.push(p), openSettings: () => picked.push('settings') });
    spec.items[2].onActivate();
    spec.settings.onActivate();
    check('power list: daemon order, active marked, click selects, last entry opens power settings',
        `${spec.items.map(i => i.label)}` === 'Power Saver,Balanced,Performance' && spec.items[1].active
        && `${picked}` === 'performance,settings' && spec.settings.label === 'Power settings...');
}

async function testBooleanSettings() {
    const BooleanSetting = load('./booleanSetting');
    const color = new Gio.Settings({ schema_id: 'org.cinnamon.settings-daemon.plugins.color' });
    const notifications = new Gio.Settings({ schema_id: 'org.cinnamon.desktop.notifications' });
    color.set_boolean('night-light-enabled', true);
    notifications.set_boolean('display-notifications', true);
    let changes = 0;
    const night = new BooleanSetting.BooleanSetting('org.cinnamon.settings-daemon.plugins.color', 'night-light-enabled', false, () => changes++);
    const dnd = new BooleanSetting.BooleanSetting('org.cinnamon.desktop.notifications', 'display-notifications', true, () => changes++);
    check('night light: on while the key is true', night.enabled);
    night.toggle();
    check('night light: toggle writes false', !color.get_boolean('night-light-enabled') && !night.enabled);
    check('do not disturb: off while notifications are shown', !dnd.enabled);
    dnd.toggle();
    check('do not disturb: toggle turns notifications off', !notifications.get_boolean('display-notifications') && dnd.enabled);
    notifications.set_boolean('display-notifications', true);
    check('do not disturb: follows a change made elsewhere', !dnd.enabled);
    await wait(0);
    check(`settings tiles: every change notifies (${changes})`, changes >= 3);
    night.destroy();
    dnd.destroy();
}

function testBatteryModel() {
    const Model = load('./batteryModel');
    const kinds = { battery: 2, unknownState: 0 };
    const text = readText(`${powerFixtures}/get-devices.txt`);
    const devices = GLib.Variant.parse(new GLib.VariantType('(a(sssusduut))'), text, null, null).deepUnpack()[0];
    const battery = Model.pickBattery(devices, null, kinds);
    check(`battery: captured devices give the laptop battery (${battery && battery.percent}%)`,
        battery !== null && battery.percent === 100 && battery.iconString.includes('battery-level-100-charged-symbolic'));
    check('battery: no battery hides the figure', Model.pickBattery(devices.filter(d => d[3] !== 2), null, kinds) === null);
    check('battery: label', Model.label(87) === '87%');
}

function testMicMute() {
    const Volume = load('./volume');
    const values = [];
    const stream = { volume: 30000, is_muted: false, connect: () => 1, disconnect: () => {} };
    stream.change_is_muted = muted => {
        stream.is_muted = muted;
    };
    const input = new Volume.StreamVolume((available, value) => values.push([available, value]));
    input.setLimits(VOLUME_NORM, VOLUME_NORM);
    input.toggleMute();
    check('mic mute: no source, nothing to mute', input.available === false && input.muted === false);
    input.setStream(stream);
    input.toggleMute();
    input.notify();
    check('mic mute: mutes the default source, the Microphone row then shows 0',
        stream.is_muted && input.muted && values[values.length - 1][1] === 0);
    input.toggleMute();
    check('mic mute: a second click unmutes', !stream.is_muted);
    input.destroy();
}

function testSchemaMatchesDeclarations() {
    // Lets the test read the schema generator's functions without it printing.
    globalThis.QUICK_SETTINGS_SCHEMA_AS_MODULE = true;
    const generatorPath = `${GLib.path_get_dirname(fixturesRoot)}/cinnamon-quick-settings-schema.js`;
    const generator = new Function(`${readText(generatorPath)}\nreturn { schemaText, buildSchema, loadConstants };`)();
    const committed = readText(`${appletDir}/settings-schema.json`);
    check('settings dialog: settings-schema.json equals the one generated from constants.js',
        committed === generator.schemaText(appletDir));
    const schema = JSON.parse(committed);
    const Constants = load('./constants');
    const tabs = schema.layout.pages.map(page => schema.layout[page].title);
    check(`settings dialog: four tabs (${tabs})`, `${tabs}` === 'Tiles,Sliders,Header,Panel');
    const groups = [
        ['tiles', Constants.TILES], ['sliders', Constants.SLIDERS], ['header', Constants.HEADER_ITEMS], ['panel-icons', Constants.PANEL_ICON_ITEMS],
    ];
    for (const [key, declared] of groups) {
        check(`settings dialog: ${key} defaults are every element shown, in declaration order`,
            JSON.stringify(schema[key].default) === JSON.stringify(declared.map(item => ({ show: true, id: item.id }))));
    }
    check('settings dialog: rows show names, store ids',
        schema.tiles.columns[1].options['Power profile'] === 'power-profile' && schema.header.columns[1].options.Battery === 'battery');
    check('settings dialog: mockup names',
        `${Object.keys(schema.tiles.columns[1].options)}` === 'Wi-Fi,Bluetooth,VPN,NordVPN,Power profile,Night Light,Dark style,Do Not Disturb,Keep awake,Mic mute'
        && `${Object.keys(schema.sliders.columns[1].options)}` === 'Sound,Microphone,Brightness'
        && `${Object.keys(schema.header.columns[1].options)}` === 'Battery,Screenshot,Settings,Lock,Power'
        && `${Object.keys(schema['panel-icons'].columns[1].options)}` === 'Wi-Fi,Bluetooth,VPN,Volume');
}

function testLayoutModel() {
    const Model = load('./layoutModel');
    const declared = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
    check('layout: nothing stored gives the declaration order, all shown', `${Model.visibleIds(null, declared)}` === 'a,b,c,d');
    check('layout: the stored order wins', `${Model.visibleIds(Model.defaults(declared).reverse(), declared)}` === 'd,c,b,a');
    const hidden = [{ show: true, id: 'b' }, { show: false, id: 'a' }, { show: true, id: 'c' }, { show: true, id: 'd' }];
    check('layout: a hidden row is left out', `${Model.visibleIds(hidden, declared)}` === 'b,c,d');
    const messy = [{ show: true, id: 'zz' }, { show: true, id: 'c' }, { show: false, id: 'c' }, null, { show: true }, { show: true, id: 'a' }];
    check(`layout: unknown ids ignored, first duplicate kept, missing appended shown (${Model.visibleIds(messy, declared)})`,
        `${Model.visibleIds(messy, declared)}` === 'c,a,b,d');
    check('layout: an emptied list brings everything back', `${Model.visibleIds([], declared)}` === 'a,b,c,d');
    check('layout: odd count leaves one tile on the last row',
        JSON.stringify(Model.rows(['a', 'b', 'c'], 2)) === '[["a","b"],["c"]]');
    const all = { wifi: true, bluetooth: false, vpn: false, volume: true };
    const shown = Model.panelIconVisibility(['volume', 'wifi'], all);
    check('panel: allowed icons follow their state, no fallback', shown.visible.wifi && shown.visible.volume && !shown.fallback);
    check('panel: the settings never force an icon on', !Model.panelIconVisibility(['bluetooth'], all).visible.bluetooth);
    check('panel: every icon hidden gives the fallback', Model.panelIconVisibility([], all).fallback);
    check('panel: allowed icons all absent by state gives the fallback', Model.panelIconVisibility(['bluetooth', 'vpn'], all).fallback);
    const header = (ids, present) => JSON.stringify(Model.headerVisibility(ids, 'battery', present));
    check('header: battery shows only when allowed and present',
        header(['battery', 'lock'], true) === '{"battery":true,"line":true}' && header(['lock'], true) === '{"battery":false,"line":true}');
    check('header: everything hidden removes the line', header([], true) === '{"battery":false,"line":false}');
    check('header: battery alone on a machine without battery removes the line', header(['battery'], false) === '{"battery":false,"line":false}');
}

// The session manager on a fake bus: calls wait until answer() runs them, in order. As on
// the real bus, a cancelled call still acts on the server; only its reply is lost.
class FakeSessionBus {
    constructor() {
        this.pending = [];
        this.inhibitors = new Set();
        this.nextCookie = 41;
        this.subscriptions = new Map();
        this.nextSubscription = 1;
    }

    signal_subscribe(name, iface, signal, path, arg0, flags, callback) {
        const id = this.nextSubscription++;
        this.subscriptions.set(id, callback);
        return id;
    }

    signal_unsubscribe(id) {
        this.subscriptions.delete(id);
    }

    call(name, path, iface, method, parameters, replyType, flags, timeout, cancellable, callback) {
        this.pending.push({ method, args: parameters ? parameters.deepUnpack() : [], cancellable, callback });
    }

    // Answers every pending call, including those the answers start.
    answerAll() {
        while (this.pending.length > 0) {
            const call = this.pending.shift();
            call.reply = this._serve(call);
            call.callback(this, call);
        }
    }

    call_finish(call) {
        if (call.cancellable && call.cancellable.is_cancelled())
            throw new GLib.Error(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED, 'Operation was cancelled');
        return call.reply;
    }

    emitInhibitorChange() {
        for (const callback of this.subscriptions.values())
            callback();
    }

    _serve(call) {
        if (call.method === 'Inhibit') {
            const cookie = this.nextCookie++;
            this.inhibitors.add(cookie);
            return new GLib.Variant('(u)', [cookie]);
        }
        if (call.method === 'Uninhibit') {
            this.inhibitors.delete(call.args[0]);
            return null;
        }
        return new GLib.Variant('(b)', [this.inhibitors.size > 0]);
    }
}

function testKeepAwake() {
    const KeepAwake = load('./keepAwake');
    errors = [];
    let bus = new FakeSessionBus();
    let keepAwake = new KeepAwake.KeepAwake('test@quick', () => {}, bus);
    bus.answerAll();
    check('keep awake: reads the idle inhibit at start', keepAwake.available && !keepAwake.inhibited);
    keepAwake.toggle();
    bus.answerAll();
    check(`keep awake: a click takes one idle inhibit (${[...bus.inhibitors]})`, keepAwake.inhibited && bus.inhibitors.size === 1);
    keepAwake.toggle();
    bus.answerAll();
    check('keep awake: a second click releases it', !keepAwake.inhibited && bus.inhibitors.size === 0);
    bus.inhibitors.add(7);
    bus.emitInhibitorChange();
    bus.answerAll();
    check('keep awake: follows an inhibit taken by another program', keepAwake.inhibited);
    bus.inhibitors.delete(7);
    keepAwake.toggle();
    bus.answerAll();
    keepAwake.destroy();
    bus.answerAll();
    check('keep awake: destroy releases our inhibit and unsubscribes',
        bus.inhibitors.size === 0 && bus.subscriptions.size === 0);

    bus = new FakeSessionBus();
    keepAwake = new KeepAwake.KeepAwake('test@quick', () => {}, bus);
    bus.answerAll();
    keepAwake.toggle();
    keepAwake.toggle();
    bus.answerAll();
    keepAwake.destroy();
    bus.answerAll();
    check(`keep awake: two quick clicks leave no inhibit behind after destroy (${[...bus.inhibitors]})`, bus.inhibitors.size === 0);

    bus = new FakeSessionBus();
    keepAwake = new KeepAwake.KeepAwake('test@quick', () => {}, bus);
    bus.answerAll();
    keepAwake.toggle();
    keepAwake.destroy();
    bus.answerAll();
    check(`keep awake: a reload during the Inhibit call leaves no inhibit behind (${[...bus.inhibitors]})`, bus.inhibitors.size === 0);
    check('keep awake: no logged error', errors.length === 0);
    errors = [];
}

// A promise and the functions that settle it later, to hold a fake command or call open.
function deferred() {
    let resolve, reject;
    const promise = new Promise((ok, fail) => {
        resolve = ok;
        reject = fail;
    });
    return { promise, resolve, reject };
}

function cancelledError() {
    return new GLib.Error(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED, 'Operation was cancelled');
}

// M2: nothing reaches the menu once the applet is destroyed.
async function testNoCallbackAfterDestroy() {
    const Wifi = load('./wifiState');
    const device = new FakeNmDevice();
    const client = new FakeNmClient(device);
    let pendingActivation = null;
    client.get_connections = () => ['saved'];
    device.filter_connections = connections => connections;
    client.activate_connection_async = (connection, dev, path, cancellable, callback) => {
        pendingActivation = { cancellable, callback };
    };
    client.activate_connection_finish = () => {
        if (pendingActivation.cancellable.is_cancelled())
            throw cancelledError();
        return true;
    };
    let changes = 0;
    const wifi = new Wifi.WifiState(() => changes++, (cancellable, onReady) => onReady(client, null));
    const accessPoint = { filter_connections: connections => connections, get_path: () => '/ap/1' };
    wifi.connect({ ssid: 'Net', active: false, accessPoint });
    wifi.destroy();
    const changesAtDestroy = changes;
    pendingActivation.callback(client, null);
    check('wifi: a connection cancelled by destroy does not touch the tile', changes === changesAtDestroy);

    const DdcBrightness = load('./ddcBrightness');
    const Brightness = load('./brightness');
    const write = deferred();
    const run = argv => {
        const args = argv.slice(1).join(' ');
        if (args === 'detect --terse')
            return Promise.resolve(readText(`${fixturesDir}/detect-terse.txt`));
        if (args.includes('getvcp'))
            return Promise.resolve('VCP 10 C 50 100\n');
        return write.promise;
    };
    const shown = [];
    const brightness = new Brightness.Brightness({
        ddc: new DdcBrightness.DdcBrightness(run), screen: null,
        onValue: value => shown.push(value), onAvailable: () => {},
    });
    await brightness.detect();
    const setting = brightness.set(0.9);
    brightness.destroy();
    errors = [];
    write.reject(new Error('DDC communication failed'));
    await setting;
    check(`brightness: a write failing after destroy does not touch the slider (${shown})`, `${shown}` === '0.5');
    errors = [];
}

// M4: detections overlapping on a dock change; the newest one wins.
async function testBrightnessDetectionRace() {
    const DdcBrightness = load('./ddcBrightness');
    const Brightness = load('./brightness');
    const detections = [];
    let vcp = 'VCP 10 C 50 100\n';
    const writes = [];
    let failBus = null;
    let writeGate = null;
    const run = argv => {
        const args = argv.slice(1).join(' ');
        if (args === 'detect --terse') {
            const call = deferred();
            detections.push(call);
            return call.promise;
        }
        if (args.includes('getvcp'))
            return Promise.resolve(vcp);
        const write = args.match(/^--bus (\d+) setvcp 10 (\d+)$/);
        writes.push(`${write[1]}=${write[2]}`);
        const settle = () => (Number(write[1]) === failBus ? Promise.reject(new Error('DDC communication failed')) : Promise.resolve(''));
        return writeGate ? writeGate.promise.then(settle) : settle();
    };
    const twoMonitors = readText(`${fixturesDir}/detect-terse.txt`);
    const oneMonitor = 'Display 1\n   I2C bus:          /dev/i2c-20\n';

    const ddc = new DdcBrightness.DdcBrightness(run);
    const brightness = new Brightness.Brightness({ ddc, screen: null, onValue: () => {}, onAvailable: () => {} });
    const first = brightness.detect();
    const second = brightness.detect();
    detections[1].resolve(oneMonitor);
    await wait(0);
    detections[0].resolve(twoMonitors);
    await Promise.all([first, second]);
    await brightness.set(1);
    check(`brightness: the newest detection wins over an older one finishing last (${writes})`, `${writes}` === '20=100');

    writes.length = 0;
    detections.length = 0;
    const reDetect = ddc.detect();
    detections[0].resolve(twoMonitors);
    await reDetect;
    await ddc.read();
    vcp = 'VCP 10 C 25 50\n';
    const again = ddc.detect();
    detections[1].resolve(twoMonitors);
    await again;
    await ddc.write(1);
    check(`brightness: a new detection forgets the old maximum (${writes})`, `${writes}` === '18=50,19=50');

    writes.length = 0;
    detections.length = 0;
    failBus = 19;
    writeGate = deferred();
    const writing = ddc.write(1).then(() => null, e => e.message);
    const changed = ddc.detect();
    detections[0].resolve(oneMonitor);
    await changed;
    writeGate.resolve();
    const message = await writing;
    check(`brightness: a failure names the bus that was written (${message})`, message !== null && message.includes('bus 19, value 50'));
    failBus = null;
}

// M9: the modules whose break would go unnoticed.

function fakeAccessPoint({ privacy = false, wpa = 0, rsn = 0, saved = [] } = {}) {
    const NM = imports.gi.NM;
    return {
        get_flags: () => (privacy ? NM['80211ApFlags'].PRIVACY : NM['80211ApFlags'].NONE),
        get_wpa_flags: () => wpa,
        get_rsn_flags: () => rsn,
        filter_connections: () => saved,
        get_path: () => '/ap/1',
    };
}

function testWifiConnectChoice() {
    const NM = imports.gi.NM;
    const Sec = NM['80211ApSecurityFlags'];
    const Wifi = load('./wifiState');
    const psk = fakeAccessPoint({ privacy: true, rsn: Sec.KEY_MGMT_PSK });
    const wep = fakeAccessPoint({ privacy: true });
    const enterprise = fakeAccessPoint({ privacy: true, rsn: Sec.KEY_MGMT_802_1X });
    const open = fakeAccessPoint();
    check('wifi secrets: WPA asks the agent for a passphrase', Wifi.agentOwnedSecret(psk).psk_flags === NM.SettingSecretFlags.AGENT_OWNED);
    check('wifi secrets: WEP asks the agent for a key', Wifi.agentOwnedSecret(wep).wep_key_flags === NM.SettingSecretFlags.AGENT_OWNED);
    check('wifi secrets: open and 802.1x networks get no agent secret',
        Wifi.agentOwnedSecret(open) === null && Wifi.agentOwnedSecret(enterprise) === null);

    const device = new FakeNmDevice();
    const client = new FakeNmClient(device);
    const calls = [];
    client.get_connections = () => [];
    device.filter_connections = connections => connections;
    device.get_path = () => '/device/1';
    client.get_permission_result = () => NM.ClientPermissionResult.NO;
    client.activate_connection_async = connection => calls.push(`activate ${connection}`);
    client.add_and_activate_connection_async = connection => calls.push(`add ${connection.get_id()} ${connection.get_setting_wireless_security() ? 'secured' : 'open'}`);
    spawned.length = 0;
    const wifi = new Wifi.WifiState(() => {}, (cancellable, onReady) => onReady(client, null));
    wifi.connect({ ssid: 'Saved', active: false, accessPoint: fakeAccessPoint({ saved: ['profile'] }) });
    wifi.connect({ ssid: 'Corp', active: false, accessPoint: enterprise });
    wifi.connect({ ssid: 'Home', active: false, accessPoint: psk });
    wifi.connect({ ssid: 'Cafe', active: false, accessPoint: open });
    wifi.connect({ ssid: 'Here', active: true, accessPoint: psk });
    check(`wifi connect: saved profile reused, new network added like the stock applet (${calls})`,
        `${calls}` === 'activate profile,add Auto Home secured,add Auto Cafe open');
    check(`wifi connect: 802.1x goes to the stock wizard (${spawned.map(a => a.join(' '))})`,
        spawned.length === 1 && spawned[0].join(' ') === 'cinnamon-settings network connect-8021x-wifi /device/1 /ap/1');
    wifi.destroy();
}

function testVolumeSet() {
    const Volume = load('./volume');
    const stream = { volume: 0, is_muted: true, pushes: 0, connect: () => 1, disconnect: () => {} };
    stream.push_volume = () => stream.pushes++;
    stream.change_is_muted = muted => {
        stream.is_muted = muted;
    };
    const output = new Volume.StreamVolume(() => {});
    output.setLimits(VOLUME_NORM, VOLUME_NORM * 1.5);
    output.setStream(stream);
    output.set(0.5);
    check(`volume set: half of the amplified range, pushed, unmuted (${stream.volume})`,
        stream.volume === Math.round(0.5 * VOLUME_NORM * 1.5) && stream.pushes === 1 && !stream.is_muted);
    output.set(0.001);
    check('volume set: near 0 mutes at volume 0', stream.volume === 0 && stream.is_muted);
    output.set(0.665);
    check('volume set: near 100% snaps to 100%', stream.volume === VOLUME_NORM && !stream.is_muted);
    output.destroy();
}

const FakeProxy = GObject.registerClass({ Signals: { 'g-properties-changed': {} } }, class FakeProxy extends GObject.Object {});

const FakeActiveConnection = GObject.registerClass(class FakeActiveConnection extends GObject.Object {
    get_uuid() {
        return 'u1';
    }

    get_state() {
        return imports.gi.NM.ActiveConnectionState.ACTIVATED;
    }
});

function testVpnToggleRule() {
    const Vpn = load('./vpnState');
    const calls = [];
    let pending = null;
    let active = [];
    const client = new FakeNmClient(new FakeNmDevice());
    const office = { get_uuid: () => 'u1', get_id: () => 'Office', get_connection_type: () => 'vpn', get_interface_name: () => null, get_setting_connection: () => ({ get_timestamp: () => 0 }) };
    client.get_connections = () => [office];
    client.get_active_connections = () => active;
    client.get_connection_by_uuid = uuid => (uuid === 'u1' ? office : null);
    client.activate_connection_async = (connection, device, specific, cancellable, callback) => {
        calls.push(`activate ${connection.get_id()} device=${device} specific=${specific}`);
        pending = callback;
    };
    client.activate_connection_finish = () => true;
    client.deactivate_connection_async = (activeConnection, cancellable, callback) => {
        calls.push(`deactivate ${activeConnection.get_uuid()}`);
        pending = callback;
    };
    client.deactivate_connection_finish = () => true;
    const vpn = new Vpn.VpnState(() => {}, (cancellable, onReady) => onReady(client, null));
    vpn.toggle();
    vpn.toggle();
    check(`vpn: a click activates the profile with no device, as the stock applet; a second click during the call is ignored (${calls})`,
        `${calls}` === 'activate Office device=null specific=null');
    const activeConnection = new FakeActiveConnection();
    active = [activeConnection];
    pending(client, null);
    check('vpn: activated profile shows as up', vpn.summary.active !== null && vpn.summary.label === 'VPN Office');
    vpn.toggle();
    check(`vpn: a click on the active profile deactivates it (${calls[1]})`, calls[1] === 'deactivate u1');
    active = [];
    pending(client, null);
    check('vpn: after deactivation the tile is off', vpn.summary.active === null);
    vpn.destroy();
}

function fakeProxy(name, active, profiles) {
    const proxy = new FakeProxy();
    proxy.g_name = name;
    proxy.g_object_path = '/power';
    proxy.g_interface_name = name;
    proxy.values = { ActiveProfile: active, Profiles: profiles };
    proxy.get_cached_property = property => {
        if (property === 'ActiveProfile')
            return proxy.values.ActiveProfile === null ? null : new GLib.Variant('s', proxy.values.ActiveProfile);
        if (property === 'Profiles' && proxy.values.Profiles)
            return new GLib.Variant('aa{sv}', proxy.values.Profiles.map(p => ({ Profile: new GLib.Variant('s', p) })));
        return null;
    };
    return proxy;
}

function testPowerProfiles() {
    const PowerProfiles = load('./powerProfiles');
    const sets = [];
    const watched = new Map();
    const withoutProfiles = fakeProxy('net.hadess.PowerProfiles', 'balanced', null);
    const withProfiles = fakeProxy('org.freedesktop.UPower.PowerProfiles', 'balanced', ['power-saver', 'balanced', 'performance']);
    const system = {
        bus: { call: (name, path, iface, method, value, type, flags, timeout, cancellable, callback) => {
            sets.push(`${name} ${value.deepUnpack()[2].unpack()}`);
            callback({ call_finish: () => null }, null);
        } },
        newProxy: (target, cancellable, onReady) => onReady(target.name === 'net.hadess.PowerProfiles' ? withoutProfiles : withProfiles, null),
        watchName: (name, appeared, vanished) => {
            watched.set(name, { appeared, vanished });
            return watched.size;
        },
        unwatchName: () => {},
    };
    let changes = 0;
    const power = new PowerProfiles.PowerProfiles(() => changes++, system);
    check('power: a bus name without Profiles falls back to the next one, as the stock applet',
        power.available && power.profiles.length === 3);
    power.toggle();
    check(`power: first click from balanced asks for power saver (${sets})`, `${sets}` === 'org.freedesktop.UPower.PowerProfiles power-saver');
    withProfiles.values.ActiveProfile = 'performance';
    withProfiles.emit('g-properties-changed');
    withProfiles.values.ActiveProfile = 'balanced';
    withProfiles.emit('g-properties-changed');
    sets.length = 0;
    power.toggle();
    check(`power: from balanced, back to the last other profile set anywhere (${sets})`, `${sets}` === 'org.freedesktop.UPower.PowerProfiles performance');
    watched.get('org.freedesktop.UPower.PowerProfiles').vanished();
    check('power: the daemon stopping dims the tile', !power.available);
    watched.get('org.freedesktop.UPower.PowerProfiles').appeared();
    check('power: the daemon coming back is picked up', power.available);
    power.destroy();
}

async function testSubprocess() {
    const Subprocess = load('./subprocess');
    const ok = await Subprocess.runCommand(['/bin/echo', 'hello']);
    check('subprocess: resolves with the standard output', ok === 'hello\n');
    const failed = await Subprocess.runCommand(['/bin/sh', '-c', 'echo boom >&2; exit 3']).then(() => null, e => e.message);
    check(`subprocess: a failing command rejects with its status and standard error (${failed})`,
        failed !== null && failed.includes('exited with 3') && failed.includes('boom'));
    const missing = await Subprocess.runCommand(['/nonexistent/quick-settings-test']).then(() => null, e => e.message);
    check(`subprocess: a missing command rejects and names it (${missing})`, missing !== null && missing.includes('/nonexistent/quick-settings-test'));
}

const FakeObjectManager = GObject.registerClass({
    Signals: { 'object-added': {}, 'object-removed': {}, 'interface-added': {}, 'interface-removed': {}, 'interface-proxy-properties-changed': {} },
}, class FakeObjectManager extends GObject.Object {
    _init(objects) {
        super._init();
        this.objects = objects;
    }

    get_objects() {
        return this.objects;
    }
});

// A BlueZ object with one interface whose cached properties come from @values.
function fakeBluezObject(path, iface, values) {
    const proxy = {
        get_cached_property: name => {
            if (!(name in proxy.values))
                return null;
            const value = proxy.values[name];
            const type = typeof value === 'boolean' ? 'b' : typeof value === 'number' ? 'n' : 's';
            return new GLib.Variant(type, value);
        },
        values,
    };
    return {
        values,
        get_object_path: () => path,
        get_interface: name => (name === iface ? proxy : null),
    };
}

function testBluetoothCalls() {
    const Bluetooth = load('./bluetooth');
    const calls = [];
    const system = {
        bus: { call: (name, path, iface, method, parameters) => {
            calls.push(`${path} ${iface.replace('org.bluez.', '').replace('org.freedesktop.DBus.', '')} ${method}${parameters ? ' ' + JSON.stringify(parameters.deepUnpack()[2].unpack()) : ''}`);
        } },
        newManager: () => {},
    };
    const bluetooth = new Bluetooth.Bluetooth(() => {}, system);
    bluetooth.summary = { available: true, powered: true, adapterPath: '/org/bluez/hci0', devices: [], connectedNames: [] };
    bluetooth.toggle();
    bluetooth.toggleDevice({ path: '/dev/a', name: 'A', connected: false });
    bluetooth.toggleDevice({ path: '/dev/b', name: 'B', connected: true });
    check(`bluetooth: power off sets Adapter1.Powered, devices connect and disconnect (${calls})`,
        `${calls}` === '/org/bluez/hci0 Properties Set false,/dev/a Device1 Connect,/dev/b Device1 Disconnect');
    bluetooth.destroy();

    // A signal strength update changes nothing shown: no redraw of the tile or the list.
    const objects = [];
    const manager = new FakeObjectManager(objects);
    let changes = 0;
    const watched = new Bluetooth.Bluetooth(() => changes++, { bus: system.bus, newManager: (cancellable, onReady) => onReady(manager, null) });
    objects.push(fakeBluezObject('/org/bluez/hci0', 'org.bluez.Adapter1', { Powered: true }));
    objects.push(fakeBluezObject('/org/bluez/hci0/dev_1', 'org.bluez.Device1',
        { Adapter: '/org/bluez/hci0', Alias: 'Speaker', Paired: true, Connected: false, RSSI: -60 }));
    manager.emit('object-added');
    const afterAdd = changes;
    objects[1].values.RSSI = -40;
    manager.emit('interface-proxy-properties-changed');
    check('bluetooth: a signal strength update does not redraw', changes === afterAdd);
    objects[1].values.Connected = true;
    manager.emit('interface-proxy-properties-changed');
    check('bluetooth: a connection change redraws', changes === afterAdd + 1 && watched.summary.connectedNames[0] === 'Speaker');
    watched.destroy();
}

async function main() {
    await testDarkStyle();
    testWifi();
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
    testPowerProfileModel();
    await testBooleanSettings();
    testBatteryModel();
    testMicMute();
    testSchemaMatchesDeclarations();
    testLayoutModel();
    testKeepAwake();
    await testNoCallbackAfterDestroy();
    await testBrightnessDetectionRace();
    testWifiConnectChoice();
    testVolumeSet();
    testVpnToggleRule();
    testPowerProfiles();
    await testSubprocess();
    testBluetoothCalls();
}

// No test may hang: a stuck promise fails the run instead.
const TEST_TIMEOUT_SECONDS = 60;
const loop = GLib.MainLoop.new(null, false);
GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, TEST_TIMEOUT_SECONDS, () => {
    print(`FAIL timeout: the tests did not finish within ${TEST_TIMEOUT_SECONDS} s`);
    failures++;
    loop.quit();
    return GLib.SOURCE_REMOVE;
});
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
