const Gio = imports.gi.Gio;
const Constants = require('./constants');

// Night Light on or off and its temperature: the keys of Cinnamon Settings > Night Light.
// Drives the Warmth row: its switch and its slider.
// @onChange runs on every change of either key, made here or anywhere else.
class NightLight {
    constructor(onChange) {
        this._settings = new Gio.Settings({ schema_id: Constants.NIGHT_LIGHT_SCHEMA });
        this._changedIds = [Constants.NIGHT_LIGHT_KEY, Constants.NIGHT_LIGHT_TEMPERATURE_KEY].map(key =>
            this._settings.connect(`changed::${key}`, () => onChange()));
    }

    get enabled() {
        return this._settings.get_boolean(Constants.NIGHT_LIGHT_KEY);
    }

    get temperature() {
        return this._settings.get_uint(Constants.NIGHT_LIGHT_TEMPERATURE_KEY);
    }

    toggle() {
        const value = !this.enabled;
        if (!this._settings.set_boolean(Constants.NIGHT_LIGHT_KEY, value))
            global.logError(`${Constants.LOG_PREFIX}: setting ${Constants.NIGHT_LIGHT_KEY} to ${value} failed`);
    }

    // The slider moves in steps: a move within one step writes nothing.
    setTemperature(kelvin) {
        if (kelvin === this.temperature)
            return;
        if (!this._settings.set_uint(Constants.NIGHT_LIGHT_TEMPERATURE_KEY, kelvin))
            global.logError(`${Constants.LOG_PREFIX}: setting ${Constants.NIGHT_LIGHT_TEMPERATURE_KEY} to ${kelvin} failed`);
    }

    destroy() {
        for (const id of this._changedIds)
            this._settings.disconnect(id);
        this._changedIds = [];
    }
}
