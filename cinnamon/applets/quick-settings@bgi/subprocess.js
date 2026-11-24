const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Constants = require('./constants');

// Runs @argv without blocking the main loop. Resolves with its standard output; rejects
// with an error naming the command, its exit status and its standard error. A command
// still running after @timeoutMs is killed and rejected as timed out; one that exited on
// its own is judged by its exit status, even if the timeout fired meanwhile. A killed
// command whose output pipes stay open, held by a child the kill did not reach, is
// rejected as timed out @graceMs after the kill; its later end is ignored.
function runCommand(argv, timeoutMs = Constants.COMMAND_TIMEOUT_MS, graceMs = Constants.COMMAND_KILL_GRACE_MS) {
    return new Promise((resolve, reject) => {
        let process;
        try {
            process = Gio.Subprocess.new(argv,
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE);
        } catch (e) {
            reject(new Error(`${argv.join(' ')}: ${e.message}`));
            return;
        }
        const timedOutError = () => new Error(`${argv.join(' ')} timed out after ${timeoutMs} ms, killed`);
        let settled = false;
        let timedOut = false;
        let graceId = 0;
        let timeoutId = 0;
        const settle = (outcome, value) => {
            if (settled)
                return;
            settled = true;
            if (!timedOut)
                GLib.source_remove(timeoutId);
            if (graceId !== 0)
                GLib.source_remove(graceId);
            outcome(value);
        };
        timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, timeoutMs, () => {
            timedOut = true;
            process.force_exit();
            graceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, graceMs, () => {
                graceId = 0;
                settle(reject, timedOutError());
                return GLib.SOURCE_REMOVE;
            });
            return GLib.SOURCE_REMOVE;
        });
        process.communicate_utf8_async(null, null, (source, result) => {
            if (settled)
                return;
            try {
                const [, stdout, stderr] = source.communicate_utf8_finish(result);
                // The timeout can fire after the process has exited but before this callback
                // runs; only a process the kill actually ended counts as timed out.
                if (timedOut && source.get_if_signaled())
                    settle(reject, timedOutError());
                else if (source.get_successful())
                    settle(resolve, stdout);
                else
                    settle(reject, new Error(`${argv.join(' ')} exited with ${source.get_exit_status()}: ${(stderr || stdout).trim()}`));
            } catch (e) {
                settle(reject, new Error(`${argv.join(' ')}: ${e.message}`));
            }
        });
    });
}
