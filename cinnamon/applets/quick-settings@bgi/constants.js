// Every label, icon name and settings key of the applet, in one place.

const LOG_PREFIX = 'quick-settings@bgi';

const TOOLTIP = 'Quick Settings';

const SUBMENU_ICON = 'go-next-symbolic';

// Opacity, out of 255, of the parts that do nothing yet. Keeps the labels readable.
const INACTIVE_OPACITY = 160;
const FULL_OPACITY = 255;

// Theme properties every Cinnamon theme sets for its sliders: the tiles take their
// colours from them, so they follow the theme's accent.
const THEME_TILE_COLOR = '-slider-background-color';
const THEME_TILE_CHECKED_COLOR = '-slider-active-background-color';

// Slider position before the first real value arrives.
const SLIDER_INITIAL_VALUE = 0;

// Wi-Fi on and off, on the panel and on its tile.
const WIFI_ON_ICON = 'network-wireless-symbolic';
const WIFI_OFF_ICON = 'network-wireless-disabled-symbolic';

const PANEL_ICONS = {
    bluetooth: 'bluetooth-symbolic',
    vpn: 'network-vpn-symbolic',
    volume: 'audio-volume-high-symbolic',
};

const HEADER_BUTTONS = [
    { id: 'screenshot', icon: 'applets-screenshooter-symbolic' },
    { id: 'settings', icon: 'preferences-system-symbolic' },
    { id: 'lock', icon: 'system-lock-screen-symbolic' },
    { id: 'power', icon: 'system-shutdown-symbolic' },
];

// Slider rows, top to bottom: this array is the only place that sets their order.
const SLIDERS = [
    { id: 'output', label: 'Sound', icon: 'audio-volume-high-symbolic', hasMenu: true },
    { id: 'input', label: 'Microphone', icon: 'audio-input-microphone-symbolic', hasMenu: true },
    { id: 'monitors', label: 'Brightness', icon: 'display-brightness-symbolic', hasMenu: false },
];

// Grid order: left to right, then top to bottom, two per row.
const TILES = [
    { id: 'wifi', label: 'Wi-Fi', icon: WIFI_ON_ICON, hasMenu: true },
    { id: 'bluetooth', label: 'Bluetooth', icon: 'bluetooth-active-symbolic', hasMenu: true },
    { id: 'vpn', label: 'VPN SEB', icon: 'network-vpn-symbolic', hasMenu: true },
    { id: 'nordvpn', label: 'NordVPN', icon: 'globe-symbolic', hasMenu: true },
    { id: 'power-profile', label: 'Power: Balanced', icon: 'power-profile-balanced-symbolic', hasMenu: true },
    { id: 'night-light', label: 'Night Light', icon: 'night-light-symbolic', hasMenu: false },
    { id: 'dark-style', label: 'Dark style', icon: 'dark-mode-symbolic', hasMenu: false },
    { id: 'do-not-disturb', label: 'Do Not Disturb', icon: 'notifications-disabled-symbolic', hasMenu: false },
    { id: 'keep-awake', label: 'Keep awake', icon: 'my-caffeine-on-symbolic', hasMenu: false },
    { id: 'mic-mute', label: 'Mic mute', icon: 'microphone-sensitivity-muted-symbolic', hasMenu: false },
];

const TILES_PER_ROW = 2;

// Same key as Cinnamon Settings > Themes > Dark mode.
const DARK_STYLE_SCHEMA = 'org.x.apps.portal';
const DARK_STYLE_KEY = 'color-scheme';
const DARK_STYLE_ON = 'prefer-dark';
const DARK_STYLE_OFF = 'default';

const POWER_SUPPLY_DIR = '/sys/class/power_supply';
const BATTERY_TYPE = 'Battery';
// Battery icons exist in steps of ten: battery-level-0-symbolic to battery-level-100-symbolic.
const BATTERY_ICON_STEP = 10;
const BATTERY_ICON_PREFIX = 'battery-level-';
const BATTERY_ICON_SUFFIX = '-symbolic';
const BATTERY_LABEL_SUFFIX = '%';

// Brightness of the external monitors, through DDC/CI. Buses are detected at runtime: they
// change with the dock.
const DDCUTIL = 'ddcutil';
const DDC_BRIGHTNESS_FEATURE = '10';
// A scroll on the slider has no release: the value is sent once the wheel stops this long.
const BRIGHTNESS_SCROLL_COMMIT_MS = 400;

