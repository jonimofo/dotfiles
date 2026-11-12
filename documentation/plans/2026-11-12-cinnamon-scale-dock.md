Status: DONE

# Cinnamon Scale dock

Extension `cinnamon/extensions/scale-wheel-switch@bgi`, Cinnamon 6.4, X11.
Earlier designs: [`2026-11-11-cinnamon-scale-overview.md`](2026-11-11-cinnamon-scale-overview.md),
[`2026-11-12-cinnamon-scale-second-screen.md`](2026-11-12-cinnamon-scale-second-screen.md).
Install and usage: [`cinnamon/README.md`](../../cinnamon/README.md).

## Goal

A dock at the bottom of the primary screen in Scale, like the GNOME dash: the apps pinned
in the panel's window list, then the other running apps, with a click that goes to the app
or launches it.

Out of scope: the dock on other screens, a right-click menu, drag and drop on the dock,
keyboard navigation of the dock, window count indicators, any file under
`/usr/share/cinnamon`, new dependencies.

## Validated mockup

```
SCREEN 1 (primary)              SCREEN 2
+----------------------------+  +----------------------------+
|    [ Type to search... ]   |  |  [ws1*] [ws2 ] [ws3 ] [ws4]|
|  [ws1*] [ws2 ] [ws3 ] [ws4]|  |----------------------------|
|----------------------------|  |  [win D]                   |
|  [win A]      [win B]      |  |                            |
|        [win C]             |  |          [win E]           |
|   +--------------------+   |  |                            |
|   | (Fi)(Fx)(Te)|(Co)  |   |  |                            |
|   |      .   .  | .    |   |  |                            |
|   +--------------------+   |  |                            |
+----------------------------+  +----------------------------+
 (Fi)(Fx)(Te) = pinned in the panel
 (Co)         = running, not pinned
  .           = app has a window open
```

## Decisions

1. Content: the panel's pinned apps, a separator, then every other running app. A dot
   under an icon means the app has a window open. The separator only splits two
   non-empty parts.
2. GNOME click behaviour: an app with no window is launched on the current workspace; an
   app with windows goes to its most recent one, switching workspace if needed. Scale
   closes. A middle click always opens a new window; a right click does the same as a
   left click.
3. Primary screen only. A launched app opens where Cinnamon places it.
4. Scale's windows on the primary screen stop above the dock, as they start below the strip.
5. Icons only; the app name shows as a tooltip on hover.
6. The dock stays visible during a search; the result grid ends above it.
7. The pinned list is read from the panel applet at each opening of Scale. Pinning stays in
   the panel; the dock has no right-click menu.
8. Dropping a window on a dock icon does nothing.
9. The other running apps are ordered by their oldest window, so they keep their place
   when the focus changes.
10. The dock's height is fixed at opening, so the windows never move while it updates.
11. With too many apps for the screen's width, the icons shrink to fit. No scrolling.
12. Window-backed apps (a window with no `.desktop` file) are left out: they cannot open a
    new window.
13. No app at opening: no dock until the next opening. A dock that becomes empty keeps its
    place until Scale closes.

## How it is built

| File | Change |
|---|---|
| `appDock.js` | New. App list, icons with tooltip and dot, click behaviour, live update |
| `workspaceStrip.js` | A bottom inset, so the primary screen's windows end above the dock |
| `extension.js` | Dock built after the search field, its height given to the primary strip |
| `uiHelpers.js` | `openNewWindow`, shared by the search and the dock |
| `appSearch.js` | Launches through `openNewWindow` |
| `stylesheet.css` | Dock, icon, separator and dot styles, icon size as `-scale-dock-icon-size` |

Findings worth keeping:

- The pinned list is reached through the running applet:
  `Main.AppletManager.getRunningInstancesForUuid('grouped-window-list@cinnamon.org')`, the
  same call the applet makes, then the instance's `settings.getValue('pinned-apps')`, its
  own `AppletSettings`. No settings file is read by path.
- `Cinnamon.AppSystem.get_running()` gives no start order, so the other running apps are
  sorted on the smallest `MetaWindow.get_stable_sequence()` of their windows: muffin numbers
  windows in creation order.
- `Main.activateWindow(window, time, workspaceIndex)` returns without closing Scale when it
  has to switch workspace. The dock activates the window's workspace first, then calls
  `Main.activateWindow(window, time)`, which closes Scale.
- The stock `Tooltips.Tooltip` works inside the modal overview: Cinnamon's own Expo uses it
  on its window clones. It destroys itself with its actor, so a rebuild leaves none behind.
- `app-state-changed` on `Cinnamon.AppSystem` (also used by Cinnamon's portal handlers)
  fires when an app starts or stops running; the dock rebuilds once, when idle.

## Known limitations

Listed in [`cinnamon/README.md`](../../cinnamon/README.md#known-limitations).
