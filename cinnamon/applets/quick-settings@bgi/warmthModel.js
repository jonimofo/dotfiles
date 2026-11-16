const Constants = require('./constants');

const RANGE = Constants.WARMTH_MAX_KELVIN - Constants.WARMTH_MIN_KELVIN;

function clampKelvin(kelvin) {
    return Math.min(Constants.WARMTH_MAX_KELVIN, Math.max(Constants.WARMTH_MIN_KELVIN, kelvin));
}

// The Warmth slider position, 0 to 1, for @kelvin: the handle goes right as it gets warmer.
function kelvinToFraction(kelvin) {
    return (Constants.WARMTH_MAX_KELVIN - clampKelvin(kelvin)) / RANGE;
}

// The temperature for slider position @fraction, on the step of Cinnamon's Night Light page.
function fractionToKelvin(fraction) {
    const kelvin = Constants.WARMTH_MAX_KELVIN - fraction * RANGE;
    const steps = Math.round((kelvin - Constants.WARMTH_MIN_KELVIN) / Constants.WARMTH_STEP_KELVIN);
    return clampKelvin(Constants.WARMTH_MIN_KELVIN + steps * Constants.WARMTH_STEP_KELVIN);
}

function label(kelvin) {
    return `${kelvin}${Constants.WARMTH_UNIT_SUFFIX}`;
}
