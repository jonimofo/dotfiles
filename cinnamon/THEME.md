# Cinnamon theme: Dracula

Applications, window borders, panel, icons and cursors all use Dracula. Set up on 2026-11-11,
Cinnamon 6.4. Nothing here is versioned: the theme files come from upstream releases.

## What is installed

| Part | Source | Location |
|---|---|---|
| GTK 2/3/4, Cinnamon panel, window borders | `Dracula.tar.xz` from github.com/dracula/gtk, release v4.0.0 | `~/.themes/Dracula/` |
| Icons | draculatheme.com, installed by hand beforehand | `~/.icons/dracula-icons/` |
| Cursors | `Dracula-cursors.tar.xz`, same gtk release | `~/.icons/Dracula-cursors/` |
| GTK4 / libadwaita override | symlinks into the theme | `~/.config/gtk-4.0/gtk.css`, `~/.config/gtk-4.0/gtk-dark.css`, `~/.config/assets` |

The release ships `.tar.xz` archives, not the `Dracula.zip` named on draculatheme.com.

## Install

```bash
dl=$(mktemp -d)
curl -fsSL -o "$dl/Dracula.tar.xz" https://github.com/dracula/gtk/releases/download/v4.0.0/Dracula.tar.xz
curl -fsSL -o "$dl/Dracula-cursors.tar.xz" https://github.com/dracula/gtk/releases/download/v4.0.0/Dracula-cursors.tar.xz
mkdir -p ~/.themes ~/.icons
tar -xJf "$dl/Dracula.tar.xz" -C ~/.themes Dracula
tar -xJf "$dl/Dracula-cursors.tar.xz" -C ~/.icons
rm -r "$dl"
```

The theme archive also holds variants (`Dracula-slim`, `Dracula-standard-buttons`, ...).
Only `Dracula` is used.

## Apply

Same as System Settings > Themes:

```bash
gsettings set org.cinnamon.desktop.interface gtk-theme 'Dracula'
gsettings set org.cinnamon.desktop.wm.preferences theme 'Dracula'
gsettings set org.cinnamon.theme name 'Dracula'
gsettings set org.cinnamon.desktop.interface icon-theme 'dracula-icons'
gsettings set org.cinnamon.desktop.interface cursor-theme 'Dracula-cursors'
```

Apps already open pick up the cursor only after a restart or a new login.

## GTK4 apps

GTK4 / libadwaita apps ignore the GTK theme setting. The override makes them load Dracula's
CSS. On this machine: Text Editor, Calculator, Files (Nautilus), System Monitor, Disk Usage
Analyzer, Image Viewer (Loupe), Font Viewer. Disks, Seahorse and Nemo are GTK3.

```bash
ln -sfn ~/.themes/Dracula/gtk-4.0/gtk.css ~/.config/gtk-4.0/gtk.css
ln -sfn ~/.themes/Dracula/gtk-4.0/gtk-dark.css ~/.config/gtk-4.0/gtk-dark.css
ln -sfn ~/.themes/Dracula/assets ~/.config/assets
```

The CSS loads its images from `../assets`, relative to `~/.config/gtk-4.0/`, hence
`~/.config/assets`. The override wins over every GTK4 app's own style: an app that looks
broken is the first thing to check.

## Undo

Previous values: `Adwaita`, `Default`, `cinnamon`, `gnome`, `Adwaita`.

```bash
gsettings set org.cinnamon.desktop.interface gtk-theme 'Adwaita'
gsettings set org.cinnamon.desktop.wm.preferences theme 'Default'
gsettings set org.cinnamon.theme name 'cinnamon'
gsettings set org.cinnamon.desktop.interface icon-theme 'gnome'
gsettings set org.cinnamon.desktop.interface cursor-theme 'Adwaita'
rm ~/.config/gtk-4.0/gtk.css ~/.config/gtk-4.0/gtk-dark.css ~/.config/assets
```

## Panel: no GNOME-style quick settings

Cinnamon 6.4 has no applet that merges network, sound and power into one menu like GNOME's
top-right corner, and none exists on Cinnamon Spices (searched 2026-11-11). Network, sound and
power stay separate applets on the panel.
