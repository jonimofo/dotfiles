const MediaPlayers = require('./mediaPlayers');
const MediaFocus = require('./mediaFocus');
const MediaWindowTitles = require('./mediaWindowTitles');

// The media controls' flow, kept out of applet.js so it runs on fakes in the tests: the
// players on the session bus and the window titles of the ones without a track title start
// and stop together. On each player change the untitled players are followed first, then
// @onBlocks(blocks) gets MediaModel.visibleBlocks(); on menu opening the windows are looked
// for again. @windows: MediaWindows.CINNAMON_WINDOWS, or a fake; @bus: the session bus, or a
// fake.
class MediaControls {
    constructor(onBlocks, windows, bus = undefined) {
        this._windows = windows;
        this._players = new MediaPlayers.MediaPlayers(() => {
            this._titles.follow(this._players.untitled);
            onBlocks(this._players.blocks);
        }, bus);
        this._titles = new MediaWindowTitles.MediaWindowTitles(this._players, windows);
    }

    // @method: a MediaModel button's method.
    call(busName, method) {
        this._players.call(busName, method);
    }

    // @time: the click's event time, read during the click.
    focus(busName, time) {
        MediaFocus.focusPlayer(busName, this._players, this._windows, time);
    }

    menuOpened() {
        this._titles.follow(this._players.untitled, true);
    }

    destroy() {
        this._titles.destroy();
        this._players.destroy();
    }
}
