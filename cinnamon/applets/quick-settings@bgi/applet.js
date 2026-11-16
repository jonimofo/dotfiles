const Gio = imports.gi.Gio;
const St = imports.gi.St;
const Applet = imports.ui.applet;
const PopupMenu = imports.ui.popupMenu;
const Main = imports.ui.main;
const Util = imports.misc.util;
const GnomeSession = imports.misc.gnomeSession;
const ScreenSaver = imports.misc.screenSaver;
const Constants = require('./constants');
const PanelIcons = require('./panelIcons');
const MenuContent = require('./menuContent');
const WifiState = require('./wifiState');
const NmClient = require('./nmClient');
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
const Battery = require('./battery');
const BooleanSetting = require('./booleanSetting');
const KeepAwake = require('./keepAwake');
const PowerProfiles = require('./powerProfiles');
const PowerProfileModel = require('./powerProfileModel');
const Settings = imports.ui.settings;
const LayoutModel = require('./layoutModel');

class QuickSettingsApplet extends Applet.Applet {
    constructor(metadata, orientation, panelHeight, instanceId) {
        super(orientation, panelHeight, instanceId);
        this._uuid = metadata.uuid;
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
                // A hidden row or tile costs nothing: no ddcutil read, no nordvpn call.
                if (this._isShown(Constants.LAYOUT_KEYS.sliders, 'monitors'))
                    this._brightness.refresh();
                if (this._isShown(Constants.LAYOUT_KEYS.tiles, 'nordvpn'))
                    this._nordvpn.refresh();
            } else {
                this._content.lists.close();
            }
        });

        // Wi-Fi and VPN share one NetworkManager client.
        this._nmClient = new NmClient.SharedNmClient();
        this._requestNmClient = (cancellable, onReady) => this._nmClient.request(cancellable, onReady);
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
        this._setUpPowerProfile();
        this._setUpSettingTiles();
        this._setUpKeepAwake();
        this._setUpMicMute();
        this._setUpHeader();
        this._setUpLayoutSettings(metadata.uuid, instanceId);
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
        this.settings.finalize();
        Main.layoutManager.disconnect(this._monitorsChangedId);
        this._brightness.destroy();
        this._volume.destroy();
        this._bluetooth.destroy();
        this._vpn.destroy();
        this._nordvpn.destroy();
        this._powerProfiles.destroy();
        this._nightLight.destroy();
        this._doNotDisturb.destroy();
        this._keepAwake.destroy();
        this._battery.destroy();
        this._wifi.destroy();
        this._nmClient.destroy();
        this._darkStyle.destroy();
        this._content.destroy();
        this.menu.destroy();
    }

    // @owner: the tile or slider row whose arrow opens the list; @anchor(): the row the list
    // goes under, asked at each opening (the rows change with the layout).
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
        this._wifi = new WifiState.WifiState(() => this._syncWifi(), this._requestNmClient);
        tile.setOnToggle(() => this._wifi.toggle());
        this._registerList('wifi', tile, () => this._tileAnchor('wifi'),
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
        // With the hardware switch off, a click could not turn Wi-Fi on: the tile says so.
        tile.setAvailable(!this._wifi.hardwareBlocked);
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
        this._registerList('bluetooth', tile, () => this._tileAnchor('bluetooth'),
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
        this._vpn = new VpnState.VpnState(() => this._syncVpn(), this._requestNmClient);
        tile.setOnToggle(() => this._vpn.toggle());
        this._registerList('vpn', tile, () => this._tileAnchor('vpn'),
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
        this._registerList('nordvpn', tile, () => this._tileAnchor('nordvpn'),
            () => ListSpecs.nordvpnSpec(this._nordvpn.status, this._nordvpn.countries, {
                connectTo: country => this._nordvpn.connectTo(country),
            }),
            () => this._nordvpn.loadCountries());
        // The first status read comes from _applyLayout(), only when the tile shows.
        tile.setAvailable(false);
    }

    // While a connect or disconnect runs (about 10 s), the tile takes the unavailable look,
    // label unchanged, and takes no click.
    _syncNordvpn() {
        const tile = this._content.tiles.nordvpn;
        tile.setAvailable(this._nordvpn.available && !this._nordvpn.busy);
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

    _setUpPowerProfile() {
        const tile = this._content.tiles['power-profile'];
        this._powerProfiles = new PowerProfiles.PowerProfiles(() => this._syncPowerProfile());
        tile.setOnToggle(() => this._powerProfiles.toggle());
        this._registerList('power-profile', tile, () => this._tileAnchor('power-profile'),
            () => ListSpecs.powerProfileSpec(this._powerProfiles.profiles, this._powerProfiles.active, {
                select: profile => this._powerProfiles.select(profile),
                openSettings: () => this._openSettings(Constants.POWER_SETTINGS_COMMAND),
            }));
        tile.setAvailable(false);
    }

    // The label is the active profile's name alone; highlighted when not balanced.
    _syncPowerProfile() {
        const tile = this._content.tiles['power-profile'];
        const active = this._powerProfiles.active;
        tile.setAvailable(this._powerProfiles.available);
        tile.setChecked(PowerProfileModel.isHighlighted(active));
        if (active) {
            tile.setLabel(PowerProfileModel.label(active));
            tile.setIconName(PowerProfileModel.iconName(active));
        }
        this._content.lists.refresh('power-profile');
    }

    _setUpSettingTiles() {
        this._nightLight = this._wireSettingTile('night-light',
            Constants.NIGHT_LIGHT_SCHEMA, Constants.NIGHT_LIGHT_KEY, false);
        this._doNotDisturb = this._wireSettingTile('do-not-disturb',
            Constants.NOTIFICATIONS_SCHEMA, Constants.NOTIFICATIONS_KEY, true);
    }

    _wireSettingTile(tileId, schema, key, inverted) {
        const tile = this._content.tiles[tileId];
        const setting = new BooleanSetting.BooleanSetting(schema, key, inverted, () => tile.setChecked(setting.enabled));
        tile.setOnToggle(() => setting.toggle());
        tile.setChecked(setting.enabled);
        return setting;
    }

    _setUpKeepAwake() {
        const tile = this._content.tiles['keep-awake'];
        this._keepAwake = new KeepAwake.KeepAwake(this._uuid, () => {
            tile.setAvailable(this._keepAwake.available);
            tile.setChecked(this._keepAwake.inhibited);
        });
        tile.setOnToggle(() => this._keepAwake.toggle());
        tile.setAvailable(false);
    }

    // Same stream as the Microphone row: dimmed while there is no source.
    _setUpMicMute() {
        const tile = this._content.tiles['mic-mute'];
        tile.setOnToggle(() => this._volume.input.toggleMute());
        this._syncMicMute();
    }

    _syncMicMute() {
        const tile = this._content.tiles['mic-mute'];
        if (!tile || !this._volume)
            return;
        tile.setAvailable(this._volume.input.available);
        tile.setChecked(this._volume.input.muted);
    }

    // Each button closes the menu first, then acts as the stock applets do.
    _setUpHeader() {
        const header = this._content.header;
        this._battery = new Battery.Battery(battery => header.setBattery(battery));
        header.setOnButton('screenshot', () => this._closeThen(() => Util.spawn(Constants.SCREENSHOT_COMMAND)));
        header.setOnButton('settings', () => this._closeThen(() => Util.spawn(Constants.SYSTEM_SETTINGS_COMMAND)));
        header.setOnButton('lock', () => this._closeThen(() => this._lockScreen()));
        header.setOnButton('power', () => this._closeThen(() => this._session().ShutdownRemote()));
    }

    // The settings dialog's four lists (settings-schema.json, generated from constants.js),
    // applied live on every change.
    _setUpLayoutSettings(uuid, instanceId) {
        this._layout = {};
        this._brightnessShown = false;
        this._nordvpnShown = false;
        this.settings = new Settings.AppletSettings(this._layout, uuid, instanceId);
        for (const key of Object.values(Constants.LAYOUT_KEYS))
            this.settings.bind(key, key, () => this._applyLayout());
        this._applyLayout();
    }

    _declared(key) {
        return {
            [Constants.LAYOUT_KEYS.tiles]: Constants.TILES,
            [Constants.LAYOUT_KEYS.sliders]: Constants.SLIDERS,
            [Constants.LAYOUT_KEYS.header]: Constants.HEADER_ITEMS,
            [Constants.LAYOUT_KEYS.panelIcons]: Constants.PANEL_ICON_ITEMS,
        }[key];
    }

    _visible(key) {
        return LayoutModel.visibleIds(this._layout ? this._layout[key] : null, this._declared(key));
    }

    _isShown(key, id) {
        return this._visible(key).includes(id);
    }

    // A hidden Brightness row runs no ddcutil and a hidden NordVPN tile no nordvpn call:
    // each reads once when it shows (at start, or when the dialog shows it again).
    _applyLayout() {
        const sliders = this._visible(Constants.LAYOUT_KEYS.sliders);
        const tiles = this._visible(Constants.LAYOUT_KEYS.tiles);
        this._content.applyLayout(sliders, tiles);
        this._content.header.applyLayout(this._visible(Constants.LAYOUT_KEYS.header));
        this._panelIcons.applyLayout(this._visible(Constants.LAYOUT_KEYS.panelIcons));

        const brightnessShown = sliders.includes('monitors');
        if (brightnessShown && !this._brightnessShown)
            this._brightness.detect();
        this._brightnessShown = brightnessShown;
        const nordvpnShown = tiles.includes('nordvpn');
        if (nordvpnShown && !this._nordvpnShown)
            this._nordvpn.refresh();
        this._nordvpnShown = nordvpnShown;
    }

    _closeThen(action) {
        this.menu.close(false);
        action();
    }

    // As the stock menu applet's Lock Screen button.
    _lockScreen() {
        if (!Gio.File.new_for_path(Constants.SCREENSAVER_COMMAND).query_exists(null)) {
            new ScreenSaver.ScreenSaverProxy().LockRemote('');
            return;
        }
        const settings = new Gio.Settings({ schema_id: Constants.SCREENSAVER_SCHEMA });
        Util.spawn(settings.get_boolean(Constants.SCREENSAVER_AWAY_MESSAGE_KEY)
            ? Constants.LOCK_WITH_MESSAGE_COMMAND
            : Constants.LOCK_COMMAND);
    }

    // The stock menu applet's session proxy: ShutdownRemote() opens Cinnamon's end-session
    // dialog, which offers suspend, restart and shut down.
    _session() {
        if (!this._sessionManager)
            this._sessionManager = new GnomeSession.SessionManager();
        return this._sessionManager;
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
        // The first detection comes from _applyLayout(), only when the row shows.
        this._monitorsChangedId = Main.layoutManager.connect('monitors-changed', () => {
            if (this._isShown(Constants.LAYOUT_KEYS.sliders, 'monitors'))
                this._brightness.detectSoon();
        });
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
                this._syncMicMute();
            },
            kind => this._content.lists.refresh(kind));
        output.onLiveChange(value => this._volume.output.set(value));
        input.onLiveChange(value => this._volume.input.set(value));
        for (const [kind, row] of [['output', output], ['input', input]]) {
            this._registerList(kind, row, () => row.actor,
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
