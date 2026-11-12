# cinnamon/

My Cinnamon extensions and applets, versioned. Each one is symlinked into
`~/.local/share/cinnamon/extensions/` or `~/.local/share/cinnamon/applets/`.

## What lives here

- `extensions/scale-wheel-switch@bgi/`: turns Scale into a GNOME-style overview.
  Tested on Cinnamon 6.4 (X11).
- `extension.sh`: enable, disable or reload one extension, keeping the others enabled.
- `applets/quick-settings@bgi/`: one panel button that opens a GNOME-style Quick Settings
  menu (sound, microphone, brightness, network, Bluetooth, VPN, power and session).
  Tested on Cinnamon 6.4 (X11). See [Quick Settings](#quick-settings-what-it-does) below.
- `applet.sh`: enable, disable or reload one applet, keeping the other panel entries.
  Enable adds it at the right end of panel1's right zone.

## Custom shortcut: dropdown Nemo

Super+E toggles a dropdown Nemo window through a Cinnamon custom shortcut named
"Dropdown Nemo", command `/home/bgi/Repos/dotfiles/scripts/nemo_dropdown_toggle.sh`.
Its header lists the dependencies and why tdrop is not used.

## What scale-wheel-switch does

In Scale (hot corner or Super), from top to bottom: a search field, a strip with one
thumbnail per workspace, both centered, then Scale's windows, then a dock of applications.
The search field and the dock are on the primary screen only; every other screen has its
own strip at its very top.

- Super opens and closes Scale.
- Typing searches the applications of the Menu. Arrows select, Enter or a click launches,
  Escape clears the field, then closes Scale.
- Each thumbnail shows the windows that workspace has on that strip's screen.
- A click on a thumbnail switches workspace. Scale stays open.
- Dropping a window on a thumbnail moves it to that workspace and that screen.
- Dropping a window anywhere on another screen's window area moves it to that screen,
  same workspace. The area is highlighted while the drop is possible.
- The mouse wheel switches workspace.
- A middle click on a window does nothing (stock Scale closes the application).
- A right click on a window opens it, like a left click (stock Scale shows the window menu).
- The dock shows the apps pinned in the panel's window list, then, after a separator, the
  other running apps. A dot under an icon means the app has a window open.
- A click on a dock icon goes to the app's most recent window, switching workspace if
  needed, or launches the app when it has no window. Scale closes. A middle click always
  opens a new window; a right click does the same as a left click.
- The dock follows apps starting and stopping while Scale is open.

## Choose the apps of the dock

The dock's first part is the pinned apps of the panel's window list, in the panel's
order. Right-click an app's icon in the panel > "Pin to Panel" or "Unpin from Panel".
The dock reads that list each time Scale opens.

## Install

The link must point to the main checkout, not to a git worktree.

```bash
ln -s ~/Repos/dotfiles/cinnamon/extensions/scale-wheel-switch@bgi \
  ~/.local/share/cinnamon/extensions/scale-wheel-switch@bgi
```

## Free the Super key (once per machine)

The Menu applet owns Super by default, and the extension cannot take a key that is in use.

1. Right-click the Menu applet > Configure.
2. "Keyboard shortcut to open and close the menu": set it to Super+A.

That setting lives outside this repo, in `~/.config/cinnamon/spices/menu@cinnamon.org/0.json`
(`"overlay-key"`, value `<Super>a`).

To undo: disable the extension, then set the same shortcut back to Super (left and right),
which is `Super_L::Super_R` in that file.

## Enable

`extension.sh` edits `org.cinnamon enabled-extensions` and keeps the other enabled extensions.

```bash
~/Repos/dotfiles/cinnamon/extension.sh enable scale-wheel-switch@bgi
```

## Reload after an edit

```bash
~/Repos/dotfiles/cinnamon/extension.sh reload scale-wheel-switch@bgi
journalctl --user -b --since "-2 min" --no-pager | grep -E 'scale-wheel|JS ERROR'
```

No Cinnamon restart needed. One exception: St keeps the computed style of a class it has
already drawn, so a changed rule for an existing class in `stylesheet.css` may only show
after the next login.

## Uninstall

```bash
~/Repos/dotfiles/cinnamon/extension.sh disable scale-wheel-switch@bgi
rm ~/.local/share/cinnamon/extensions/scale-wheel-switch@bgi
```

Then give Super back to the Menu (see above).

## Known limitations

- The search field is not a real text entry: no caret, no paste, no dead keys or input method.
  Backspace removes the last character.
- The search field and the application grid are drawn on the primary monitor only.
- With Cinnamon's "workspaces only on primary" setting on, the other screens still show one
  thumbnail per workspace. Untested: the setting is off here.
- With that setting on, a window of another screen is on every workspace: dropped on a
  thumbnail of the primary screen, it lands on the current workspace, not the thumbnail's.
- Tested on two monitors side by side. Three or more are untested.
- Thumbnails follow windows opening, closing, changing workspace and changing screen, not a
  window being moved within its screen or resized while Scale is open. Workspace renames show at the next opening.
- Cinnamon hides hot corners over a fullscreen window. Super still works there.
- With the extension disabled, Super does nothing until the Menu shortcut is set back.
- The dock is drawn on the primary monitor only.
- Windows with no `.desktop` application are left out of the dock.
- The dock updates when an app starts or stops. An app that closes its last visible window
  but keeps running keeps its dot, and an app already running with no window gets no icon
  or dot when it opens one, until the next change of a running app or the next opening of
  Scale.
- With several grouped window list applets on the panels, the dock uses the first one.
  With none, or none of its pinned apps installed, and no other app running, no dock is
  drawn until the next opening of Scale.
- Many apps make the dock icons smaller to fit the screen's width. Untested.

## How it is built

Design records: [`documentation/plans/2026-11-11-cinnamon-scale-overview.md`](../documentation/plans/2026-11-11-cinnamon-scale-overview.md),
then [`documentation/plans/2026-11-12-cinnamon-scale-second-screen.md`](../documentation/plans/2026-11-12-cinnamon-scale-second-screen.md) for several screens,
then [`documentation/plans/2026-11-12-cinnamon-scale-dock.md`](../documentation/plans/2026-11-12-cinnamon-scale-dock.md) for the dock.

The extension relies on private parts of Cinnamon 6.4 (`metadata.json` pins that version).
Everything it changes is undone when it is disabled. Check this list after a Cinnamon upgrade.
`scripts/cinnamon-extension-check.sh` checks the syntax, `metadata.json` and the references
between the files of each extension and applet; it does not check Cinnamon's private parts.

Prototype patches (3):

- `WorkspaceMonitor.prototype._addWindowClone` (`workspace.js`), to make Scale's windows draggable.
- `WindowClone.prototype._onButtonRelease` (`workspace.js`), so a middle click no longer closes the application and a right click opens the window.
- `Workspace.prototype._onKeyPress` (`workspace.js`), to send typed keys to the search first.

Private fields and methods read, called or written:

| Object | Members | Used for |
|---|---|---|
| `Main.overview` | `_group`, `_coverPane`, `_hideInProgress` | where the header and the dock are inserted, close animation in progress |
| `Main.overview.workspacesView` | `_workspaces`, `actor` (opacity written) | reach each workspace, hide the windows during a search |
| `Workspace` | `_monitors` | the per-monitor objects, one per screen |
| `WorkspaceMonitor` | `_windows`, `_margin`, `_monitor` (written), `setGeometry`, `positionWindows` with flags `0`, `_updateEmptyPlaceholder` | window list and order, pushing the windows below the header |
| `WorkspaceMonitor` | `_x`, `_y`, `_width`, `_height`, `monitorIndex` | each screen's window area, as a drop target |
| `imports.ui.workspace` | `WindowClone` (exported constructor, checked with `instanceof`) | telling Scale's windows from other drags |
| `WindowClone` | `getDragActor`, `getDragActorSource`, `_draggable` (added to each instance) | the drag picture |
| dnd `Draggable` | `buttonPressEventId`, `destroyEventId` | removing the drag handlers on disable |
| `imports.ui.dnd` | `addDragMonitor`, `removeDragMonitor`, a monitor's `dragMotion(event)` with `event.x`, `event.y`, `event.source` | seeing every drag motion, to highlight a screen's window area |
| `imports.ui.dnd` | a monitor's `dragDrop(event)` with `event.targetActor`, returning `DragDropResult.CONTINUE` | clearing the highlights of the targets that do not take a drop |
| `Main` | `modalCount` | is Scale the only modal |
| `Main.AppletManager` | `getRunningInstancesForUuid('grouped-window-list@cinnamon.org')` | the panel's window list applet |
| grouped window list applet | `settings` (its `AppletSettings`), key `pinned-apps` | the pinned apps of the dock |

Assumptions about behaviour:

- Handlers of the overview's `showing` signal run in connection order, so the header shrinks
  the big view before Scale lays its windows out.
- `WorkspacesView.updateWindowPositions()` is broken in 6.4, so it is not used.
- Scale's view actor is added to `global.overlay_group` each time Scale opens, so the screen
  drop highlight raises itself in that group to stay above the windows.
- dnd looks for a drop target among the parents of the actor under the pointer, never its
  siblings: over a window clone, the screen's `WorkspaceMonitor` is out of reach. Its
  `_dropRect` has no size and no drop handlers. The highlight is therefore its own actor,
  shown on top, which then takes the drop.
- Returning `SUCCESS` or `FAILURE` from a drag monitor's `dragDrop` ends the drop without
  `drag-end` or cleanup, so the drag monitor's `dragDrop` always returns `CONTINUE`. It runs
  before any target takes the drop and clears the other targets' highlights: the window that
  moves can be destroyed with its draggable before `drag-end` is emitted.
- `Main.activateWindow` does not close Scale when it has to switch workspace, so the dock
  switches to the window's workspace first, then activates it.
- `Cinnamon.AppSystem`'s `app-state-changed` signal drives the dock's live update.
- `extension.sh reload` calls the D-Bus method `org.Cinnamon.ReloadXlet(uuid, "EXTENSION")`.

## Quick Settings: what it does

One button on the panel. Its icons, left to right: Wi-Fi, Bluetooth (only while the adapter
is on), VPN (only while a NetworkManager VPN or NordVPN is up), volume. A click opens the menu:

- Header: battery level and charging state on the left (hidden without a battery), then
  four round buttons. Screenshot starts `flameshot gui`, Settings opens System Settings,
  Lock locks the screen, Power opens Cinnamon's end-session dialog (suspend, restart, shut
  down). Each closes the menu first.
