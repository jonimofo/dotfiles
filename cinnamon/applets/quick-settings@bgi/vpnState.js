const Gio = imports.gi.Gio;
const GObject = imports.gi.GObject;
const NM = imports.gi.NM;
const Constants = require('./constants');
const VpnModel = require('./vpnModel');

// The VPN profiles of NetworkManager and which one is up. @onChange runs on every change:
// profile added or removed, connection going up or down, here or anywhere else.
class VpnState {
    constructor(onChange) {
        this._onChange = onChange;
        this._client = null;
        this._clientSignalIds = [];
        this._activeSignals = new Map();
        this._cancellable = new Gio.Cancellable();
        this.summary = VpnModel.summarize([], []);
        NM.Client.new_async(this._cancellable, (source, result) => this._onClientReady(result));
    }

    // Brings the target profile down when it is up, up otherwise.
    toggle() {
        const target = this.summary.target;
        if (target)
            this.toggleProfile(target);
    }

    toggleProfile(profile) {
        const activeConnection = this._activeConnectionOf(profile.uuid);
        if (activeConnection) {
            this._client.deactivate_connection_async(activeConnection, this._cancellable,
                (client, result) => this._finish(() => client.deactivate_connection_finish(result), `disconnecting VPN ${profile.id}`));
            return;
        }
        const connection = this._client.get_connection_by_uuid(profile.uuid);
        if (!connection)
            return;
        this._client.activate_connection_async(connection, null, null, this._cancellable,
            (client, result) => this._finish(() => client.activate_connection_finish(result), `connecting VPN ${profile.id}`));
    }

    destroy() {
        this._cancellable.cancel();
        this._disconnectActive();
        for (const id of this._clientSignalIds)
            GObject.signal_handler_disconnect(this._client, id);
        this._clientSignalIds = [];
        this._client = null;
    }

    _finish(finishCall, what) {
        try {
            finishCall();
        } catch (e) {
            if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                global.logError(`${Constants.LOG_PREFIX}: ${what} failed`, e);
        }
        this._update();
    }

    _onClientReady(result) {
        try {
            this._client = NM.Client.new_finish(result);
        } catch (e) {
            if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                global.logError(`${Constants.LOG_PREFIX}: connecting to NetworkManager failed`, e);
            return;
        }
        for (const signal of ['connection-added', 'connection-removed', 'active-connection-added', 'active-connection-removed'])
            this._clientSignalIds.push(this._client.connect(signal, () => this._update()));
        this._update();
    }

    _activeConnectionOf(uuid) {
        return this._client.get_active_connections().find(activeConnection => activeConnection.get_uuid() === uuid) || null;
    }

    // A VPN counts as up once NetworkManager reports it activated. Each VPN connection's
    // state is followed, so a failed activation brings the tile back to off.
    _update() {
        if (!this._client)
            return;
        const profiles = this._client.get_connections().map(connection => ({
            uuid: connection.get_uuid(),
            id: connection.get_id(),
            type: connection.get_connection_type(),
            iface: connection.get_interface_name(),
            timestamp: connection.get_setting_connection().get_timestamp(),
        }));
        const vpnUuids = VpnModel.vpnProfiles(profiles).map(profile => profile.uuid);
        this._disconnectActive();
        const activeUuids = [];
        for (const activeConnection of this._client.get_active_connections()) {
            if (!vpnUuids.includes(activeConnection.get_uuid()))
                continue;
            this._activeSignals.set(activeConnection, activeConnection.connect('notify::state', () => this._update()));
            if (activeConnection.get_state() === NM.ActiveConnectionState.ACTIVATED)
                activeUuids.push(activeConnection.get_uuid());
        }
        this.summary = VpnModel.summarize(profiles, activeUuids);
        this._onChange();
    }

    _disconnectActive() {
        for (const [activeConnection, id] of this._activeSignals)
            GObject.signal_handler_disconnect(activeConnection, id);
        this._activeSignals.clear();
    }
}
