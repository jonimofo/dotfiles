// Text of the clock row above the search: "Tue 17 Nov. 2026   ·   09:22". Pure: no Cinnamon
// import, so the tests load it as it is.
// The date is worded as the header of the calendar@bgi applet, in English whatever the
// locale. An extension cannot load an applet's files: these tables repeat that applet's, and
// scripts/cinnamon-scale-test.js checks that both give the same date.

// Sunday first, as GLib's day of the week modulo 7.
const WEEKDAY_ABBREVIATIONS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
    'September', 'October', 'November', 'December'];
const MONTH_ABBREVIATIONS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// After a shortened month ("Nov."), not after a full name ("May").
const ABBREVIATION_DOT = '.';
const WORD_SEPARATOR = ' ';
// Between the date and the time.
const CLOCK_SEPARATOR = '   ·   ';
// "09:22" in 24-hour form, "9:22 AM" in 12-hour form.
const TIME_SEPARATOR = ':';
const TWO_DIGITS = 2;
const PAD_DIGIT = '0';
const HOURS_IN_HALF_DAY = 12;
const AM_SUFFIX = 'AM';
const PM_SUFFIX = 'PM';
const MS_IN_SECOND = 1000;
const MS_IN_MINUTE = 60 * MS_IN_SECOND;
const MICROSECONDS_IN_MS = 1000;

// The parts of @datetime (a GLib.DateTime) the row shows: weekday 0 (Sunday) to 6, day,
// month 1 to 12, year, hour 0 to 23, minute.
function clockPartsOf(datetime) {
    return {
        weekday: datetime.get_day_of_week() % 7,
        day: datetime.get_day_of_month(),
        month: datetime.get_month(),
        year: datetime.get_year(),
        hour: datetime.get_hour(),
        minute: datetime.get_minute(),
    };
}

function monthWithDot(month) {
    const abbreviation = MONTH_ABBREVIATIONS[month - 1];
    const shortened = MONTH_NAMES[month - 1].length > abbreviation.length;
    return shortened ? `${abbreviation}${ABBREVIATION_DOT}` : abbreviation;
}

// "Tue 17 Nov. 2026".
function formatDate(parts) {
    return [WEEKDAY_ABBREVIATIONS[parts.weekday], parts.day, monthWithDot(parts.month), parts.year]
        .join(WORD_SEPARATOR);
}

function twoDigits(number) {
    return String(number).padStart(TWO_DIGITS, PAD_DIGIT);
}

// "09:22" with @use24h, "9:22 AM" without.
function formatTime(parts, use24h) {
    const minute = twoDigits(parts.minute);
    if (use24h)
        return [twoDigits(parts.hour), minute].join(TIME_SEPARATOR);

    const hour = parts.hour % HOURS_IN_HALF_DAY || HOURS_IN_HALF_DAY;
    const suffix = parts.hour < HOURS_IN_HALF_DAY ? AM_SUFFIX : PM_SUFFIX;
    return `${[hour, minute].join(TIME_SEPARATOR)}${WORD_SEPARATOR}${suffix}`;
}

function formatClock(parts, use24h) {
    return [formatDate(parts), formatTime(parts, use24h)].join(CLOCK_SEPARATOR);
}

// Delay from @second and @microsecond past the minute to the start of the next minute.
function msUntilNextMinute(second, microsecond) {
    const elapsed = second * MS_IN_SECOND + Math.floor(microsecond / MICROSECONDS_IN_MS);
    return MS_IN_MINUTE - elapsed;
}
