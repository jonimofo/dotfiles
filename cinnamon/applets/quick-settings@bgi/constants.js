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

// Placeholder position of the sliders until they are wired.
const SLIDER_PLACEHOLDER_VALUE = 0.5;

// Wi-Fi on and off, on the panel and on its tile.
const WIFI_ON_ICON = 'network-wireless-symbolic';
const WIFI_OFF_ICON = 'network-wireless-disabled-symbolic';

const PANEL_ICONS = {
    bluetooth: 'bluetooth-active-symbolic',
    vpn: 'network-vpn-symbolic',
    volume: 'audio-volume-high-symbolic',
};

const HEADER_BUTTONS = [
    { id: 'screenshot', icon: 'applets-screenshooter-symbolic' },
    { id: 'settings', icon: 'preferences-system-symbolic' },
    { id: 'lock', icon: 'system-lock-screen-symbolic' },
    { id: 'power', icon: 'system-shutdown-symbolic' },
];

const SLIDERS = [
    { id: 'monitors', label: 'Monitors', icon: 'display-brightness-symbolic', hasMenu: false },
    { id: 'output', label: 'Output', icon: 'audio-volume-high-symbolic', hasMenu: true },
    { id: 'input', label: 'Input', icon: 'audio-input-microphone-symbolic', hasMenu: true },
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
