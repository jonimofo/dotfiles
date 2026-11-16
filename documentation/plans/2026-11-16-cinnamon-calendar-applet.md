Status: VALIDATED

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
7. Kept from the stock applet: the `<Super>c` keybinding setting, week numbers, events on or
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
| `applet.js` | `constructor` | settings uuid, second zone settings, one header time label instead of the day and date labels |
| `applet.js` | `_onSettingsChanged` | resolves the second zone |
| `applet.js` | `_updateClockAndDate` | panel text and header times from the pure formatters |
| `applet.js` | new `_inVerticalPanel`, `_timeFormat`, `_panelText`, `_secondTime`, `_headerText`, `_updateSecondZone` | |
| `calendar.js` | `_getCalendarDayAbbreviation` | trailing dot removed, capitalised |
| `calendar.js` | `_buildHeader` | day heading class |
| `calendar.js` | `_update` | day class, one marker instead of one dot per event |
| `eventView.js` | `ARROW_SEPARATOR` | ` - ` |
| `eventView.js` | `EventsManager.eds_service_found`, `log_dbus_error` | log prefix |
| `eventView.js` | `EventList.constructor` | own class on the events box |
| `eventView.js` | `EventList.set_date` | long date formatter |
| `eventView.js` | `EventRow.constructor`, `EventRow.update_variations` | own title and time classes |

New files: `constants.js`, `dateText.js`, `secondZone.js`, `dayMarker.js`, `stylesheet.css`.

## Steps

1. This plan.
2. Stock copy, unchanged except the uuid and name in `metadata.json`.
3. Panel text with the second zone and its settings.
4. Popup: header, sizes, stylesheet.
5. One dot per day with events.
6. Tests in `scripts/check-all.sh`, README section, plan to `DONE`, draft PR.

## Out of scope

Any feature not in the mockups, the theme in `~/.themes`, enabling the applet on the live
panel (done by the owner afterwards), `quick-settings@bgi`.
