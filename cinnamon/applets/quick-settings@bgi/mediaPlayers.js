const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Constants = require('./constants');
const AsyncHelpers = require('./asyncHelpers');
const MediaModel = require('./mediaModel');
const PanelText = require('./panelText');

const TYPES = Constants.MPRIS_TYPES;

// The MPRIS players on the session bus, as the stock sound applet finds them: ListNames at
// start, NameOwnerChanged afterwards. Each player's Identity and Player properties are read
// with GetAll and followed with PropertiesChanged. @onChange runs once per burst of changes
// (on the next idle); `blocks` is then what the menu shows (MediaModel.visibleBlocks). Every
// signal and reply is checked against its D-Bus type before it is read: anything else from
// a player is ignored, logged once per player, and a player's error text is cut in the log.
// A player that leaves the bus has its subscription released at once, and its late replies
// are dropped without a log; destroy() releases everything and nothing runs after.
// @bus: the session bus, or a fake in the tests.
class MediaPlayers {
    constructor(onChange, bus = Gio.DBus.session) {
        this._bus = bus;
        this._players = new Map();
        this._destroyed = false;
        this._cancellable = new Gio.Cancellable();
        this._update = new AsyncHelpers.IdleCoalescer(() => onChange());
        const daemon = Constants.DBUS_DAEMON;
        this._ownerSignalId = bus.signal_subscribe(daemon.name, daemon.iface, 'NameOwnerChanged', daemon.path, null,
            Gio.DBusSignalFlags.NONE, (connection, sender, path, iface, signal, parameters) => {
                if (parameters.get_type_string() === TYPES.nameOwnerChanged)
                    this._onOwnerChanged(...parameters.deepUnpack());
            });
        this._callDaemon('ListNames', null, TYPES.listNames, 'listing the session bus names', reply => {
            for (const busName of reply.deepUnpack()[0].filter(MediaModel.isPlayerName)) {
                this._callDaemon('GetNameOwner', new GLib.Variant('(s)', [busName]), TYPES.nameOwner,
                    `finding the owner of ${busName}`, ownerReply => this._add(busName, ownerReply.deepUnpack()[0]));
            }
        });
    }

    get blocks() {
        return MediaModel.visibleBlocks([...this._players.values()], Constants.MEDIA_MAX_PLAYERS);
    }

    // @method: a MediaModel button's method (Previous, PlayPause, Next).
    call(busName, method) {
        const player = this._players.get(busName);
        if (!player)
            return;
        this._callPlayer(player, Constants.MPRIS_PLAYER_INTERFACE, method, null, null,
            `${method} on the media player ${this._logName(player)}`, () => {});
    }

    // What MediaFocus.focusPlayer() needs, or null for a player no longer listed.
    focusInfo(busName) {
        const player = this._players.get(busName);
        if (!player)
            return null;
        const metadata = player.metadata || {};
        return {
            desktopEntry: MediaModel.plainText(player.root.DesktopEntry) || null,
            canRaise: player.root.CanRaise === true,
            title: MediaModel.plainText(metadata['xesam:title']),
        };
    }

    // @onPid(pid) with the process that owns @busName; @onNone() when it cannot be read.
    processId(busName, onPid, onNone) {
        const player = this._players.get(busName);
        if (!player) {
            onNone();
            return;
        }
        AsyncHelpers.callDbus(this._bus, Constants.DBUS_DAEMON, 'GetConnectionUnixProcessID',
            new GLib.Variant('(s)', [player.owner]), this._cancellable, `finding the process of ${this._logName(player)}`,
            reply => onPid(reply.deepUnpack()[0]), onNone,
            { replyType: TYPES.processId, stillWanted: () => this._isCurrent(player), errorTextMax: Constants.MEDIA_ERROR_TEXT_MAX });
    }

    raise(busName) {
        const player = this._players.get(busName);
        if (player) {
            this._callPlayer(player, Constants.MPRIS_ROOT_INTERFACE, Constants.MEDIA_RAISE_METHOD, null, null,
                `raising the media player ${this._logName(player)}`, () => {});
        }
    }

    // No window found and no Raise: logged once per player.
    noWindow(busName) {
        const player = this._players.get(busName);
        if (!player || player.noWindowLogged)
            return;
        player.noWindowLogged = true;
        global.log(`${Constants.LOG_PREFIX}: no window found for the media player ${this._logName(player)}`);
    }

    destroy() {
        this._destroyed = true;
        this._update.cancel();
        this._cancellable.cancel();
        this._bus.signal_unsubscribe(this._ownerSignalId);
        for (const player of this._players.values())
            this._bus.signal_unsubscribe(player.signalId);
        this._players.clear();
    }

