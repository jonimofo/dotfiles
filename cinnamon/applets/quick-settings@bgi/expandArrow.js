const St = imports.gi.St;
const Constants = require('./constants');
const UiHelpers = require('./uiHelpers');

// The '>' of a tile or a slider row: opens its in-place list, points down while the list is
// open. Inert and dimmed until setOnClick() gives it an action and its owner is available.
class ExpandArrow {
    constructor(styleClass, iconStyleClass) {
        this._icon = UiHelpers.symbolicIcon(Constants.SUBMENU_ICON, iconStyleClass);
        this.actor = new St.Button({ child: this._icon, style_class: styleClass });
        this._hasAction = false;
        this.sync(false);
    }

    setOnClick(onClick) {
        this._hasAction = true;
        this.actor.connect('clicked', () => onClick());
    }

    setExpanded(expanded) {
        this._icon.icon_name = expanded ? Constants.LIST_EXPANDED_ICON : Constants.SUBMENU_ICON;
    }

    // @ownerAvailable: whether the tile or row it belongs to works now.
    sync(ownerAvailable) {
        const works = ownerAvailable && this._hasAction;
        UiHelpers.setButtonInactive(this.actor, !works);
        UiHelpers.setDimmed(this.actor, !works);
    }
}
