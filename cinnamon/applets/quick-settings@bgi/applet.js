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
const StringSetting = require('./stringSetting');
const KbdBacklight = require('./kbdBacklight');
const KbdBacklightModel = require('./kbdBacklightModel');
const AirplaneMode = require('./airplaneMode');
const Brightness = require('./brightness');
const DdcBrightness = require('./ddcBrightness');
const ScreenBrightness = require('./screenBrightness');
const Subprocess = require('./subprocess');
const Volume = require('./volume');
const VolumeMapping = require('./volumeMapping');
const Bluetooth = require('./bluetooth');
const BluetoothModel = require('./bluetoothModel');
const VpnState = require('./vpnState');
const VpnModel = require('./vpnModel');
const Nordvpn = require('./nordvpn');
const ListSpecs = require('./listSpecs');
const Battery = require('./battery');
const BooleanSetting = require('./booleanSetting');
const NightLight = require('./nightLight');
const WarmthModel = require('./warmthModel');
const KeepAwake = require('./keepAwake');
const PowerProfiles = require('./powerProfiles');
const PowerProfileModel = require('./powerProfileModel');
const Settings = imports.ui.settings;
const LayoutModel = require('./layoutModel');
const ChargeLimit = require('./chargeLimit');
const ChargeModel = require('./chargeModel');
const MediaControls = require('./mediaControls');
const MediaWindows = require('./mediaWindows');

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
                if (this._isShown(Constants.LAYOUT_KEYS.tiles, 'charge-limit'))
                    this._chargeLimit.refresh();
                if (this._media)
                    this._media.menuOpened();
            } else {
                this._content.lists.close();
            }
        });

        // Wi-Fi and VPN share one NetworkManager client.
        this._nmClient = new NmClient.SharedNmClient();
        this._requestNmClient = (cancellable, onReady) => this._nmClient.request(cancellable, onReady);
        this._setUpWifi();

        this._setUpBrightness();
        this._setUpVolume();
        this._setUpBluetooth();
        this._setUpAirplaneMode();
        this._setUpVpn();
        this._setUpNordvpn();
        this._setUpPowerProfile();
        this._setUpSettingTiles();
        this._setUpNightLight();
        this._setUpKeepAwake();
        this._setUpKeyboardLight();
        this._setUpChargeLimit();
        this._setUpMicMute();
        this._media = null;
        this._content.setOnMediaButton((busName, method) => this._media && this._media.call(busName, method),
            busName => this._focusMediaPlayer(busName));
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
        this._keyboardLight.destroy();
        this._chargeLimit.destroy();
        this._stopMedia();
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
        this._syncAirplaneMode();
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
        this._content.lists.refresh('bluetooth');
        this._syncAirplaneMode();
    }

    _setUpVpn() {
        const tile = this._content.tiles.vpn;
        this._nordvpnLinkUp = null;
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
        this._refreshNordvpnOnLinkChange();
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

    // NordVPN connected or disconnected elsewhere (a terminal, its own app) brings its
    // NordLynx link up or down in NetworkManager: one status read then, no polling.
    _refreshNordvpnOnLinkChange() {
        const linkUp = this._vpn.nordvpnLinkUp;
        const changed = this._nordvpnLinkUp !== null && linkUp !== this._nordvpnLinkUp;
        this._nordvpnLinkUp = linkUp;
        if (changed && this._nordvpn && this._isShown(Constants.LAYOUT_KEYS.tiles, 'nordvpn'))
            this._nordvpn.refresh();
    }

    _syncVpnPanelIcon() {
        const active = this._vpn ? this._vpn.summary.active : null;
        const country = this._nordvpn ? this._nordvpn.connectedCountry : null;
        const nordvpnUp = Boolean(this._nordvpn && this._nordvpn.status.connected);
        this._panelIcons.setVpn(Boolean(active) || nordvpnUp,
            VpnModel.panelName(country, active ? active.id : null));
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
        this._doNotDisturb = this._wireSettingTile('do-not-disturb', onChange => new BooleanSetting.BooleanSetting(
            Constants.NOTIFICATIONS_SCHEMA, Constants.NOTIFICATIONS_KEY, true, onChange));
        this._darkStyle = this._wireSettingTile('dark-style', onChange => new StringSetting.StringSetting(
            Constants.DARK_STYLE_SCHEMA, Constants.DARK_STYLE_KEY,
            { on: Constants.DARK_STYLE_ON, off: Constants.DARK_STYLE_OFF }, onChange));
    }

    // @create(onChange): a BooleanSetting or a StringSetting calling onChange on each change.
    _wireSettingTile(tileId, create) {
        const tile = this._content.tiles[tileId];
        const setting = create(() => tile.setChecked(setting.enabled));
        tile.setOnToggle(() => setting.toggle());
        tile.setChecked(setting.enabled);
        return setting;
    }

    // The Warmth row's switch turns Night Light on and off; the temperature follows the
    // handle live, one write per step.
    _setUpNightLight() {
        const row = this._content.sliders.warmth;
        this._nightLight = new NightLight.NightLight(() => this._syncNightLight());
        row.setOnSwitch(() => this._nightLight.toggle());
        row.onLiveChange(value => this._nightLight.setTemperature(WarmthModel.fractionToKelvin(value)));
        this._syncNightLight();
    }

    // Night Light off: the Warmth slider is dimmed and inert, the switch stays usable.
    _syncNightLight() {
        const state = WarmthModel.rowState(this._nightLight.enabled, this._nightLight.temperature);
        const row = this._content.sliders.warmth;
        row.setAvailable(state.available);
        row.setSwitchState(state.switchOn);
        row.showValue(state.fraction);
        row.setValueText(state.text);
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

    // A click goes one level up, back to off after the brightest.
    _setUpKeyboardLight() {
        const tile = this._content.tiles['keyboard-light'];
        this._keyboardLight = new KbdBacklight.KbdBacklight(() => {
            const light = this._keyboardLight;
            tile.setAvailable(light.available);
            tile.setChecked(light.level > 0);
            tile.setLabel(KbdBacklightModel.tileLabel(tile.defaultLabel, light.level, light.max));
        });
        tile.setOnToggle(() => this._keyboardLight.cycle());
        tile.setAvailable(false);
    }

    // Read when the tile shows, when the menu opens, after each click and on each battery
    // change. A hidden tile does nothing at all: no read, no automatic return.
    _setUpChargeLimit() {
        const tile = this._content.tiles['charge-limit'];
        this._chargeLimit = new ChargeLimit.ChargeLimit(Subprocess.runCommand, () => {
            const view = ChargeModel.tileView(this._chargeLimit.state);
            tile.setAvailable(this._chargeLimit.available);
            tile.setChecked(view.checked);
            tile.setLabel(view.label);
        });
        tile.setOnToggle(() => this._chargeLimit.toggle());
        tile.setAvailable(false);
        // The first read comes from _applyLayout(), only when the tile shows.
        this._chargeShown = false;
    }

    // Wi-Fi and Bluetooth through their own tiles' code; checked while airplane mode is on.
    _setUpAirplaneMode() {
        const tile = this._content.tiles['airplane-mode'];
        this._airplaneMode = new AirplaneMode.AirplaneMode([
            { isOn: () => this._wifi.enabled, setOn: (on, onFailed) => this._wifi.setEnabled(on, onFailed) },
            { isOn: () => this._bluetooth.summary.powered, setOn: (on, onFailed) => this._bluetooth.setPowered(on, onFailed) },
        ], () => this._syncAirplaneMode());
        tile.setOnToggle(() => {
            this._airplaneMode.toggle();
            this._syncAirplaneMode();
        });
        this._syncAirplaneMode();
    }

    // Runs on every Wi-Fi and Bluetooth change, also before airplane mode is set up. The
    // Bluetooth panel item follows both, so it is drawn here.
    _syncAirplaneMode() {
        if (this._airplaneMode) {
            const tile = this._content.tiles['airplane-mode'];
            this._airplaneMode.sync();
            tile.setAvailable(this._wifi.available || this._bluetooth.summary.available);
            tile.setChecked(this._airplaneMode.active);
        }
        this._syncBluetoothPanel();
    }

    // Struck through while airplane mode holds the adapter off, hidden while it is off otherwise.
    _syncBluetoothPanel() {
        if (!this._bluetooth)
            return;
        const summary = this._bluetooth.summary;
        const airplaneActive = Boolean(this._airplaneMode && this._airplaneMode.active);
        this._panelIcons.setBluetooth(BluetoothModel.panelIconName(summary, airplaneActive), BluetoothModel.deviceName(summary));
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
        // One battery read for the header figure and the panel level.
        this._battery = new Battery.Battery(battery => {
            header.setBattery(battery);
            this._panelIcons.setBattery(battery);
            if (this._chargeShown)
                this._chargeLimit.onBattery(battery);
        });
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
            this.settings.bind(key, key, () => this._onLayoutSettingChanged());
        this._onLayoutSettingChanged();
    }

    _onLayoutSettingChanged() {
        this._writeBackLayouts();
        this._applyLayout();
    }

    // A list saved by an older version lacks the new elements (or holds removed ones): it is
    // written back normalized, so the dialog lists every element. setValue() saves the file
    // without calling the bind callback; a later settings change finds nothing to write.
    _writeBackLayouts() {
        for (const key of Object.values(Constants.LAYOUT_KEYS))
            LayoutModel.writeBackLayout(this.settings, key, this._declared(key));
    }

    _declared(key) {
        return {
            [Constants.LAYOUT_KEYS.tiles]: Constants.TILE_LAYOUT_ITEMS,
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
    // each reads once when it shows (at start, or when the dialog shows it again). Hidden
    // media controls follow no player.
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
        const chargeShown = tiles.includes('charge-limit');
        if (chargeShown && !this._chargeShown)
            this._chargeLimit.refresh();
        this._chargeShown = chargeShown;
        if (tiles.includes(Constants.MEDIA_ITEM.id))
            this._startMedia();
        else
            this._stopMedia();
    }

    // Hidden media controls watch no player: the players are followed only while they show.
    _startMedia() {
        if (!this._media)
            this._media = new MediaControls.MediaControls(blocks => this._content.setMediaBlocks(blocks), MediaWindows.CINNAMON_WINDOWS);
    }

    // The player's window comes forward once the menu is closed.
    _focusMediaPlayer(busName) {
        if (!this._media)
            return;
        // Read now, during the click: a window found after the process id reply is activated
        // with the click's time, not a later one.
        const time = global.get_current_time();
        this._closeThen(() => this._media && this._media.focus(busName, time));
    }

    _stopMedia() {
        if (!this._media)
            return;
        this._media.destroy();
        this._media = null;
        this._content.setMediaBlocks([]);
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
}

function main(metadata, orientation, panelHeight, instanceId) {
    return new QuickSettingsApplet(metadata, orientation, panelHeight, instanceId);
}
