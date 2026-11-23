const GLib = imports.gi.GLib;
const Constants = require('./constants');

// The kelvin gammastep may receive: an integer inside the Warmth range, nothing else.
function isValidKelvin(kelvin) {
    return Number.isInteger(kelvin) && kelvin >= Constants.WARMTH_MIN_KELVIN && kelvin <= Constants.WARMTH_MAX_KELVIN;
}

// The gammastep command for a state: the temperature on every screen, or the gamma reset.
function commandFor(enabled, kelvin) {
    const flags = enabled ? [Constants.GAMMASTEP_SET_FLAG, `${kelvin}`] : [Constants.GAMMASTEP_RESET_FLAG];
    return [Constants.GAMMASTEP, ...Constants.GAMMASTEP_METHOD_ARGS, ...flags];
}

// The Warmth row's state and the gammastep runs that apply it to every screen.
// @runCommand(argv) returns a promise of the command's output (subprocess.js, or a fake in
// the tests); @findProgram(name) returns its path or null; @store has the applet settings'
// getValue(key) and setValue(key, value); @onChange() runs when enabled, kelvin or
// available change. Commands run one at a time: a change made while one runs replaces any
// other waiting one, so the newest state is the one left on the screens.
class GammastepWarmth {
    constructor({ runCommand, findProgram = GLib.find_program_in_path, store, onChange }) {
        this._run = runCommand;
        this._findProgram = findProgram;
        this._store = store;
        this._onChange = onChange;
        this._available = false;
        this._running = false;
        this._pending = null;
        this._destroyed = false;
        this._applySoonId = 0;
        this._available = this._programFound();
    }

    // False while gammastep is missing or its last run failed: the row is dimmed and inert.
    get available() {
        return this._available;
    }

    get enabled() {
        return this._store.getValue(Constants.WARMTH_SETTINGS.enabled.key) === true;
    }

    get kelvin() {
        const kelvin = this._store.getValue(Constants.WARMTH_SETTINGS.kelvin.key);
        return typeof kelvin === 'number' ? kelvin : Constants.WARMTH_SETTINGS.kelvin.default;
    }

    toggle() {
        if (!this._available)
            return;
        this._store.setValue(Constants.WARMTH_SETTINGS.enabled.key, !this.enabled);
        this._onChange();
        this._apply();
    }

    // The slider moves in steps: a move within one step runs nothing.
    setTemperature(kelvin) {
        if (!this._available || kelvin === this.kelvin)
            return;
        this._store.setValue(Constants.WARMTH_SETTINGS.kelvin.key, kelvin);
        this._onChange();
        if (this.enabled)
            this._apply();
    }

    // At start and after the monitors change: a new screen has neutral gamma. Off runs
    // nothing. Looks for gammastep again, so one installed later is picked up.
    applyStored() {
        this._checkProgram();
        if (this._available && this.enabled)
            this._apply();
    }

    // A dock sends several monitor changes in a row: one re-apply once they stop.
    applySoon() {
        if (this._applySoonId)
            GLib.source_remove(this._applySoonId);
        this._applySoonId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, Constants.MONITORS_SETTLE_DELAY_MS, () => {
            this._applySoonId = 0;
            this.applyStored();
            return GLib.SOURCE_REMOVE;
        });
    }

    _checkProgram() {
        this._setAvailable(this._programFound());
    }

    _programFound() {
        const found = this._findProgram(Constants.GAMMASTEP) !== null;
        if (!found)
            global.logError(`${Constants.LOG_PREFIX}: ${Constants.GAMMASTEP} not found in PATH, Warmth row dimmed`);
        return found;
    }

    _setAvailable(available) {
        if (available === this._available)
            return;
        this._available = available;
        if (!this._destroyed)
            this._onChange();
    }

    async _apply() {
        this._pending = { enabled: this.enabled, kelvin: this.kelvin };
        if (this._running)
            return;
        this._running = true;
        while (this._pending !== null && !this._destroyed) {
            const { enabled, kelvin } = this._pending;
            this._pending = null;
            await this._runOnce(enabled, kelvin);
        }
        this._running = false;
    }

    async _runOnce(enabled, kelvin) {
        if (enabled && !isValidKelvin(kelvin)) {
            global.logError(`${Constants.LOG_PREFIX}: Warmth ${kelvin} refused, not an integer from ${Constants.WARMTH_MIN_KELVIN} to ${Constants.WARMTH_MAX_KELVIN}`);
            return;
        }
        const argv = commandFor(enabled, kelvin);
        try {
            await this._run(argv);
        } catch (e) {
            global.logError(`${Constants.LOG_PREFIX}: setting the Warmth with '${argv.join(' ')}' failed: ${e.message}`);
            this._setAvailable(false);
        }
    }

    destroy() {
        this._destroyed = true;
        if (this._applySoonId)
            GLib.source_remove(this._applySoonId);
        this._applySoonId = 0;
    }
}
