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
    checkEqual('header right: mockup B', DateText.formatHeaderTimes('15:52', 'Paris', { label: 'VN', time: '21:52' }),
        '15:52 Paris  ·  21:52 VN');
    checkEqual('header right: second zone hidden', DateText.formatHeaderTimes('15:52', 'Paris', null), '15:52 Paris');
    checkEqual('header right: no city', DateText.formatHeaderTimes('15:52', '', { label: 'VN', time: '21:52' }),
        '15:52  ·  21:52 VN');
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
function testStylesheet() {
    const css = readText(`${appletDir}/stylesheet.css`).replace(/\/\*[\s\S]*?\*\//g, '');
    const colour = css.match(/#[0-9a-fA-F]{3,8}\b|\b(rgba?|hsla?)\(|\bcolor\s*:|\bopacity\s*:/);
    check(`stylesheet: no colour literal or opacity${colour ? ` (found ${colour[0]})` : ''}`, colour === null);
    const absolute = css.match(/\d(px|pt)\b/);
    check(`stylesheet: relative units only${absolute ? ` (found ${absolute[0]})` : ''}`, absolute === null);
    const unstyled = Object.values(Constants.STYLE).filter(name => !css.includes(`.${name}`));
    const eventsRule = css.match(new RegExp(`\\.${Constants.STYLE.events}\\s*\\{([^}]*)\\}`));
    check('stylesheet: events column has no fixed height',
        eventsRule !== null && !/(^|[^-])height\s*:/.test(eventsRule[1]));
    check(`stylesheet: every class styled${unstyled.length ? ` (missing ${unstyled.join(', ')})` : ''}`,
        unstyled.length === 0);
}

testShortDate();
testPanelText();
testTimeFormats();
testHeaderTexts();
testSecondZone();
testDayMarker();
testEventsHeight();
testSchema();
testStylesheet();

if (failures > 0) {
    printerr(`${failures} check(s) failed`);
    imports.system.exit(1);
}
print('All checks passed.');
