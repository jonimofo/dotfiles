// Parsers for ddcutil 2.x output. Pure functions: tested with captured output.

// `ddcutil detect --terse`: the I2C bus numbers of the valid displays. "Invalid display"
// blocks (a laptop panel without DDC) are skipped.
function parseDetectBuses(text) {
    const buses = [];
    for (const block of text.split(/\n\s*\n/)) {
        if (!/^Display \d+/m.test(block))
            continue;
        const match = block.match(/I2C bus:\s*\/dev\/i2c-(\d+)/);
        if (match)
            buses.push(parseInt(match[1], 10));
    }
    return buses;
}

// `ddcutil --bus N getvcp 10 --brief`, e.g. "VCP 10 C 100 100": { current, max }, or null
// when the line is not a continuous value.
function parseVcpBrief(text) {
    const match = text.match(/^VCP [0-9A-Fa-f]+ C (\d+) (\d+)\s*$/m);
    if (!match)
        return null;
    const max = parseInt(match[2], 10);
    if (max <= 0)
        return null;
    return { current: parseInt(match[1], 10), max };
}
