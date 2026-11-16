// Appearance settings of calendar@bgi turned into inline styles. St stylesheets have no
// variables, so the sizes the user sets are applied from code on three containers; the
// stylesheet sizes their contents in em or % of them.
const Constants = require('./constants');

// @value of a setting described by @spec ({default, min, max, step}): the default when it is
// not a number, else clamped to the range and rounded to the step.
function clampSetting(value, spec) {
    const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
    if (typeof number !== 'number' || !Number.isFinite(number))
        return spec.default;
    const clamped = Math.min(spec.max, Math.max(spec.min, number));
    return spec.min + Math.round((clamped - spec.min) / spec.step) * spec.step;
}

// Days and header band: a percentage of the theme's font, "font-size: 100%;" at the default.
function percentFontStyle(value, spec) {
    return `font-size: ${clampSetting(value, spec)}%;`;
}

// Event list: a px base the event texts are in em of, and the gap between two rows.
function eventListStyle(scaleValue, gapValue) {
    const scale = clampSetting(scaleValue, Constants.TEXT_SCALES.events);
    const fontPx = Constants.EVENTS_BASE_FONT_PX * scale / 100;
    const gap = clampSetting(gapValue, Constants.EVENT_GAP);
    return `font-size: ${fontPx}px; spacing: ${gap}px;`;
}
