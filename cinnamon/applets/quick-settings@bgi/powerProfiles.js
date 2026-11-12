const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;
const Constants = require('./constants');
const PowerProfileModel = require('./powerProfileModel');
const AsyncHelpers = require('./asyncHelpers');

// The real system bus. The tests pass fakes with the same three members.
const SYSTEM_BUS = {
    bus: Gio.DBus.system,
    newProxy(target, cancellable, onReady) {
        Gio.DBusProxy.new_for_bus(Gio.BusType.SYSTEM, Gio.DBusProxyFlags.NONE, null, target.name, target.path,
            target.name, cancellable, (source, result) => {
                try {
                    onReady(Gio.DBusProxy.new_for_bus_finish(result), null);
                } catch (e) {
                    onReady(null, e);
                }
            });
    },
    watchName(name, onAppeared, onVanished) {
        return Gio.bus_watch_name(Gio.BusType.SYSTEM, name, Gio.BusNameWatcherFlags.NONE,
            () => onAppeared(), () => onVanished());
    },
    unwatchName(id) {
        Gio.bus_unwatch_name(id);
    },
};

// The power profile through power-profiles-daemon, on the bus names the stock power applet
// tries, in its order: the first one that reports Profiles is used. @onChange runs once the
// daemon answers (or not) and on every change of the active profile, made anywhere. A daemon
// that starts later, or restarts, is picked up when its bus name appears.
class PowerProfiles {
    constructor(onChange, system = SYSTEM_BUS) {
        this._onChange = onChange;
        this._system = system;
        this._proxy = null;
        this._changedId = 0;
        this._connecting = false;
        this._cancellable = new Gio.Cancellable();
        this.lastOther = null;
        this._watchIds = Constants.POWER_PROFILES_BUSES.map(target =>
            system.watchName(target.name, () => this._onNameAppeared(), () => this._onNameVanished(target)));
        this._connect(0);
    }

    get available() {
        return this._proxy !== null;
    }

    get active() {
        if (!this._proxy)
            return null;
        const value = this._proxy.get_cached_property('ActiveProfile');
        return value ? value.unpack() : null;
    }

    get profiles() {
        if (!this._proxy)
            return [];
        const value = this._proxy.get_cached_property('Profiles');
        return value ? value.deepUnpack().map(profile => profile.Profile.unpack()) : [];
    }

    toggle() {
        const target = PowerProfileModel.toggleTarget(this.active, this.lastOther, this.profiles);
        if (target)
            this.select(target);
    }

    select(profile) {
        if (!this._proxy || profile === this.active)
            return;
        const value = new GLib.Variant('(ssv)', [this._proxy.g_interface_name, 'ActiveProfile', GLib.Variant.new_string(profile)]);
        const target = { name: this._proxy.g_name, path: this._proxy.g_object_path, iface: Constants.DBUS_PROPERTIES_INTERFACE };
        AsyncHelpers.callDbus(this._system.bus, target, 'Set', value, this._cancellable,
            `setting the power profile to ${profile}`, () => {});
    }

    destroy() {
        this._cancellable.cancel();
        for (const id of this._watchIds)
            this._system.unwatchName(id);
        this._watchIds = [];
        this._dropProxy();
    }

    _onNameAppeared() {
        if (!this._proxy && !this._connecting)
            this._connect(0);
    }

    _onNameVanished(target) {
        if (this._proxy && this._proxy.g_name === target.name) {
            this._dropProxy();
            this._onChange();
        }
    }

    _dropProxy() {
        if (this._changedId)
            GObject.signal_handler_disconnect(this._proxy, this._changedId);
        this._changedId = 0;
        this._proxy = null;
    }

    _connect(index) {
        const target = Constants.POWER_PROFILES_BUSES[index];
        if (!target) {
            this._connecting = false;
            global.log(`${Constants.LOG_PREFIX}: power-profiles-daemon not found, power profile tile dimmed`);
            this._onChange();
            return;
        }
        this._connecting = true;
        this._system.newProxy(target, this._cancellable, (proxy, error) => {
            if (error && AsyncHelpers.isCancelled(error))
                return;
            if (error)
                global.log(`${Constants.LOG_PREFIX}: ${target.name} not reachable (${error.message}), trying the next name`);
            if (!proxy || !proxy.get_cached_property('Profiles')) {
                this._connect(index + 1);
                return;
            }
            this._connecting = false;
            this._proxy = proxy;
            this._changedId = proxy.connect('g-properties-changed', () => this._update());
            this._update();
        });
    }

    // Remembers the last profile other than balanced, for the next click from balanced.
    _update() {
        const active = this.active;
        if (PowerProfileModel.isHighlighted(active))
            this.lastOther = active;
        this._onChange();
    }
}
