// Logic tests of the quick-settings@bgi applet modules, run by cinnamon-quick-settings-test.sh.
// Dark style runs on the memory GSettings backend; Wi-Fi runs on fake NetworkManager objects
// (no test touches the real NetworkManager); brightness runs against fake ddcutil
// and laptop backends fed with captured ddcutil output; NordVPN runs against a fake client
// fed with captured output; list building, the one-open-list rule and the BlueZ and VPN
// models run on plain data; the Warmth row runs against a fake gammastep; Do Not Disturb
// runs on the memory GSettings backend; the keyboard light runs on a fake UPower bus;
// Airplane mode on fake radios and on the Wi-Fi and Bluetooth fakes; media players on a fake session bus.
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
// gi.Cinnamon and ui.main only exist inside Cinnamon: empty stand-ins, so mediaWindows.js
// loads (its watchTitle() uses neither).
const giImports = new Proxy({}, { get: (target, name) => (name === 'Cinnamon' ? {} : imports.gi[name]) });
const appletImports = new Proxy({}, {
    get: (target, name) => {
        if (name === 'misc')
            return { util: { spawn: argv => spawned.push(argv) } };
        if (name === 'gi')
            return giImports;
        if (name === 'ui')
            return { main: {} };
        return imports[name];
    },
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

// The message of what @call throws, or null.
function thrownBy(call) {
    try {
        call();
        return null;
    } catch (e) {
        return e.message;
    }
}

// Resolves after the idle callbacks already queued (IdleCoalescer) have run.
function nextIdle() {
    return new Promise(resolve => GLib.idle_add(GLib.PRIORITY_LOW, () => {
        resolve();
        return GLib.SOURCE_REMOVE;
    }));
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
    const StringSetting = load('./stringSetting');
    const settings = new Gio.Settings({ schema_id: 'org.x.apps.portal' });
    settings.set_string('color-scheme', 'prefer-dark');
    let changes = 0;
    const dark = new StringSetting.StringSetting('org.x.apps.portal', 'color-scheme',
        { on: 'prefer-dark', off: 'default' }, () => changes++);
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

// The hardware switch (rfkill) off: Wi-Fi reads as off and blocked even with the software
// switch on, so the applet dims the tile, and no scan starts. Flipping it back clears it.
function testWifiHardwareSwitch() {
    const Wifi = load('./wifiState');
    const device = new FakeNmDevice();
    let scans = 0;
    device.request_scan_async = () => scans++;
    const client = new FakeNmClient(device);
    client.wireless_hardware_enabled = false;
    let changes = 0;
    const wifi = new Wifi.WifiState(() => changes++, (cancellable, onReady) => onReady(client, null));
    check('wifi: hardware switch off reads as blocked and off, software switch on',
        wifi.hardwareBlocked && !wifi.enabled && client.wireless_enabled);
    wifi.requestScan();
    check('wifi: no scan while the hardware switch is off', scans === 0);
    const changesBeforeFlip = changes;
    client.wireless_hardware_enabled = true;
    client.emit('notify::wireless-hardware-enabled', null);
    check('wifi: hardware switch back on clears the block, Wi-Fi on, the applet is told',
        !wifi.hardwareBlocked && wifi.enabled && changes === changesBeforeFlip + 1);
    wifi.requestScan();
    check('wifi: a scan starts once the hardware switch is on', scans === 1);
    wifi.destroy();
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
    check('bluetooth: airplane mode with the adapter off shows the struck-through panel icon, no name',
        Model.panelIconName(off, true) === 'bluetooth-disabled-symbolic' && Model.deviceName(off) === null);
    check('bluetooth: airplane mode off, adapter off still hides the panel icon', Model.panelIconName(off, false) === null);
    check('bluetooth: adapter on, the airplane flag changes nothing',
        Model.panelIconName(on, true) === 'bluetooth-active-symbolic' && Model.panelIconName(idle, true) === 'bluetooth-symbolic');
    const PanelModel = load('./layoutModel');
    check('bluetooth: the Panel-tab Show flag still hides the struck-through icon',
        !PanelModel.panelIconVisibility(['wifi'], { wifi: true, bluetooth: Model.panelIconName(off, true) !== null }).visible.bluetooth
        && PanelModel.panelIconVisibility(['bluetooth'], { bluetooth: Model.panelIconName(off, true) !== null }).visible.bluetooth);
    check('bluetooth: the panel names the connected device, nothing when idle or off',
        Model.deviceName(on) === 'Speaker' && Model.deviceName(idle) === null && Model.deviceName(off) === null);
    const pair = [
        { path: 'm', adapter, name: 'Mouse', icon: 'input-mouse', paired: true, connected: true },
        { path: 'h', adapter, name: 'Headset', icon: 'audio-headset', paired: true, connected: true },
    ];
    const two = Model.summarize([{ path: adapter, powered: true }], pair);
    const swapped = Model.summarize([{ path: adapter, powered: true }], [...pair].reverse());
    check(`bluetooth: two devices give the first in alphabetical order and +1 (${Model.deviceName(two)})`,
        Model.deviceName(two) === 'Headset +1' && Model.deviceName(swapped) === 'Headset +1'
        && Model.tileLabel(two, 'Bluetooth') === 'Headset +1');
    const three = Model.summarize([{ path: adapter, powered: true }],
        [...pair, { path: 'k', adapter, name: 'Keyboard', icon: null, paired: true, connected: true }]);
    check(`bluetooth: three devices give +2 (${Model.deviceName(three)})`, Model.deviceName(three) === 'Headset +2');
    const long = Model.summarize([{ path: adapter, powered: true }],
        [{ path: 'l', adapter, name: 'Wireless Headset Pro', icon: null, paired: true, connected: true }]);
    check(`bluetooth: a long name is cut like the VPN name (${Model.deviceName(long)})`, Model.deviceName(long) === 'Wireless Headse…');
    const PanelText = load('./panelText');
    check('panel text: 16 characters kept, 17 cut to 16 with the ellipsis',
        PanelText.shortName('Sixteen chars ok') === 'Sixteen chars ok' && PanelText.shortName('Seventeen chars!!') === 'Seventeen chars…'
        && [...PanelText.shortName('Seventeen chars!!')].length === 16);
    check('panel text: the count follows the cut first name, none gives null',
        PanelText.countedName(['Seventeen chars!!', 'Mouse']) === 'Seventeen chars… +1' && PanelText.countedName([]) === null);
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
    check('vpn: NordVPN link up only while its NordLynx connection is active',
        Model.nordvpnLinkUp([{ id: 'nordlynx', iface: 'nordlynx' }]) && Model.nordvpnLinkUp([{ id: 'x', iface: 'nordlynx' }])
        && !Model.nordvpnLinkUp([{ id: 'Office', iface: null }]) && !Model.nordvpnLinkUp([]));
    check('vpn panel: no VPN up, no name', Model.panelName(null, null) === null && Model.panelName('', '') === null);
    check('vpn panel: NordVPN shows its country', Model.panelName('France', null) === 'France');
    check('vpn panel: a NetworkManager VPN shows its profile name', Model.panelName(null, 'Office') === 'Office');
    check(`vpn panel: both up, NordVPN first (${Model.panelName('France', 'Office')})`, Model.panelName('France', 'Office') === 'France + Office');
    const long = Model.panelName(null, 'Head Office Datacenter');
    check(`vpn panel: a name over 16 characters is cut with an ellipsis (${long})`,
        long === 'Head Office Dat…' && [...long].length === 16 && Model.panelName('Bosnia_and_Herzeg', null) === 'Bosnia_and_Herz…');
    check('vpn panel: a name of exactly 16 characters is kept', Model.panelName(null, 'Sixteen chars ok') === 'Sixteen chars ok');
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

    // A-M1: the daemon stops while connected. The status read fails: the tile must not stay
    // checked with the country, nor the VPN panel icon on (both read status.connected).
    let daemonRunning = true;
    const stopped = new Nordvpn.Nordvpn(() => (daemonRunning
        ? Promise.resolve(readText(`${nordvpnFixtures}/status-connected-constructed.txt`))
        : Promise.reject(new Error('nordvpn: daemon not running'))), () => {});
    await stopped.refresh();
    const wasConnected = stopped.available && stopped.connectedCountry === 'United States';
    daemonRunning = false;
    await stopped.refresh();
    check('nordvpn: a failed status read after a connected one shows unavailable, off, no country',
        wasConnected && !stopped.available && !stopped.status.connected
        && stopped.status.country === null && stopped.connectedCountry === null);
    check('nordvpn: the failed status read is logged once', errors.length === 1);
    errors = [];
}

// While a connect or disconnect runs, busy is set and any other action is ignored; busy is
// cleared once the action settles, whether it succeeded or failed.
async function testNordvpnBusyGuard() {
    const Nordvpn = load('./nordvpn');
    errors = [];
    const calls = [];
    let action = deferred();
    const run = argv => {
        calls.push(argv.slice(1).join(' '));
        if (argv[1] === 'status')
            return Promise.resolve(readText(`${nordvpnFixtures}/status-disconnected.txt`));
        return action.promise;
    };
    const nordvpn = new Nordvpn.Nordvpn(run, () => {});
    const first = nordvpn.toggle();
    check('nordvpn: busy while an action runs', nordvpn.busy);
    // Not awaited: without the guard they would wait on the same open command.
    nordvpn.connectTo('France');
    nordvpn.toggle();
    check(`nordvpn: a second action while one runs is ignored (${calls})`, `${calls}` === 'connect');
    action.resolve('');
    await first;
    check(`nordvpn: busy cleared once the action succeeds, then the status is read (${calls})`,
        !nordvpn.busy && `${calls}` === 'connect,status');

    calls.length = 0;
    action = deferred();
    const failing = nordvpn.toggle();
    action.reject(new Error('nordvpn: connect timed out'));
    await failing;
    check(`nordvpn: busy cleared once the action fails, failure logged (${calls})`,
        !nordvpn.busy && `${calls}` === 'connect,status' && errors.length === 1);
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
    const Constants = load('./constants');
    const notifications = new Gio.Settings({ schema_id: Constants.NOTIFICATIONS_SCHEMA });
    notifications.set_boolean(Constants.NOTIFICATIONS_KEY, true);
    let changes = 0;
    // The Do Not Disturb key read as is (not inverted): no tile does that, the class allows it.
    const plain = new BooleanSetting.BooleanSetting(Constants.NOTIFICATIONS_SCHEMA, Constants.NOTIFICATIONS_KEY, false, () => changes++);
    check('boolean setting: on while the key is true', plain.enabled);
    plain.toggle();
    check('boolean setting: toggle writes false', !notifications.get_boolean(Constants.NOTIFICATIONS_KEY) && !plain.enabled);
    plain.destroy();
    notifications.set_boolean(Constants.NOTIFICATIONS_KEY, true);
    const dnd = new BooleanSetting.BooleanSetting(Constants.NOTIFICATIONS_SCHEMA, Constants.NOTIFICATIONS_KEY, true, () => changes++);
    check('do not disturb: off while notifications are shown', !dnd.enabled);
    dnd.toggle();
    check('do not disturb: toggle turns notifications off', !notifications.get_boolean(Constants.NOTIFICATIONS_KEY) && dnd.enabled);
    notifications.set_boolean(Constants.NOTIFICATIONS_KEY, true);
    check('do not disturb: follows a change made elsewhere', !dnd.enabled);
    await wait(0);
    check(`settings tiles: every change notifies (${changes})`, changes >= 3);
    dnd.destroy();
}

function testSettingsWrite() {
    const GsettingsWrite = load('./gsettingsWrite');
    errors = [];
    const refusing = { schema_id: 'org.example.test', set_uint: () => false };
    const accepted = GsettingsWrite.writeSetting({ schema_id: 'org.example.test', set_uint: () => true }, 'set_uint', 'level', 3);
    const refused = GsettingsWrite.writeSetting(refusing, 'set_uint', 'level', 3);
    check(`settings write: a refused write is logged with schema, key and value (${errors})`,
        accepted && !refused && errors.length === 1 && errors[0].includes('setting org.example.test level to 3 failed'));
    errors = [];
}

async function testWarmthModel() {
    const Model = load('./warmthModel');
    check('warmth: 6500 K is the left end, 1000 K the right end (warmer to the right)',
        Model.kelvinToFraction(6500) === 0 && Model.kelvinToFraction(1000) === 1);
    check(`warmth: 3700 K sits at ${Model.kelvinToFraction(3700).toFixed(3)}`, Math.abs(Model.kelvinToFraction(3700) - 28 / 55) < 1e-9);
    check('warmth: out-of-range values are clamped on the slider', Model.kelvinToFraction(9000) === 0 && Model.kelvinToFraction(500) === 1);
    check(`warmth: positions round to the 100 K step (${Model.fractionToKelvin(0.5)})`,
        Model.fractionToKelvin(0.5) === 3800 && Model.fractionToKelvin(0) === 6500 && Model.fractionToKelvin(1) === 1000);
    const steps = [];
    for (let kelvin = 1000; kelvin <= 6500; kelvin += 100)
        steps.push(kelvin);
    check(`warmth: every one of the ${steps.length} steps survives a round trip`,
        steps.length === 56 && steps.every(k => Model.fractionToKelvin(Model.kelvinToFraction(k)) === k));
    check('warmth: row state, on', JSON.stringify(Model.rowState(true, true, 3700))
        === JSON.stringify({ available: true, switchAvailable: true, switchOn: true, fraction: Model.kelvinToFraction(3700), text: '3700 K' }));
    check('warmth: row state, off dims the slider, keeps the switch usable and turns it off',
        !Model.rowState(true, false, 3700).available && Model.rowState(true, false, 3700).switchAvailable
        && !Model.rowState(true, false, 3700).switchOn);
    check('warmth: row state, gammastep unavailable dims the slider and the switch',
        !Model.rowState(false, true, 3700).available && !Model.rowState(false, true, 3700).switchAvailable);
    check('warmth: row state, a stored 9000 K puts the handle at the left end and shows 9000 K',
        Model.rowState(true, true, 9000).fraction === 0 && Model.rowState(true, true, 9000).text === '9000 K');
    check('warmth: label', Model.label(3400) === '3400 K');
}

// A gammastep stand-in: records every argv; with hold, each run waits in held until
// answered by hand; while fail is true, each run rejects, a held one when it is answered
// (set it to false to recover).
function fakeGammastep({ hold = false, fail = false } = {}) {
    const fake = { runs: [], held: [], fail };
    const failure = () => new Error('gammastep exited with 1: Unable to connect to X server');
    fake.run = argv => {
        fake.runs.push(argv.join(' '));
        if (fake.fail)
            return Promise.reject(failure());
        if (hold)
            return new Promise((resolve, reject) => fake.held.push(() => (fake.fail ? reject(failure()) : resolve(''))));
        return Promise.resolve('');
    };
    return fake;
}

// The applet settings' getValue/setValue on plain data, with the declared defaults.
function fakeWarmthStore(values = {}) {
    const Constants = load('./constants');
    const defaults = Object.fromEntries(Object.values(Constants.WARMTH_SETTINGS).map(setting => [setting.key, setting.default]));
    return {
        values: { ...defaults, ...values },
        writes: 0,
        getValue(key) {
            return this.values[key];
        },
        setValue(key, value) {
            this.values[key] = value;
            this.writes++;
        },
    };
}

// @found: whether gammastep is in PATH, or a function asked at each look.
function makeWarmth({ gammastep = fakeGammastep(), store = fakeWarmthStore(), found = true, onChange = () => {} } = {}) {
    const Warmth = load('./gammastepWarmth');
    const isFound = typeof found === 'function' ? found : () => found;
    let changes = 0;
    const warmth = new Warmth.GammastepWarmth({
        runCommand: gammastep.run,
        findProgram: name => (isFound() && name === 'gammastep' ? '/usr/bin/gammastep' : null),
        store,
        onChange: () => {
            changes++;
            onChange();
        },
    });
    return { warmth, gammastep, store, changes: () => changes };
}

// What the row would show, as WarmthModel computes it from the Warmth's state.
function warmthRow(warmth) {
    return load('./warmthModel').rowState(warmth.available, warmth.enabled, warmth.kelvin);
}

async function testGammastepWarmth() {
    errors = [];
    const fresh = makeWarmth();
    check('gammastep warmth: defaults are off and 2000 K', !fresh.warmth.enabled && fresh.warmth.kelvin === 2000 && fresh.warmth.available);
    fresh.warmth.applyStored();
    await wait(0);
    check(`gammastep warmth: start-up with stored off runs nothing (${fresh.gammastep.runs})`, fresh.gammastep.runs.length === 0);

    const on = makeWarmth({ store: fakeWarmthStore({ 'warmth-kelvin': 3500 }) });
    on.warmth.toggle();
    await wait(0);
    check(`gammastep warmth: on sends -P -O <kelvin>: the run replaces the previous tint, runs do not stack (${on.gammastep.runs})`,
        `${on.gammastep.runs}` === 'gammastep -m randr -P -O 3500' && on.store.values['warmth-enabled'] === true);
    on.warmth.setTemperature(2500);
    await wait(0);
    check(`gammastep warmth: the slider sends the new kelvin live, shows it, stores nothing yet (${on.gammastep.runs})`,
        on.gammastep.runs[1] === 'gammastep -m randr -P -O 2500' && on.warmth.kelvin === 2500
        && warmthRow(on.warmth).text === '2500 K' && on.store.values['warmth-kelvin'] === 3500);
    on.warmth.setTemperature(2500);
    await wait(0);
    check('gammastep warmth: a move within the same step runs nothing', on.gammastep.runs.length === 2);
    on.warmth.setTemperature(2400);
    await wait(0);
    const writesBefore = on.store.writes;
    on.warmth.commitTemperature();
    check(`gammastep warmth: the release stores the last kelvin in one write (${on.store.values['warmth-kelvin']})`,
        on.store.values['warmth-kelvin'] === 2400 && on.store.writes === writesBefore + 1 && on.warmth.kelvin === 2400);
    on.warmth.commitTemperature();
    check('gammastep warmth: a release without a move writes nothing', on.store.writes === writesBefore + 1);
    on.warmth.toggle();
    await wait(0);
    check(`gammastep warmth: off sends -x (${on.gammastep.runs})`,
        on.gammastep.runs[3] === 'gammastep -m randr -x' && on.store.values['warmth-enabled'] === false);
    on.warmth.setTemperature(3000);
    on.warmth.commitTemperature();
    await wait(0);
    check('gammastep warmth: the slider while off stores the kelvin on release, runs nothing',
        on.gammastep.runs.length === 4 && on.store.values['warmth-kelvin'] === 3000);
    check(`gammastep warmth: every change notifies (${on.changes()})`, on.changes() === 5);

    const invalid = makeWarmth({ store: fakeWarmthStore({ 'warmth-enabled': true }) });
    for (const kelvin of [500, 2500.5, Number.NaN, '3000; rm -rf ~'])
        invalid.warmth.setTemperature(kelvin);
    invalid.warmth.commitTemperature();
    await wait(0);
    check(`gammastep warmth: out-of-range or non-integer kelvin never reaches argv nor the settings (${invalid.gammastep.runs})`,
        invalid.gammastep.runs.length === 0 && errors.length === 4 && errors.every(e => e.includes('refused'))
        && invalid.store.writes === 0 && invalid.warmth.kelvin === 2000);
    errors = [];

    // L2: a stored value gammastep would refuse is never shown, and start-up applies the default.
    const defaultFraction = load('./warmthModel').kelvinToFraction(2000);
    for (const stored of [Number.NaN, 2500.5, '3000; rm -rf ~', 1e12, 9000, 500]) {
        const bad = makeWarmth({ store: fakeWarmthStore({ 'warmth-enabled': true, 'warmth-kelvin': stored }) });
        const row = warmthRow(bad.warmth);
        bad.warmth.applyStored();
        await wait(0);
        check(`gammastep warmth: a stored ${stored} reads as 2000 K on the row and at start-up (${row.text}, ${bad.gammastep.runs})`,
            bad.warmth.kelvin === 2000 && row.text === '2000 K' && row.fraction === defaultFraction
            && `${bad.gammastep.runs}` === 'gammastep -m randr -P -O 2000');
    }
    check(`gammastep warmth: an invalid stored kelvin logs nothing (${errors})`, errors.length === 0);

    const held = fakeGammastep({ hold: true });
    const race = makeWarmth({ gammastep: held, store: fakeWarmthStore({ 'warmth-enabled': true }) });
    for (const kelvin of [3000, 3100, 3200, 3300])
        race.warmth.setTemperature(kelvin);
    check(`gammastep warmth: one run at a time while dragging (${held.runs})`, `${held.runs}` === 'gammastep -m randr -P -O 3000');
    held.held.shift()();
    await wait(0);
    check(`gammastep warmth: overlapping changes end on the newest value (${held.runs})`,
        held.runs.length === 2 && held.runs[1] === 'gammastep -m randr -P -O 3300');
    held.held.shift()();
    await wait(0);
    check('gammastep warmth: nothing left to run', held.runs.length === 2 && held.held.length === 0);

    // M8: a run waiting behind a held one is dropped by destroy().
    const heldAtDestroy = fakeGammastep({ hold: true });
    const destroyed = makeWarmth({ gammastep: heldAtDestroy, store: fakeWarmthStore({ 'warmth-enabled': true }) });
    destroyed.warmth.setTemperature(3000);
    destroyed.warmth.setTemperature(3100);
    destroyed.warmth.setTemperature(3200);
    destroyed.warmth.destroy();
    while (heldAtDestroy.held.length > 0)
        heldAtDestroy.held.shift()();
    await wait(0);
    check(`gammastep warmth: a run queued before destroy does not run after it, only the reset does (${heldAtDestroy.runs})`,
        `${heldAtDestroy.runs}` === 'gammastep -m randr -P -O 3000,gammastep -m randr -x' && heldAtDestroy.held.length === 0);
    destroyed.warmth.commitTemperature();
    check('gammastep warmth: a release after destroy writes nothing', destroyed.store.writes === 0);

    // M1: removing the applet resets the screens once when the Warmth is on, keeps the stored state.
    const removedOn = makeWarmth({ store: fakeWarmthStore({ 'warmth-enabled': true, 'warmth-kelvin': 1800 }) });
    removedOn.warmth.destroy();
    await wait(0);
    check(`gammastep warmth: destroy while on runs the reset exactly once (${removedOn.gammastep.runs})`,
        `${removedOn.gammastep.runs}` === 'gammastep -m randr -x');
    check('gammastep warmth: destroy keeps the stored state for the next start',
        removedOn.store.values['warmth-enabled'] === true && removedOn.store.values['warmth-kelvin'] === 1800 && removedOn.store.writes === 0);
    removedOn.warmth.applyStored();
    removedOn.warmth.toggle();
    await wait(0);
    check(`gammastep warmth: nothing runs after the reset on destroy (${removedOn.gammastep.runs})`, removedOn.gammastep.runs.length === 1);
    const removedOff = makeWarmth();
    removedOff.warmth.destroy();
    await wait(0);
    check(`gammastep warmth: destroy while off runs nothing (${removedOff.gammastep.runs})`, removedOff.gammastep.runs.length === 0);
    const removedMissing = makeWarmth({ found: false, store: fakeWarmthStore({ 'warmth-enabled': true }) });
    removedMissing.warmth.destroy();
    await wait(0);
    check(`gammastep warmth: destroy with gammastep unavailable runs nothing (${removedMissing.gammastep.runs})`,
        removedMissing.gammastep.runs.length === 0);
    errors = [];
    const removedFailing = makeWarmth({ gammastep: fakeGammastep(), store: fakeWarmthStore({ 'warmth-enabled': true }) });
    removedFailing.gammastep.fail = true;
    removedFailing.warmth.destroy();
    await wait(0);
    check(`gammastep warmth: a failing reset on destroy is logged (${errors})`,
        errors.length === 1 && errors[0].includes("resetting the Warmth with 'gammastep -m randr -x' failed"));
    errors = [];

    // L5: a value written from outside the applet syncs the row and reaches the screens.
    const outside = makeWarmth({ store: fakeWarmthStore({ 'warmth-kelvin': 3000 }) });
    outside.store.values['warmth-kelvin'] = 2500;
    outside.warmth.kelvinChangedOutside();
    await wait(0);
    check(`gammastep warmth: an outside kelvin change while off notifies, runs nothing (${outside.gammastep.runs})`,
        outside.changes() === 1 && outside.gammastep.runs.length === 0);
    outside.store.values['warmth-enabled'] = true;
    outside.warmth.enabledChangedOutside();
    await wait(0);
    check(`gammastep warmth: an outside switch to on applies the stored kelvin (${outside.gammastep.runs})`,
        outside.changes() === 2 && `${outside.gammastep.runs}` === 'gammastep -m randr -P -O 2500' && warmthRow(outside.warmth).switchOn);
    outside.store.values['warmth-kelvin'] = 1900;
    outside.warmth.kelvinChangedOutside();
    await wait(0);
    check(`gammastep warmth: an outside kelvin change while on applies it (${outside.gammastep.runs})`,
        outside.gammastep.runs[1] === 'gammastep -m randr -P -O 1900' && warmthRow(outside.warmth).text === '1900 K');
    outside.store.values['warmth-enabled'] = false;
    outside.warmth.enabledChangedOutside();
    await wait(0);
    check(`gammastep warmth: an outside switch to off resets (${outside.gammastep.runs})`,
        outside.gammastep.runs[2] === 'gammastep -m randr -x' && outside.store.writes === 0);
    outside.warmth.destroy();
    outside.warmth.enabledChangedOutside();
    outside.warmth.kelvinChangedOutside();
    await wait(0);
    check('gammastep warmth: outside changes after destroy run and notify nothing',
        outside.gammastep.runs.length === 3 && outside.changes() === 4);

    const stored = makeWarmth({ store: fakeWarmthStore({ 'warmth-enabled': true, 'warmth-kelvin': 1800 }) });
    stored.warmth.applyStored();
    await wait(0);
    check(`gammastep warmth: start-up with stored on re-applies (${stored.gammastep.runs})`,
        `${stored.gammastep.runs}` === 'gammastep -m randr -P -O 1800');

    // M1: gammastep missing is logged once, however often it is looked for.
    let installed = false;
    const missing = makeWarmth({ found: () => installed, store: fakeWarmthStore({ 'warmth-enabled': true }) });
    missing.warmth.applyStored();
    missing.warmth.applyStored();
    missing.warmth.toggle();
    missing.warmth.setTemperature(3000);
    missing.warmth.commitTemperature();
    await wait(0);
    check(`gammastep warmth: missing gammastep makes the row unavailable and inert, logged once (${errors})`,
        !missing.warmth.available && missing.gammastep.runs.length === 0 && missing.store.values['warmth-enabled'] === true
        && missing.store.writes === 0 && errors.length === 1 && errors[0].includes('gammastep not found'));
    errors = [];
    // M7: installed later, picked up on the next look.
    installed = true;
    missing.warmth.applyStored();
    await wait(0);
    check(`gammastep warmth: gammastep installed later is picked up and applied (${missing.gammastep.runs})`,
        missing.warmth.available && `${missing.gammastep.runs}` === 'gammastep -m randr -P -O 2000' && errors.length === 0);
    installed = false;
    missing.warmth.applyStored();
    check(`gammastep warmth: removed again, logged again once (${errors})`, !missing.warmth.available && errors.length === 1);
    errors = [];

    const failing = makeWarmth({ gammastep: fakeGammastep({ fail: true }) });
    failing.warmth.toggle();
    await wait(0);
    check(`gammastep warmth: a failing run makes the row unavailable, logged with command and value (${errors})`,
        !failing.warmth.available && errors.length === 1 && errors[0].includes("'gammastep -m randr -P -O 2000' failed")
        && errors[0].includes('Unable to connect'));
    check('gammastep warmth: a failing run dims the slider and the switch', !warmthRow(failing.warmth).switchAvailable);
    errors = [];
    // L11: inert while unavailable after the failure.
    failing.warmth.toggle();
    failing.warmth.setTemperature(3000);
    failing.warmth.commitTemperature();
    await wait(0);
    check(`gammastep warmth: toggle and slider after a failed run run nothing, store nothing (${failing.gammastep.runs})`,
        failing.gammastep.runs.length === 1 && failing.store.values['warmth-enabled'] === true
        && failing.store.values['warmth-kelvin'] === 2000);
    // M7: recovery through applyStored (a monitor change) once gammastep works again.
    failing.gammastep.fail = false;
    failing.warmth.applyStored();
    await wait(0);
    check(`gammastep warmth: a monitor change after a failed run recovers and re-applies (${failing.gammastep.runs})`,
        failing.warmth.available && failing.gammastep.runs.length === 2 && failing.gammastep.runs[1] === 'gammastep -m randr -P -O 2000');

    // M2: the waiting run is dropped on failure; M7: recovery through the menu-open path.
    const flaky = fakeGammastep({ hold: true });
    const menu = makeWarmth({ gammastep: flaky, store: fakeWarmthStore({ 'warmth-enabled': true }) });
    menu.warmth.setTemperature(3000);
    menu.warmth.setTemperature(3100);
    menu.warmth.setTemperature(3200);
    flaky.fail = true;
    flaky.held.shift()();
    await wait(0);
    check(`gammastep warmth: after a failed run the waiting run is dropped, one log line (${flaky.runs})`,
        flaky.runs.length === 1 && !menu.warmth.available && errors.length === 1);
    errors = [];
    menu.warmth.menuOpened();
    await wait(0);
    check(`gammastep warmth: menu open while it still fails tries once (${flaky.runs})`,
        flaky.runs.length === 2 && !menu.warmth.available && errors.length === 1);
    errors = [];
    flaky.fail = false;
    menu.warmth.menuOpened();
    flaky.held.shift()();
    await wait(0);
    check(`gammastep warmth: menu open recovers the row and re-applies the newest kelvin (${flaky.runs})`,
        menu.warmth.available && flaky.runs.length === 3 && flaky.runs[2] === 'gammastep -m randr -P -O 3200');
    menu.warmth.menuOpened();
    await wait(0);
    check('gammastep warmth: menu open while available runs nothing', flaky.runs.length === 3);

    // L3: a throwing UI update does not leave the queue stuck.
    let throwOnce = true;
    const throwing = makeWarmth({
        gammastep: fakeGammastep({ fail: true }),
        store: fakeWarmthStore({ 'warmth-enabled': true }),
        onChange: () => {
            if (throwOnce) {
                throwOnce = false;
                throw new Error('UI sync failed');
            }
        },
    });
    throwing.warmth.applyStored();
    await wait(0);
    check(`gammastep warmth: a throwing onChange is logged (${errors[1]})`,
        errors.length === 2 && errors[1].includes('applying the Warmth failed') && errors[1].includes('UI sync failed'));
    throwing.gammastep.fail = false;
    throwing.warmth.applyStored();
    await wait(0);
    check(`gammastep warmth: a throwing onChange does not block the next run (${throwing.gammastep.runs})`,
        throwing.gammastep.runs.length === 2);
    errors = [];
}

// One timer for a burst of monitor changes (applet.js), and the applet's Warmth wiring.
async function testMonitorsSettle() {
    const AsyncHelpers = load('./asyncHelpers');
    const Constants = load('./constants');
    const settleWait = Constants.MONITORS_SETTLE_DELAY_MS + 100;
    let runs = 0;
    const settle = new AsyncHelpers.Debouncer(Constants.MONITORS_SETTLE_DELAY_MS, () => runs++);
    settle.schedule();
    settle.schedule();
    await wait(settleWait);
    check(`monitors settle: changes in a row give one update (${runs})`, runs === 1);
    settle.schedule();
    settle.cancel();
    await wait(settleWait);
    check('monitors settle: nothing after cancel', runs === 1);

    const appletSource = readText(`${appletDir}/applet.js`);
    const settleBody = appletSource.slice(appletSource.indexOf('this._monitorsSettle = new AsyncHelpers.Debouncer('),
        appletSource.indexOf("this._monitorsChangedId = Main.layoutManager.connect('monitors-changed'"));
    check('warmth wiring: applet.js re-applies the Warmth once the monitors settle',
        settleBody.includes('this._warmth.applyStored();') && settleBody.includes('this._brightness.detect();'));
    check('warmth wiring: applet.js schedules the settle timer on every monitor change',
        appletSource.includes("Main.layoutManager.connect('monitors-changed', () => this._monitorsSettle.schedule());"));
    const setUp = appletSource.slice(appletSource.indexOf('    _setUpWarmth() {'), appletSource.indexOf('    _syncWarmth() {'));
    check('warmth wiring: _setUpWarmth applies the stored state at start',
        setUp.includes('this._warmth.applyStored();'));
    check('warmth wiring: _setUpWarmth stores the kelvin on release',
        setUp.includes('row.onRelease(Constants.WARMTH_SCROLL_COMMIT_MS, () => this._warmth.commitTemperature());'));
    check('warmth wiring: _setUpWarmth binds both Warmth keys to the outside-change handlers',
        setUp.includes('this.settings.bind(enabled.key, enabled.key, () => this._warmth.enabledChangedOutside());')
        && setUp.includes('this.settings.bind(kelvin.key, kelvin.key, () => this._warmth.kelvinChangedOutside());'));
    check('warmth wiring: applet.js retries the Warmth when the menu opens',
        appletSource.includes('this._warmth.menuOpened();'));
    const removed = appletSource.slice(appletSource.indexOf('    on_applet_removed_from_panel() {'));
    check('warmth wiring: the Warmth is destroyed before the settings are finalized',
        removed.indexOf('this._warmth.destroy();') !== -1
        && removed.indexOf('this._warmth.destroy();') < removed.indexOf('this.settings.finalize();'));
}

// UPower's KbdBacklight on a fake system bus: calls are answered at once, or fail when the
// object is absent.
class FakeKbdBus {
    constructor({ max = 2, level = 0, absent = false } = {}) {
        this.max = max;
        this.level = level;
        this.absent = absent;
        this.calls = [];
        // With holdSets, SetBrightness replies wait in held until answered by hand.
        this.holdSets = false;
        this.held = [];
        this.subscriptions = new Map();
        this.nextSubscription = 1;
    }

    signal_subscribe(name, iface, signal, path, arg0, flags, callback) {
        const id = this.nextSubscription++;
        this.subscriptions.set(id, { signal, callback });
        return id;
    }

    signal_unsubscribe(id) {
        this.subscriptions.delete(id);
    }

    call(name, path, iface, method, parameters, replyType, flags, timeout, cancellable, callback) {
        const call = { method, args: parameters ? parameters.deepUnpack() : [] };
        this.calls.push(`${method}${call.args.length ? ` ${call.args}` : ''}`);
        if (this.holdSets && method === 'SetBrightness')
            this.held.push(() => callback(this, call));
        else
            callback(this, call);
    }

    call_finish(call) {
        if (this.absent)
            throw new GLib.Error(Gio.DBusError, Gio.DBusError.UNKNOWN_OBJECT, 'No such object');
        if (call.method === 'GetMaxBrightness')
            return new GLib.Variant('(i)', [this.max]);
        if (call.method === 'GetBrightness')
            return new GLib.Variant('(i)', [this.level]);
        this.level = call.args[0];
        return null;
    }

    emitChanged(level) {
        this.level = level;
        for (const { signal, callback } of this.subscriptions.values()) {
            if (signal === 'BrightnessChanged')
                callback(this, ':1.1', '/org/freedesktop/UPower/KbdBacklight', 'org.freedesktop.UPower.KbdBacklight',
                    signal, new GLib.Variant('(i)', [level]));
        }
    }
}

function testKeyboardLight() {
    const Model = load('./kbdBacklightModel');
    check('keyboard: levels cycle 0, 1, 2, back to 0',
        Model.nextLevel(0, 2) === 1 && Model.nextLevel(1, 2) === 2 && Model.nextLevel(2, 2) === 0);
    check('keyboard: maximum 2 reads Off, Low, High',
        `${[0, 1, 2].map(level => Model.levelWord(level, 2))}` === 'Off,Low,High');
    check('keyboard: maximum 1 reads Off, On', `${[0, 1].map(level => Model.levelWord(level, 1))}` === 'Off,On');
    check(`keyboard: maximum 4 reads ${[0, 1, 2, 3, 4].map(level => Model.levelWord(level, 4))}`,
        `${[0, 1, 2, 3, 4].map(level => Model.levelWord(level, 4))}` === 'Off,Low,Low,Medium,High');
    check('keyboard: tile label', Model.tileLabel('Keyboard', 1, 2) === 'Keyboard Low');

    const KbdBacklight = load('./kbdBacklight');
    errors = [];
    const bus = new FakeKbdBus({ max: 2, level: 1 });
    let changes = 0;
    const light = new KbdBacklight.KbdBacklight(() => changes++, bus);
    check(`keyboard: reads the maximum and the level (${bus.calls})`, light.available && light.max === 2 && light.level === 1);
    light.cycle();
    light.cycle();
    check(`keyboard: clicks set 2 then 0 through UPower (${bus.calls.slice(2)})`,
        `${bus.calls.slice(2)}` === 'SetBrightness 2,SetBrightness 0' && light.level === 0);
    const seen = changes;
    bus.emitChanged(2);
    check('keyboard: follows BrightnessChanged (the keyboard hotkey)', light.level === 2 && changes === seen + 1);
    light.destroy();
    check('keyboard: destroy unsubscribes', bus.subscriptions.size === 0);

    const absentBus = new FakeKbdBus({ absent: true });
    const absent = new KbdBacklight.KbdBacklight(() => {}, absentBus);
    absent.cycle();
    check(`keyboard: no KbdBacklight object leaves the tile unavailable, no SetBrightness (${absentBus.calls})`,
        !absent.available && `${absentBus.calls}` === 'GetMaxBrightness');
    absent.destroy();
    const noLevels = new KbdBacklight.KbdBacklight(() => {}, new FakeKbdBus({ max: 0 }));
    check('keyboard: a maximum of 0 leaves the tile unavailable', !noLevels.available);
    noLevels.destroy();
    check('keyboard: a maximum of 0 stays at 0', Model.nextLevel(0, 0) === 0 && Model.levelWord(0, 0) === 'Off');

    const slowBus = new FakeKbdBus({ max: 2, level: 0 });
    const slow = new KbdBacklight.KbdBacklight(() => {}, slowBus);
    slowBus.holdSets = true;
    slow.cycle();
    slow.cycle();
    check(`keyboard: two quick clicks go two steps (${slowBus.calls.slice(2)})`, `${slowBus.calls.slice(2)}` === 'SetBrightness 1,SetBrightness 2');
    slowBus.held.shift()();
    check('keyboard: the reply of an older click does not show its level', slow.level === 0);
    slowBus.held.shift()();
    check('keyboard: the reply of the last click shows its level', slow.level === 2);
    slow.cycle();
    slowBus.emitChanged(1);
    slowBus.held.shift()();
    check(`keyboard: a late reply never overwrites a level reported since (${slow.level})`, slow.level === 1);
    slow.destroy();
    errors = [];
}

// Radios whose change arrives later, as libnm and BlueZ report it.
function fakeRadio(on, { refuseOff = false } = {}) {
    const radio = { on, writes: [] };
    radio.isOn = () => radio.on;
    radio.setOn = (value, onFailed) => {
        radio.writes.push(value);
        if (refuseOff && !value)
            onFailed();
    };
    radio.arrive = () => {
        if (radio.writes.length)
            radio.on = radio.writes[radio.writes.length - 1];
    };
    return radio;
}

function testAirplaneMode() {
    const AirplaneMode = load('./airplaneMode');
    {
        const stubborn = fakeRadio(true, { refuseOff: true });
        const other = fakeRadio(true);
        let notified = 0;
        const refused = new AirplaneMode.AirplaneMode([stubborn, other], () => notified++);
        refused.toggle();
        check(`airplane: a radio that refuses to turn off ends airplane mode, the tile unchecks (${notified} notice)`,
            !refused.active && notified === 1 && stubborn.on);
        other.arrive();
        refused.sync();
        check('airplane: after a refusal, a later radio change keeps it unchecked', !refused.active);
    }
    let wifi = fakeRadio(true);
    let bluetooth = fakeRadio(true);
    let airplane = new AirplaneMode.AirplaneMode([wifi, bluetooth]);
    airplane.toggle();
    airplane.sync();
    check('airplane: a click turns both radios off, checked while their change is on its way',
        airplane.active && `${wifi.writes}` === 'false' && `${bluetooth.writes}` === 'false');
    wifi.arrive();
    airplane.sync();
    bluetooth.arrive();
    airplane.sync();
    check('airplane: stays checked once both are off', airplane.active);
    airplane.toggle();
    check('airplane: a second click turns both back on', !airplane.active && `${wifi.writes}` === 'false,true' && `${bluetooth.writes}` === 'false,true');

    wifi = fakeRadio(false);
    bluetooth = fakeRadio(true);
    airplane = new AirplaneMode.AirplaneMode([wifi, bluetooth]);
    airplane.toggle();
    bluetooth.arrive();
    airplane.sync();
    airplane.toggle();
    check('airplane: Wi-Fi already off stays off after restore, Bluetooth comes back',
        wifi.writes.length === 0 && `${bluetooth.writes}` === 'false,true');

    wifi = fakeRadio(true);
    bluetooth = fakeRadio(true);
    airplane = new AirplaneMode.AirplaneMode([wifi, bluetooth]);
    airplane.toggle();
    wifi.arrive();
    bluetooth.arrive();
    airplane.sync();
    bluetooth.on = true;
    airplane.sync();
    check('airplane: Bluetooth turned on by hand unchecks the tile', !airplane.active);
    airplane.toggle();
    check('airplane: the next click starts airplane mode again, it restores nothing old',
        airplane.active && `${wifi.writes}` === 'false' && `${bluetooth.writes}` === 'false,false');

    // The real Wi-Fi and Bluetooth code paths that airplane mode calls.
    const Wifi = load('./wifiState');
    const device = new FakeNmDevice();
    const client = new FakeNmClient(device);
    const wifiState = new Wifi.WifiState(() => {}, (cancellable, onReady) => onReady(client, null));
    wifiState.setEnabled(false);
    wifiState.setEnabled(true);
    check(`airplane: Wi-Fi goes through WirelessEnabled (${client.writes})`, `${client.writes}` === 'WirelessEnabled=false,WirelessEnabled=true');
    errors = [];
    let wifiRefused = 0;
    client.dbus_set_property_finish = () => {
        throw new GLib.Error(Gio.DBusError, Gio.DBusError.ACCESS_DENIED, 'Not authorized');
    };
    wifiState.setEnabled(false, () => wifiRefused++);
    check(`airplane: a refused WirelessEnabled write is logged and reported (${errors})`, wifiRefused === 1 && errors.length === 1);
    errors = [];
    wifiState.destroy();
    check('airplane: no NetworkManager disconnect() call', device.disconnectCalls === 0 && client.disconnectCalls === 0);
    const Bluetooth = load('./bluetooth');
    const calls = [];
    const system = {
        bus: { call: (name, path, iface, method, parameters) => calls.push(`${method} ${parameters.deepUnpack()[2].unpack()}`) },
        newManager: () => {},
    };
    const bluetoothState = new Bluetooth.Bluetooth(() => {}, system);
    let bluetoothRefused = 0;
    bluetoothState.setPowered(false, () => bluetoothRefused++);
    check('airplane: no adapter, no Bluetooth call, reported as refused', calls.length === 0 && bluetoothRefused === 1);
    bluetoothState.summary = { available: true, powered: true, adapterPath: '/org/bluez/hci0', devices: [], connectedNames: [] };
    bluetoothState.setPowered(false);
    check(`airplane: Bluetooth goes through Adapter1.Powered (${calls})`, `${calls}` === 'Set false');
}

// Line 2 of a media block as shown: the artist part, then the player name.
function line2(text) {
    return `${text.artist}${text.player}`;
}

function testMediaModel() {
    const Model = load('./mediaModel');
    check('media: MPRIS names only', Model.isPlayerName('org.mpris.MediaPlayer2.vlc')
        && !Model.isPlayerName('org.mpris.MediaPlayer2.') && !Model.isPlayerName('org.freedesktop.Notifications') && !Model.isPlayerName(null));
    check(`media: player name from Identity, else the bus name (${Model.playerName('', 'org.mpris.MediaPlayer2.firefox.instance_1_2')})`,
        Model.playerName('VLC media player', 'org.mpris.MediaPlayer2.vlc') === 'VLC media player'
        && Model.playerName('', 'org.mpris.MediaPlayer2.firefox.instance_1_2') === 'Firefox'
        && Model.playerName(null, 'org.mpris.MediaPlayer2.vlc-4242') === 'Vlc'
        && Model.playerName(42, 'org.mpris.MediaPlayer2.player') === 'Player');
    const text = Model.blockText({ 'xesam:title': 'Song title', 'xesam:artist': ['Artist'] }, 'VLC');
    check(`media: title, then artist · player (${JSON.stringify(text)})`,
        text.title === 'Song title' && line2(text) === 'Artist · VLC');
    check('media: several artists joined with a comma',
        line2(Model.blockText({ 'xesam:title': 'Duet', 'xesam:artist': ['First', 'Second'] }, 'VLC')) === 'First, Second · VLC');
    check('media: no artist, the player name alone',
        line2(Model.blockText({ 'xesam:title': 'Video title' }, 'Firefox')) === 'Firefox'
        && line2(Model.blockText({ 'xesam:title': 'Video title', 'xesam:artist': [] }, 'Firefox')) === 'Firefox'
        && line2(Model.blockText({ 'xesam:title': 'Video title', 'xesam:artist': ['', '  '] }, 'Firefox')) === 'Firefox');
    check('media: an artist given as a string works too',
        line2(Model.blockText({ 'xesam:title': 'T', 'xesam:artist': 'Channel' }, 'Firefox')) === 'Channel · Firefox');
    const nameAlone = '{"title":"","artist":"","player":"Videos"}';
    check('media: no title, empty title or a non-text title, and no window title: the player name alone',
        [{}, { 'xesam:title': '  ' }, { 'xesam:title': 7 }, null].every(metadata => JSON.stringify(Model.blockText(metadata, 'Videos')) === nameAlone)
        && JSON.stringify(Model.blockText({}, 'Videos', '  \u200E ')) === nameAlone && JSON.stringify(Model.blockText({}, 'Videos', 42)) === nameAlone);
    // Regression: GNOME Videos publishes no xesam:title; its block takes its window's title.
    const windowTitled = Model.blockText({ 'mpris:length': 1000 }, 'Videos', 'A holiday clip.mkv');
    check(`media: no track title, line 1 is the window title, line 2 the player name (${JSON.stringify(windowTitled)})`,
        JSON.stringify(windowTitled) === '{"title":"A holiday clip.mkv","artist":"","player":"Videos"}');
    check('media: a track title wins over the window title',
        Model.blockText({ 'xesam:title': 'Song' }, 'VLC', 'Song - VLC media player').title === 'Song');
    const oddWindow = Model.blockText({}, 'Videos', `\u202Eclip\u0007\n${'w'.repeat(60)}`);
    check(`media: the window title is cleaned and cut like a track title (${oddWindow.title})`,
        oddWindow.title.startsWith('clip w') && !/[\u0000-\u001F\u202E]/.test(oddWindow.title)
        && [...oddWindow.title].length === 44 && oddWindow.title.endsWith('…'));
    check('media: playing only while PlaybackStatus is Playing',
        Model.isPlaying({ PlaybackStatus: 'Playing' }) && !Model.isPlaying({ PlaybackStatus: 'Paused' })
        && !Model.isPlaying({ PlaybackStatus: 'Stopped' }) && !Model.isPlaying({}) && !Model.isPlaying(null));
    check('media: a track title, once cleaned, is what counts as one',
        Model.hasTrackTitle({ 'xesam:title': 'Song' }) && !Model.hasTrackTitle({ 'xesam:title': ' \u200E' })
        && !Model.hasTrackTitle({ 'xesam:title': 7 }) && !Model.hasTrackTitle({}) && !Model.hasTrackTitle(null));
    const odd = Model.blockText({ 'xesam:title': 'Line one\nline two\t<b>x</b>', 'xesam:artist': ['A & B'] }, 'VLC');
    const hidden = Model.blockText({ 'xesam:title': 'Song\u202Eeltit\u202C\u0007 one\u2066x\u2069\u200E', 'xesam:artist': ['\u200FArtist\u001B'] }, Model.playerName('VLC\u0000', 'org.mpris.MediaPlayer2.vlc'));
    check(`media: control and bidi characters are removed from every text (${JSON.stringify(hidden)})`,
        hidden.title === 'Songeltit onex' && hidden.artist === 'Artist · ' && hidden.player === 'VLC');
    check(`media: newlines and tabs become spaces, markup characters stay as text (${odd.title})`,
        odd.title === 'Line one line two <b>x</b>' && line2(odd) === 'A & B · VLC');
    check('media: line 2 in two parts, the separator with the artist, the player alone',
        JSON.stringify(text) === '{"title":"Song title","artist":"Artist · ","player":"VLC"}'
        && JSON.stringify(Model.blockText({ 'xesam:title': 'Video title' }, 'Firefox')) === '{"title":"Video title","artist":"","player":"Firefox"}');
    const longArtist = Model.blockText({ 'xesam:title': 'T', 'xesam:artist': ['B'.repeat(30)] }, 'VLC media player');
    check(`media: a long artist is cut, the player name stays whole (${line2(longArtist)})`,
        longArtist.artist === `${'B'.repeat(19)}… · ` && longArtist.player === 'VLC media player');
    const longPlayer = Model.blockText({ 'xesam:title': 'T', 'xesam:artist': ['Band'] }, 'A player with a long name');
    check(`media: a long player name is cut at 16 characters (${longPlayer.player})`,
        longPlayer.player === 'A player with a…' && [...longPlayer.player].length === 16 && longPlayer.artist === 'Band · ');
    const long = Model.blockText({ 'xesam:title': 'T'.repeat(60), 'xesam:artist': ['A'.repeat(30)] }, 'A very long player');
    check(`media: long texts are cut with an ellipsis (${line2(long)})`,
        [...long.title].length === 44 && long.title.endsWith('…')
        && line2(long) === `${'A'.repeat(19)}… · A very long pla…`);

    const states = props => Model.buttonStates(props);
    const all = { CanControl: true, CanGoPrevious: true, CanGoNext: true, CanPlay: true, CanPause: true };
    const playing = states({ ...all, PlaybackStatus: 'Playing' });
    check('media: playing shows pause, every button works',
        playing.playPause.icon === 'media-playback-pause-symbolic' && playing.playPause.label === 'Pause'
        && playing.previous.working && playing.playPause.working && playing.next.working
        && playing.previous.method === 'Previous' && playing.playPause.method === 'PlayPause' && playing.next.method === 'Next');
    const paused = states({ ...all, PlaybackStatus: 'Paused' });
    check('media: paused or stopped shows play',
        paused.playPause.icon === 'media-playback-start-symbolic' && states({ ...all, PlaybackStatus: 'Stopped' }).playPause.label === 'Play');
    check('media: CanGoPrevious and CanGoNext false make those buttons inactive',
        !states({ ...all, CanGoPrevious: false, CanGoNext: false }).previous.working
        && !states({ ...all, CanGoPrevious: false, CanGoNext: false }).next.working);
    check('media: play needs CanPlay, pause needs CanPause',
        !states({ ...all, CanPlay: false, PlaybackStatus: 'Paused' }).playPause.working
        && !states({ ...all, CanPause: false, PlaybackStatus: 'Playing' }).playPause.working
        && states({ ...all, CanPause: false, PlaybackStatus: 'Paused' }).playPause.working);
    const noControl = states({ ...all, CanControl: false, PlaybackStatus: 'Playing' });
    check('media: CanControl false makes every button inactive',
        !noControl.previous.working && !noControl.playPause.working && !noControl.next.working);
    check('media: capabilities not read yet count as false', !states({}).previous.working && !states({}).playPause.working);

    const player = (busName, owner, identity, title) => ({
        busName, owner, identity, metadata: title ? { 'xesam:title': title } : {}, properties: all,
    });
    const blocks = Model.visibleBlocks([
        player('org.mpris.MediaPlayer2.vlc', ':1.10', 'VLC media player', 'Song title'),
        player('org.mpris.MediaPlayer2.firefox.instance_1_2', ':1.20', 'Firefox', 'Video title'),
        player('org.mpris.MediaPlayer2.firefox', ':1.20', 'Firefox', 'Video title'),
        player('org.mpris.MediaPlayer2.idle', ':1.30', 'Idle', null),
    ], 3);
    check(`media: one block per player, with or without a title, by name, a player's two names once (${blocks.map(b => b.busName)})`,
        `${blocks.map(b => b.busName)}` === 'org.mpris.MediaPlayer2.firefox.instance_1_2,org.mpris.MediaPlayer2.idle,org.mpris.MediaPlayer2.vlc');
    const untitled = Model.visibleBlocks([{ ...player('org.mpris.MediaPlayer2.totem', ':1.40', 'Videos', null), windowTitle: 'A holiday clip.mkv' },
        { ...player('org.mpris.MediaPlayer2.other', ':1.41', 'Other', null), properties: { ...all, PlaybackStatus: 'Playing' } }], 3);
    check(`media: regression, a player without xesam:title is shown, titled with its window, else its name alone (${untitled.map(b => JSON.stringify(b.text))})`,
        untitled.length === 2 && untitled[1].text.title === 'A holiday clip.mkv' && untitled[1].text.player === 'Videos'
        && untitled[0].text.title === '' && untitled[0].text.player === 'Other');
    check('media: a block is playing only while its player plays',
        untitled[0].playing === true && untitled[1].playing === false && blocks.every(block => block.playing === false));
    const same = Model.visibleBlocks([
        player('org.mpris.MediaPlayer2.b', ':1.2', 'Same', 'x'), player('org.mpris.MediaPlayer2.a', ':1.1', 'Same', 'x'),
    ], 3);
    check('media: same display name, ordered by bus name', `${same.map(b => b.busName)}` === 'org.mpris.MediaPlayer2.a,org.mpris.MediaPlayer2.b');
    const many = Model.visibleBlocks(['d', 'a', 'c', 'b'].map((n, i) => player(`org.mpris.MediaPlayer2.${n}`, `:1.${i}`, n.toUpperCase(), 't')), 3);
    check(`media: at most three blocks, the first three by name (${many.map(b => b.name)})`, `${many.map(b => b.name)}` === 'A,B,C');
    const moves = (before, after) => JSON.stringify(Model.blockMoves(before, after));
    check('media moves: nothing changes, nothing moves', moves(['a', 'b'], ['a', 'b']) === '{"remove":[],"steps":[]}');
    check(`media moves: a new player is added, the others stay (${moves(['a', 'c'], ['a', 'b', 'c'])})`,
        moves(['a', 'c'], ['a', 'b', 'c']) === '{"remove":[],"steps":[{"kind":"add","busName":"b","index":1}]}');
    check(`media moves: a gone player is removed only (${moves(['a', 'b', 'c'], ['a', 'c'])})`,
        moves(['a', 'b', 'c'], ['a', 'c']) === '{"remove":["b"],"steps":[]}');
    check(`media moves: a reorder moves one block (${moves(['a', 'b', 'c'], ['c', 'a', 'b'])})`,
        moves(['a', 'b', 'c'], ['c', 'a', 'b']) === '{"remove":[],"steps":[{"kind":"move","busName":"c","index":0}]}');
    check('media moves: from nothing, every block added in order',
        moves([], ['a', 'b']) === '{"remove":[],"steps":[{"kind":"add","busName":"a","index":0},{"kind":"add","busName":"b","index":1}]}');
    check('media moves: to nothing, every block removed', moves(['a', 'b'], []) === '{"remove":["a","b"],"steps":[]}');
    // Applying the moves to any old order gives the new order.
    const apply = (before, after) => {
        const { remove, steps } = Model.blockMoves(before, after);
        const list = before.filter(id => !remove.includes(id));
        for (const step of steps) {
            if (step.kind === 'move')
                list.splice(list.indexOf(step.busName), 1);
            list.splice(step.index, 0, step.busName);
        }
        return `${list}`;
    };
    const tints = order => order.map((busName, index) => `${busName}${Model.isTinted(index) ? '*' : ''}`).join(',');
    check(`media tint: one block plain, three blocks with the second tinted (${tints(['a', 'b', 'c'])})`,
        tints(['a']) === 'a' && tints(['a', 'b', 'c']) === 'a,b*,c');
    check(`media tint: follows the place on screen after a reorder, an add and a remove (${tints(['c', 'a', 'b'])})`,
        tints(['c', 'a', 'b']) === 'c,a*,b' && tints(['a', 'd', 'b', 'c']) === 'a,d*,b,c*' && tints(['a', 'c']) === 'a,c*');
    // The views get their tint from the order the moves produce.
    const tintAfter = (before, after) => {
        const { remove, steps } = Model.blockMoves(before, after);
        const list = before.filter(id => !remove.includes(id));
        for (const step of steps) {
            if (step.kind === 'move')
                list.splice(list.indexOf(step.busName), 1);
            list.splice(step.index, 0, step.busName);
        }
        return tints(list);
    };
    check('media tint: re-applied after the moves (b removed: c takes the tint; reorder swaps it)',
        tintAfter(['a', 'b', 'c'], ['a', 'c']) === 'a,c*' && tintAfter(['a', 'b'], ['b', 'a']) === 'b,a*');
    // The views as menuContent drives them: moves, then update and tint for the new place.
    const fakeViews = new Map();
    const screen = [];
    const actions = {
        create: busName => ({
            busName, tinted: null, updates: 0, destroyed: false, accent: 'unset',
            setAccent(accent) {
                this.accent = accent;
            },
            update() {
                this.updates++;
            },
            setTinted(tinted) {
                this.tinted = tinted;
            },
            destroy() {
                this.destroyed = true;
                screen.splice(screen.indexOf(this), 1);
            },
        }),
        insert: (view, index) => screen.splice(index, 0, view),
        move: (view, index) => {
            screen.splice(screen.indexOf(view), 1);
            screen.splice(index, 0, view);
        },
    };
    const sync = order => {
        Model.syncBlockViews(fakeViews, screen.map(view => view.busName), order.map(busName => ({ busName })), actions);
        return screen.map(view => `${view.busName}${view.tinted ? '*' : ''}`).join(',');
    };
    check(`media views: three players, the second tinted (${sync(['a', 'b', 'c'])})`, `${screen.map(v => v.busName + (v.tinted ? '*' : ''))}` === 'a,b*,c');
    const kept = fakeViews.get('a');
    check(`media views: b leaves, c takes the tint, a is the same view (${sync(['a', 'c'])})`,
        `${screen.map(v => v.busName + (v.tinted ? '*' : ''))}` === 'a,c*' && fakeViews.get('a') === kept && !fakeViews.has('b'));
    check(`media views: a reorder moves the tint with the place (${sync(['c', 'a'])})`,
        `${screen.map(v => v.busName + (v.tinted ? '*' : ''))}` === 'c,a*' && fakeViews.get('a') === kept);
    check(`media views: one player left, plain (${sync(['a'])})`, `${screen.map(v => v.busName + (v.tinted ? '*' : ''))}` === 'a');
    check('media views: every view shown is updated on each pass', kept.updates === 4);
    check('media moves: applied, they always give the new order',
        [[['a', 'b', 'c'], ['b', 'd', 'a']], [['x'], ['y', 'x']], [['a', 'b', 'c'], ['c', 'b', 'a']], [['a'], ['a']]]
            .every(([before, after]) => apply(before, after) === `${after}`));
    Model.syncBlockViews(fakeViews, screen.map(view => view.busName), ['a', 'd'].map(busName => ({ busName })), actions, 'rgba(1, 2, 3, 1.000)');
    check(`media views: the accent reaches every view, a new one included (${screen.map(v => v.accent)})`,
        screen.length === 2 && screen.every(view => view.accent === 'rgba(1, 2, 3, 1.000)'));
    Model.syncBlockViews(fakeViews, screen.map(view => view.busName), ['a', 'd'].map(busName => ({ busName })), actions);
    check('media views: no accent given, every view back to the stylesheet colour', screen.every(view => view.accent === null));
    check('media: no player, no block', Model.visibleBlocks([], 3).length === 0);
    // Regression: the cap keeps the playing player even when it sorts last by name.
    const withStatus = (busName, identity, title, status) => ({ ...player(busName, `:9.${identity}`, identity, title), properties: { ...all, PlaybackStatus: status } });
    const capped = Model.visibleBlocks([
        withStatus('org.mpris.MediaPlayer2.a', 'Alpha', null, 'Stopped'),
        withStatus('org.mpris.MediaPlayer2.b', 'Beta', null, 'Stopped'),
        withStatus('org.mpris.MediaPlayer2.c', 'Gamma', null, 'Stopped'),
        withStatus('org.mpris.MediaPlayer2.z', 'Zulu', 'Song', 'Playing'),
    ], 3);
    check(`media cap: three idle players and one playing that sorts last, the playing one is kept (${capped.map(b => b.name)})`,
        `${capped.map(b => b.name)}` === 'Alpha,Beta,Zulu');
    const ranked = Model.visibleBlocks([
        withStatus('org.mpris.MediaPlayer2.a', 'Alpha', null, 'Stopped'),
        withStatus('org.mpris.MediaPlayer2.b', 'Beta', 'Track', 'Stopped'),
        withStatus('org.mpris.MediaPlayer2.c', 'Gamma', 'Track', 'Paused'),
        withStatus('org.mpris.MediaPlayer2.d', 'Delta', 'Track', 'Playing'),
    ], 3);
    check(`media cap: playing, then paused, then titled, the rest last; shown by name (${ranked.map(b => b.name)})`,
        `${ranked.map(b => b.name)}` === 'Beta,Delta,Gamma');
    const beforeResume = Model.visibleBlocks([
        withStatus('org.mpris.MediaPlayer2.b', 'Beta', 'Track', 'Paused'),
        withStatus('org.mpris.MediaPlayer2.a', 'Alpha', 'Track', 'Playing'),
    ], 3);
    const resumed = Model.visibleBlocks([
        withStatus('org.mpris.MediaPlayer2.b', 'Beta', 'Track', 'Playing'),
        withStatus('org.mpris.MediaPlayer2.a', 'Alpha', 'Track', 'Paused'),
    ], 3);
    check('media cap: under the cap, a play or pause never reorders the rows',
        `${beforeResume.map(b => b.name)}` === 'Alpha,Beta' && `${resumed.map(b => b.name)}` === 'Alpha,Beta');
    const owned = [player('org.mpris.MediaPlayer2.browser', ':1.70', 'Browser', null),
        player('org.mpris.MediaPlayer2.browser.instance_1_9', ':1.70', 'Browser', null),
        player('org.mpris.MediaPlayer2.music', ':1.71', 'Music', 'Song')];
    check(`media: the untitled players are one per owner, as the blocks (${JSON.stringify(Model.untitledPlayers(owned))})`,
        JSON.stringify(Model.untitledPlayers(owned)) === '[{"busName":"org.mpris.MediaPlayer2.browser.instance_1_9","owner":":1.70"}]'
        && `${Model.visibleBlocks(owned, 3).map(b => b.busName)}` === 'org.mpris.MediaPlayer2.browser.instance_1_9,org.mpris.MediaPlayer2.music');
    check('media: unknown owners are not merged',
        Model.visibleBlocks([player('org.mpris.MediaPlayer2.a', null, 'A', 't'), player('org.mpris.MediaPlayer2.b', null, 'B', 't')], 3).length === 2);
}

// The session bus with MPRIS players: names, owners and properties, answered at once
// (or held, with hold), signals delivered by emit helpers. Records calls and subscriptions.
class FakeMprisBus {
    constructor() {
        this.owners = new Map();
        this.properties = new Map();
        this.calls = [];
        this.failing = new Set();
        this.subscriptions = new Map();
        this.nextSubscription = 1;
        this.held = null;
        // Bus names whose GetAll answers with a wrong type; the text of every refusal.
        this.badGetAll = new Set();
        this.errorText = 'refused';
    }

    addPlayer(busName, owner, root, player) {
        this.owners.set(busName, owner);
        this.properties.set(busName, { 'org.mpris.MediaPlayer2': root, 'org.mpris.MediaPlayer2.Player': player });
    }

    signal_subscribe(sender, iface, signal, path, arg0, flags, callback) {
        const id = this.nextSubscription++;
        this.subscriptions.set(id, { sender, signal, callback });
        return id;
    }

    signal_unsubscribe(id) {
        this.subscriptions.delete(id);
    }

    call(name, path, iface, method, parameters, replyType, flags, timeout, cancellable, callback) {
        const call = { name, method, args: parameters ? parameters.deepUnpack() : [], cancellable, replyType };
        this.calls.push(`${name} ${method}${call.args.length ? ` ${call.args}` : ''}`);
        const answer = () => callback(this, call);
        if (this.held)
            this.held.push(answer);
        else
            answer();
    }

    call_finish(call) {
        if (call.cancellable && call.cancellable.is_cancelled())
            throw new GLib.Error(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED, 'Operation was cancelled');
        if (this.failing.has(call.method))
            throw new GLib.Error(Gio.DBusError, Gio.DBusError.FAILED, `${call.method} ${this.errorText}`);
        const reply = this._reply(call);
        // As GDBus does with a reply type: a reply of another type is an error.
        if (reply && call.replyType && reply.get_type_string() !== call.replyType.dup_string())
            throw new GLib.Error(Gio.IOErrorEnum, Gio.IOErrorEnum.INVALID_ARGUMENT, `wrong reply type ${reply.get_type_string()}`);
        return reply;
    }

    _reply(call) {
        if (call.method === 'GetAll' && this.badGetAll.has(call.name))
            return new GLib.Variant('(s)', ['not properties']);
        if (call.method === 'ListNames')
            return new GLib.Variant('(as)', [['org.freedesktop.DBus', ...this.owners.keys()]]);
        if (call.method === 'GetConnectionUnixProcessID') {
            // As the bus daemon: an unknown connection is an error, never an empty reply.
            if (!this.pids || !this.pids.has(call.args[0]))
                throw new GLib.Error(Gio.DBusError, Gio.DBusError.NAME_HAS_NO_OWNER, `Could not get PID of name '${call.args[0]}'`);
            const pid = this.pids.get(call.args[0]);
            return typeof pid === 'number' ? new GLib.Variant('(u)', [pid]) : new GLib.Variant('(s)', [String(pid)]);
        }
        if (call.method === 'GetNameOwner')
            return new GLib.Variant('(s)', [this.owners.get(call.args[0])]);
        if (call.method === 'GetAll')
            return new GLib.Variant('(a{sv})', [this.properties.get(call.name)[call.args[0]]]);
        return null;
    }

    subscribedTo(sender) {
        return [...this.subscriptions.values()].filter(sub => sub.sender === sender).length;
    }

    emitOwnerChanged(busName, oldOwner, newOwner) {
        for (const sub of [...this.subscriptions.values()]) {
            if (sub.signal === 'NameOwnerChanged')
                sub.callback(this, 'org.freedesktop.DBus', '/org/freedesktop/DBus', 'org.freedesktop.DBus', sub.signal,
                    new GLib.Variant('(sss)', [busName, oldOwner, newOwner]));
        }
    }

    emitRaw(busName, signal, variant) {
        for (const sub of [...this.subscriptions.values()]) {
            if (sub.signal === signal && (signal === 'NameOwnerChanged' || sub.sender === busName))
                sub.callback(this, busName, '/org/mpris/MediaPlayer2', 'org.freedesktop.DBus.Properties', signal, variant);
        }
    }

    emitPropertiesChanged(busName, iface, changed, invalidated = []) {
        for (const sub of [...this.subscriptions.values()]) {
            if (sub.signal === 'PropertiesChanged' && sub.sender === busName)
                sub.callback(this, busName, '/org/mpris/MediaPlayer2', 'org.freedesktop.DBus.Properties', sub.signal,
                    new GLib.Variant('(sa{sv}as)', [iface, changed, invalidated]));
        }
    }
}

function mprisPlayer(title, artists, status) {
    const metadata = {};
    if (title !== null)
        metadata['xesam:title'] = new GLib.Variant('s', title);
    if (artists)
        metadata['xesam:artist'] = new GLib.Variant('as', artists);
    return {
        Metadata: new GLib.Variant('a{sv}', metadata),
        PlaybackStatus: new GLib.Variant('s', status),
        CanControl: new GLib.Variant('b', true),
        CanGoPrevious: new GLib.Variant('b', true),
        CanGoNext: new GLib.Variant('b', false),
        CanPlay: new GLib.Variant('b', true),
        CanPause: new GLib.Variant('b', true),
    };
}

async function testMediaPlayers() {
    const MediaPlayers = load('./mediaPlayers');
    errors = [];
    const bus = new FakeMprisBus();
    bus.addPlayer('org.mpris.MediaPlayer2.vlc', ':1.10', { Identity: new GLib.Variant('s', 'VLC media player') },
        mprisPlayer('Song title', ['Artist'], 'Playing'));
    bus.addPlayer('org.mpris.MediaPlayer2.firefox.instance_1_2', ':1.20', { Identity: new GLib.Variant('s', 'Firefox') },
        mprisPlayer('Video title', ['Channel'], 'Paused'));
    let changes = 0;
    const players = new MediaPlayers.MediaPlayers(() => changes++, bus);
    const view = () => players.blocks.map(b => `${b.text.title} | ${line2(b.text)} | ${b.buttons.playPause.label}`).join(' / ');
    check(`media players: found at start, one block each, by name (${view()})`,
        view() === 'Video title | Channel · Firefox | Play / Song title | Artist · VLC media player | Pause');
    check('media players: one PropertiesChanged subscription per player',
        bus.subscribedTo('org.mpris.MediaPlayer2.vlc') === 1 && bus.subscribedTo('org.mpris.MediaPlayer2.firefox.instance_1_2') === 1);
    const vlc = players.blocks[1];
    check('media players: capabilities read (next off, previous on)', vlc.buttons.previous.working && !vlc.buttons.next.working);

    bus.emitPropertiesChanged('org.mpris.MediaPlayer2.vlc', 'org.mpris.MediaPlayer2.Player',
        { PlaybackStatus: new GLib.Variant('s', 'Paused') });
    check('media players: a status change updates the play button live', players.blocks[1].buttons.playPause.label === 'Play');
    bus.emitPropertiesChanged('org.mpris.MediaPlayer2.vlc', 'org.mpris.MediaPlayer2.Player',
        { Metadata: new GLib.Variant('a{sv}', { 'xesam:title': new GLib.Variant('s', 'Next song') }) });
    check(`media players: a new track updates the block live (${line2(players.blocks[1].text)})`,
        players.blocks[1].text.title === 'Next song' && line2(players.blocks[1].text) === 'VLC media player');
    bus.emitPropertiesChanged('org.mpris.MediaPlayer2.vlc', 'org.mpris.MediaPlayer2.Player',
        { Metadata: new GLib.Variant('a{sv}', {}) });
    check(`media players: a player that loses its track keeps its block, its name alone (${JSON.stringify(players.blocks[1].text)})`,
        players.blocks.length === 2 && players.blocks[1].text.title === '' && players.blocks[1].text.player === 'VLC media player');
    check(`media players: the players without a track title are listed for their window (${JSON.stringify(players.untitled)})`,
        JSON.stringify(players.untitled) === '[{"busName":"org.mpris.MediaPlayer2.vlc","owner":":1.10"}]');
    const beforeTitle = changes;
    players.setWindowTitle('org.mpris.MediaPlayer2.vlc', 'A clip\u0007 - VLC media player');
    await nextIdle();
    check(`media players: a window title, cleaned, titles the block and updates it once (${players.blocks[1].text.title})`,
        players.blocks[1].text.title === 'A clip - VLC media player' && changes === beforeTitle + 1);
    players.setWindowTitle('org.mpris.MediaPlayer2.vlc', 'A clip - VLC media player');
    players.setWindowTitle('org.mpris.MediaPlayer2.gone', 'Other');
    await nextIdle();
    check('media players: the same window title again, or one for an unknown player, changes nothing', changes === beforeTitle + 1);
    players.setWindowTitle('org.mpris.MediaPlayer2.vlc', null);

    bus.properties.get('org.mpris.MediaPlayer2.vlc')['org.mpris.MediaPlayer2.Player'] = mprisPlayer('Back', null, 'Playing');
    bus.emitPropertiesChanged('org.mpris.MediaPlayer2.vlc', 'org.mpris.MediaPlayer2.Player', {}, ['Metadata']);
    check('media players: an invalidated property is read again', players.blocks.some(b => b.text.title === 'Back'));

    bus.addPlayer('org.mpris.MediaPlayer2.spotify', ':1.30', { Identity: new GLib.Variant('s', 'Music') },
        mprisPlayer('Track', ['Band'], 'Playing'));
    bus.emitOwnerChanged('org.mpris.MediaPlayer2.spotify', '', ':1.30');
    check(`media players: a player that appears gets a block (${players.blocks.map(b => b.name)})`,
        players.blocks.some(b => b.name === 'Music'));
    bus.emitOwnerChanged('org.mpris.MediaPlayer2.spotify', ':1.30', '');
    check('media players: a player that leaves loses its block and its subscription at once',
        !players.blocks.some(b => b.name === 'Music') && bus.subscribedTo('org.mpris.MediaPlayer2.spotify') === 0);
    bus.emitOwnerChanged('org.freedesktop.Notifications', '', ':1.40');
    check('media players: other bus names are ignored', bus.subscribedTo('org.freedesktop.Notifications') === 0);

    players.call('org.mpris.MediaPlayer2.vlc', 'PlayPause');
    check(`media players: a button calls the player (${bus.calls[bus.calls.length - 1]})`,
        bus.calls[bus.calls.length - 1] === 'org.mpris.MediaPlayer2.vlc PlayPause');
    bus.failing.add('Next');
    players.call('org.mpris.MediaPlayer2.vlc', 'Next');
    check(`media players: a failed call is logged with the player name (${errors})`,
        errors.length === 1 && errors[0].includes('Next on the media player VLC media player failed'));
    errors = [];

    // One update per burst of changes.
    await nextIdle();
    const burst = changes;
    for (const status of ['Playing', 'Paused', 'Playing'])
        bus.emitPropertiesChanged('org.mpris.MediaPlayer2.vlc', 'org.mpris.MediaPlayer2.Player', { PlaybackStatus: new GLib.Variant('s', status) });
    check('media players: no update before the next idle', changes === burst);
    await nextIdle();
    check(`media players: three changes in a row give one update (${changes - burst})`, changes === burst + 1);

    bus.emitPropertiesChanged('org.mpris.MediaPlayer2.vlc', 'org.mpris.MediaPlayer2', { Identity: new GLib.Variant('s', 'Renamed') });
    check(`media players: an Identity change renames the block (${players.blocks.map(b => b.name)})`,
        players.blocks.some(b => b.name === 'Renamed'));

    errors = [];
    bus.emitPropertiesChanged('org.mpris.MediaPlayer2.vlc', 'org.mpris.MediaPlayer2.Player', { Metadata: new GLib.Variant('s', 'not a map') });
    bus.emitPropertiesChanged('org.mpris.MediaPlayer2.vlc', 'org.mpris.MediaPlayer2.Player', { CanGoNext: new GLib.Variant('s', 'yes') });
    check(`media players: a wrongly typed Metadata is ignored, the block kept, logged once (${errors})`,
        players.blocks.some(b => b.text.title === 'Back') && errors.length === 1 && errors[0].includes('sent Metadata of type s, ignored'));
    errors = [];
    bus.emitRaw('org.mpris.MediaPlayer2.firefox.instance_1_2', 'PropertiesChanged', new GLib.Variant('(s)', ['odd']));
    bus.emitRaw('org.mpris.MediaPlayer2.firefox.instance_1_2', 'PropertiesChanged', new GLib.Variant('(s)', ['odd']));
    bus.emitRaw('', 'NameOwnerChanged', new GLib.Variant('(s)', ['odd']));
    check(`media players: wrongly typed signals are ignored, logged once per player, no stack (${errors})`,
        errors.length === 1 && errors[0].includes('Firefox sent PropertiesChanged of type (s), ignored') && players.blocks.length === 2);
    errors = [];

    bus.properties.set('org.mpris.MediaPlayer2.vlc', {
        'org.mpris.MediaPlayer2': { Identity: new GLib.Variant('s', 'Other player') },
        'org.mpris.MediaPlayer2.Player': mprisPlayer('Other song', null, 'Paused'),
    });
    bus.emitOwnerChanged('org.mpris.MediaPlayer2.vlc', ':1.10', ':1.99');
    check(`media players: a name taken over by another process is read again (${players.blocks.map(b => b.name)})`,
        players.blocks.some(b => b.name === 'Other player' && b.text.title === 'Other song') && bus.subscribedTo('org.mpris.MediaPlayer2.vlc') === 1);

    bus.errorText = `refused ${'x'.repeat(500)}`;
    players.call('org.mpris.MediaPlayer2.vlc', 'Next');
    check(`media players: a player's error text is cut in the log (${errors[0] && errors[0].length} characters)`,
        errors.length === 1 && errors[0].includes('Next on the media player Other player failed: Next refused xxx') && errors[0].length < 250);
    errors = [];

    bus.emitPropertiesChanged('org.mpris.MediaPlayer2.vlc', 'org.mpris.MediaPlayer2',
        { CanRaise: new GLib.Variant('b', true), DesktopEntry: new GLib.Variant('s', 'vlc') });
    check(`media players: CanRaise and DesktopEntry are read for the focus (${JSON.stringify(players.focusInfo('org.mpris.MediaPlayer2.vlc'))})`,
        JSON.stringify(players.focusInfo('org.mpris.MediaPlayer2.vlc')) === '{"desktopEntry":"vlc","canRaise":true,"title":"Other song"}'
        && players.focusInfo('org.mpris.MediaPlayer2.gone') === null);
    errors = [];
    bus.emitPropertiesChanged('org.mpris.MediaPlayer2.firefox.instance_1_2', 'org.mpris.MediaPlayer2',
        { CanRaise: new GLib.Variant('s', 'yes'), DesktopEntry: new GLib.Variant('as', ['firefox']) });
    check(`media players: wrongly typed CanRaise and DesktopEntry are ignored (${JSON.stringify(players.focusInfo('org.mpris.MediaPlayer2.firefox.instance_1_2'))})`,
        JSON.stringify(players.focusInfo('org.mpris.MediaPlayer2.firefox.instance_1_2')) === '{"desktopEntry":null,"canRaise":false,"title":"Video title"}');
    errors = [];
    bus.pids = new Map([[':1.99', 4242]]);
    let pid = null;
    let noPid = 0;
    players.processId('org.mpris.MediaPlayer2.vlc', id => {
        pid = id;
    }, () => noPid++);
    players.processId('org.mpris.MediaPlayer2.gone', () => {}, () => noPid++);
    check(`media players: the owner's process id comes from GetConnectionUnixProcessID (${pid}, ${bus.calls.filter(c => c.includes('GetConnectionUnixProcessID'))})`,
        pid === 4242 && noPid === 1 && bus.calls.includes('org.freedesktop.DBus GetConnectionUnixProcessID :1.99'));
    errors = [];
    let failedPid = 0;
    bus.pids = new Map();
    players.processId('org.mpris.MediaPlayer2.vlc', () => {}, () => failedPid++);
    check(`media players: a failing process id call reaches onNone, logged once (${errors})`,
        failedPid === 1 && errors.length === 1 && errors[0].includes('finding the process of Other player failed'));
    errors = [];
    bus.pids = new Map([[':1.99', 'not a number']]);
    players.processId('org.mpris.MediaPlayer2.vlc', () => {}, () => failedPid++);
    check(`media players: a process id of another type reaches onNone, logged once (${errors})`,
        failedPid === 2 && errors.length === 1 && errors[0].includes('wrong reply type (s)'));
    errors = [];
    bus.pids = new Map([[':1.99', 4242]]);
    players.raise('org.mpris.MediaPlayer2.vlc');
    check('media players: Raise calls the root interface', bus.calls[bus.calls.length - 1] === 'org.mpris.MediaPlayer2.vlc Raise');
    const logged = [];
    globalThis.global.log = line => logged.push(line);
    players.noWindow('org.mpris.MediaPlayer2.vlc');
    players.noWindow('org.mpris.MediaPlayer2.vlc');
    globalThis.global.log = () => {};
    check(`media players: no window found is logged once per player (${logged})`,
        logged.length === 1 && logged[0].includes('no window found for the media player Other player'));

    await nextIdle();
    const before = changes;
    bus.emitPropertiesChanged('org.mpris.MediaPlayer2.vlc', 'org.mpris.MediaPlayer2.Player', { PlaybackStatus: new GLib.Variant('s', 'Paused') });
    players.destroy();
    check(`media players: destroy releases every subscription (${bus.subscriptions.size} left)`, bus.subscriptions.size === 0);
    bus.emitPropertiesChanged('org.mpris.MediaPlayer2.vlc', 'org.mpris.MediaPlayer2.Player', { PlaybackStatus: new GLib.Variant('s', 'Playing') });
    await nextIdle();
    check('media players: nothing runs after destroy, a pending update included', changes === before && players.blocks.length === 0);

    // Replies that arrive after the player left, or after destroy, change nothing.
    const slow = new FakeMprisBus();
    slow.addPlayer('org.mpris.MediaPlayer2.vlc', ':1.10', { Identity: new GLib.Variant('s', 'VLC') }, mprisPlayer('Song', null, 'Playing'));
    slow.held = [];
    let slowChanges = 0;
    const late = new MediaPlayers.MediaPlayers(() => slowChanges++, slow);
    slow.held.shift()();
    slow.held.shift()();
    slow.emitOwnerChanged('org.mpris.MediaPlayer2.vlc', ':1.10', '');
    await nextIdle();
    const beforeLate = slowChanges;
    while (slow.held.length > 0)
        slow.held.shift()();
    await nextIdle();
    check(`media players: a GetAll reply for a player that left is dropped, no update (${slowChanges - beforeLate})`,
        late.blocks.length === 0 && slow.subscriptions.size === 1 && slowChanges === beforeLate);
    late.destroy();
    const typed = new FakeMprisBus();
    typed.addPlayer('org.mpris.MediaPlayer2.odd', ':1.50', { Identity: new GLib.Variant('s', 'Odd') }, mprisPlayer('Song', null, 'Playing'));
    typed.badGetAll.add('org.mpris.MediaPlayer2.odd');
    errors = [];
    const oddPlayers = new MediaPlayers.MediaPlayers(() => {}, typed);
    check(`media players: a GetAll reply of another type is refused by its reply type, logged without stack (${errors.length})`,
        oddPlayers.blocks.length === 1 && oddPlayers.blocks[0].text.title === '' && !oddPlayers.blocks[0].buttons.playPause.working
        && errors.length === 2 && errors.every(line => line.includes('wrong reply type (s)'))
        && typed.calls.some(call => call.includes('GetAll')));
    oddPlayers.destroy();
    errors = [];

    const caps = new FakeMprisBus();
    const noControl = mprisPlayer('Song', null, 'Playing');
    noControl.CanControl = new GLib.Variant('b', false);
    caps.addPlayer('org.mpris.MediaPlayer2.radio', ':1.60', { Identity: new GLib.Variant('s', 'Radio') }, noControl);
    caps.addPlayer('org.mpris.MediaPlayer2.browser', ':1.70', { Identity: new GLib.Variant('s', 'Browser') }, mprisPlayer('Video', null, 'Playing'));
    caps.addPlayer('org.mpris.MediaPlayer2.browser.instance_1_9', ':1.70', { Identity: new GLib.Variant('s', 'Browser') }, mprisPlayer('Video', null, 'Playing'));
    const capPlayers = new MediaPlayers.MediaPlayers(() => {}, caps);
    const radio = capPlayers.blocks.find(b => b.name === 'Radio');
    check('media players: CanControl false over the bus makes every button inactive',
        radio && !radio.buttons.previous.working && !radio.buttons.playPause.working && !radio.buttons.next.working);
    check(`media players: two names of one owner give one block (${capPlayers.blocks.map(b => b.busName)})`,
        `${capPlayers.blocks.filter(b => b.name === 'Browser').map(b => b.busName)}` === 'org.mpris.MediaPlayer2.browser.instance_1_9');
    capPlayers.destroy();

    // A player that leaves before its GetAll fails is no error.
    const leaving = new FakeMprisBus();
    leaving.addPlayer('org.mpris.MediaPlayer2.vlc', ':1.10', { Identity: new GLib.Variant('s', 'VLC') }, mprisPlayer('Song', null, 'Playing'));
    leaving.failing.add('GetAll');
    leaving.held = [];
    const left = new MediaPlayers.MediaPlayers(() => {}, leaving);
    leaving.held.shift()();
    leaving.held.shift()();
    leaving.emitOwnerChanged('org.mpris.MediaPlayer2.vlc', ':1.10', '');
    errors = [];
    while (leaving.held.length > 0)
        leaving.held.shift()();
    check(`media players: a player gone before its GetAll failed is not logged (${errors})`, errors.length === 0);
    left.destroy();
    const afterDestroy = new FakeMprisBus();
    afterDestroy.addPlayer('org.mpris.MediaPlayer2.vlc', ':1.10', { Identity: new GLib.Variant('s', 'VLC') }, mprisPlayer('Song', null, 'Playing'));
    afterDestroy.held = [];
    let destroyedChanges = 0;
    const gone = new MediaPlayers.MediaPlayers(() => destroyedChanges++, afterDestroy);
    gone.destroy();
    while (afterDestroy.held.length > 0)
        afterDestroy.held.shift()();
    // A process id reply after destroy activates nothing and logs nothing.
    const afterPid = new FakeMprisBus();
    afterPid.addPlayer('org.mpris.MediaPlayer2.vlc', ':1.10', { Identity: new GLib.Variant('s', 'VLC') }, mprisPlayer('Song', null, 'Playing'));
    afterPid.pids = new Map([[':1.10', 42]]);
    const pidPlayers = new MediaPlayers.MediaPlayers(() => {}, afterPid);
    afterPid.held = [];
    let pidOutcome = 'nothing';
    pidPlayers.processId('org.mpris.MediaPlayer2.vlc', () => {
        pidOutcome = 'pid';
    }, () => {
        pidOutcome = 'none';
    });
    pidPlayers.destroy();
    afterPid.held.shift()();
    check(`media players: a process id reply after destroy changes nothing (${pidOutcome}, ${errors})`, pidOutcome === 'nothing' && errors.length === 0);
    check(`media players: replies after destroy add nothing and log nothing (${errors})`,
        destroyedChanges === 0 && afterDestroy.subscriptions.size === 0 && errors.length === 0);
    errors = [];
}

function testMediaFocus() {
    const Model = load('./mediaModel');
    const windows = [{ title: 'Inbox - Browser', userTime: 30 }, { title: 'Video title - Site - Browser', userTime: 10 },
        { title: 'Docs - Browser', userTime: 50 }];
    check('media focus: the window whose title holds the track title wins', Model.chooseWindow(windows, 'Video title') === 1);
    check('media focus: no title match, the window used last', Model.chooseWindow(windows, 'Other') === 2);
    check('media focus: an empty track title, the window used last', Model.chooseWindow(windows, '') === 2 && Model.chooseWindow(windows, null) === 2);
    check('media focus: several browser windows playing it, the most recent of them',
        Model.chooseWindow([{ title: 'Song - A', userTime: 5 }, { title: 'Song - B', userTime: 9 }, { title: 'Mail', userTime: 99 }], 'Song') === 1);
    check('media focus: no window, none', Model.chooseWindow([], 'Song') === -1);

    const Focus = load('./mediaFocus');
    const run = ({ info, appWindows = {}, pidWindows = {}, pid = null }) => {
        const done = [];
        const players = {
            focusInfo: () => info,
            processId: (busName, onPid, onNone) => (pid === null ? onNone() : onPid(pid)),
            raise: busName => done.push(`raise ${busName}`),
            noWindow: busName => done.push(`none ${busName}`),
        };
        const windowApi = {
            ofApp: entry => {
                done.push(`app ${entry}`);
                return appWindows[entry] || [];
            },
            ofPid: id => {
                done.push(`pid ${id}`);
                return pidWindows[id] || [];
            },
            describe: window => window,
            activate: window => done.push(`activate ${window.title}`),
        };
        Focus.focusPlayer('org.mpris.MediaPlayer2.vlc', players, windowApi, 1234);
        return `${done}`;
    };
    const vlcWindow = { title: 'Song - VLC media player', userTime: 1, pid: 42 };
    const vlc = { desktopEntry: 'vlc', canRaise: false, title: 'Song' };
    check(`media focus: VLC-like, the DesktopEntry window of the player's process (${run({ info: vlc, appWindows: { vlc: [vlcWindow] }, pid: 42 })})`,
        run({ info: vlc, appWindows: { vlc: [vlcWindow] }, pid: 42 }) === 'app vlc,activate Song - VLC media player');
    const browserWindows = [
        { title: 'Mail - Browser', userTime: 90, pid: 50 },
        { title: 'Video title - Site - Browser', userTime: 10, pid: 50 },
        { title: 'Other profile - Browser', userTime: 99, pid: 51 },
    ];
    check('media focus: Firefox-like, among the process windows the one playing the track',
        run({ info: { desktopEntry: 'firefox-esr', canRaise: true, title: 'Video title' }, appWindows: { 'firefox-esr': browserWindows }, pid: 50 })
            === 'app firefox-esr,activate Video title - Site - Browser');
    check('media focus: no title match, the process window used last, whatever the order given',
        run({ info: { desktopEntry: 'firefox-esr', canRaise: true, title: 'Nothing' }, appWindows: { 'firefox-esr': browserWindows }, pid: 50 })
            === 'app firefox-esr,activate Mail - Browser');
    const otherApp = [{ title: 'Passwords', userTime: 5, pid: 99 }];
    check(`media focus: a player naming another application's DesktopEntry raises nothing of it (${run({ info: { desktopEntry: 'org.example.Passwords', canRaise: false, title: 'Song' }, appWindows: { 'org.example.Passwords': otherApp }, pid: 42 })})`,
        run({ info: { desktopEntry: 'org.example.Passwords', canRaise: false, title: 'Song' }, appWindows: { 'org.example.Passwords': otherApp }, pid: 42 })
            === 'app org.example.Passwords,pid 42,none org.mpris.MediaPlayer2.vlc');
    check('media focus: no application window of the process, a window of the process',
        run({ info: { desktopEntry: 'vlc', canRaise: true, title: 'Song' }, pidWindows: { 42: [vlcWindow] }, pid: 42 }) === 'app vlc,pid 42,activate Song - VLC media player');
    check('media focus: no DesktopEntry, straight to the process',
        run({ info: { desktopEntry: null, canRaise: false, title: 'Song' }, pidWindows: { 42: [vlcWindow] }, pid: 42 }) === 'pid 42,activate Song - VLC media player');
    check('media focus: no window at all, MPRIS Raise when the player offers it',
        run({ info: { desktopEntry: 'vlc', canRaise: true, title: 'Song' }, pid: 42 }) === 'app vlc,pid 42,raise org.mpris.MediaPlayer2.vlc');
    check('media focus: process id unknown, no unverified application window, Raise',
        run({ info: { desktopEntry: 'vlc', canRaise: true, title: 'Song' }, appWindows: { vlc: [vlcWindow] } }) === 'raise org.mpris.MediaPlayer2.vlc');
    check('media focus: process id unknown and no Raise, only the log',
        run({ info: { desktopEntry: 'vlc', canRaise: false, title: 'Song' }, appWindows: { vlc: [vlcWindow] } }) === 'none org.mpris.MediaPlayer2.vlc');
    check('media focus: nothing found and no Raise, only the log',
        run({ info: { desktopEntry: 'vlc', canRaise: false, title: 'Song' }, pid: 42 }) === 'app vlc,pid 42,none org.mpris.MediaPlayer2.vlc');
    check('media focus: a player no longer listed does nothing', run({ info: null }) === '');

    // The click's time reaches every activation, also after the asynchronous pid reply.
    const times = [];
    let answerPid = null;
    const slowPlayers = {
        focusInfo: () => ({ desktopEntry: 'vlc', canRaise: false, title: 'Song' }),
        processId: (busName, onPid) => {
            answerPid = () => onPid(42);
        },
        raise: () => {},
        noWindow: () => {},
    };
    const timedWindows = {
        ofApp: entry => (entry === 'app' ? [{ title: 'App', userTime: 1, pid: 42 }] : []),
        ofPid: () => [{ title: 'Process window', userTime: 1, pid: 42 }],
        describe: window => window,
        activate: (window, time) => times.push(`${window.title}@${time}`),
    };
    Focus.focusPlayer('org.mpris.MediaPlayer2.vlc', slowPlayers, timedWindows, 777);
    check('media focus: nothing activated before the pid reply', times.length === 0);
    answerPid();
    Focus.focusPlayer('org.mpris.MediaPlayer2.app', {
        ...slowPlayers,
        focusInfo: () => ({ desktopEntry: 'app', canRaise: false, title: '' }),
        processId: (busName, onPid) => onPid(42),
    }, timedWindows, 888);
    check(`media focus: the click's time is used after the asynchronous pid reply and for application windows (${times})`,
        `${times}` === 'Process window@777,App@888');
}

// Fake windows for the window title tests: each window's title watch is recorded, its
// handlers fired by hand.
function fakeTitleWindows(byPid) {
    const watched = [];
    return {
        watched,
        ofApp: () => [],
        ofPid: pid => byPid[pid] || [],
        describe: window => window,
        watchTitle: (window, onTitle, onGone) => {
            const watch = { window, onTitle, onGone, released: false };
            watched.push(watch);
            return () => {
                watch.released = true;
            };
        },
    };
}

// Fake players for MediaWindowTitles: process id answers held until answer(), every
// setWindowTitle recorded.
function fakeTitlePlayers() {
    const players = {
        set: [],
        pending: [],
        focusInfo: () => ({ desktopEntry: null, canRaise: false, title: '' }),
        processId: (busName, onPid, onNone) => players.pending.push({ busName, onPid, onNone }),
        setWindowTitle: (busName, title) => players.set.push(`${busName}=${title}`),
        answer: pids => {
            const pending = players.pending;
            players.pending = [];
            for (const { busName, onPid, onNone } of pending) {
                if (pids[busName] === undefined)
                    onNone();
                else
                    onPid(pids[busName]);
            }
        },
    };
    return players;
}

const untitled = (...busNames) => busNames.map(busName => ({ busName, owner: `:owner.${busName}` }));

// The window titles of players without a track title, on fake players and fake windows
// whose title signals are fired by hand.
function testMediaWindowTitles() {
    const Focus = load('./mediaFocus');
    const found = [];
    const finder = {
        focusInfo: busName => (busName === 'gone' ? null : { desktopEntry: 'videos', canRaise: false, title: '' }),
        processId: (busName, onPid, onNone) => (busName === 'nopid' ? onNone() : onPid(42)),
    };
    const own = { title: 'Own', userTime: 5, pid: 42 };
    const closedOne = { title: 'Closed', userTime: 50, pid: 42 };
    const finderWindows = {
        ofApp: () => [{ title: 'Other process', userTime: 99, pid: 7 }, own, closedOne],
        ofPid: () => [],
        describe: window => window,
    };
    for (const busName of ['videos', 'nopid', 'gone'])
        Focus.findPlayerWindow(busName, finder, finderWindows, window => found.push(window.title), () => found.push('none'));
    Focus.findPlayerWindow('videos', finder, finderWindows, window => found.push(window.title), () => found.push('none'), new Set([closedOne]));
    check(`media window: own process only, the window used last, else none; an excluded window is left out (${found})`,
        `${found}` === 'Closed,none,none,Own');

    const Titles = load('./mediaWindowTitles');
    const players = fakeTitlePlayers();
    const set = players.set;
    const byPid = { 42: [{ title: 'First clip', userTime: 3, pid: 42 }, { title: 'Second clip', userTime: 8, pid: 42 }], 43: [] };
    const windows = fakeTitleWindows(byPid);
    const watched = windows.watched;
    const titles = new Titles.MediaWindowTitles(players, windows);
    titles.follow(untitled('videos', 'nowindow'));
    titles.follow(untitled('videos', 'nowindow'));
    check(`media window titles: one process lookup per player while one is pending (${players.pending.length})`, players.pending.length === 2);
    players.answer({ videos: 42, nowindow: 43 });
    check(`media window titles: the window used last gives the title, no window gives none (${set})`,
        `${set}` === 'videos=Second clip,nowindow=null' && watched.length === 1 && watched[0].window.title === 'Second clip');
    set.length = 0;
    watched[0].window.title = 'Renamed clip';
    watched[0].onTitle();
    check(`media window titles: a title change reaches the block (${set})`, `${set}` === 'videos=Renamed clip');
    set.length = 0;
    titles.follow(untitled('videos', 'nowindow'));
    check(`media window titles: a followed window is not looked up again, a player without one is (${players.pending.map(a => a.busName)})`,
        `${players.pending.map(a => a.busName)}` === 'nowindow');
    byPid[43] = [{ title: 'Late window', userTime: 1, pid: 43 }];
    players.answer({ nowindow: 43 });
    check(`media window titles: a window that appeared later is found at the next follow (${set})`, `${set}` === 'nowindow=Late window');
    set.length = 0;
    const videosWatch = watched[0];
    titles.follow(untitled('nowindow'));
    check(`media window titles: a player that got a track title has its window released and its window title cleared (${set})`,
        videosWatch.released && !watched[1].released && `${set}` === 'videos=null');

    // Two windows: the one used last closes, the other one takes over.
    titles.follow(untitled('nowindow', 'videos'));
    players.answer({ videos: 42 });
    set.length = 0;
    const closing = watched[watched.length - 1];
    closing.onGone();
    check(`media window titles: a window that goes away clears the title (${set})`, `${set}` === 'videos=null');
    set.length = 0;
    titles.follow(untitled('nowindow', 'videos'));
    players.answer({ videos: 42 });
    check(`media window titles: the window gone is left out, the other window of the player gives the title (${set})`,
        `${set}` === 'videos=First clip' && watched[watched.length - 1] !== closing && watched[watched.length - 1].window.title === 'First clip');

    // On menu opening the windows are looked for again: a window used since takes over.
    set.length = 0;
    const firstWatch = watched[watched.length - 1];
    titles.follow(untitled('nowindow', 'videos'));
    check('media window titles: a player change does not look again for a player with a window',
        !players.pending.some(a => a.busName === 'videos'));
    byPid[42].push({ title: 'Third clip', userTime: 90, pid: 42 });
    titles.follow(untitled('nowindow', 'videos'), true);
    players.answer({ videos: 42, nowindow: 43 });
    check(`media window titles: on menu opening the window used last since takes over, the old watch released (${set})`,
        `${set}` === 'videos=Third clip' && firstWatch.released && watched[watched.length - 1].window.title === 'Third clip'
        && !watched[watched.length - 1].released);
    set.length = 0;
    const thirdWatch = watched[watched.length - 1];
    const watchesBefore = watched.length;
    titles.follow(untitled('nowindow', 'videos'), true);
    players.answer({ videos: 42, nowindow: 43 });
    check('media window titles: the same window found again keeps its watch, no update',
        watched.length === watchesBefore && !thirdWatch.released && set.length === 0);

    // A bus name taken over by another process: a new entry, the late reply for the old dropped.
    titles.follow(untitled('nowindow', 'videos').map(p => ({ ...p })), true);
    const oldReply = players.pending.find(a => a.busName === 'videos');
    players.pending = players.pending.filter(a => a !== oldReply);
    set.length = 0;
    titles.follow([{ busName: 'nowindow', owner: ':owner.nowindow' }, { busName: 'videos', owner: ':new.owner' }]);
    check(`media window titles: a new owner releases the old entry and looks again (${set}, ${players.pending.map(a => a.busName)})`,
        thirdWatch.released && `${set}` === 'videos=null' && players.pending.some(a => a.busName === 'videos'));
    set.length = 0;
    oldReply.onPid(42);
    check(`media window titles: the late reply for the old owner is dropped (${set})`, set.length === 0);
    players.answer({ videos: 42, nowindow: 43 });
    check(`media window titles: the new owner gets its own title (${set})`, set.includes('videos=Third clip'));

    titles.follow(untitled('nowindow', 'videos'));
    set.length = 0;
    titles.destroy();
    const watchCount = watched.length;
    const afterDestroy = [...set];
    set.length = 0;
    byPid[42] = [{ title: 'After destroy', userTime: 1, pid: 42 }];
    players.answer({ videos: 42 });
    titles.follow(untitled('videos'));
    check(`media window titles: destroy releases every window, late replies and follows do nothing (${afterDestroy})`,
        watched.every(watch => watch.released || watch === closing) && watched.length === watchCount && set.length === 0
        && players.pending.length === 0);
}

// The real watchTitle() on a fake Meta.Window recording connect and disconnect.
function testMediaWindowsWatch() {
    const Windows = load('./mediaWindows').CINNAMON_WINDOWS;
    const log = [];
    const handlers = new Map();
    let nextId = 1;
    const window = {
        connect: (signal, handler) => {
            const id = nextId++;
            handlers.set(id, { signal, handler });
            log.push(`connect ${signal}`);
            return id;
        },
        disconnect: id => {
            handlers.delete(id);
            log.push(`disconnect ${id}`);
        },
    };
    const emit = signal => [...handlers.values()].filter(h => h.signal === signal).forEach(h => h.handler(window));
    let titles = 0;
    let gone = 0;
    const release = Windows.watchTitle(window, () => titles++, () => gone++);
    emit('notify::title');
    check(`media watch: notify::title and unmanaged connected, a title change reaches onTitle (${log})`,
        `${log}` === 'connect notify::title,connect unmanaged' && titles === 1);
    release();
    check(`media watch: release disconnects both handlers (${log.slice(2)})`, `${log.slice(2)}` === 'disconnect 1,disconnect 2' && handlers.size === 0);
    release();
    check('media watch: a second release does nothing', log.length === 4);
    log.length = 0;
    const order = [];
    Windows.watchTitle(window, () => {}, () => order.push(`gone with ${handlers.size} handlers`));
    emit('unmanaged');
    check(`media watch: unmanaged disconnects both handlers before onGone, once (${log}; ${order})`,
        `${log}` === 'connect notify::title,connect unmanaged,disconnect 3,disconnect 4' && `${order}` === 'gone with 0 handlers'
        && handlers.size === 0 && gone === 0);
}

// The media controls' flow on the fake session bus and fake windows: the follow before the
// blocks, the players and the window titles started and stopped together.
async function testMediaControls() {
    const Controls = load('./mediaControls');
    const bus = new FakeMprisBus();
    bus.addPlayer('org.mpris.MediaPlayer2.anyplayer', ':1.80', { Identity: new GLib.Variant('s', 'Any player') },
        mprisPlayer(null, null, 'Playing'));
    bus.addPlayer('org.mpris.MediaPlayer2.music', ':1.81', { Identity: new GLib.Variant('s', 'Music') },
        mprisPlayer('Song', null, 'Paused'));
    bus.pids = new Map([[':1.80', 80]]);
    const byPid = { 80: [{ title: 'A clip name', userTime: 1, pid: 80 }] };
    const windows = fakeTitleWindows(byPid);
    const shown = [];
    const controls = new Controls.MediaControls(blocks => shown.push(blocks), windows, bus);
    await nextIdle();
    await nextIdle();
    const last = () => shown[shown.length - 1] || [];
    const any = () => last().find(block => block.name === 'Any player');
    check(`media controls: a player without a track title is followed and titled with its window (${any() && any().text.title})`,
        any() && any().text.title === 'A clip name' && any().playing === true && windows.watched.length === 1);
    check('media controls: a titled player is not followed', last().find(block => block.name === 'Music').text.title === 'Song');
    byPid[80].push({ title: 'Newer window', userTime: 9, pid: 80 });
    controls.menuOpened();
    await nextIdle();
    check(`media controls: menu opening looks for the windows again (${any() && any().text.title})`,
        any() && any().text.title === 'Newer window' && windows.watched[0].released);
    const subscriptions = bus.subscriptions.size;
    controls.destroy();
    check(`media controls: destroy releases the window watches and the bus subscriptions (${subscriptions} before)`,
        subscriptions > 0 && bus.subscriptions.size === 0 && windows.watched.every(watch => watch.released));
}

// The accent of the playing bar, read from a fake theme node.
function testThemeColors() {
    const ThemeColors = load('./themeColors');
    const Constants = load('./constants');
    const actor = colors => ({
        get_stage: () => ({}),
        get_theme_node: () => ({
            lookup_color: property => (colors[property] ? [true, colors[property]] : [false, null]),
        }),
    });
    const themed = ThemeColors.readTileColors(actor({
        [Constants.THEME_TILE_COLOR]: { red: 51, green: 53, blue: 69, alpha: 255 },
        [Constants.THEME_TILE_CHECKED_COLOR]: { red: 189, green: 147, blue: 249, alpha: 128 },
    }));
    check(`theme colours: the accent is the checked tile colour made opaque (${themed && themed.accent}, ${themed && themed.normal.checked})`,
        themed && themed.accent === 'rgba(189, 147, 249, 1.000)' && themed.normal.checked === 'rgba(189, 147, 249, 0.502)');
    check('theme colours: no checked colour in the theme, no colours (the stylesheet fallback)',
        ThemeColors.readTileColors(actor({ [Constants.THEME_TILE_COLOR]: { red: 1, green: 1, blue: 1, alpha: 255 } })) === null
        && ThemeColors.readTileColors({ get_stage: () => null }) === null);
}

// Every quick-settings-* style class the applet's JavaScript sets has a selector in its
// stylesheet (the other classes, applet-label and system-status-icon, come from the theme).
// Listed apart: an existing class without any selector, kept until its owner decides.
const STYLE_CLASSES_WITHOUT_SELECTOR = ['quick-settings-list-label'];
function testStyleClassesHaveSelectors() {
    const dir = Gio.File.new_for_path(appletDir);
    const enumerator = dir.enumerate_children('standard::name', Gio.FileQueryInfoFlags.NONE, null);
    const css = readText(`${appletDir}/stylesheet.css`);
    const classes = new Set();
    let info;
    while ((info = enumerator.next_file(null)) !== null) {
        const name = info.get_name();
        if (!name.endsWith('.js'))
            continue;
        const source = readText(`${appletDir}/${name}`);
        const patterns = [/style_class:\s*'([^']+)'/g, /style_class_name\('([^']+)'\)/g, /_STYLE_CLASS\s*=\s*'([^']+)'/g,
            /(?:plainLabel|symbolicIcon)\([^)]*'(quick-settings-[^']+)'\)/g];
        for (const pattern of patterns) {
            for (const match of source.matchAll(pattern))
                match[1].split(/\s+/).forEach(styleClass => classes.add(styleClass));
        }
    }
    const missing = [...classes].filter(styleClass => styleClass.startsWith('quick-settings-')
        && !STYLE_CLASSES_WITHOUT_SELECTOR.includes(styleClass))
        .filter(styleClass => !new RegExp(`\\.${styleClass.replace(/[-]/g, '\\-')}(?![\\w-])`).test(css)).sort();
    check(`stylesheet: every style class set in the JavaScript has a selector (${classes.size} classes; missing: ${missing})`,
        classes.size > 20 && missing.length === 0);
}

