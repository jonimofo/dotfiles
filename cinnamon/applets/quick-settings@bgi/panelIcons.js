const St = imports.gi.St;
const Constants = require('./constants');
const UiHelpers = require('./uiHelpers');

// The status icons shown on the panel, in the mockup's order: Wi-Fi, Bluetooth, VPN,
// volume. Bluetooth shows only while the adapter is on, VPN only while a VPN is up.
class PanelIcons {
    constructor() {
        this.actor = new St.BoxLayout({ style_class: 'quick-settings-panel-icons' });
        this._wifi = this._addIcon(Constants.WIFI_ON_ICON);
        this._bluetooth = this._addIcon(Constants.PANEL_ICONS.bluetooth);
        this._vpn = this._addIcon(Constants.PANEL_ICONS.vpn);
        this._bluetooth.visible = false;
        this._vpn.visible = false;
        this._icons = [this._wifi, this._bluetooth, this._vpn];
        this._volume = this._addIcon(Constants.PANEL_ICONS.volume);
        this._icons.push(this._volume);
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

    // @iconName null hides the icon.
    setBluetoothIconName(iconName) {
        this._bluetooth.visible = iconName !== null;
        if (iconName)
            this._bluetooth.icon_name = iconName;
    }

    setVpnVisible(visible) {
        this._vpn.visible = visible;
    }

    setVolumeIconName(iconName) {
        this._volume.icon_name = iconName;
    }

    _addIcon(iconName) {
        const icon = UiHelpers.symbolicIcon(iconName, 'system-status-icon');
        this.actor.add_child(icon);
        return icon;
    }
}
