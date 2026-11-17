const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Constants = require('./constants');
const AsyncHelpers = require('./asyncHelpers');
const MediaModel = require('./mediaModel');

// The MPRIS players on the session bus, as the stock sound applet finds them: ListNames at
// start, NameOwnerChanged afterwards. Each player's Identity and Player properties are read
// with GetAll and followed with PropertiesChanged. @onChange runs on every change; `blocks`
// is then what the menu shows (MediaModel.visibleBlocks). A player that leaves the bus has
// its subscription released at once; destroy() releases everything and nothing runs after.
// @bus: the session bus, or a fake in the tests.
class MediaPlayers {
    constructor(onChange, bus = Gio.DBus.session) {
        this._bus = bus;
        this._onChange = onChange;
        this._players = new Map();
        this._destroyed = false;
        this._cancellable = new Gio.Cancellable();
        const daemon = Constants.DBUS_DAEMON;
        this._ownerSignalId = bus.signal_subscribe(daemon.name, daemon.iface, 'NameOwnerChanged', daemon.path, null,
            Gio.DBusSignalFlags.NONE, (connection, sender, path, iface, signal, parameters) =>
                this._onOwnerChanged(...parameters.deepUnpack()));
        this._callDaemon('ListNames', null, 'listing the session bus names', reply => {
            for (const busName of reply.deepUnpack()[0].filter(MediaModel.isPlayerName)) {
                this._callDaemon('GetNameOwner', new GLib.Variant('(s)', [busName]), `finding the owner of ${busName}`,
                    ownerReply => this._add(busName, ownerReply.deepUnpack()[0]));
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
        const name = MediaModel.playerName(player.identity, busName);
        AsyncHelpers.callDbus(this._bus, { name: busName, path: Constants.MPRIS_PATH, iface: Constants.MPRIS_PLAYER_INTERFACE },
            method, null, this._cancellable, `${method} on the media player ${name}`, () => {});
    }

    destroy() {
        this._destroyed = true;
        this._cancellable.cancel();
        this._bus.signal_unsubscribe(this._ownerSignalId);
        for (const player of this._players.values())
            this._bus.signal_unsubscribe(player.signalId);
        this._players.clear();
    }

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
        const player = { busName, owner, identity: null, metadata: {}, properties: {}, signalId: 0 };
        player.signalId = this._bus.signal_subscribe(busName, Constants.DBUS_PROPERTIES_INTERFACE, 'PropertiesChanged',
            Constants.MPRIS_PATH, null, Gio.DBusSignalFlags.NONE, (connection, sender, path, iface, signal, parameters) =>
                this._onPropertiesChanged(player, ...parameters.deepUnpack()));
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

    // A reply for a player that left (or came back as a new one) in the meantime is dropped.
    _readAll(player, iface) {
        AsyncHelpers.callDbus(this._bus, { name: player.busName, path: Constants.MPRIS_PATH, iface: Constants.DBUS_PROPERTIES_INTERFACE },
            'GetAll', new GLib.Variant('(s)', [iface]), this._cancellable, `reading ${iface} of ${player.busName}`, reply => {
                if (this._players.get(player.busName) === player)
                    this._apply(player, iface, reply.deepUnpack()[0]);
            });
    }

    // Properties the player only invalidates (no value sent) are read again.
    _onPropertiesChanged(player, iface, changed, invalidated) {
        if (iface !== Constants.MPRIS_ROOT_INTERFACE && iface !== Constants.MPRIS_PLAYER_INTERFACE)
            return;
        if (this._players.get(player.busName) !== player)
            return;
        this._apply(player, iface, changed);
        if (invalidated.length > 0)
            this._readAll(player, iface);
    }

    // @variants: { property: GLib.Variant }.
    _apply(player, iface, variants) {
        const values = {};
        for (const [property, variant] of Object.entries(variants))
            values[property] = variant.recursiveUnpack();
        if (iface === Constants.MPRIS_ROOT_INTERFACE) {
            if ('Identity' in values)
                player.identity = values.Identity;
        } else {
            Object.assign(player.properties, values);
            if ('Metadata' in values)
                player.metadata = values.Metadata || {};
        }
        this._notify();
    }

    _callDaemon(method, parameters, what, onReply) {
        AsyncHelpers.callDbus(this._bus, Constants.DBUS_DAEMON, method, parameters, this._cancellable, what, onReply);
    }

    _notify() {
        if (!this._destroyed)
            this._onChange();
    }
}
