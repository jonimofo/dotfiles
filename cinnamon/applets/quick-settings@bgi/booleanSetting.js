const Gio = imports.gi.Gio;
const GsettingsWrite = require('./gsettingsWrite');

// One boolean GSettings key: the Do Not Disturb tile, Night Light on the Warmth row. With
// @inverted, it is on while the key is false (Do Not Disturb is on while notifications are off).
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
        GsettingsWrite.writeSetting(this._settings, 'set_boolean', this._key, this.enabled === this._inverted);
    }

    destroy() {
        this._settings.disconnect(this._changedId);
    }
}
