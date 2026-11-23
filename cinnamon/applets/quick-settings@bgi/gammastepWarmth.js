const GLib = imports.gi.GLib;
const Constants = require('./constants');

// The kelvin gammastep may receive: an integer inside the Warmth range, nothing else.
function isValidKelvin(kelvin) {
    return Number.isInteger(kelvin) && kelvin >= Constants.WARMTH_MIN_KELVIN && kelvin <= Constants.WARMTH_MAX_KELVIN;
}

// True for a kelvin gammastep may receive; anything else is logged as refused.
function acceptKelvin(kelvin) {
    if (isValidKelvin(kelvin))
        return true;
    global.logError(`${Constants.LOG_PREFIX}: Warmth ${kelvin} refused, not an integer from ${Constants.WARMTH_MIN_KELVIN} to ${Constants.WARMTH_MAX_KELVIN}`);
    return false;
}

// The gammastep command for a state: the temperature on every screen, or the gamma reset.
function commandFor(enabled, kelvin) {
    const flags = enabled
        ? [Constants.GAMMASTEP_REPLACE_FLAG, Constants.GAMMASTEP_SET_FLAG, `${kelvin}`]
        : [Constants.GAMMASTEP_RESET_FLAG];
    return [Constants.GAMMASTEP, ...Constants.GAMMASTEP_METHOD_ARGS, ...flags];
}

// The Warmth row's state and the gammastep runs that apply it to every screen.
// @runCommand(argv) returns a promise of the command's output (subprocess.js, or a fake in
// the tests); @findProgram(name) returns its path or null; @store has the applet settings'
// getValue(key) and setValue(key, value); @onChange() runs when enabled, kelvin or
// available change. Commands run one at a time: a change made while one runs replaces any
// other waiting one, so the newest state is the one left on the screens. While the slider
// moves, the kelvin is held in memory and stored once on release.
class GammastepWarmth {
    constructor({ runCommand, findProgram = GLib.find_program_in_path, store, onChange }) {
        this._run = runCommand;
        this._findProgram = findProgram;
        this._store = store;
        this._onChange = onChange;
        this._running = false;
        this._pending = null;
        this._liveKelvin = null;
        this._destroyed = false;
        this._programMissing = false;
        this._available = this._programFound();
    }

    // False while gammastep is missing or its last run failed: the row is dimmed and inert.
    get available() {
        return this._available;
    }

    get enabled() {
        return this._store.getValue(Constants.WARMTH_SETTINGS.enabled.key) === true;
    }

    // A stored value gammastep would refuse reads as the default, so the row never shows one.
    get kelvin() {
        if (this._liveKelvin !== null)
            return this._liveKelvin;
        const kelvin = this._store.getValue(Constants.WARMTH_SETTINGS.kelvin.key);
        return isValidKelvin(kelvin) ? kelvin : Constants.WARMTH_SETTINGS.kelvin.default;
    }

    toggle() {
        if (!this._available)
            return;
        this._store.setValue(Constants.WARMTH_SETTINGS.enabled.key, !this.enabled);
        this._onChange();
        this._apply();
    }

    // While the slider moves. fractionToKelvin snaps to WARMTH_STEP_KELVIN, so a move that
    // keeps the kelvin runs nothing.
    setTemperature(kelvin) {
        if (!this._available || kelvin === this.kelvin || !acceptKelvin(kelvin))
            return;
        this._liveKelvin = kelvin;
        this._onChange();
        if (this.enabled)
            this._apply();
    }

    // On release: one settings write per change, not one per step. A scroll's delayed
    // release can come after destroy(), once the settings are finalized.
    commitTemperature() {
        const kelvin = this._liveKelvin;
        this._liveKelvin = null;
        if (kelvin !== null && !this._destroyed)
            this._store.setValue(Constants.WARMTH_SETTINGS.kelvin.key, kelvin);
    }

    // At start and after the monitors change: a new screen has neutral gamma. Off runs
    // nothing. Looks for gammastep again, so one installed later is picked up.
    applyStored() {
        this._setAvailable(this._programFound());
        if (this._available && this.enabled)
            this._apply();
    }

    // When the menu opens: a row dimmed by a missing program or a failed run tries again.
    menuOpened() {
        if (!this._available)
            this.applyStored();
    }

    // Logs only when gammastep goes missing, not on every look.
    _programFound() {
        const found = this._findProgram(Constants.GAMMASTEP) !== null;
        if (!found && !this._programMissing)
            global.logError(`${Constants.LOG_PREFIX}: ${Constants.GAMMASTEP} not found in PATH, Warmth row dimmed`);
        this._programMissing = !found;
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
        try {
            while (this._pending !== null && !this._destroyed) {
                const { enabled, kelvin } = this._pending;
                this._pending = null;
                await this._runOnce(enabled, kelvin);
            }
        } catch (e) {
            global.logError(`${Constants.LOG_PREFIX}: applying the Warmth failed: ${e.message}`);
        } finally {
            this._running = false;
        }
    }

    async _runOnce(enabled, kelvin) {
        if (enabled && !acceptKelvin(kelvin))
            return;
        const argv = commandFor(enabled, kelvin);
        try {
            await this._run(argv);
        } catch (e) {
            global.logError(`${Constants.LOG_PREFIX}: setting the Warmth with '${argv.join(' ')}' failed: ${e.message}`);
            // The waiting runs would fail the same way, each with its own log line.
            this._pending = null;
            this._setAvailable(false);
        }
    }

    destroy() {
        this._destroyed = true;
    }
}
