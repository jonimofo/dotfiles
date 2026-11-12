const Clutter = imports.gi.Clutter;
const St = imports.gi.St;
const UiHelpers = require('./uiHelpers');
const ExpandArrow = require('./expandArrow');

// The background of a tile, as inline CSS: the stylesheet only holds the fallback, the
// real colours come from the theme (see ThemeColors).
function backgroundStyle(color) {
    if (!color)
        return null;
    return `background-color: ${color};`;
}

// A pill-shaped toggle: icon and label on the left, an arrow on the right when the tile
// opens an in-place list. A tile does nothing until setOnToggle() gives it an action. An
// inactive or unavailable tile has its icon and background dimmed; the label stays readable.
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
        if (definition.hasMenu) {
            this._arrow = new ExpandArrow.ExpandArrow('quick-settings-tile-arrow', 'quick-settings-tile-icon');
            this.actor.add_child(this._arrow.actor);
        }

        this._hasToggle = false;
        this._available = true;
        this._dimmed = false;
        this._sync();
    }

    setOnToggle(onToggle) {
        this._hasToggle = true;
        this._toggle.connect('clicked', () => onToggle());
        this._sync();
    }

    setOnArrow(onArrow) {
        this._arrow.setOnClick(onArrow);
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
        if (this._arrow)
            this._arrow.setExpanded(expanded);
    }

    // A part without an action stays visibly inactive: the icon and background when the
    // toggle has none, the arrow when the list is not wired.
    _sync() {
        const toggleWorks = this._available && this._hasToggle;
        UiHelpers.setButtonInactive(this._toggle, !toggleWorks);
        UiHelpers.setDimmed(this._icon, !toggleWorks);
        UiHelpers.setPseudoClass(this.actor, UiHelpers.INSENSITIVE_PSEUDO_CLASS, !toggleWorks);
        this._dimmed = !toggleWorks;
        this._applyColors();
        if (this._arrow)
            this._arrow.sync(this._available);
    }

    setChecked(checked) {
        this._checked = checked;
        this._toggle.checked = checked;
        UiHelpers.setPseudoClass(this.actor, UiHelpers.CHECKED_PSEUDO_CLASS, checked);
        this._applyColors();
    }

    setIconName(iconName) {
        this._icon.icon_name = iconName;
    }

    // @colors: from ThemeColors.readTileColors(), or null to use the stylesheet's.
    setColors(colors) {
        this._colors = colors;
        this._applyColors();
    }

    destroy() {
        this.actor.destroy();
    }

    _applyColors() {
        if (!this._colors) {
            this.actor.set_style(null);
            return;
        }
        const pair = this._dimmed ? this._colors.dimmed : this._colors.normal;
        this.actor.set_style(backgroundStyle(this._checked ? pair.checked : pair.tile));
    }
}
