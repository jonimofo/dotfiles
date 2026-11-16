const Constants = require('./constants');

// @text cut to Constants.PANEL_NAME_MAX characters, the last one the ellipsis.
function shortName(text) {
    const characters = [...text];
    if (characters.length <= Constants.PANEL_NAME_MAX)
        return text;
    return `${characters.slice(0, Constants.PANEL_NAME_MAX - 1).join('')}${Constants.PANEL_NAME_ELLIPSIS}`;
}

// The first of @names, cut, then " +N" for the N others; null for none.
function countedName(names) {
    if (names.length === 0)
        return null;
    const others = names.length - 1;
    return others > 0 ? `${shortName(names[0])}${Constants.PANEL_NAME_MORE_PREFIX}${others}` : shortName(names[0]);
}
