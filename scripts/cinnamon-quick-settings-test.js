// Logic tests of the quick-settings@bgi applet state modules, run by
// cinnamon-quick-settings-test.sh. Dark style runs on the memory GSettings backend; Wi-Fi
// reads the real NetworkManager state and never writes it (the D-Bus write is intercepted).
// Usage: GSETTINGS_BACKEND=memory gjs cinnamon-quick-settings-test.js <applet folder>
const GLib = imports.gi.GLib;
const ByteArray = imports.byteArray;
// Without the memory backend the Dark style tests would write the user's real setting.
if (GLib.getenv('GSETTINGS_BACKEND') !== 'memory') {
    printerr('Refusing to run: set GSETTINGS_BACKEND=memory');
    imports.system.exit(2);
}
const dir = ARGV[0];
const cache = {};
const errors = [];
globalThis.global = { logError: (...a) => errors.push(a.join(' ')) };
function load(name) {
    const file = name.replace('./', '') + '.js';
    if (cache[file]) return cache[file];
    const src = ByteArray.toString(GLib.file_get_contents(`${dir}/${file}`)[1]);
    const names = [...src.matchAll(/^(?:function|const|let|var|class) ([A-Za-z0-9_]+)/gm)].map(m => m[1]);
    cache[file] = new Function('require', `${src}\nreturn { ${names.join(', ')} };`)(load);
    return cache[file];
}
const loop = GLib.MainLoop.new(null, false);
let fails = 0;
const check = (label, cond) => { print(`${cond ? 'PASS' : 'FAIL'} ${label}`); if (!cond) fails++; };

// Dark style.
const Dark = load('./darkStyleState');
const Gio = imports.gi.Gio;
const s = new Gio.Settings({ schema_id: 'org.x.apps.portal' });
s.set_string('color-scheme', 'prefer-dark');
let changes = 0;
const dark = new Dark.DarkStyleState(() => changes++);
check('dark: prefer-dark reads as on', dark.enabled === true);
dark.toggle();
check('dark: toggle off writes default', s.get_string('color-scheme') === 'default' && dark.enabled === false);
dark.toggle();
check('dark: toggle on writes prefer-dark', s.get_string('color-scheme') === 'prefer-dark');
s.set_string('color-scheme', 'prefer-light');
check('dark: prefer-light reads as off', dark.enabled === false);
dark.toggle();
check('dark: toggle from prefer-light writes prefer-dark', s.get_string('color-scheme') === 'prefer-dark');
GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
    check(`dark: external changes notify (${changes} changes seen)`, changes >= 4);
    dark.destroy();
    // Wi-Fi: real NetworkManager, read only; the D-Bus write is intercepted.
    const Wifi = load('./wifiState');
    let ready = 0;
    const wifi = new Wifi.WifiState(() => {
        ready++;
        if (ready > 1) return;
        const nm = imports.gi.NM.Client.new(null);
        check('wifi: enabled matches NetworkManager', wifi.enabled === (nm.wireless_enabled && nm.wireless_hardware_enabled));
        let target = null;
        wifi._setWirelessEnabled = value => { target = value; };
        wifi.toggle();
        check(`wifi: toggle asks for ${!nm.wireless_enabled}`, target === !nm.wireless_enabled);
        wifi.destroy();
        check('no logged error', errors.length === 0);
        loop.quit();
    });
    return false;
});
loop.run();
if (fails) imports.system.exit(1);
