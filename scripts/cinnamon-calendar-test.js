// Logic tests of the calendar@bgi applet modules, run by cinnamon-calendar-test.sh: panel text,
// popup header texts, second time zone (unknown id, DST, day change), day marker, settings
// defaults, and the stylesheet conventions (relative sizes, no colour). Events are
// fabricated; no calendar server, setting or desktop is touched.
// Usage: gjs cinnamon-calendar-test.js <applet folder>
const GLib = imports.gi.GLib;
const ByteArray = imports.byteArray;

const [appletDir] = ARGV;
let failures = 0;

function readText(path) {
    return ByteArray.toString(GLib.file_get_contents(path)[1]);
}

// Cinnamon's require(): every top-level declaration of the file is exported.
const modules = {};
function load(name) {
    const file = `${name.replace('./', '')}.js`;
    if (!modules[file]) {
        const source = readText(`${appletDir}/${file}`);
        const names = [...source.matchAll(/^(?:function|const|let|var|class) ([A-Za-z0-9_]+)/gm)].map(m => m[1]);
        modules[file] = new Function('require', 'imports', `${source}\nreturn { ${names.join(', ')} };`)(load, imports);
    }
    return modules[file];
}

function check(label, condition) {
    print(`${condition ? 'PASS' : 'FAIL'} ${label}`);
    if (!condition)
        failures++;
}

function checkEqual(label, actual, expected) {
    check(`${label}: ${JSON.stringify(actual)}`, actual === expected);
}

const Constants = load('./constants');
const DateText = load('./dateText');
const SecondZone = load('./secondZone');
const DayMarker = load('./dayMarker');
const DayCell = load('./dayCell');
const DaySummary = load('./daySummary');
const EventsHeight = load('./eventsHeight');

const PARIS = GLib.TimeZone.new_identifier('Europe/Paris');
const VIETNAM = GLib.TimeZone.new_identifier('Asia/Ho_Chi_Minh');

// A GLib.DateTime stand-in that formats like the French locale did on this machine
// (`date '+%a %b %A %B'` gives "lun. nov. lundi novembre"), whatever the test's locale.
function frenchDate(day) {
    const names = { '%a': 'lun.', '%b': 'nov.', '%A': 'lundi', '%B': 'novembre' };
    return {
        format: conversion => names[conversion],
        get_day_of_month: () => day,
        get_year: () => 2026,
    };
}

function testSummarySplit() {
    const split = summary => JSON.stringify(DateText.splitSummary(summary));
    checkEqual('summary: title and metadata', split('Team meeting | Alex'),
        JSON.stringify({ title: 'Team meeting', meta: 'Alex' }));
    checkEqual('summary: cut at the first separator only', split('Team meeting | Alex | [R1] [R2]'),
        JSON.stringify({ title: 'Team meeting', meta: 'Alex | [R1] [R2]' }));
    checkEqual('summary: no separator, title alone', split('Lunch'), JSON.stringify({ title: 'Lunch', meta: '' }));
    checkEqual('summary: "|" without spaces is not a separator', split('Room|A'),
        JSON.stringify({ title: 'Room|A', meta: '' }));
    checkEqual('summary: spaces around trimmed', split('  Review | Project B  '),
        JSON.stringify({ title: 'Review', meta: 'Project B' }));
    checkEqual('summary: trailing separator, no empty second line', split('Call | '),
        JSON.stringify({ title: 'Call', meta: '' }));
    checkEqual('summary: leading separator, metadata becomes the title', split(' | Alex'),
        JSON.stringify({ title: 'Alex', meta: '' }));
    checkEqual('summary: empty string', split(''), JSON.stringify({ title: '', meta: '' }));
    checkEqual('summary: null', split(null), JSON.stringify({ title: '', meta: '' }));
}

