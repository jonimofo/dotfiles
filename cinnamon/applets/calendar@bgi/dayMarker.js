// The marker under a day of calendar@bgi: one for a day with events, whatever their number.
const Constants = require('./constants');

// @colorSet is the list of event colours of the day, or null when it has no events.
function dayMarkerCount(eventsEnabled, colorSet) {
    if (!eventsEnabled || colorSet === null || colorSet.length === 0)
        return 0;
    return Constants.DAY_MARKER_MAX;
}
