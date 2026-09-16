# Runbook 05 — niri + Noctalia installed beside GNOME — Dell XPS 13 9315, Debian 13

Audience: an AI assistant (Claude Code) working on this machine in a future session. Written 2026-09-15.

## 0. What was installed and where (GNOME untouched, GDM stays the display manager)

| Component | Source | Location | Undo |
|---|---|---|---|
| niri 26.04 | built from `~/Repos/Sandbox/niri` (git tag v26.04, `cargo build --release`) | `/usr/local/bin/niri`, `/usr/local/bin/niri-session`, `/usr/local/share/wayland-sessions/niri.desktop`, `/usr/local/share/xdg-desktop-portal/niri-portals.conf`, `/etc/systemd/user/niri.service`, `/etc/systemd/user/niri-shutdown.target` | delete those 6 files |
| xwayland-satellite | built from `~/Repos/Sandbox/xwayland-satellite` (main) | `/usr/local/bin/xwayland-satellite` | delete the file |
| Noctalia 5.1.0 | official apt repo `https://pkg.noctalia.dev/deb/` (`/etc/apt/sources.list.d/noctalia-trixie.sources`, key `/usr/share/keyrings/nickh-archive-keyring.gpg` from package `nickh-archive-keyring`) | `/usr/bin/noctalia` + `noctalia-data` | `apt remove noctalia noctalia-data nickh-archive-keyring`, delete the `.sources` file |
| helpers (Debian) | apt | `fuzzel swaybg swaylock alacritty brightnessctl xwayland xdg-desktop-portal-gnome` | `apt remove` (keep `xwayland`, `xdg-desktop-portal-gnome`: GNOME uses them) |
| user config | generated from `niri/resources/default-config.kdl` | `~/.config/niri/config.kdl`; Noctalia writes `~/.config/noctalia/` on first run | delete the directories |

Build deps (cargo/rustc 1.85.1, clang, lib*-dev) were installed by an earlier session on 2026-09-15; niri's MSRV is 1.85.

## 1. How to use

- Log out of GNOME; on the GDM login screen click the gear icon and choose **Niri**. GNOME stays selectable.
- Keys (Mod = Super): `Mod+Space` Noctalia launcher, `Mod+S` control center, `Mod+Comma` Noctalia settings, `Mod+T` alacritty, `Mod+D` fuzzel, `Mod+Q` close, `Super+Alt+L` swaylock, `Mod+Shift+E` quit niri, `Mod+Shift+/` hotkey overlay.
- `spawn-at-startup "noctalia"` is in the config; the default `Mod+Comma { consume-window-into-column; }` bind was commented out to make room. `debug { honor-xdg-activation-with-invalid-serial }` added (Noctalia notification actions).
- Validate after any edit: `niri validate -c ~/.config/niri/config.kdl`.

## 2. Laptop-specific cautions

- Do NOT log out while the webcam bridge (8086:0b63) has appeared and vanished during the session: stopping pipewire/wireplumber with stale camera fds oopses the kernel (runbook 03). Check `lsusb | grep 0b63` history in `journalctl -k` before logging out if in doubt.
- Lid/suspend/audio are handled by logind and the kernel, not GNOME: unchanged under niri. Under niri there is no gsd-power lid inhibitor, but logind still ignores the lid while `Docked=true` (2 external monitors).
- The GNOME session is X11; niri is Wayland. Screen sharing goes through `xdg-desktop-portal-gnome`/`gtk` per `niri-portals.conf`.
- Outputs: niri auto-enables all connected outputs; the two dock monitors are DP-MST (`DP-3-2`/`DP-3-3` names under X11, will differ under Wayland — use `niri msg outputs`).

## 3. Upgrade

- niri: `cd ~/Repos/Sandbox/niri && git fetch --tags && git checkout <new tag> && cargo build --release`, then re-run the `install` commands from section 0 (binary + resources).
- Noctalia: `apt upgrade`.
- xwayland-satellite: `git pull && cargo build --release`, reinstall the binary.

## 4. Known noise

- `apt update` prints a pre-existing signature error for the Dropbox repo (`linux.dropbox.com`, SHA1 key rejected by sqv). Unrelated to this install.