// Laptop panel brightness, through cinnamon-settings-daemon like the stock power applet.
const SCREEN_BRIGHTNESS_PROXY = 'org.cinnamon.SettingsDaemon.Power.Screen';
const PERCENT = 100;

// Volume, the stock sound applet's way (sound@cinnamon.org).
const MIXER_NAME = 'Quick Settings Volume Control';
const SOUND_SCHEMA = 'org.cinnamon.desktop.sound';
const AMPLIFIED_VOLUME_KEY = 'allow-amplified-volume';
const AMPLIFIED_VOLUME_FACTOR = 1.5;
// Below this slider value the stream is muted at volume 0.
const VOLUME_MUTE_THRESHOLD = 0.005;
// Within half of this step around 100%, the volume snaps to 100%.
const VOLUME_ADJUSTMENT_STEP = 0.05;
const VOLUME_ICON_PREFIX = 'audio-volume-';
const VOLUME_ICON_LEVELS = ['low', 'medium', 'high'];
const VOLUME_ICON_MUTED = 'muted';
const SYMBOLIC_SUFFIX = '-symbolic';

// In-place lists opened by a '>' arrow.
const LIST_EXPANDED_ICON = 'go-down-symbolic';
const LIST_ACTIVE_ICON = 'object-select-symbolic';
const LIST_SECURE_ICON = 'changes-prevent-symbolic';
const LIST_TITLES = {
    wifi: 'Wi-Fi',
    bluetooth: 'Bluetooth',
    vpn: 'VPN',
    nordvpn: 'NordVPN',
    output: 'Sound',
    input: 'Microphone',
};
const LIST_SETTINGS_LABELS = {
    wifi: 'All networks...',
    bluetooth: 'Bluetooth settings...',
    vpn: 'Network settings...',
    output: 'Sound settings...',
    input: 'Sound settings...',
};
// The commands the stock applets and the installed tools use for each settings page.
const SETTINGS_COMMANDS = {
    network: ['cinnamon-settings', 'network'],
    // Wi-Fi with 802.1x needs the stock wizard: device path and access point path follow.
    enterpriseWifi: ['cinnamon-settings', 'network', 'connect-8021x-wifi'],
    bluetooth: ['blueman-manager'],
    sound: ['cinnamon-settings', 'sound'],
};

// Wi-Fi list.
const WIFI_LIST_MAX = 8;
const WIFI_SIGNAL_ICON_PREFIX = 'network-wireless-signal-';
// Same thresholds as the stock network applet (signalToIcon), strongest first.
const WIFI_SIGNAL_LEVELS = [
    { above: 80, name: 'excellent' },
    { above: 55, name: 'good' },
    { above: 30, name: 'ok' },
    { above: 5, name: 'weak' },
    { above: -1, name: 'none' },
];
// The stock network applet names new connections this way ("Auto %s").
const WIFI_AUTO_CONNECTION_PREFIX = 'Auto ';

// Bluetooth, through BlueZ on the system bus.
const BLUEZ_NAME = 'org.bluez';
const BLUEZ_ADAPTER_INTERFACE = 'org.bluez.Adapter1';
const BLUEZ_DEVICE_INTERFACE = 'org.bluez.Device1';
const DBUS_PROPERTIES_INTERFACE = 'org.freedesktop.DBus.Properties';
const BLUETOOTH_ON_ICON = 'bluetooth-active-symbolic';
const BLUETOOTH_IDLE_ICON = 'bluetooth-symbolic';
const BLUETOOTH_OFF_ICON = 'bluetooth-disabled-symbolic';
const BLUETOOTH_DEVICE_ICON = 'bluetooth-symbolic';

// NetworkManager VPN profiles. NordVPN's own interface is left to the NordVPN tile.
const VPN_CONNECTION_TYPES = ['vpn', 'wireguard'];
const NORDVPN_INTERFACES = ['nordlynx'];
const VPN_TILE_PREFIX = 'VPN';

// NordVPN command line client.
const NORDVPN = 'nordvpn';
const NORDVPN_CONNECTED = 'Connected';
const NORDVPN_QUICK_CONNECT = 'Quick connect';

// Slider row icons that follow the level, as in the stock sound applet.
const INPUT_ICON_PREFIX = 'microphone-sensitivity-';
