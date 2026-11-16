Status: DONE

# Cinnamon Scale across several screens

Extension `cinnamon/extensions/scale-wheel-switch@bgi`, Cinnamon 6.4, X11, tested on two
1920x1080 monitors side by side with workspaces spanning both.
First design: [`2026-11-11-cinnamon-scale-overview.md`](2026-11-11-cinnamon-scale-overview.md).
Install and usage: [`cinnamon/README.md`](../../cinnamon/README.md).

## Goal

Every screen gets its own workspace strip in Scale, and a window can be dragged to another
screen: onto its window area, or onto a thumbnail of its strip.

Out of scope: the search field and the application grid on other screens, Expo, any file
under `/usr/share/cinnamon`, new dependencies.

## Validated mockups

### 1. A strip on every screen

```
SCREEN 1 (primary)              SCREEN 2
+----------------------------+  +----------------------------+
|    [ Type to search... ]   |  |  [ws1*] [ws2 ] [ws3 ] [ws4]|
|  [ws1*] [ws2 ] [ws3 ] [ws4]|  |----------------------------|
|----------------------------|  |  [win D]                   |
|  [win A]      [win B]      |  |                            |
|        [win C]             |  |          [win E]           |
+----------------------------+  +----------------------------+
 thumbnails = windows of        thumbnails = windows of
 screen 1 in each workspace     screen 2 in each workspace
```

### 2. Dragging a window to another screen

```
Dragging win C from screen 1 over screen 2:

SCREEN 1                        SCREEN 2
+----------------------------+  +----------------------------+
|    [ Type to search... ]   |  |  [ws1*] [ws2 ] [ws3 ] [ws4]|
|  [ws1*] [ws2 ] [ws3 ] [ws4]|  |############################|
|----------------------------|  |#  [win D]                  #|
|  [win A]      [win B]      |  |#       [c]<- pointer       #|
|        (win C, faded)      |  |############################|
+----------------------------+  +----------------------------+
 ### = highlighted border while a drop is possible

 release in ###        -> win C on screen 2, same workspace
 release on [ws3] of 2 -> win C on screen 2, workspace 3
 Scale stays open, windows re-arrange on both screens
```

## Decisions

1. Each screen has its own strip; the search field stays on the primary screen only.
2. On the other screens the strip starts at the very top, so their window area is taller.
3. A window released anywhere on another screen's window area, over other windows included,
   moves to that screen on the same workspace. The area gets the thumbnail drop highlight.
4. A drop on a thumbnail changes the workspace and the screen to those of the thumbnail.
5. Same screen and same workspace refuses the drop, with no highlight.
6. Sticky windows can change screen, never workspace, on both drop targets.
7. The drag picture is sized after the smallest thumbnail of the open strips, so it fits in
   any of them.
8. Strips are built from the monitor list at each opening of Scale: nothing is kept between
   openings, so screens added or removed show at the next opening.

## How it is built

| File | Change |
|---|---|
| `monitorDrop.js` | New. Drag monitor plus highlight actor that takes the drop on a screen's window area |
| `workspaceStrip.js` | A strip per monitor index; thumbnail drop also moves to the strip's monitor |
| `extension.js` | One strip per monitor on Scale `showing`, all torn down on `hidden` |
| `uiHelpers.js` | `DragHover`: drop highlight tied to the drag, shared by both drop targets |
| `stylesheet.css` | `.scale-monitor-drop-target` shares the thumbnail border width and drop color |

Findings worth keeping:

- `WorkspaceMonitor._dropRect` is never given a size and has no drop handlers: it cannot be
  the screen's drop target.
- dnd looks for a drop target among the parents of the actor under the pointer only. Over a
  window clone, the parents are the clone's `WorkspaceMonitor` actor (no delegate), then the
  workspace and the view. A drag monitor sees every motion instead; the highlight it shows is
  on top, so it is the actor under the pointer and takes the drop.
- Returning `SUCCESS` from a drag monitor's `dragDrop` returns before `drag-end` and the
  drag cleanup. Changed later: the drag monitor's `dragDrop` returns `CONTINUE` and clears
  the highlights of the targets that do not take the drop (see `cinnamon/README.md`).
- On a thumbnail drop, `move_to_monitor` runs before `change_workspace`, while the window is
  still on the active workspace. Cinnamon's "Move to monitor" menu item only calls
  `move_to_monitor`; Expo (`expoThumbnail.js`) calls `change_workspace` first, except with
  "workspaces only on primary" on. The order used here worked in testing; it could not be
  checked against muffin's source, which is not installed.

## Known limitations

Listed in [`cinnamon/README.md`](../../cinnamon/README.md#known-limitations).
