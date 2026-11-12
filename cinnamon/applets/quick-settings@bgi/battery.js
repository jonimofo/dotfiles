const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const ByteArray = imports.byteArray;
const Constants = require('./constants');

const MAX_PERCENT = 100;

function readSysfsValue(path) {
    const [ok, bytes] = GLib.file_get_contents(path);
    return ok ? ByteArray.toString(bytes).trim() : null;
}

// The first power supply of type Battery, or null on a machine without one.
function findBatteryDir() {
    const dir = Gio.File.new_for_path(Constants.POWER_SUPPLY_DIR);
    const children = dir.enumerate_children('standard::name', Gio.FileQueryInfoFlags.NONE, null);
    try {
        let info;
        while ((info = children.next_file(null)) !== null) {
            const path = GLib.build_filenamev([Constants.POWER_SUPPLY_DIR, info.get_name()]);
            if (readSysfsValue(GLib.build_filenamev([path, 'type'])) === Constants.BATTERY_TYPE)
                return path;
        }
    } finally {
        children.close(null);
    }
    return null;
}

// Battery level in percent, read from sysfs, or null when there is no battery or it
// cannot be read. Live updates come with the system tiles step.
function readPercent() {
    try {
        const batteryDir = findBatteryDir();
        if (!batteryDir)
            return null;
        const capacity = parseInt(readSysfsValue(GLib.build_filenamev([batteryDir, 'capacity'])), 10);
        return Number.isNaN(capacity) ? null : Math.min(Math.max(capacity, 0), MAX_PERCENT);
    } catch (e) {
        global.logError(`${Constants.LOG_PREFIX}: reading the battery level under ${Constants.POWER_SUPPLY_DIR} failed`, e);
        return null;
    }
}

function iconName(percent) {
    const level = Math.round(percent / Constants.BATTERY_ICON_STEP) * Constants.BATTERY_ICON_STEP;
    return `${Constants.BATTERY_ICON_PREFIX}${level}${Constants.BATTERY_ICON_SUFFIX}`;
}

function label(percent) {
    return `${percent}${Constants.BATTERY_LABEL_SUFFIX}`;
}