- Sliders: Sound (default output), Microphone (default input), Brightness. Sound and
  Microphone follow the handle live, like the stock sound applet. Brightness sets every
  external monitor that answers DDC/CI to the same value when the handle is released, or
  the laptop panel when no such monitor is connected.
- Tiles, two per row. A click on the tile toggles it; a highlighted tile is on.
  - Wi-Fi: wireless on or off. Shows the network in use.
  - Bluetooth: adapter on or off. Shows the device when exactly one is connected.
  - VPN: the active NetworkManager VPN or WireGuard profile, else the last used one. Shows
    its name.
  - NordVPN: connect (quick connect) or disconnect. Shows the country while connected.
  - Power profile: shows the active profile. A click goes back to Balanced, or from
    Balanced to the last other profile used (Power Saver the first time).
  - Night Light, Dark style, Do Not Disturb (notifications off), Keep awake (no screen
    blanking or dimming), Mic mute.
- '>' on a tile or a slider opens its list under that row, in the menu: networks, paired
  devices, VPN profiles, NordVPN countries, power profiles, output and input devices. The
  active entry has a check mark; a click switches to that entry. The last entry opens the
  matching settings page. One list is open at a time; a second click on '>' closes it.

A Wi-Fi network without a saved profile is joined the stock network applet's way: Cinnamon
asks for the password. An 802.1x network opens the network settings wizard.

