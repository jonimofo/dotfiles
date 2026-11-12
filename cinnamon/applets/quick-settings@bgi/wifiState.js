const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;
const NM = imports.gi.NM;
const Util = imports.misc.util;
const Constants = require('./constants');
const WifiNetworks = require('./wifiNetworks');

const NO_TIMEOUT = -1;
const ApFlags = NM['80211ApFlags'];
const ApSecurityFlags = NM['80211ApSecurityFlags'];

function ssidText(accessPoint) {
    const ssid = accessPoint.get_ssid();
    return ssid ? NM.utils_ssid_to_utf8(ssid.get_data()) : null;
}

function isSecure(accessPoint) {
    return (accessPoint.get_flags() & ApFlags.PRIVACY) !== 0
        || accessPoint.get_wpa_flags() !== ApSecurityFlags.NONE
        || accessPoint.get_rsn_flags() !== ApSecurityFlags.NONE;
}

function isEnterprise(accessPoint) {
    return ((accessPoint.get_wpa_flags() | accessPoint.get_rsn_flags()) & ApSecurityFlags.KEY_MGMT_802_1X) !== 0;
}

function isWep(accessPoint) {
    return (accessPoint.get_flags() & ApFlags.PRIVACY) !== 0
        && accessPoint.get_wpa_flags() === ApSecurityFlags.NONE
        && accessPoint.get_rsn_flags() === ApSecurityFlags.NONE;
}

// The secret the network agent asks for: a WEP key, a WPA passphrase, or none.
function agentOwnedSecret(accessPoint) {
    if (isWep(accessPoint))
        return { wep_key_flags: NM.SettingSecretFlags.AGENT_OWNED };
    if (isSecure(accessPoint) && !isEnterprise(accessPoint))
        return { psk_flags: NM.SettingSecretFlags.AGENT_OWNED };
    return null;
}

// Same check as the stock network applet (default_to_private_connections).
function defaultsToPrivateConnections(client) {
    return client.get_permission_result(NM.ClientPermission.SETTINGS_MODIFY_SYSTEM) !== NM.ClientPermissionResult.YES;
}

// A new connection for a network without a saved profile, built like the stock network
// applet's _createAutomaticConnection(): Cinnamon's network agent then asks for the secret.
function automaticConnection(client, accessPoint, ssid) {
    const connection = new NM.SimpleConnection();
    connection.add_setting(new NM.SettingWireless());
    const settingConnection = new NM.SettingConnection({
        id: `${Constants.WIFI_AUTO_CONNECTION_PREFIX}${ssid}`,
        autoconnect: true,
        uuid: NM.utils_uuid_generate(),
        type: NM.SETTING_WIRELESS_SETTING_NAME,
    });
    if (defaultsToPrivateConnections(client)) {
        settingConnection.add_permission('user', GLib.get_user_name(), null);
        const secret = agentOwnedSecret(accessPoint);
        if (secret)
            connection.add_setting(new NM.SettingWirelessSecurity(secret));
    }
    connection.add_setting(settingConnection);
    return connection;
}

// Asks libnm for a client; @onReady(client, error). The tests pass a fake instead.
function newNmClient(cancellable, onReady) {
    NM.Client.new_async(cancellable, (source, result) => {
        try {
            onReady(NM.Client.new_finish(result), null);
        } catch (e) {
            onReady(null, e);
        }
    });
}

// Wireless on or off and the visible networks, through NetworkManager. @onChange runs once
// the client is ready and on every change, made here or anywhere else.
// @requestClient(cancellable, onReady): where the client comes from (newNmClient by default).
class WifiState {
    constructor(onChange, requestClient = newNmClient) {
        this._onChange = onChange;
        this._client = null;
        this._device = null;
        this._clientSignalIds = [];
        this._deviceSignalIds = [];
        this._cancellable = new Gio.Cancellable();
        requestClient(this._cancellable, (client, error) => this._onClientReady(client, error));
    }

    // On only when both the software switch and the hardware switch are on.
    get enabled() {
        return this._client !== null
            && this._client.wireless_enabled
            && this._client.wireless_hardware_enabled;
    }

    // SSID of the network in use, or null.
    get activeSsid() {
        const accessPoint = this._device ? this._device.get_active_access_point() : null;
        return accessPoint ? ssidText(accessPoint) : null;
    }

