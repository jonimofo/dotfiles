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
// the keyboard's own hotkey shows on the tile. @onChange runs on every change.
class KbdBacklight {
    // @bus: the system bus, or a fake in the tests.
    constructor(onChange, bus = Gio.DBus.system) {
        this._bus = bus;
        this._onChange = onChange;
        this.available = false;
        this.level = 0;
        this.max = 0;
        this._cancellable = new Gio.Cancellable();
        this._signalId = bus.signal_subscribe(KBD_BACKLIGHT.name, KBD_BACKLIGHT.iface, Constants.KBD_BACKLIGHT_SIGNAL,
            KBD_BACKLIGHT.path, null, Gio.DBusSignalFlags.NONE,
            (connection, sender, path, iface, signal, parameters) => this._show(parameters.deepUnpack()[0]));
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
        const target = KbdBacklightModel.nextLevel(this.level, this.max);
        this._call('SetBrightness', new GLib.Variant('(i)', [target]), `setting the keyboard light to ${target}`,
            () => this._show(target));
    }

    destroy() {
        this._cancellable.cancel();
        if (this._signalId)
            this._bus.signal_unsubscribe(this._signalId);
        this._signalId = 0;
    }

    _show(level) {
        this.level = level;
        this._onChange();
    }

    _call(method, parameters, what, onReply) {
        AsyncHelpers.callDbus(this._bus, KBD_BACKLIGHT, method, parameters, this._cancellable, what, onReply);
    }
}
