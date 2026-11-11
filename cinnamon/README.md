# cinnamon/

My Cinnamon extensions, versioned. Each one is symlinked into
`~/.local/share/cinnamon/extensions/`.

## What lives here

- `extensions/scale-wheel-switch@bgi/`: in Scale, a top strip of workspace thumbnails, and the
  mouse wheel switches workspace.
  Tested on Cinnamon 6.4 (X11).

## Install

```bash
ln -s ~/Repos/dotfiles/cinnamon/extensions/scale-wheel-switch@bgi \
  ~/.local/share/cinnamon/extensions/scale-wheel-switch@bgi
```

## Enable

This replaces the whole list. Check the current one first, and keep its other entries:

```bash
gsettings get org.cinnamon enabled-extensions
gsettings set org.cinnamon enabled-extensions "['scale-wheel-switch@bgi']"
```

## Reload after an edit

```bash
gsettings set org.cinnamon enabled-extensions "[]"
gsettings set org.cinnamon enabled-extensions "['scale-wheel-switch@bgi']"
journalctl --user -b --since "-2 min" --no-pager | grep -E 'scale-wheel|JS ERROR'
```

No Cinnamon restart needed.

## Uninstall

```bash
gsettings set org.cinnamon enabled-extensions "[]"
rm ~/.local/share/cinnamon/extensions/scale-wheel-switch@bgi
```