// Release audit M3: the gating of the Charge tile, on a fake ChargeLimit. A hidden tile
// reads nothing and never returns to the limit on its own (the only write without a click);
// a shown one gets every battery change.
function testChargeGate() {
    const calls = [];
    const fakeCharge = {
        refresh: () => calls.push('refresh'),
        onBattery: battery => calls.push(battery),
    };
    const seen = () => calls.map(call => (call === 'refresh' ? call : 'battery')).join(' ');
    const ChargeGate = load('./chargeGate');
    const Constants = load('./constants');
    const gate = new ChargeGate.ChargeGate(fakeCharge);
    const unplugged = { onAc: false, full: true };
    gate.onBattery(unplugged);
    gate.setShown(false);
    check(`charge gate: a hidden tile reads nothing and gets no battery change (${seen()})`, calls.length === 0);
    gate.setShown(true);
    check(`charge gate: showing the tile reads once (${seen()})`, `${calls}` === 'refresh');
    gate.setShown(true);
    check(`charge gate: a layout change that keeps it shown reads nothing more (${seen()})`, `${calls}` === 'refresh');
    calls.length = 0;
    gate.onBattery(unplugged);
    gate.onBattery(null);
    check('charge gate: a shown tile gets each battery change, as given',
        calls.length === 2 && calls[0] === unplugged && calls[1] === null);
    calls.length = 0;
    gate.setShown(false);
    gate.onBattery(unplugged);
    check(`charge gate: hidden again, no read and no battery change (${seen()})`, calls.length === 0);
    gate.setShown(true);
    gate.onBattery(unplugged);
    check(`charge gate: shown again, one read then the battery changes (${seen()})`,
        calls.length === 2 && calls[0] === 'refresh' && calls[1] === unplugged);

    // The applet's two calls, which no fake can reach: the battery feed and the layout.
    const appletSource = readText(`${appletDir}/applet.js`);
    check('charge gate: applet.js feeds every battery change to the gate',
        appletSource.includes('this._chargeGate.onBattery(battery);'));
    check("charge gate: applet.js gives the gate the layout of the 'charge-limit' tile",
        appletSource.includes("this._chargeGate.setShown(tiles.includes('charge-limit'));"));
    check("charge gate: 'charge-limit' is the Charge tile's id",
        Constants.TILES.some(tile => tile.id === 'charge-limit'));
}

