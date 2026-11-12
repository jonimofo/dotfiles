const Gio = imports.gi.Gio;
const Cvc = imports.gi.Cvc;
const Constants = require('./constants');
const VolumeMapping = require('./volumeMapping');

// One default stream (the output sink or the input source) and its slider value, following
// changes made anywhere: the stock sound applet, media keys, pavucontrol.
class StreamVolume {
    constructor(onValue) {
        this._onValue = onValue;
        this._stream = null;
        this._signalIds = [];
        this.max = 0;
        this.norm = 0;
    }

    get available() {
        return this._stream !== null;
    }

    get value() {
        if (!this._stream)
            return 0;
        return VolumeMapping.sliderValue(this._stream.volume, this._stream.is_muted, this.max);
    }

    setStream(stream) {
        this._disconnect();
        this._stream = stream;
        if (stream) {
            for (const property of ['volume', 'is-muted'])
                this._signalIds.push(stream.connect(`notify::${property}`, () => this.notify()));
        }
        this.notify();
    }

    setLimits(norm, max) {
        this.norm = norm;
        this.max = max;
        this.notify();
    }

    notify() {
        this._onValue(this.available, this.value);
    }

    // Same steps as the stock sound applet's slider: set the volume, push it, then mute or
    // unmute.
    set(value) {
        if (!this._stream)
            return;
        const { volume, muted } = VolumeMapping.streamVolume(value, this.norm, this.max);
        this._stream.volume = volume;
        this._stream.push_volume();
        if (this._stream.is_muted !== muted)
            this._stream.change_is_muted(muted);
    }

    destroy() {
        this._disconnect();
        this._stream = null;
    }

    _disconnect() {
        for (const id of this._signalIds)
            this._stream.disconnect(id);
        this._signalIds = [];
    }
}

// The mixer, opened like the stock sound applet: default sink for the output, default
// source for the input. @onOutput and @onInput get (available, value).
class Volume {
    constructor(onOutput, onInput) {
        this.output = new StreamVolume(onOutput);
        this.input = new StreamVolume(onInput);
        this._soundSettings = new Gio.Settings({ schema_id: Constants.SOUND_SCHEMA });
        this._settingsId = this._soundSettings.connect(`changed::${Constants.AMPLIFIED_VOLUME_KEY}`,
            () => this._updateLimits());

        this._control = new Cvc.MixerControl({ name: Constants.MIXER_NAME });
        this._controlIds = [
            this._control.connect('state-changed', () => this._onStateChanged()),
            this._control.connect('default-sink-changed', () => this._readOutput()),
            this._control.connect('active-output-update', () => this._readOutput()),
            this._control.connect('default-source-changed', () => this._readInput()),
            this._control.connect('active-input-update', () => this._readInput()),
        ];
        this._norm = this._control.get_vol_max_norm();
        this._updateLimits();
        this._control.open();
    }

    destroy() {
        this.output.destroy();
        this.input.destroy();
        for (const id of this._controlIds)
            this._control.disconnect(id);
        this._controlIds = [];
        this._control.close();
        this._soundSettings.disconnect(this._settingsId);
    }

    _onStateChanged() {
        if (this._control.get_state() === Cvc.MixerControlState.READY) {
            this._readOutput();
            this._readInput();
        } else {
            this.output.setStream(null);
            this.input.setStream(null);
        }
    }

    _readOutput() {
        this.output.setStream(this._control.get_default_sink());
    }

    _readInput() {
        this.input.setStream(this._control.get_default_source());
    }

    // Only the output may go past 100%, when the user allows amplified volume.
    _updateLimits() {
        const amplified = this._soundSettings.get_boolean(Constants.AMPLIFIED_VOLUME_KEY);
        this.output.setLimits(this._norm, amplified ? this._norm * Constants.AMPLIFIED_VOLUME_FACTOR : this._norm);
        this.input.setLimits(this._norm, this._norm);
    }
}
