Status: DONE

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

C. Save prompt, chosen after the audit, "Go to the prompt (Recommended)": "Only when a
save dialog appears: the overview closes and takes you to that dialog, on its workspace.
This is what Cinnamon itself does when you close a window from the overview. Without
unsaved work, nothing changes: the overview stays open."

```
Close on an app WITHOUT unsaved work:

  overview stays open, same workspace   (as today)

Close on an app WITH unsaved work:

  overview closes
        |
        v
  +------------------------------+
  |  Save changes before closing? |
  |                              |
  |  [Don't save] [Cancel] [Save] |
  +------------------------------+
  shown on the app's workspace, in front
```

## Differences from the mockups

- No arrow under the menu: Cinnamon 6.4 menus have none.
- A left or middle click on the icon whose menu is open does what that click always does
  (Cinnamon's menu manager lets clicks on the menu's source through). A click on another
  icon only closes the menu.
- The wheel and Super do nothing while the menu is open: its grab makes Scale no longer the
  only modal.
- The app name tooltip of the icon is not shown while its menu is open.

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
   list is taken when the menu opens, with the label; Close asks only those of it still
   closable when chosen: never more windows than the label says, none opened meanwhile.
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
    `dockMenu.js`, in English in every locale, not passed through `_()`: Cinnamon
    translates "Close" but not the other two, and the menu would mix languages.
11. Save prompt (answer C), as stock `WindowClone.closeWindow` (`workspace.js`): before the
    windows are asked to close, `window-added` is watched on their workspaces (the active
    one for a window on every workspace). The first new window whose `get_transient_for()`
    is one of them is gone to from an idle, with the dock's `activateWindow`: its workspace,
    then Scale closes. The watch stops at that match, when Scale starts hiding, when the
    dock is destroyed, and at the next Close. Stock has no time limit, neither has this
    watch; stock also stops at the first new window of any kind, this one waits for a
    prompt.
12. The icon's tooltip gets `preventShow` and `hide()` (`tooltips.js`) while its menu is
    open, and is free again when the menu closes or is destroyed.

## How it is built

| File | Change |
|---|---|
| `dockMenu.js` (new) | `getDockMenuEntries`, `getMenuPosition`, `DockIconMenu` (placement), `DockMenu` (one menu, manager, Escape guard, destroy) |
| `appDock.js` | Right click opens the menu; `getClosableWindows`, `getStillClosableWindows`, `closeWindows`, `ClosePromptWatch`; menu closed on rebuild and on `hiding`, destroyed with the dock |
| `scripts/cinnamon-scale-test.js` | Entries for 0, 1 and 3 windows; placement with float noise and the monitor's edges; lifecycle on a stock-like menu manager (modal count back to Scale's on every close path, one at a time, toggle, Escape stroke, click outside, destroy once, tooltip); the real dock (hiding, rebuild, destroy, Close set counted at opening, left and middle clicks unchanged); save prompt (gone to, unrelated window ignored, watch released on match, hiding, destroy) |
| `scripts/cinnamon-scale-test.sh` | Header lists the dock menu |
| `cinnamon/README.md` | Behaviour, limitations, private member, assumptions |

## Checked by hand

Tried live by the owner on 2026-11-19 after a Cinnamon restart, before the audit fixes:
"all work". The audit then added the save prompt (answer C), the count taken at opening,
the hidden tooltip and English labels. Second trial by the owner on 2026-11-19, after the
fixes: an app that draws its save prompt inside its own window leaves Scale open (no new
window to follow); the owner chose no timer, the limit is in the README. The list
below is what to check after a change here (Alt+F2 r):

1. An editor with unsaved text and a separate prompt window, Close from its dock menu:
   Scale closes on the editor's workspace, its save prompt in front. Cancel in the
   prompt: the editor stays open.
2. Super, right click a running app's icon with one window: menu above the icon, theme
   colours, "New window", "Close", no app name tooltip over it. Left click and middle click
   on icons behave as before.
3. An app with 3 windows on two workspaces: "Close 3 windows"; choose it: all three close,
   Scale stays open on the same workspace, the icon leaves the dock if not pinned.
4. A pinned app not running: only "New window"; choose it: a window opens, Scale closes.
5. Menu open: a click on the background, on the strip, on another dock icon closes it and
   does nothing else; Escape closes only the menu, a second Escape closes Scale; typing then
   still searches; the wheel does nothing while it is open, switches again after.
6. An icon at the far left and far right of the dock: the menu stays inside the screen.
