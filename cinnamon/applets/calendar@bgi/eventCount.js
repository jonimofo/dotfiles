// The event count in the middle of calendar@bgi's header band.
const Constants = require('./constants');

// "1 event", "16 events".
function formatEventCount(count) {
    const word = count === 1 ? Constants.EVENT_COUNT_ONE : Constants.EVENT_COUNT_MANY;
    return `${count}${Constants.WORD_SEPARATOR}${word}`;
}

// Shown with its switch, and only for a day with events.
function headerCountVisible(show, count) {
    return Boolean(show) && count > 0;
}
