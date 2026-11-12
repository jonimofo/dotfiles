Status: DONE

# Cinnamon Scale as a GNOME-style overview

Extension `cinnamon/extensions/scale-wheel-switch@bgi`, Cinnamon 6.4, X11.
Install and usage: [`cinnamon/README.md`](../../cinnamon/README.md).

## Goal

Scale (hot corner or Super) shows a search field, a strip of workspace thumbnails and the
windows of the current workspace. Workspaces are switched with the wheel or a click, windows
are moved by drag and drop, applications are launched by typing.

Out of scope: Expo, other monitors, adding, removing or renaming workspaces, any file under
`/usr/share/cinnamon`, publishing on cinnamon-spices.

## Validated mockups

### 1. Top strip

```
+------------------------------------------+
|     [ws1*]  [ws2 ]  [ws3 ]  [ws4 ]       |
|------------------------------------------|
|                                          |
|   [win A]        [win B]                 |
|                                          |
|         [win C]                          |
|                                          |
+------------------------------------------+
 drag win C onto [ws3] -> moves it to ws3
 wheel -> big view slides, * follows
 click [ws2] -> switch, Scale stays open
```

The thumbnails are centered in the full-width band, under the search field (PR #26).

### 2. Thumbnail content

First choice, "mini live windows" (wallpaper plus live copies of each window at its real
position):

```
+-----------+  +-----------+
|  ##   ### |  |    ####   |
|  ##   ### |  |    ####   |
|       ws1*|  |       ws2 |
+-----------+  +-----------+
```

Replaced after use by "spread like Scale": each thumbnail lays its windows out side by side
with no overlap, a mini Scale view. Every window, including minimized ones, is visible.

```
Workspace 2 (3 windows, 1 maximized):
+-------------------+
| [Firefox] [Term]  |
|      [Files]      |
|       Workspace 2 |
+-------------------+
 every window visible, no overlap
```

### 3. Search, GNOME order

```
Super pressed:
+------------------------------------+
|        [ Type to search...  ]      |
| [ws1*] [ws2 ] [ws3 ] [ws4 ]        |
|------------------------------------|
|   [win A]      [win B]             |
|         [win C]                    |
+------------------------------------+

After typing "fir":
+------------------------------------+
|        [ fir_               ]      |
| [ws1*] [ws2 ] [ws3 ] [ws4 ]        |
|------------------------------------|
|  [Firefox]* [Firewall] [Filezilla] |
|  Enter -> launch first (*)         |
+------------------------------------+
```

The "Enter -> launch first" line is an annotation, not text in the interface.

## Decisions

1. The header is drawn on the primary monitor only, where Scale itself draws.
2. After a drop the user stays on the current workspace; the window leaves the big view and
   appears in the target thumbnail.
3. A click on a thumbnail switches workspace and keeps Scale open.
4. The label is the Cinnamon workspace name. The active workspace has a highlighted border.
5. No helper text in the interface, except the search placeholder.
6. Thumbnails show exactly the windows Scale shows (`Main.isInteresting`), in Scale's order.
   A sticky drop-down terminal such as Guake is therefore left out.
7. Sticky windows and a window's own workspace refuse a drop. Clicks in the strip's empty
   area are swallowed, so they never close Scale.
8. Super toggles Scale. The Menu applet moves to Super+A, set by hand in its settings.
9. Search covers the applications of the Menu, by name, generic name and keywords. Typing
   needs no click. Arrows select, Enter or a click launches and closes Scale, Escape clears
   the field, then closes Scale. With an empty field, arrows and Enter keep Scale's
   window selection.

## How it is built

| File | Role |
|---|---|
| `extension.js` | Lifecycle, wheel switching, header creation on Scale `showing` / `hidden` |
| `appSearch.js` | Search field, application index and ranking, result grid, key handling |
| `workspaceStrip.js` | Strip, thumbnails, grid layout, click, drop target, big view inset |
| `windowDrag.js` | Makes Scale's window clones draggable |
| `superKey.js` | Super hotkey |
| `uiHelpers.js` | Shared constants, click swallowing, natural sizes, modal checks |
| `stylesheet.css` | Colors, paddings, sizes |

Findings worth keeping:

- Scroll events in Scale never bubble to the overview actors: the wheel is read on the
  stage's `captured-event`.
- Scale lays windows out per `WorkspaceMonitor`, not through `WorkspacesView.setGeometry`.
  `WorkspacesView.updateWindowPositions()` is broken in 6.4; the extension calls
  `positionWindows` on each `WorkspaceMonitor` instead.
- `dnd`'s `dragActorMaxSize` measures a freshly created drag picture wrongly, so the
  extension shrinks it itself, around the pointer.
- Scale's view must not be unmapped to hide the windows during a search (it would lose the
  keyboard focus and connect its swipe handlers twice): it is made transparent and the
  result grid sits above it.
- Keys reach the search through a wrapper around `Workspace.prototype._onKeyPress`, so
  Scale keeps the keyboard focus and its own shortcuts.

## Known limitations

Listed in [`cinnamon/README.md`](../../cinnamon/README.md#known-limitations).
