// What the settings dialog stored, made safe to apply. The dialog's list widget also has
// Add, Remove and Edit buttons that cannot be hidden without hiding the moves, so a stored
// list can hold anything: unknown ids are ignored, a repeated id keeps its first row, and a
// declared element missing from the list comes back shown, see insertMissing(). Nothing can
// be lost for good, and an element added in a later version appears by itself.
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
    insertMissing(result, declared, seen);
    return result;
}

// Puts each declared element missing from @result just before the first of its declared
// successors that @result holds, so it lands where the defaults put it relative to the
// stored order; with no such successor, at the end. Handled in declaration order, so several
// missing in a row keep their declared order. @seen: the ids @result holds, updated.
function insertMissing(result, declared, seen) {
    declared.forEach((item, index) => {
        if (seen.has(item.id))
            return;
        const successor = declared.slice(index + 1).find(next => seen.has(next.id));
        const at = successor ? result.findIndex(row => row.id === successor.id) : result.length;
        result.splice(at, 0, { id: item.id, show: true });
        seen.add(item.id);
    });
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

// Panel items: each shows when the settings allow it AND its state wants it (Bluetooth on,
// a VPN up, a battery present). The fallback shows when none does. @allowedIds: ids; @wanted: { id: bool }.
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
