const MediaFocus = require('./mediaFocus');

// The window titles of the players that publish no track title (GNOME Videos, for one): their
// block shows the title of the player's own window instead. The window is the one
// click-to-focus brings forward (MediaFocus.findPlayerWindow: the player's own process only,
// the window used last among several). Its title is followed with windows.watchTitle(), no
// polling, and handed to players.setWindowTitle(), which cleans it and updates the blocks.
// A player without a window found has no window title (its block shows the player name
// alone); it is looked for again at the next follow() (a player change, or the menu
// opening). A window that goes away is released and not taken again.
// @players: MediaPlayers (focusInfo, processId, setWindowTitle).
// @windows: as MediaFocus.findPlayerWindow(), plus watchTitle(window, onTitle, onGone) ->
// release().
class MediaWindowTitles {
    constructor(players, windows) {
        this._players = players;
        this._windows = windows;
        // Bus name to { window, release, looking, gone }.
        this._followed = new Map();
        this._destroyed = false;
    }

    // @busNames: the players without a track title now (MediaPlayers.untitled). The others are
    // released; the ones without a window are looked for.
    follow(busNames) {
        if (this._destroyed)
            return;
        const wanted = new Set(busNames);
        for (const busName of [...this._followed.keys()]) {
            if (!wanted.has(busName))
                this._release(busName);
        }
        for (const busName of wanted) {
            let entry = this._followed.get(busName);
            if (!entry) {
                entry = { window: null, release: null, looking: false, gone: new Set() };
                this._followed.set(busName, entry);
            }
            if (!entry.window && !entry.looking)
                this._look(busName, entry);
        }
    }

    destroy() {
        this._destroyed = true;
        for (const busName of [...this._followed.keys()])
            this._release(busName);
    }

    _look(busName, entry) {
        entry.looking = true;
        const stillWanted = () => !this._destroyed && this._followed.get(busName) === entry;
        MediaFocus.findPlayerWindow(busName, this._players, this._windows, window => {
            if (!stillWanted())
                return;
            entry.looking = false;
            if (entry.gone.has(window)) {
                this._players.setWindowTitle(busName, null);
                return;
            }
            this._watch(busName, entry, window);
        }, () => {
            if (!stillWanted())
                return;
            entry.looking = false;
            this._players.setWindowTitle(busName, null);
        });
    }

    _watch(busName, entry, window) {
        const showTitle = () => this._players.setWindowTitle(busName, this._windows.describe(window).title);
        entry.window = window;
        entry.release = this._windows.watchTitle(window, showTitle, () => {
            entry.gone.add(window);
            entry.window = null;
            entry.release = null;
            this._players.setWindowTitle(busName, null);
        });
        showTitle();
    }

    _release(busName) {
        const entry = this._followed.get(busName);
        if (entry.release)
            entry.release();
        this._followed.delete(busName);
    }
}