function testShortDate() {
    checkEqual('abbreviation: dot removed, capitalised', DateText.tidyAbbreviation('lun.'), 'Lun');
    checkEqual('abbreviation: no dot', DateText.tidyAbbreviation('mai'), 'Mai');
    checkEqual('abbreviation: accented first letter', DateText.tidyAbbreviation('éte.'), 'Éte');
    checkEqual('short date: French parts',
        DateText.formatShortDate(DateText.datePartsOf(frenchDate(16), Constants.SHORT_DATE_FORMATS)), 'Lun 16 Nov');
    checkEqual('short date: day without padding',
        DateText.formatShortDate(DateText.datePartsOf(frenchDate(2), Constants.SHORT_DATE_FORMATS)), 'Lun 2 Nov');
}

function testPanelText() {
    const example = GLib.DateTime.new(PARIS, 2026, 11, 16, 15, 52, 0);
    const format = DateText.timeFormatFor(true, false);
    const second = { label: 'VN', time: SecondZone.timeInZone(example, VIETNAM, format) };
    const dateText = DateText.formatShortDate(DateText.datePartsOf(frenchDate(16), Constants.SHORT_DATE_FORMATS));
    checkEqual('panel: mockup A example', DateText.formatPanelText(dateText, example.format(format), second),
        'Lun 16 Nov · 15:52 · VN 21:52');
    checkEqual('panel: second zone hidden', DateText.formatPanelText('Lun 16 Nov', '15:52', null),
        'Lun 16 Nov · 15:52');
    checkEqual('panel: empty label keeps the time', DateText.formatPanelText('Lun 16 Nov', '15:52',
        { label: '', time: '21:52' }), 'Lun 16 Nov · 15:52 · 21:52');
    checkEqual('panel: empty custom date part', DateText.formatPanelText('', '15:52', second), '15:52 · VN 21:52');
}

function testTimeFormats() {
    const afternoon = GLib.DateTime.new(PARIS, 2026, 11, 16, 15, 52, 7);
    checkEqual('time: 24h', afternoon.format(DateText.timeFormatFor(true, false)), '15:52');
    checkEqual('time: 24h with seconds', afternoon.format(DateText.timeFormatFor(true, true)), '15:52:07');
    check(`time: 12h, no padding (${afternoon.format(DateText.timeFormatFor(false, false))})`,
        /^3:52 \S+$/.test(afternoon.format(DateText.timeFormatFor(false, false))));
    check(`time: 12h with seconds (${afternoon.format(DateText.timeFormatFor(false, true))})`,
        /^3:52:07 \S+$/.test(afternoon.format(DateText.timeFormatFor(false, true))));
}

function testHeaderTexts() {
    const clocks = (...args) => JSON.stringify(DateText.headerClocks(...args));
    checkEqual('header clocks: local then second zone', clocks('15:52', 'Paris', { label: 'VN', time: '21:52' }),
        JSON.stringify([{ time: '15:52', suffix: 'Paris' }, { time: '21:52', suffix: 'VN' }]));
    checkEqual('header clocks: second zone hidden', clocks('15:52', 'Paris', null),
        JSON.stringify([{ time: '15:52', suffix: 'Paris' }]));
    checkEqual('header left: mockup B',
        DateText.formatLongDate(DateText.datePartsOf(frenchDate(16), Constants.LONG_DATE_FORMATS)),
        'Lundi 16 novembre 2026');
    checkEqual('month heading: month first', DateText.formatMonthHeading('novembre', '2026', true), 'Novembre 2026');
    checkEqual('month heading: year first', DateText.formatMonthHeading('novembre', '2026', false), '2026 novembre');
    checkEqual('city: Europe/Paris', DateText.cityFromZoneId('Europe/Paris'), 'Paris');
    checkEqual('city: three parts and underscores', DateText.cityFromZoneId('America/Argentina/Buenos_Aires'),
        'Buenos Aires');
    checkEqual('city: single part', DateText.cityFromZoneId('UTC'), 'UTC');
    checkEqual('city: file path', DateText.cityFromZoneId('/etc/localtime'), '');
    checkEqual('city: TZ file syntax', DateText.cityFromZoneId(':/etc/localtime'), '');
    checkEqual('city: null id', DateText.cityFromZoneId(null), '');
}

