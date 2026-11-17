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
const Refresh = load('./refresh');
const EventCount = load('./eventCount');
const Appearance = load('./appearance');
const EventsHeight = load('./eventsHeight');

const PARIS = GLib.TimeZone.new_identifier('Europe/Paris');
const VIETNAM = GLib.TimeZone.new_identifier('Asia/Ho_Chi_Minh');

// Date parts of a fabricated day at noon in Paris, through GLib.DateTime.
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
    // Headings as the grid places them: each weekday at DayCell.weekdayColumn().
    const headings = weekStart => {
        const row = [];
        for (let day = 0; day < 7; day++)
            row[DayCell.weekdayColumn(day, weekStart)] = Constants.WEEKDAY_ABBREVIATIONS[day];
        return row.join(' ');
    };
    checkEqual('day headings, week starting on Monday', headings(1), 'Mon Tue Wed Thu Fri Sat Sun');
    checkEqual('day headings, week starting on Sunday', headings(0), 'Sun Mon Tue Wed Thu Fri Sat');
    checkEqual('day column: Sunday is last in a Monday week', DayCell.weekdayColumn(0, 1), 6);
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

function testTimeOfEventRows() {
    // Audit L16: the rows use timeFormatFor() too, so a single-digit hour has no leading space.
    const morning = GLib.DateTime.new(PARIS, 2026, 11, 16, 9, 5, 0);
    check(`time: 12h single-digit hour without a leading space (${morning.format(DateText.timeFormatFor(false, false))})`,
        /^9:05 \S+$/.test(morning.format(DateText.timeFormatFor(false, false))));
    const example = GLib.DateTime.new(PARIS, 2026, 11, 16, 15, 52, 0);
    checkEqual('date helpers on a GLib.DateTime', [DateText.headerDateOf(example), DateText.panelDateOf(example),
        DateText.dayMonthYearOf(example), DateText.weekdayNameOf(example)].join(' / '),
    'Mon 16 Nov. 2026 / Mon 16 Nov / 16 Nov. 2026 / Monday');
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
    checkEqual('zone: Paris DST start, Vietnam goes from 07:30 to 08:30',
        `${SecondZone.timeInZone(beforeChange, VIETNAM, '%H:%M')} ${SecondZone.timeInZone(afterChange, VIETNAM, '%H:%M')}`,
        '07:30 08:30');
    // A second zone with its own DST change: New York moves on 8 March 2026, Paris on 29 March.
    const newYork = GLib.TimeZone.new_identifier('America/New_York');
    const noonParis = (month, day) => SecondZone.timeInZone(GLib.DateTime.new(PARIS, 2026, month, day, 12, 0, 0),
        newYork, '%H:%M');
    checkEqual('zone: New York before both changes, 6 hours behind', noonParis(3, 1), '06:00');
    checkEqual('zone: New York after its change, Paris not yet, 5 hours behind', noonParis(3, 20), '07:00');
    checkEqual('zone: after both changes, 6 hours behind again', noonParis(4, 1), '06:00');
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
    const countdown = (minutes, hour) => Countdown.countdownFor(minutes, hour);
    checkEqual('countdown: a few minutes', countdown(5, 10), 'Starting in a few minutes');
    checkEqual('countdown: minutes', countdown(25, 10), 'Starting in 25 minutes');
    checkEqual('countdown: one hour', countdown(60, 11), 'In 1 hour');
    checkEqual('countdown: several hours', countdown(185, 13), 'In 3 hours');
    checkEqual('countdown: six hours is still in hours', countdown(6 * 60 + 59, 16), 'In 6 hours');
    checkEqual('countdown: this evening', countdown(8 * 60, 19), 'This evening');
    checkEqual('countdown: later today', countdown(8 * 60, 17), 'Starting later today');
    checkEqual('wording: stock phrases in English', [Constants.TEXT.noEvents, Constants.TEXT.allDay,
        Constants.TEXT.inProgress, Constants.TEXT.today, Constants.TEXT.settings].join(' / '),
    'No Events / All day / In progress / Today / Date and Time Settings');
}

