const Constants = require('./constants');

// Writes @value to @key of @settings (a Gio.Settings) with @setter, e.g. 'set_boolean'.
// A refused write (a key locked down, an out-of-range value) is logged with the schema, the
// key and the value; the change signal then never comes, so the view keeps the old state.
// Returns whether the write was accepted.
function writeSetting(settings, setter, key, value) {
    const written = settings[setter](key, value);
    if (!written)
        global.logError(`${Constants.LOG_PREFIX}: setting ${settings.schema_id} ${key} to ${value} failed`);
    return written;
}
