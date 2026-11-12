const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const NM = imports.gi.NM;
const Constants = require('./constants');

const NO_TIMEOUT = -1;

// Wireless on or off, through NetworkManager. @onChange runs once the client is ready and
// on every change, made here or anywhere else (nmcli, the stock network applet, rfkill).
class WifiState {
    constructor(onChange) {
        this._onChange = onChange;
        this._client = null;
        this._signalIds = [];
        this._cancellable = new Gio.Cancellable();
        NM.Client.new_async(this._cancellable, (source, result) => this._onClientReady(result));
    }

    // On only when both the software switch and the hardware switch are on.
    get enabled() {
        return this._client !== null
            && this._client.wireless_enabled
            && this._client.wireless_hardware_enabled;
    }

    toggle() {
        if (!this._client)
            return;
        this._setWirelessEnabled(!this._client.wireless_enabled);
    }

    destroy() {
        this._cancellable.cancel();
        for (const id of this._signalIds)
            this._client.disconnect(id);
        this._signalIds = [];
        this._client = null;
    }

    _onClientReady(result) {
        try {
            this._client = NM.Client.new_finish(result);
        } catch (e) {
            if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                global.logError(`${Constants.LOG_PREFIX}: connecting to NetworkManager failed`, e);
            return;
        }
        for (const property of ['wireless-enabled', 'wireless-hardware-enabled'])
            this._signalIds.push(this._client.connect(`notify::${property}`, () => this._onChange()));
        this._onChange();
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
