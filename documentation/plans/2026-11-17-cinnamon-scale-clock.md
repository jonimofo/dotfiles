Status: DONE

# Cinnamon Scale clock

Extension `cinnamon/extensions/scale-wheel-switch@bgi`, Cinnamon 6.4, X11.
Earlier designs: [`2026-11-11-cinnamon-scale-overview.md`](2026-11-11-cinnamon-scale-overview.md),
[`2026-11-12-cinnamon-scale-second-screen.md`](2026-11-12-cinnamon-scale-second-screen.md),
[`2026-11-12-cinnamon-scale-dock.md`](2026-11-12-cinnamon-scale-dock.md).
Install and usage: [`cinnamon/README.md`](../../cinnamon/README.md).

## Goal

In Scale (Super or the hot corner), one centred row above the search field shows the date
and the local time, bold and large, on the primary screen where the search field is.

Out of scope: a second time zone, any change to the search, the workspace strip, the dock or
the other screens, a setting, the calendar applet, new dependencies.

## Owner's words

- "when i press SUper and i see overview, i want to see the time and date on a row above the
  search bar, make sure it's big enough too"
- Option chosen: "Date and local time only".

## Validated mockup

```
+----------------------------------------------------------+
|                                                          |
|              Tue 17 Nov. 2026   ·   09:22                |  32px bold
|                                                          |
|             [ Type to search...            ]             |
|                                                          |
|       [ws 1]   [ws 2]   [ws 3]   [ws 4]                  |
+----------------------------------------------------------+
```

"32px bold" is a design note, not text of the overview.

## Decisions

1. Text: `<date>   ·   <time>`. The date is worded as the header of `calendar@bgi`
   (`Tue 17 Nov. 2026`: three-letter weekday, day without padding, three-letter month with a
   dot when the month's name is longer, year; English whatever the locale). The time is
   `HH:MM`, or the 12-hour form, after the desktop's `clock-use-24h`; no seconds.
2. Look: bold, about 32px, centred, on its own band above the search field, with the same
   vertical gap to the field as between the field and the strip. White text on the same
   translucent dark band as the search field and the strip, like the extension's other texts.
3. Not interactive: no key focus, no action on a click. Like the extension's other bands it
   swallows clicks, so a click on it does not reach Scale's background.
4. Updates: right at opening, then once per minute change, by a timer aligned to the next
   minute. Nothing runs while Scale is closed; the timer is removed when Scale closes and
   when the extension is disabled.
5. Primary screen only. The search field, the strip and Scale's windows move down by the
   band's height.
6. No new dependency, no setting.
7. An extension cannot load an applet's files: the clock has its own small date formatter
   and tables. A test compares it with the calendar's formatter over every day of several
   years, so the two cannot drift.

## How it is built

| File | Change |
|---|---|
| `clockText.js` | New. Pure formatter of the row's text, with its English tables |
| `overviewClock.js` | New. The band, its label and its minute timer |
| `appSearch.js` | The search bar takes a top offset |
| `extension.js` | Clock band first on `showing`, torn down on `hidden` and in `disable()` |
| `stylesheet.css` | `.scale-clock-bar`, `.scale-clock` |

Findings worth keeping:

- The band shares the search bar's padding (12px on top, none below), so the gap between the
  time and the field equals the gap between the field and the strip (the strip's 12px top
  padding).
- The size is `18pt` (24px at the default 96 dpi), reduced from the mockup's 32px after the
  live check: the owner found 32px too big. `pt` is the unit of the extension's other texts,
  and it follows the desktop's text scaling like them.
- The time uses its own English AM and PM in 12-hour form, as the date is English. The
  calendar applet formats its times with GLib's `%p`, which follows the locale.
- The timer is a main loop timeout aligned to the next minute, created at opening and removed
  at closing, rather than a `CinnamonDesktop.WallClock`, which would keep ticking until it is
  garbage collected.

## Known limitations

Listed in [`cinnamon/README.md`](../../cinnamon/README.md#known-limitations).
