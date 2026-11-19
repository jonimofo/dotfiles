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
- `applets/calendar@bgi/`: the stock calendar applet with a second time zone and larger text.
  Tested on Cinnamon 6.4 (X11). See [Calendar](#calendar-what-it-does) below.
- `applet.sh`: enable, disable or reload one applet, keeping the other panel entries.
  Enable adds it at the right end of panel1's right zone.
- `THEME.md`: the Dracula desktop theme (GTK, panel, icons, cursors, GTK4 override), install and undo.
- `cinnamon_keybindings.dconf`: my keyboard shortcuts, custom and changed built-in ones (see below).

## Custom shortcuts

Restored from the GNOME backup (`gnome/gnome_custom_shortcuts.dconf`) on 2026-11-11.

| Key | Runs |
|---|---|
| Ctrl+Alt+P | Flameshot capture |
| Super+F | FSearch |
| Ctrl+Space | `rofi/rofi_url_search.sh` |
| Ctrl+Shift+Alt+P | Display settings |
| Shift+Alt+D | Night Light settings |
| Shift+Alt+C | Bluetooth (blueman) |
| Super+E | `scripts/nemo_dropdown_toggle.sh`, dropdown Nemo (its header lists the dependencies and why tdrop is not used) |

Super+E was Cinnamon's "open Home folder"; that action keeps only the Explorer media key.
Print (screenshot) and Ctrl+Alt+Escape (restart Cinnamon) are left to Cinnamon on purpose.

Backup after a change, restore on a new machine:

```bash
dconf dump /org/cinnamon/desktop/keybindings/ > ~/Repos/dotfiles/cinnamon/cinnamon_keybindings.dconf

dconf load /org/cinnamon/desktop/keybindings/ < ~/Repos/dotfiles/cinnamon/cinnamon_keybindings.dconf
```

The dump covers the whole keybindings path, not only `custom-keybindings/`: it also holds
`custom-list`, without which Cinnamon ignores a custom shortcut, and the changed built-in
bindings (`media-keys`, `wm`).

## What scale-wheel-switch does

In Scale (hot corner or Super), from top to bottom: the top panel, a search field, a
strip with one thumbnail per workspace, all centered, then Scale's windows, then a dock of
applications. The panel, the search field and the dock are on the primary screen only;
every other screen has its own strip at its very top.

- The top panel of the primary screen stays as it is: Scale hides the panels, and shows a
  live copy of that one at its pixels, icons and clock included, which takes no click. Nothing
  changes at the top of the screen when Scale opens or closes.
- Without a top panel on the primary screen (panel at the bottom, on another screen, or set
  to autohide), the panel clock is copied, centred in a band at the top. Without a running
  calendar applet either, nothing is shown above the search field.

- Super opens and closes Scale.
- Typing searches the applications of the Menu. Arrows select, Enter or a click launches,
  Escape clears the field, then closes Scale. While the field has text, a click on another
  screen's window area does nothing.
- Each thumbnail shows the windows that workspace has on that strip's screen.
- A click on a thumbnail enters that workspace: Scale closes on its desktop. A click on
  the current workspace's thumbnail closes Scale.
- Dropping a window on a thumbnail moves it to that workspace and that screen.
- Dragging a thumbnail moves its workspace, with its windows: past a few pixels a half
  transparent copy follows the pointer, its slot stays empty, and a violet bar marks where
  it lands between two thumbnails, on any screen's strip. On release the workspace takes that
  place and the labels renumber by position; Scale stays open on the same workspace. Released
  outside the strips or on its own slot, the thumbnail snaps back and nothing changes.
- Dropping a window anywhere on another screen's window area moves it to that screen,
  same workspace. The area is highlighted while the drop is possible.
- The mouse wheel switches workspace. Scale stays open.
- A middle click on a window does nothing (stock Scale closes the application).
- A right click on a window opens it, like a left click (stock Scale shows the window menu).
- The hot corners keep working over a fullscreen window, with Scale open or not, so the
  corner also closes Scale (stock Cinnamon hides them on that screen while a window is
  fullscreen). Disabling the extension gives back the stock behaviour.
  The lock screen (cinnamon-screensaver) grabs the pointer: the corner does not fire
  behind it (checked 2026-11-16).
- The dock shows the apps pinned in the panel's window list, then, after a separator, the
  other running apps. A dot under an icon means the app has a window open.
- A click on a dock icon goes to the app's most recent window, switching workspace if
  needed, or launches the app when it has no window. Scale closes. A middle click always
  opens a new window.
- A right click on a dock icon opens a menu above it, drawn by the Cinnamon theme: "New
  window" (same as the middle click), then, for a running app, "Close" for one window or
  "Close N windows" for more. Close asks every window of the app that Scale shows, on every
  workspace, to close, as its title bar's close button does. Scale stays open on the same
  workspace. When a window answers with a prompt attached to it ("save changes?"), Scale
  goes to that prompt on its workspace and closes, as stock Scale does when it closes a
  window. A click outside the menu, Escape, or a second right click on the same icon closes
  it without doing anything else. The three labels are in English in every locale.
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
- Custom workspace names are stored by position (`workspace-names`): after a reorder a
  name stays at its position, it does not follow its workspace. Untested: no custom names here.
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
- The dock menu has no arrow: Cinnamon 6.4 menus have none. Its count is taken when it
  opens; Close acts only on those counted windows still open and closable when it is
  chosen, never on one opened meanwhile.
- With a dock menu open, a click on another icon only closes the menu. A left or middle
  click on the icon whose menu is open does what that click always does. The wheel and
  Super do nothing while the menu is open.
- After Close, a prompt attached to a closed window is gone to until Scale closes, however
  late it comes; stock Scale stops waiting at the first new window of any kind.
- Close skips the windows Scale does not show (skip-taskbar windows, an app's dialogs
  attached to a window) and the ones muffin says cannot be closed.
- A top panel set to autohide or intellihide is not copied: Scale shows the clock band
  instead, since Cinnamon may hide that panel and the copy would be an empty band.
- The panel's place is read when Scale opens: a panel moved or resized while it is open
  keeps the old place until the next opening. The copy shows the panel as it was drawn, a
  hover highlight included if the pointer was on an applet when Scale opened; the applets'
  menus cannot be opened from it.

## How it is built

Design records: [`documentation/plans/2026-11-11-cinnamon-scale-overview.md`](../documentation/plans/2026-11-11-cinnamon-scale-overview.md),
then [`documentation/plans/2026-11-12-cinnamon-scale-second-screen.md`](../documentation/plans/2026-11-12-cinnamon-scale-second-screen.md) for several screens,
then [`documentation/plans/2026-11-12-cinnamon-scale-dock.md`](../documentation/plans/2026-11-12-cinnamon-scale-dock.md) for the dock,
then [`documentation/plans/2026-11-17-cinnamon-scale-clock.md`](../documentation/plans/2026-11-17-cinnamon-scale-clock.md) for the date and time, then the top panel,
then [`documentation/plans/2026-11-17-cinnamon-scale-enter-workspace.md`](../documentation/plans/2026-11-17-cinnamon-scale-enter-workspace.md) for entering a workspace,
then [`documentation/plans/2026-11-18-cinnamon-scale-reorder-workspaces.md`](../documentation/plans/2026-11-18-cinnamon-scale-reorder-workspaces.md) for reordering workspaces,
then [`documentation/plans/2026-11-19-cinnamon-scale-dock-menu.md`](../documentation/plans/2026-11-19-cinnamon-scale-dock-menu.md) for the dock icon menu.

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
| `Main.overview` | `_group`, `_coverPane`, `_hideInProgress` | where the panel's click blocker, the header and the dock are inserted, close animation in progress |
| `Main.overview` | `_group` (insertion bar added right above each strip) | the bar marking where a dragged thumbnail lands |
| `Main.overview.workspacesView` | `_workspaces`, `actor` (opacity written) | reach each workspace, hide the windows during a search |
| `Main.overview.workspacesView` | `_workspaces` (sorted in place), `_updateWorkspaceActors(false)`, `_scrollAdjustment.value` and `_animatingScroll` (written) | keeping Scale's big view on the active workspace after a reorder |
| `imports.ui.tweener` | `removeTweens(view._scrollAdjustment)` | stopping the scroll animation of a wheel switch before a reorder sets the scroll |
| `Workspace` | `_monitors` | the per-monitor objects, one per screen |
| `WorkspaceMonitor` | `_windows`, `_margin`, `_monitor` (written), `setGeometry`, `positionWindows` with flags `0`, `_updateEmptyPlaceholder` | window list and order, pushing the windows below the header |
| `WorkspaceMonitor` | `_x`, `_y`, `_width`, `_height`, `monitorIndex` | each screen's window area, as a drop target |
| `imports.ui.workspace` | `WindowClone` (exported constructor, checked with `instanceof`) | telling Scale's windows from other drags |
| `WindowClone` | `getDragActor`, `getDragActorSource`, `_draggable` (added to each instance) | the drag picture |
| dnd `Draggable` | `buttonPressEventId`, `destroyEventId` | removing the drag handlers on disable |
| `imports.ui.dnd` | `makeDraggable` with `dragActorOpacity` (in `uiHelpers.makeDraggable`, for windows and thumbnails), the delegate's `getDragActor` and `getDragActorSource`, signals `drag-begin`, `drag-cancelled`, `drag-end` | the drag picture of a window or a thumbnail and its source's opacity |
| `imports.ui.dnd` | the strip as drop target (`handleDragOver`, `handleDragOut`, `acceptDrop`) | dragging a thumbnail to reorder workspaces |
| dnd `Draggable` | `disconnectAll()` when its actor is destroyed | a reorder rebuilds the strips inside `acceptDrop`: the dragged thumbnail's `drag-end` handlers never run, so the drop hides the bars itself |
| `imports.ui.dnd` | `addDragMonitor`, `removeDragMonitor`, a monitor's `dragMotion(event)` with `event.x`, `event.y`, `event.source` | seeing every drag motion, to highlight a screen's window area |
| `imports.ui.dnd` | a monitor's `dragDrop(event)` with `event.targetActor`, returning `DragDropResult.CONTINUE` | clearing the highlights of the targets that do not take a drop |
| `Main` | `modalCount` | is Scale the only modal |
| `Main.AppletManager` | `getRunningInstancesForUuid('grouped-window-list@cinnamon.org')` | the panel's window list applet |
| `Main.panelManager` | `getPanelsInMonitor(primaryIndex)`, each panel's `actor` and `isHideable()` | the top panel copied in Scale, never an autohide one |
| `Main.AppletManager` | `getRunningInstancesForUuid('calendar@bgi')`, then `('calendar@cinnamon.org')`, the applet's `actor` | the clock of the fallback band |
| grouped window list applet | `settings` (its `AppletSettings`), key `pinned-apps` | the pinned apps of the dock |
| `PopupMenu.PopupMenu` | `_calculatePosition` (overridden in a subclass), `sideFlipped` (written) | the dock menu above its icon; the stock placement for a menu attached below puts it at the monitor's bottom edge, over the dock |

Assumptions about behaviour:

- Handlers of the overview's `showing` signal run in connection order, so the header shrinks
  the big view before Scale lays its windows out.
- `WorkspacesView.updateWindowPositions()` is broken in 6.4, so it is not used.
- `reorder_workspace` emits `workspaces-reordered` and no workspace switch. Scale's big
  view listens to neither, keeps its workspaces in their order at opening and picks the
  shown one by the active index: the strip sorts it again, or Scale would show, and zoom
  back on close, another workspace's windows.
- dnd's drag starts past GTK's drag threshold (8 px here), a press that never passes it
  is a click. dnd needs the press: the thumbnail's draggable is connected before its click
  handler, which stops the press. A drag ends without a release on the thumbnail, so it never
  counts as a click.
- dnd picks the actor under the pointer with `Clutter.PickMode.ALL`, which includes actors
  that take no input: the insertion bar is hidden from pick, or a drop over it would miss the strip.
- Scale's view actor is added to `global.overlay_group` each time Scale opens, so the screen
  drop highlight raises itself in that group to stay above the windows.
- A reactive actor at opacity 0 still takes the pointer, as the overview's own cover pane
  does: the search's click blockers on the other screens rely on it.
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
- The dock menu's `PopupMenuManager` takes a modal grab on top of Scale's (`Main.modalCount`
  2, so the wheel and Super leave it alone), closes the menu on a press outside it and
  swallows that press, and on close pops the grab, which gives the key focus back to Scale's
  view. Its `open-state-changed` handler runs before the dock's, which then destroys the
  menu; the manager destroys itself with its last menu.
- Muffin emits `window-added` on a workspace for a new window; a prompt of a closing window
  is transient for it (`get_transient_for()`). Stock's `WindowClone.closeWindow` relies on
  both, and goes to the prompt from an idle.
- Scale closes on an Escape key release (`WorkspacesView._onStageKeyRelease`). The menu
  closes on the press, so the dock swallows the rest of that key stroke on the stage.
- Scale hides the panels (`Main.panelManager.disablePanels()` in `Overview._animateVisible`:
  each panel eases to opacity 0 in 0.2 s, then `actor.hide()`), and gives them back as it
  starts to close (`enablePanels()`: `actor.show()`, then an ease to 255 in 0.2 s), while
  Scale's group fades out in 0.2 s. The panels are stacked above `global.overlay_group`.
- A `Clutter.Clone` paints its source with the clone's own opacity, whatever the source's
  opacity, and still paints a hidden source: the panel's copy stays whole while the panel
  fades. It is in `global.overlay_group` above Scale's group, so it does not fade with the
  group. After Scale closes, it stays until the panel's `notify::opacity` reports 255, or
  1 s at most.
- `extension.sh reload` calls the D-Bus method `org.Cinnamon.ReloadXlet(uuid, "EXTENSION")`.

## Quick Settings: what it does

One button on the panel. Its icons, left to right: Wi-Fi, VPN (only while a NetworkManager
VPN or NordVPN is up), Bluetooth (only while the adapter is on; struck through while airplane
mode is on), volume, then the battery
icon and level, like `87%` (only with a battery). The VPN icon is followed by the name of
the VPN that is up: NordVPN's country, or the NetworkManager profile's name; with both up,
`<country> + <profile>`. The Bluetooth icon is followed by the connected device's name; with
several connected, the first in alphabetical order and `+N` for the others (`Headset +1`);
nothing after it while none is connected. A name longer than 16 characters is cut with `…`. A click opens
the menu:

- Header: battery level and charging state on the left (hidden without a battery), then
  four round buttons. Screenshot starts `flameshot gui`, Settings opens System Settings,
  Lock locks the screen, Power opens Cinnamon's end-session dialog (suspend, restart, shut
  down). Each closes the menu first.
