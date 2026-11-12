const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Constants = require('./constants');
const BluetoothModel = require('./bluetoothModel');

const NO_TIMEOUT = -1;

function cachedValue(proxy, property, fallback) {
    const value = proxy.get_cached_property(property);
    return value ? value.unpack() : fallback;
}

// The Bluetooth adapter and its paired devices, from BlueZ on the system bus (ObjectManager).
// @onChange runs on every change: adapter power, device connected, device added or removed.
class Bluetooth {
    constructor(onChange) {
        this._onChange = onChange;
        this._manager = null;
        this._signalIds = [];
        this._cancellable = new Gio.Cancellable();
        this.summary = BluetoothModel.summarize([], []);
        Gio.DBusObjectManagerClient.new_for_bus(Gio.BusType.SYSTEM, Gio.DBusObjectManagerClientFlags.NONE,
            Constants.BLUEZ_NAME, '/', null, this._cancellable, (source, result) => this._onManagerReady(result));
    }

    toggle() {
        if (!this.summary.available)
            return;
        const powered = !this.summary.powered;
        const value = new GLib.Variant('(ssv)', [Constants.BLUEZ_ADAPTER_INTERFACE, 'Powered', GLib.Variant.new_boolean(powered)]);
        this._call(this.summary.adapterPath, Constants.DBUS_PROPERTIES_INTERFACE, 'Set', value,
            `setting the Bluetooth adapter power to ${powered}`);
    }

    // Connects a paired device, or disconnects it when it is connected.
    toggleDevice(device) {
        const method = device.connected ? 'Disconnect' : 'Connect';
        this._call(device.path, Constants.BLUEZ_DEVICE_INTERFACE, method, null,
            `${method} of Bluetooth device ${device.name}`);
    }

    destroy() {
        this._cancellable.cancel();
        for (const id of this._signalIds)
            this._manager.disconnect(id);
        this._signalIds = [];
        this._manager = null;
    }

    _onManagerReady(result) {
        try {
            this._manager = Gio.DBusObjectManagerClient.new_for_bus_finish(result);
        } catch (e) {
            if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                global.logError(`${Constants.LOG_PREFIX}: connecting to BlueZ failed`, e);
            return;
        }
        for (const signal of ['object-added', 'object-removed', 'interface-added', 'interface-removed',
            'interface-proxy-properties-changed'])
            this._signalIds.push(this._manager.connect(signal, () => this._update()));
        this._update();
    }

    _update() {
        const adapters = [];
        const devices = [];
        for (const object of this._manager.get_objects()) {
            const path = object.get_object_path();
            const adapter = object.get_interface(Constants.BLUEZ_ADAPTER_INTERFACE);
            if (adapter)
                adapters.push({ path, powered: cachedValue(adapter, 'Powered', false) });
            const device = object.get_interface(Constants.BLUEZ_DEVICE_INTERFACE);
            if (device) {
                devices.push({
                    path,
                    adapter: cachedValue(device, 'Adapter', null),
                    name: cachedValue(device, 'Alias', path),
                    icon: cachedValue(device, 'Icon', null),
                    paired: cachedValue(device, 'Paired', false),
                    connected: cachedValue(device, 'Connected', false),
                });
            }
        }
        adapters.sort((one, two) => one.path.localeCompare(two.path));
        this.summary = BluetoothModel.summarize(adapters, devices);
        this._onChange();
    }

    _call(path, iface, method, parameters, what) {
        Gio.DBus.system.call(Constants.BLUEZ_NAME, path, iface, method, parameters, null,
            Gio.DBusCallFlags.NONE, NO_TIMEOUT, this._cancellable, (connection, result) => {
                try {
                    connection.call_finish(result);
                } catch (e) {
                    if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                        global.logError(`${Constants.LOG_PREFIX}: ${what} failed`, e);
                }
            });
    }
}
