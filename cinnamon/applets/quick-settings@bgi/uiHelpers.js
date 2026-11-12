const St = imports.gi.St;
const Constants = require('./constants');

const INSENSITIVE_PSEUDO_CLASS = 'insensitive';

function symbolicIcon(iconName, styleClass) {
    return new St.Icon({
        icon_name: iconName,
        icon_type: St.IconType.SYMBOLIC,
        style_class: styleClass,
    });
}

// A button that does nothing yet: no click, no focus, styled :insensitive.
function setButtonInactive(button, inactive) {
    button.reactive = !inactive;
    button.can_focus = !inactive;
    if (inactive)
        button.add_style_pseudo_class(INSENSITIVE_PSEUDO_CLASS);
    else
        button.remove_style_pseudo_class(INSENSITIVE_PSEUDO_CLASS);
}

// Dims a part that does nothing yet, so it reads as inactive next to the working ones.
function setDimmed(actor, dimmed) {
    actor.opacity = dimmed ? Constants.INACTIVE_OPACITY : Constants.FULL_OPACITY;
}
