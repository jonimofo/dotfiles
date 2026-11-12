const Constants = require('./constants');

// What the Bluetooth tile, list and panel icon show, from plain data:
// @adapters: [{ path, powered }], @devices: [{ path, adapter, name, icon, paired, connected }].
// The first adapter is used; its paired devices are listed, connected ones first.
function summarize(adapters, devices) {
    const adapter = adapters[0] || null;
    if (!adapter)
        return { available: false, adapterPath: null, powered: false, devices: [], connectedNames: [] };

    const paired = devices
        .filter(device => device.adapter === adapter.path && device.paired)
        .sort((one, two) => Number(two.connected) - Number(one.connected) || one.name.localeCompare(two.name));
    return {
        available: true,
        adapterPath: adapter.path,
        powered: adapter.powered,
        devices: paired,
        connectedNames: paired.filter(device => device.connected).map(device => device.name),
    };
}

// The connected device's name when exactly one is connected, else the tile's own label.
function tileLabel(summary, defaultLabel) {
    return summary.powered && summary.connectedNames.length === 1 ? summary.connectedNames[0] : defaultLabel;
}

// Panel icon: none while off, the active variant while a device is connected.
function panelIconName(summary) {
    if (!summary.powered)
        return null;
    return summary.connectedNames.length > 0 ? Constants.BLUETOOTH_ON_ICON : Constants.BLUETOOTH_IDLE_ICON;
}
