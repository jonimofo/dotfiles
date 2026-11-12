const Constants = require('./constants');
const WifiNetworks = require('./wifiNetworks');

// What each in-place list shows, built from plain state. @actions holds the callbacks.
// Every spec: { title, items: [...], settings: { label, onActivate } or null }.

function settingsEntry(key, onActivate) {
    return { label: Constants.LIST_SETTINGS_LABELS[key], onActivate };
}

// @networks: from WifiNetworks.buildNetworkList().
function wifiSpec(networks, actions) {
    return {
        title: Constants.LIST_TITLES.wifi,
        items: networks.map(network => ({
            label: network.ssid,
            active: network.active,
            secure: network.secure,
            trailingIconName: WifiNetworks.signalIconName(network.strength),
            onActivate: () => actions.connect(network),
        })),
        settings: settingsEntry('wifi', actions.openSettings),
    };
}

// @summary: from BluetoothModel.summarize(). Paired devices; none while the adapter is off.
function bluetoothSpec(summary, actions) {
    const devices = summary.powered ? summary.devices : [];
    return {
        title: Constants.LIST_TITLES.bluetooth,
        items: devices.map(device => ({
            label: device.name,
            active: device.connected,
            iconName: device.icon ? `${device.icon}${Constants.SYMBOLIC_SUFFIX}` : Constants.BLUETOOTH_DEVICE_ICON,
            onActivate: () => actions.toggleDevice(device),
        })),
        settings: settingsEntry('bluetooth', actions.openSettings),
    };
}

// @summary: from VpnModel.summarize().
function vpnSpec(summary, actions) {
    return {
        title: Constants.LIST_TITLES.vpn,
        items: summary.profiles.map(profile => ({
            label: profile.id,
            active: profile.active,
            onActivate: () => actions.toggleProfile(profile),
        })),
        settings: settingsEntry('vpn', actions.openSettings),
    };
}

// Quick connect, then every country; the connected country is marked. NordVPN has no
// settings page of its own: no settings entry.
function nordvpnSpec(status, countries, actions) {
    const country = status.connected ? status.country : null;
    return {
        title: Constants.LIST_TITLES.nordvpn,
        items: [
            { label: Constants.NORDVPN_QUICK_CONNECT, active: false, onActivate: () => actions.connectTo(null) },
            ...countries.map(entry => ({
                label: entry.label,
                active: entry.label === country,
                onActivate: () => actions.connectTo(entry.name),
            })),
        ],
        settings: null,
    };
}

// @kind: 'output' or 'input'. @devices: [{ id, label, active }].
function deviceSpec(kind, devices, actions) {
    return {
        title: Constants.LIST_TITLES[kind],
        items: devices.map(device => ({
            label: device.label,
            active: device.active,
            onActivate: () => actions.selectDevice(device.id),
        })),
        settings: settingsEntry(kind, actions.openSettings),
    };
}
