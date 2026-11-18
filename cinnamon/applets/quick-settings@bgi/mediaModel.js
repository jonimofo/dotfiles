const Constants = require('./constants');
const PanelText = require('./panelText');

// What the media blocks show, from plain data read from MPRIS players. Every text comes
// from the players: it is cleaned here and only ever set as plain label text.

function isPlayerName(busName) {
    return typeof busName === 'string' && busName.startsWith(Constants.MPRIS_NAME_PREFIX)
        && busName.length > Constants.MPRIS_NAME_PREFIX.length;
}

// Control characters, and the bidi controls that could reorder the rest of the line.
const HIDDEN_CHARACTERS = /[\u0000-\u001F\u007F-\u009F\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;

// A string as one trimmed line without control characters; an array of strings joined;
// anything else empty.
function plainText(value) {
    if (Array.isArray(value))
        return value.map(plainText).filter(text => text).join(Constants.MEDIA_ARTIST_SEPARATOR);
    if (typeof value !== 'string')
        return '';
    return value.replace(/\s+/g, ' ').replace(HIDDEN_CHARACTERS, '').replace(/ {2,}/g, ' ').trim();
}

// The player part of the bus name, without an instance suffix, capitalised:
// org.mpris.MediaPlayer2.firefox.instance_1_2 and org.mpris.MediaPlayer2.vlc-123 give
// Firefox and Vlc.
function fallbackName(busName) {
    const part = busName.slice(Constants.MPRIS_NAME_PREFIX.length).split('.')[0].replace(/-\d+$/, '');
    return part ? `${part[0].toUpperCase()}${part.slice(1)}` : busName;
}

// The player's Identity, else fallbackName().
function playerName(identity, busName) {
    return plainText(identity) || fallbackName(busName);
}

// Whether the metadata has a track title (xesam:title, once cleaned).
function hasTrackTitle(metadata) {
    return plainText(metadata ? metadata['xesam:title'] : null) !== '';
}

// { title, artist, player } for a block. Line 1 is the track title (xesam:title), else
// @windowTitle (the title of the player's own window, for a player that publishes no track
// title), else empty: the player name then shows alone on line 2. Line 2 is artist then
// player: artist ends with the separator ("Artist · "), or is empty without an artist, so
// the player name shows alone. @metadata: the unpacked Metadata map; @name: from
// playerName(); @windowTitle: untrusted text, cleaned and cut like a track title.
function blockText(metadata, name, windowTitle = null) {
    const title = plainText(metadata ? metadata['xesam:title'] : null) || plainText(windowTitle);
    const artist = metadata ? plainText(metadata['xesam:artist']) : '';
    const player = PanelText.cutText(name, Constants.MEDIA_PLAYER_NAME_MAX);
    return {
        title: title ? PanelText.cutText(title, Constants.MEDIA_TITLE_MAX) : '',
        artist: artist ? `${PanelText.cutText(artist, Constants.MEDIA_ARTIST_MAX)}${Constants.MEDIA_PLAYER_SEPARATOR}` : '',
        player,
    };
}

// Whether the Player properties say it plays now (PlaybackStatus Playing): the block's
// accent bar shows only then.
function isPlaying(properties) {
    return Boolean(properties) && properties.PlaybackStatus === Constants.MPRIS_PLAYING;
}

// The three buttons from the Player properties: { previous, playPause, next }, each
// { working, icon, label, method }. A capability not read yet counts as false; CanControl
// false makes every button inactive.
function buttonStates(player) {
    const control = player.CanControl !== false;
    const playing = player.PlaybackStatus === Constants.MPRIS_PLAYING;
    const buttons = Constants.MEDIA_BUTTONS;
    const definitions = { previous: buttons.previous, playPause: playing ? buttons.pause : buttons.play, next: buttons.next };
    const capable = { previous: player.CanGoPrevious, playPause: playing ? player.CanPause : player.CanPlay, next: player.CanGoNext };
    return Object.fromEntries(Constants.MEDIA_BUTTON_ORDER.map(key =>
        [key, { ...definitions[key], working: control && capable[key] === true }]));
}

// The blocks to show. @players: [{ busName, owner, identity, metadata, properties,
// windowTitle }]. Two names of one owner (a player and its instance name) count once, the
// longer name kept; every announced player gets a block, titled as blockText() says; order by
// display name, then bus name; at most @max. Returns [{ busName, name, text, buttons, playing }].
function visibleBlocks(players, max) {
    const byOwner = new Map();
    for (const player of players) {
        const key = player.owner || player.busName;
        const kept = byOwner.get(key);
        if (!kept || player.busName.length > kept.busName.length)
            byOwner.set(key, player);
    }
    return [...byOwner.values()]
        .map(player => {
            const name = playerName(player.identity, player.busName);
            const properties = player.properties || {};
            return {
                busName: player.busName,
                name,
                text: blockText(player.metadata, name, player.windowTitle),
                buttons: buttonStates(properties),
                playing: isPlaying(properties),
            };
        })
        .sort((one, two) => one.name.localeCompare(two.name) || one.busName.localeCompare(two.busName))
        .slice(0, max);
}

// How to turn the blocks on screen (@oldOrder, bus names top to bottom) into @newOrder
// without touching the blocks that stay in place, so keyboard focus and hover survive a
// player change. Returns { remove: [busName], steps: [{ kind: 'add' | 'move', busName,
// index }] }: remove first, then apply the steps in order, each putting @busName at @index.
function blockMoves(oldOrder, newOrder) {
    const wanted = new Set(newOrder);
    const remove = oldOrder.filter(busName => !wanted.has(busName));
    const current = oldOrder.filter(busName => wanted.has(busName));
    const steps = [];
    newOrder.forEach((busName, index) => {
        if (current[index] === busName)
            return;
        const at = current.indexOf(busName);
        if (at >= 0)
            current.splice(at, 1);
        current.splice(index, 0, busName);
        steps.push({ kind: at >= 0 ? 'move' : 'add', busName, index });
    });
    return { remove, steps };
}

// The window to bring forward among @windows ([{ title, userTime }], from one application or
// one process): a window whose title holds @trackTitle (a browser whose active tab plays),
// else the one used last; the most recent wins among several. Returns its index, or -1.
function chooseWindow(windows, trackTitle) {
    const title = plainText(trackTitle);
    const titled = title ? windows.filter(window => plainText(window.title).includes(title)) : [];
    const pool = titled.length > 0 ? titled : windows;
    let best = null;
    for (const window of pool) {
        if (!best || window.userTime > best.userTime)
            best = window;
    }
    return best ? windows.indexOf(best) : -1;
}

// Every second block on screen (the second, the fourth) gets the lists' faint background, so
// several players read as separate rows; a single block stays plain. @index: from 0.
function isTinted(index) {
    return index % 2 === 1;
}

// Brings the block views in line with @blocks (MediaModel.visibleBlocks(), in order): the
// moves of blockMoves() applied through @actions, then every view updated and tinted for its
// new place. @views: Map of bus name to view ({ update(block), setTinted(bool), destroy() });
// @onScreen: the bus names in screen order; @actions: { create(busName) -> view,
// insert(view, index), move(view, index) }.
function syncBlockViews(views, onScreen, blocks, actions) {
    const { remove, steps } = blockMoves(onScreen, blocks.map(block => block.busName));
    for (const busName of remove) {
        views.get(busName).destroy();
        views.delete(busName);
    }
    for (const { kind, busName, index } of steps) {
        if (kind === 'add') {
            const view = actions.create(busName);
            views.set(busName, view);
            actions.insert(view, index);
        } else {
            actions.move(views.get(busName), index);
        }
    }
    blocks.forEach((block, index) => {
        const view = views.get(block.busName);
        view.update(block);
        view.setTinted(isTinted(index));
    });
}
