const St = imports.gi.St;
const Applet = imports.ui.applet;
const PopupMenu = imports.ui.popupMenu;
const Main = imports.ui.main;
const Constants = require('./constants');
const PanelIcons = require('./panelIcons');
const MenuContent = require('./menuContent');
const WifiState = require('./wifiState');
const DarkStyleState = require('./darkStyleState');
const Brightness = require('./brightness');
const DdcBrightness = require('./ddcBrightness');
const ScreenBrightness = require('./screenBrightness');
const Subprocess = require('./subprocess');
const Volume = require('./volume');
const VolumeMapping = require('./volumeMapping');

class QuickSettingsApplet extends Applet.Applet {
    constructor(metadata, orientation, panelHeight, instanceId) {
        super(orientation, panelHeight, instanceId);
        this.set_applet_tooltip(Constants.TOOLTIP);

        this._panelIcons = new PanelIcons.PanelIcons();
        this.actor.add_child(this._panelIcons.actor);

        this.menuManager = new PopupMenu.PopupMenuManager(this);
        this.menu = new Applet.AppletPopupMenu(this, orientation);
        this.menuManager.addMenu(this.menu);
        this._content = new MenuContent.MenuContent();
        this.menu.addActor(this._content.actor);
        this.menu.connect('open-state-changed', (menu, open) => {
            if (open) {
                this._content.refresh();
                this._brightness.refresh();
            }
        });

        this._wifiTile = this._content.tiles.wifi;
        this._wifi = new WifiState.WifiState(() => this._syncWifi());
        this._wifiTile.setOnToggle(() => this._wifi.toggle());
        this._syncWifi();

        this._darkStyleTile = this._content.tiles['dark-style'];
        this._darkStyle = new DarkStyleState.DarkStyleState(() => this._syncDarkStyle());
        this._darkStyleTile.setOnToggle(() => this._darkStyle.toggle());
        this._syncDarkStyle();

        this._setUpBrightness();
        this._setUpVolume();
    }

    on_applet_added_to_panel() {
        this._panelIcons.setIconSize(this.getPanelIconSize(St.IconType.SYMBOLIC));
    }

    on_panel_icon_size_changed(size) {
        this._panelIcons.setIconSize(size);
    }

    on_applet_clicked() {
        this.menu.toggle();
    }

    on_applet_removed_from_panel() {
        Main.layoutManager.disconnect(this._monitorsChangedId);
        this._brightness.destroy();
        this._volume.destroy();
        this._content.destroy();
        this._wifi.destroy();
        this._darkStyle.destroy();
        this.menu.destroy();
    }

    _syncWifi() {
        const enabled = this._wifi.enabled;
        this._wifiTile.setChecked(enabled);
        this._wifiTile.setIconName(enabled ? Constants.WIFI_ON_ICON : Constants.WIFI_OFF_ICON);
        this._panelIcons.setWifiEnabled(enabled);
    }

    // One value for every DDC monitor, sent on release: a DDC write takes about half a second.
    _setUpBrightness() {
        const row = this._content.sliders.monitors;
        this._brightness = new Brightness.Brightness({
            ddc: new DdcBrightness.DdcBrightness(Subprocess.runCommand),
            screen: new ScreenBrightness.ScreenBrightness(),
            onValue: value => row.showValue(value),
            onAvailable: available => row.setAvailable(available),
        });
        row.onRelease(Constants.BRIGHTNESS_SCROLL_COMMIT_MS, value => this._brightness.set(value));
        this._monitorsChangedId = Main.layoutManager.connect('monitors-changed', () => this._brightness.detect());
        this._brightness.detect();
    }

    // Volumes follow the handle live, like the stock sound applet.
    _setUpVolume() {
        const output = this._content.sliders.output;
        const input = this._content.sliders.input;
        this._volume = new Volume.Volume(
            (available, value) => {
                output.setAvailable(available);
                output.showValue(value);
                this._panelIcons.setVolumeIconName(VolumeMapping.outputIconName(value));
            },
            (available, value) => {
                input.setAvailable(available);
                input.showValue(value);
            });
        output.onLiveChange(value => this._volume.output.set(value));
        input.onLiveChange(value => this._volume.input.set(value));
    }

    _syncDarkStyle() {
        this._darkStyleTile.setChecked(this._darkStyle.enabled);
    }
}

function main(metadata, orientation, panelHeight, instanceId) {
    return new QuickSettingsApplet(metadata, orientation, panelHeight, instanceId);
}
