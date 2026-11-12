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
// Shown alone when every panel icon is hidden or absent, so the button never disappears.
const PANEL_FALLBACK_ICON = 'preferences-system-symbolic';

// Panel icons, left to right: this array is the only place that sets their order.
const PANEL_ICON_ITEMS = [
    { id: 'wifi', name: 'Wi-Fi' },
    { id: 'bluetooth', name: 'Bluetooth' },
    { id: 'vpn', name: 'VPN' },
    { id: 'volume', name: 'Volume' },
];

// Header elements as the settings dialog lists them: the battery figure (always on the
// left), then the buttons. Left to right: this array is the only place that sets the order.
const HEADER_BATTERY_ID = 'battery';
const HEADER_BATTERY_ITEM = { id: HEADER_BATTERY_ID, name: 'Battery' };

// Header buttons, left to right. The label is the tooltip and the accessible name; the name
// is what the settings dialog shows (as for every list below).
const HEADER_BUTTONS = [
    { id: 'screenshot', icon: 'applets-screenshooter-symbolic', label: 'Screenshot', name: 'Screenshot' },
    { id: 'settings', icon: 'preferences-system-symbolic', label: 'System Settings', name: 'Settings' },
    { id: 'lock', icon: 'system-lock-screen-symbolic', label: 'Lock Screen', name: 'Lock' },
    { id: 'power', icon: 'system-shutdown-symbolic', label: 'Power Off...', name: 'Power' },
];

// Slider rows, top to bottom: this array is the only place that sets their order.
const SLIDERS = [
    { id: 'output', label: 'Sound', name: 'Sound', icon: 'audio-volume-high-symbolic', hasMenu: true },
    { id: 'input', label: 'Microphone', name: 'Microphone', icon: 'audio-input-microphone-symbolic', hasMenu: true },
    { id: 'monitors', label: 'Brightness', name: 'Brightness', icon: 'display-brightness-symbolic', hasMenu: false },
];

// Tiles, left to right then top to bottom, two per row: this array is the only place that
// sets their order.
const TILES = [
    { id: 'wifi', label: 'Wi-Fi', icon: WIFI_ON_ICON, name: 'Wi-Fi', hasMenu: true },
    { id: 'bluetooth', label: 'Bluetooth', icon: 'bluetooth-active-symbolic', name: 'Bluetooth', hasMenu: true },
    { id: 'vpn', label: 'VPN', name: 'VPN', icon: 'network-vpn-symbolic', hasMenu: true },
    { id: 'nordvpn', label: 'NordVPN', name: 'NordVPN', icon: 'globe-symbolic', hasMenu: true },
    { id: 'power-profile', label: 'Balanced', name: 'Power profile', icon: 'power-profile-balanced-symbolic', hasMenu: true },
    { id: 'night-light', label: 'Night Light', name: 'Night Light', icon: 'night-light-symbolic', hasMenu: false },
    { id: 'dark-style', label: 'Dark style', name: 'Dark style', icon: 'dark-mode-symbolic', hasMenu: false },
    { id: 'do-not-disturb', label: 'Do Not Disturb', name: 'Do Not Disturb', icon: 'notifications-disabled-symbolic', hasMenu: false },
    { id: 'keep-awake', label: 'Keep awake', name: 'Keep awake', icon: 'my-caffeine-on-symbolic', hasMenu: false },
    { id: 'mic-mute', label: 'Mic mute', name: 'Mic mute', icon: 'microphone-sensitivity-muted-symbolic', hasMenu: false },
];

const TILES_PER_ROW = 2;

// Same key as Cinnamon Settings > Themes > Dark mode.
const DARK_STYLE_SCHEMA = 'org.x.apps.portal';
const DARK_STYLE_KEY = 'color-scheme';
const DARK_STYLE_ON = 'prefer-dark';
const DARK_STYLE_OFF = 'default';

// Battery, from cinnamon-settings-daemon like the stock power applet.
const POWER_PROXY = 'org.cinnamon.SettingsDaemon.Power';
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
    'power-profile': 'Power Mode',
};
const LIST_SETTINGS_LABELS = {
    wifi: 'All networks...',
    bluetooth: 'Bluetooth settings...',
    vpn: 'Network settings...',
    output: 'Sound settings...',
    input: 'Sound settings...',
    'power-profile': 'Power settings...',
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

// Header button actions, as the stock applets run them.
const SCREENSHOT_COMMAND = ['flameshot', 'gui'];
const SYSTEM_SETTINGS_COMMAND = ['cinnamon-settings'];
// Lock, as the stock menu applet does it: the screensaver command when installed.
const SCREENSAVER_COMMAND = '/usr/bin/cinnamon-screensaver-command';
const SCREENSAVER_SCHEMA = 'org.cinnamon.desktop.screensaver';
const SCREENSAVER_AWAY_MESSAGE_KEY = 'ask-for-away-message';
const LOCK_COMMAND = ['cinnamon-screensaver-command', '--lock'];
const LOCK_WITH_MESSAGE_COMMAND = ['cinnamon-screensaver-lock-dialog'];

// Power profiles, through power-profiles-daemon. Same bus names, order and labels as the
// stock power applet.
const POWER_PROFILES_BUSES = [
    { name: 'net.hadess.PowerProfiles', path: '/net/hadess/PowerProfiles' },
    { name: 'org.freedesktop.UPower.PowerProfiles', path: '/org/freedesktop/UPower/PowerProfiles' },
];
const POWER_PROFILE_LABELS = {
    'power-saver': 'Power Saver',
    'balanced': 'Balanced',
    'performance': 'Performance',
};
const POWER_PROFILE_BALANCED = 'balanced';
const POWER_PROFILE_FIRST_OTHER = 'power-saver';
const POWER_PROFILE_ICON_PREFIX = 'power-profile-';
const POWER_SETTINGS_COMMAND = ['cinnamon-settings', 'power'];

// Night Light: the key of Cinnamon Settings > Night Light.
const NIGHT_LIGHT_SCHEMA = 'org.cinnamon.settings-daemon.plugins.color';
const NIGHT_LIGHT_KEY = 'night-light-enabled';

// Do Not Disturb: the key Cinnamon's message tray reads (Settings > Notifications >
// Enable notifications). The tile is on when notifications are off.
const NOTIFICATIONS_SCHEMA = 'org.cinnamon.desktop.notifications';
const NOTIFICATIONS_KEY = 'display-notifications';

// Keep awake: a session manager inhibit, as the stock inhibit applet takes it.
const SESSION_MANAGER_NAME = 'org.gnome.SessionManager';
const SESSION_MANAGER_PATH = '/org/gnome/SessionManager';
const SESSION_MANAGER_INTERFACE = 'org.gnome.SessionManager';
// GSM_INHIBITOR_FLAG_IDLE, as INHIBIT_IDLE_FLAG in the stock inhibit applet.
const INHIBIT_IDLE_FLAG = 8;
const INHIBIT_REASON = 'prevent idle functions like screen blanking and dimming';

// Settings dialog (settings-schema.json): one list per group, rows { show, id }.
const LAYOUT_KEYS = {
    tiles: 'tiles',
    sliders: 'sliders',
    header: 'header',
    panelIcons: 'panel-icons',
};

// The header as the settings dialog lists it.
const HEADER_ITEMS = [HEADER_BATTERY_ITEM, ...HEADER_BUTTONS];