- Sliders: Sound (default output), Microphone (default input), Brightness, Warmth. Sound and
  Microphone follow the handle live, like the stock sound applet. Brightness sets every
  external monitor that answers DDC/CI to the same value when the handle is released, or
  the laptop panel when no such monitor is connected. Warmth is the Night Light
  temperature, 6500 K (no tint) on the left to 1000 K (deepest red) on the right in steps
  of 100 K, wider than Cinnamon's Night Light page (1700 K to 4700 K), shown as `3400 K`;
  a value set elsewhere outside that range is shown as is, the handle at the nearest end.
  The switch at its right end turns Night Light on and off; while it is off the slider is
  dimmed.
- Tiles, two per row. A click on the tile toggles it; a highlighted tile is on.
  - Wi-Fi: wireless on or off. Shows the network in use.
  - Bluetooth: adapter on or off. Shows the connected device's name, with `+N` when several
    are connected (same name as on the panel).
  - VPN: the active NetworkManager VPN or WireGuard profile, else the last used one. Shows
    its name.
  - NordVPN: connect (quick connect) or disconnect. Shows the country while connected.
  - Power profile: shows the active profile. A click goes back to Balanced, or from
    Balanced to the last other profile used (Power Saver the first time).
  - Airplane mode: a click turns Wi-Fi and Bluetooth off; a second click turns back on the
    ones that were on. Turning one back on by hand ends airplane mode. While it is on, the
    panel shows Wi-Fi and Bluetooth struck through instead of hiding Bluetooth.
  - Keyboard light: a click goes to the next backlight level, back to off after the
    brightest, through UPower. Shows the level: Off, Low, High for a two-level light (On
    for a one-level light, Medium above half on a light with more levels). Follows the
    keyboard's own hotkey. Dimmed without a keyboard backlight.
  - Charge: `Charge 80%` while the battery stops charging at 80 % (charge mode Custom,
    thresholds 75 and 80; the thresholds only apply in Custom mode), `Charge 100%`,
    highlighted, otherwise: Adaptive, and any other mode or threshold set elsewhere. A click
    switches: from `Charge 100%` it applies the 80 % limit, whatever was set before. It
    writes through the root helper
    [`system/battery-charge-limit`](../system/battery-charge-limit/README.md), run with
    `sudo -n`; dimmed until the helper is installed or without these sysfs files. A hidden
    tile does nothing at all: no read, no automatic return.
  - Automatic return to 80 %: while the tile shows `Charge 100%`, once the battery has been
    seen full on AC (a battery already full on AC when `Charge 100%` is chosen counts at
    once), the first change to battery power applies the limit, once. A dock unplugged or a
    short power cut counts as that change.
  - Dark style, Do Not Disturb (notifications off), Keep awake (no screen blanking or
    dimming), Mic mute. Night Light has no tile: the Warmth switch turns it on and off.
