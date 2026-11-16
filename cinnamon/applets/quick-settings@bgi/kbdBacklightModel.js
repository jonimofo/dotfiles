const Constants = require('./constants');

// The level a click goes to: one up, back to 0 after @max.
function nextLevel(level, max) {
    return level >= max ? 0 : level + 1;
}

// The word for @level out of @max, as Constants.KBD_LEVEL_WORDS describes.
function levelWord(level, max) {
    const words = Constants.KBD_LEVEL_WORDS;
    if (level <= 0)
        return words.off;
    if (max === 1)
        return words.on;
    if (level >= max)
        return words.high;
    return level * 2 <= max ? words.low : words.medium;
}

// "Keyboard Low": the tile's own label, then the level's word.
function tileLabel(defaultLabel, level, max) {
    return `${defaultLabel} ${levelWord(level, max)}`;
}
