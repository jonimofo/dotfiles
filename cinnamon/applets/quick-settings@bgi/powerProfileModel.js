const Constants = require('./constants');

// What the power profile tile shows and does, from plain data. @profiles: the profile names
// the daemon reports, in its order; @active: the active one.

function label(profile) {
    return Constants.POWER_PROFILE_LABELS[profile] || profile;
}

function iconName(profile) {
    return `${Constants.POWER_PROFILE_ICON_PREFIX}${profile}${Constants.SYMBOLIC_SUFFIX}`;
}

// Highlighted when the profile is not the balanced one.
function isHighlighted(active) {
    return active !== null && active !== Constants.POWER_PROFILE_BALANCED;
}

// A click: back to balanced from any other profile; from balanced, to the last other profile
// used, or power saver the first time.
function toggleTarget(active, lastOther, profiles) {
    if (active !== Constants.POWER_PROFILE_BALANCED)
        return Constants.POWER_PROFILE_BALANCED;
    if (lastOther && profiles.includes(lastOther))
        return lastOther;
    return profiles.includes(Constants.POWER_PROFILE_FIRST_OTHER) ? Constants.POWER_PROFILE_FIRST_OTHER : null;
}
