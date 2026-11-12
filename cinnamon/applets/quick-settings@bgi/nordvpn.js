const Constants = require('./constants');
const NordvpnParser = require('./nordvpnParser');

// NordVPN through its command line client, run asynchronously. The status is read when the
// menu opens and after each action, never in the background. @onChange runs after each read.
// @runCommand(argv) returns a promise of the output (subprocess.js, or a fake in the tests).
class Nordvpn {
    constructor(runCommand, onChange) {
        this._run = runCommand;
        this._onChange = onChange;
        this.available = false;
        this.status = NordvpnParser.parseStatus('', Constants.NORDVPN_CONNECTED);
        this.countries = [];
        this.busy = false;
        this._unavailableLogged = false;
        this._destroyed = false;
    }

    // The country while connected, else null.
    get connectedCountry() {
        return this.status.connected ? this.status.country : null;
    }

    async refresh() {
        try {
            const output = await this._run([Constants.NORDVPN, 'status']);
            this.status = NordvpnParser.parseStatus(output, Constants.NORDVPN_CONNECTED);
            this.available = true;
            this._unavailableLogged = false;
        } catch (e) {
            this.available = false;
            if (!this._unavailableLogged)
                global.logError(`${Constants.LOG_PREFIX}: NordVPN unavailable, tile dimmed: ${e.message}`);
            this._unavailableLogged = true;
        }
        this._notify();
    }

    // Read once per menu session, when the list opens: the country list rarely changes.
    async loadCountries() {
        if (this.countries.length > 0)
            return;
        try {
            this.countries = NordvpnParser.parseCountries(await this._run([Constants.NORDVPN, 'countries']));
        } catch (e) {
            global.logError(`${Constants.LOG_PREFIX}: reading the NordVPN countries failed: ${e.message}`);
        }
        this._notify();
    }

    toggle() {
        return this.status.connected ? this._action(['disconnect']) : this._action(['connect']);
    }

    // @country: a name from the country list, or null for the quick connect.
    connectTo(country) {
        return this._action(country ? ['connect', country] : ['connect']);
    }

    destroy() {
        this._destroyed = true;
    }

    async _action(args) {
        if (this.busy)
            return;
        this.busy = true;
        this._notify();
        try {
            await this._run([Constants.NORDVPN, ...args]);
        } catch (e) {
            global.logError(`${Constants.LOG_PREFIX}: nordvpn ${args.join(' ')} failed: ${e.message}`);
        }
        this.busy = false;
        await this.refresh();
    }

    _notify() {
        if (!this._destroyed)
            this._onChange();
    }
}
