const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Constants = require('./constants');

// No timeout of our own on D-Bus and libnm calls: the bus default applies.
const NO_TIMEOUT = -1;

// Plain JavaScript errors (a rejected promise) have no matches(): never a cancellation.
function isCancelled(error) {
    return Boolean(error) && typeof error.matches === 'function'
        && error.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED);
}

// Logs @error with @what ("connecting VPN X"), unless it only says the call was cancelled:
// that happens on destroy and is no fault. Returns true when the call was cancelled.
function logUnlessCancelled(error, what) {
    if (isCancelled(error))
        return true;
    global.logError(`${Constants.LOG_PREFIX}: ${what} failed`, error);
    return false;
}

// One line for a failure whose error text comes from another program: its message cut to
// @maxLength characters, no stack trace.
function logBounded(error, what, maxLength) {
    const message = String(error && error.message !== undefined ? error.message : error);
    const cut = message.length > maxLength ? `${message.slice(0, maxLength)}...` : message;
    global.logError(`${Constants.LOG_PREFIX}: ${what} failed: ${cut}`);
}

// One D-Bus method call on @bus. @onReply(reply) runs on success; a failure is logged with
// @what unless cancelled, then @onFailure() runs when given. @target: { name, path, iface }.
// @options, all optional: replyType, a type string the reply must match (a reply of another
// type is a failure); stillWanted(), false when the answer no longer matters, which skips the
// log; errorTextMax, logs the error text cut to that length, without a stack trace.
function callDbus(bus, target, method, parameters, cancellable, what, onReply, onFailure = null, options = {}) {
    const replyType = options.replyType ? new GLib.VariantType(options.replyType) : null;
    bus.call(target.name, target.path, target.iface, method, parameters, replyType, Gio.DBusCallFlags.NONE,
        NO_TIMEOUT, cancellable, (connection, result) => {
            let reply;
            try {
                reply = connection.call_finish(result);
            } catch (e) {
                if (isCancelled(e) || (options.stillWanted && !options.stillWanted()))
                    return;
                if (options.errorTextMax)
                    logBounded(e, what, options.errorTextMax);
                else
                    logUnlessCancelled(e, what);
                if (onFailure)
                    onFailure();
                return;
            }
            onReply(reply);
        });
}

// Runs @callback once on the next idle after one or more schedule() calls: a burst of
// changes gives one update. cancel() drops a pending run (on destroy).
class IdleCoalescer {
    constructor(callback) {
        this._callback = callback;
        this._sourceId = 0;
    }

    schedule() {
        if (this._sourceId)
            return;
        this._sourceId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._sourceId = 0;
            this._callback();
            return GLib.SOURCE_REMOVE;
        });
    }

    cancel() {
        if (this._sourceId)
            GLib.source_remove(this._sourceId);
        this._sourceId = 0;
    }
}
