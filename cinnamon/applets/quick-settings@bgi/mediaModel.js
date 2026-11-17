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

// { title, artist, player } for a block, or null when the metadata has no title. Line 2 is
// artist then player: artist ends with the separator ("Artist · "), or is empty without an
// artist, so the player name shows alone. @metadata: the unpacked Metadata map; @name: from
// playerName().
function blockText(metadata, name) {
    const title = plainText(metadata ? metadata['xesam:title'] : null);
    if (!title)
        return null;
    const artist = plainText(metadata['xesam:artist']);
    const player = PanelText.cutText(name, Constants.MEDIA_PLAYER_NAME_MAX);
    return {
        title: PanelText.cutText(title, Constants.MEDIA_TITLE_MAX),
        artist: artist ? `${PanelText.cutText(artist, Constants.MEDIA_ARTIST_MAX)}${Constants.MEDIA_PLAYER_SEPARATOR}` : '',
        player,
    };
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

// The blocks to show. @players: [{ busName, owner, identity, metadata, properties }]. Two
// names of one owner (a player and its instance name) count once, the longer name kept;
// players without a title are left out; order by display name, then bus name; at most @max.
// Returns [{ busName, name, text, buttons }].
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
            return { busName: player.busName, name, text: blockText(player.metadata, name), buttons: buttonStates(player.properties || {}) };
        })
        .filter(block => block.text)
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
