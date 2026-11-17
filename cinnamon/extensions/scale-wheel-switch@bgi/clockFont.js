// The clock row's font and colour, copied from the panel clock's label: the inline style
// built from what St resolved for that label. Pure: no Cinnamon import, so the tests load
// it as it is. Without a usable font, the row keeps the .scale-clock rule of stylesheet.css.

// Sizes outside this range are taken for a bad reading.
const MIN_FONT_SIZE_PX = 8;
const MAX_FONT_SIZE_PX = 48;
const FONT_SIZE_DECIMALS = 1;
// Pango sizes are in 1024ths of a point, or of a pixel when absolute.
const PANGO_SCALE = 1024;
const PX_PER_PT = 96 / 72;
// CSS weights St reads: 100 to 900, in steps of 100.
const MIN_FONT_WEIGHT = 100;
const MAX_FONT_WEIGHT = 900;
const FONT_WEIGHT_STEP = 100;
const MAX_COLOR_CHANNEL = 255;
const ALPHA_DECIMALS = 3;
// A family name is written between double quotes: characters that would end the string or
// the declaration are dropped.
const FAMILY_SEPARATOR = ',';
const UNSAFE_FAMILY_CHARACTERS = /["'\\;{}]/g;

function isFiniteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
}

// Pixel size from a Pango size, clamped; null when it is not a positive number.
function fontSizePx(pangoSize, isAbsolute) {
    if (!isFiniteNumber(pangoSize) || pangoSize <= 0)
        return null;

    const size = pangoSize / PANGO_SCALE * (isAbsolute ? 1 : PX_PER_PT);
    return Math.min(MAX_FONT_SIZE_PX, Math.max(MIN_FONT_SIZE_PX, size));
}

// Pango weight (100 to 1000) to the nearest CSS weight St reads; null when not a number.
function cssFontWeight(pangoWeight) {
    if (!isFiniteNumber(pangoWeight))
        return null;

    const rounded = Math.round(pangoWeight / FONT_WEIGHT_STEP) * FONT_WEIGHT_STEP;
    return Math.min(MAX_FONT_WEIGHT, Math.max(MIN_FONT_WEIGHT, rounded));
}

// "Noto Sans,Sans" -> "\"Noto Sans\", \"Sans\""; null when no name is left.
function cssFontFamily(family) {
    if (typeof family !== 'string')
        return null;

    const names = family.split(FAMILY_SEPARATOR)
        .map(name => name.replace(UNSAFE_FAMILY_CHARACTERS, '').trim())
        .filter(name => name !== '');
    return names.length > 0 ? names.map(name => `"${name}"`).join(', ') : null;
}

function isColorChannel(value) {
    return Number.isInteger(value) && value >= 0 && value <= MAX_COLOR_CHANNEL;
}

// {red, green, blue, alpha}, 0 to 255 each, to "rgba(248, 248, 242, 1)"; null when invalid.
function cssColor(color) {
    if (!color || ![color.red, color.green, color.blue, color.alpha].every(isColorChannel))
        return null;

    const alpha = Number((color.alpha / MAX_COLOR_CHANNEL).toFixed(ALPHA_DECIMALS));
    return `rgba(${color.red}, ${color.green}, ${color.blue}, ${alpha})`;
}

// @font is {family, size, isAbsolute, weight, color}, read from the panel clock's label.
// The inline style of the row, or null when a part is missing: the stylesheet rule then
// applies as a whole, never a mix of both looks.
function panelClockStyle(font) {
    if (!font)
        return null;

    const family = cssFontFamily(font.family);
    const size = fontSizePx(font.size, font.isAbsolute);
    const weight = cssFontWeight(font.weight);
    const color = cssColor(font.color);
    if (family === null || size === null || weight === null || color === null)
        return null;

    return `font-family: ${family}; font-size: ${size.toFixed(FONT_SIZE_DECIMALS)}px; ` +
        `font-weight: ${weight}; color: ${color};`;
}
