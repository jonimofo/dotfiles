# Cinnamon theme: Dracula

Applications, window borders, panel, icons and cursors all use Dracula. Set up on 2026-11-11,
Cinnamon 6.4. The theme files come from upstream releases and are not versioned; only the
Thunderbird and Firefox stylesheet (`userChrome.css`) lives in this repo, under `theme/`.

## What is installed

| Part | Source | Location |
|---|---|---|
| GTK 2/3/4, Cinnamon panel, window borders | `Dracula.tar.xz` from github.com/dracula/gtk, release v4.0.0 | `~/.themes/Dracula/` |
| Icons | draculatheme.com, installed by hand beforehand | `~/.icons/dracula-icons/` |
| Cursors | `Dracula-cursors.tar.xz`, same gtk release | `~/.icons/Dracula-cursors/` |
| GTK4 / libadwaita override | symlinks into the theme | `~/.config/gtk-4.0/gtk.css`, `~/.config/gtk-4.0/gtk-dark.css`, `~/.config/assets` |
| Firefox address bar colours, Thunderbird and Firefox window buttons | `cinnamon/theme/` in this repo | `<profile>/chrome/userChrome.css`, `<profile>/chrome/dracula-assets` |

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

## Window title bars: every app uses the system one

Rule: an app that can draw its own title bar is set to use the system title bar instead. The
window manager then draws the frame and the Dracula buttons, the same for every window.

| App | Setting | Back to the app's own title bar |
|---|---|---|
| Firefox | Menu > More tools > Customize toolbar, tick "Title Bar" | untick it |
| Thunderbird | Config Editor (Settings, General): `mail.tabs.drawInTitlebar` = `false` | set it to `true` |
| Telegram | Settings > Advanced, tick "Use system window frame" | untick it |

Any other app with such an option (Electron and Qt apps often have one) follows the same rule.

## Firefox address bar colours

`theme/userChrome.css` gives the Firefox address bar a neutral grey that stands out from the
toolbar: background `#363636`, `#3e3e3e` on hover and focus, border `#6e6e6e`. The three values
are the `--bgi-urlbar-*` variables at the top of the block; change them there. The block is
scoped to the Firefox browser window, so it does nothing in Thunderbird. It sets Firefox's own
variables (`--urlbar-background-color`, `--urlbar-background-color-focus`,
`--urlbar-background-border`), checked on Firefox 161: the focus ring and the open results
panel keep Firefox's borders. Re-check the variable names after a major Firefox update.

Limits: the block sets no text colour, so it assumes a dark Firefox theme; with a light theme
the text would be dark on dark grey. Cropped popup windows keep Firefox's transparent,
read-only address bar.

Install and undo are the ones of the next section: the installer links the stylesheet into the
profile. Restart Firefox after a change.

## Thunderbird and Firefox window buttons

Being removed: with the system title bar (rule above) neither app draws its own buttons, so
this part of the stylesheet and the `dracula-assets` link no longer have an effect.

It applies only while an app still draws its own title bar: the window manager theme does not
reach those close, minimize and maximize buttons, and `theme/userChrome.css` swaps in the
Dracula dot images. The old pref `widget.gtk.non-native-titlebar-buttons.enabled` no longer exists.

Before running it:

- The theme from "Install" above must be present: the script needs `~/.themes/Dracula/assets`.
- Find each profile folder in `about:profiles`, line "Root Directory".
- The links point into this checkout. It must stay on a branch that contains `cinnamon/theme/`,
  otherwise Firefox silently loses the address bar colours and both apps the buttons.

```bash
cinnamon/theme/install.sh ~/.thunderbird/yft1awhq.default-default ~/.mozilla/firefox/ifcpghdw.default-release
```

For each profile, the script links `chrome/userChrome.css` to the repo file and
`chrome/dracula-assets` to `~/.themes/Dracula/assets`, and adds
`toolkit.legacyUserProfileCustomizations.stylesheets` to `user.js` if missing. A real
`userChrome.css` file or `dracula-assets` folder already there is replaced by the link and
kept next to it as `<name>.<timestamp>.bak`; the script stops with an error if that backup
name is already taken. `--check` shows what would change, without writing. Safe to run
twice. After a run that changed something it prints `Restart Firefox and Thunderbird to see
the change.`

Check: `cinnamon/theme/install.sh --check <profile>...` prints only `ok` lines and exits 0
when nothing would change, and exits 3 when something would change; 1 is an error, 2 a
usage error. After a restart, the Firefox address bar is grey. Thunderbird shows no visible
change once it uses the system title bar.

Limits: restore uses the maximize dot. Only the profiles given are changed. The window button
selectors were checked on Thunderbird 153 and Firefox 160, the address bar variables on
Firefox 161; re-check them after a major Mozilla update.

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
