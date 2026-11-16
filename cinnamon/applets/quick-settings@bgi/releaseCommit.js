const GLib = imports.gi.GLib;

// Whether the user is dragging @slider's handle (an imports.ui.slider.Slider). One per
// slider, shared by the row and its ReleaseCommit.
class DragTracker {
    constructor(slider) {
        this.dragging = false;
        slider.connect('drag-begin', () => {
            this.dragging = true;
        });
        slider.connect('drag-end', () => {
            this.dragging = false;
        });
    }
}

// Calls @onCommit(value) once per user change of @slider, not on every motion: at the end
// of a drag or click, after an arrow key, or @scrollDelayMs after the last wheel step (a
// scroll has no release). @drag: the slider's DragTracker, connected before this.
class ReleaseCommit {
    constructor(slider, drag, scrollDelayMs, onCommit) {
        this._slider = slider;
        this._drag = drag;
        this._scrollDelayMs = scrollDelayMs;
        this._onCommit = onCommit;
        this._timeoutId = 0;
        this._signalIds = [
            slider.connect('drag-begin', () => this._cancelTimeout()),
            slider.connect('drag-end', () => this._commitNow()),
            slider.connect('value-changed', () => this._onValueChanged()),
        ];
    }

    // True while a scrolled value waits to be sent: a value read meanwhile must not
    // replace it on the slider.
    get pending() {
        return this._timeoutId !== 0;
    }

    destroy() {
        this._cancelTimeout();
        for (const id of this._signalIds)
            this._slider.disconnect(id);
        this._signalIds = [];
    }

    _onValueChanged() {
        if (this._drag.dragging)
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
        this._onCommit(this._slider.value);
    }

    _cancelTimeout() {
        if (this._timeoutId) {
            GLib.source_remove(this._timeoutId);
            this._timeoutId = 0;
        }
    }
}
