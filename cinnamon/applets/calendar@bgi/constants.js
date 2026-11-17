// Every label, format, class name and settings key calendar@bgi adds to the stock applet.

const UUID = 'calendar@bgi';
const LOG_PREFIX = UUID;

// The second time zone, shown on the panel and in the calendar header independently; the
// zone id and its label are shared. As for the Appearance settings below, label and default
// repeat the hand-written settings-schema.json so the test can check the two agree.
const SECOND_ZONE_SWITCHES = {
    // The first key of the second zone, from when one switch governed both places: its saved
    // value keeps its meaning on the panel.
    panel: { key: 'show-second-zone', label: 'Show on the panel', default: true },
    header: { key: 'show-second-zone-header', label: 'Show in the calendar header', default: true },
};
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
// Elements shown or hidden, in the order of the Shown elements section. Week numbers and
// events are stock keys.
const ELEMENT_SWITCHES = {
    events: { key: 'show-events', label: 'Calendar events', default: true },
    headerClocks: { key: 'show-header-clocks', label: 'Clocks in the header', default: true },
    eventMeta: { key: 'show-event-meta', label: 'Metadata line', default: true },
    nowLine: { key: 'show-now-line', label: 'Now line and event states', default: true },
    dayMarker: { key: 'show-day-marker', label: 'Dot under days', default: true },
    // The key keeps its first name (a summary card, later removed): saved settings use it.
    eventCount: { key: 'show-day-summary', label: 'Event count', default: true },
    todayButton: { key: 'show-today-button', label: 'Today button', default: true },
    weekNumbers: { key: 'show-week-numbers', label: 'Week numbers', default: false },
};
// Configure dialog tabs, in order, with their section titles.
const SETTINGS_PAGES = [
    { title: 'Appearance', sections: ['Text size', 'Shown elements'] },
    { title: 'Panel', sections: ['Date', 'Second time zone'] },
];
// Font size of the event list at 100%: the event texts are in em of it, so 100% gives the
// px sizes of the validated design (time 13px, title 14px, metadata 12px).
const EVENTS_BASE_FONT_PX = 12;

// Panel text: "Mon 16 Nov · 15:52 · VN 21:52".
const PANEL_SEPARATOR = ' · ';
// Between a time and its city or label: "15:52 Paris", "VN 21:52".
const WORD_SEPARATOR = ' ';

// Dates are worded in English whatever LC_TIME says: "Mon 16 Nov. 2026" in the header,
// "Mon 16 Nov" on the panel, "Nov. 2026" over the month. Sunday first, as Date.getDay().
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEKDAY_ABBREVIATIONS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
    'September', 'October', 'November', 'December'];
const MONTH_ABBREVIATIONS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// After an abbreviated month in the header ("Nov."), not after a full name ("May").
const ABBREVIATION_DOT = '.';

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

// In the middle of the header band: the selected day's number of events.
const EVENT_COUNT_ONE = 'event';
const EVENT_COUNT_MANY = 'events';

// Desktop settings the applet reads (org.cinnamon.desktop.interface).
const DESKTOP_24H_KEY = 'clock-use-24h';
const DESKTOP_SECONDS_KEY = 'clock-show-seconds';

// An opening within this time of the last full refresh of the events skips the next one: the
// calendar server (it exits 20 s after the last request) still sends every change itself.
const FRESH_FETCH_MS = 15000;

// A changed zone id is resolved this long after the last keystroke of the settings field, so
// a half-typed id is not logged as unknown.
const ZONE_ID_DEBOUNCE_MS = 500;

// Every phrase the applet shows, in English whatever the locale: the stock applet's
// gettext strings are replaced by these.
const TEXT = {
    today: 'Today',
    backToToday: 'Back to today',
    previousMonth: 'Previous month',
    nextMonth: 'Next month',
    noEvents: 'No Events',
    allDay: 'All day',
    settings: 'Date and Time Settings',
};
// Month row arrows, symbolic icons found in Adwaita and in the Dracula icon theme; the -rtl
// variants are not used, the two names swap for a right-to-left desktop.
const MONTH_ARROW_ICONS = { previous: 'pan-start-symbolic', next: 'pan-end-symbolic' };

// States of the events of today, and the now line between the started and upcoming ones.
const EVENT_STATES = { past: 'past', ongoing: 'ongoing', upcoming: 'upcoming' };
const MS_IN_MINUTE = 60 * 1000;

// The month grid: always six weeks (stock), under the month row and the day headings.
const DAYS_IN_WEEK = 7;
const GRID_WEEKS = 6;
const GRID_DAYS = DAYS_IN_WEEK * GRID_WEEKS;
const GRID_FIRST_ROW = 2;
const MS_IN_DAY = 24 * 60 * 60 * 1000;
// Hour of the day the grid dates are set to, away from midnight and DST changes (stock).
const GRID_DATE_HOUR = 12;

// One marker under a day that has events, in the day's palette text colour.
const DAY_MARKER_TEXT = '•';
const DAY_MARKER_MAX = 1;

// Class names of stylesheet.css. They replace the stock classes whose sizes the themes set.
const STYLE = {
    popup: 'calendar-bgi-popup',
    header: 'calendar-bgi-header',
    headerDate: 'calendar-bgi-header-date',
    headerCount: 'calendar-bgi-header-count',
    headerTime: 'calendar-bgi-header-time',
    clock: 'calendar-bgi-clock',
    clockDivided: 'calendar-bgi-clock-divided',
    clockTime: 'calendar-bgi-clock-time',
    clockSuffix: 'calendar-bgi-clock-suffix',
    layout: 'calendar-bgi-layout',
    calendarColumn: 'calendar-bgi-calendar-column',
    calendarPanel: 'calendar-bgi-calendar-panel',
    todayButton: 'calendar-bgi-today-button',
    footer: 'calendar-bgi-footer',
    settingsButton: 'calendar-bgi-settings-button',
    monthRow: 'calendar-bgi-month-row',
    monthLabel: 'calendar-bgi-month-label',
    monthArrow: 'calendar-bgi-month-arrow',
    monthArrowIcon: 'calendar-bgi-month-arrow-icon',
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
    eventPast: 'calendar-bgi-event-past',
    eventOngoing: 'calendar-bgi-event-ongoing',
    nowLine: 'calendar-bgi-now-line',
    nowLineTime: 'calendar-bgi-now-line-time',
    nowLineRule: 'calendar-bgi-now-line-rule',
    eventTitle: 'calendar-bgi-event-title',
    eventTime: 'calendar-bgi-event-time',
};

// Style class of an event card per state; upcoming events keep their look.
const EVENT_STATE_STYLES = { past: STYLE.eventPast, ongoing: STYLE.eventOngoing };
