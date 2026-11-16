// The countdown before an event of today, in calendar@bgi's English wording.
const Constants = require('./constants');

function withNumber(template, number) {
    return template.replace(Constants.NUMBER_PLACEHOLDER, String(number));
}

// "In 1 hour", "In 2 hours".
function inHours(hours) {
    const forms = Constants.TEXT.inHours;
    return withNumber(hours === 1 ? forms.one : forms.other, hours);
}

// The countdown text of an event @minutes away, starting at hour @startHour (0 to 23).
function countdownFor(minutes, startHour) {
    const limits = Constants.COUNTDOWN;
    if (minutes < limits.imminentMinutes)
        return Constants.TEXT.startingSoon;
    if (minutes < limits.soonMinutes)
        return withNumber(Constants.TEXT.startingInMinutes, minutes);
    const hours = Math.floor(minutes / 60);
    if (hours > limits.laterHours)
        return startHour > limits.eveningHour ? Constants.TEXT.thisEvening : Constants.TEXT.startingLaterToday;
    return inHours(hours);
}
