const Constants = require('./constants');

// NetworkManager VPN and WireGuard profiles, without the ones NordVPN creates itself (the
// NordVPN tile shows those). @profiles: [{ uuid, id, type, iface, timestamp }].
function vpnProfiles(profiles) {
    return profiles.filter(profile => Constants.VPN_CONNECTION_TYPES.includes(profile.type)
        && !Constants.NORDVPN_INTERFACES.includes(profile.iface)
        && !Constants.NORDVPN_INTERFACES.includes(profile.id));
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
