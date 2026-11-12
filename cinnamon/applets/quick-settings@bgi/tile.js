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
// opens a submenu. A tile does nothing until setOnToggle() gives it an action.
class Tile {
    constructor(definition) {
        this._checked = false;
        this._colors = null;

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
        if (definition.hasMenu) {
            this._arrow = new St.Button({
                child: UiHelpers.symbolicIcon(Constants.SUBMENU_ICON, 'quick-settings-tile-icon'),
                style_class: 'quick-settings-tile-arrow',
            });
            this.actor.add_child(this._arrow);
        }

        UiHelpers.setButtonInactive(this._toggle, true);
        if (this._arrow)
            UiHelpers.setButtonInactive(this._arrow, true);
        UiHelpers.setDimmed(this.actor, true);
    }

    setOnToggle(onToggle) {
        UiHelpers.setButtonInactive(this._toggle, false);
        this._toggle.connect('clicked', () => onToggle());
        UiHelpers.setDimmed(this.actor, false);
        // The submenu comes in a later step: its arrow stays visibly inactive.
        if (this._arrow)
            UiHelpers.setDimmed(this._arrow, true);
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
