const Constants = require('./constants');

// Conversions between a slider position (0 to 1) and a Cvc stream volume, as the stock
// sound applet does them. @max is the volume at the slider's right end: the normal maximum,
// or 1.5 times it for an output with amplified volume allowed.

function sliderValue(volume, muted, max) {
    if (muted)
        return 0;
    return Math.min(Math.max(volume / max, 0), 1);
}

// Returns { volume, muted }. Near 0 mutes; near 100% snaps to exactly 100%.
function streamVolume(value, norm, max) {
    if (value < Constants.VOLUME_MUTE_THRESHOLD)
        return { volume: 0, muted: true };

    let volume = value * max;
    const halfStep = Constants.VOLUME_ADJUSTMENT_STEP / 2;
    if (volume > norm * (1 - halfStep) && volume < norm * (1 + halfStep))
        volume = norm;
    return { volume: Math.round(volume), muted: false };
}

// Level word for a slider position, as the stock sound applet's _volumeToIcon().
function levelName(value) {
    const levels = Constants.VOLUME_ICON_LEVELS;
    if (value < Constants.VOLUME_MUTE_THRESHOLD)
        return Constants.VOLUME_ICON_MUTED;
    return levels[Math.min(Math.floor(levels.length * value), levels.length - 1)];
}

// Icon for an output slider position: panel icon and Output row icon.
function outputIconName(value) {
    return `${Constants.VOLUME_ICON_PREFIX}${levelName(value)}${Constants.SYMBOLIC_SUFFIX}`;
}

// Icon for an input slider position: Input row icon.
function inputIconName(value) {
    return `${Constants.INPUT_ICON_PREFIX}${levelName(value)}${Constants.SYMBOLIC_SUFFIX}`;
}
