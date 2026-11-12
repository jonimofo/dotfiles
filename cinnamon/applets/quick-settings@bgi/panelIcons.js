const St = imports.gi.St;
const Constants = require('./constants');
const UiHelpers = require('./uiHelpers');

// The status icons shown on the panel, in the mockup's order: Wi-Fi, Bluetooth, VPN,
// volume. Only Wi-Fi follows a real state for now.
class PanelIcons {
    constructor() {
        this.actor = new St.BoxLayout({ style_class: 'quick-settings-panel-icons' });
        this._wifi = this._addIcon(Constants.WIFI_ON_ICON);
        this._icons = [
            this._wifi,
            this._addIcon(Constants.PANEL_ICONS.bluetooth),
            this._addIcon(Constants.PANEL_ICONS.vpn),
            this._addIcon(Constants.PANEL_ICONS.volume),
        ];
    }

    setIconSize(size) {
        if (!size)
            return;
        for (const icon of this._icons)
            icon.icon_size = size;
    }

    setWifiEnabled(enabled) {
        this._wifi.icon_name = enabled ? Constants.WIFI_ON_ICON : Constants.WIFI_OFF_ICON;
    }

    _addIcon(iconName) {
        const icon = UiHelpers.symbolicIcon(iconName, 'system-status-icon');
        this.actor.add_child(icon);
        return icon;
    }
}