// Performance round: the grid is built once and updated in place from these.
function testGrid() {
    const iso = date => `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
    const monday = DayCell.gridDates(new Date(2026, 10, 16), 1);
    checkEqual('grid: six weeks', monday.length, 42);
    checkEqual('grid: November 2026, Monday weeks, from 26 Oct to 6 Dec',
        `${iso(monday[0])} ${iso(monday[41])}`, '2026-10-26 2026-12-6');
    checkEqual('grid: the 1st sits under Sunday', `${monday[6].getDate()} ${monday[6].getDay()}`, '1 0');
    const sunday = DayCell.gridDates(new Date(2026, 10, 30), 0);
    checkEqual('grid: November 2026, Sunday weeks, from 1 Nov', iso(sunday[0]), '2026-11-1');
    const march = DayCell.gridDates(new Date(2026, 2, 10), 1);
    const steps = march.slice(1).map((date, i) => Math.round((date - march[i]) / 3600000));
    const days = march.slice(1).every((date, i) => (date.getDay() + 6) % 7 === (march[i].getDay() + 1 + 6) % 7);
    check(`grid: one day per cell across the end of March DST change (${[...new Set(steps)].join(', ')} h)`, days);
    checkEqual('month arrows: left to right', DayCell.monthArrowIcons(false).join(' '), 'pan-start-symbolic pan-end-symbolic');
    checkEqual('month arrows: swapped right to left', DayCell.monthArrowIcons(true).join(' '), 'pan-end-symbolic pan-start-symbolic');
    const css = readText(`${appletDir}/stylesheet.css`);
    const iconSize = css.match(new RegExp(`\\.${Constants.STYLE.monthArrowIcon}\\s*\\{[^}]*icon-size:\\s*([0-9.]+)em`));
    check(`month arrows: 2em icons, 24px at 100% of the grid's 12px font (${iconSize ? iconSize[1] + 'em' : '?'})`,
        iconSize !== null && Number(iconSize[1]) * 12 === 24);
    const arrowPadding = css.match(new RegExp(`\\.${Constants.STYLE.monthArrow}\\s*\\{[^}]*padding:\\s*([0-9.]+)em`));
    const dayHeight = 2.75 * 1.33;
    check(`month arrows: button about as high as a day cell (${arrowPadding ? (2 + 2 * Number(arrowPadding[1])).toFixed(2) : '?'}em against ${dayHeight.toFixed(2)}em)`,
        arrowPadding !== null && Math.abs(2 + 2 * Number(arrowPadding[1]) - dayHeight) < 0.1);
    checkEqual('grid: first cell position', JSON.stringify(DayCell.cellPosition(0)), '[2,0]');
    checkEqual('grid: last cell position', JSON.stringify(DayCell.cellPosition(41)), '[7,6]');
    checkEqual('grid: cell column follows the week start', DayCell.cellPosition(13)[1],
        DayCell.weekdayColumn(monday[13].getDay(), 1));
}

function testRefresh() {
    const scheduled = [];
    let runs = 0;
    const coalescer = new Refresh.Coalescer(run => scheduled.push(run), () => scheduled.pop(), () => runs++);
    const requests = [];
    for (let i = 0; i < 500; i++)
        requests.push(coalescer.request());
    checkEqual('coalescer: 500 requests schedule one run', `${requests.filter(Boolean).length} ${scheduled.length}`, '1 1');
    scheduled.shift()();
    checkEqual('coalescer: it runs once', runs, 1);
    check('coalescer: a request after the run schedules again', coalescer.request() && scheduled.length === 1);
    coalescer.cancel();
    checkEqual('coalescer: cancel removes the pending run', scheduled.length, 0);
    check('coalescer: a request after cancel schedules again', coalescer.request());
    const fresh = Constants.FRESH_FETCH_MS;
    checkEqual('fetch: first opening forces', Refresh.forcedFetchDue(null, 1000), true);
    checkEqual('fetch: opening again within the window does not', Refresh.forcedFetchDue(1000, 1000 + fresh - 1), false);
    checkEqual('fetch: opening at the end of the window forces', Refresh.forcedFetchDue(1000, 1000 + fresh), true);
    checkEqual('fetch: a clock going back forces', Refresh.forcedFetchDue(5000, 1000), true);
    check(`fetch: window shorter than the server's 20 s exit (${fresh} ms)`, fresh < 20000);
}

