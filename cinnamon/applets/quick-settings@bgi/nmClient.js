const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const NM = imports.gi.NM;

// One NetworkManager client for the whole applet: Wi-Fi and VPN share its object cache.
// request(cancellable, onReady) is what WifiState and VpnState take; onReady(client, error)
// always runs from the main loop, never inside the caller's constructor, and gets a
// CANCELLED error when the caller cancelled in the meantime.
class SharedNmClient {
    constructor() {
        this._client = null;
        this._error = null;
        this._waiting = [];
        this._cancellable = new Gio.Cancellable();
        NM.Client.new_async(this._cancellable, (source, result) => {
            try {
                this._client = NM.Client.new_finish(result);
            } catch (e) {
                this._error = e;
            }
            this._deliver();
        });
    }

    request(cancellable, onReady) {
        this._waiting.push({ cancellable, onReady });
        if (this._client || this._error)
            GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                this._deliver();
                return GLib.SOURCE_REMOVE;
            });
    }

    destroy() {
        this._cancellable.cancel();
        this._waiting = [];
        this._client = null;
    }

    _deliver() {
        const waiting = this._waiting;
        this._waiting = [];
        for (const { cancellable, onReady } of waiting) {
            if (cancellable.is_cancelled())
                onReady(null, new GLib.Error(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED, 'Operation was cancelled'));
            else
                onReady(this._client, this._error);
        }
    }
}
