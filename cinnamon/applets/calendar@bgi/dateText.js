// Panel and popup texts of calendar@bgi. Dates are worded in English from the tables of
// constants.js, not from the locale.
const Constants = require('./constants');

// The date parts of @datetime (a GLib.DateTime): weekday 0 (Sunday) to 6, day, month 1 to 12,
// year.
function datePartsOf(datetime) {
    return {
        weekday: datetime.get_day_of_week() % 7,
        day: datetime.get_day_of_month(),
        month: datetime.get_month(),
        year: datetime.get_year(),
    };
}

// "Nov." for November, "May" for May: the dot marks a shortened name.
function monthWithDot(month) {
    const abbreviation = Constants.MONTH_ABBREVIATIONS[month - 1];
    const shortened = Constants.MONTH_NAMES[month - 1].length > abbreviation.length;
    return shortened ? `${abbreviation}${Constants.ABBREVIATION_DOT}` : abbreviation;
}

// Header: "Mon 16 Nov. 2026".
function formatHeaderDate(parts) {
    return [Constants.WEEKDAY_ABBREVIATIONS[parts.weekday], parts.day, monthWithDot(parts.month), parts.year]
        .join(Constants.WORD_SEPARATOR);
}

// Panel: "Mon 16 Nov".
function formatPanelDate(parts) {
    return [Constants.WEEKDAY_ABBREVIATIONS[parts.weekday], parts.day, Constants.MONTH_ABBREVIATIONS[parts.month - 1]]
        .join(Constants.WORD_SEPARATOR);
}

// Event spans over several days: "16 Nov. 2026".
function formatDayMonthYear(parts) {
    return [parts.day, monthWithDot(parts.month), parts.year].join(Constants.WORD_SEPARATOR);
}

// Event spans within a few days: "Wednesday".
function weekdayName(parts) {
    return Constants.WEEKDAY_NAMES[parts.weekday];
}

// The same, from a GLib.DateTime.
function headerDateOf(datetime) {
    return formatHeaderDate(datePartsOf(datetime));
}

function panelDateOf(datetime) {
    return formatPanelDate(datePartsOf(datetime));
}

function dayMonthYearOf(datetime) {
    return formatDayMonthYear(datePartsOf(datetime));
}

function weekdayNameOf(datetime) {
    return weekdayName(datePartsOf(datetime));
}

// Over the month: "November 2026". @month is 1 to 12.
function formatMonthHeading(month, year) {
    return [Constants.MONTH_NAMES[month - 1], year].join(Constants.WORD_SEPARATOR);
}

// {title, meta} of an event summary, cut at its first SUMMARY_SEPARATOR. Without one, the
// summary is the title and meta is empty; a summary starting with one keeps its metadata as
// the title.
function splitSummary(summary) {
    const text = summary || '';
    const at = text.indexOf(Constants.SUMMARY_SEPARATOR);
    if (at === -1)
        return { title: text.trim(), meta: '' };
    const title = text.slice(0, at).trim();
    const meta = text.slice(at + Constants.SUMMARY_SEPARATOR.length).trim();
    return title === '' ? { title: meta, meta: '' } : { title, meta };
}

function timeFormatFor(use24h, showSeconds) {
    if (use24h)
        return showSeconds ? Constants.TIME_FORMATS.h24Seconds : Constants.TIME_FORMATS.h24;
    return showSeconds ? Constants.TIME_FORMATS.h12Seconds : Constants.TIME_FORMATS.h12;
}

function joinNonEmpty(parts, separator) {
    return parts.filter(part => part !== '' && part !== null).join(separator);
}

// "VN 21:52"; the time alone without a label.
function formatSecondTime(second) {
    return joinNonEmpty([second.label, second.time], Constants.WORD_SEPARATOR);
}

// "Mon 16 Nov · 15:52 · VN 21:52". @second is {label, time}, or null when hidden.
function formatPanelText(dateText, localTime, second) {
    const parts = [dateText, localTime];
    if (second)
        parts.push(formatSecondTime(second));
    return joinNonEmpty(parts, Constants.PANEL_SEPARATOR);
}

// "Europe/Paris" -> "Paris", "America/Argentina/Buenos_Aires" -> "Buenos Aires",
// "UTC" -> "UTC"; a path such as "/etc/localtime" or an empty id -> "".
function cityFromZoneId(zoneId) {
    if (!zoneId || Constants.ZONE_ID_PATH_PREFIXES.some(prefix => zoneId.startsWith(prefix)))
        return '';
    const parts = zoneId.split(Constants.ZONE_ID_PART_SEPARATOR);
    return parts[parts.length - 1].replace(Constants.ZONE_ID_SPACE, Constants.WORD_SEPARATOR);
}

// The header clocks, left to right: [{time, suffix}], the local one ("15:52", "Paris"),
// then the second zone's ("21:52", "VN") unless @second is null.
function headerClocks(localTime, city, second) {
    const clocks = [{ time: localTime, suffix: city }];
    if (second)
        clocks.push({ time: second.time, suffix: second.label });
    return clocks;
}