function testSecondZone() {
    const logged = [];
    const resolver = new SecondZone.SecondZone(message => logged.push(message));
    check('zone: default id resolves', resolver.resolve(true, 'Asia/Ho_Chi_Minh') !== null);
    check('zone: id with spaces around resolves', resolver.resolve(true, ' Asia/Ho_Chi_Minh ') !== null);
    check('zone: hidden when off', resolver.resolve(false, 'Asia/Ho_Chi_Minh') === null);
    check('zone: unknown id hidden', resolver.resolve(true, 'Nowhere/Bad') === null);
    resolver.resolve(true, 'Nowhere/Bad');
    check(`zone: unknown id logged once with the id (${logged.length} log)`,
        logged.length === 1 && logged[0].includes('"Nowhere/Bad"') && logged[0].startsWith(Constants.LOG_PREFIX));
    check('zone: empty id hidden', resolver.resolve(true, '') === null);
    check(`zone: another unknown id logged (${logged.length} logs)`, logged.length === 2);
    resolver.resolve(true, 'Asia/Ho_Chi_Minh');
    resolver.resolve(true, '');
    check(`zone: logged again after a valid id (${logged.length} logs)`, logged.length === 3);
    check('zone: off logs nothing', resolver.resolve(false, 'Nowhere/Bad') === null && logged.length === 3);

    const format = '%Y-%m-%d %H:%M';
    const winter = GLib.DateTime.new(PARIS, 2026, 1, 15, 20, 0, 0);
    checkEqual('zone: winter, 20:00 Paris is the next day 02:00 in Vietnam',
        SecondZone.timeInZone(winter, VIETNAM, format), '2026-01-16 02:00');
    const summer = GLib.DateTime.new(PARIS, 2026, 7, 15, 20, 0, 0);
    checkEqual('zone: summer time, 20:00 Paris is the next day 01:00 in Vietnam',
        SecondZone.timeInZone(summer, VIETNAM, format), '2026-07-16 01:00');
    const beforeChange = GLib.DateTime.new(PARIS, 2026, 3, 29, 1, 30, 0);
    const afterChange = beforeChange.add_hours(1);
    checkEqual('zone: Paris DST start, 01:30 then 03:30 in Paris',
        afterChange.format('%H:%M'), '03:30');
    checkEqual('zone: Paris DST start, Vietnam goes from 07:30 to 08:30',
        `${SecondZone.timeInZone(beforeChange, VIETNAM, '%H:%M')} ${SecondZone.timeInZone(afterChange, VIETNAM, '%H:%M')}`,
        '07:30 08:30');
}

function testDayMarker() {
    checkEqual('marker: one event', DayMarker.dayMarkerCount(true, ['#ff0000']), 1);
    checkEqual('marker: four events, still one', DayMarker.dayMarkerCount(true, ['#a', '#b', '#c', '#d']), 1);
    checkEqual('marker: no events', DayMarker.dayMarkerCount(true, null), 0);
    checkEqual('marker: empty list', DayMarker.dayMarkerCount(true, []), 0);
    checkEqual('marker: events switched off', DayMarker.dayMarkerCount(false, ['#ff0000']), 0);
}

function testDayCell() {
    const S = Constants.STYLE;
    const style = state => DayCell.dayStyleClass(Object.assign({ today: false, selected: false, outside: false,
        weekend: false }, state));
    checkEqual('day: plain', style({}), S.day);
    checkEqual('day: selected', style({ selected: true }), `${S.day} ${S.daySelected}`);
    checkEqual('day: today', style({ today: true }), `${S.day} ${S.dayToday}`);
    checkEqual('day: selected today has fill and outline', style({ today: true, selected: true }),
        `${S.day} ${S.dayToday} ${S.daySelected}`);
    checkEqual('day: other month', style({ outside: true }), `${S.day} ${S.dayOutside}`);
    checkEqual('day: weekend', style({ weekend: true }), `${S.day} ${S.dayWeekend}`);
}

