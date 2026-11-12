const GLib = imports.gi.GLib;
const Constants = require('./constants');

// The Brightness slider's model. Uses the DDC monitors when there are any, else the laptop
// panel. @onValue(fraction) shows a value; @onAvailable(bool) dims the row when neither
// backend answers. Results of an older read, write or detection are dropped once a newer
// one started, and nothing is shown after destroy().
class Brightness {
    constructor({ ddc, screen, onValue, onAvailable }) {
        this._ddc = ddc;
        this._screen = screen;
        this._onValue = onValue;
        this._onAvailable = onAvailable;
        this._backend = null;
        this._lastValue = null;
        this._generation = 0;
        this._writing = false;
        this._pendingValue = null;
        this._destroyed = false;
        this._detectGeneration = 0;
        this._detectSoonId = 0;
    }

    // A dock sends several monitor changes in a row: one detection once they stop.
    detectSoon() {
        if (this._detectSoonId)
            GLib.source_remove(this._detectSoonId);
        this._detectSoonId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, Constants.BRIGHTNESS_DETECT_DELAY_MS, () => {
            this._detectSoonId = 0;
            this.detect();
            return GLib.SOURCE_REMOVE;
        });
    }

    // Detects the backend again: at start and when the monitors change.
    async detect() {
        const generation = ++this._detectGeneration;
        let backend = null;
        try {
            await this._ddc.detect();
            if (this._ddc.available)
                backend = this._ddc;
        } catch (e) {
            global.logError(`${Constants.LOG_PREFIX}: detecting DDC monitors failed`, e);
        }
        if (!backend && this._screen) {
            try {
                await this._screen.read();
                backend = this._screen;
            } catch (e) {
                global.log(`${Constants.LOG_PREFIX}: no DDC monitor and no laptop panel backlight (${e.message}), Brightness slider dimmed`);
            }
        }
        if (this._destroyed || generation !== this._detectGeneration)
            return;
        this._backend = backend;
        this._onAvailable(backend !== null);
        await this.refresh();
    }

    // Reads the current value: called each time the menu opens.
    async refresh() {
        if (!this._backend || this._writing)
            return;
        const generation = ++this._generation;
        try {
            const value = await this._backend.read();
            if (generation !== this._generation || this._destroyed)
                return;
            this._lastValue = value;
            this._onValue(value);
        } catch (e) {
            global.logError(`${Constants.LOG_PREFIX}: reading the brightness failed`, e);
        }
    }

    // Sends @fraction. A value sent while a write runs replaces any other waiting one.
    async set(fraction) {
        if (!this._backend)
            return;
        this._pendingValue = fraction;
        if (this._writing)
            return;
        this._writing = true;
        while (this._pendingValue !== null && !this._destroyed) {
            const value = this._pendingValue;
            this._pendingValue = null;
            ++this._generation;
            try {
                await this._backend.write(value);
                this._lastValue = value;
            } catch (e) {
                global.logError(`${Constants.LOG_PREFIX}: ${e.message}`);
                if (!this._destroyed && this._lastValue !== null && this._pendingValue === null)
                    this._onValue(this._lastValue);
            }
        }
        this._writing = false;
    }

    destroy() {
        this._destroyed = true;
        if (this._detectSoonId)
            GLib.source_remove(this._detectSoonId);
        this._detectSoonId = 0;
    }
}
