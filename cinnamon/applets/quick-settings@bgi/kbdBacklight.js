const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Constants = require('./constants');
const AsyncHelpers = require('./asyncHelpers');
const KbdBacklightModel = require('./kbdBacklightModel');

const KBD_BACKLIGHT = {
    name: Constants.UPOWER_NAME,
    path: Constants.KBD_BACKLIGHT_PATH,
    iface: Constants.KBD_BACKLIGHT_INTERFACE,
};

// The keyboard backlight through UPower on the system bus: no root needed. Unavailable while
// UPower has no KbdBacklight object or reports a maximum of 0. Follows BrightnessChanged, so
// the keyboard's own hotkey shows on the tile. A click counts from the level last asked
// for, so two quick clicks go two steps; a reply only shows its level while it is still the
// last one asked and no BrightnessChanged came since. @onChange runs on every change.
class KbdBacklight {
    // @bus: the system bus, or a fake in the tests.
    constructor(onChange, bus = Gio.DBus.system) {
        this._bus = bus;
        this._onChange = onChange;
        this.available = false;
        this.level = 0;
        this.max = 0;
        // The level of the last SetBrightness whose reply has not come, else null.
        this._pending = null;
        this._cancellable = new Gio.Cancellable();
        this._signalId = bus.signal_subscribe(KBD_BACKLIGHT.name, KBD_BACKLIGHT.iface, Constants.KBD_BACKLIGHT_SIGNAL,
            KBD_BACKLIGHT.path, null, Gio.DBusSignalFlags.NONE,
            (connection, sender, path, iface, signal, parameters) => this._onBrightnessChanged(parameters.deepUnpack()[0]));
        this._call('GetMaxBrightness', null, 'reading the keyboard light maximum', reply => {
            [this.max] = reply.deepUnpack();
            if (this.max > 0) {
                this._call('GetBrightness', null, 'reading the keyboard light level', levelReply => {
                    this.available = true;
                    this._show(levelReply.deepUnpack()[0]);
                });
            }
        });
    }

    // The next level, back to off after the brightest.
    cycle() {
        if (!this.available)
            return;
        const target = KbdBacklightModel.nextLevel(this._pending ?? this.level, this.max);
        this._pending = target;
        this._call('SetBrightness', new GLib.Variant('(i)', [target]), `setting the keyboard light to ${target}`,
            () => this._onSetReply(target), () => {
                if (this._pending === target)
                    this._pending = null;
            });
    }

    destroy() {
        this._cancellable.cancel();
        if (this._signalId)
            this._bus.signal_unsubscribe(this._signalId);
        this._signalId = 0;
    }

    _onSetReply(target) {
        if (this._pending !== target)
            return;
        this._pending = null;
        this._show(target);
    }

    // UPower's own report wins over any reply still on its way.
    _onBrightnessChanged(level) {
        this._pending = null;
        this._show(level);
    }

    _show(level) {
        this.level = level;
        this._onChange();
    }

    _call(method, parameters, what, onReply, onFailure = null) {
        AsyncHelpers.callDbus(this._bus, KBD_BACKLIGHT, method, parameters, this._cancellable, what, onReply, onFailure);
    }
}
