// The day summary card of calendar@bgi: the selected day's number of events.
const Constants = require('./constants');

// "1 event", "16 events".
function formatEventCount(count) {
    const word = count === 1 ? Constants.SUMMARY_COUNT_ONE : Constants.SUMMARY_COUNT_MANY;
    return `${count}${Constants.WORD_SEPARATOR}${word}`;
}
