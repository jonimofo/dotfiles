const Gio = imports.gi.Gio;
const GObject = imports.gi.GObject;
const NM = imports.gi.NM;
const VpnModel = require('./vpnModel');
const AsyncHelpers = require('./asyncHelpers');

// The VPN profiles of NetworkManager and which one is up. @onChange runs on every change:
// profile added or removed, connection going up or down, here or anywhere else.
// @requestClient(cancellable, onReady): the applet's shared client (SharedNmClient.request),
// or a fake in the tests.
class VpnState {
    constructor(onChange, requestClient) {
        this._onChange = onChange;
        this._client = null;
        this._clientSignalIds = [];
        this._activeSignals = new Map();
        // Profiles with an activation or deactivation on its way: a second click waits.
        this._inFlight = new Set();
        this._cancellable = new Gio.Cancellable();
        this.summary = VpnModel.summarize([], []);
        requestClient(this._cancellable, (client, error) => this._onClientReady(client, error));
    }

    // Brings the target profile down when it is up, up otherwise.
    toggle() {
        const target = this.summary.target;
        if (target)
            this.toggleProfile(target);
    }

    toggleProfile(profile) {
        if (!this._client || this._inFlight.has(profile.uuid))
            return;
        const activeConnection = this._activeConnectionOf(profile.uuid);
        if (activeConnection) {
            this._inFlight.add(profile.uuid);
            this._client.deactivate_connection_async(activeConnection, this._cancellable,
                (client, result) => this._finish(profile, () => client.deactivate_connection_finish(result), `disconnecting VPN ${profile.id}`));
            return;
        }
        const connection = this._client.get_connection_by_uuid(profile.uuid);
        if (!connection)
            return;
        this._inFlight.add(profile.uuid);
        this._client.activate_connection_async(connection, null, null, this._cancellable,
            (client, result) => this._finish(profile, () => client.activate_connection_finish(result), `connecting VPN ${profile.id}`));
    }

    destroy() {
        this._cancellable.cancel();
        this._disconnectActive();
        for (const id of this._clientSignalIds)
            GObject.signal_handler_disconnect(this._client, id);
        this._clientSignalIds = [];
        this._client = null;
    }

    _finish(profile, finishCall, what) {
        this._inFlight.delete(profile.uuid);
        try {
            finishCall();
        } catch (e) {
            if (AsyncHelpers.logUnlessCancelled(e, what))
                return;
        }
        this._update();
    }

    _onClientReady(client, error) {
        if (error) {
            AsyncHelpers.logUnlessCancelled(error, 'connecting to NetworkManager');
            return;
        }
        this._client = client;
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
