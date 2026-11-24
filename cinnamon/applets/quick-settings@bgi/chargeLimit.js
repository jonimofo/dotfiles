const Gio = imports.gi.Gio;
const ByteArray = imports.byteArray;
const Constants = require('./constants');
const ChargeModel = require('./chargeModel');
const AsyncHelpers = require('./asyncHelpers');

// Reads @path without blocking the main loop: resolves with its text, or null when it cannot
// be read.
function readText(path, cancellable) {
    return new Promise(resolve => {
        Gio.File.new_for_path(path).load_contents_async(cancellable, (file, result) => {
            try {
                const [, contents] = file.load_contents_finish(result);
                resolve(ByteArray.toString(contents));
            } catch (e) {
                if (!AsyncHelpers.isCancelled(e))
                    global.log(`${Constants.LOG_PREFIX}: reading ${path} failed: ${e.message}`);
                resolve(null);
            }
        });
    });
}

function exists(path) {
    return Gio.File.new_for_path(path).query_exists(null);
}

// The battery charge mode: read from sysfs (never on a timer: when the tile shows, when the
// menu opens, after each change and on each battery change), switched with the root helper
// through sudo -n. A click asks for the other state; while a write runs, clicks and battery
// changes are ignored, and a run that does not end within Constants.CHARGE_HELPER_TIMEOUT_MS
// is killed by runCommand. In the full state, the battery seen full on AC and then on battery power
// brings back the limit once (ChargeModel.autoReturn); the last battery reading is applied
// again right after each write, so a battery already full on AC when full is chosen counts
// as seen full at once. @onChange runs after every read; nothing runs after destroy().
// @runCommand(argv, timeoutMs): Subprocess.runCommand, or a fake in the tests. @files: the existence
// check and the reader, replaced by fakes in the tests. @timeoutMs: shorter in the tests.
class ChargeLimit {
    constructor(runCommand, onChange, files = { exists, readText }, timeoutMs = Constants.CHARGE_HELPER_TIMEOUT_MS) {
        this._run = runCommand;
        this._onChange = onChange;
        this._files = files;
        this._timeoutMs = timeoutMs;
        this._cancellable = new Gio.Cancellable();
        this._destroyed = false;
        this._busy = false;
        this._seenFull = false;
        this._battery = null;
        this.available = false;
        this.state = null;
    }

    async refresh() {
        const files = [Constants.CHARGE_TYPES_FILE, Constants.CHARGE_END_FILE, Constants.CHARGE_HELPER];
        const present = files.every(path => this._files.exists(path));
        const [types, end] = present
            ? await Promise.all([this._files.readText(Constants.CHARGE_TYPES_FILE, this._cancellable),
                this._files.readText(Constants.CHARGE_END_FILE, this._cancellable)])
            : [null, null];
        if (this._destroyed)
            return;
        this.state = ChargeModel.chargeState(types, end);
        this.available = present && this.state !== null;
        this._onChange();
    }

    toggle() {
        if (!this.available || this._busy)
            return Promise.resolve();
        return this._apply(ChargeModel.toggledState(this.state));
    }

    // @battery: from BatteryModel.pickBattery(), null without a battery.
    async onBattery(battery) {
        this._battery = battery;
        if (this._busy)
            return;
        await this.refresh();
        await this._decide();
    }

    destroy() {
        this._destroyed = true;
        this._cancellable.cancel();
    }

    async _decide() {
        const battery = this._battery;
        if (this._destroyed || this._busy || !this.available || !battery || battery.onAc === null)
            return;
        const decision = ChargeModel.autoReturn(this.state, this._seenFull, battery.onAc, battery.full);
        this._seenFull = decision.seenFull;
        if (decision.fire)
            await this._apply(ChargeModel.LIMIT);
    }

    async _apply(state) {
        this._busy = true;
        try {
            await this._run(ChargeModel.helperArgv(state), this._timeoutMs);
        } catch (e) {
            AsyncHelpers.logBounded(e, `setting the battery charge to ${state}`, Constants.CHARGE_ERROR_TEXT_MAX);
        }
        if (!this._destroyed)
            await this.refresh();
        this._busy = false;
        await this._decide();
    }
}
