const Gio = imports.gi.Gio;
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

// One D-Bus method call on @bus. @onReply(reply) runs on success; a failure is logged with
// @what unless cancelled, then @onFailure() runs when given. @target: { name, path, iface }.
function callDbus(bus, target, method, parameters, cancellable, what, onReply, onFailure = null) {
    bus.call(target.name, target.path, target.iface, method, parameters, null, Gio.DBusCallFlags.NONE,
        NO_TIMEOUT, cancellable, (connection, result) => {
            let reply;
            try {
                reply = connection.call_finish(result);
            } catch (e) {
                if (!logUnlessCancelled(e, what) && onFailure)
                    onFailure();
                return;
            }
            onReply(reply);
        });
}
