// The second time zone of calendar@bgi, from its settings.
const GLib = imports.gi.GLib;
const Constants = require('./constants');

// Turns the settings into a GLib.TimeZone, or null when the second time is hidden. An unknown
// id is reported once through @logError, until the id changes.
class SecondZone {
    constructor(logError) {
        this._logError = logError;
        this._reportedId = null;
    }

    resolve(show, zoneId) {
        if (!show)
            return null;
        const id = (zoneId || '').trim();
        const zone = id === '' ? null : GLib.TimeZone.new_identifier(id);
        if (zone === null) {
            this._reportUnknown(id);
            return null;
        }
        this._reportedId = null;
        return zone;
    }

    _reportUnknown(id) {
        if (this._reportedId === id)
            return;
        this._reportedId = id;
        this._logError(`${Constants.LOG_PREFIX}: unknown time zone id "${id}", second time hidden`);
    }
}

// The time of @datetime (a GLib.DateTime) in @zone, with the GLib @format.
function timeInZone(datetime, zone, format) {
    return datetime.to_timezone(zone).format(format);
}