- Media controls, under the tiles: one block per media player on the session bus (any
  MPRIS player: VLC, GNOME Videos, a browser playing a video...), at most three, shown by
  player name. With more than three, the ones kept are the playing players first, then the
  paused ones, then the ones with a title. The title in bold, then `artist · player` with the player name in italic (the
  player alone without an artist; a long artist is cut first), and previous, play or pause,
  next as bare icons on that line. A player that publishes no track title (GNOME Videos
  playing a file without a title tag) shows the title of its own window instead, which for
  Videos is the file name, and follows its changes; without a window either, the player
  name alone. A button the player does not offer is dimmed. While a player plays, a thin
  bar in the checked tiles' accent colour runs down the left of its block; paused or
  stopped, the bar is clear, its space kept so the text never moves. No player: no block (a
  browser with no media does not announce itself). One line separates them from the tiles;
  with several players, every second block has the lists' faint background. Followed live
  over D-Bus, like the stock sound applet. A click on the title or the player line closes
  the menu and brings the player's window to the front: a browser's window, not its tab.
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
once, without a reload. An element added in a later version appears in a saved list, shown,
just before the first element that follows it in the default order, or at the end. The
applet writes that list back to its settings when it loads, so the dialog lists the new
element too; an element no longer declared is dropped the same way.

