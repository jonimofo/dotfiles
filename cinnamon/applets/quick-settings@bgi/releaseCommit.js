const GLib = imports.gi.GLib;

// Calls @onCommit(value) once per user change of @slider (an imports.ui.slider.Slider), not on
// every motion: at the end of a drag or click, after an arrow key, or @scrollDelayMs after
// the last wheel step (a scroll has no release).
class ReleaseCommit {
    constructor(slider, scrollDelayMs, onCommit) {
        this._slider = slider;
        this._scrollDelayMs = scrollDelayMs;
        this._onCommit = onCommit;
        this._timeoutId = 0;
        this.dragging = false;
        this._signalIds = [
            slider.connect('drag-begin', () => this._onDragBegin()),
            slider.connect('drag-end', () => this._commitNow()),
            slider.connect('value-changed', () => this._onValueChanged()),
        ];
    }

    destroy() {
        this._cancelTimeout();
        for (const id of this._signalIds)
            this._slider.disconnect(id);
        this._signalIds = [];
    }

    _onDragBegin() {
        this._cancelTimeout();
        this.dragging = true;
    }

    _onValueChanged() {
        if (this.dragging)
            return;
        this._cancelTimeout();
        this._timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, this._scrollDelayMs, () => {
            this._timeoutId = 0;
            this._onCommit(this._slider.value);
            return GLib.SOURCE_REMOVE;
        });
    }

    _commitNow() {
        this._cancelTimeout();
        this.dragging = false;
        this._onCommit(this._slider.value);
    }

    _cancelTimeout() {
        if (this._timeoutId) {
            GLib.source_remove(this._timeoutId);
            this._timeoutId = 0;
        }
    }
}
