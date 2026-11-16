const Constants = require('./constants');

// NetworkManager VPN and WireGuard profiles, without the ones NordVPN creates itself (the
// NordVPN tile shows those). @profiles: [{ uuid, id, type, iface, timestamp }].
function vpnProfiles(profiles) {
    return profiles.filter(profile => Constants.VPN_CONNECTION_TYPES.includes(profile.type)
        && !Constants.NORDVPN_INTERFACES.includes(profile.iface)
        && !Constants.NORDVPN_INTERFACES.includes(profile.id));
}

// Whether NordVPN's own NetworkManager link (NordLynx) is among the active connections,
// from their ids and interface names: [{ id, iface }]. It changes when NordVPN connects or
// disconnects, from the applet or from anywhere else.
function nordvpnLinkUp(activeConnections) {
    return activeConnections.some(connection => Constants.NORDVPN_INTERFACES.includes(connection.id)
        || Constants.NORDVPN_INTERFACES.includes(connection.iface));
}

// @text cut to Constants.PANEL_VPN_NAME_MAX characters, the last one the ellipsis.
function shortName(text) {
    const characters = [...text];
    if (characters.length <= Constants.PANEL_VPN_NAME_MAX)
        return text;
    return `${characters.slice(0, Constants.PANEL_VPN_NAME_MAX - 1).join('')}${Constants.PANEL_VPN_NAME_ELLIPSIS}`;
}

// The text after the VPN panel icon. @nordvpnCountry: NordVPN's country while connected,
// else null; @profileName: the active NetworkManager VPN profile's name, else null.
// Returns null when neither is up (the icon hides).
function panelName(nordvpnCountry, profileName) {
    const names = [nordvpnCountry, profileName].filter(name => name);
    if (names.length === 0)
        return null;
    return names.map(shortName).join(Constants.PANEL_VPN_NAME_SEPARATOR);
}

// @activeUuids: uuids of the VPN connections that are up. The toggle target is the active
// profile, else the only one, else the last used one (highest timestamp).
function summarize(profiles, activeUuids) {
    const listed = vpnProfiles(profiles).sort((one, two) => one.id.localeCompare(two.id));
    const active = listed.find(profile => activeUuids.includes(profile.uuid)) || null;
    const lastUsed = listed.reduce((best, profile) => (!best || profile.timestamp > best.timestamp ? profile : best), null);
    const named = active || (listed.length === 1 ? listed[0] : null);
    return {
        available: listed.length > 0,
        profiles: listed.map(profile => ({ ...profile, active: profile === active })),
        active,
        target: active || lastUsed,
        label: named ? `${Constants.VPN_TILE_PREFIX} ${named.id}` : Constants.VPN_TILE_PREFIX,
    };
}