    // A name taken over by another process (both owners set) is a new player.
    _onOwnerChanged(busName, oldOwner, newOwner) {
        if (!MediaModel.isPlayerName(busName))
            return;
        if (oldOwner)
            this._remove(busName);
        if (newOwner)
            this._add(busName, newOwner);
    }

    _add(busName, owner) {
        if (this._destroyed || this._players.has(busName) || !owner)
            return;
        const player = {
            busName, owner, identity: null, root: {}, metadata: {}, properties: {}, signalId: 0, warned: false,
            noWindowLogged: false,
        };
        player.signalId = this._bus.signal_subscribe(busName, Constants.DBUS_PROPERTIES_INTERFACE, 'PropertiesChanged',
            Constants.MPRIS_PATH, null, Gio.DBusSignalFlags.NONE, (connection, sender, path, iface, signal, parameters) => {
                if (parameters.get_type_string() === TYPES.propertiesChanged)
                    this._onPropertiesChanged(player, ...parameters.deepUnpack());
                else
                    this._warnOnce(player, `PropertiesChanged of type ${parameters.get_type_string()}`);
            });
        this._players.set(busName, player);
        this._readAll(player, Constants.MPRIS_ROOT_INTERFACE);
        this._readAll(player, Constants.MPRIS_PLAYER_INTERFACE);
    }

    _remove(busName) {
        const player = this._players.get(busName);
        if (!player)
            return;
        this._bus.signal_unsubscribe(player.signalId);
        this._players.delete(busName);
        this._notify();
    }

    _isCurrent(player) {
        return !this._destroyed && this._players.get(player.busName) === player;
    }

    // A reply of another type is a failed call (logged once per call); a reply for a player
    // that left (or came back as a new one) in the meantime is dropped.
    _readAll(player, iface) {
        this._callPlayer(player, Constants.DBUS_PROPERTIES_INTERFACE, 'GetAll', new GLib.Variant('(s)', [iface]),
            TYPES.getAll, `reading ${iface} of ${this._logName(player)}`, reply => {
                if (this._isCurrent(player))
                    this._apply(player, iface, reply.deepUnpack()[0]);
            });
    }

    // Properties the player only invalidates (no value sent) are read again.
    _onPropertiesChanged(player, iface, changed, invalidated) {
        if (iface !== Constants.MPRIS_ROOT_INTERFACE && iface !== Constants.MPRIS_PLAYER_INTERFACE)
            return;
        if (!this._isCurrent(player))
            return;
        this._apply(player, iface, changed);
        if (invalidated.length > 0)
            this._readAll(player, iface);
    }

    // @variants: { property: GLib.Variant }. Only the properties read here, each with its
    // MPRIS type; a value of another type is left out.
    _apply(player, iface, variants) {
        const values = {};
        for (const [property, variant] of Object.entries(variants)) {
            const expected = TYPES.properties[property];
            if (!expected)
                continue;
            if (variant.get_type_string() === expected)
                values[property] = variant.recursiveUnpack();
            else
                this._warnOnce(player, `${property} of type ${variant.get_type_string()}`);
        }
        if (iface === Constants.MPRIS_ROOT_INTERFACE) {
            Object.assign(player.root, values);
            if ('Identity' in values)
                player.identity = values.Identity;
        } else {
            Object.assign(player.properties, values);
            if ('Metadata' in values)
                player.metadata = values.Metadata;
        }
        this._notify();
    }

    _warnOnce(player, what) {
        if (player.warned)
            return;
        player.warned = true;
        global.logError(`${Constants.LOG_PREFIX}: the media player ${this._logName(player)} sent ${what}, ignored`);
    }

    _logName(player) {
        return PanelText.cutText(MediaModel.playerName(player.identity, player.busName), Constants.MEDIA_PLAYER_NAME_MAX);
    }

    _callPlayer(player, iface, method, parameters, replyType, what, onReply) {
        AsyncHelpers.callDbus(this._bus, { name: player.busName, path: Constants.MPRIS_PATH, iface }, method, parameters,
            this._cancellable, what, onReply, null,
            { replyType, stillWanted: () => this._isCurrent(player), errorTextMax: Constants.MEDIA_ERROR_TEXT_MAX });
    }

    _callDaemon(method, parameters, replyType, what, onReply) {
        AsyncHelpers.callDbus(this._bus, Constants.DBUS_DAEMON, method, parameters, this._cancellable, what, onReply, null,
            { replyType });
    }

    _notify() {
        if (!this._destroyed)
            this._update.schedule();
    }
}
