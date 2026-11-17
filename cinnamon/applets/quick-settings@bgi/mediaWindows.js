const Cinnamon = imports.gi.Cinnamon;
const Main = imports.ui.main;
const Constants = require('./constants');

// The windows MediaFocus.focusPlayer() picks from, through Cinnamon: an application's windows
// from Cinnamon.AppSystem (its toplevel, interesting windows, in Cinnamon's own order: the
// caller sorts by user time), a process's windows from the window actors, kept only when
// Main.isInteresting() (the filter of Alt-Tab and Expo), and activation with
// Main.activateWindow(window, time), the call of the stock window list: the window manager
// switches to the window's workspace, unminimises and focuses it.
const CINNAMON_WINDOWS = {
    ofApp(desktopEntry) {
        const app = Cinnamon.AppSystem.get_default().lookup_app(`${desktopEntry}${Constants.MEDIA_DESKTOP_FILE_SUFFIX}`);
        return app ? app.get_windows() : [];
    },

    ofPid(pid) {
        return global.get_window_actors().map(actor => actor.meta_window)
            .filter(window => window && window.get_pid() === pid && Main.isInteresting(window));
    },

    describe(window) {
        return { title: window.get_title() || '', userTime: window.get_user_time(), pid: window.get_pid() };
    },

    // @time: the click's event time.
    activate(window, time) {
        Main.activateWindow(window, time);
    },
};
