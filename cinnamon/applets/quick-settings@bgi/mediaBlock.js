const Clutter = imports.gi.Clutter;
const Pango = imports.gi.Pango;
const St = imports.gi.St;
const Tooltips = imports.ui.tooltips;
const Constants = require('./constants');
const UiHelpers = require('./uiHelpers');

// One player's block: a separator line, the title in bold, then "artist · " and the player
// name in italic, and the previous, play or pause, next buttons: bare icons on that
// line. The texts come from the player: they are set as plain text (St.Label.text), never
// as markup; italic and bold come from style classes. When line 2 is too long the artist
// gives way first (it ellipsizes; the player name, at most Constants.MEDIA_PLAYER_NAME_MAX
// characters, does not), so the player name stays readable. @onButton(method) runs on a click of a working button.
class MediaBlock {
    constructor(onButton) {
        this.actor = new St.BoxLayout({ vertical: true, style_class: 'quick-settings-media-block' });
        this.actor.add_child(new St.Widget({ style_class: 'quick-settings-list-separator' }));
        this._title = plainLabel('quick-settings-media-title');
        this.actor.add_child(this._title);

        const row = new St.BoxLayout();
        this._artist = plainLabel(null);
        row.add_child(this._artist);
        this._player = plainLabel('quick-settings-media-player');
        this._player.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
        row.add_child(this._player);
        // Keeps the buttons on the right.
        row.add_child(new St.Widget({ x_expand: true }));
        const buttonsBox = new St.BoxLayout({ style_class: 'quick-settings-media-buttons' });
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

    // @block: one of MediaModel.visibleBlocks().
    update(block) {
        this._title.text = block.text.title;
        this._artist.text = block.text.artist;
        this._artist.visible = block.text.artist !== '';
        this._player.text = block.text.player;
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
