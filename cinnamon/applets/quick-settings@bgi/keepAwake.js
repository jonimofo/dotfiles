const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Constants = require('./constants');

const NO_TIMEOUT = -1;
const NO_TOPLEVEL_XID = 0;

// Keep awake: an idle inhibit held on the session manager, as the stock inhibit applet takes
// it. The tile shows whether idle is inhibited by anyone (this applet, the stock inhibit
// applet, a video player), read again on each InhibitorAdded or InhibitorRemoved. Our own
// inhibit is released on destroy, so a reload or a removal never leaves it behind: a click
// is ignored while an Inhibit or Uninhibit is on its way, and an Inhibit reply that arrives
// after destroy is released at once.
class KeepAwake {
    // @bus: the session bus, or a fake in the tests.
    constructor(appId, onChange, bus = Gio.DBus.session) {
        this._bus = bus;
        this._appId = appId;
        this._onChange = onChange;
        this._cookie = null;
        this._pending = false;
        this._destroyed = false;
        this.inhibited = false;
        this.available = false;
        this._cancellable = new Gio.Cancellable();
        this._signalIds = ['InhibitorAdded', 'InhibitorRemoved'].map(signal =>
            this._bus.signal_subscribe(Constants.SESSION_MANAGER_NAME, Constants.SESSION_MANAGER_INTERFACE,
                signal, Constants.SESSION_MANAGER_PATH, null, Gio.DBusSignalFlags.NONE, () => this.refresh()));
        this.refresh();
    }

    // Takes our inhibit, or releases it when we hold one.
    toggle() {
        if (this._pending)
            return;
        if (this._cookie !== null) {
            this._release();
            return;
        }
        this._takeInhibit();
    }

    refresh() {
        this._call('IsInhibited', new GLib.Variant('(u)', [Constants.INHIBIT_IDLE_FLAG]), result => {
            [this.inhibited] = result.deepUnpack();
            this.available = true;
            this._onChange();
        }, 'reading the idle inhibit');
    }

    destroy() {
        this._destroyed = true;
        for (const id of this._signalIds)
            this._bus.signal_unsubscribe(id);
        this._signalIds = [];
        // Sent without the cancellable: it must still go out while the applet goes away.
        if (this._cookie !== null)
            this._release(true);
        this._cancellable.cancel();
    }

    // Sent without the cancellable: the reply must be read even after destroy, to release
    // an inhibit the applet no longer wants.
    _takeInhibit() {
        this._pending = true;
        this._bus.call(Constants.SESSION_MANAGER_NAME, Constants.SESSION_MANAGER_PATH, Constants.SESSION_MANAGER_INTERFACE,
            'Inhibit', new GLib.Variant('(susu)', [this._appId, NO_TOPLEVEL_XID, Constants.INHIBIT_REASON, Constants.INHIBIT_IDLE_FLAG]),
            null, Gio.DBusCallFlags.NONE, NO_TIMEOUT, null, (connection, result) => {
                this._pending = false;
                try {
                    [this._cookie] = connection.call_finish(result).deepUnpack();
                } catch (e) {
                    global.logError(`${Constants.LOG_PREFIX}: taking the idle inhibit failed`, e);
                    return;
                }
                if (this._destroyed)
                    this._release(true);
                else
                    this.refresh();
            });
    }

    _release(leaving = false) {
        const cookie = this._cookie;
        this._cookie = null;
        this._pending = !leaving;
        this._bus.call(Constants.SESSION_MANAGER_NAME, Constants.SESSION_MANAGER_PATH, Constants.SESSION_MANAGER_INTERFACE,
            'Uninhibit', new GLib.Variant('(u)', [cookie]), null, Gio.DBusCallFlags.NONE, NO_TIMEOUT, null,
            (connection, result) => {
                try {
                    connection.call_finish(result);
                } catch (e) {
                    global.logError(`${Constants.LOG_PREFIX}: releasing the idle inhibit ${cookie} failed`, e);
                }
                if (!leaving) {
                    this._pending = false;
                    this.refresh();
                }
            });
    }

    _call(method, parameters, onResult, what) {
        this._bus.call(Constants.SESSION_MANAGER_NAME, Constants.SESSION_MANAGER_PATH, Constants.SESSION_MANAGER_INTERFACE,
            method, parameters, null, Gio.DBusCallFlags.NONE, NO_TIMEOUT, this._cancellable, (connection, result) => {
                let reply;
                try {
                    reply = connection.call_finish(result);
                } catch (e) {
                    if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                        global.logError(`${Constants.LOG_PREFIX}: ${what} failed`, e);
                    return;
                }
                onResult(reply);
            });
    }
}
