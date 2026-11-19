const MediaFocus = require('./mediaFocus');

// The window titles of the players that publish no track title: their block shows the title
// of the player's own window instead. Generic for any MPRIS player. The window is the one
// click-to-focus brings forward (MediaFocus.findPlayerWindow: the player's own process only,
// the window used last among several). Its title is followed with windows.watchTitle(), no
// polling, and handed to players.setWindowTitle(), which cleans it and updates the blocks.
// A player without a window found has no window title (its block shows the player name
// alone); it is looked for again at the next follow() (a player change, or the menu
// opening). A window that closes is released and left out of every later choice, so another
// window of the player can take over.
// Each followed player is one bus name with one owner: a name taken over by another process
// is a new player, its old entry released and the late replies for it dropped.
// @players: MediaPlayers (focusInfo, processId, setWindowTitle).
// @windows: as MediaFocus.findPlayerWindow(), plus watchTitle(window, onTitle, onGone) ->
// release().
class MediaWindowTitles {
    constructor(players, windows) {
        this._players = players;
        this._windows = windows;
        // Bus name to { owner, window, release, looking, gone }.
        this._followed = new Map();
        this._destroyed = false;
    }

    // @untitled: [{ busName, owner }], the players without a track title now
    // (MediaPlayers.untitled). The others are released (their window title cleared); the
    // ones without a window are looked for. @again: also look again for the players that
    // have a window (on menu opening), so the title stays the one of the window
    // click-to-focus would bring forward.
    follow(untitled, again = false) {
        if (this._destroyed)
            return;
        const wanted = new Map(untitled.map(player => [player.busName, player.owner]));
        for (const [busName, entry] of [...this._followed]) {
            if (!wanted.has(busName) || wanted.get(busName) !== entry.owner)
                this._release(busName);
        }
        for (const [busName, owner] of wanted) {
            let entry = this._followed.get(busName);
            if (!entry) {
                entry = { owner, window: null, release: null, looking: false, gone: new Set() };
                this._followed.set(busName, entry);
            }
            if (!entry.looking && (again || !entry.window))
                this._look(busName, entry);
        }
    }

    destroy() {
        for (const busName of [...this._followed.keys()])
            this._release(busName);
        this._destroyed = true;
    }

    _look(busName, entry) {
        entry.looking = true;
        const stillWanted = () => !this._destroyed && this._followed.get(busName) === entry;
        MediaFocus.findPlayerWindow(busName, this._players, this._windows, window => {
            if (!stillWanted())
                return;
            entry.looking = false;
            if (window !== entry.window)
                this._watch(busName, entry, window);
        }, () => {
            if (!stillWanted())
                return;
            entry.looking = false;
            this._unwatch(entry);
            this._players.setWindowTitle(busName, null);
        }, entry.gone);
    }

    _watch(busName, entry, window) {
        this._unwatch(entry);
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

    _unwatch(entry) {
        if (entry.release)
            entry.release();
        entry.window = null;
        entry.release = null;
    }

    // The player may still be listed (it got a track title): its window title is cleared.
    _release(busName) {
        this._unwatch(this._followed.get(busName));
        this._followed.delete(busName);
        this._players.setWindowTitle(busName, null);
    }
}
