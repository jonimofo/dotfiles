const Constants = require('./constants');

// The battery shown in the header, from cinnamon-settings-daemon's GetDevices() tuples
// (device_id, vendor, model, kind, icon, percentage, state, battery_level, seconds), picked
// as the stock power applet does: the primary device when there is one, else the first
// battery whose state is known. Returns { percent, iconString } or null without a battery.
// @kinds: { battery, unknownState } from UPowerGlib (passed in, so this file has no import).
function pickBattery(devices, primaryId, kinds) {
    const batteries = devices.filter(([id, , , kind, , , state]) =>
        kind === kinds.battery && state !== kinds.unknownState);
    const device = batteries.find(([id]) => id === primaryId) || batteries[0];
    if (!device)
        return null;
    const [, , , , iconString, percentage] = device;
    return { percent: Math.round(percentage), iconString };
}

function label(percent) {
    return `${percent}${Constants.BATTERY_LABEL_SUFFIX}`;
}
