Status: VALIDATED

# Cinnamon Quick Settings: media controls

Applet `cinnamon/applets/quick-settings@bgi`, Cinnamon 6.4, X11. Issue #34. Earlier plans:
[`2026-11-12-cinnamon-quick-settings-applet.md`](2026-11-12-cinnamon-quick-settings-applet.md),
[`2026-11-16-cinnamon-quick-settings-extras.md`](2026-11-16-cinnamon-quick-settings-extras.md).

## Goal

The menu ends, under the tiles, with one media block per MPRIS player that has something to
play: the title in bold, then `artist · player` and three buttons (previous, play or pause,
next). No player with a track: no block. The CPU line goes away with its setting.

## Owner's words

- "maintenant fait le controle media"
- On the first mockup: "et supprime aussi la ligne cpu"

## Validated looks

A. Content, chosen "Titre, artiste, trois boutons":

```
| [ Balanced       > ] [ Airplane mode    ] |
| [ Keyboard  Low    ]                      |
+--------------------------------------------+
| Song title                                 |
| Artist                  [<<]  [||]  [>>]   |
+--------------------------------------------+
```

B. Several players, chosen "Un bloc par lecteur":

```
| Song title                                 |
| Artist · VLC            [<<]  [||]  [>>]   |
+--------------------------------------------+
| Video title                                |
| Channel · Firefox       [<<]  [>]   [>>]   |
```

C. Empty state, chosen "Rien, le bloc disparaît":

```
Aucun lecteur :

| [ Keyboard  Low    ]                      |
+--------------------------------------------+

Un lecteur avec un morceau :

| [ Keyboard  Low    ]                      |
+--------------------------------------------+
| Song title                                 |
| Artist · VLC            [<<]  [||]  [>>]   |
+--------------------------------------------+
```

D. The CPU line is removed from the applet, with its setting.

## Decisions

- Players: names on the session bus starting with `org.mpris.MediaPlayer2.`, found with
  `ListNames` and followed with `NameOwnerChanged`; one block per player whose `Metadata` has
  a non-empty `xesam:title`. A player that loses its track or leaves the bus loses its block
  at once. Two names owned by the same process (a player and its instance name) are one
  player. Order: display name, then bus name; at most three blocks.
- Texts: title on line 1, bold, one line, cut with an ellipsis. Line 2 `artist · player`:
  `xesam:artist` joined with `, `, and `Identity` of `org.mpris.MediaPlayer2`, else the bus
  name's player part capitalised. No artist: the player name alone. Texts are set as plain
  label text, never as markup.
- Buttons: `media-skip-backward-symbolic`, `media-playback-pause-symbolic` while
  `PlaybackStatus` is `Playing` (else `media-playback-start-symbolic`),
  `media-skip-forward-symbolic`; they call `Previous`, `PlayPause`, `Next`. A button whose
  capability is false (`CanGoPrevious`, `CanGoNext`, `CanPlay` or `CanPause`, `CanControl`) is
  inactive and dimmed. The look is the header's round buttons.
- Live: `PropertiesChanged` of each player. Every signal subscription is released when its
  player leaves and on applet removal; a failed call is logged with the player name.
- D-Bus only, through the session bus connection: no subprocess, no new package.
- Configure: `Media controls` at the end of the Tiles tab, where the CPU line was, shown by
  default. Saved lists holding `cpu-line` drop it and get the media entry.
- CPU line removal: its modules, fixtures, constants, tests, README lines and the `env`
  option of the subprocess helper (only the CPU line used it).

## Out of scope

Cover art, progress bar, volume per player, a player chooser; anything else.