- The battery stays on the left of the header; the order applies to the buttons.
- The Tiles tab ends with Media controls: its checkbox shows or hides them, its place in
  the list does not move them from under the tiles. Hidden, they follow no player.
- With every panel icon hidden or absent, one settings icon keeps the button on the panel.
  A checkbox can hide an icon, never show one its state hides.
- Add, Remove and Edit come with the stock list and cannot be hidden. Edit only picks a
  name from the list; an added row repeating an element is ignored; a removed element comes
  back at once at its default place (just before the first element that follows it in the
  default order, else at the end), shown, and the list is saved that way. An emptied list
  shows everything again, in the default order.

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

The Charge tile also needs its root helper, installed once by hand (a copy owned by root,
not a link): see [`system/battery-charge-limit`](../system/battery-charge-limit/README.md).

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
| `nordvpn` (daemon running, user in the `nordvpn` group) | NordVPN tile and list | tile dimmed and shown off, no VPN panel icon from NordVPN |
| `flameshot` | Screenshot button | nothing happens; Cinnamon reports the missing command |
| `blueman-manager` | last entry of the Bluetooth list | nothing happens; Cinnamon reports the missing command |
| UPower with a keyboard backlight | Keyboard light tile | tile dimmed |
| `/usr/local/sbin/battery-charge-limit` ([install](../system/battery-charge-limit/README.md)), the helper runnable through `sudo -n`, a battery with `charge_types` and charge thresholds in sysfs | Charge tile | tile dimmed; a refused `sudo -n` is logged and the tile shows the real mode |

