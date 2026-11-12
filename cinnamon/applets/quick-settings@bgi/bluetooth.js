const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Constants = require('./constants');
const BluetoothModel = require('./bluetoothModel');
const AsyncHelpers = require('./asyncHelpers');

// The real system bus. The tests pass a fake with the same two members.
const SYSTEM_BUS = {
    bus: Gio.DBus.system,
    newManager(cancellable, onReady) {
        Gio.DBusObjectManagerClient.new_for_bus(Gio.BusType.SYSTEM, Gio.DBusObjectManagerClientFlags.NONE,
            Constants.BLUEZ_NAME, '/', null, cancellable, (source, result) => {
                try {
                    onReady(Gio.DBusObjectManagerClient.new_for_bus_finish(result), null);
                } catch (e) {
                    onReady(null, e);
                }
            });
    },
};

function cachedValue(proxy, property, fallback) {
    const value = proxy.get_cached_property(property);
    return value ? value.unpack() : fallback;
}

// The Bluetooth adapter and its paired devices, from BlueZ on the system bus (ObjectManager).
// @onChange runs on every change: adapter power, device connected, device added or removed.
class Bluetooth {
    constructor(onChange, system = SYSTEM_BUS) {
        this._onChange = onChange;
        this._system = system;
        this._manager = null;
        this._signalIds = [];
        this._cancellable = new Gio.Cancellable();
        this.summary = BluetoothModel.summarize([], []);
        system.newManager(this._cancellable, (manager, error) => this._onManagerReady(manager, error));
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

    _onManagerReady(manager, error) {
        if (error) {
            AsyncHelpers.logUnlessCancelled(error, 'connecting to BlueZ');
            return;
        }
        this._manager = manager;
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
        // BlueZ also reports signal strength changes while a scan runs: the tile and the
        // open list are only redrawn when what they show changed.
        const summary = BluetoothModel.summarize(adapters, devices);
        if (JSON.stringify(summary) === JSON.stringify(this.summary))
            return;
        this.summary = summary;
        this._onChange();
    }

    _call(path, iface, method, parameters, what) {
        AsyncHelpers.callDbus(this._system.bus, { name: Constants.BLUEZ_NAME, path, iface }, method, parameters,
            this._cancellable, what, () => {});
    }
}