async function testChargeLimit() {
    const Model = load('./chargeModel');
    const Constants = load('./constants');
    check('charge: the active charge type is the bracketed one',
        Model.activeChargeType('Trickle Fast Standard [Adaptive] Custom\n') === 'Adaptive'
        && Model.activeChargeType('Trickle Fast Standard Adaptive [Custom]') === 'Custom'
        && Model.activeChargeType('Trickle Fast Standard Adaptive Custom') === null && Model.activeChargeType(null) === null);
    check('charge: Custom with the end at 80 is the limit state',
        Model.chargeState('Trickle Fast Standard Adaptive [Custom]\n', '80\n') === 'limit');
    check('charge: Adaptive, Custom with another end, or no mode marked, is the full state',
        Model.chargeState('Trickle Fast Standard [Adaptive] Custom', '80') === 'full'
        && Model.chargeState('Adaptive [Custom]', '90') === 'full'
        && Model.chargeState('Adaptive Custom', '80') === 'full');
    check('charge: a malformed end threshold is the full state, an unreadable file no state',
        Model.chargeState('[Custom]', 'eighty') === 'full' && Model.chargeState('[Custom]', '') === 'full'
        && Model.chargeState(null, '80') === null && Model.chargeState('[Custom]', null) === null);
    check('charge: labels and checked state',
        JSON.stringify(Model.tileView('limit')) === '{"checked":false,"label":"Charge 80%"}'
        && JSON.stringify(Model.tileView('full')) === '{"checked":true,"label":"Charge 100%"}');
    check(`charge: a click asks for the other state, through sudo -n and the helper (${Model.helperArgv('full')})`,
        Model.toggledState('limit') === 'full' && Model.toggledState('full') === 'limit'
        && `${Model.helperArgv('limit')}` === '/usr/bin/sudo,-n,/usr/local/sbin/battery-charge-limit,limit'
        && `${Model.helperArgv('full')}` === '/usr/bin/sudo,-n,/usr/local/sbin/battery-charge-limit,full');
    check(`charge: both labels are built from the constants (${Constants.CHARGE_LABELS.limit}, ${Constants.CHARGE_LABELS.full})`,
        Constants.CHARGE_LABELS.full === `${Constants.CHARGE_LABEL_PREFIX} ${Constants.CHARGE_FULL_PERCENT}${Constants.PERCENT_SUFFIX}`
        && Constants.CHARGE_LABELS.full === 'Charge 100%' && Constants.CHARGE_LABELS.limit === 'Charge 80%');
    check('charge: sudo is called by its absolute path', Constants.CHARGE_SUDO[0] === '/usr/bin/sudo');
    check('charge: the labels follow the thresholds', Constants.CHARGE_LABELS.limit === `Charge ${Constants.CHARGE_LIMIT_END}${Constants.PERCENT_SUFFIX}`
        && Constants.TILES.find(tile => tile.id === 'charge-limit').label === Constants.CHARGE_LABELS.limit);

    // Every input combination of the automatic return: state, seen full, on AC, battery full.
    const table = [];
    for (const state of ['limit', 'full']) {
        for (const seen of [false, true]) {
            for (const onAc of [false, true]) {
                for (const full of [false, true]) {
                    const out = Model.autoReturn(state, seen, onAc, full);
                    table.push(`${state[0]}${+seen}${+onAc}${+full}:${+out.seenFull}${+out.fire}`);
                }
            }
        }
    }
    const expected = [
        'l000:00', 'l001:00', 'l010:00', 'l011:00', 'l100:00', 'l101:00', 'l110:00', 'l111:00',
        'f000:00', 'f001:00', 'f010:00', 'f011:10', 'f100:01', 'f101:01', 'f110:10', 'f111:10',
    ];
    check(`charge: automatic return, the 16 combinations (${table.join(' ')})`, `${table}` === `${expected}`);

    // The tile on fake files and a fake command.
    const files = new Map([
        [Constants.CHARGE_TYPES_FILE, 'Trickle Fast Standard [Adaptive] Custom\n'],
        [Constants.CHARGE_END_FILE, '80\n'],
        [Constants.CHARGE_HELPER, '#!/bin/sh'],
    ]);
    const fakeFiles = { exists: path => files.has(path), readText: path => Promise.resolve(files.has(path) ? files.get(path) : null) };
    const runs = [];
    let failNext = false;
    const run = argv => {
        runs.push(argv.join(' '));
        if (failNext) {
            failNext = false;
            return Promise.reject(new Error('sudo: a password is required'));
        }
        const word = argv[argv.length - 1];
        files.set(Constants.CHARGE_TYPES_FILE, word === 'limit' ? 'Trickle Fast Standard Adaptive [Custom]' : 'Trickle Fast Standard [Adaptive] Custom');
        return Promise.resolve('');
    };
    let changes = 0;
    const ChargeLimit = load('./chargeLimit');
    const charge = new ChargeLimit.ChargeLimit(run, () => changes++, fakeFiles);
    await charge.refresh();
    check('charge tile: Adaptive today reads as full, available', charge.state === 'full' && charge.available && changes === 1);
    await charge.toggle();
    check(`charge tile: a click runs the helper for the limit, then reads again (${runs})`,
        `${runs}` === '/usr/bin/sudo -n /usr/local/sbin/battery-charge-limit limit' && charge.state === 'limit');
    errors = [];
    failNext = true;
    await charge.toggle();
    check(`charge tile: a refused sudo is logged, the tile shows the real state (${errors})`,
        errors.length === 1 && errors[0].includes('setting the battery charge to full failed: sudo: a password is required') && charge.state === 'limit');
    errors = [];

    // Automatic return: full, then full on AC, then unplugged: limit once.
    await charge.toggle();
    runs.length = 0;
    await charge.onBattery({ onAc: true, full: true });
    check('charge tile: full on AC is remembered, nothing run yet', runs.length === 0 && charge.state === 'full');
    await charge.onBattery({ onAc: false, full: true });
    check(`charge tile: unplugged after full, the limit comes back once (${runs})`,
        `${runs}` === '/usr/bin/sudo -n /usr/local/sbin/battery-charge-limit limit' && charge.state === 'limit');
    await charge.onBattery({ onAc: false, full: false });
    await charge.onBattery({ onAc: true, full: true });
    await charge.onBattery({ onAc: false, full: true });
    check('charge tile: in the limit state nothing more runs', runs.length === 1);
    await charge.onBattery(null);
    await charge.onBattery({ onAc: null, full: true });
    check('charge tile: no battery or an unknown power source decides nothing', runs.length === 1);

    files.delete(Constants.CHARGE_HELPER);
    await charge.refresh();
    check('charge tile: no helper installed, the tile is dimmed', !charge.available);
    runs.length = 0;
    await charge.toggle();
    check('charge tile: a dimmed tile runs nothing', runs.length === 0);
    files.set(Constants.CHARGE_HELPER, '#!/bin/sh');
    files.delete(Constants.CHARGE_END_FILE);
    await charge.refresh();
    check('charge tile: no sysfs threshold file, dimmed', !charge.available);
    const before = changes;
    charge.destroy();
    await charge.refresh();
    check('charge tile: nothing shown after destroy', changes === before);

    // Full chosen while the battery is already full on AC: seen full at once, so the first
    // reading on battery brings the limit back.
    files.set(Constants.CHARGE_END_FILE, '80\n');
    files.set(Constants.CHARGE_TYPES_FILE, 'Trickle Fast Standard Adaptive [Custom]');
    runs.length = 0;
    const atOnce = new ChargeLimit.ChargeLimit(run, () => {}, fakeFiles);
    await atOnce.onBattery({ onAc: true, full: true });
    await atOnce.toggle();
    check('charge tile: full chosen with the battery already full on AC', atOnce.state === 'full' && runs.length === 1);
    await atOnce.onBattery({ onAc: false, full: true });
    check(`charge tile: it counts as seen full at once, unplugging brings the limit back (${runs})`,
        runs.length === 2 && runs[1].endsWith(' limit') && atOnce.state === 'limit');
    atOnce.destroy();

    // A click while a write runs is ignored; a run that never ends is given up on.
    files.set(Constants.CHARGE_TYPES_FILE, 'Trickle Fast Standard Adaptive [Custom]');
    const hanging = [];
    const timeouts = [];
    // Stands in for runCommand's own kill: rejects as it does once the given timeout passes.
    const never = (argv, timeoutMs) => {
        hanging.push(argv.join(' '));
        timeouts.push(timeoutMs);
        return wait(timeoutMs).then(() => {
            throw new Error(`${argv.join(' ')} timed out after ${timeoutMs} ms, killed`);
        });
    };
    const stuck = new ChargeLimit.ChargeLimit(never, () => {}, fakeFiles, 50);
    await stuck.refresh();
    errors = [];
    const first = stuck.toggle();
    await stuck.toggle();
    check(`charge tile: a click during a running write is ignored (${hanging.length} run)`, hanging.length === 1);
    await first;
    check(`charge tile: the helper runs with the charge timeout, a run that never ends is logged (${timeouts}, ${errors})`,
        `${timeouts}` === '50' && errors.length === 1
        && errors[0].includes('setting the battery charge to full failed:') && errors[0].includes('timed out after 50 ms, killed'));
    await stuck.toggle();
    check('charge tile: usable again after the timeout', hanging.length === 2);
    errors = [];
    const longError = new ChargeLimit.ChargeLimit(() => Promise.reject(new Error(`refused ${'x'.repeat(500)}`)), () => {}, fakeFiles, 50);
    await longError.refresh();
    await longError.toggle();
    check(`charge tile: the error text is cut in the log (${errors[0] && errors[0].length} characters)`,
        errors.length === 1 && errors[0].length < 300);
    errors = [];
    const defaultTimeouts = [];
    const byDefault = new ChargeLimit.ChargeLimit((argv, timeoutMs) => {
        defaultTimeouts.push(timeoutMs);
        return Promise.resolve('');
    }, () => {}, fakeFiles);
    await byDefault.refresh();
    await byDefault.toggle();
    check(`charge tile: the helper's timeout defaults to CHARGE_HELPER_TIMEOUT_MS (${defaultTimeouts})`,
        defaultTimeouts.length === 1 && defaultTimeouts[0] === Constants.CHARGE_HELPER_TIMEOUT_MS);
    byDefault.destroy();
    stuck.destroy();
    longError.destroy();
}