NetworkManager, BlueZ, PulseAudio or PipeWire, cinnamon-settings-daemon, the session
manager and the session bus (media players) come with the desktop.

Cinnamon internals the media controls rely on, read from Cinnamon 6.4: `Cinnamon.AppSystem`
`lookup_app('<DesktopEntry>.desktop')` and the app's `get_windows()` (its interesting
windows, in Cinnamon's own order; the applet picks by `get_user_time()` itself),
`global.get_window_actors()` with each `meta_window`'s `get_pid()`, `get_title()` and
`get_user_time()`, filtered with `Main.isInteresting()`, and
`Main.activateWindow(window, time)`, the call of the stock window list on a click. A
player's window title is followed with the window's `notify::title` and `unmanaged`
signals, the ones Cinnamon's own overview and window menu use.

## Quick Settings: known limitations

- The Charge tile reads the charge mode when it shows, when the menu opens and on each
  battery change (sysfs sends no change signal): a mode changed by another tool shows at the
  next one. The return to 80 % needs the applet running when the charger is unplugged, and
  is forgotten across a reload until the battery is seen full on AC again. A helper run that
  does not answer within 10 s is given up on: the tile is usable again and shows the real
  mode.

- A click on a media block brings a window forward, never a browser tab: no browser lets
  another program switch its tabs. Among a browser's windows, the one whose title holds the
  track title (its active tab plays) wins, else the one used last. Only a window of the
  player's own process is brought forward. A player with no window found and no MPRIS Raise
  does nothing; the journal says so once.
