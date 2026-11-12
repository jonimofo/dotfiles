const St = imports.gi.St;
const Applet = imports.ui.applet;
const PopupMenu = imports.ui.popupMenu;
const Constants = require('./constants');
const PanelIcons = require('./panelIcons');
const MenuContent = require('./menuContent');
const WifiState = require('./wifiState');
const DarkStyleState = require('./darkStyleState');

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
            if (open)
                this._content.refresh();
        });

        this._wifiTile = this._content.tiles.wifi;
        this._wifi = new WifiState.WifiState(() => this._syncWifi());
        this._wifiTile.setOnToggle(() => this._wifi.toggle());
        this._syncWifi();

        this._darkStyleTile = this._content.tiles['dark-style'];
        this._darkStyle = new DarkStyleState.DarkStyleState(() => this._syncDarkStyle());
        this._darkStyleTile.setOnToggle(() => this._darkStyle.toggle());
        this._syncDarkStyle();
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

    _syncDarkStyle() {
        this._darkStyleTile.setChecked(this._darkStyle.enabled);
    }
}

function main(metadata, orientation, panelHeight, instanceId) {
    return new QuickSettingsApplet(metadata, orientation, panelHeight, instanceId);
}