// The applet's charge values are the helper's: read from the helper's constants.
function testChargeHelperAgrees() {
    const Constants = load('./constants');
    const helper = readText(`${GLib.path_get_dirname(fixturesRoot)}/../system/battery-charge-limit/battery-charge-limit`);
    const value = name => {
        const match = helper.match(new RegExp(`^readonly ${name}='?([^'\n]*)'?$`, 'm'));
        return match ? match[1] : null;
    };
    const pairs = [
        ['BATTERY_DIR', Constants.CHARGE_BATTERY_DIR], ['LIMIT_MODE', Constants.CHARGE_LIMIT_MODE],
        ['FULL_MODE', Constants.CHARGE_FULL_MODE], ['LIMIT_START', `${Constants.CHARGE_LIMIT_START}`],
        ['LIMIT_END', `${Constants.CHARGE_LIMIT_END}`],
    ];
    const mismatches = pairs.filter(([name, applet]) => value(name) !== applet).map(([name, applet]) => `${name}=${value(name)}/${applet}`);
    check(`charge: the applet and the helper agree on the battery, modes and thresholds (${mismatches.length ? mismatches : 'all equal'})`,
        mismatches.length === 0);
    check('charge: the helper accepts exactly the applet\'s two words',
        helper.includes(`limit | full) ;;`) && Constants.CHARGE_HELPER_WORDS.limit === 'limit' && Constants.CHARGE_HELPER_WORDS.full === 'full'
        && helper.includes(`if [ "$1" = '${Constants.CHARGE_HELPER_WORDS.limit}' ]; then`));
    check('charge: the applet reads the files the helper writes',
        Constants.CHARGE_TYPES_FILE === `${value('BATTERY_DIR')}/charge_types` && Constants.CHARGE_END_FILE === `${value('BATTERY_DIR')}/charge_control_end_threshold`);
}

