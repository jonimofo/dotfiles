const Constants = require('./constants');

// The battery shown in the header, from cinnamon-settings-daemon's GetDevices() tuples
// (device_id, vendor, model, kind, icon, percentage, state, battery_level, seconds), picked
// as the stock power applet does: the primary device when there is one, else the first
// battery whose state is known. Returns { percent, iconString, onAc, full } or null without
// a battery: onAc is true while charging, fully charged or waiting to charge, false while
// discharging, null when the state says neither; full is the fully charged state or 100 %.
// @kinds: { battery, unknownState, onAcStates, onBatteryStates, fullyCharged } from
// UPowerGlib (passed in, so this file has no import).
function pickBattery(devices, primaryId, kinds) {
    const batteries = devices.filter(([id, , , kind, , , state]) =>
        kind === kinds.battery && state !== kinds.unknownState);
    const device = batteries.find(([id]) => id === primaryId) || batteries[0];
    if (!device)
        return null;
    const [, , , , iconString, percentage, state] = device;
    const percent = Math.round(percentage);
    let onAc = null;
    if (kinds.onAcStates.includes(state))
        onAc = true;
    else if (kinds.onBatteryStates.includes(state))
        onAc = false;
    return { percent, iconString, onAc, full: state === kinds.fullyCharged || percent >= Constants.PERCENT };
}

function label(percent) {
    return `${percent}${Constants.PERCENT_SUFFIX}`;
}
