// Airplane mode over the applet's own radios. @radios: [{ isOn(), setOn(on, onFailed) }],
// here Wi-Fi (libnm) and Bluetooth (BlueZ). A first toggle() turns off every radio that is on
// and remembers which; a second one turns those back on, so a radio that was already off
// stays off. sync() runs on every radio change: a radio seen off since airplane mode started
// that is on again was turned on by hand, and airplane mode ends there, restoring nothing.
// A radio that refuses to turn off ends it the same way, and @onChange() runs so the tile
// leaves its checked state.
class AirplaneMode {
    constructor(radios, onChange = () => {}) {
        this._radios = radios;
        this._onChange = onChange;
        this.active = false;
        this._restore = [];
        // Radios turned off by toggle() whose change has not arrived yet.
        this._turningOff = new Set();
    }

    toggle() {
        if (this.active)
            this._leave();
        else
            this._enter();
    }

    sync() {
        if (!this.active)
            return;
        for (const radio of this._radios) {
            if (!radio.isOn()) {
                this._turningOff.delete(radio);
            } else if (!this._turningOff.has(radio)) {
                this._end();
                return;
            }
        }
    }

    _enter() {
        this._restore = this._radios.filter(radio => radio.isOn());
        this._turningOff = new Set(this._restore);
        this.active = true;
        for (const radio of this._restore)
            radio.setOn(false, () => this._refused(radio));
    }

    // @radio stays on: it is no longer waited for, and sync() ends airplane mode.
    _refused(radio) {
        if (!this.active || !this._turningOff.delete(radio))
            return;
        this.sync();
        this._onChange();
    }

    _leave() {
        const restore = this._restore;
        this._end();
        for (const radio of restore)
            radio.setOn(true);
    }

    _end() {
        this.active = false;
        this._restore = [];
        this._turningOff.clear();
    }
}
