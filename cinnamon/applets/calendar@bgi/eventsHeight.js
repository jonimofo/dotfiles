// Height cap of the events column of calendar@bgi.

const FLOAT_DIGITS = 6;

// The largest height, in style pixels, for a column that may take @ratio of a monitor
// @monitorHeight physical pixels tall; null (no cap) when the height is unknown or zero.
// Style pixels are physical pixels divided by the desktop's @uiScale.
function eventsMaxHeight(monitorHeight, ratio, uiScale) {
    if (!(monitorHeight > 0))
        return null;
    const scale = uiScale > 0 ? uiScale : 1;
    // 1440 * 0.7 is 1007.999... in floating point: round off that error before flooring.
    return Math.floor(Number((monitorHeight * ratio / scale).toFixed(FLOAT_DIGITS)));
}
