const Constants = require('./constants');

const FRAME_START = 'top - ';

const CPU_COLUMN = Constants.CPU_TOP_CPU_COLUMN;
const COMMAND_COLUMN = 'COMMAND';

// The busiest process in the last frame of `top -b` output: { name, percent }, or null
// when the frame has no process line. The columns are found by the header's names, so a
// toprc that reorders them still works, as long as COMMAND stays last (it may hold spaces).
// Throws, naming the header, when it cannot be read: no header, translated names (top run
// without Constants.CPU_TOP_ENV), or COMMAND not last. Decimal commas are read as points.
// Constants.CPU_IGNORED_COMMANDS (top itself) are skipped.
function busiestProcess(text) {
    const frames = text.split(`\n${FRAME_START}`);
    const lines = frames[frames.length - 1].split('\n');
    const headerIndex = lines.findIndex(line => /\bPID\b/.test(line));
    if (headerIndex < 0)
        throw new Error('no PID header line in the top output');
    const columns = lines[headerIndex].trim().split(/\s+/);
    const cpuColumn = columns.indexOf(CPU_COLUMN);
    const commandColumn = columns.indexOf(COMMAND_COLUMN);
    if (cpuColumn < 0 || commandColumn !== columns.length - 1)
        throw new Error(`unreadable top header, ${CPU_COLUMN} and a last ${COMMAND_COLUMN} column expected: "${columns.join(' ')}"`);

    let busiest = null;
    for (const line of lines.slice(headerIndex + 1)) {
        const fields = line.trim().split(/\s+/);
        if (fields.length < columns.length)
            continue;
        const percent = Number(fields[cpuColumn].replace(',', '.'));
        const name = fields.slice(commandColumn).join(' ');
        if (Number.isNaN(percent) || Constants.CPU_IGNORED_COMMANDS.includes(name))
            continue;
        if (!busiest || percent > busiest.percent)
            busiest = { name, percent };
    }
    return busiest;
}

// "php 212%"; an empty text without a process.
function label(process) {
    if (!process)
        return '';
    return `${process.name} ${Math.round(process.percent)}${Constants.PERCENT_SUFFIX}`;
}
