const Constants = require('./constants');
const PanelText = require('./panelText');

// What the media blocks show, from plain data read from MPRIS players. Every text comes
// from the players: it is cleaned here and only ever set as plain label text.

function isPlayerName(busName) {
    return typeof busName === 'string' && busName.startsWith(Constants.MPRIS_NAME_PREFIX)
        && busName.length > Constants.MPRIS_NAME_PREFIX.length;
}

// A string as one trimmed line; an array of strings joined; anything else empty.
function plainText(value) {
    if (Array.isArray(value))
        return value.map(plainText).filter(text => text).join(Constants.MEDIA_ARTIST_SEPARATOR);
    return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
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

// { title, subtitle } for a block, or null when the metadata has no title. @metadata: the
// unpacked Metadata map; @name: from playerName().
function blockText(metadata, name) {
    const title = plainText(metadata ? metadata['xesam:title'] : null);
    if (!title)
        return null;
    const artist = plainText(metadata['xesam:artist']);
    const player = PanelText.cutText(name, Constants.MEDIA_PLAYER_NAME_MAX);
    return {
        title: PanelText.cutText(title, Constants.MEDIA_TITLE_MAX),
        subtitle: artist
            ? `${PanelText.cutText(artist, Constants.MEDIA_ARTIST_MAX)}${Constants.MEDIA_PLAYER_SEPARATOR}${player}`
            : player,
    };
}

// The three buttons from the Player properties: { previous, playPause, next }, each
// { working, icon, label, method }. A capability not read yet counts as false; CanControl
// false makes every button inactive.
function buttonStates(player) {
    const control = player.CanControl !== false;
    const playing = player.PlaybackStatus === Constants.MPRIS_PLAYING;
    const playPause = playing ? Constants.MEDIA_BUTTONS.pause : Constants.MEDIA_BUTTONS.play;
    return {
        previous: { ...Constants.MEDIA_BUTTONS.previous, working: control && player.CanGoPrevious === true },
        playPause: { ...playPause, working: control && (playing ? player.CanPause : player.CanPlay) === true },
        next: { ...Constants.MEDIA_BUTTONS.next, working: control && player.CanGoNext === true },
    };
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