The stock network, sound and power applets can be removed from the panel once this one
does what you need: right-click each > Remove from panel.

## Quick Settings: settings dialog

Right-click the button > Configure... Four tabs, Tiles, Sliders, Header and Panel, each a
list with a Show checkbox per row. Move up and Move down change the order. Changes apply at
once, without a reload.

- The battery stays on the left of the header; the order applies to the buttons.
- With every panel icon hidden or absent, one settings icon keeps the button on the panel.
  A checkbox can hide an icon, never show one its state hides.
- Add, Remove and Edit come with the stock list and cannot be hidden. Edit only picks a
  name from the list; an added row repeating an element is ignored; a removed element comes
  back at the end, shown. An emptied list shows everything again.

The tabs and their defaults come from the ordered lists in
`applets/quick-settings@bgi/constants.js`. After changing one of them, generate the schema
again (the tests fail until then):

```bash
gjs scripts/cinnamon-quick-settings-schema.js cinnamon/applets/quick-settings@bgi \
  > cinnamon/applets/quick-settings@bgi/settings-schema.json
```

## Quick Settings: install

The link must point to the main checkout, not to a git worktree.

```bash
ln -s ~/Repos/dotfiles/cinnamon/applets/quick-settings@bgi \
  ~/.local/share/cinnamon/applets/quick-settings@bgi
~/Repos/dotfiles/cinnamon/applet.sh enable quick-settings@bgi
```

