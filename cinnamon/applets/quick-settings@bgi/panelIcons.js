const Clutter = imports.gi.Clutter;
const St = imports.gi.St;
const Constants = require('./constants');
const UiHelpers = require('./uiHelpers');
const BatteryModel = require('./batteryModel');
const LayoutModel = require('./layoutModel');

// The stock style of panel status icons (as IconApplet uses for symbolic icons) and of
// panel text (as TextIconApplet uses for its label).
const PANEL_ICON_STYLE_CLASS = 'system-status-icon';
const PANEL_LABEL_STYLE_CLASS = 'applet-label';

// The status items shown on the panel: Wi-Fi, Bluetooth, VPN, volume icons and the battery
// level, in the order and with the selection of applyLayout(). Bluetooth shows only while
// the adapter is on, VPN only while a VPN is up, the battery only when there is one: the
// settings can hide an item, never force one on. With nothing left, one fallback icon keeps
// the button on the panel.
class PanelIcons {
    constructor() {
        this.actor = new St.BoxLayout({ style_class: 'quick-settings-panel-icons' });
        this._icons = {
            wifi: UiHelpers.symbolicIcon(Constants.WIFI_ON_ICON, PANEL_ICON_STYLE_CLASS),
            bluetooth: UiHelpers.symbolicIcon(Constants.PANEL_ICONS.bluetooth, PANEL_ICON_STYLE_CLASS),
            vpn: UiHelpers.symbolicIcon(Constants.PANEL_ICONS.vpn, PANEL_ICON_STYLE_CLASS),
            volume: UiHelpers.symbolicIcon(Constants.PANEL_ICONS.volume, PANEL_ICON_STYLE_CLASS),
        };
        this._batteryLabel = new St.Label({ style_class: PANEL_LABEL_STYLE_CLASS, y_align: Clutter.ActorAlign.CENTER });
        this._items = { ...this._icons, battery: this._batteryLabel };
        // Whether the state wants each item shown.
        this._wanted = { wifi: true, bluetooth: false, vpn: false, volume: true, battery: false };
        this._allowed = Object.keys(this._items);
        this._fallback = UiHelpers.symbolicIcon(Constants.PANEL_FALLBACK_ICON, PANEL_ICON_STYLE_CLASS);
        this.applyLayout(Constants.PANEL_ICON_ITEMS.map(item => item.id));
    }

    // @ids: the items allowed on the panel, in order.
    applyLayout(ids) {
        this.actor.remove_all_children();
        this._allowed = ids;
        for (const id of ids)
            this.actor.add_child(this._items[id]);
        this.actor.add_child(this._fallback);
        this._sync();
    }

    setIconSize(size) {
        if (!size)
            return;
        for (const icon of [...Object.values(this._icons), this._fallback])
            icon.icon_size = size;
    }

    setWifiEnabled(enabled) {
        this._icons.wifi.icon_name = enabled ? Constants.WIFI_ON_ICON : Constants.WIFI_OFF_ICON;
    }

    // @iconName null hides the icon.
    setBluetoothIconName(iconName) {
        this._wanted.bluetooth = iconName !== null;
        if (iconName)
            this._icons.bluetooth.icon_name = iconName;
        this._sync();
    }

    setVpnVisible(visible) {
        this._wanted.vpn = visible;
        this._sync();
    }

    setVolumeIconName(iconName) {
        this._icons.volume.icon_name = iconName;
    }

    // @battery: from BatteryModel.pickBattery(), null hides the level.
    setBattery(battery) {
        this._wanted.battery = battery !== null;
        if (battery)
            this._batteryLabel.text = BatteryModel.label(battery.percent);
        this._sync();
    }

    _sync() {
        const { visible, fallback } = LayoutModel.panelIconVisibility(this._allowed, this._wanted);
        for (const [id, item] of Object.entries(this._items))
            item.visible = visible[id];
        this._fallback.visible = fallback;
    }
}
