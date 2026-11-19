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

// [row, column] of the @index-th day of the grid, columns counted from the week's first day.
function cellPosition(index) {
    return [Constants.GRID_FIRST_ROW + Math.floor(index / Constants.DAYS_IN_WEEK), index % Constants.DAYS_IN_WEEK];
}

// The GRID_DAYS dates the grid shows for @selected (a Date): from the first day of the week
// holding the 1st of its month, at GRID_DATE_HOUR, one day apart.
function gridDates(selected, weekStart) {
    const first = new Date(selected);
    first.setDate(1);
    first.setHours(Constants.GRID_DATE_HOUR, 0, 0, 0);
    first.setTime(first.getTime() - weekdayColumn(first.getDay(), weekStart) * Constants.MS_IN_DAY);
    const dates = [];
    for (let i = 0; i < Constants.GRID_DAYS; i++)
        dates.push(new Date(first.getTime() + i * Constants.MS_IN_DAY));
    return dates;
}

// [previous, next] icon names of the month arrows; swapped for a right-to-left desktop, where
// the previous month is on the right.
function monthArrowIcons(rtl) {
    const icons = Constants.MONTH_ARROW_ICONS;
    return rtl ? [icons.next, icons.previous] : [icons.previous, icons.next];
}
