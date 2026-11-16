const Gio = imports.gi.Gio;
const Constants = require('./constants');
const BooleanSetting = require('./booleanSetting');
const GsettingsWrite = require('./gsettingsWrite');

// Night Light on or off and its temperature: the keys of Cinnamon Settings > Night Light.
// Drives the Warmth row: its switch and its slider.
// @onChange runs on every change of either key, made here or anywhere else.
class NightLight {
    constructor(onChange) {
        this._enabled = new BooleanSetting.BooleanSetting(Constants.NIGHT_LIGHT_SCHEMA, Constants.NIGHT_LIGHT_KEY,
            false, onChange);
        this._settings = new Gio.Settings({ schema_id: Constants.NIGHT_LIGHT_SCHEMA });
        this._changedId = this._settings.connect(`changed::${Constants.NIGHT_LIGHT_TEMPERATURE_KEY}`, () => onChange());
    }

    get enabled() {
        return this._enabled.enabled;
    }

    get temperature() {
        return this._settings.get_uint(Constants.NIGHT_LIGHT_TEMPERATURE_KEY);
    }

    toggle() {
        this._enabled.toggle();
    }

    // The slider moves in steps: a move within one step writes nothing.
    setTemperature(kelvin) {
        if (kelvin !== this.temperature)
            GsettingsWrite.writeSetting(this._settings, 'set_uint', Constants.NIGHT_LIGHT_TEMPERATURE_KEY, kelvin);
    }

    destroy() {
        this._enabled.destroy();
        this._settings.disconnect(this._changedId);
    }
}
