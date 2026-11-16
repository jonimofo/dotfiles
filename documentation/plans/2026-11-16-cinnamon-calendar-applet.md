Status: DONE

# Cinnamon calendar applet with a second time zone

Applet `cinnamon/applets/calendar@bgi`, Cinnamon 6.4, X11. Issue #55.
Install and usage: [`cinnamon/README.md`](../../cinnamon/README.md).

## Goal

A copy of the stock calendar applet (`calendar@cinnamon.org`) that shows a second time zone
on the panel and in the popup, with event titles, event times and day numbers large enough to
read under any Cinnamon theme. The Dracula theme sets `.calendar-day-base` to 80% and
`.calendar-day-heading` to 70%, which is why the stock applet is hard to read.

## Owner's words

- "je veux : barre task: ajouter autre heure (ex Vietnam), je veux égalemennt que les
  évènement soient bien + gros et visibles, pareil pour les jours (un peu comme gnome, l'état
  actuel est très illisible"
- "il faudra aussi changer la façon dont la date est affichée  : e.g Lundi novembre 16 doit
  deveni Lun 16 Nov + sep + heure + VN + heure VN"
- Approach chosen: "Applet dérivé dans dotfiles": a copy of the stock applet becomes
  `calendar@bgi` in dotfiles, like `quick-settings@bgi`, with its own stylesheet and the
  second time zone.

## Validated mockups

A. Panel text, chosen "Point médian":

```
Aujourd'hui :

  Lundi novembre 16, 15:52

Proposé :

  Lun 16 Nov · 15:52 · VN 21:52
```

B. Popup, chosen "Deux colonnes agrandies". The event titles of the validated mockup came
from the owner's calendar; they are replaced here by neutral names, the layout is unchanged.

```
+----------------------------------+------------------------------+
|  Lundi 16 novembre 2026          |  15:52 Paris  ·  21:52 VN    |
|                                  |                              |
| | 10:00 - 11:00                  |   <   Novembre 2026   >      |
| | Team meeting                   |                              |
|                                  |  Lun Mar Mer Jeu Ven Sam Dim |
| | 11:00 - 12:00                  |                              |
| | Review                         |   26  27  28  29  30  31   1 |
|                                  |                              |
| | 11:00 - 12:00                  |    2   3   4   5   6   7   8 |
| | Call                           |                              |
|                                  |    9  10  11  12  13  14  15 |
| | 12:00 - 13:30                  |                              |
| | Lunch                          |  [16] 17  18  19  20  21  22 |
|                                  |                              |
| | 12:00 - 13:30                  |   23  24  25  26  27  28  29 |
| | ...                            |                              |
|                                  |   30   1   2   3   4   5   6 |
+----------------------------------+------------------------------+
|  Date and Time Settings                                         |
+-----------------------------------------------------------------+

Titres : gras, grande taille, pleine couleur
Heures : taille normale, pleine couleur
Jours  : grande taille, cases larges
```

Reading notes: titles are bold, they keep their stored case. The three lines under the frame
are design notes, not UI text. The coloured bar at the left of each event (the calendar's
colour) stays as in the stock applet.

C. Day markers, chosen "Un seul point": one dot under each day that has at least one event.

```
  Lun  Mar  Mer  Jeu  Ven  Sam  Dim

    9   10   11   12   13   14   15
    o    o    o    o    o

 [16]  17   18   19   20   21   22
    o    o    o    o    o         o

   23   24   25   26   27   28   29
    o    o    o    o    o
```

## Decisions

1. Panel date `Lun 16 Nov`: abbreviated weekday, day number without padding, abbreviated
   month, from the locale (`LC_TIME`), trailing dots removed, first letter of each word
   capitalised. Then ` · `, the local time, ` · `, the second zone's label and its time. The
   time follows the desktop's 24h/12h and seconds settings, as the stock applet does.
2. Second zone: three applet settings, show it (default on), IANA zone id (default
   `Asia/Ho_Chi_Minh`), label (default `VN`). `GLib.TimeZone.new_identifier` and
   `GLib.DateTime.to_timezone`, no subprocess. An unknown id hides the second time and logs
   once with the id; the clock keeps running.
3. Popup header right: `15:52 Paris  ·  21:52 VN`: local time and the local zone's city (last
   part of the IANA id, underscores as spaces), then the second time and its label. Without a
   second zone, the local part alone. It replaces the stock day and date labels inside the
   "back to today" button, which keeps its behaviour.
