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

// Where the second zone shows, from the settings read by key through @valueOf(key):
// {panel, header, resolve}. The header also needs the header clocks; the zone is resolved
// when either switch is on. Reading by key keeps the panel and header switches from being
// swapped between here and applet.js.
function secondZonePlaces(valueOf) {
    const onPanel = Boolean(valueOf(Constants.SECOND_ZONE_SWITCHES.panel.key));
    const inHeader = Boolean(valueOf(Constants.SECOND_ZONE_SWITCHES.header.key));
    const clocks = Boolean(valueOf(Constants.ELEMENT_SWITCHES.headerClocks.key));
    return { panel: onPanel, header: inHeader && clocks, resolve: onPanel || inHeader };
}

// @second ({label, time} or null) where its switch @shown is on, else null.
function shownWhere(shown, second) {
    return shown ? second : null;
}
