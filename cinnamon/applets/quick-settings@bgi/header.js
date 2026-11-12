const Clutter = imports.gi.Clutter;
const Gio = imports.gi.Gio;
const St = imports.gi.St;
const Tooltips = imports.ui.tooltips;
const Constants = require('./constants');
const UiHelpers = require('./uiHelpers');
const BatteryModel = require('./batteryModel');

// Top line of the menu: battery level on the left, round action buttons on the right.
class Header {
    constructor() {
        this.actor = new St.BoxLayout({ style_class: 'quick-settings-header' });

        this._battery = new St.BoxLayout({
            style_class: 'quick-settings-battery',
            y_align: Clutter.ActorAlign.CENTER,
            visible: false,
        });
        this._batteryIcon = new St.Icon({ icon_type: St.IconType.SYMBOLIC, style_class: 'quick-settings-battery-icon' });
        this._batteryLabel = new St.Label({
            style_class: 'quick-settings-battery-label',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._battery.add_child(this._batteryIcon);
        this._battery.add_child(this._batteryLabel);
        this.actor.add_child(this._battery);
        // Keeps the buttons on the right while the battery is hidden.
        this.actor.add_child(new St.Widget({ x_expand: true }));

        this._buttons = {};
        this._tooltips = [];
        const buttons = new St.BoxLayout({ style_class: 'quick-settings-header-buttons' });
        for (const definition of Constants.HEADER_BUTTONS) {
            const button = new St.Button({
                child: UiHelpers.symbolicIcon(definition.icon, 'quick-settings-header-icon'),
                style_class: 'quick-settings-header-button',
                accessible_name: definition.label,
            });
            this._tooltips.push(new Tooltips.Tooltip(button, definition.label));
            UiHelpers.setButtonInactive(button, true);
            UiHelpers.setDimmed(button, true);
            buttons.add_child(button);
            this._buttons[definition.id] = button;
        }
        this.actor.add_child(buttons);
    }

    // @id: a HEADER_BUTTONS id.
    setOnButton(id, onClick) {
        const button = this._buttons[id];
        UiHelpers.setButtonInactive(button, false);
        UiHelpers.setDimmed(button, false);
        button.connect('clicked', () => onClick());
    }

    // @battery: from BatteryModel.pickBattery(), null hides the figure.
    setBattery(battery) {
        this._battery.visible = battery !== null;
        if (!battery)
            return;
        this._batteryIcon.gicon = Gio.icon_new_for_string(battery.iconString);
        this._batteryLabel.text = BatteryModel.label(battery.percent);
    }

    destroy() {
        for (const tooltip of this._tooltips)
            tooltip.destroy();
    }
}