- Sandboxed players (Flatpak, Snap): their bus owner is a proxy without windows, so they
  come forward only through MPRIS Raise, when they offer it, and a sandboxed player without
  a track title shows its name alone.
- A player without a track title takes the title of the window click-to-focus would bring
  forward (the one used last among several). That window is chosen again at each menu
  opening, and a window that closes hands over to the player's other windows. A window
  opened after the player is found at the next player change or menu opening, not at once.
- Every player on the bus has a block, also one that is stopped with nothing loaded: it
  shows its name alone, with the play button.

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
- Airplane mode is not kept across a reload of the applet: after one, the tile starts
  unchecked and a click turns the radios off again.
- A size changed in `stylesheet.css` shows after the next login.
- NordVPN's own NetworkManager connection (interface `nordlynx`) is left out of the VPN
  tile. Its going up or down (NordVPN connected or disconnected from a terminal or NordVPN's
  own app) triggers one `nordvpn status` read, so the VPN name on the panel follows. With
  NordVPN's OpenVPN technology no such link exists in NetworkManager: the panel then
  follows only when the menu opens.
- A Warmth above 4700 K may be set back to 4700 K when Cinnamon Settings > Night Light is
  opened. Verified by reading the page's code only (`cs_nightlight.py` and the xapp `Range`
  widget: a 1700 K to 4700 K scale bound to the key, whose clamped value is written back
  300 ms after it changes); not tried on screen, since that would change the setting. A
  value below 1700 K is not affected by that path.

## Quick Settings: tests

`scripts/check-all.sh` runs all of them, and the pre-push hook runs it (see
`CONTRIBUTING.md`). One by one:

```bash
scripts/cinnamon-extension-check.sh     # syntax, metadata.json, settings-schema.json, module references, no libnm disconnect()
scripts/cinnamon-applet-test.sh         # applet.sh, against stub gsettings and gdbus
scripts/cinnamon-extension-test.sh      # extension.sh, against the same stubs
scripts/cinnamon-hot-corner-test.sh     # scale-wheel-switch hot corners over fullscreen windows, on fakes
scripts/cinnamon-scale-test.sh          # scale-wheel-switch search, clicks, drop highlights, dock sizes, dock menu, panel copy, thumbnail click, workspace reorder, on fakes
scripts/cinnamon-quick-settings-test.sh # applet logic, no real setting or device touched
scripts/cinnamon-calendar-test.sh       # calendar@bgi texts, time zones, tick clock, day marker, stylesheet rules
```

Prerequisites: `node` and `jq` for the check, `gjs` with the libnm and Cvc typelibs for the
logic tests.

`cinnamon-quick-settings-test.sh` runs on the memory GSettings backend and on fakes: fake
NetworkManager objects (Wi-Fi, VPN), a fake system bus (BlueZ, power profiles, UPower's
keyboard backlight), fake session buses (Keep awake, MPRIS media players), fake Cvc
streams, fake radios (Airplane mode), and fake ddcutil and nordvpn commands fed with output
captured on this machine (`scripts/fixtures/`). It never talks to the real
NetworkManager, BlueZ, UPower, session manager or media players.

Design records:
[`documentation/plans/2026-11-12-cinnamon-quick-settings-applet.md`](../documentation/plans/2026-11-12-cinnamon-quick-settings-applet.md),
[`documentation/plans/2026-11-16-cinnamon-quick-settings-extras.md`](../documentation/plans/2026-11-16-cinnamon-quick-settings-extras.md),
[`documentation/plans/2026-11-17-cinnamon-quick-settings-media.md`](../documentation/plans/2026-11-17-cinnamon-quick-settings-media.md),
[`documentation/plans/2026-11-18-cinnamon-quick-settings-media-playing.md`](../documentation/plans/2026-11-18-cinnamon-quick-settings-media-playing.md).

