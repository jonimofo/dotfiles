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
2. Look: bold, 18pt (reduced from the mockup's 32px after the live check), centred, on its
   own band above the search field, with the same vertical gap to the field as between the
   field and the strip. White text on the same translucent dark band as the search field and
   the strip, like the extension's other texts.
3. Not interactive: no key focus, no action on a click. Like the extension's other bands it
   swallows clicks, so a click on it does not reach Scale's background.
4. Updates: right at opening, then once per minute change, by a timer aligned to the next
   minute, and at once after a resume from suspend (logind's `PrepareForSleep`). Nothing
   runs while Scale is closed; the timer and the D-Bus subscription are removed when Scale
   closes and when the extension is disabled.
5. Primary screen only. The search field, the strip and Scale's windows move down by the
   band's height.
6. No new dependency, no setting.
7. An extension cannot load an applet's files: the clock has its own small date formatter
   and tables. A test compares it with the calendar's formatter over every day of several
   years, so the two cannot drift.

## How it is built

| File | Change |
|---|---|
| `overviewClock.js` | New. The band and the live copy of the panel clock (see the last follow-up) |
| `appSearch.js` | The search bar takes a top offset |
| `extension.js` | Clock band first on `showing`, torn down on `hidden` and in `disable()` |
| `stylesheet.css` | `.scale-clock-bar`, `.scale-clock-bar-centred` |

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

## Follow-up: the panel clock's look

Owner's words: "dernier changement, je veux que en mode overivew, la font de la date et du
jour soit la meme que en mode normal (taskbar)"

Answer chosen: "Identique à la barre": the row takes the exact size, weight and colour of the
panel clock, read from the panel at each opening, so it follows a change of the panel's text
size. The row's text does not change. Look:

```
Barre des tâches :

   Tue 17 Nov · 11:30 · VN 17:30        16,7 px gras

Overview aujourd'hui :

   Tue 17 Nov. 2026   ·   11:30         24 px gras

Overview après :

   Tue 17 Nov. 2026   ·   11:30         16,7 px gras
```

Decisions:

1. Source: the label of the running panel clock (`calendar@bgi`, else the stock
   `calendar@cinnamon.org`), through `Main.AppletManager`. The panel gives no public text size:
   it writes `font-size: <n>pt` inline on each zone box from `panel-zone-text-sizes`, where `0`
   means the theme's size, and the theme can set the font, weight and colour on
   `.applet-label` or on the panel. Only the label's resolved style holds all four.
2. The row gets an inline style built from that style (`clockFont.js`): family, size in px
   clamped to 8 to 48, weight rounded to St's 100 steps, colour. Reading the colour this way,
   rather than adding the stock `applet-label` class to the row, follows themes that colour
   the panel text on the panel rather than on `.applet-label`.
3. No clock, no label style yet, any missing part or a failure: no inline style, the
   `.scale-clock` rule (18pt bold white) applies whole, and the fallback is logged once per
   session. That rule therefore stays in `stylesheet.css`.
4. The style is set in the constructor, before the band is put on stage, and `extension.js`
   reads `clock.getHeight()` after the constructor: the layout gets the height at the panel's
   size.

## Follow-up: the panel clock itself, at its place

Owner's words, after trying the copied look live: "la date peut elle garder eactement la
meme possiition que la taskbar ? là ça shift vers le bas et ça fait un petit effet , je veux
du full neutre"

Answer chosen: "Même position et même texte": the overview row shows exactly the panel's text,
at the same place to the pixel; at opening the clock does not move and does not change. This
supersedes the row's own text and the copied style above. Look:

```
Barre, mode normal :

|        Tue 17 Nov · 11:30 · VN 17:30        |

Overview :

|        Tue 17 Nov · 11:30 · VN 17:30        |   même place, même texte
|                                              |
|          [ Type to search...      ]          |
|     [ws 1]   [ws 2]   [ws 3]   [ws 4]        |
```

What Scale does to the panel (Cinnamon 6.4): `Overview._animateVisible` calls
`Main.panelManager.disablePanels()` (`overview.js`); `Panel.disable()` (`panel.js`) eases the
panel actor to opacity 0 in `AUTOHIDE_ANIMATION_TIME` (0.2 s), then hides it. Scale's group
fades in over the same time (`ANIMATION_TIME` 0.2 s, `* 0.45` to open).
`_animateNotVisible` calls `enablePanels()` as it starts to close.

Method: a `Clutter.Clone` of the panel clock applet's `actor`, read at each opening, at the
actor's stage position and size.

1. The clone is the panel clock: the same pixels, its text, font and colour, and its own
   updates (minute, second zone), with no code of ours. It takes no input, so no calendar
   opens; the band under it swallows the clicks.
2. It goes in `global.overlay_group` above Scale's group, at full opacity, while the group
   fades in and the panel fades out: the text stays still and steady.
3. The band behind it is the panel's height, so the search field and the strip sit under the
   panel's bottom edge, as they did under the row before.
4. Only for a clock on a panel along the primary screen's top edge. Otherwise (bottom or
   side panel, another screen, panel hidden by autohide) the clone is centred in a band at the
   top, with the search bar's padding. Without a running `calendar@bgi` or
   `calendar@cinnamon.org`, no band.

Dropped:

- Mirroring the text in our own label, with the copied style, at the label's position:
  exact pixels would need the same font rendering, padding and allocation, and the text to be
  followed by hand (`notify::text`); the clone gives all of it.
- Letting the real panel show through Scale: it means patching `disablePanels` or the
  panel's stacking, and the whole panel, its other applets included, would stay visible and
  take clicks under Scale's modal grab.

Removed with this change: the row's formatter (`clockText.js`), its copied style
(`clockFont.js`), the minute timer, the resume subscription to logind, the 12 or 24-hour
setting read, the `.scale-clock` rule, their tests, and the equality test with the calendar's
formatter (the row no longer formats a date).

## Known limitations

Listed in [`cinnamon/README.md`](../../cinnamon/README.md#known-limitations).
