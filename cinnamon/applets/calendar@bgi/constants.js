// Every label, format, class name and settings key calendar@bgi adds to the stock applet.

const UUID = 'calendar@bgi';
const LOG_PREFIX = UUID;

// Settings keys of the second time zone (settings-schema.json holds their defaults).
const SHOW_SECOND_ZONE_KEY = 'show-second-zone';
const SECOND_ZONE_ID_KEY = 'second-zone-id';
const SECOND_ZONE_LABEL_KEY = 'second-zone-label';

// Panel text: "Lun 16 Nov · 15:52 · VN 21:52".
const PANEL_SEPARATOR = ' · ';
// Popup header: "15:52 Paris  ·  21:52 VN".
const HEADER_SEPARATOR = '  ·  ';
// Between a time and its city or label: "15:52 Paris", "VN 21:52".
const WORD_SEPARATOR = ' ';

// GLib.DateTime.format() conversions of the date parts, in the locale's LC_TIME.
const SHORT_DATE_FORMATS = { weekday: '%a', month: '%b' };
const LONG_DATE_FORMATS = { weekday: '%A', month: '%B' };
// Trailing characters removed from an abbreviation: "lun." reads "Lun".
const ABBREVIATION_TRAILING = /\.+$/;

// Local and second-zone times, after the desktop's 24h and seconds settings.
const TIME_FORMATS = {
    h24: '%H:%M',
    h24Seconds: '%H:%M:%S',
    h12: '%-l:%M %p',
    h12Seconds: '%-l:%M:%S %p',
};

// IANA id "America/Argentina/Buenos_Aires": the city is the last part, underscores as spaces.
const ZONE_ID_PART_SEPARATOR = '/';
const ZONE_ID_SPACE = /_/g;
// Identifiers that are a file path, not a zone name: no city is shown for them.
const ZONE_ID_PATH_PREFIXES = ['/', ':'];

// Between the start and the end of an event: "10:00 - 11:00".
const EVENT_TIME_SEPARATOR = ' - ';

// One marker under a day that has events, drawn in the text colour of the theme.
const DAY_MARKER_TEXT = '•';
const DAY_MARKER_MAX = 1;

// Class names of stylesheet.css. They replace the stock classes whose sizes the themes set.
const STYLE = {
    headerTime: 'calendar-bgi-header-time',
    dayHeading: 'calendar-bgi-day-heading',
    day: 'calendar-bgi-day',
    dayMarkerBox: 'calendar-bgi-day-marker-box',
    dayMarker: 'calendar-bgi-day-marker',
    events: 'calendar-bgi-events',
    eventTitle: 'calendar-bgi-event-title',
    eventTime: 'calendar-bgi-event-time',
};
