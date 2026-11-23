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
// Names after a panel icon and on a tile (VPN, Bluetooth device): each name longer than the
// limit is cut, ending in the ellipsis; several Bluetooth devices show the first and "+N".
const PANEL_NAME_MAX = 16;
const PANEL_NAME_ELLIPSIS = '…';
const PANEL_NAME_MORE_PREFIX = ' +';
// The VPN name after its panel icon: NordVPN's country, the NetworkManager profile's name,
// both joined by this when both are up (NordVPN first).
const PANEL_VPN_NAME_SEPARATOR = ' + ';
// Shown alone when every panel icon is hidden or absent, so the button never disappears.
const PANEL_FALLBACK_ICON = 'preferences-system-symbolic';

// Panel icons, left to right: this array is the only place that sets their order.
const PANEL_ICON_ITEMS = [
    { id: 'wifi', name: 'Wi-Fi' },
    // The VPN icon, then the name of the VPN that is up.
    { id: 'vpn', name: 'VPN' },
    { id: 'bluetooth', name: 'Bluetooth' },
    { id: 'volume', name: 'Volume' },
    // The battery icon and level ("87%"), the header's figure.
    { id: 'battery', name: 'Battery' },
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
    // The screen colour temperature, its value as text, and on the right a switch that turns
    // the tint on and off (switchLabel: what it toggles, for screen readers).
    { id: 'warmth', label: 'Warmth', name: 'Warmth', icon: 'night-light-symbolic', hasMenu: false, hasSwitch: true,
        switchLabel: 'Warmth' },
];

// After a percentage: the battery level, the Charge tile's labels.
const PERCENT_SUFFIX = '%';

// Charge limit: the battery's charge mode in sysfs (Dell dell_laptop driver), read as files
// and switched by the root helper system/battery-charge-limit, run with sudo -n (never a
// password prompt). The limit state is the Custom mode with the end threshold below; the
// values must match the helper's constants (a test compares them).
const CHARGE_BATTERY_DIR = '/sys/class/power_supply/BAT0';
const CHARGE_TYPES_FILE = `${CHARGE_BATTERY_DIR}/charge_types`;
const CHARGE_START_FILE = `${CHARGE_BATTERY_DIR}/charge_control_start_threshold`;
const CHARGE_END_FILE = `${CHARGE_BATTERY_DIR}/charge_control_end_threshold`;
const CHARGE_LIMIT_MODE = 'Custom';
const CHARGE_FULL_MODE = 'Adaptive';
const CHARGE_LIMIT_START = 75;
const CHARGE_LIMIT_END = 80;
const CHARGE_HELPER = '/usr/local/sbin/battery-charge-limit';
const CHARGE_HELPER_WORDS = { limit: 'limit', full: 'full' };
// Absolute, so the session's PATH plays no part.
const CHARGE_SUDO = ['/usr/bin/sudo', '-n'];
const CHARGE_FULL_PERCENT = 100;
const CHARGE_LABEL_PREFIX = 'Charge';
const CHARGE_LABELS = {
    limit: `${CHARGE_LABEL_PREFIX} ${CHARGE_LIMIT_END}${PERCENT_SUFFIX}`,
    full: `${CHARGE_LABEL_PREFIX} ${CHARGE_FULL_PERCENT}${PERCENT_SUFFIX}`,
};
// A command run through subprocess.js that has not ended within this long is killed. Above
// the slowest legitimate caller: nordvpn connect waits on the VPN server, ddcutil detect
// probes every I2C bus for seconds.
const COMMAND_TIMEOUT_MS = 60000;
// A helper run that does not end within this long is given up on (logged, the tile usable).
const CHARGE_HELPER_TIMEOUT_MS = 10000;
// The helper's or sudo's error text in the log is cut to this many characters.
const CHARGE_ERROR_TEXT_MAX = 200;

