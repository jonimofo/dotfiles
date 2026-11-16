const Clutter = imports.gi.Clutter;
const St = imports.gi.St;
const Slider = imports.ui.slider;
const Constants = require('./constants');
const UiHelpers = require('./uiHelpers');
const ReleaseCommit = require('./releaseCommit');
const ExpandArrow = require('./expandArrow');

// One slider line: icon, label, slider, and an arrow when the line opens a list. A row
// without a list keeps an empty space of the arrow's size, so every slider has the same
// length. Until setAvailable(true) the row is inert, its icon and slider dimmed; the label
// stays readable.
class SliderRow {
    constructor(definition) {
        this._releaseCommit = null;
        this._available = false;
        this.actor = new St.BoxLayout({ style_class: 'quick-settings-slider-row' });

        this._defaultIconName = definition.icon;
        this._icon = UiHelpers.symbolicIcon(definition.icon, 'quick-settings-slider-icon');
        this.actor.add_child(this._icon);
        this.actor.add_child(new St.Label({
            text: definition.label,
            style_class: 'quick-settings-slider-label',
            y_align: Clutter.ActorAlign.CENTER,
        }));

        this.slider = new Slider.Slider(Constants.SLIDER_INITIAL_VALUE);
        this.slider.actor.add_style_class_name('quick-settings-slider');
        this.slider.actor.x_expand = true;
        this._drag = new ReleaseCommit.DragTracker(this.slider);
        this.actor.add_child(this.slider.actor);

        this._arrow = null;
        if (definition.hasMenu) {
            this._arrow = new ExpandArrow.ExpandArrow('quick-settings-slider-arrow', 'quick-settings-slider-icon');
            this.actor.add_child(this._arrow.actor);
        } else {
            this.actor.add_child(new St.Bin({ style_class: 'quick-settings-slider-arrow' }));
        }

        this.setAvailable(false);
    }

    setAvailable(available) {
        this._available = available;
        this.slider.actor.reactive = available;
        UiHelpers.setDimmed(this._icon, !available);
        UiHelpers.setDimmed(this.slider.actor, !available);
        if (this._arrow)
            this._arrow.sync(available);
    }

    // @iconName null puts back the row's own icon.
    setIconName(iconName) {
        this._icon.icon_name = iconName || this._defaultIconName;
    }

    setOnArrow(onArrow) {
        this._arrow.setOnClick(onArrow);
        this._arrow.sync(this._available);
    }

    // The arrow points down while the row's list is open.
    setExpanded(expanded) {
        if (this._arrow)
            this._arrow.setExpanded(expanded);
    }

    // Shows a value read from the system. Ignored while the user drags the handle or while
    // a scrolled value waits to be sent.
    showValue(value) {
        if (this._drag.dragging || (this._releaseCommit && this._releaseCommit.pending))
            return;
        this.slider.setValue(value);
    }

    // @onChange(value) on every move: for a setting that follows the handle live.
    onLiveChange(onChange) {
        this.slider.connect('value-changed', (slider, value) => onChange(value));
    }

    // @onCommit(value) once per user change: for a setting that is slow to apply.
    onRelease(scrollDelayMs, onCommit) {
        this._releaseCommit = new ReleaseCommit.ReleaseCommit(this.slider, this._drag, scrollDelayMs, onCommit);
    }

    destroy() {
        if (this._releaseCommit)
            this._releaseCommit.destroy();
        this.actor.destroy();
    }
}
