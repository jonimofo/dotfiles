const Cinnamon = imports.gi.Cinnamon;
const Main = imports.ui.main;
const Constants = require('./constants');

// The windows MediaFocus.focusPlayer() picks from, through Cinnamon: an application's windows
// from Cinnamon.AppSystem (most recently used first, as Cinnamon sorts them), a process's
// windows from the window actors, and activation with Main.activateWindow(), as the stock
// window list does on a click (switches workspace, unminimises, focuses).
const CINNAMON_WINDOWS = {
    ofApp(desktopEntry) {
        const app = Cinnamon.AppSystem.get_default().lookup_app(`${desktopEntry}${Constants.MEDIA_DESKTOP_FILE_SUFFIX}`);
        return app ? app.get_windows() : [];
    },

    ofPid(pid) {
        return global.get_window_actors().map(actor => actor.meta_window)
            .filter(window => window && window.get_pid() === pid);
    },

    describe(window) {
        return { title: window.get_title() || '', userTime: window.get_user_time() };
    },

    // @time: the click's event time. A window on every workspace has none of its own: no
    // workspace switch then.
    activate(window, time) {
        const workspace = window.get_workspace();
        Main.activateWindow(window, time, workspace ? workspace.index() : undefined);
    },
};
