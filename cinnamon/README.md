# cinnamon/

My Cinnamon extensions, versioned. Each one is symlinked into
`~/.local/share/cinnamon/extensions/`.

## What lives here

- `extensions/scale-wheel-switch@bgi/`: turns Scale into a GNOME-style overview.
  Tested on Cinnamon 6.4 (X11).
- `extension.sh`: enable, disable or reload one extension, keeping the others enabled.

## What scale-wheel-switch does

In Scale (hot corner or Super), from top to bottom: a search field, a strip with one
thumbnail per workspace, both centered, then Scale's windows.

- Super opens and closes Scale.
- Typing searches the applications of the Menu. Arrows select, Enter or a click launches,
  Escape clears the field, then closes Scale.
- A click on a thumbnail switches workspace. Scale stays open.
- Dropping a window on a thumbnail moves it to that workspace.
- The mouse wheel switches workspace.
- A middle click on a window does nothing (stock Scale closes the application).
- A right click on a window opens it, like a left click (stock Scale shows the window menu).

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
- Primary monitor only: the field, the strip and the application grid are drawn there.
- Thumbnails follow windows opening, closing and changing workspace, not a window being
  moved or resized while Scale is open. Workspace renames show at the next opening.
- Cinnamon hides hot corners over a fullscreen window. Super still works there.
- With the extension disabled, Super does nothing until the Menu shortcut is set back.

## How it is built

Design record: [`documentation/plans/2026-11-11-cinnamon-scale-overview.md`](../documentation/plans/2026-11-11-cinnamon-scale-overview.md).

The extension relies on private parts of Cinnamon 6.4 (`metadata.json` pins that version).
Everything it changes is undone when it is disabled. Check this list after a Cinnamon upgrade.

Prototype patches (3):

- `WorkspaceMonitor.prototype._addWindowClone` (`workspace.js`), to make Scale's windows draggable.
- `WindowClone.prototype._onButtonRelease` (`workspace.js`), so a middle click no longer closes the application and a right click opens the window.
- `Workspace.prototype._onKeyPress` (`workspace.js`), to send typed keys to the search first.

Private fields and methods read, called or written:

| Object | Members | Used for |
|---|---|---|
| `Main.overview` | `_group`, `_coverPane`, `_hideInProgress` | where the header is inserted, close animation in progress |
| `Main.overview.workspacesView` | `_workspaces`, `actor` (opacity written) | reach each workspace, hide the windows during a search |
| `Workspace` | `_monitors` | the per-monitor object of the primary monitor |
| `WorkspaceMonitor` | `_windows`, `_margin`, `_monitor` (written), `setGeometry`, `positionWindows` with flags `0`, `_updateEmptyPlaceholder` | window list and order, pushing the windows below the header |
| `WindowClone` | `getDragActor`, `getDragActorSource`, `_draggable` (added to each instance) | the drag picture |
| dnd `Draggable` | `buttonPressEventId`, `destroyEventId` | removing the drag handlers on disable |
| `Main` | `modalCount` | is Scale the only modal |

Assumptions about behaviour:

- Handlers of the overview's `showing` signal run in connection order, so the header shrinks
  the big view before Scale lays its windows out.
- `WorkspacesView.updateWindowPositions()` is broken in 6.4, so it is not used.
- `extension.sh reload` calls the D-Bus method `org.Cinnamon.ReloadXlet(uuid, "EXTENSION")`.
