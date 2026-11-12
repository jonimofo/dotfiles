const Constants = require('./constants');
const DdcutilParser = require('./ddcutilParser');

// Brightness of every external monitor that answers DDC/CI, set together. @runCommand(argv)
// returns a promise of the command's output (subprocess.js, or a fake in the tests).
class DdcBrightness {
    constructor(runCommand) {
        this._run = runCommand;
        this._buses = [];
        this._max = null;
    }

    get available() {
        return this._buses.length > 0;
    }

    async detect() {
        const output = await this._run([Constants.DDCUTIL, 'detect', '--terse']);
        this._buses = DdcutilParser.parseDetectBuses(output);
        return this._buses;
    }

    // The first monitor's brightness, from 0 to 1. Both are set to the same value.
    async read() {
        const bus = this._buses[0];
        const output = await this._run([Constants.DDCUTIL, '--bus', `${bus}`,
            'getvcp', Constants.DDC_BRIGHTNESS_FEATURE, '--brief']);
        const vcp = DdcutilParser.parseVcpBrief(output);
        if (!vcp)
            throw new Error(`unexpected ddcutil output on bus ${bus}: ${output.trim()}`);
        this._max = vcp.max;
        return vcp.current / vcp.max;
    }

    // Sets every monitor, in parallel. Rejects when one of them fails, naming the bus and
    // the value; the others keep the new value.
    async write(fraction) {
        if (this._max === null)
            await this.read();
        const value = Math.round(fraction * this._max);
        const results = await Promise.allSettled(this._buses.map(bus => this._run([
            Constants.DDCUTIL, '--bus', `${bus}`, 'setvcp', Constants.DDC_BRIGHTNESS_FEATURE, `${value}`,
        ])));
        const failures = results
            .map((result, index) => ({ result, bus: this._buses[index] }))
            .filter(({ result }) => result.status === 'rejected')
            .map(({ result, bus }) => `bus ${bus}, value ${value}: ${result.reason.message}`);
        if (failures.length > 0)
            throw new Error(`setting the brightness failed on ${failures.join('; ')}`);
    }
}
