// The Today button of calendar@bgi.

// Active unless @selected (a Date) is @today and the shown month (@shownMonth, any Date in
// it) is today's month: then the button has nothing to do.
function todayButtonActive(selected, shownMonth, today) {
    const sameDay = selected.getFullYear() === today.getFullYear() &&
        selected.getMonth() === today.getMonth() && selected.getDate() === today.getDate();
    const sameMonth = shownMonth.getFullYear() === today.getFullYear() &&
        shownMonth.getMonth() === today.getMonth();
    return !(sameDay && sameMonth);
}
