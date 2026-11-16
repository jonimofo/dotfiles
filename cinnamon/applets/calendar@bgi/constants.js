// Every label, format, class name and settings key calendar@bgi adds to the stock applet.

const UUID = 'calendar@bgi';
const LOG_PREFIX = UUID;

// Settings keys of the second time zone (settings-schema.json holds their defaults).
const SHOW_SECOND_ZONE_KEY = 'show-second-zone';
const SECOND_ZONE_ID_KEY = 'second-zone-id';
const SECOND_ZONE_LABEL_KEY = 'second-zone-label';

// Appearance settings (Configure > Appearance). settings-schema.json is written by hand; the
// test checks that it holds each of these keys with this default, range, step and label.
// Text sizes, in percent of the validated look.
const TEXT_SCALES = {
    events: { key: 'events-text-scale', label: 'Events', default: 100, min: 70, max: 160, step: 5 },
    days: { key: 'days-text-scale', label: 'Days', default: 100, min: 70, max: 160, step: 5 },
    header: { key: 'header-text-scale', label: 'Header', default: 100, min: 70, max: 160, step: 5 },
};
// Space between two event rows, in px.
const EVENT_GAP = { key: 'event-gap', label: 'Gap between events', default: 8, min: 0, max: 24, step: 1 };
// Elements shown or hidden. Week numbers and events are stock keys.
const ELEMENT_SWITCHES = {
    headerClocks: { key: 'show-header-clocks', label: 'Clocks in the header', default: true },
    eventMeta: { key: 'show-event-meta', label: 'Metadata line', default: true },
    eventCountdown: { key: 'show-event-countdown', label: 'Countdown', default: true },
    dayMarker: { key: 'show-day-marker', label: 'Dot under days', default: true },
    daySummary: { key: 'show-day-summary', label: 'Summary card', default: true },
    todayButton: { key: 'show-today-button', label: 'Today button', default: true },
    weekNumbers: { key: 'show-week-numbers', label: 'Week numbers', default: false },
    events: { key: 'show-events', label: 'Calendar events', default: true },
};
// Configure dialog tabs, in order, with their section titles.
const SETTINGS_PAGES = [
    { title: 'Appearance', sections: ['Text size', 'Shown elements'] },
    { title: 'Panel', sections: ['Date', 'Second time zone'] },
];
// Font size of the event list at 100%: the event texts are in em of it, so 100% gives the
// px sizes of the validated design (time 13px, title 14px, metadata 12px, countdown 11px).
const EVENTS_BASE_FONT_PX = 12;

// Panel text: "Lun 16 Nov · 15:52 · VN 21:52".
const PANEL_SEPARATOR = ' · ';
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

// Between the start and the end of an event: "10:00 – 11:00".
const EVENT_TIME_SEPARATOR = ' – ';

// An event summary "Team meeting | Alex | [R1]" reads as the title "Team meeting" over the
// metadata "Alex | [R1]": it is cut at the first separator only.
const SUMMARY_SEPARATOR = ' | ';

// The events column grows with its events up to this share of the monitor's height, then
// scrolls.
const EVENTS_MAX_HEIGHT_RATIO = 0.7;

// Under the calendar: the selected day's number of events, as plain text.
const SUMMARY_COUNT_ONE = 'event';
const SUMMARY_COUNT_MANY = 'events';

// Under the count: back to today's date and month.
const TODAY_BUTTON_LABEL = 'Today';

// One marker under a day that has events, drawn in the text colour of the theme.
const DAY_MARKER_TEXT = '•';
const DAY_MARKER_MAX = 1;

// Class names of stylesheet.css. They replace the stock classes whose sizes the themes set.
const STYLE = {
    popup: 'calendar-bgi-popup',
    header: 'calendar-bgi-header',
    headerDate: 'calendar-bgi-header-date',
    headerTime: 'calendar-bgi-header-time',
    clock: 'calendar-bgi-clock',
    clockDivided: 'calendar-bgi-clock-divided',
    clockTime: 'calendar-bgi-clock-time',
    clockSuffix: 'calendar-bgi-clock-suffix',
    layout: 'calendar-bgi-layout',
    calendarColumn: 'calendar-bgi-calendar-column',
    calendarPanel: 'calendar-bgi-calendar-panel',
    daySummary: 'calendar-bgi-day-summary',
    daySummaryCount: 'calendar-bgi-day-summary-count',
    todayButton: 'calendar-bgi-today-button',
    footer: 'calendar-bgi-footer',
    settingsButton: 'calendar-bgi-settings-button',
    monthRow: 'calendar-bgi-month-row',
    monthLabel: 'calendar-bgi-month-label',
    dayHeading: 'calendar-bgi-day-heading',
    day: 'calendar-bgi-day',
    dayMarked: 'calendar-bgi-day-marked',
    dayToday: 'calendar-bgi-day-today',
    daySelected: 'calendar-bgi-day-selected',
    dayOutside: 'calendar-bgi-day-outside',
    dayWeekend: 'calendar-bgi-day-weekend',
    weekNumber: 'calendar-bgi-week-number',
    dayMarkerBox: 'calendar-bgi-day-marker-box',
    dayMarker: 'calendar-bgi-day-marker',
    events: 'calendar-bgi-events',
    eventList: 'calendar-bgi-event-list',
    eventRow: 'calendar-bgi-event-row',
    eventAccent: 'calendar-bgi-event-accent',
    eventTimeBlock: 'calendar-bgi-event-time-block',
    eventContent: 'calendar-bgi-event-content',
    eventMeta: 'calendar-bgi-event-meta',
    eventCountdown: 'calendar-bgi-event-countdown',
    eventTitle: 'calendar-bgi-event-title',
    eventTime: 'calendar-bgi-event-time',
};
