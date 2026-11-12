const Clutter = imports.gi.Clutter;
const St = imports.gi.St;
const Slider = imports.ui.slider;
const Constants = require('./constants');
const UiHelpers = require('./uiHelpers');

// One slider line: icon, label, slider, and an arrow when the line opens a submenu. A row
// without a submenu keeps an empty space of the arrow's size, so every slider has the same
// length. Inert for now: the slider takes no input.
class SliderRow {
    constructor(definition) {
        this.actor = new St.BoxLayout({ style_class: 'quick-settings-slider-row' });

        this.actor.add_child(UiHelpers.symbolicIcon(definition.icon, 'quick-settings-slider-icon'));
        this.actor.add_child(new St.Label({
            text: definition.label,
            style_class: 'quick-settings-slider-label',
            y_align: Clutter.ActorAlign.CENTER,
        }));

        this.slider = new Slider.Slider(Constants.SLIDER_PLACEHOLDER_VALUE);
        this.slider.actor.add_style_class_name('quick-settings-slider');
        this.slider.actor.x_expand = true;
        this.slider.actor.reactive = false;
        this.actor.add_child(this.slider.actor);

        if (definition.hasMenu) {
            const arrow = new St.Button({
                child: UiHelpers.symbolicIcon(Constants.SUBMENU_ICON, 'quick-settings-slider-icon'),
                style_class: 'quick-settings-slider-arrow',
            });
            UiHelpers.setButtonInactive(arrow, true);
            this.actor.add_child(arrow);
        } else {
            this.actor.add_child(new St.Bin({ style_class: 'quick-settings-slider-arrow' }));
        }

        UiHelpers.setDimmed(this.actor, true);
    }
}
