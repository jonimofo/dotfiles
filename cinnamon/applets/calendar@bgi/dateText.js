// Panel and popup texts of calendar@bgi, built from date parts already formatted by GLib.
const Constants = require('./constants');

function capitaliseFirst(text) {
    return text.charAt(0).toLocaleUpperCase() + text.slice(1);
}

// "lun." -> "Lun", "nov." -> "Nov", "mai" -> "Mai".
function tidyAbbreviation(word) {
    return capitaliseFirst(word.replace(Constants.ABBREVIATION_TRAILING, ''));
}

// The parts of @datetime (a GLib.DateTime) named by @formats (SHORT_ or LONG_DATE_FORMATS).
function datePartsOf(datetime, formats) {
    return {
        weekday: datetime.format(formats.weekday),
        day: datetime.get_day_of_month(),
        month: datetime.format(formats.month),
        year: datetime.get_year(),
    };
}

// "Lun 16 Nov".
function formatShortDate(parts) {
    return [tidyAbbreviation(parts.weekday), parts.day, tidyAbbreviation(parts.month)]
        .join(Constants.WORD_SEPARATOR);
}

// "Lundi 16 novembre 2026".
function formatLongDate(parts) {
    return capitaliseFirst([parts.weekday, parts.day, parts.month, parts.year]
        .join(Constants.WORD_SEPARATOR));
}

// "Novembre 2026", or "2026 Novembre" where GTK puts the year first.
function formatMonthHeading(month, year, monthFirst) {
    const parts = monthFirst ? [month, year] : [year, month];
    return capitaliseFirst(parts.join(Constants.WORD_SEPARATOR));
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

// "Lun 16 Nov · 15:52 · VN 21:52". @second is {label, time}, or null when hidden.
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

// "15:52 Paris  ·  21:52 VN". @second is {label, time}, or null when hidden.
function formatHeaderTimes(localTime, city, second) {
    const local = joinNonEmpty([localTime, city], Constants.WORD_SEPARATOR);
    if (!second)
        return local;
    const other = joinNonEmpty([second.time, second.label], Constants.WORD_SEPARATOR);
    return joinNonEmpty([local, other], Constants.HEADER_SEPARATOR);
}
