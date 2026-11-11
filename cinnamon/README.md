# cinnamon/

My Cinnamon extensions, versioned. Each one is symlinked into
`~/.local/share/cinnamon/extensions/`.

## What lives here

- `extensions/scale-wheel-switch@bgi/`: Super toggles Scale; in Scale, typing searches and
  launches applications, a strip of workspace thumbnails switches workspace (click) and moves
  windows (drop), and the mouse wheel switches workspace.
  Tested on Cinnamon 6.4 (X11).

## Install

```bash
ln -s ~/Repos/dotfiles/cinnamon/extensions/scale-wheel-switch@bgi \
  ~/.local/share/cinnamon/extensions/scale-wheel-switch@bgi
```

## Free the Super key (once per machine)

The Menu applet owns Super by default, and the extension cannot take a key that is in use.
Right-click the Menu applet > Configure > Keyboard shortcut to open and close the menu:
set it to Super+A.

That setting lives outside this repo, in `~/.config/cinnamon/spices/menu@cinnamon.org/0.json`
(`"overlay-key"`, value `<Super>a`).

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

No Cinnamon restart needed.

## Uninstall

```bash
~/Repos/dotfiles/cinnamon/extension.sh disable scale-wheel-switch@bgi
rm ~/.local/share/cinnamon/extensions/scale-wheel-switch@bgi
```
