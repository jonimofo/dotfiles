// Logic tests of the calendar@bgi applet modules, run by cinnamon-calendar-test.sh: English
// dates and wording, panel and header texts, second time zone (unknown id, DST, day change),
// tick clock, day cells and marker, appearance settings, schema against constants.js, and the
// stylesheet conventions (colours once in the palette block, day sizes in em, classes set
// both ways). Events are fabricated; no calendar server, real setting or desktop is touched.
// Usage: GSETTINGS_BACKEND=memory gjs cinnamon-calendar-test.js <applet folder>
const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const CinnamonDesktop = imports.gi.CinnamonDesktop;
const ByteArray = imports.byteArray;

// The tick clock test sets the desktop's seconds setting: only on the memory backend.
if (GLib.getenv('GSETTINGS_BACKEND') !== 'memory') {
    printerr('Refusing to run: set GSETTINGS_BACKEND=memory');
    imports.system.exit(2);
}

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
const TickClock = load('./tickClock');
const Countdown = load('./countdown');
const EventCount = load('./eventCount');
const Appearance = load('./appearance');
const EventsHeight = load('./eventsHeight');

const PARIS = GLib.TimeZone.new_identifier('Europe/Paris');
const VIETNAM = GLib.TimeZone.new_identifier('Asia/Ho_Chi_Minh');

// Date parts of a fabricated day, through GLib.DateTime (local zone of the test).
function partsOf(year, month, day) {
    return DateText.datePartsOf(GLib.DateTime.new(PARIS, year, month, day, 12, 0, 0));
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

// English dates whatever LC_TIME says. The .sh runs this file once more under fr_FR.
function testEnglishDates() {
    checkEqual('header date: example of the eighth round', DateText.formatHeaderDate(partsOf(2026, 11, 16)),
        'Mon 16 Nov. 2026');
    checkEqual('header date: single-digit day', DateText.formatHeaderDate(partsOf(2026, 11, 2)), 'Mon 2 Nov. 2026');
    checkEqual('header date: last day of the year', DateText.formatHeaderDate(partsOf(2026, 12, 31)), 'Thu 31 Dec. 2026');
    checkEqual('header date: first day of the next year', DateText.formatHeaderDate(partsOf(2027, 1, 1)), 'Fri 1 Jan. 2027');
    const months = [];
    for (let month = 1; month <= 12; month++)
        months.push(DateText.formatHeaderDate(partsOf(2026, month, 1)).split(' ')[2]);
    checkEqual('header date: every month, dot after a shortened name only', months.join(' '),
        'Jan. Feb. Mar. Apr. May Jun. Jul. Aug. Sep. Oct. Nov. Dec.');
    const weekdays = [];
    for (let day = 16; day <= 22; day++)
        weekdays.push(DateText.formatHeaderDate(partsOf(2026, 11, day)).split(' ')[0]);
    checkEqual('header date: each weekday', weekdays.join(' '), 'Mon Tue Wed Thu Fri Sat Sun');
    checkEqual('panel date: no year, no dot', DateText.formatPanelDate(partsOf(2026, 11, 16)), 'Mon 16 Nov');
    checkEqual('panel date: May', DateText.formatPanelDate(partsOf(2026, 5, 4)), 'Mon 4 May');
    checkEqual('event span date', DateText.formatDayMonthYear(partsOf(2026, 9, 7)), '7 Sep. 2026');
    checkEqual('event span weekday', DateText.weekdayName(partsOf(2026, 11, 18)), 'Wednesday');
    checkEqual('month heading', DateText.formatMonthHeading(11, 2026), 'November 2026');
    checkEqual('month heading: May', DateText.formatMonthHeading(5, 2026), 'May 2026');
    checkEqual('day headings, Sunday first', Constants.WEEKDAY_ABBREVIATIONS.join(' '), 'Sun Mon Tue Wed Thu Fri Sat');
}

function testPanelText() {
    const example = GLib.DateTime.new(PARIS, 2026, 11, 16, 15, 52, 0);
    const format = DateText.timeFormatFor(true, false);
    const second = { label: 'VN', time: SecondZone.timeInZone(example, VIETNAM, format) };
    const dateText = DateText.formatPanelDate(DateText.datePartsOf(example));
    checkEqual('panel: round-one example time', DateText.formatPanelText(dateText, example.format(format), second),
        'Mon 16 Nov · 15:52 · VN 21:52');
    checkEqual('panel: second zone hidden', DateText.formatPanelText('Mon 16 Nov', '15:52', null),
        'Mon 16 Nov · 15:52');
    checkEqual('panel: empty label keeps the time', DateText.formatPanelText('Mon 16 Nov', '15:52',
        { label: '', time: '21:52' }), 'Mon 16 Nov · 15:52 · 21:52');
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
    checkEqual('day: markers shown, room under the digit', style({ marked: true }), `${S.day} ${S.dayMarked}`);
}

function testEventCount() {
    checkEqual('header count: one', EventCount.formatEventCount(1), '1 event');
    checkEqual('header count: several', EventCount.formatEventCount(16), '16 events');
    checkEqual('header count: hidden at zero', EventCount.headerCountVisible(true, 0), false);
    checkEqual('header count: shown with events', EventCount.headerCountVisible(true, 3), true);
    checkEqual('header count: hidden by its switch', EventCount.headerCountVisible(false, 3), false);
}

// Ticks of @clock over @ms of main loop.
function countTicks(clock, ms) {
    let ticks = 0;
    const id = clock.connect('notify::clock', () => ticks++);
    const loop = GLib.MainLoop.new(null, false);
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
        loop.quit();
        return GLib.SOURCE_REMOVE;
    });
    loop.run();
    clock.disconnect(id);
    return ticks;
}