function testBatteryModel() {
    const Model = load('./batteryModel');
    const kinds = { battery: 2, unknownState: 0, onAcStates: [1, 4, 5], onBatteryStates: [2, 3, 6], fullyCharged: 4 };
    const text = readText(`${powerFixtures}/get-devices.txt`);
    const devices = GLib.Variant.parse(new GLib.VariantType('(a(sssusduut))'), text, null, null).deepUnpack()[0];
    const battery = Model.pickBattery(devices, null, kinds);
    check(`battery: captured devices give the laptop battery (${battery && battery.percent}%)`,
        battery !== null && battery.percent === 100 && battery.iconString.includes('battery-level-100-charged-symbolic'));
    check('battery: no battery hides the figure', Model.pickBattery(devices.filter(d => d[3] !== 2), null, kinds) === null);
    check('battery: label', Model.label(87) === '87%');
    check(`battery: the captured fully charged battery is on AC and full (${battery.onAc}, ${battery.full})`, battery.onAc === true && battery.full);
    const device = (state, percentage) => ['/bat', '', '', 2, 'battery-symbolic', percentage, state, 0, 0];
    const read = (state, percentage) => Model.pickBattery([device(state, percentage)], null, kinds);
    check('battery: charging is on AC, discharging on battery, not full below 100 %',
        read(1, 60).onAc === true && read(2, 60).onAc === false && !read(2, 60).full && read(5, 80).onAc === true);
    check('battery: 100 % while discharging counts as full; an unlisted state is neither on AC nor on battery',
        read(2, 100).full && read(2, 100).onAc === false && read(7, 50).onAc === null);
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
        ['tiles', Constants.TILE_LAYOUT_ITEMS], ['sliders', Constants.SLIDERS], ['header', Constants.HEADER_ITEMS], ['panel-icons', Constants.PANEL_ICON_ITEMS],
    ];
    for (const [key, declared] of groups) {
        check(`settings dialog: ${key} defaults are every element shown, in declaration order`,
            JSON.stringify(schema[key].default) === JSON.stringify(declared.map(item => ({ show: true, id: item.id }))));
    }
    check('settings dialog: rows show names, store ids',
        schema.tiles.columns[1].options['Power profile'] === 'power-profile' && schema.header.columns[1].options.Battery === 'battery');
    check('settings dialog: mockup names',
        `${Object.keys(schema.tiles.columns[1].options)}` === 'Wi-Fi,Bluetooth,VPN,NordVPN,Power profile,Airplane mode,Keyboard light,Charge limit,Dark style,Do Not Disturb,Keep awake,Mic mute,Media controls'
        && `${Object.keys(schema.sliders.columns[1].options)}` === 'Sound,Microphone,Brightness,Warmth'
        && `${Object.keys(schema.header.columns[1].options)}` === 'Battery,Screenshot,Settings,Lock,Power'
        && `${Object.keys(schema['panel-icons'].columns[1].options)}` === 'Wi-Fi,VPN,Bluetooth,Volume,Battery');
}

