const Gio = imports.gi.Gio;
const Constants = require('./constants');

// Dark style on or off: the key Cinnamon Settings > Themes > Dark mode writes.
// @onChange runs on every change, made here or anywhere else.
class DarkStyleState {
    constructor(onChange) {
        this._settings = new Gio.Settings({ schema_id: Constants.DARK_STYLE_SCHEMA });
        this._changedId = this._settings.connect(`changed::${Constants.DARK_STYLE_KEY}`, () => onChange());
    }

    get enabled() {
        return this._settings.get_string(Constants.DARK_STYLE_KEY) === Constants.DARK_STYLE_ON;
    }

    toggle() {
        const value = this.enabled ? Constants.DARK_STYLE_OFF : Constants.DARK_STYLE_ON;
        if (!this._settings.set_string(Constants.DARK_STYLE_KEY, value))
            global.logError(`${Constants.LOG_PREFIX}: setting ${Constants.DARK_STYLE_SCHEMA} ${Constants.DARK_STYLE_KEY} to ${value} failed`);
    }

    destroy() {
        this._settings.disconnect(this._changedId);
    }
}
