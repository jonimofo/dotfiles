# Cinnamon theme: Dracula

Applications, window borders, panel, icons and cursors all use Dracula. Set up on 2026-11-11,
Cinnamon 6.4. The theme files come from upstream releases and are not versioned; only the
Thunderbird and Firefox window buttons live in this repo, under `theme/`.

## What is installed

| Part | Source | Location |
|---|---|---|
| GTK 2/3/4, Cinnamon panel, window borders | `Dracula.tar.xz` from github.com/dracula/gtk, release v4.0.0 | `~/.themes/Dracula/` |
| Icons | draculatheme.com, installed by hand beforehand | `~/.icons/dracula-icons/` |
| Cursors | `Dracula-cursors.tar.xz`, same gtk release | `~/.icons/Dracula-cursors/` |
| GTK4 / libadwaita override | symlinks into the theme | `~/.config/gtk-4.0/gtk.css`, `~/.config/gtk-4.0/gtk-dark.css`, `~/.config/assets` |
| Thunderbird and Firefox window buttons | `cinnamon/theme/` in this repo | `<profile>/chrome/userChrome.css`, `<profile>/chrome/dracula-assets` |

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
mkdir -p ~/.config/gtk-4.0
ln -sfn ~/.themes/Dracula/gtk-4.0/gtk.css ~/.config/gtk-4.0/gtk.css
ln -sfn ~/.themes/Dracula/gtk-4.0/gtk-dark.css ~/.config/gtk-4.0/gtk-dark.css
ln -sfn ~/.themes/Dracula/assets ~/.config/assets
```

The CSS loads its images from `../assets`, relative to `~/.config/gtk-4.0/`, hence
`~/.config/assets`. The override wins over every GTK4 app's own style: an app that looks
broken is the first thing to check.

## Thunderbird and Firefox window buttons

Both apps draw their own title bar, so the window manager theme does not reach their close,
minimize and maximize buttons. `theme/userChrome.css` swaps in the Dracula dot images. The
compact bar, with tabs next to the buttons, is kept on purpose: `mail.tabs.drawInTitlebar=false`
or Firefox's "Title Bar" option would bring the Dracula buttons back only by adding a full
window title bar. The old pref `widget.gtk.non-native-titlebar-buttons.enabled` no longer exists.

Before running it:

- The theme from "Install" above must be present: the script needs `~/.themes/Dracula/assets`.
- Find each profile folder in `about:profiles`, line "Root Directory".
- The links point into this checkout. It must stay on a branch that contains `cinnamon/theme/`,
  otherwise both apps silently lose the buttons.

```bash
cinnamon/theme/install.sh ~/.thunderbird/yft1awhq.default-default ~/.mozilla/firefox/ifcpghdw.default-release
```

For each profile, the script links `chrome/userChrome.css` to the repo file and
`chrome/dracula-assets` to `~/.themes/Dracula/assets`, and adds
`toolkit.legacyUserProfileCustomizations.stylesheets` to `user.js` if missing. A real
`userChrome.css` already there is kept as `userChrome.css.<timestamp>.bak`. `--check` shows
what would change, without writing. Safe to run twice. Restart the app afterwards.
A `userChrome.css` already present in a profile is replaced by the link and kept as `.bak`.

Check: `cinnamon/theme/install.sh --check <profile>...` prints only `ok` lines and exits 0, and
exits 1 when something would change. After a restart, the title bar shows the Dracula dots.

Limits: restore uses the maximize dot. Only the profiles given are changed. The selectors were
checked on Thunderbird 153 and Firefox 160; re-check them after a major Mozilla update.

Undo, per profile, then restart the app:

```bash
rm <profile>/chrome/userChrome.css <profile>/chrome/dracula-assets
sed -i \
    -e '/^user_pref("toolkit\.legacyUserProfileCustomizations\.stylesheets", true);$/d' \
    -e '/^\/\/ Load chrome\/userChrome\.css (Dracula window buttons\(, dotfiles cinnamon\/theme\)\{0,1\})\.$/d' \
    -e '/^\/\/ Added 2026-11-23: load chrome\/userChrome\.css (Dracula window buttons)$/d' \
    <profile>/user.js
```

The `sed` deletes only the exact pref line and the window-buttons comment lines. The value stays
active in `prefs.js`: set `toolkit.legacyUserProfileCustomizations.stylesheets` to `false` in
`about:config` (Thunderbird: the Config Editor in Settings, General).

To restore a stylesheet the installer replaced, after the `rm` above:

```bash
mv <profile>/chrome/userChrome.css.<timestamp>.bak <profile>/chrome/userChrome.css
```

## Undo

Thunderbird and Firefox window buttons: see the per-profile undo in the section above.

Previous values: `Adwaita`, `Default`, `cinnamon`, `gnome`, `Adwaita`.

```bash
gsettings set org.cinnamon.desktop.interface gtk-theme 'Adwaita'
gsettings set org.cinnamon.desktop.wm.preferences theme 'Default'
gsettings set org.cinnamon.theme name 'cinnamon'
gsettings set org.cinnamon.desktop.interface icon-theme 'gnome'
gsettings set org.cinnamon.desktop.interface cursor-theme 'Adwaita'
rm ~/.config/gtk-4.0/gtk.css ~/.config/gtk-4.0/gtk-dark.css ~/.config/assets
```

## Panel: GNOME-style quick settings

Cinnamon 6.4 ships no applet that merges network, sound and power into one menu like GNOME's
top-right corner, and none exists on Cinnamon Spices (searched 2026-11-11). The own applet
`applets/quick-settings@bgi/` fills that gap, see `README.md`.
