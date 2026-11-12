const Clutter = imports.gi.Clutter;
const St = imports.gi.St;
const Constants = require('./constants');
const UiHelpers = require('./uiHelpers');
const Battery = require('./battery');

// Top line of the menu: battery level on the left, round action buttons on the right.
// The buttons do nothing yet.
class Header {
    constructor() {
        this.actor = new St.BoxLayout({ style_class: 'quick-settings-header' });

        this._battery = new St.BoxLayout({
            style_class: 'quick-settings-battery',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._batteryIcon = UiHelpers.symbolicIcon(Battery.iconName(0), 'quick-settings-battery-icon');
        this._batteryLabel = new St.Label({
            style_class: 'quick-settings-battery-label',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._battery.add_child(this._batteryIcon);
        this._battery.add_child(this._batteryLabel);
        this.actor.add_child(this._battery);

        const buttons = new St.BoxLayout({ style_class: 'quick-settings-header-buttons' });
        for (const definition of Constants.HEADER_BUTTONS) {
            const button = new St.Button({
                child: UiHelpers.symbolicIcon(definition.icon, 'quick-settings-header-icon'),
                style_class: 'quick-settings-header-button',
            });
            UiHelpers.setButtonInactive(button, true);
            UiHelpers.setDimmed(button, true);
            buttons.add_child(button);
        }
        this.actor.add_child(buttons);
    }

    // Reads the level again: called each time the menu opens.
    refreshBattery() {
        const percent = Battery.readPercent();
        this._battery.visible = percent !== null;
        if (percent === null)
            return;
        this._batteryIcon.icon_name = Battery.iconName(percent);
        this._batteryLabel.text = Battery.label(percent);
    }
}
