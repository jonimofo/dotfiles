const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Constants = require('./constants');
const PowerProfileModel = require('./powerProfileModel');

const NO_TIMEOUT = -1;

// The power profile through power-profiles-daemon, on the bus names the stock power applet
// tries, in its order: the first one that reports Profiles is used. @onChange runs once the
// daemon answers (or not) and on every change of the active profile, made anywhere.
class PowerProfiles {
    constructor(onChange) {
        this._onChange = onChange;
        this._proxy = null;
        this._changedId = 0;
        this._cancellable = new Gio.Cancellable();
        this.lastOther = null;
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
        Gio.DBus.system.call(this._proxy.g_name, this._proxy.g_object_path, 'org.freedesktop.DBus.Properties', 'Set',
            value, null, Gio.DBusCallFlags.NONE, NO_TIMEOUT, this._cancellable, (connection, result) => {
                try {
                    connection.call_finish(result);
                } catch (e) {
                    if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                        global.logError(`${Constants.LOG_PREFIX}: setting the power profile to ${profile} failed`, e);
                }
            });
    }

    destroy() {
        this._cancellable.cancel();
        if (this._changedId)
            this._proxy.disconnect(this._changedId);
        this._proxy = null;
    }

    _connect(index) {
        const bus = Constants.POWER_PROFILES_BUSES[index];
        if (!bus) {
            global.log(`${Constants.LOG_PREFIX}: power-profiles-daemon not found, power profile tile dimmed`);
            this._onChange();
            return;
        }
        Gio.DBusProxy.new_for_bus(Gio.BusType.SYSTEM, Gio.DBusProxyFlags.NONE, null, bus.name, bus.path, bus.name,
            this._cancellable, (source, result) => {
                let proxy = null;
                try {
                    proxy = Gio.DBusProxy.new_for_bus_finish(result);
                } catch (e) {
                    if (e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                        return;
                }
                if (!proxy || !proxy.get_cached_property('Profiles')) {
                    this._connect(index + 1);
                    return;
                }
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
