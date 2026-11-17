const Constants = require('./constants');

// The Charge tile's logic, from plain data. States: 'limit' (charging stops at
// Constants.CHARGE_LIMIT_END) and 'full'.

const LIMIT = 'limit';
const FULL = 'full';

// The active entry of a charge_types text ("Trickle Fast Standard [Adaptive] Custom"), or
// null when none is marked.
function activeChargeType(text) {
    if (typeof text !== 'string')
        return null;
    const match = text.match(/\[([A-Za-z]+)\]/);
    return match ? match[1] : null;
}

// 'limit' when the active charge type is the limit mode and the end threshold its value;
// 'full' for anything else read; null when a file could not be read.
function chargeState(typesText, endText) {
    if (typeof typesText !== 'string' || typeof endText !== 'string')
        return null;
    const end = endText.trim();
    const limited = activeChargeType(typesText) === Constants.CHARGE_LIMIT_MODE
        && /^[0-9]+$/.test(end) && Number(end) === Constants.CHARGE_LIMIT_END;
    return limited ? LIMIT : FULL;
}

// What the tile shows: checked while full charge is on, the label of the state.
function tileView(state) {
    return { checked: state === FULL, label: state === FULL ? Constants.CHARGE_LABELS.full : Constants.CHARGE_LABELS.limit };
}

// The state a click asks for.
function toggledState(state) {
    return state === FULL ? LIMIT : FULL;
}

// The command a change to @state runs: sudo -n, the helper and its fixed word.
function helperArgv(state) {
    return [...Constants.CHARGE_SUDO, Constants.CHARGE_HELPER, Constants.CHARGE_HELPER_WORDS[state]];
}

// The automatic return to the limit. In the full state, the battery seen full while on AC
// is remembered; the next reading on battery then fires the limit once and forgets it. In
// the limit state nothing is remembered and nothing fires. @onAc: true or false (an unknown
// power source is not passed here). Returns { seenFull, fire }.
function autoReturn(state, seenFull, onAc, batteryFull) {
    if (state !== FULL)
        return { seenFull: false, fire: false };
    const seen = seenFull || (onAc && batteryFull);
    if (seen && !onAc)
        return { seenFull: false, fire: true };
    return { seenFull: seen, fire: false };
}