// Fabricated events of one day, in minutes from midnight.
function testDaySummary() {
    const timed = (start, end) => ({ allDay: false, start, end });
    const allDay = { allDay: true, start: 0, end: 1439 };
    const summary = events => JSON.stringify(DaySummary.summariseDay(events));
    checkEqual('summary card: no events', summary([]), JSON.stringify({ count: 0, range: null }));
    checkEqual('summary card: one event', summary([timed(600, 660)]),
        JSON.stringify({ count: 1, range: { start: 600, end: 660 } }));
    checkEqual('summary card: overlapping events, first start to last end',
        summary([timed(120, 240), timed(120, 180), timed(150, 240), timed(540, 660)]),
        JSON.stringify({ count: 4, range: { start: 120, end: 660 } }));
    checkEqual('summary card: all-day events counted, not in the range', summary([allDay, timed(600, 660)]),
        JSON.stringify({ count: 2, range: { start: 600, end: 660 } }));
    checkEqual('summary card: only all-day events, no range', summary([allDay]),
        JSON.stringify({ count: 1, range: null }));
    checkEqual('summary card: events crossing midnight cut to the day', summary([timed(-120, 60), timed(1380, 1500)]),
        JSON.stringify({ count: 2, range: { start: 0, end: 1440 } }));
    checkEqual('summary card: count, one', DaySummary.formatEventCount(1), '1 activité');
    checkEqual('summary card: count, several', DaySummary.formatEventCount(16), '16 activités');
    checkEqual('summary card: range', DaySummary.formatRange('02:00', '11:00'), '02:00 – 11:00');
    checkEqual('summary card: heading today', DaySummary.summaryHeading(true, 'Mardi 17 novembre 2026'), "Aujourd'hui");
    checkEqual('summary card: heading another day', DaySummary.summaryHeading(false, 'Mardi 17 novembre 2026'),
        'Mardi 17 novembre 2026');
    const dayStart = GLib.DateTime.new(PARIS, 2026, 11, 16, 0, 0, 0);
    checkEqual('summary card: minutes from midnight', DaySummary.minutesFrom(dayStart, dayStart.add_hours(9)), 540);
    checkEqual('summary card: minutes on a DST day', DaySummary.minutesFrom(
        GLib.DateTime.new(PARIS, 2026, 3, 29, 0, 0, 0), GLib.DateTime.new(PARIS, 2026, 3, 29, 4, 0, 0)), 180);
    // No duration in any text the card shows: no "h" unit, no minutes count.
    const texts = [DaySummary.formatEventCount(4), DaySummary.formatRange('02:00', '11:00')];
    check(`summary card: no duration in its texts (${texts.join(' / ')})`,
        texts.every(text => !/\d\s*h\b|\bmin\b|\(/.test(text)));
}

function testEventsHeight() {
    const ratio = Constants.EVENTS_MAX_HEIGHT_RATIO;
    checkEqual('events cap: ratio', ratio, 0.7);
    checkEqual('events cap: 1080 px monitor', EventsHeight.eventsMaxHeight(1080, ratio, 1), 756);
    checkEqual('events cap: rounded down', EventsHeight.eventsMaxHeight(1081, ratio, 1), 756);
    checkEqual('events cap: 1440 px monitor', EventsHeight.eventsMaxHeight(1440, ratio, 1), 1008);
    checkEqual('events cap: HiDPI, scale 2', EventsHeight.eventsMaxHeight(2160, ratio, 2), 756);
    checkEqual('events cap: unknown scale read as 1', EventsHeight.eventsMaxHeight(1080, ratio, 0), 756);
    checkEqual('events cap: zero height, no cap', EventsHeight.eventsMaxHeight(0, ratio, 1), null);
    checkEqual('events cap: missing height, no cap', EventsHeight.eventsMaxHeight(undefined, ratio, 1), null);
    checkEqual('events cap: null height, no cap', EventsHeight.eventsMaxHeight(null, ratio, 1), null);
    checkEqual('events cap: NaN height, no cap', EventsHeight.eventsMaxHeight(NaN, ratio, 1), null);
}

function testSchema() {
    const schema = JSON.parse(readText(`${appletDir}/settings-schema.json`));
    checkEqual('schema: show second zone default', schema[Constants.SHOW_SECOND_ZONE_KEY].default, true);
    checkEqual('schema: zone id default', schema[Constants.SECOND_ZONE_ID_KEY].default, 'Asia/Ho_Chi_Minh');
    checkEqual('schema: label default', schema[Constants.SECOND_ZONE_LABEL_KEY].default, 'VN');
    checkEqual('schema: stock keybinding kept', schema.keyOpen.default, '<Super>c');
    check('schema: stock switches kept', ['show-events', 'show-week-numbers', 'use-custom-format']
        .every(key => schema[key] && schema[key].type === 'switch'));
    const metadata = JSON.parse(readText(`${appletDir}/metadata.json`));
    checkEqual('metadata: uuid', metadata.uuid, Constants.UUID);
}

// Sizes in em or %, no colour, every class of constants.js styled.
// The palette of the validated design, by role: each colour written once in the stylesheet.
const PALETTE = ['#151B2B', '#1C2436', '#202B40', '#29364D', '#2F405B', '#394761', '#F1F4FB', '#B5BED0',
    '#818CA4', '#9274DD', '#BAA3F0', '#DDE3F0', '#FFFFFF'];
// Day cells grow with the theme's font: their sizes are in em or %, not px.
const DAY_RULES = ['day', 'dayHeading', 'dayMarkerBox', 'dayMarker', 'weekNumber', 'monthRow', 'monthLabel'];

function listJs() {
    const names = [];
    const dir = GLib.Dir.open(appletDir, 0);
    for (let name = dir.read_name(); name !== null; name = dir.read_name()) {
        if (name.endsWith('.js'))
            names.push(name);
    }
    return names;
}

function testStylesheet() {
    const css = readText(`${appletDir}/stylesheet.css`).replace(/\/\*[\s\S]*?\*\//g, '');
    const hexes = (css.match(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g) || []).map(hex => hex.toUpperCase());
    const repeated = [...new Set(hexes.filter((hex, i) => hexes.indexOf(hex) !== i))];
    check(`stylesheet: each colour written once${repeated.length ? ` (repeated ${repeated.join(', ')})` : ''}`,
        repeated.length === 0);
    const foreign = [...new Set(hexes)].filter(hex => !PALETTE.includes(hex));
    check(`stylesheet: only palette colours${foreign.length ? ` (found ${foreign.join(', ')})` : ''}`,
        foreign.length === 0 && !/\b(rgba?|hsla?)\(|\bopacity\s*:/.test(css));
    const dayPx = DAY_RULES.filter(key => {
        const rules = [...css.matchAll(new RegExp(`\\.${Constants.STYLE[key]}(?![\\w-])[^{]*\\{([^}]*)\\}`, 'g'))];
        return rules.some(rule => /(^|[;{\s])(width|height|font-size|margin|padding)[\w-]*\s*:[^;]*\d(px|pt)/.test(rule[1]));
    });
    check(`stylesheet: day cell sizes in em or %${dayPx.length ? ` (px in ${dayPx.join(', ')})` : ''}`,
        dayPx.length === 0);
    const jsColours = [];
    for (const file of listJs()) {
        const source = readText(`${appletDir}/${file}`);
        if (/['"`]#[0-9a-fA-F]{3,8}['"`;]|\b(rgba?|hsla?)\(/.test(source))
            jsColours.push(file);
    }
    check(`code: no colour in JavaScript${jsColours.length ? ` (${jsColours.join(', ')})` : ''}`,
        jsColours.length === 0);
    const unstyled = Object.values(Constants.STYLE).filter(name => !css.includes(`.${name}`));
    const eventsRule = css.match(new RegExp(`\\.${Constants.STYLE.events}\\s*\\{([^}]*)\\}`));
    check('stylesheet: events column has no fixed height',
        eventsRule !== null && !/(^|[^-])height\s*:/.test(eventsRule[1]));
    check(`stylesheet: every class styled${unstyled.length ? ` (missing ${unstyled.join(', ')})` : ''}`,
        unstyled.length === 0);
}

testSummarySplit();
testShortDate();
testPanelText();
testTimeFormats();
testHeaderTexts();
testSecondZone();
testDayMarker();
testEventsHeight();
testDayCell();
testDaySummary();
testSchema();
testStylesheet();

if (failures > 0) {
    printerr(`${failures} check(s) failed`);
    imports.system.exit(1);
}
print('All checks passed.');
