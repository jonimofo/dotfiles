const Clutter = imports.gi.Clutter;
const St = imports.gi.St;
const Slider = imports.ui.slider;
const Constants = require('./constants');
const UiHelpers = require('./uiHelpers');
const ReleaseCommit = require('./releaseCommit');

// One slider line: icon, label, slider, and an arrow when the line opens a submenu. A row
// without a submenu keeps an empty space of the arrow's size, so every slider has the same
// length. The row stays dimmed and inert until setAvailable(true); the arrow stays inert
// until the submenus exist.
class SliderRow {
    constructor(definition) {
        this._dragging = false;
        this._releaseCommit = null;
        this.actor = new St.BoxLayout({ style_class: 'quick-settings-slider-row' });

        this.actor.add_child(UiHelpers.symbolicIcon(definition.icon, 'quick-settings-slider-icon'));
        this.actor.add_child(new St.Label({
            text: definition.label,
            style_class: 'quick-settings-slider-label',
            y_align: Clutter.ActorAlign.CENTER,
        }));

        this.slider = new Slider.Slider(Constants.SLIDER_INITIAL_VALUE);
        this.slider.actor.add_style_class_name('quick-settings-slider');
        this.slider.actor.x_expand = true;
        this.slider.connect('drag-begin', () => {
            this._dragging = true;
        });
        this.slider.connect('drag-end', () => {
            this._dragging = false;
        });
        this.actor.add_child(this.slider.actor);

        this._arrow = null;
        if (definition.hasMenu) {
            this._arrow = new St.Button({
                child: UiHelpers.symbolicIcon(Constants.SUBMENU_ICON, 'quick-settings-slider-icon'),
                style_class: 'quick-settings-slider-arrow',
            });
            UiHelpers.setButtonInactive(this._arrow, true);
            UiHelpers.setDimmed(this._arrow, true);
            this.actor.add_child(this._arrow);
        } else {
            this.actor.add_child(new St.Bin({ style_class: 'quick-settings-slider-arrow' }));
        }

        this.setAvailable(false);
    }

    setAvailable(available) {
        this.slider.actor.reactive = available;
        UiHelpers.setDimmed(this.actor, !available);
    }

    // Shows a value read from the system. Ignored while the user drags the handle.
    showValue(value) {
        if (!this._dragging)
            this.slider.setValue(value);
    }

    // @onChange(value) on every move: for a setting that follows the handle live.
    onLiveChange(onChange) {
        this.slider.connect('value-changed', (slider, value) => onChange(value));
    }

    // @onCommit(value) once per user change: for a setting that is slow to apply.
    onRelease(scrollDelayMs, onCommit) {
        this._releaseCommit = new ReleaseCommit.ReleaseCommit(this.slider, scrollDelayMs, onCommit);
    }

    destroy() {
        if (this._releaseCommit)
            this._releaseCommit.destroy();
    }
}
