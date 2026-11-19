Status: VALIDATED

# Cinnamon Scale: right click menu on a dock icon, to close an app

Extension `cinnamon/extensions/scale-wheel-switch@bgi`, Cinnamon 6.4, X11.
Earlier designs: [`2026-11-12-cinnamon-scale-dock.md`](2026-11-12-cinnamon-scale-dock.md),
[`2026-11-18-cinnamon-scale-reorder-workspaces.md`](2026-11-18-cinnamon-scale-reorder-workspaces.md).
Install and usage: [`cinnamon/README.md`](../../cinnamon/README.md).

## Goal

In Scale, close an app from its dock icon without going to its workspace: a right click on
the icon opens a menu above it with "New window" and, for a running app, "Close" or
"Close N windows", which asks every window of the app to close. Scale stays open on the same
workspace.

Out of scope: left and middle clicks on the dock, clicks on Scale's windows
(`windowClick.js`), the strip, top row, search, hot corners, applets, settings keys, other
menu entries.

## Validated answers

A. Trigger, chosen "Right click menu": "Right click on an icon opens a small menu above it:
Close, New window. Left click stays as today. Two clicks to close, so no app is closed by
accident, and it leaves room for other actions later."

```
Overview dock, right click on an icon:

              +------------------+
              | New window       |
              | Close            |
              +------------------+
                       v
  +------------------------------------------+
  |  [Files] [Web] [Term] | [Maps] [Video]   |
  |     .      .               .      .      |
  +------------------------------------------+

  left click   ->  goes to the app, as today
  right click  ->  menu above the icon
  middle click ->  new window, as today
  After Close: overview stays open, same
  workspace, the icon leaves the dock if the
  app is not pinned.
```

B. Close, chosen "Close all its windows": "Every window of the app is asked to close, on
every workspace, the same as clicking each window's X. An app with unsaved work still shows
its own "save?" dialog. For an app that is not running, the menu shows only New window."

```
Running app with 3 windows:      Running app with 1 window:     App not running:

   +------------------+             +------------------+          +------------------+
   | New window       |             | New window       |          | New window       |
   | Close 3 windows  |             | Close            |          +------------------+
   +------------------+             +------------------+
```

## Decisions

1. The menu is Cinnamon's own `PopupMenu.PopupMenu` with `PopupMenuItem`s, styled by the
   user's theme, in `Main.uiGroup`. No style of our own.
2. Stock Scale's window menu (`workspace.js`, `WindowContextMenu`) is a `PopupComboMenu`
   with no grab: it only closes on Scale's background press and its own events, so a click
   on the dock or the strip, which swallow clicks, would leave it open. The dock menu uses a
   `PopupMenuManager` instead, as every panel applet does: a modal grab on top of Scale's,
   a press outside closes the menu and goes no further, Escape closes it, and the grab's
   pop gives the key focus back to Scale's view. Stock's pattern kept: one menu at a time
   (a module-level holder there, one `DockMenu` per dock here), the menu destroyed each
   time it closes.
3. Placement: the stock placement for a menu attached below (`St.Side.BOTTOM`) puts the menu
   against the monitor's bottom edge, over the dock. A subclass overrides
   `_calculatePosition` with the pure `getMenuPosition`: centred above the icon, kept inside
   the primary monitor, rounded. Cinnamon 6.4 menus have no arrow (the box pointer was
   removed), so the "v" of the mockup is not drawn.
4. Which windows count: `getAppWindows(app)` (`Cinnamon.App.get_windows()` filtered by
   `Main.isInteresting`, the same set Scale shows and the dock's dot uses), minus the
   windows whose `can_close()` is false. Skip-taskbar windows and dialogs attached to a
   window are left out by `Main.isInteresting`; they usually close with their parent. The
   label counts that list when the menu opens; Close reads it again when chosen, since a
   window may close meanwhile without any app state change.
5. Close calls `Meta.Window.delete(global.get_current_time())` on each, what the title
   bar's close button and stock's window menu do. Never a process kill. Nothing switches
   workspace, Scale is not hidden; the dock follows the app stopping as it already does.
6. "New window" calls `UiHelpers.openNewWindow(app)`, the middle click's action.
7. An entry's action runs after the menu is closed and destroyed, so it never runs under
   the menu's grab or inside its signal handlers.
8. The menu closes when the dock rebuilds its icons (its icon is destroyed), when Scale
   starts hiding (`hiding`), and is destroyed with the dock (Scale hidden, extension
   disabled). A second right click on the same icon closes it.
9. Scale closes on an Escape release; the menu closes on the press. While the menu is open
   a `captured-event` guard on the stage marks an Escape press, and swallows the rest of that
   stroke (repeats and the release) once the menu is closed. Closed any other way, the guard
   is disconnected at once.
10. Strings: "New window", "Close", "Close %d windows" are constants at the top of
    `dockMenu.js`, passed through Cinnamon's global `_()` like the search placeholder.

## How it is built

| File | Change |
|---|---|
| `dockMenu.js` (new) | `getDockMenuEntries`, `getMenuPosition`, `DockIconMenu` (placement), `DockMenu` (one menu, manager, Escape guard, destroy) |
| `appDock.js` | Right click opens the menu; `getClosableWindows`, `closeWindows`, `runMenuAction`; menu closed on rebuild and on `hiding`, destroyed with the dock |
| `scripts/cinnamon-scale-test.js` | Entries for 0, 1 and 3 windows; placement with float noise and the monitor's edges; lifecycle (one at a time, toggle, Escape stroke, click outside, rebuild, destroy, no handler left); Close set and calls; left and middle clicks unchanged |
| `scripts/cinnamon-scale-test.sh` | Header lists the dock menu |
| `cinnamon/README.md` | Behaviour, limitations, private member, assumptions |

## To check by hand

Not yet tried live. After a Cinnamon restart (Alt+F2 r):

1. Super, right click a running app's icon with one window: menu above the icon, theme
   colours, "New window", "Close". Left click and middle click on icons behave as before.
2. An app with 3 windows on two workspaces: "Close 3 windows"; choose it: all three close,
   Scale stays open on the same workspace, the icon leaves the dock if not pinned.
3. An editor with unsaved text: Close shows its save dialog.
4. A pinned app not running: only "New window"; choose it: a window opens, Scale closes.
5. Menu open: a click on the background, on the strip, on another dock icon closes it and
   does nothing else; Escape closes only the menu, a second Escape closes Scale; typing then
   still searches; the wheel does nothing while it is open, switches again after.
6. An icon at the far left and far right of the dock: the menu stays inside the screen.
