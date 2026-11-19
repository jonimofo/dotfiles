// Event states and the now line of calendar@bgi's event list, shown for today only.
const Constants = require('./constants');

// 'past', 'ongoing' or 'upcoming' for an event from @startMs to @endMs at @nowMs (all in
// milliseconds). An all-day event is never past during its day and never outlined: it reads
// as upcoming.
function eventState(startMs, endMs, allDay, nowMs) {
    if (allDay)
        return Constants.EVENT_STATES.upcoming;
    if (endMs <= nowMs)
        return Constants.EVENT_STATES.past;
    if (startMs <= nowMs)
        return Constants.EVENT_STATES.ongoing;
    return Constants.EVENT_STATES.upcoming;
}

// Where the now line goes among the events, in list order: after the last one that has
// started (past or ongoing), so 0 when none has; null for an empty list (no line).
function nowLineIndex(states) {
    if (states.length === 0)
        return null;
    let index = 0;
    states.forEach((state, i) => {
        if (state !== Constants.EVENT_STATES.upcoming)
            index = i + 1;
    });
    return index;
}

// States and line exist only for today: @shown and @today as {year, month, day}.
function showsToday(shown, today) {
    return shown.year === today.year && shown.month === today.month && shown.day === today.day;
}

// The minute @nowMs falls in: the states and the line change at most once per minute.
function minuteOf(nowMs) {
    return Math.floor(nowMs / Constants.MS_IN_MINUTE);
}
