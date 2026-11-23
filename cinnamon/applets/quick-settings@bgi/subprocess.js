const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Constants = require('./constants');

// Runs @argv without blocking the main loop. Resolves with its standard output; rejects
// with an error naming the command, its exit status and its standard error. A command
// still running after @timeoutMs is killed and rejected as timed out.
function runCommand(argv, timeoutMs = Constants.COMMAND_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
        let process;
        try {
            process = Gio.Subprocess.new(argv,
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE);
        } catch (e) {
            reject(new Error(`${argv.join(' ')}: ${e.message}`));
            return;
        }
        let timedOut = false;
        const timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, timeoutMs, () => {
            timedOut = true;
            process.force_exit();
            return GLib.SOURCE_REMOVE;
        });
        process.communicate_utf8_async(null, null, (source, result) => {
            if (!timedOut)
                GLib.source_remove(timeoutId);
            try {
                const [, stdout, stderr] = source.communicate_utf8_finish(result);
                if (timedOut)
                    reject(new Error(`${argv.join(' ')} timed out after ${timeoutMs} ms, killed`));
                else if (source.get_successful())
                    resolve(stdout);
                else
                    reject(new Error(`${argv.join(' ')} exited with ${source.get_exit_status()}: ${(stderr || stdout).trim()}`));
            } catch (e) {
                reject(new Error(`${argv.join(' ')}: ${e.message}`));
            }
        });
    });
}