// Tiles, left to right then top to bottom, two per row: this array is the only place that
// sets their order.
const TILES = [
    { id: 'wifi', label: 'Wi-Fi', icon: WIFI_ON_ICON, name: 'Wi-Fi', hasMenu: true },
    { id: 'bluetooth', label: 'Bluetooth', icon: 'bluetooth-active-symbolic', name: 'Bluetooth', hasMenu: true },
    { id: 'vpn', label: 'VPN', name: 'VPN', icon: 'network-vpn-symbolic', hasMenu: true },
    { id: 'nordvpn', label: 'NordVPN', name: 'NordVPN', icon: 'globe-symbolic', hasMenu: true },
    { id: 'power-profile', label: 'Balanced', name: 'Power profile', icon: 'power-profile-balanced-symbolic', hasMenu: true },
    { id: 'airplane-mode', label: 'Airplane mode', name: 'Airplane mode', icon: 'airplane-mode-symbolic', hasMenu: false },
    { id: 'keyboard-light', label: 'Keyboard', name: 'Keyboard light', icon: 'keyboard-brightness-symbolic', hasMenu: false },
    { id: 'charge-limit', label: CHARGE_LABELS.limit, name: 'Charge limit', icon: 'battery-level-80-charging-symbolic', hasMenu: false },
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

// Brightness of the external monitors, through DDC/CI. Buses are detected at runtime: they
// change with the dock.
const DDCUTIL = 'ddcutil';
const DDC_BRIGHTNESS_FEATURE = '10';
// A scroll on the slider has no release: the value is sent once the wheel stops this long.
const BRIGHTNESS_SCROLL_COMMIT_MS = 400;
// Monitor changes closer than this are one dock event: one ddcutil detection, one Warmth
// re-apply, from one timer in applet.js.
const MONITORS_SETTLE_DELAY_MS = 1000;

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
// The tile while off, and the panel while airplane mode holds the adapter off.
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

// The Warmth row, through gammastep one-shot mode on every screen of the X server (randr):
// -O sets the temperature, -x resets the gamma. Not Cinnamon's colour plugin: it keeps one
// colour device per vendor-model-serial, so identical monitors sharing a serial get one
// device and only one of them is tinted.
const GAMMASTEP = 'gammastep';
const GAMMASTEP_METHOD_ARGS = ['-m', 'randr'];
const GAMMASTEP_SET_FLAG = '-O';
const GAMMASTEP_RESET_FLAG = '-x';
// From 6500 K, no tint, to 1000 K, the deepest red. Warmer is fewer kelvin, so the slider
// runs from WARMTH_MAX_KELVIN on the left to WARMTH_MIN_KELVIN on the right.
const WARMTH_MIN_KELVIN = 1000;
const WARMTH_MAX_KELVIN = 6500;
const WARMTH_STEP_KELVIN = 100;
const WARMTH_UNIT_SUFFIX = ' K';
// The kelvin is stored once per change, after a scroll stops like the Brightness value.
const WARMTH_SCROLL_COMMIT_MS = BRIGHTNESS_SCROLL_COMMIT_MS;
// The Warmth state in the applet's own settings: hidden keys, not in the settings dialog.
const WARMTH_SETTINGS = {
    enabled: { key: 'warmth-enabled', default: false },
    kelvin: { key: 'warmth-kelvin', default: 2000 },
};

// Keyboard light, through UPower on the system bus. The tile shows "Keyboard" and the level's
// word: Off at 0, On for a light with one level, High at the maximum, Low up to half of it,
// Medium above.
const UPOWER_NAME = 'org.freedesktop.UPower';
const KBD_BACKLIGHT_PATH = '/org/freedesktop/UPower/KbdBacklight';
const KBD_BACKLIGHT_INTERFACE = 'org.freedesktop.UPower.KbdBacklight';
const KBD_BACKLIGHT_SIGNAL = 'BrightnessChanged';
const KBD_LEVEL_WORDS = { off: 'Off', on: 'On', low: 'Low', medium: 'Medium', high: 'High' };

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

// Media controls under the tiles: one block per MPRIS player on the session bus, found like
// the stock sound applet does. Listed at the end of the Tiles tab.
const MEDIA_ITEM = { id: 'media', name: 'Media controls' };
const MPRIS_NAME_PREFIX = 'org.mpris.MediaPlayer2.';
const MPRIS_PATH = '/org/mpris/MediaPlayer2';
const MPRIS_ROOT_INTERFACE = 'org.mpris.MediaPlayer2';
const MPRIS_PLAYER_INTERFACE = 'org.mpris.MediaPlayer2.Player';
const MPRIS_PLAYING = 'Playing';
const MPRIS_PAUSED = 'Paused';
const DBUS_DAEMON = { name: 'org.freedesktop.DBus', path: '/org/freedesktop/DBus', iface: 'org.freedesktop.DBus' };
// The D-Bus types the media code reads; anything else from a player is ignored.
const MPRIS_TYPES = {
    nameOwnerChanged: '(sss)',
    propertiesChanged: '(sa{sv}as)',
    listNames: '(as)',
    nameOwner: '(s)',
    processId: '(u)',
    getAll: '(a{sv})',
    properties: {
        Identity: 's',
        Metadata: 'a{sv}',
        PlaybackStatus: 's',
        CanControl: 'b',
        CanGoPrevious: 'b',
        CanGoNext: 'b',
        CanPlay: 'b',
        CanPause: 'b',
        CanRaise: 'b',
        DesktopEntry: 's',
    },
};
// A click on a block's text brings the player's window to the front: the window of the
// application named by DesktopEntry (this suffix makes its desktop file id), else a window
// of the player's process, else MPRIS Raise. The text's accessible name: this, then the
// player name.
const MEDIA_DESKTOP_FILE_SUFFIX = '.desktop';
const MEDIA_RAISE_METHOD = 'Raise';
const MEDIA_FOCUS_LABEL = 'Show';
// A player's error text in the log is cut to this many characters.
const MEDIA_ERROR_TEXT_MAX = 120;
// The menu does not grow without bound: the first blocks in display-name order.
const MEDIA_MAX_PLAYERS = 3;
// Cut lengths, in characters; the labels also ellipsize at their width.
const MEDIA_TITLE_MAX = 44;
const MEDIA_ARTIST_MAX = 20;
const MEDIA_PLAYER_NAME_MAX = 16;
const MEDIA_ARTIST_SEPARATOR = ', ';
const MEDIA_PLAYER_SEPARATOR = ' · ';
// The buttons, left to right: the keys of MediaModel.buttonStates().
const MEDIA_BUTTON_ORDER = ['previous', 'playPause', 'next'];
// Each button's icon, accessible name and tooltip, MPRIS method (play and pause share the
// middle place).
const MEDIA_BUTTONS = {
    previous: { icon: 'media-skip-backward-symbolic', label: 'Previous', method: 'Previous' },
    play: { icon: 'media-playback-start-symbolic', label: 'Play', method: 'PlayPause' },
    pause: { icon: 'media-playback-pause-symbolic', label: 'Pause', method: 'PlayPause' },
    next: { icon: 'media-skip-forward-symbolic', label: 'Next', method: 'Next' },
};

// Settings dialog (settings-schema.json): one list per group, rows { show, id }.
const LAYOUT_KEYS = {
    tiles: 'tiles',
    sliders: 'sliders',
    header: 'header',
    panelIcons: 'panel-icons',
};

// The header as the settings dialog lists it.
const HEADER_ITEMS = [HEADER_BATTERY_ITEM, ...HEADER_BUTTONS];

// The Tiles tab: the tiles, then the media controls. They stay under the tiles whatever
// their place in the list, as the battery stays on the left of the header.
const TILE_LAYOUT_ITEMS = [...TILES, MEDIA_ITEM];
