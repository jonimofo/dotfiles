Status: DONE

# Cinnamon Quick Settings: playing bar and players without a title

Applet `cinnamon/applets/quick-settings@bgi`, Cinnamon 6.4, X11. Earlier plan:
[`2026-11-17-cinnamon-quick-settings-media.md`](2026-11-17-cinnamon-quick-settings-media.md).

## Goal

A media block shows a thin solid bar in the applet's accent colour on its left while its
player plays. A player that publishes no `xesam:title` (GNOME Videos playing a file without
a title tag) gets a block too, titled with its own window's title, else its name alone.

## Owner's words

- "i want to have a striped accent (purple) left if playing is active, also i was using
  Videos app and it did not show"

## Validated looks

A. Playing bar, chosen "Solid purple bar": "A thin vertical purple bar on the left edge of
the row, same idea as the ongoing events in your calendar. Shown only while playing, gone on
pause. Text does not shift: the space is reserved on every row."

```
Playing = purple bar on the left. Paused = no bar.

 ----------------------------------------------

  ┃ Page title                     |<   ||   >|
  ┃ Mozilla firefox

  ╭──────────────────────────────────────────╮
  │ Episode title                  |<   >   >| │
  │ VLC media player                          │
  ╰──────────────────────────────────────────╯

  ┃ = purple bar, 3 px, full row height
  Row 1 is playing. Row 2 is paused, tinted
  background as today, no bar.
```

B. Player without a title, chosen "Window title": "The row shows the title of the player's
own window, which for Videos is the file name. If the player has no window either, the row
shows the player name alone. A browser with no media still stays hidden, because it does not
announce itself."

```
Videos playing a file without title tag:

  ┃ Name of the video file          |<   ||   >|
  ┃ Videos

  Line 1 = window title, cut like other titles
  Line 2 = player name, italic, as today
```

## Decisions

- Cause of the missing Videos block, measured: Videos (totem 43.2) owns
  `org.mpris.MediaPlayer2.totem`, `Identity` `Videos`, and its `Metadata` holds only
  `mpris:length`, `xesam:trackNumber` and `mpris:trackid`. The earlier rule "players
  without a title are left out" hid it; that rule is replaced: every announced player gets a
  block.
- Line 1: `xesam:title`, else the window title, else empty (the title line hides and the
  player name shows alone on line 2). The window title is untrusted text: same `plainText`
  cleaning and `MEDIA_TITLE_MAX` cut as a track title, set as plain label text.
- Which window: the one click-to-focus brings forward, through the same code
  (`MediaFocus.findPlayerWindow`): windows of the player's own process only (its
  DesktopEntry application's windows of that process, else the process's windows), the one
  used last among several. Its title is followed with `notify::title`, and the window is
  released on `unmanaged`; no polling.
- Playing: `PlaybackStatus` is `Playing`. Paused or stopped: no bar.
- Colour: the accent of the checked tiles, read from the theme
  (`-slider-active-background-color`, Dracula's purple), made opaque so the bar is solid.
  When the theme gives none, the bar takes the stylesheet fallback of the checked tiles,
  through one shared selector: that fallback is translucent, so the bar is not solid then.
- Generic: no player-specific code. Any MPRIS player without a track title is titled from
  its own window, whatever the application.
- Cap: over three players, the kept blocks are chosen playing first, then paused, then
  titled (track or window title), then the rest; they are shown by name, so a play or pause
  never reorders the rows.

## As built

- `mediaModel.js`: `blockText(metadata, name, windowTitle)` never gives null now;
  `hasTrackTitle()`, `isPlaying()`; `visibleBlocks()` keeps every player and adds
  `playing` to each block.
- `mediaModel.js` also: `onePerOwner()` shared by the blocks and `untitledPlayers()`, and
  `keepRank()` for the cap. `syncBlockViews()` hands the accent to every view.
- `mediaFocus.js`: `findPlayerWindow()` taken out of `focusPlayer()`, which uses it
  unchanged; an optional set of excluded windows (the closed ones) is left out before the
  choice, click-to-focus passes none.
- `mediaWindowTitles.js` (new): follows the windows of the players without a track title
  (`MediaPlayers.untitled`, one per owner), hands their titles to
  `MediaPlayers.setWindowTitle()`. Looked up again at each player change while a player has
  no window, and for every followed player at menu opening (the watch moves when the window
  differs). A closed window is left out of later choices. Entries are tied to the bus
  name's owner: a name taken over by another process starts again, late replies dropped. A
  released player's window title is cleared. `destroy()` releases every handler.
- `mediaControls.js` (new): the flow out of `applet.js` (players and window titles started
  and stopped together, follow before the blocks, menu opening), tested on the fake bus.
- `mediaWindows.js`: `watchTitle(window, onTitle, onGone)`, returning `release()`.
- `mediaBlock.js`: a `quick-settings-media-bar` actor before the text on every block; the
  `quick-settings-media-bar-playing` class is toggled on that same actor (St caches styles
  per actor), and the theme accent set inline only while playing.
- `themeColors.js`: `accent` beside the tile colours; `menuContent.js` hands it to every block.
- `uiHelpers.js`: `backgroundStyle()` (moved from `tile.js`) and `setStyleClass()`, used by
  the tiles and the blocks.
- Sizes in `stylesheet.css`: bar 3 px wide, 2 px corners, 4 px between bar and text.

## First live trial, 2026-11-19

The owner tried the branch with GNOME Videos playing a file: "yes it works, but i want it to
be idempotent, like if i use another app it still works". The Videos row appeared with the
window title, the purple bar showed while playing. Requirement taken: generic for any MPRIS
player, no application-specific code (none was added). The owner asked for the merge on
2026-11-19, after the audit fixes.

## Audit, 2026-11-19

0 HIGH, 4 MEDIUM and 8 LOW, all fixed on the branch: the cap keeps playing players first;
closed windows are left out so another window takes over; `watchTitle()` and the
`applet.js` flow (now `mediaControls.js`) are tested, with the disconnect, the follow, the
construction and the destroy each proven to fail a test when removed; accent tests and a
stylesheet check that every `quick-settings-*` class set in the JavaScript has a selector
(`quick-settings-list-label` has none, listed apart for the owner); fallback colour
documented; stale comments and wording fixed; a released player's window title cleared;
windows looked for again at menu opening; one follow per owner; entries tied to the owner.
