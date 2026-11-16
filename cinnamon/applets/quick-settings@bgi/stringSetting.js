const Gio = imports.gi.Gio;
const GsettingsWrite = require('./gsettingsWrite');

// A tile backed by one string GSettings key with an on value and an off value: Dark style.
// @values: { on, off }. Only on reads as on (Dark style's prefer-light reads as off);
// toggle() writes off, or on. @onChange runs on every change of the key, made here or
// anywhere else.
class StringSetting {
    constructor(schema, key, values, onChange) {
        this._key = key;
        this._values = values;
        this._settings = new Gio.Settings({ schema_id: schema });
        this._changedId = this._settings.connect(`changed::${key}`, () => onChange());
    }

    get enabled() {
        return this._settings.get_string(this._key) === this._values.on;
    }

    toggle() {
        GsettingsWrite.writeSetting(this._settings, 'set_string', this._key,
            this.enabled ? this._values.off : this._values.on);
    }

    destroy() {
        this._settings.disconnect(this._changedId);
    }
}
