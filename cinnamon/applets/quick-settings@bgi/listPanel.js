const Clutter = imports.gi.Clutter;
const St = imports.gi.St;
const Constants = require('./constants');
const UiHelpers = require('./uiHelpers');

// The in-place list drawn under a tile row or a slider row: title, entries in a scrollable
// box of capped height, then a separator and the settings entry. One instance, moved to
// the row of the list that opens.
class ListPanel {
    constructor() {
        this.actor = new St.BoxLayout({ style_class: 'quick-settings-list', vertical: true, visible: false });
        this._title = new St.Label({ style_class: 'quick-settings-list-title' });
        this.actor.add_child(this._title);

        this._entries = new St.BoxLayout({ style_class: 'quick-settings-list-entries', vertical: true });
        this._scroll = new St.ScrollView({
            style_class: 'quick-settings-list-scroll',
            x_fill: true,
            y_fill: false,
            y_align: St.Align.START,
        });
        this._scroll.set_policy(St.PolicyType.NEVER, St.PolicyType.AUTOMATIC);
        this._scroll.set_auto_scrolling(true);
        this._scroll.add_actor(this._entries);
        this.actor.add_child(this._scroll);

        this._separator = new St.Widget({ style_class: 'quick-settings-list-separator' });
        this.actor.add_child(this._separator);
        this._settings = new St.BoxLayout({ vertical: true });
        this.actor.add_child(this._settings);
    }

    // Puts the panel right under @anchor (a child of a vertical box) and draws @spec.
    show(spec, anchor) {
        const parent = this.actor.get_parent();
        if (parent)
            parent.remove_child(this.actor);
        anchor.get_parent().insert_child_above(this.actor, anchor);
        this.update(spec);
        this.actor.show();
    }

    update(spec) {
        this._title.text = spec.title;
        this._entries.destroy_all_children();
        for (const item of spec.items)
            this._entries.add_child(this._entry(item));

        this._settings.destroy_all_children();
        this._separator.visible = spec.settings !== null;
        if (spec.settings)
            this._settings.add_child(this._entry({ label: spec.settings.label, onActivate: spec.settings.onActivate }));
    }

    hide() {
        this.actor.hide();
    }

    // One clickable line: a check mark when active, the item icon, the label, then a lock
    // for a secured network and a trailing icon (the Wi-Fi signal).
    _entry(item) {
        const box = new St.BoxLayout({ style_class: 'quick-settings-list-entry-content' });
        const mark = UiHelpers.symbolicIcon(Constants.LIST_ACTIVE_ICON, 'quick-settings-list-icon');
        mark.opacity = item.active ? Constants.FULL_OPACITY : 0;
        box.add_child(mark);
        if (item.iconName)
            box.add_child(UiHelpers.symbolicIcon(item.iconName, 'quick-settings-list-icon'));
        box.add_child(new St.Label({
            text: item.label,
            style_class: 'quick-settings-list-label',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        }));
        if (item.secure)
            box.add_child(UiHelpers.symbolicIcon(Constants.LIST_SECURE_ICON, 'quick-settings-list-icon'));
        if (item.trailingIconName)
            box.add_child(UiHelpers.symbolicIcon(item.trailingIconName, 'quick-settings-list-icon'));

        const button = new St.Button({
            child: box,
            style_class: 'quick-settings-list-entry',
            x_fill: true,
            can_focus: true,
        });
        if (item.active)
            button.add_style_pseudo_class('checked');
        button.connect('clicked', () => item.onActivate());
        return button;
    }
}
