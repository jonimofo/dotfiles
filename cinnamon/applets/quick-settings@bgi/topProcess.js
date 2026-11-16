const Constants = require('./constants');
const TopParser = require('./topParser');

// The process using the most CPU, read with `top` when asked (each time the menu opens),
// never on a timer. The read takes about half a second and never blocks the main loop. A
// request while a read runs is dropped: that read is recent enough. @onChange runs after
// each read; nothing runs after destroy().
// @runCommand(argv, { env }): Subprocess.runCommand, or a fake in the tests.
// A failed run or an unreadable output is logged with its reason.
class TopProcess {
    constructor(runCommand, onChange) {
        this._runCommand = runCommand;
        this._onChange = onChange;
        this._reading = false;
        this._destroyed = false;
        this.process = null;
    }

    async refresh() {
        if (this._reading)
            return;
        this._reading = true;
        let process = null;
        try {
            const output = await this._runCommand(Constants.CPU_TOP_COMMAND, { env: Constants.CPU_TOP_ENV });
            process = TopParser.busiestProcess(output);
        } catch (e) {
            global.logError(`${Constants.LOG_PREFIX}: reading the busiest process failed: ${e.message}`);
        }
        this._reading = false;
        if (this._destroyed)
            return;
        this.process = process;
        this._onChange();
    }

    destroy() {
        this._destroyed = true;
    }
}
