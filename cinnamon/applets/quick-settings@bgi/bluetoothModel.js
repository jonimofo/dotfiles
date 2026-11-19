const Constants = require('./constants');
const PanelText = require('./panelText');

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

// The connected devices as the panel and the tile name them: the first in alphabetical
// order (summarize() sorts them; BlueZ gives no connection order), cut, then " +N" for the
// others. Null while the adapter is off or nothing is connected.
function deviceName(summary) {
    return summary.powered ? PanelText.countedName(summary.connectedNames) : null;
}

// deviceName(), else the tile's own label.
function tileLabel(summary, defaultLabel) {
    return deviceName(summary) || defaultLabel;
}

// Panel icon: the active variant while a device is connected, the idle one while on. While
// off: the struck-through icon when airplane mode turned it off (@airplaneActive), else none.
function panelIconName(summary, airplaneActive = false) {
    if (!summary.powered)
        return airplaneActive ? Constants.BLUETOOTH_OFF_ICON : null;
    return summary.connectedNames.length > 0 ? Constants.BLUETOOTH_ON_ICON : Constants.BLUETOOTH_IDLE_ICON;
}