## Calendar: what it does

`applets/calendar@bgi/` is the stock Cinnamon calendar applet (`calendar@cinnamon.org`,
Cinnamon 6.4) with a second time zone and its own look:

- The panel reads `Mon 16 Nov · 15:52 · VN 21:52`: short date, local time, then a second
  time zone with its label. Dates are in English whatever the locale (`LC_TIME`), from the
  name tables of `constants.js`. The time follows the desktop's 24h or 12h and seconds
  settings.
- The popup opens on a header band: the selected day's date on the left
  (`Mon 16 Nov. 2026`: the month gets a dot when shortened, so `May` has none), its number
  of events in the middle (`1 event`, `16 events`; nothing for a day without events), the
  clocks on the right (`15:52 Paris`, `21:52 VN`, a thin line between them). The three sit
  in equal thirds of the band, so they never overlap. A click on the clocks goes back to
  today, as the stock date did.
- Left column, the selected day's events, one row each: the calendar's colour bar, the
  time block `10:00 – 11:00`, then the title over its metadata. A summary such as
  `Team meeting | Alex | [R1]` is cut at its first ` | `: title `Team meeting`, metadata
  `Alex | [R1]`; without ` | ` the summary is the title alone. A line too long ends in `…`;
  the tooltip shows the whole summary. The column is as tall as its events, up to 70% of
  the screen's height (`EVENTS_MAX_HEIGHT_RATIO` in `constants.js`); beyond it only the
  list scrolls.
- On today, past events are dimmed, the ongoing one has a thicker violet outline and a violet accent bar, and a violet line
  with the current time (`09:22`) sits after the last event that has started. The states and
  the line follow the clock minute by minute while the popup is open, and the list scrolls to
  the line on opening. Another day shows no line and nothing dimmed.
- Right column, the month: one row `<  Nov. 2026  >` (the month abbreviated as in the header, `May 2026`, its title larger and centred on the arrows) with a gap under it, headings `Mon Tue ...` (the arrows, 24px icons that
  grow with the Days size, and the mouse wheel move one month), larger day cells, one dot under a day with events. The selected day is
  filled violet, today has a thin light outline, a selected today has both; days of the
  other months are greyed.
- Under the month, a `Today` button goes back to today's date and month, like a click on
  the clocks; it is always active.
- At the bottom left, the stock "Date and Time Settings" entry is a button as wide as its
  label, with the Today button's look.

The look lives in `applets/calendar@bgi/stylesheet.css`, under the applet's own classes:
other menus and the stock calendar are not touched. Its colours are the owner's validated
palette (dark navy), each written once at the top of the file by role; they do not follow
the desktop theme. The event colour bar keeps the colour of the event's calendar.

Origin and licence: copied from `/usr/share/cinnamon/applets/calendar@cinnamon.org/` of
Cinnamon 6.4.10 (Linux Mint, <https://github.com/linuxmint/cinnamon>), GPL-2+ (see
`/usr/share/doc/cinnamon/copyright`). The first commit of the folder is the unchanged copy;
the stock functions changed since are listed in the plan, for a re-sync with upstream.

## Calendar: settings

Right-click the clock > Configure... Two tabs; every change applies at once, without a
reload.

**Appearance**, text sizes (70% to 160%, step 5) and the gap:

| Setting | Default | |
|---|---|---|
| Events | 100 % | time, title and metadata of the event rows, and the now line |
| Days | 100 % | day digits and headings; the day cells grow with them (the month row too) |
| Header | 100 % | the whole header band: date, event count and clocks |
| Gap between events | 8 px | 0 to 24 px between two event rows |

**Appearance**, shown elements; an element switched off leaves no empty space:

| Setting | Default | |
|---|---|---|
| Calendar events | on | stock switch: the event list, the dots and the event count |
| Clocks in the header | on | both clocks; the second one also needs "Show in the calendar header". Hidden, their click back to today goes too; the Today button stays |
| Metadata line | on | the second line of each event |
| Now line and event states | on | on today: past events dimmed, the ongoing one outlined in violet, a violet line with the time between them and the upcoming ones |
| Dot under days | on | the dot under a day with events; off, the digits are centred |
| Event count | on | the number of events in the middle of the header band |
| Today button | on | the button under the month |
| Week numbers | off | stock switch |

