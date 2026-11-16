// The day summary card of calendar@bgi: number of events and the range from the first start
// to the last end. Never a duration: overlapping events make the range no measure of time.
const Constants = require('./constants');

// Minutes from @dayStart to @datetime (both GLib.DateTime): negative before the day.
function minutesFrom(dayStart, datetime) {
    return Math.round(datetime.difference(dayStart) / 60000000);
}

// @events: [{allDay, start, end}], start and end in minutes from the day's midnight.
// Returns {count, range: {start, end} | null}: the range covers the timed events only, cut to
// the day; null when every event lasts all day.
function summariseDay(events) {
    const timed = events.filter(event => !event.allDay);
    if (timed.length === 0)
        return { count: events.length, range: null };
    const start = Math.max(0, Math.min(...timed.map(event => event.start)));
    const end = Math.min(Constants.MINUTES_IN_DAY, Math.max(...timed.map(event => event.end)));
    return { count: events.length, range: { start, end } };
}

// "1 activité", "16 activités".
function formatEventCount(count) {
    const word = count === 1 ? Constants.SUMMARY_COUNT_ONE : Constants.SUMMARY_COUNT_MANY;
    return `${count}${Constants.WORD_SEPARATOR}${word}`;
}

// "02:00 – 11:00".
function formatRange(startText, endText) {
    return `${startText}${Constants.EVENT_TIME_SEPARATOR}${endText}`;
}

function summaryHeading(isToday, longDate) {
    return isToday ? Constants.SUMMARY_TODAY_HEADING : longDate;
}
