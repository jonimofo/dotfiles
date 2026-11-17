Status: DONE

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
  inactive and dimmed. The look was the header's round buttons at first; since the review
  rounds they are bare icons (below).
- Live: `PropertiesChanged` of each player. Every signal subscription is released when its
  player leaves and on applet removal; a failed call is logged with the player name.
- D-Bus only, through the session bus connection: no subprocess, no new package.
- Configure: `Media controls` at the end of the Tiles tab, where the CPU line was, shown by
  default. Saved lists holding `cpu-line` drop it and get the media entry.
- CPU line removal: its modules, fixtures, constants, tests, README lines and the `env`
  option of the subprocess helper (only the CPU line used it).

## As built

- `mediaModel.js` (pure: names, texts, button states, order and cap), `mediaPlayers.js`
  (session bus: ListNames, GetNameOwner, NameOwnerChanged, GetAll, PropertiesChanged),
  `mediaBlock.js` (one block's actors), wired in `menuContent.js` and `applet.js`.
- Cut lengths (`MEDIA_TITLE_MAX`, `MEDIA_ARTIST_MAX`, `MEDIA_PLAYER_NAME_MAX`): 44, 20 and
  16 characters (`VLC media player`, VLC's Identity, fits whole); the labels also ellipsize
  at their width.
- The fallback player name is the first part after `org.mpris.MediaPlayer2.`, without an
  instance suffix (`firefox.instance_1_2` gives `Firefox`, `vlc-123` gives `Vlc`).
- Hidden media controls follow no player: the watcher starts when they show and is
  destroyed when they hide.

## Smaller buttons, italic player name, more space (review round)

Request: "reduit un peu la taille des boutons de lecture et >>, + je veux en italic le nom VLC
player - Mozilla, etc + rajoute un peu de gap pour ne pas que la ligne du haut ne touche les
boutons ?"

```
Now:
+--------------------------------------------+      separator line
| Song title                                 |
| Artist · VLC media player  (<<) (||) (>>)  |      large round buttons, close to what is above

Wanted:
+--------------------------------------------+
                                                     more space under the line
| Song title                                 |
                                                     more space above the buttons
| Artist · VLC media player    (<<)(||)(>>)  |      smaller buttons, player name in italic
```

- Media buttons: own classes, 28 px round with 12 px icons at first. Second review round,
  owner's words: "les icones des boutons doivent etre centrées dans les boutons !!! en fait
  supprime meme les ronds, garde juste les << || et >> , ça doit être aligné avec le label
  VLC media... etc". Now bare 16 px icons with 4 px of padding, 6 px apart, centred on the
  player name's line; only the hover keeps the header buttons' tint.
- Line 2 in two labels: `artist · ` normal, the player name in italic (`font-style`). The
  model returns both parts; without an artist only the player name shows. Too long: the
  artist ellipsizes first, the player name (at most `MEDIA_PLAYER_NAME_MAX` characters) is not cut by the label.
- Block spacing 4 px to 8 px: under the separator and between the title and the buttons row.

## Audit fixes

- Every signal and reply is checked against its D-Bus type before it is read
  (`MPRIS_TYPES`); `GetAll` asks for its reply type through `AsyncHelpers.callDbus`. Anything
  else is ignored and logged once per player, without a stack trace.
- A player gone before it answers is not logged. Log lines carry the player name cut to
  `MEDIA_PLAYER_NAME_MAX` and the player's error text cut to `MEDIA_ERROR_TEXT_MAX`.
- Control and bidi control characters are removed from every text shown.
- One update per burst of changes (`AsyncHelpers.IdleCoalescer`), cancelled on destroy.
- One ordered list of button keys, `MEDIA_BUTTON_ORDER`, for the model and the block.

## A click brings the player's window forward (review round)

Request: "sur les controles medis, on click, est-ce possible de focus la fenetre / onglet si
navigateur ?" Chosen: "Le titre et la ligne du lecteur": a click on the text, title or artist
and player line, brings the player's window to the front and closes the menu; the three icons
keep their role; the text is highlighted on hover. The owner was told: the window yes, the
browser tab no (no browser exposes tab switching from outside); when the playing tab is
already the active tab of a window, that window is the one chosen.

```
| Song title                                 |   clic : fenêtre au premier plan
| Artist · VLC media player     <<   >   >>  |   clic sur le texte : idem
                                  ^   ^   ^
                                  icônes : inchangées
```

- Order (`MediaFocus.focusPlayer`): the windows of the application named by `DesktopEntry`
  (`Cinnamon.AppSystem.lookup_app`, `get_windows`), else the windows of the player's process
  (`GetConnectionUnixProcessID` on its owner, then the window actors' `get_pid`), else MPRIS
  `Raise` when `CanRaise`, else nothing, logged once per player. VLC reports `CanRaise`
  false, so its window comes from `DesktopEntry` `vlc`.
- Among several windows (`MediaModel.chooseWindow`): one whose title holds the track title,
  else the one used last (`get_user_time`).
- Activation: `Main.activateWindow(window, time)`, the stock window list's call, after the
  menu closes, with the click's event time.
- The text is one `St.Button`, focusable, with the list entries' hover and focus tint and the
  accessible name `Show <player>`; the icons are outside it.
- Limits: a window, not a tab; a browser window whose active tab is not the playing one can
  only be told apart by being used last.

### Delta audit: only the player's own process

Owner's choice for the finding that a player could name another application's
`DesktopEntry`: "Corriger les 8, avec vérification du processus". The process id is read
first; the `DesktopEntry` application's windows are kept only when their pid is the player's;
none kept: the process's interesting windows (`Main.isInteresting`); pid unknown: no
unverified window, MPRIS `Raise` when `CanRaise`, else the single log. `get_windows()` is not
sorted by last use: `MediaModel.chooseWindow` takes the highest user time itself.

## Alternate backgrounds for several players (review round)

Request: "quand plusieurs lecteurs : peut on utiliser alternate colors ?? pour les rows".
Chosen: "Fonds alternés, sans lignes": every second block gets a faint lighter background with
rounded corners, the same veil as the menu's lists; the lines between players go; one line
stays above the first block, to separate it from the tiles.

The look below has the owner's track, channel and video names replaced by neutral ones:

```
| [ Keyboard Low ]                           |
+--------------------------------------------+   ligne sous les tuiles
| Song title                                 |
| Artist · Firefox                  <<  >  >>|   fond normal
|░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░|
|░ Video title                              ░|   fond légèrement clair
|░ VLC media player                <<  >  >>░|
|░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░|
```

- `MediaModel.isTinted(index)`: the second and fourth blocks on screen; applied after every
  add, remove or move, so a single block is never tinted.
- The tint is the in-place lists' background, shared through one grouped rule; every block
  has the same 6 px by 4 px padding and 12 px corners, so the text lines up.
- One separator at the top of the media section, hidden with the section when no block shows.
- The text's hover tint (the list entries' 0.12 white) lies over the 0.06 veil, so a hovered
  text on a tinted block is still visibly lighter.

## Out of scope

Cover art, progress bar, volume per player, a player chooser; anything else.
