const Clutter = imports.gi.Clutter;
const St = imports.gi.St;
const Constants = require('./constants');
const UiHelpers = require('./uiHelpers');

const CHECKED_PSEUDO_CLASS = 'checked';

// The background of a tile, as inline CSS: the stylesheet only holds the fallback, the
// real colours come from the theme (see ThemeColors).
function backgroundStyle(color) {
    if (!color)
        return null;
    return `background-color: ${color};`;
}

// A pill-shaped toggle: icon and label on the left, an arrow on the right when the tile
// opens an in-place list. A tile does nothing until setOnToggle() gives it an action.
class Tile {
    constructor(definition) {
        this._checked = false;
        this._colors = null;
        this.defaultLabel = definition.label;

        this.actor = new St.BoxLayout({ style_class: 'quick-settings-tile' });

        this._icon = UiHelpers.symbolicIcon(definition.icon, 'quick-settings-tile-icon');
        this._label = new St.Label({
            text: definition.label,
            style_class: 'quick-settings-tile-label',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        const content = new St.BoxLayout({ style_class: 'quick-settings-tile-content' });
        content.add_child(this._icon);
        content.add_child(this._label);

        this._toggle = new St.Button({
            child: content,
            style_class: definition.hasMenu
                ? 'quick-settings-tile-toggle'
                : 'quick-settings-tile-toggle quick-settings-tile-toggle-full',
            x_expand: true,
            x_fill: true,
        });
        this.actor.add_child(this._toggle);

        this._arrow = null;
        this._arrowIcon = null;
        if (definition.hasMenu) {
            this._arrowIcon = UiHelpers.symbolicIcon(Constants.SUBMENU_ICON, 'quick-settings-tile-icon');
            this._arrow = new St.Button({
                child: this._arrowIcon,
                style_class: 'quick-settings-tile-arrow',
            });
            this.actor.add_child(this._arrow);
        }

        this._hasToggle = false;
        this._hasArrowAction = false;
        this._available = true;
        this._sync();
    }

    setOnToggle(onToggle) {
        this._hasToggle = true;
        this._toggle.connect('clicked', () => onToggle());
        this._sync();
    }

    setOnArrow(onArrow) {
        this._hasArrowAction = true;
        this._arrow.connect('clicked', () => onArrow());
        this._sync();
    }

    // An unavailable tile (no adapter, daemon not running) is dimmed and takes no click.
    setAvailable(available) {
        this._available = available;
        this._sync();
    }

    setLabel(text) {
        this._label.text = text;
    }

    // The arrow points down while the tile's list is open.
    setExpanded(expanded) {
        if (this._arrowIcon)
            this._arrowIcon.icon_name = expanded ? Constants.LIST_EXPANDED_ICON : Constants.SUBMENU_ICON;
    }

    // A part without an action stays visibly inactive: the whole tile when the toggle has
    // none, only the arrow when the list is not wired.
    _sync() {
        const toggleWorks = this._available && this._hasToggle;
        UiHelpers.setButtonInactive(this._toggle, !toggleWorks);
        UiHelpers.setDimmed(this.actor, !toggleWorks);
        if (!this._arrow)
            return;
        const arrowWorks = this._available && this._hasArrowAction;
        UiHelpers.setButtonInactive(this._arrow, !arrowWorks);
        UiHelpers.setDimmed(this._arrow, toggleWorks && !arrowWorks);
    }

    setChecked(checked) {
        this._checked = checked;
        this._toggle.checked = checked;
        if (checked)
            this.actor.add_style_pseudo_class(CHECKED_PSEUDO_CLASS);
        else
            this.actor.remove_style_pseudo_class(CHECKED_PSEUDO_CLASS);
        this._applyColors();
    }

    setIconName(iconName) {
        this._icon.icon_name = iconName;
    }

    // @colors: { tile, checked } as CSS colours, or null to use the stylesheet's.
    setColors(colors) {
        this._colors = colors;
        this._applyColors();
    }

    _applyColors() {
        if (!this._colors) {
            this.actor.set_style(null);
            return;
        }
        this.actor.set_style(backgroundStyle(this._checked ? this._colors.checked : this._colors.tile));
    }
}