    // The list for the Wi-Fi panel: see WifiNetworks.buildNetworkList().
    get networks() {
        if (!this._device || !this.enabled)
            return [];
        const accessPoints = this._device.get_access_points().map(accessPoint => ({
            ssid: ssidText(accessPoint),
            strength: accessPoint.get_strength(),
            secure: isSecure(accessPoint),
            accessPoint,
        }));
        return WifiNetworks.buildNetworkList(accessPoints, this.activeSsid, Constants.WIFI_LIST_MAX);
    }

    toggle() {
        if (!this._client)
            return;
        this._setWirelessEnabled(!this._client.wireless_enabled);
    }

    requestScan() {
        if (!this._device || !this.enabled)
            return;
        this._device.request_scan_async(this._cancellable, (device, result) => {
            try {
                device.request_scan_finish(result);
            } catch (e) {
                // NetworkManager refuses a scan asked too soon after the last one: not a fault.
                if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                    global.log(`${Constants.LOG_PREFIX}: Wi-Fi scan not started: ${e.message}`);
            }
        });
    }

    // A saved profile is used when one fits; an 802.1x network goes to the stock wizard;
    // any other network gets a new connection and Cinnamon's network agent asks for the
    // secret, as with the stock network applet.
    connect(network) {
        if (!this._device || network.active)
            return;
        const accessPoint = network.accessPoint;
        const saved = accessPoint.filter_connections(this._device.filter_connections(this._client.get_connections()));
        if (saved.length > 0) {
            this._client.activate_connection_async(saved[0], this._device, accessPoint.get_path(), this._cancellable,
                (client, result) => this._finish(() => client.activate_connection_finish(result), network.ssid));
            return;
        }
        if (isEnterprise(accessPoint)) {
            Util.spawn([...Constants.SETTINGS_COMMANDS.enterpriseWifi, this._device.get_path(), accessPoint.get_path()]);
            return;
        }
        const connection = automaticConnection(this._client, accessPoint, network.ssid);
        this._client.add_and_activate_connection_async(connection, this._device, accessPoint.get_path(), this._cancellable,
            (client, result) => this._finish(() => client.add_and_activate_connection_finish(result), network.ssid));
    }

    destroy() {
        this._cancellable.cancel();
        this._disconnectDevice();
        for (const id of this._clientSignalIds)
            GObject.signal_handler_disconnect(this._client, id);
        this._clientSignalIds = [];
        this._client = null;
    }

    // A cancelled call means destroy() ran: the tile is gone, nothing to update.
    _finish(finishCall, ssid) {
        try {
            finishCall();
        } catch (e) {
            if (e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                return;
            global.logError(`${Constants.LOG_PREFIX}: connecting to Wi-Fi network ${ssid} failed`, e);
        }
        this._onChange();
    }

    _onClientReady(client, error) {
        if (error) {
            if (!error.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                global.logError(`${Constants.LOG_PREFIX}: connecting to NetworkManager failed`, error);
            return;
        }
        this._client = client;
        for (const property of ['wireless-enabled', 'wireless-hardware-enabled'])
            this._clientSignalIds.push(this._client.connect(`notify::${property}`, () => this._onChange()));
        for (const signal of ['device-added', 'device-removed'])
            this._clientSignalIds.push(this._client.connect(signal, () => this._findDevice()));
        this._findDevice();
    }

    _findDevice() {
        const device = this._client.get_devices().find(candidate => candidate.get_device_type() === NM.DeviceType.WIFI) || null;
        if (device !== this._device) {
            this._disconnectDevice();
            this._device = device;
            if (device) {
                for (const signal of ['access-point-added', 'access-point-removed', 'notify::active-access-point', 'notify::last-scan'])
                    this._deviceSignalIds.push(device.connect(signal, () => this._onChange()));
            }
        }
        this._onChange();
    }

    _disconnectDevice() {
        // NM.Device has its own disconnect(): it would take the device offline.
        for (const id of this._deviceSignalIds)
            GObject.signal_handler_disconnect(this._device, id);
        this._deviceSignalIds = [];
        this._device = null;
    }

    // libnm 1.22 deprecates wireless_set_enabled() in favour of this D-Bus call, which also
    // reports a refusal (polkit, NetworkManager stopped) instead of failing silently.
    _setWirelessEnabled(enabled) {
        this._client.dbus_set_property(NM.DBUS_PATH, NM.DBUS_INTERFACE, 'WirelessEnabled',
            GLib.Variant.new_boolean(enabled), NO_TIMEOUT, this._cancellable, (client, result) => {
                try {
                    client.dbus_set_property_finish(result);
                } catch (e) {
                    if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                        global.logError(`${Constants.LOG_PREFIX}: setting WirelessEnabled to ${enabled} failed`, e);
                }
            });
    }
}