4. Popup header left: `Lundi 16 novembre 2026` for the selected day: full weekday, day, full
   month, year, first letter capitalised.
5. Sizes in the applet's own `stylesheet.css`, relative units, own class names, no colour
   literal: event title bold and larger, event time at base size, both at the theme's full
   foreground colour; day numbers large in wide cells; day headings `Lun Mar ...` without dot
   at a readable size. Today, selected day, other-month and weekend days keep the theme
   classes the stock applet uses.
6. Day marker: one dot, a `•` glyph in the theme's foreground colour, under a day with one or
   more events; none otherwise.
7. Kept from the stock applet: the `<Super>c` keybinding setting (removed in the fourth round), week numbers, events on or
   off, "Date and Time Settings", the custom format option. With the custom format on, it
   replaces the date part only of the horizontal panel text; the tooltip keeps its own custom
   format. On a vertical panel the stock text is kept, without the second zone.
8. Event times read `10:00 - 11:00` as in mockup B (stock: `10:00  ►  11:00`). The same
   separator is used for multi-day events.
9. Every label, format, separator, class name and settings key added by the change lives in
   `constants.js`; the formatters are pure functions tested by
   `scripts/cinnamon-calendar-test.sh`.

## Facts read on the machine (2026-11-16)

- Cinnamon 6.4.10 (Debian 13). `LC_TIME=fr_FR.UTF-8`, `LANG=en_US.UTF-8`, zone `Europe/Paris`.
- `GLib.DateTime.format('%a')` gives `lun.`, `%b` gives `nov.`, `%A` `lundi`, `%B` `novembre`.
- `GLib.TimeZone.new_identifier('Nowhere/Bad')` returns `null`; `new_local().get_identifier()`
  returns `Europe/Paris`.
- Cinnamon loads the theme first, then each applet's `stylesheet.css`; the default Cinnamon
  theme is only a fallback. Dracula styles none of the event classes.

## Stock functions modified

For a future re-sync with upstream. Everything else is the stock code.

