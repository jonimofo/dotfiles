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

// A background colour as inline CSS, or null (the stylesheet's) without a colour: the
// stylesheet only holds the fallback, the real colours come from the theme (see ThemeColors).
function backgroundStyle(color) {
    if (!color)
        return null;
    return `background-color: ${color};`;
}

function setStyleClass(actor, styleClass, on) {
    if (on)
        actor.add_style_class_name(styleClass);
    else
        actor.remove_style_class_name(styleClass);
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

// A button that works (@working) or does nothing yet: inactive and dimmed together.
function setButtonWorking(button, working) {
    setButtonInactive(button, !working);
    setDimmed(button, !working);
}

// Dims a part that does nothing yet, so it reads as inactive next to the working ones.
// Used on icons, sliders and arrows, never on a label: text stays readable.
function setDimmed(actor, dimmed) {
    actor.opacity = dimmed ? Constants.INACTIVE_OPACITY : Constants.FULL_OPACITY;
}
