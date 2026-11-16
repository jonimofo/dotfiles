const Constants = require('./constants');

// Signal icon for a strength in percent, with the stock network applet's thresholds.
function signalIconName(strength) {
    const level = Constants.WIFI_SIGNAL_LEVELS.find(candidate => strength > candidate.above);
    return `${Constants.WIFI_SIGNAL_ICON_PREFIX}${level.name}${Constants.SYMBOLIC_SUFFIX}`;
}

// @accessPoints: [{ ssid, strength, secure, ... }]. One entry per SSID (its strongest
// access point), strongest first, at most @max entries, hidden networks left out. The
// network named @activeSsid is marked and always kept in the list.
function buildNetworkList(accessPoints, activeSsid, max) {
    const bySsid = new Map();
    for (const accessPoint of accessPoints) {
        if (!accessPoint.ssid)
            continue;
        const known = bySsid.get(accessPoint.ssid);
        if (!known || accessPoint.strength > known.strength)
            bySsid.set(accessPoint.ssid, accessPoint);
    }
    const sorted = [...bySsid.values()].sort((one, two) => two.strength - one.strength);
    let list = sorted.slice(0, max);
    const active = sorted.find(network => network.ssid === activeSsid);
    if (active && !list.includes(active))
        list = [...list.slice(0, max - 1), active];
    return list.map(network => ({ ...network, active: network.ssid === activeSsid }));
}