| File | Function | Change |
|---|---|---|
| `metadata.json` | | uuid, name, description, version fields |
| `settings-schema.json` | | "Second time zone" section with three keys |
| `applet.js` | `constructor` | settings uuid, second zone settings, popup class, header band (date label moved from the event list, clocks), calendar panel, day summary card |
| `applet.js` | `constructor`, `_setKeybinding` (removed), `on_applet_removed_from_panel` | `keyOpen` binding and the `<Super>c` hotkey removed |
| `settings-schema.json` | `keyOpen` | removed |
| `applet.js` | `_onSettingsChanged` | resolves the second zone |
| `applet.js` | `_updateClockAndDate` | panel text, clocks, header date and day card from the pure formatters |
| `applet.js` | `_has_calendars_changed` | updates the day card |
| `applet.js` | `_initContextMenu` | on opening, caps the events column from the monitor's height |
| `applet.js` | new `_updateTodayButton` | the Today button's visibility and inactive state |
| `applet.js` | new `_inVerticalPanel`, `_timeFormat`, `_panelText`, `_secondTime`, `_updateSecondZone`, `_buildClock`, `_updateClocks`, `_updateDaySummary`, `_applyAppearance` | |
| `calendar.js` | `_getCalendarDayAbbreviation` | trailing dot removed, capitalised |
| `calendar.js` | `_buildHeader` | one month row instead of the month and year rows, day heading class |
| `calendar.js` | `_onPrevYearButtonClicked`, `_onNextYearButtonClicked` | removed with the year row |
| `calendar.js` | `constructor` | binds the day dot switch |
| `calendar.js` | `_update` | month row text, own day state classes, week number class, one marker instead of one dot per event |
| `eventView.js` | `ARROW_SEPARATOR` | ` – ` |
| `eventView.js` | `EventsManager.eds_service_found`, `log_dbus_error` | log prefix |
| `eventView.js` | `EventList.constructor` | own class instead of `calendar-events-main-box` |
| `eventView.js` | `EventList.constructor` | own class on the event list box |
| `eventView.js` | `EventList.set_events` | no separator between two events (the list's spacing) |
| `eventView.js` | new `EventsManager.get_events_for_date` | the selected day's events for the day card |
| `eventView.js` | new `EventList.set_monitor_height` | `max-height` of the column |
| `eventView.js` | new `EventList.set_appearance` | text size and gap of the list, metadata and countdown switches |
| `eventView.js` | `EventList.set_date` | long date formatter |
| `eventView.js` | `EventRow.constructor` | accent bar, time block, title over metadata (summary cut at the first ` \| `), ellipsis, tooltip |
| `eventView.js` | `EventRow.update_variations` | one time class |

New files: `constants.js`, `dateText.js`, `secondZone.js`, `dayMarker.js`, `eventsHeight.js`,
`dayCell.js`, `daySummary.js`, `appearance.js`, `todayButton.js`,
`stylesheet.css`.

## Steps

All done, in the PR that closes #55.

1. This plan.
2. Stock copy, unchanged except the uuid and name in `metadata.json`.
3. Panel text with the second zone and its settings.
4. Popup: header, sizes, stylesheet.
5. One dot per day with events.
6. Tests in `scripts/check-all.sh`, README section, plan to `DONE`, draft PR.

## Built differently from the steps

- The popup header times came with step 3: they share the second zone code with the panel.
- `scripts/check-all.sh` needed no change: it runs every `scripts/*-test.sh`, so it picks up
  `scripts/cinnamon-calendar-test.sh`. `scripts/cinnamon-extension-check.sh` checks every
  folder under `cinnamon/applets/`, the new one included.
- The test also checks the stylesheet: no colour, no `opacity`, no `px` or `pt`, and every
  class of `constants.js` styled.

## Events column tightened (second review round)

Owner's words, after loading the applet live: "c'est mieux mais la colonne de gauche avec
les évnèments peut eetre amélioré, y'a trop d'espace, je veux que tout s'affiche d'un coup
quand c possible (hauteur max à définir)". Chosen option: "Deux lignes serrées", with the
note: "indented la seconde ligne legerement".

Validated mockup:

```
+----------------------------------+
|  Lundi 16 novembre 2026          |
| | 10:00 - 11:00                  |
| | Team meeting | Room A          |
| | 11:00 - 12:00                  |
| | Review | Project B             |
| | 11:00 - 12:00                  |
| | Review | Project C             |
| | 12:00 - 13:30                  |
| | Lunch                          |
| | 14:00 - 15:00                  |
| | Call | Client                  |
| | 15:00 - 16:00                  |
| | Workshop                       |
+----------------------------------+

Un fin trait d'espace entre deux événements,
plus de grand vide.
Hauteur : selon le contenu, 70 % de l'écran au plus.
```

The three lines under the frame are design notes, not UI text. The title line is slightly
indented under the time line.

Where the space came from, and what replaces it:

| Space | Before | Now |
|---|---|---|
| Between two events | the stock `Separator` (class `separator`): Dracula gives it `height: 1em` | `.separator.calendar-bgi-event-gap`, `height: 0.3em`; the theme still draws its line colour, Dracula's is transparent |
| Under the last event | `height: 26em` on the column (first round); themes such as Adapta set `height: 300px` on `calendar-events-main-box` | no height: the column takes its content's height, `max-height` set by the applet |
| Around an event | `calendar-event-button`: `padding: 5px 10px` in Adapta, nothing in Dracula | `.calendar-event-button.calendar-bgi-event-row`, `padding: 0.2em 0.4em`, `margin: 0`; the theme's hover stays |
| Inside an event | `calendar-event-row-content` (unstyled by Dracula) | `calendar-bgi-event-content`, `spacing: 0.1em` |
| Title indent | none | `padding-left: 0.6em` on `calendar-bgi-event-title` |

Height: each time the menu opens, the applet reads the height of the monitor holding the
panel button (`Main.layoutManager.findMonitorForActor`, as the stock popup menu does) and
sets `max-height` on the column to `EVENTS_MAX_HEIGHT_RATIO` (0.7) of it, in style pixels
(divided by `global.ui_scale`), rounded down (`eventsHeight.js`, tested). Beyond it the
stock scroll view scrolls. An unknown or zero monitor height sets no cap; the stock popup
menu's own cap (the monitor's height) still applies.

