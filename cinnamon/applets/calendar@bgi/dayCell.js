// Style classes of one day cell of calendar@bgi.
const Constants = require('./constants');

// @state: {today, selected, outside (not in the shown month), weekend}. Today and selected
// add up: a selected today has both the fill and the outline.
function dayStyleClass(state) {
    const classes = [Constants.STYLE.day];
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