function testEventsHeight() {
    const ratio = Constants.EVENTS_MAX_HEIGHT_RATIO;
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
    checkEqual('scale: lowest value kept', Appearance.clampSetting(70, days), 70);
    checkEqual('scale: highest value kept', Appearance.clampSetting(160, days), 160);
    checkEqual('scale: just under the lowest', Appearance.clampSetting(69, days), 70);
    checkEqual('scale: just over the highest', Appearance.clampSetting(161, days), 160);
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
    check(`schema: date-only default custom format (${schema['custom-format'].default})`,
        !/%[HIklMSpPrRTX]/.test(schema['custom-format'].default));
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
    checkEqual('schema: Shown elements in the order of constants.js',
        JSON.stringify(layout['elements-section'].keys),
        JSON.stringify(Object.values(Constants.ELEMENT_SWITCHES).map(spec => spec.key)));
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

// The stylesheet's palette block: every colour rule sits above this line, by role.
const SIZES_MARKER = '/* ---- Sizes ---- */';
const HEX_COLOUR = /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g;
// Day cells grow with the theme's font: their sizes are in em or %, not px.
const DAY_RULES = ['day', 'dayMarked', 'dayHeading', 'dayMarkerBox', 'weekNumber', 'monthRow', 'monthLabel',
    'monthArrow', 'monthArrowIcon'];
// Classes set by the code with no rule of their own: the day marker takes its parent's
// colour and size.
const UNSTYLED_CLASSES = ['dayMarker'];

// Colour rules of the palette block: [{selectors, property, hex}].
function colourRules(paletteBlock) {
    const rules = [];
    for (const [, selectorText, body] of paletteBlock.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
        const selectors = selectorText.split(',').map(selector => selector.trim());
        for (const [, property, hex] of body.matchAll(/([\w-]+)\s*:\s*(#[0-9a-fA-F]{3,6})\b/g))
            rules.push({ selectors, property, hex: hex.toUpperCase() });
    }
    return rules;
}

// WCAG 2 contrast ratio of two #RRGGBB colours.
function contrast(first, second) {
    const luminance = hex => {
        const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
            .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const [light, dark] = [luminance(first), luminance(second)].sort((a, b) => b - a);
    return (light + 0.05) / (dark + 0.05);
}

// Where each colour is actually used: [foreground selector, property, background selector,
// minimum]. Text needs 4.5:1; outlines, edges and the scroll bar handle (not text) 3:1.
// Exceptions, on purpose: the thin #394761 lines (popup border, event card edges, line
// between the clocks) are decoration, the card's own background marks it; the event accent
// bar takes the calendar's colour from the data.
const CONTRAST_PAIRS = [
    ['.calendar-bgi-header-date', 'color', '.calendar-bgi-header', 4.5],
    ['.calendar-bgi-header-count', 'color', '.calendar-bgi-header', 4.5],
    ['.calendar-bgi-clock-time', 'color', '.calendar-bgi-header', 4.5],
    ['.calendar-bgi-clock-suffix', 'color', '.calendar-bgi-header', 4.5],
    ['.calendar-bgi-event-time', 'color', '.calendar-bgi-event-time-block', 4.5],
    ['.calendar-bgi-event-title', 'color', '.calendar-bgi-event-row', 4.5],
    ['.calendar-bgi-event-title', 'color', '.calendar-bgi-event-row:hover', 4.5],
    ['.calendar-bgi-event-meta', 'color', '.calendar-bgi-event-row', 4.5],
    ['.calendar-bgi-event-meta', 'color', '.calendar-bgi-event-row:hover', 4.5],
    ['.calendar-bgi-event-countdown', 'color', '.calendar-bgi-event-row', 4.5],
    ['.calendar-bgi-month-label', 'color', '.calendar-bgi-calendar-panel', 4.5],
    ['.calendar-bgi-day-heading', 'color', '.calendar-bgi-calendar-panel', 4.5],
    ['.calendar-bgi-month-arrow', 'color', '.calendar-bgi-calendar-panel', 3],
    ['.calendar-bgi-month-arrow:hover', 'color', '.calendar-bgi-month-arrow:hover', 3],
    ['.calendar-bgi-day', 'color', '.calendar-bgi-calendar-panel', 4.5],
    ['.calendar-bgi-day', 'color', '.calendar-bgi-day:hover', 4.5],
    ['.calendar-bgi-day-selected', 'color', '.calendar-bgi-day-selected', 4.5],
    ['.calendar-bgi-day-outside', 'color', '.calendar-bgi-calendar-panel', 4.5],
    ['.calendar-bgi-day-outside:hover', 'color', '.calendar-bgi-day:hover', 4.5],
    ['.calendar-bgi-week-number', 'color', '.calendar-bgi-calendar-panel', 4.5],
    ['.calendar-bgi-today-button', 'color', '.calendar-bgi-today-button', 4.5],
    ['.calendar-bgi-today-button', 'color', '.calendar-bgi-today-button:hover', 4.5],
    ['.calendar-bgi-settings-button', 'color', '.calendar-bgi-settings-button', 4.5],
    ['.menu.calendar-bgi-popup', 'color', '.menu.calendar-bgi-popup', 4.5],
    ['.calendar-bgi-day-today', 'border-color', '.calendar-bgi-calendar-panel', 3],
    ['.calendar-bgi-day-today', 'border-color', '.calendar-bgi-day-selected', 3],
    ['.calendar-bgi-today-button', 'border-color', '.menu.calendar-bgi-popup', 3],
    ['.calendar-bgi-settings-button', 'border-color', '.menu.calendar-bgi-popup', 3],
    ['.calendar-bgi-today-button:focus', 'border-color', '.menu.calendar-bgi-popup', 3],
    ['.calendar-bgi-events StScrollBar StButton#vhandle', 'background-color', '.menu.calendar-bgi-popup', 3],
    ['.calendar-bgi-events StScrollBar StButton#vhandle:hover', 'border-color', '.menu.calendar-bgi-popup', 3],
];

function testContrast() {
    const raw = readText(`${appletDir}/stylesheet.css`);
    const rules = colourRules(raw.slice(0, raw.indexOf(SIZES_MARKER)).replace(/\/\*[\s\S]*?\*\//g, ''));
    const colourOf = (selector, property) => {
        const rule = rules.find(candidate => candidate.property === property && candidate.selectors.includes(selector));
        return rule ? rule.hex : null;
    };
    for (const [selector, property, background, minimum] of CONTRAST_PAIRS) {
        const front = colourOf(selector, property);
        const back = colourOf(background, 'background-color');
        const ratio = front && back ? contrast(front, back) : 0;
        check(`contrast: ${selector} ${property} ${front} on ${background} ${back}: ${ratio.toFixed(2)}:1, at least ${minimum}`,
            ratio >= minimum);
    }
}

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
    // One role per colour and property: a colour may be a text colour and an edge colour,
    // never two text roles.
    const uses = colourRules(paletteBlock).map(rule => `${rule.property} ${rule.hex}`);
    const repeated = [...new Set(uses.filter((use, i) => uses.indexOf(use) !== i))];
    check(`stylesheet: each colour written once per property${repeated.length ? ` (repeated ${repeated.join(', ')})` : ''}`,
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
    const exempt = UNSTYLED_CLASSES.map(key => Constants.STYLE[key]);
    const unstyled = [...used].filter(name => !styled.has(name) && !exempt.includes(name));
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
testTimeOfEventRows();
testSecondZone();
testDayMarker();
testEventsHeight();
testGrid();
testRefresh();
testWording();
testTickClock();
testDayCell();
testAppearance();
testEventCount();
testSchema();
testStylesheet();
testContrast();

if (failures > 0) {
    printerr(`${failures} check(s) failed`);
    imports.system.exit(1);
}
print('All checks passed.');