Column alignment: both columns sit in the stock horizontal `calendar-main-box`, which gives
them the height of the taller one. With few events the events column is as tall as the
calendar, events at the top. With many, the calendar stays at the top of its column and
the space is under it.

The column no longer carries the stock `calendar-events-main-box` class, so a theme's
padding or right border on it no longer applies: the applet gives it `padding-right: 1em`.

## Design handoff (third review round)

Owner's words: "lis <dossier du handoff> pour améliorer" (the folder's local path left out).
The folder is the owner's design handoff, status VALIDATED: a mockup image, a design spec with a
palette table and a validation checklist, Cinnamon notes, reference CSS. It stays outside the
repo: its images and examples hold private calendar content. This round supersedes the event
row layout of the first two rounds where they differ.

Decisions made by the designer and the owner:

1. Month navigation on one row `<  Novembre 2026  >`, the arrows move one month; the year
   arrows go; no dropdown chevron next to the month. The mouse wheel over the grid kept
   changing month (stock `_onScroll`: up or left for the previous month, down or right for
   the next).
2. One horizontal row per event: accent bar (the calendar's colour from the data), time
   block `HH:MM – HH:MM` on its own background, then the title (bold, primary text) over the
   metadata (smaller, secondary text). The summary is cut at its first ` | `; without one it
   is the title alone, with no empty second line. No icon, no duration.
3. Long titles end in an ellipsis on one line. The full summary is in a tooltip: the stock
   row had none, Cinnamon's `Tooltips.Tooltip` makes it one line.
4. The palette of the spec, each colour defined once in the applet stylesheet, by role; no
   colour in JavaScript. This reverses the "no colour literal" decision of the first round.
   The event accent keeps the data colour; the code has no fallback colour, so the spec's four
   accent colours are not used.
5. Day cells larger, digits slightly larger, weight 500 to 600.
6. Selected day violet with white bold text, today a thin light outline, both on a selected
   today, other-month days discreet; the single event dot stays, in a reserved space.
7. Header band: full date on the left, the two clocks on the right, time in primary text,
   `Paris` and `VN` in secondary text.
8. Under the calendar, one card for the selected day: `Aujourd'hui` or that day's date, the
   number of events, the range from the first start to the last end, never a duration. A day
   without events has no card, so no empty box is left.
9. No legend. Footer entry kept as it is.
10. Height of round two kept: only the list scrolls, up to 70% of the monitor's height. Row
    sizes in px where the spec gives px.
11. Only properties St supports; what it cannot do is listed below.
12. Every new class is the applet's own (`calendar-bgi-`); the popup is styled through its
    own class `calendar-bgi-popup` next to `menu`, so other menus keep their look.

Day cells, before and after (CSS values; the cell is the day's font size times these):

| | Before (rounds one and two) | Now |
|---|---|---|
| Font size | 125% | 133% (about +1 px), weight 500 |
| Width | 2.6em, 3.25 base em | 2.6em, 3.46 base em (+6%) |
| Height | 2.6em, 3.25 base em | 2.75em, 3.66 base em (+13%) |
| Border | none | 1px in every state, coloured only for today and focus |
| Marker | 2.6em down at 80% | 3.25em down at 80%; the digit is lifted by a 0.35em bottom padding |

Spec checklist (section 7) and other spec items:

| Spec item | Done | Not possible in St, or not done, and why |
|---|---|---|
| Look of the validated mockup | yes, except the items below | |
| No category icon on the rows | yes (the stock rows had none) | |
| No duration per event, time range shown | yes | |
| No legend, no space kept for it | yes (there was none) | |
| Larger day cells (+10 to 15% height) | yes, +13% height, +6% width | |
| Six-week months fully visible | yes: the grid always has six rows (stock), no height cap on the calendar | to confirm live |
| Independent, scrolling event list | yes, the calendar column does not scroll | |
| Real data kept, no code or tag dropped | yes: the metadata is shown as stored; a summary starting with ` \| ` shows its metadata as the title | |
| Summary without a wrong duration | yes: count and range only, tested | |
| Selected, today, days with events distinct | yes | |
| No regression in clicks, navigation, time zone, settings | tests green | year arrows removed on purpose |
| Tabular figures for times | no | St has no font feature settings |
| Accent bar following the row's rounded corners | no | St does not clip children to a border radius |
| Keyboard focus visible | style defined (`:focus`, light violet border) | the stock days and arrows never take keyboard focus; making them focusable would change the stock behaviour |
| Selected weekday heading highlighted ("Dim" in the mockup) | no | not in the decisions; would rebuild the headings on every selection |
| Dropdown chevron next to the month | no | decision 1 |
| Footer band colour | no | decision 9: footer kept as it is |
| Thin scroll bar, stronger on hover | yes, 5px, hover colour | |
| Category accent colours as fallback | no | the event colour always comes from the data |

## Appearance settings (fourth review round)

Owner's words: "je veux aussi pouvoir régler la font size, et les differents éléments dans la
config de cet applet". Chosen option: "Tailles par zone et interrupteurs". Before this round,
the main session widened the gap between event rows from 4px to 8px at the owner's request:
"ajoute un peu de gap entre les cards des events".

Validated mockup:

```
Configure  >  onglet Apparence

  Taille du texte
    Événements        [----O-----]  100 %
    Jours             [-----O----]  100 %
    En-tête           [----O-----]  100 %
    Espace entre événements   [ 8 ] px

  Éléments affichés
    Horloges dans l'en-tête        [ON ]
    Ligne de métadonnées           [ON ]
    Compte à rebours               [ON ]
    Point sous les jours           [ON ]
    Carte de résumé                [ON ]
    Numéros de semaine             [OFF]

Onglet Barre : date, second fuseau, libellé
Onglet Raccourci : Super+C
```

Decisions:

1. The dialog uses the schema's `layout` with two pages: Apparence (Taille du texte,
   Éléments affichés) and Barre (Date, Second fuseau). The Raccourci tab of the mockup was
   dropped with the keybinding (decision 7). The stock
   "Show calendar events" switch comes first in Éléments affichés; week numbers is the stock
   key moved there. New labels are in French; stock labels and the round-one second zone
   labels stay in English, so Éléments affichés mixes both.
2. Three text sizes in percent, 100 by default, 70 to 160, step 5: Événements (event row
   texts), Jours (day digits and headings, the cells grow with them), En-tête (header date
   and clocks).
3. Applied from code as an inline `font-size` on three containers: the event list
   (`12px` times the scale, so the event texts in em give 13, 14, 12 and 11 px at 100%, the
   round-three sizes; the test multiplies each em value of the stylesheet by 12), the
   calendar grid and the header band (`100%` at the default, so their em and % contents are
   unchanged). `appearance.js` turns a setting into a style and clamps it: not a number gives
   the default, out of range gives the nearest end, then rounded to the step.
4. Gap between events: a spin setting, 8 px by default, 0 to 24, applied as the list's
   `spacing`; the stylesheet keeps 8px as the default.
5. Element switches, on by default except week numbers. Hiding the clocks hides the button
   that holds them; hiding the dots also drops the room kept under the digit; hiding the
   metadata line or the countdown rebuilds the rows without them.
6. Every key, default, range, step and label in `constants.js`; the schema stays written by
   hand and the test checks it against them, plus every key the code reads.
7. No keyboard shortcut. Owner's words: "je ne veux pas de raccourci = show calendar". The
   stock `keyOpen` setting, its section and tab, and the code that registered and removed the
   `<Super>c` hotkey are gone; the applet registers no global hotkey. A test checks that the
   schema has no keybinding setting.

How it applies live: each new key is bound with `settings.bind(key, property,
this._onSettingsChanged)`, which calls `_applyAppearance()` and then `select_date(..., true)`
so the rows are rebuilt; the day dot switch is bound in the calendar grid with
`bindWithObject(..., this._onSettingsChange)`, as the stock week numbers switch is.

Wording, after the keybinding removal: the owner chose one language for the applet's own
wording, option "Tout en anglais". Validated wording:

```
Appearance
  Shown elements
    Calendar events               [ON ]
    Clocks in the header          [ON ]
    Week numbers                  [OFF]

Panel
  Second time zone
    Show a second time zone       [ON ]
    Time zone          Asia/Ho_Chi_Minh
    Label              VN
```

This supersedes the French wording of the fourth-round mockup above and of decisions 1 and 8
of the third round (`Aujourd'hui`, `activités`): tabs `Appearance` and `Panel`; sections
`Text size` (`Events`, `Days`, `Header`, `Gap between events`) and `Shown elements`
(`Calendar events`, `Clocks in the header`, `Metadata line`, `Countdown`, `Dot under days`,
`Summary card`, `Week numbers`); Panel sections `Date` and `Second time zone`. The stock
custom-format labels are unchanged. The day card reads `Today`, `1 event`, `16 events`. The
panel date, the header date, month and day names still follow `LC_TIME` (French here).

## Count card and Today button (fifth review round)

Owner's words, after loading round four live: "the number of events on the day should be the
only thing in the block under calendar, no need to add again the date, etc; instead under
it, create a new button to go directly to today s date".

Look to build:

```
+----------------------------------+
|  <       Novembre 2026        >  |
|  Lun  Mar  Mer  Jeu  Ven  Sam Dim |
|   ...                            |
+----------------------------------+

+----------------------------------+
|  6 events                        |
+----------------------------------+

+----------------------------------+
|              Today               |
+----------------------------------+
```

Decisions:

1. The card holds the count only (`1 event`, `N events`): its heading, divider and time
   range are gone with their code (`summariseDay`, `minutesFrom`, `formatRange`,
   `summaryHeading`, `SUMMARY_TODAY_HEADING`, `MINUTES_IN_DAY`, the heading class) and
   tests. A day without events still has no card. This supersedes decision 8 of the third
   round.
2. A `Today` St.Button under the card, full width, with the card's colours, border and
   corners and the shared hover colour (no new colour), an accessible name, `track_hover`.
   Its click calls `_resetCalendar()`, the handler of the header clocks' click: today is
   selected, and the grid shows the selected day's month. Like the stock buttons of the
   popup (days, month arrows), it takes no keyboard focus.
3. Always shown with its switch, with or without the card. While today is selected and
   shown it is not reactive and dimmed with `opacity` 160 of 255, the mechanism of
   `quick-settings@bgi` (`INACTIVE_OPACITY`). The pure decision `todayButtonActive(selected,
   shownMonth, today)` is tested; the grid always shows the selected day's month, so the
   applet passes the selected date for both.
4. `Today button` switch in Shown elements (`show-today-button`, on), live like the others.
5. Hiding the header clocks no longer removes the only way back to today (README updated).

## To confirm on the live panel

- Sizes and the place of the dot under the number, under Dracula.
- Today and the selected day still stand out with the new day class.
- The events column width with long titles.
- Third round: the palette under Dracula's menu (the popup's own background and border),
  the header band, rows of 48 to 56 px, the time block width with 12-hour times, the
  ellipsis and tooltip, the larger day cells with the dot under the digit, a six-week month,
  the day card for today and for another day.
- Fifth round: the count card alone, the Today button's look, hover, click from another month, and its dimmed state on today.
- Fourth round: the two tabs in Configure, `<Super>c` free again, each slider and the gap applying at once, 100%
  looking as before, the switches leaving no gap, the sizes at 70% and 160%.
- Second round: that `max-height` on the column makes it scroll past 70 % of the screen (a
  day with many events), the thin gap and the title indent under Dracula, and the empty
  day ("No Events") layout.

## Out of scope

Any feature not in the mockups, the theme in `~/.themes`, enabling the applet on the live
panel (done by the owner afterwards), `quick-settings@bgi`.
