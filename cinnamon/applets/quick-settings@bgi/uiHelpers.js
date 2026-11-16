const St = imports.gi.St;
const Constants = require('./constants');

const INSENSITIVE_PSEUDO_CLASS = 'insensitive';
const CHECKED_PSEUDO_CLASS = 'checked';

function symbolicIcon(iconName, styleClass) {
    return new St.Icon({
        icon_name: iconName,
        icon_type: St.IconType.SYMBOLIC,
        style_class: styleClass,
    });
}

function setPseudoClass(actor, pseudoClass, on) {
    if (on)
        actor.add_style_pseudo_class(pseudoClass);
    else
        actor.remove_style_pseudo_class(pseudoClass);
}

// A button that does nothing yet: no click, no focus, styled :insensitive.
function setButtonInactive(button, inactive) {
    button.reactive = !inactive;
    button.can_focus = !inactive;
    setPseudoClass(button, INSENSITIVE_PSEUDO_CLASS, inactive);
}

// Dims a part that does nothing yet, so it reads as inactive next to the working ones.
// Used on icons, sliders and arrows, never on a label: text stays readable.
function setDimmed(actor, dimmed) {
    actor.opacity = dimmed ? Constants.INACTIVE_OPACITY : Constants.FULL_OPACITY;
}