function testLayoutModel() {
    const Model = load('./layoutModel');
    const declared = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
    check('layout: nothing stored gives the declaration order, all shown', `${Model.visibleIds(null, declared)}` === 'a,b,c,d');
    check('layout: the stored order wins', `${Model.visibleIds(Model.defaults(declared).reverse(), declared)}` === 'd,c,b,a');
    const hidden = [{ show: true, id: 'b' }, { show: false, id: 'a' }, { show: true, id: 'c' }, { show: true, id: 'd' }];
    check('layout: a hidden row is left out', `${Model.visibleIds(hidden, declared)}` === 'b,c,d');
    const messy = [{ show: true, id: 'zz' }, { show: true, id: 'c' }, { show: false, id: 'c' }, null, { show: true }, { show: true, id: 'a' }];
    check(`layout: unknown ids ignored, first duplicate kept, missing ones back shown (${Model.visibleIds(messy, declared)})`,
        `${Model.visibleIds(messy, declared)}` === 'b,c,a,d');
    check('layout: an emptied list brings everything back', `${Model.visibleIds([], declared)}` === 'a,b,c,d');
    // A declared element missing from the stored list goes just before its first declared
    // successor the list holds, else at the end.
    const ids = stored => stored.map(id => ({ show: true, id }));
    check(`layout: a missing element goes before its successor (${Model.visibleIds(ids(['a', 'c', 'd']), declared)})`,
        `${Model.visibleIds(ids(['a', 'c', 'd']), declared)}` === 'a,b,c,d'
        && `${Model.visibleIds(ids(['d', 'c', 'a']), declared)}` === 'd,b,c,a');
    check(`layout: a missing element with no successor stored is appended (${Model.visibleIds(ids(['b', 'a', 'c']), declared)})`,
        `${Model.visibleIds(ids(['b', 'a', 'c']), declared)}` === 'b,a,c,d');
    check(`layout: several missing in a row keep their declared order (${Model.visibleIds(ids(['a', 'd']), declared)})`,
        `${Model.visibleIds(ids(['a', 'd']), declared)}` === 'a,b,c,d'
        && `${Model.visibleIds(ids(['c']), declared)}` === 'a,b,c,d');
    check('layout: a missing element keeps the hidden state of the others',
        JSON.stringify(Model.normalize([{ show: false, id: 'c' }], declared))
        === '[{"id":"a","show":true},{"id":"b","show":true},{"id":"c","show":false},{"id":"d","show":true}]');
    const Constants = load('./constants');
    // The owner's saved Tiles list: it still holds night-light, a tile that no longer exists.
    const saved = [
        ...['wifi', 'bluetooth', 'night-light', 'nordvpn', 'vpn', 'power-profile'].map(id => ({ show: true, id })),
        ...['dark-style', 'do-not-disturb', 'keep-awake', 'mic-mute'].map(id => ({ show: false, id })),
    ];
    const ownerTiles = Model.visibleIds(saved, Constants.TILE_LAYOUT_ITEMS);
    check(`layout: the owner's saved Tiles list drops night-light and places the new tiles by the defaults (${ownerTiles})`,
        `${ownerTiles}` === 'wifi,bluetooth,nordvpn,vpn,power-profile,airplane-mode,keyboard-light,charge-limit,media');
    const ownerSplit = Model.splitTileLayout(ownerTiles, Constants.MEDIA_ITEM.id);
    check('layout: the media controls are split off the tiles and show', ownerSplit.media && !ownerSplit.tileIds.includes('media'));
    check('layout: hidden media controls do not show', !Model.splitTileLayout(['wifi', 'vpn'], Constants.MEDIA_ITEM.id).media);
    // A list saved while the CPU line existed: cpu-line dropped, Media controls added, shown.
    const withCpu = [...Model.defaults(Constants.TILES), { show: false, id: 'cpu-line' }];
    const cpuUpdate = Model.storedUpdate(withCpu, Constants.TILE_LAYOUT_ITEMS);
    check(`layout: a saved list with cpu-line and no media loads cleanly (${cpuUpdate.slice(-2).map(row => `${row.id}:${row.show}`)})`,
        !cpuUpdate.some(row => row.id === 'cpu-line') && cpuUpdate[cpuUpdate.length - 1].id === 'media' && cpuUpdate[cpuUpdate.length - 1].show
        && Model.visibleIds(withCpu, Constants.TILE_LAYOUT_ITEMS).includes('media'));
    check('layout: no cpu-line is declared', !Constants.TILE_LAYOUT_ITEMS.some(item => item.id === 'cpu-line'));
    const ownerRows = Model.rows(ownerSplit.tileIds, Constants.TILES_PER_ROW);
    check(`layout: the owner's tile rows (${JSON.stringify(ownerRows)})`,
        JSON.stringify(ownerRows) === '[["wifi","bluetooth"],["nordvpn","vpn"],["power-profile","airplane-mode"],["keyboard-light","charge-limit"]]');
    check('layout: the owner\'s hidden tiles stay hidden',
        Model.normalize(saved, Constants.TILE_LAYOUT_ITEMS).filter(row => !row.show).map(row => row.id).join() === 'dark-style,do-not-disturb,keep-awake,mic-mute');
    check(`layout: default tile order (${Constants.TILES.map(item => item.id)})`,
        `${Constants.TILES.map(item => item.id)}` === 'wifi,bluetooth,vpn,nordvpn,power-profile,airplane-mode,keyboard-light,charge-limit,dark-style,do-not-disturb,keep-awake,mic-mute');
    // The owner's saved Tiles list today (written back by the earlier versions): the Charge
    // tile lands after Keyboard light, on the last row.
    const savedNow = [
        ...['wifi', 'bluetooth', 'nordvpn', 'vpn', 'power-profile', 'airplane-mode', 'keyboard-light'].map(id => ({ show: true, id })),
        ...['dark-style', 'do-not-disturb', 'keep-awake', 'mic-mute'].map(id => ({ show: false, id })),
        { show: true, id: 'media' },
    ];
    const nowTiles = Model.splitTileLayout(Model.visibleIds(savedNow, Constants.TILE_LAYOUT_ITEMS), Constants.MEDIA_ITEM.id);
    const nowRows = Model.rows(nowTiles.tileIds, Constants.TILES_PER_ROW);
    check(`layout: the owner's saved list gets [Keyboard] [Charge] as its last row (${JSON.stringify(nowRows)})`,
        JSON.stringify(nowRows[nowRows.length - 1]) === '["keyboard-light","charge-limit"]' && nowRows.length === 4 && nowTiles.media);
    check('layout: no touchpad tile is declared', !Constants.TILE_LAYOUT_ITEMS.some(item => item.id === 'touchpad'));
    const defaultRows = Model.rows(Constants.TILES.map(item => item.id), Constants.TILES_PER_ROW);
    check(`layout: in the default order VPN and NordVPN share one row (${JSON.stringify(defaultRows[1])})`,
        defaultRows.some(row => row.includes('vpn') && row.includes('nordvpn'))
        && JSON.stringify(defaultRows[1]) === '["vpn","nordvpn"]');
    check('layout: no night-light tile is declared', !Constants.TILE_LAYOUT_ITEMS.some(item => item.id === 'night-light'));
    check('layout: a saved Sliders list gets Warmth after Brightness, a saved Panel list gets Battery after the icons',
        `${Model.visibleIds(Model.defaults(Constants.SLIDERS.slice(0, 3)), Constants.SLIDERS)}` === 'output,input,monitors,warmth'
        && `${Model.visibleIds(Model.defaults(Constants.PANEL_ICON_ITEMS.slice(0, 4)).reverse(), Constants.PANEL_ICON_ITEMS)}` === 'volume,bluetooth,vpn,wifi,battery');
    check(`panel: default order (${Constants.PANEL_ICON_ITEMS.map(item => item.id)})`,
        `${Constants.PANEL_ICON_ITEMS.map(item => item.id)}` === 'wifi,vpn,bluetooth,volume,battery');
    const savedPanel = ['wifi', 'bluetooth', 'vpn', 'volume'].map(id => ({ show: true, id }));
    check(`panel: the owner's saved Panel list keeps its order, Battery appended (${Model.visibleIds(savedPanel, Constants.PANEL_ICON_ITEMS)})`,
        `${Model.visibleIds(savedPanel, Constants.PANEL_ICON_ITEMS)}` === 'wifi,bluetooth,vpn,volume,battery');
    check('layout: a saved Header list is kept as stored',
        `${Model.visibleIds(Model.defaults(Constants.HEADER_ITEMS).reverse(), Constants.HEADER_ITEMS)}` === 'power,lock,settings,screenshot,battery');
    // The owner's lists as saved on disk by an older version: written back once, normalized.
    const disk = {
        tiles: saved,
        sliders: ['output', 'input', 'monitors'].map(id => ({ show: true, id })),
        header: Model.defaults(Constants.HEADER_ITEMS),
        'panel-icons': ['bluetooth', 'vpn', 'volume', 'wifi'].map(id => ({ show: true, id })),
    };
    const declaredFor = {
        tiles: Constants.TILE_LAYOUT_ITEMS, sliders: Constants.SLIDERS,
        header: Constants.HEADER_ITEMS, 'panel-icons': Constants.PANEL_ICON_ITEMS,
    };
    const store = {
        values: JSON.parse(JSON.stringify(disk)),
        writes: [],
        getValue(key) {
            return this.values[key];
        },
        setValue(key, value) {
            this.writes.push(key);
            this.values[key] = value;
        },
    };
    const pass = () => Object.keys(declaredFor).filter(key => Model.writeBackLayout(store, key, declaredFor[key]));
    const first = pass();
    check(`layout write-back: the lists missing ids are written once (${first})`, `${first}` === 'tiles,sliders,panel-icons');
    const second = pass();
    check('layout write-back: a second pass writes nothing (no loop)', second.length === 0 && store.writes.length === 3);
    const rowsText = key => store.values[key].map(row => `${row.id}${row.show ? '' : ' (hidden)'}`).join(', ');
    check(`layout write-back: tiles keep their order and show flags (${rowsText('tiles')})`,
        rowsText('tiles') === 'wifi, bluetooth, nordvpn, vpn, power-profile, airplane-mode, keyboard-light, charge-limit, dark-style (hidden), do-not-disturb (hidden), keep-awake (hidden), mic-mute (hidden), media');
    check(`layout write-back: panel-icons (${rowsText('panel-icons')})`, rowsText('panel-icons') === 'bluetooth, vpn, volume, wifi, battery');
    check(`layout write-back: sliders (${rowsText('sliders')})`, rowsText('sliders') === 'output, input, monitors, warmth');
    check('layout write-back: rows keep the dialog shape { show, id }',
        Object.values(store.values).every(list => list.every(row => JSON.stringify(Object.keys(row)) === '["show","id"]')));
    check('layout write-back: a list already normalized is left alone',
        Model.storedUpdate(Model.defaults(Constants.SLIDERS), Constants.SLIDERS) === null);
    check('layout write-back: a row without a show flag is written back shown',
        JSON.stringify(Model.storedUpdate([{ id: 'output' }, ...Model.defaults(Constants.SLIDERS).slice(1)], Constants.SLIDERS)[0]) === '{"show":true,"id":"output"}');
    check('layout write-back: nothing stored writes the defaults',
        JSON.stringify(Model.storedUpdate(null, Constants.SLIDERS)) === JSON.stringify(Model.defaults(Constants.SLIDERS)));
    check('layout write-back: a removed id alone is enough to write',
        Model.storedUpdate([...Model.defaults(Constants.SLIDERS), { show: true, id: 'gone' }], Constants.SLIDERS) !== null);
    check('layout: odd count leaves one tile on the last row',
        JSON.stringify(Model.rows(['a', 'b', 'c'], 2)) === '[["a","b"],["c"]]');
    const all = { wifi: true, bluetooth: false, vpn: false, volume: true };
    const shown = Model.panelIconVisibility(['volume', 'wifi'], all);
    check('panel: allowed icons follow their state, no fallback', shown.visible.wifi && shown.visible.volume && !shown.fallback);
    check('panel: the settings never force an icon on', !Model.panelIconVisibility(['bluetooth'], all).visible.bluetooth);
    check('panel: every icon hidden gives the fallback', Model.panelIconVisibility([], all).fallback);
    check('panel: allowed icons all absent by state gives the fallback', Model.panelIconVisibility(['bluetooth', 'vpn'], all).fallback);
    const withBattery = { ...all, battery: true };
    check('panel: the battery level shows after the icons when allowed and present',
        Model.panelIconVisibility(['wifi', 'volume', 'battery'], withBattery).visible.battery);
    check('panel: no battery, no level', !Model.panelIconVisibility(['battery'], all).visible.battery);
    check('panel: the battery level alone needs no fallback', !Model.panelIconVisibility(['battery'], withBattery).fallback);
    const header = (ids, present) => JSON.stringify(Model.headerVisibility(ids, 'battery', present));
    check('header: battery shows only when allowed and present',
        header(['battery', 'lock'], true) === '{"battery":true,"line":true}' && header(['lock'], true) === '{"battery":false,"line":true}');
    check('header: everything hidden removes the line', header([], true) === '{"battery":false,"line":false}');
    check('header: battery alone on a machine without battery removes the line', header(['battery'], false) === '{"battery":false,"line":false}');

    const change = new Model.LayoutChange();
    check('layout change: the first call applies', change.changed({ tiles: ['a', 'b'], sliders: ['c'] }));
    check('layout change: the same ids in new arrays do not', !change.changed({ tiles: ['a', 'b'], sliders: ['c'] }));
    check('layout change: reordered ids apply', change.changed({ tiles: ['b', 'a'], sliders: ['c'] }));
    check('layout change: a hidden id applies', change.changed({ tiles: ['b'], sliders: ['c'] }));
    check('layout change: back to an earlier value applies', change.changed({ tiles: ['a', 'b'], sliders: ['c'] }));

    const appletSource = readText(`${appletDir}/applet.js`);
    const onChanged = appletSource.slice(appletSource.indexOf('    _onLayoutSettingChanged() {'), appletSource.indexOf('    _writeBackLayouts() {'));
    check('layout change: a settings reload re-applies the layout only when the visible ids changed',
        /this\._layoutChange\.changed\([^)]*\)\)\s*\{?\s*this\._applyLayout\(\);/.test(onChanged)
        && onChanged.split('this._applyLayout()').length === 2);
    const setUp = appletSource.slice(appletSource.indexOf('    _setUpLayoutSettings('), appletSource.indexOf('    _onLayoutSettingChanged() {'));
    const guardAt = setUp.search(/this\._layoutChange\s*=\s*new LayoutModel\.LayoutChange\(\)/);
    check('layout change: the guard exists before the first layout pass',
        guardAt !== -1 && guardAt < setUp.lastIndexOf('this._onLayoutSettingChanged();'));
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
    const started = GLib.get_monotonic_time();
    const hung = await Subprocess.runCommand(['/bin/sleep', '30'], 100).then(() => null, e => e.message);
    const elapsedMs = Math.round((GLib.get_monotonic_time() - started) / 1000);
    check(`subprocess: a hung command is killed and rejected as timed out (${hung}, ${elapsedMs} ms)`,
        hung !== null && hung.includes('/bin/sleep 30 timed out after 100 ms') && elapsedMs < 5000);
    // L1: the shell exits at once, its background sleep keeps the output pipes open past the
    // timeout, so the timeout fires on a process that has already exited successfully.
    const exited = await Subprocess.runCommand(['/bin/sh', '-c', '/bin/sleep 1 & exit 0'], 200).then(() => 'resolved', e => e.message);
    check(`subprocess: a command that exited before the timeout fired is a success, not timed out (${exited})`,
        exited === 'resolved');
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
    testWifiHardwareSwitch();
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
    await testNordvpnBusyGuard();
    testPowerProfileModel();
    await testBooleanSettings();
    testSettingsWrite();
    await testWarmthModel();
    await testGammastepWarmth();
    await testMonitorsSettle();
    testKeyboardLight();
    testAirplaneMode();
    testMediaModel();
    testChargeGate();
    await testChargeLimit();
    testChargeHelperAgrees();
    testMediaFocus();
    testMediaWindowTitles();
    testMediaWindowsWatch();
    await testMediaControls();
    testThemeColors();
    testStyleClassesHaveSelectors();
    await testMediaPlayers();
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