// Audit M1: with a custom date format without seconds, the panel's clock ticks once a
// minute; the tick clock must follow the desktop's seconds setting instead.
function testTickClock() {
    const desktop = new Gio.Settings({ schema_id: 'org.cinnamon.desktop.interface' });
    desktop.set_boolean('clock-show-seconds', true);
    const panelClock = new CinnamonDesktop.WallClock();
    panelClock.set_format_string('%a %e');
    const tickClock = TickClock.newTickClock();
    const panelTicks = countTicks(panelClock, 2500);
    const secondTicks = countTicks(tickClock, 2500);
    desktop.set_boolean('clock-show-seconds', false);
    const minuteTicks = countTicks(TickClock.newTickClock(), 2500);
    check(`tick clock: a custom format without seconds ticks too rarely (${panelTicks} in 2.5 s)`, panelTicks <= 1);
    check(`tick clock: every second while seconds are shown (${secondTicks} in 2.5 s)`, secondTicks >= 2);
    check(`tick clock: not every second without them (${minuteTicks} in 2.5 s)`, minuteTicks <= 1);
}

// Audit M3: every phrase the applet shows is its own English constant, never gettext, so
// the French run of this file shows the same words.
function testWording() {
    const gettextCalls = [];
    for (const file of listJs()) {
        const source = readText(`${appletDir}/${file}`);
        if (/(^|[^\w.$])(_|C_|ngettext)\(/m.test(source))
            gettextCalls.push(file);
    }
    check(`wording: no gettext call in the applet${gettextCalls.length ? ` (${gettextCalls.join(', ')})` : ''}`,
        gettextCalls.length === 0);
    const countdown = (minutes, hour) => Countdown.countdownFor(minutes, hour).join('|');
    checkEqual('countdown: a few minutes', countdown(5, 10), 'imminent|Starting in a few minutes');
    checkEqual('countdown: minutes', countdown(25, 10), 'soon|Starting in 25 minutes');
    checkEqual('countdown: one hour', countdown(60, 11), '|In 1 hour');
    checkEqual('countdown: several hours', countdown(185, 13), '|In 3 hours');
    checkEqual('countdown: six hours is still in hours', countdown(6 * 60 + 59, 16), '|In 6 hours');
    checkEqual('countdown: this evening', countdown(8 * 60, 19), '|This evening');
    checkEqual('countdown: later today', countdown(8 * 60, 17), '|Starting later today');
    checkEqual('wording: stock phrases in English', [Constants.TEXT.noEvents, Constants.TEXT.allDay,
        Constants.TEXT.inProgress, Constants.TEXT.today, Constants.TEXT.settings].join(' / '),
    'No Events / All day / In progress / Today / Date and Time Settings');
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

function testAppearance() {
    const days = Constants.TEXT_SCALES.days;
    checkEqual('scale: default', Appearance.clampSetting(100, days), 100);
    checkEqual('scale: below the range', Appearance.clampSetting(20, days), 70);
    checkEqual('scale: above the range', Appearance.clampSetting(300, days), 160);
    checkEqual('scale: rounded to the step', Appearance.clampSetting(103, days), 105);
    checkEqual('scale: float from the dialog', Appearance.clampSetting(115.0000001, days), 115);
    checkEqual('scale: numeric string', Appearance.clampSetting('120', days), 120);
    checkEqual('scale: text falls back to the default', Appearance.clampSetting('big', days), 100);
    checkEqual('scale: empty string falls back to the default', Appearance.clampSetting('', days), 100);
    checkEqual('scale: undefined falls back to the default', Appearance.clampSetting(undefined, days), 100);
    checkEqual('scale: null falls back to the default', Appearance.clampSetting(null, days), 100);
    checkEqual('scale: NaN falls back to the default', Appearance.clampSetting(NaN, days), 100);
    checkEqual('scale: Infinity falls back to the default', Appearance.clampSetting(Infinity, days), 100);
    checkEqual('days and header style at 100%', Appearance.percentFontStyle(100, days), 'font-size: 100%;');
    checkEqual('days style clamped', Appearance.percentFontStyle(400, days), 'font-size: 160%;');
    // Audit H2: the events column carries the Events size, so its em width grows with it.
    checkEqual('events column style at 100%', Appearance.eventColumnStyle(100, null), 'font-size: 100%;');
    checkEqual('events column style at 160% with a height cap', Appearance.eventColumnStyle(160, 756),
        'font-size: 160%; max-height: 756px;');
    checkEqual('events column style, bad value', Appearance.eventColumnStyle('x', null), 'font-size: 100%;');
    const columnWidth = readText(`${appletDir}/stylesheet.css`)
        .match(new RegExp(`\\.${Constants.STYLE.events}\\s*\\{[^}]*\\bwidth:\\s*([0-9.]+)(\\w+)`));
    check(`events column width in em, so it follows the column's size (${columnWidth ? columnWidth[1] + columnWidth[2] : '?'})`,
        columnWidth !== null && columnWidth[2] === 'em');
    checkEqual('event list style at the defaults', Appearance.eventListStyle(100, 8), 'font-size: 12px; spacing: 8px;');
    checkEqual('event list style, 150% and gap clamped', Appearance.eventListStyle(150, 40),
        'font-size: 18px; spacing: 24px;');
    checkEqual('event list style, bad values', Appearance.eventListStyle('x', -3), 'font-size: 12px; spacing: 0px;');

    // At 100%, the event texts in em of the 12px list give the design's px sizes.
    const css = readText(`${appletDir}/stylesheet.css`);
    const designPx = { eventTime: 13, eventTitle: 14, eventMeta: 12, eventCountdown: 11 };
    for (const [name, px] of Object.entries(designPx)) {
        const rule = css.match(new RegExp(`\\.${Constants.STYLE[name]}\\s*\\{[^}]*font-size:\\s*([0-9.]+)em`));
        const size = rule ? Number(rule[1]) * Constants.EVENTS_BASE_FONT_PX : NaN;
        check(`100% look: ${Constants.STYLE[name]} is ${size.toFixed(3)}px, design ${px}px`, Math.abs(size - px) < 0.01);
    }
    const gap = css.match(/\.calendar-bgi-event-list\s*\{[^}]*spacing:\s*(\d+)px/);
    check('100% look: stylesheet gap is the default gap', gap !== null && Number(gap[1]) === Constants.EVENT_GAP.default);
}

function testSchema() {
    const schema = JSON.parse(readText(`${appletDir}/settings-schema.json`));
    checkEqual('schema: show second zone default', schema[Constants.SHOW_SECOND_ZONE_KEY].default, true);
    checkEqual('schema: zone id default', schema[Constants.SECOND_ZONE_ID_KEY].default, 'Asia/Ho_Chi_Minh');
    checkEqual('schema: label default', schema[Constants.SECOND_ZONE_LABEL_KEY].default, 'VN');
    check('schema: no keybinding setting', Object.values(schema).every(entry => entry.type !== 'keybinding'));
    check('schema: stock switches kept', ['show-events', 'show-week-numbers', 'use-custom-format']
        .every(key => schema[key] && schema[key].type === 'switch'));
    const specs = [...Object.values(Constants.TEXT_SCALES), Constants.EVENT_GAP,
        ...Object.values(Constants.ELEMENT_SWITCHES)];
    for (const spec of specs) {
        const entry = schema[spec.key];
        const range = ['min', 'max', 'step'].every(field => spec[field] === undefined || entry[field] === spec[field]);
        check(`schema: ${spec.key} default, range and label as in constants.js`,
            entry !== undefined && entry.default === spec.default && entry.description === spec.label && range);
    }
    const layout = schema.layout;
    check('schema: layout is the first key', Object.keys(schema)[0] === 'layout');
    checkEqual('schema: tabs', JSON.stringify(layout.pages.map(page => layout[page].title)),
        JSON.stringify(Constants.SETTINGS_PAGES.map(page => page.title)));
    checkEqual('schema: sections', JSON.stringify(layout.pages.map(page => layout[page].sections.map(section =>
        layout[section].title))), JSON.stringify(Constants.SETTINGS_PAGES.map(page => page.sections)));
    const placed = layout.pages.flatMap(page => layout[page].sections.flatMap(section => layout[section].keys));
    const settingKeys = Object.keys(schema).filter(key => key !== 'layout');
    check('schema: every setting in one tab', settingKeys.every(key => placed.filter(k => k === key).length === 1) &&
        placed.every(key => settingKeys.includes(key)));
    // Every key the code reads: string literals given to bind(), bindWithObject() or
    // getValue(), and every key of constants.js.
    const used = new Set();
    for (const file of listJs()) {
        const source = readText(`${appletDir}/${file}`);
        for (const match of source.matchAll(/\b(?:bind|bindWithObject|getValue)\((?:this, )?["']([A-Za-z-]+)["']/g))
            used.add(match[1]);
    }
    for (const spec of specs)
        used.add(spec.key);
    [Constants.SHOW_SECOND_ZONE_KEY, Constants.SECOND_ZONE_ID_KEY, Constants.SECOND_ZONE_LABEL_KEY].forEach(k => used.add(k));
    const missing = [...used].filter(key => schema[key] === undefined);
    check(`schema: every key used by the code exists (${used.size} keys${missing.length ? `, missing ${missing.join(', ')}` : ''})`,
        missing.length === 0);
    const metadata = JSON.parse(readText(`${appletDir}/metadata.json`));
    checkEqual('metadata: uuid', metadata.uuid, Constants.UUID);
}

// Sizes in em or %, no colour, every class of constants.js styled.
// The palette of the validated design, by role: each colour written once in the stylesheet.
// The stylesheet's palette block: every colour rule sits above this line, by role.
const SIZES_MARKER = '/* ---- Sizes ---- */';
const HEX_COLOUR = /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g;
// Day cells grow with the theme's font: their sizes are in em or %, not px.
const DAY_RULES = ['day', 'dayMarked', 'dayHeading', 'dayMarkerBox', 'dayMarker', 'weekNumber', 'monthRow', 'monthLabel'];

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
    const raw = readText(`${appletDir}/stylesheet.css`);
    const marker = raw.indexOf(SIZES_MARKER);
    check('stylesheet: palette block ends with the sizes marker', marker > 0);
    const paletteBlock = raw.slice(0, marker).replace(/\/\*[\s\S]*?\*\//g, '');
    const sizes = raw.slice(marker).replace(/\/\*[\s\S]*?\*\//g, '');
    const hexes = (css.match(HEX_COLOUR) || []).map(hex => hex.toUpperCase());
    const repeated = [...new Set(hexes.filter((hex, i) => hexes.indexOf(hex) !== i))];
    check(`stylesheet: each colour written once${repeated.length ? ` (repeated ${repeated.join(', ')})` : ''}`,
        repeated.length === 0);
    const palette = (paletteBlock.match(HEX_COLOUR) || []);
    const outside = sizes.match(HEX_COLOUR) || [];
    check(`stylesheet: colours only in the palette block (${palette.length} there${outside.length ? `, ${outside.join(', ')} outside` : ''})`,
        palette.length > 0 && outside.length === 0 && !/\b(rgba?|hsla?)\(|\bopacity\s*:|\bcolor\s*:/.test(sizes));
    check('stylesheet: no colour function or opacity', !/\b(rgba?|hsla?)\(|\bopacity\s*:/.test(css));
    const dayPx = DAY_RULES.filter(key => {
        const rules = [...css.matchAll(new RegExp(`\\.${Constants.STYLE[key]}(?![\\w-])[^{]*\\{([^}]*)\\}`, 'g'))];
        return rules.some(rule => /(^|[;{\s])(width|height|font-size|margin|padding)[\w-]*\s*:[^;]*\d(px|pt)/.test(rule[1]));
    });
    check(`stylesheet: day cell sizes in em or %${dayPx.length ? ` (px in ${dayPx.join(', ')})` : ''}`,
        dayPx.length === 0);
    // Any string literal of the code holding a colour, style strings included.
    const jsColours = [];
    for (const file of listJs()) {
        const source = readText(`${appletDir}/${file}`);
        const strings = source.match(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g) || [];
        if (strings.some(text => /#[0-9a-fA-F]{3,8}\b|\b(rgba?|hsla?)\(/.test(text)))
            jsColours.push(file);
    }
    check(`code: no colour in JavaScript${jsColours.length ? ` (${jsColours.join(', ')})` : ''}`,
        jsColours.length === 0);
    // Classes: exact names both ways, every class of constants.js styled and every applet
    // class of the stylesheet set by the code.
    const styled = new Set([...css.matchAll(/\.(calendar-bgi-[\w-]+)/g)].map(match => match[1]));
    const used = new Set(Object.values(Constants.STYLE));
    const unstyled = [...used].filter(name => !styled.has(name));
    const unused = [...styled].filter(name => !used.has(name));
    const eventsRule = css.match(new RegExp(`\\.${Constants.STYLE.events}\\s*\\{([^}]*)\\}`));
    check('stylesheet: events column has no fixed height',
        eventsRule !== null && !/(^|[^-])height\s*:/.test(eventsRule[1]));
    check(`stylesheet: every class styled${unstyled.length ? ` (missing ${unstyled.join(', ')})` : ''}`,
        unstyled.length === 0);
    check(`stylesheet: every class set by the code${unused.length ? ` (unused ${unused.join(', ')})` : ''}`,
        unused.length === 0);
}

testSummarySplit();
testEnglishDates();
testPanelText();
testTimeFormats();
testHeaderTexts();
testSecondZone();
testDayMarker();
testEventsHeight();
testWording();
testTickClock();
testDayCell();
testAppearance();
testEventCount();
testSchema();
testStylesheet();

if (failures > 0) {
    printerr(`${failures} check(s) failed`);
    imports.system.exit(1);
}
print('All checks passed.');
