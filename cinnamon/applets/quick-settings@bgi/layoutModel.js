// What the settings dialog stored, made safe to apply. The dialog's list widget also has
// Add, Remove and Edit buttons that cannot be hidden without hiding the moves, so a stored
// list can hold anything: unknown ids are ignored, a repeated id keeps its first row, and a
// declared element missing from the list is appended at the end, shown. Nothing can be lost
// for good, and an element added in a later version appears by itself.
//
// @stored: [{ show, id }] or anything else; @declared: [{ id }] in the default order.
// Returns [{ id, show }] holding every declared id exactly once.
function normalize(stored, declared) {
    const known = new Set(declared.map(item => item.id));
    const seen = new Set();
    const result = [];
    for (const row of Array.isArray(stored) ? stored : []) {
        if (!row || !known.has(row.id) || seen.has(row.id))
            continue;
        seen.add(row.id);
        result.push({ id: row.id, show: row.show !== false });
    }
    for (const item of declared) {
        if (!seen.has(item.id))
            result.push({ id: item.id, show: true });
    }
    return result;
}

// The ids to show, in the stored order.
function visibleIds(stored, declared) {
    return normalize(stored, declared).filter(row => row.show).map(row => row.id);
}

// @ids split into rows of @perRow; the last row may be shorter.
function rows(ids, perRow) {
    const result = [];
    for (let index = 0; index < ids.length; index += perRow)
        result.push(ids.slice(index, index + perRow));
    return result;
}

// The default stored value for a group: every element shown, in declaration order.
function defaults(declared) {
    return declared.map(item => ({ show: true, id: item.id }));
}

// Panel icons: each shows when the settings allow it AND its state wants it (Bluetooth on,
// a VPN up). The fallback shows when none does. @allowedIds: ids; @wanted: { id: bool }.
function panelIconVisibility(allowedIds, wanted) {
    const visible = {};
    for (const id of Object.keys(wanted))
        visible[id] = allowedIds.includes(id) && wanted[id];
    return { visible, fallback: !Object.values(visible).some(shown => shown) };
}

// Header: the line shows when the battery or at least one button shows.
function headerVisibility(ids, batteryId, batteryPresent) {
    const battery = ids.includes(batteryId) && batteryPresent;
    return { battery, line: battery || ids.some(id => id !== batteryId) };
}
