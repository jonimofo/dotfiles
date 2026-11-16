const Gio = imports.gi.Gio;
const Constants = require('./constants');

// A tile backed by one string GSettings key with an on value and an off value: Dark style,
// Touchpad. @values: { on, off, onUnlessOff }. With onUnlessOff, every value but off reads
// as on (the touchpad's disabled-on-external-mouse); else only on does (Dark style's
// prefer-light reads as off). toggle() writes off, or on. @onChange runs on every change of
// the key, made here or anywhere else.
class StringSetting {
    constructor(schema, key, values, onChange) {
        this._schema = schema;
        this._key = key;
        this._values = values;
        this._settings = new Gio.Settings({ schema_id: schema });
        this._changedId = this._settings.connect(`changed::${key}`, () => onChange());
    }

    get enabled() {
        const value = this._settings.get_string(this._key);
        return this._values.onUnlessOff ? value !== this._values.off : value === this._values.on;
    }

    toggle() {
        const value = this.enabled ? this._values.off : this._values.on;
        if (!this._settings.set_string(this._key, value))
            global.logError(`${Constants.LOG_PREFIX}: setting ${this._schema} ${this._key} to ${value} failed`);
    }

    destroy() {
        this._settings.disconnect(this._changedId);
    }
}