**Panel**: the stock custom date format (switch, panel format, tooltip format, syntax
help), then the second time zone:

| Setting | Default | |
|---|---|---|
| Show on the panel | on | the second zone's time on the panel text (`· VN 21:52`); the key is still `show-second-zone` |
| Show in the calendar header | on | the second clock in the popup's header band, with "Clocks in the header" on |
| Time zone | `Asia/Ho_Chi_Minh` | an IANA id; an unknown one hides the second time and is logged once |
| Label | `VN` | shown before the time on the panel, after it in the popup |

With the custom date format on, it replaces the date part of the panel text only: the times
and the second zone follow it. Its default is date only, `%a %e %b` (a format saved before
keeps its value). The custom formats keep the stock behaviour: they follow the
locale (`LC_TIME`), unlike the rest of the applet.

The stock "Show calendar" keyboard shortcut (`<Super>c`) is removed: the applet registers no
global shortcut.

The tabs, keys, defaults, ranges and labels are in `applets/calendar@bgi/constants.js`;
`settings-schema.json` is written by hand and the test checks that the two agree. The
applet's own wording is in English whatever the locale: dates, and every phrase it shows
("No Events", "All day", "Today", "Date and Time Settings"), which come from
`constants.js` instead of Cinnamon's translations.

## Calendar: install

The link must point to the main checkout, not to a git worktree. The stock applet is
replaced on the panel by this one:

```bash
ln -s ~/Repos/dotfiles/cinnamon/applets/calendar@bgi \
  ~/.local/share/cinnamon/applets/calendar@bgi
~/Repos/dotfiles/cinnamon/applet.sh disable calendar@cinnamon.org
~/Repos/dotfiles/cinnamon/applet.sh enable calendar@bgi
```

`applet.sh enable` adds it at the right end of panel1's right zone; drag it in panel edit
mode to move it. Its settings start from the defaults: the stock applet's settings are not
copied (events, week numbers).

Reload after an edit:

```bash
~/Repos/dotfiles/cinnamon/applet.sh reload calendar@bgi
journalctl --user -b --since "-2 min" --no-pager | grep -E 'calendar@bgi|JS ERROR'
```

Back to the stock applet:

```bash
~/Repos/dotfiles/cinnamon/applet.sh disable calendar@bgi
~/Repos/dotfiles/cinnamon/applet.sh enable calendar@cinnamon.org
rm ~/.local/share/cinnamon/applets/calendar@bgi
```

## Calendar: known limitations

- Each opening, at most once every 15 s, asks the calendar server to send the events of the
  six weeks shown again; the server sends one D-Bus signal per event (about 500 here) and
  handling them keeps Cinnamon busy for a fraction of a second, so a close made during that
  time is drawn after it. Within 15 s of the last request the server, still running, sends
  each change by itself, so the request is skipped.
- Applets removed or reloaded before the performance round left their calendar server
  connection running until Cinnamon restarts; each one handles the same signals again. Restart
  Cinnamon once after updating (log out and back in) to drop them.

- On a vertical panel the stock text is shown, without the second time zone.
- The 12-hour clock's AM/PM marker still comes from the locale (GLib's `%p`).
- An all-day event is never dimmed nor outlined during its day; it counts as upcoming for
  the now line.
- The event rows show no countdown ("In progress", "In 1 hour"): the now line and the
  states replace it.
- The colours are fixed: a light desktop theme keeps the dark popup. The test checks their
  contrast: 4.5:1 for text, 3:1 for outlines and edges.
- Clicks on the header date (opens GNOME Calendar) and on the clocks (back to today) have no
  visible cue, as in the stock applet.
- The days and the arrows of the month take no keyboard focus, as in the stock applet; the
  Today and settings buttons do.
- The day dot is a `•` character: its exact place under the number depends on the font.
- The events column does not use the theme's `calendar-events-main-box` class (it carries a
  fixed height in some themes), so a theme's border or padding on that column is not drawn.
- A size changed in `stylesheet.css` shows after the next login (see
  [Reload after an edit](#reload-after-an-edit)).

Design record: [`documentation/plans/2026-11-16-cinnamon-calendar-applet.md`](../documentation/plans/2026-11-16-cinnamon-calendar-applet.md).
