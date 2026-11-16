// Day cells and columns of calendar@bgi's month grid.
const Constants = require('./constants');

// @state: {today, selected, outside (not in the shown month), weekend, marked (event markers
// shown: room is kept under the digit)}. Today and selected add up: a selected today has both
// the fill and the outline.
function dayStyleClass(state) {
    const classes = [Constants.STYLE.day];
    if (state.marked)
        classes.push(Constants.STYLE.dayMarked);
    if (state.weekend)
        classes.push(Constants.STYLE.dayWeekend);
    if (state.outside)
        classes.push(Constants.STYLE.dayOutside);
    if (state.today)
        classes.push(Constants.STYLE.dayToday);
    if (state.selected)
        classes.push(Constants.STYLE.daySelected);
    return classes.join(' ');
}

// Column, 0 to 6, of a weekday (@day as Date.getDay(), Sunday 0) in a week starting on
// @weekStart (same numbering).
function weekdayColumn(day, weekStart) {
    return (7 + day - weekStart) % 7;
}
