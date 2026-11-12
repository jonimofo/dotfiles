const Gio = imports.gi.Gio;
const Constants = require('./constants');

// A tile backed by one boolean GSettings key: Night Light, Do Not Disturb. With @inverted,
// the tile is on while the key is false (Do Not Disturb is on while notifications are off).
// @onChange runs on every change of the key, made here or anywhere else.
class BooleanSetting {
    constructor(schema, key, inverted, onChange) {
        this._key = key;
        this._inverted = inverted;
        this._settings = new Gio.Settings({ schema_id: schema });
        this._changedId = this._settings.connect(`changed::${key}`, () => onChange());
    }

    get enabled() {
        return this._settings.get_boolean(this._key) !== this._inverted;
    }

    toggle() {
        const value = this.enabled === this._inverted;
        if (!this._settings.set_boolean(this._key, value))
            global.logError(`${Constants.LOG_PREFIX}: setting ${this._key} to ${value} failed`);
    }

    destroy() {
        this._settings.disconnect(this._changedId);
    }
}
