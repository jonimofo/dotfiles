const Clutter = imports.gi.Clutter;
const Pango = imports.gi.Pango;
const St = imports.gi.St;
const Tooltips = imports.ui.tooltips;
const Constants = require('./constants');
const UiHelpers = require('./uiHelpers');

// One player's block: the title in bold, then "artist · " and the player
// name in italic, and the previous, play or pause, next buttons: bare icons on that
// line. The texts come from the player: they are set as plain text (St.Label.text), never
// as markup; italic and bold come from style classes. When line 2 is too long the artist
// gives way first (it ellipsizes; the player name, at most Constants.MEDIA_PLAYER_NAME_MAX
// characters, does not), so the player name stays readable. The title and that line are
// one button, tinted on hover like the list entries and separate from the three icons:
// @onFocus() runs on its click (bring the player's window forward), @onButton(method) on a
// click of a working icon.
const TINTED_STYLE_CLASS = 'quick-settings-media-block-tinted';

class MediaBlock {
    constructor(onButton, onFocus) {
        this.actor = new St.BoxLayout({ vertical: true, style_class: 'quick-settings-media-block' });

        const row = new St.BoxLayout();
        const lines = new St.BoxLayout({ vertical: true, style_class: 'quick-settings-media-lines' });
        this._title = plainLabel('quick-settings-media-title');
        lines.add_child(this._title);
        const line2 = new St.BoxLayout();
        this._artist = plainLabel(null);
        line2.add_child(this._artist);
        this._player = plainLabel('quick-settings-media-player');
        this._player.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
        line2.add_child(this._player);
        lines.add_child(line2);
        this._text = new St.Button({
            child: lines,
            style_class: 'quick-settings-media-text',
            x_expand: true,
            x_fill: true,
            can_focus: true,
        });
        this._text.connect('clicked', () => onFocus());
        row.add_child(this._text);
        const buttonsBox = new St.BoxLayout({ style_class: 'quick-settings-media-buttons', y_align: Clutter.ActorAlign.END });
        this._buttons = {};
        for (const key of Constants.MEDIA_BUTTON_ORDER) {
            const icon = UiHelpers.symbolicIcon(null, 'quick-settings-media-icon');
            const button = new St.Button({ child: icon, style_class: 'quick-settings-media-button', y_align: Clutter.ActorAlign.CENTER });
            const entry = { button, icon, tooltip: new Tooltips.Tooltip(button, ''), method: null };
            button.connect('clicked', () => {
                if (entry.method)
                    onButton(entry.method);
            });
            this._buttons[key] = entry;
            buttonsBox.add_child(button);
        }
        row.add_child(buttonsBox);
        this.actor.add_child(row);
    }

    // @tinted: from MediaModel.isTinted() for the block's place on screen.
    setTinted(tinted) {
        if (tinted)
            this.actor.add_style_class_name(TINTED_STYLE_CLASS);
        else
            this.actor.remove_style_class_name(TINTED_STYLE_CLASS);
    }

    // @block: one of MediaModel.visibleBlocks().
    update(block) {
        this._title.text = block.text.title;
        this._artist.text = block.text.artist;
        this._artist.visible = block.text.artist !== '';
        this._player.text = block.text.player;
        this._text.accessible_name = `${Constants.MEDIA_FOCUS_LABEL} ${block.name}`;
        for (const key of Constants.MEDIA_BUTTON_ORDER) {
            const state = block.buttons[key];
            const entry = this._buttons[key];
            entry.icon.icon_name = state.icon;
            entry.button.accessible_name = state.label;
            entry.tooltip.set_text(state.label);
            entry.method = state.method;
            UiHelpers.setButtonWorking(entry.button, state.working);
        }
    }

    destroy() {
        for (const entry of Object.values(this._buttons))
            entry.tooltip.destroy();
        this.actor.destroy();
    }
}

function plainLabel(styleClass) {
    const label = new St.Label({ style_class: styleClass, y_align: Clutter.ActorAlign.CENTER });
    label.clutter_text.use_markup = false;
    label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
    return label;
}
