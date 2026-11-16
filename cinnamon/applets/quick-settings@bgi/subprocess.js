const Gio = imports.gi.Gio;

// Runs @argv without blocking the main loop. Resolves with its standard output; rejects
// with an error naming the command, its exit status and its standard error.
function runCommand(argv) {
    return new Promise((resolve, reject) => {
        let process;
        try {
            process = Gio.Subprocess.new(argv,
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE);
        } catch (e) {
            reject(new Error(`${argv.join(' ')}: ${e.message}`));
            return;
        }
        process.communicate_utf8_async(null, null, (source, result) => {
            try {
                const [, stdout, stderr] = source.communicate_utf8_finish(result);
                if (source.get_successful())
                    resolve(stdout);
                else
                    reject(new Error(`${argv.join(' ')} exited with ${source.get_exit_status()}: ${(stderr || stdout).trim()}`));
            } catch (e) {
                reject(new Error(`${argv.join(' ')}: ${e.message}`));
            }
        });
    });
}