`applet.sh enable` adds the applet at the right end of panel1's right zone and prints
"unchanged" when it is already there. A changed size in `stylesheet.css` shows after the
next login (see [Reload after an edit](#reload-after-an-edit)).

Reload after an edit:

```bash
~/Repos/dotfiles/cinnamon/applet.sh reload quick-settings@bgi
journalctl --user -b --since "-2 min" --no-pager | grep -E 'quick-settings|JS ERROR'
```

## Quick Settings: uninstall

```bash
~/Repos/dotfiles/cinnamon/applet.sh disable quick-settings@bgi
rm ~/.local/share/cinnamon/applets/quick-settings@bgi
```

## Quick Settings: dependencies

All already on this machine; nothing to install. Without one, the matching part is dimmed
or does nothing, and the reason goes to the journal once:

| Tool | Used for | When absent |
|---|---|---|
| `ddcutil` | external monitor brightness | the laptop panel is used, through cinnamon-settings-daemon; with no laptop panel either, the Brightness row is dimmed |
| `power-profiles-daemon` | Power profile tile and list | tile dimmed until the daemon starts |
| `nordvpn` (daemon running, user in the `nordvpn` group) | NordVPN tile and list | tile dimmed |
| `flameshot` | Screenshot button | nothing happens; Cinnamon reports the missing command |
| `blueman-manager` | last entry of the Bluetooth list | nothing happens; Cinnamon reports the missing command |

NetworkManager, BlueZ, PulseAudio or PipeWire, cinnamon-settings-daemon and the session
manager come with the desktop.

## Quick Settings: known limitations

- Microphone and Mic mute are dimmed while there is no input source (the internal microphone
  is disabled on this machine).
- A brightness change takes about 1.5 s to reach both monitors; on opening, the slider shows
  the previous value for about 1.3 s while it reads the monitor.
- The laptop-panel brightness fallback is only tested with fakes: the DDC monitors were
  always connected.
- The VPN tile may not connect: issue #33.
- With the NordVPN tile hidden, its status is not read, so a NordVPN connection no longer
  shows the VPN panel icon. With the Brightness row hidden, ddcutil does not run at all.
- While NordVPN connects or disconnects (about 10 s), its tile looks unavailable and takes
  no click.
- An unavailable tile or row keeps its label readable; only its icon and background dim.
- The hover and list tints are white overlays that suit dark themes: issue #35.
- A size changed in `stylesheet.css` shows after the next login.
- NordVPN's own NetworkManager connection (interface `nordlynx`) is left out of the VPN
  tile; it was only checked while NordVPN was disconnected.

## Quick Settings: tests

`scripts/check-all.sh` runs all of them, and the pre-push hook runs it (see
`CONTRIBUTING.md`). One by one:

```bash
scripts/cinnamon-extension-check.sh     # syntax, metadata.json, settings-schema.json, module references, no libnm disconnect()
scripts/cinnamon-applet-test.sh         # applet.sh, against stub gsettings and gdbus
scripts/cinnamon-extension-test.sh      # extension.sh, against the same stubs
scripts/cinnamon-quick-settings-test.sh # applet logic, no real setting or device touched
```

Prerequisites: `node` and `jq` for the check, `gjs` with the libnm and Cvc typelibs for the
logic tests.

`cinnamon-quick-settings-test.sh` runs on the memory GSettings backend and on fakes: fake
NetworkManager objects (Wi-Fi, VPN), a fake system bus (BlueZ, power profiles), a fake
session bus (Keep awake), fake Cvc streams, and fake ddcutil and nordvpn commands fed with
output captured on this machine (`scripts/fixtures/`). It never talks to the real
NetworkManager, BlueZ or session manager.

Design record: [`documentation/plans/2026-11-12-cinnamon-quick-settings-applet.md`](../documentation/plans/2026-11-12-cinnamon-quick-settings-applet.md).
