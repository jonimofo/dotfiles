const St = imports.gi.St;
const Applet = imports.ui.applet;
const PopupMenu = imports.ui.popupMenu;
const Main = imports.ui.main;
const Util = imports.misc.util;
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
const Bluetooth = require('./bluetooth');
const BluetoothModel = require('./bluetoothModel');
const VpnState = require('./vpnState');
const Nordvpn = require('./nordvpn');
const ListSpecs = require('./listSpecs');

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
                this._nordvpn.refresh();
            } else {
                this._content.lists.close();
            }
        });

        this._setUpWifi();

        this._darkStyleTile = this._content.tiles['dark-style'];
        this._darkStyle = new DarkStyleState.DarkStyleState(() => this._syncDarkStyle());
        this._darkStyleTile.setOnToggle(() => this._darkStyle.toggle());
        this._syncDarkStyle();

        this._setUpBrightness();
        this._setUpVolume();
        this._setUpBluetooth();
        this._setUpVpn();
        this._setUpNordvpn();
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
        this._bluetooth.destroy();
        this._vpn.destroy();
        this._nordvpn.destroy();
        this._content.destroy();
        this._wifi.destroy();
        this._darkStyle.destroy();
        this.menu.destroy();
    }

    // @owner: the tile or slider row whose arrow opens the list; @anchor: the row the list
    // goes under.
    _registerList(key, owner, anchor, build, onOpen = null) {
        this._content.lists.register(key, {
            anchor,
            build,
            onOpen,
            onExpanded: expanded => owner.setExpanded(expanded),
        });
        owner.setOnArrow(() => this._content.lists.toggle(key));
    }

    _tileAnchor(tileId) {
        return this._content.tiles[tileId].actor.get_parent();
    }

    _setUpWifi() {
        const tile = this._content.tiles.wifi;
        this._wifi = new WifiState.WifiState(() => this._syncWifi());
        tile.setOnToggle(() => this._wifi.toggle());
        this._registerList('wifi', tile, this._tileAnchor('wifi'),
            () => ListSpecs.wifiSpec(this._wifi.networks, {
                connect: network => this._wifi.connect(network),
                openSettings: () => this._openSettings(Constants.SETTINGS_COMMANDS.network),
            }),
            () => this._wifi.requestScan());
        this._syncWifi();
    }

    // The tile shows the network in use, or "Wi-Fi" when off or not connected.
    _syncWifi() {
        const tile = this._content.tiles.wifi;
        const enabled = this._wifi.enabled;
        const ssid = enabled ? this._wifi.activeSsid : null;
        tile.setChecked(enabled);
        tile.setIconName(enabled ? Constants.WIFI_ON_ICON : Constants.WIFI_OFF_ICON);
        tile.setLabel(ssid || tile.defaultLabel);
        this._panelIcons.setWifiEnabled(enabled);
        this._content.lists.refresh('wifi');
    }

    _setUpBluetooth() {
        const tile = this._content.tiles.bluetooth;
        this._bluetooth = new Bluetooth.Bluetooth(() => this._syncBluetooth());
        tile.setOnToggle(() => this._bluetooth.toggle());
        this._registerList('bluetooth', tile, this._tileAnchor('bluetooth'),
            () => ListSpecs.bluetoothSpec(this._bluetooth.summary, {
                toggleDevice: device => this._bluetooth.toggleDevice(device),
                openSettings: () => this._openSettings(Constants.SETTINGS_COMMANDS.bluetooth),
            }));
        this._syncBluetooth();
    }

    _syncBluetooth() {
        const tile = this._content.tiles.bluetooth;
        const summary = this._bluetooth.summary;
        tile.setAvailable(summary.available);
        tile.setChecked(summary.powered);
        tile.setIconName(summary.powered ? Constants.BLUETOOTH_ON_ICON : Constants.BLUETOOTH_OFF_ICON);
        tile.setLabel(BluetoothModel.tileLabel(summary, tile.defaultLabel));
        this._panelIcons.setBluetoothIconName(BluetoothModel.panelIconName(summary));
        this._content.lists.refresh('bluetooth');
    }

    _setUpVpn() {
        const tile = this._content.tiles.vpn;
        this._vpn = new VpnState.VpnState(() => this._syncVpn());
        tile.setOnToggle(() => this._vpn.toggle());
        this._registerList('vpn', tile, this._tileAnchor('vpn'),
            () => ListSpecs.vpnSpec(this._vpn.summary, {
                toggleProfile: profile => this._vpn.toggleProfile(profile),
                openSettings: () => this._openSettings(Constants.SETTINGS_COMMANDS.network),
            }));
        this._syncVpn();
    }

    _syncVpn() {
        const tile = this._content.tiles.vpn;
        const summary = this._vpn.summary;
        tile.setAvailable(summary.available);
        tile.setChecked(summary.active !== null);
        tile.setLabel(summary.label);
        this._syncVpnPanelIcon();
        this._content.lists.refresh('vpn');
    }

    // Read at start, when the menu opens and after each action: never polled.
    _setUpNordvpn() {
        const tile = this._content.tiles.nordvpn;
        this._nordvpn = new Nordvpn.Nordvpn(Subprocess.runCommand, () => this._syncNordvpn());
        tile.setOnToggle(() => this._nordvpn.toggle());
        this._registerList('nordvpn', tile, this._tileAnchor('nordvpn'),
            () => ListSpecs.nordvpnSpec(this._nordvpn.status, this._nordvpn.countries, {
                connectTo: country => this._nordvpn.connectTo(country),
            }),
            () => this._nordvpn.loadCountries());
        tile.setAvailable(false);
        this._nordvpn.refresh();
    }

    _syncNordvpn() {
        const tile = this._content.tiles.nordvpn;
        tile.setAvailable(this._nordvpn.available);
        tile.setChecked(this._nordvpn.status.connected);
        tile.setLabel(this._nordvpn.connectedCountry || tile.defaultLabel);
        this._syncVpnPanelIcon();
        this._content.lists.refresh('nordvpn');
    }

    _syncVpnPanelIcon() {
        const vpnUp = Boolean(this._vpn && this._vpn.summary.active);
        const nordvpnUp = Boolean(this._nordvpn && this._nordvpn.status.connected);
        this._panelIcons.setVpnVisible(vpnUp || nordvpnUp);
    }

    _openSettings(argv) {
        this.menu.close();
        Util.spawn(argv);
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
                output.setIconName(available ? VolumeMapping.outputIconName(value) : null);
                this._panelIcons.setVolumeIconName(VolumeMapping.outputIconName(value));
            },
            (available, value) => {
                input.setAvailable(available);
                input.showValue(value);
                input.setIconName(available ? VolumeMapping.inputIconName(value) : null);
            },
            kind => this._content.lists.refresh(kind));
        output.onLiveChange(value => this._volume.output.set(value));
        input.onLiveChange(value => this._volume.input.set(value));
        for (const [kind, row] of [['output', output], ['input', input]]) {
            this._registerList(kind, row, row.actor,
                () => ListSpecs.deviceSpec(kind, this._volume.devices(kind), {
                    selectDevice: id => this._volume.selectDevice(kind, id),
                    openSettings: () => this._openSettings(Constants.SETTINGS_COMMANDS.sound),
                }));
        }
    }

    _syncDarkStyle() {
        this._darkStyleTile.setChecked(this._darkStyle.enabled);
    }
}

function main(metadata, orientation, panelHeight, instanceId) {
    return new QuickSettingsApplet(metadata, orientation, panelHeight, instanceId);
}
