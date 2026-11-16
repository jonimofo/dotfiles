const Gio = imports.gi.Gio;

// Runs @argv without blocking the main loop. Resolves with its standard output; rejects
// with an error naming the command, its exit status and its standard error.
// @env: variables set for this command only, on top of the applet's environment
// (e.g. { LC_ALL: 'C' } for output that is parsed).
function runCommand(argv, { env = {} } = {}) {
    return new Promise((resolve, reject) => {
        let process;
        try {
            const launcher = new Gio.SubprocessLauncher({
                flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE,
            });
            for (const [name, value] of Object.entries(env))
                launcher.setenv(name, value, true);
            process = launcher.spawnv(argv);
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
