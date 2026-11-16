# Runbook 06 — nemo-preview and patched Nemo built from source — Dell XPS 13 9315, Debian 13

Audience: an AI assistant (Claude Code) working on this machine in a future session. Written 2026-11-16.

Debian 13 packages neither `nemo-preview` (Space quick-look in Nemo) nor the `xreader` libraries it needs. Both are built as `.deb` from Linux Mint's upstream tags. Nemo itself is rebuilt from Debian's source with one patch, so that an open preview follows the selection.

## 0. What is installed

| Package(s) | Version | Source | Notes |
|---|---|---|---|
| `nemo`, `nemo-data`, `libnemo-extension1`, `gir1.2-nemo-3.0` | `6.4.5-1+local1` | `apt-get source nemo` (Debian 6.4.5-1) + `nemo-preview/nemo-6.4.5-preview-follow-selection.patch` as a quilt patch | **`apt-mark hold`**: a Debian Nemo update stays held until rebuilt |
| `nemo-preview` | `6.4.0+local7` | `linuxmint/nemo-extensions` tag `6.4.0` + `nemo-preview/nemo-preview-6.4.0-local7.patch` | patch also carries the `debian/changelog` entries local1 to local7 |
| `libxreaderdocument3`, `libxreaderview3`, `gir1.2-xreader` | `4.6.8` | `linuxmint/xreader` tag `4.6.8`, unpatched | the xreader viewer app itself is not installed |

Patch files live next to this runbook in `nemo-preview/`. Both were checked on 2026-11-16 to apply cleanly to the pristine sources.

Build packages were removed after the build. Compared with the pre-install state, 83 runtime packages remain added (Clutter, GStreamer, WebKit and their `gir1.2-*` bindings).

## 1. What the patches do

**Nemo** (`src/nemo-view.c`, `src/nemo-previewer.c/.h`):
- On every selection change, after a 150 ms debounce, if exactly one file is selected, Nemo calls `UpdateFile(uri, xid)` on `org.nemo.Preview` with `G_DBUS_CALL_FLAGS_NO_AUTO_START`. It never starts a preview by itself.

**nemo-preview**:
- PDF and office documents open in a plain GTK window (`src/js/ui/documentWindow.js`) instead of the Clutter stage. Inside `GtkClutter.Actor`, `XreaderView` relayouts the whole stage on every pointer event and freezes on scroll. Upstream issue: linuxmint/nemo-extensions#593 (open, also affects 6.6).
- `UpdateFile` follows only the Nemo window that opened the preview (same `xid`), and only while a preview window is open.
- Preview windows do not take the keyboard focus (`focusOnMap: false`): arrow keys stay in Nemo. Esc works after clicking into the preview; Space in Nemo closes it.
- Windows stay centered while resizing (`Gtk.WindowPosition.CENTER_ALWAYS`).
- Images and videos grow to `SCREEN_FILL_RATIO` (0.85) of the monitor work area; small images keep native size; text and HTML keep 800x600 (`VIEW_MAX_W/H`).
- The process stays alive `IDLE_EXIT_TIMEOUT_MS` (10 min) after the last window closes. Idle cost: about 68 MB PSS fresh, about 258 MB after video or office previews; 0% CPU.
- Bug fixes that only showed once the process outlived its windows: `pdf_path` double free in `nemo_preview_pdf_loader_cleanup_document`, the LibreOffice exit callback loading a NULL path after a cancelled conversion (loader now ref'd by the child watch), video player signals left connected, toolbar fade running after close.

All constants are in `src/js/util/constants.js`.

## 2. Tests

No upstream test suite. Two regression tests for the PDF loader, in `nemo-preview/tests/`, run headless with `cjs`. Exit code 0 means pass.

```bash
cd ~/Repos/dotfiles/documentation/nemo-preview/tests
L=/usr/lib/x86_64-linux-gnu/nemo-preview
DOC=file:///path/to/any.odt   # e.g. soffice --headless --convert-to odt sample.txt
GI_TYPELIB_PATH=$L/girepository-1.0 LD_LIBRARY_PATH=$L cjs pdf-loader-double-free.js "$DOC"; echo $?
G_DEBUG=fatal-criticals GI_TYPELIB_PATH=$L/girepository-1.0 LD_LIBRARY_PATH=$L cjs pdf-loader-cancel-conversion.js "$DOC"; echo $?
```

Against the unfixed library they exit 134 (double free) and 133 (critical) respectively. Point `L` at an extracted `.deb` (`dpkg-deb -x`) to test a build before installing it.

Manual checks after any change: PDF wheel scrolling without freeze, an office file, an image in the floating preview, Space toggles closed, ↑/↓ in Nemo switches the open preview, large photo or video opens big and centered.

Two fixes have no automated test (they need a display and GStreamer): video player signals disconnected on close, toolbar fade stopped on close. Check: preview a video for 2 s and close it, preview an image and close it, wait 5 s, then this must print 0:

```bash
journalctl --user --since "-2min" --no-pager | grep -cE "nemo-preview-st.*(has been already disposed|GTK_IS_ADJUSTMENT)"
```

## 3. Rebuild (Nemo update in Debian, or a change to the patches)

Work in a durable directory, for example `~/Repos/Sandbox/nemo-preview-build/`. Snapshot first so the build packages can be removed exactly: `dpkg-query -W -f='${Package}\n' | sort > pkgs-before.txt`.

**Nemo** (needed when Debian ships a new Nemo; `apt list --upgradable` shows it held):

```bash
sudo apt-get build-dep -y nemo
apt-get source nemo && cd nemo-<version>
mkdir -p debian/patches   # Debian's nemo source ships no patches
cp ~/Repos/dotfiles/documentation/nemo-preview/nemo-6.4.5-preview-follow-selection.patch debian/patches/preview-follow-selection.patch
echo preview-follow-selection.patch >> debian/patches/series
# add a changelog entry <debian version>+local1, then:
dpkg-buildpackage -b -us -uc
sudo apt-mark unhold nemo nemo-data libnemo-extension1 gir1.2-nemo-3.0
# dpkg-buildpackage writes the .deb files to the parent directory
sudo apt-get install ../nemo_*+local1_amd64.deb ../nemo-data_*+local1_all.deb ../libnemo-extension1_*+local1_amd64.deb ../gir1.2-nemo-3.0_*+local1_amd64.deb
sudo apt-mark hold nemo nemo-data libnemo-extension1 gir1.2-nemo-3.0
nemo -q   # closes all Nemo windows; the desktop (nemo-desktop) keeps running
```

If the patch no longer applies to a newer Nemo, the hook point is `nemo_view_notify_selection_changed` and the D-Bus pattern is `nemo_previewer_call_close`.

**xreader libraries, then nemo-preview** (needed only to change the preview):

```bash
sudo apt-get install -y debhelper gobject-introspection intltool libarchive-dev libdjvulibre-dev libgail-3-dev \
  libgirepository1.0-dev libglib2.0-dev libgtk-3-dev libgtk2.0-dev libgxps-dev libkpathsea-dev libpoppler-glib-dev \
  libsecret-1-dev libsm-dev libspectre-dev libtiff-dev libxapp-dev libx11-dev libxml2-dev lsb-release mate-common \
  meson xsltproc yelp-tools zlib1g-dev gnome-pkg-tools libclutter-1.0-dev libclutter-gst-3.0-dev \
  libclutter-gtk-1.0-dev libfreetype-dev libcjs-dev libgstreamer1.0-dev libgtksourceview-4-dev \
  libmusicbrainz5-dev libwebkit2gtk-4.1-dev gnome-common
git clone --depth 1 --branch 4.6.8 https://github.com/linuxmint/xreader.git && (cd xreader && dpkg-buildpackage -b -us -uc)
sudo apt-get install ./libxreaderdocument3_4.6.8_amd64.deb ./libxreaderview3_4.6.8_amd64.deb ./gir1.2-xreader_4.6.8_amd64.deb \
  ./libxreaderdocument-dev_4.6.8_amd64.deb ./libxreaderview-dev_4.6.8_amd64.deb
git clone --depth 1 --branch 6.4.0 https://github.com/linuxmint/nemo-extensions.git
cd nemo-extensions && git apply ~/Repos/dotfiles/documentation/nemo-preview/nemo-preview-6.4.0-local7.patch
cd nemo-preview && dpkg-buildpackage -b -us -uc
sudo apt-get install ../nemo-preview_6.4.0+local7_amd64.deb
```

Viewer files are loaded from the installed path (`/usr/share/nemo-preview/js/viewers`, hardcoded in `src/main.c`): a scratch copy with `GJS_PATH` does not test viewer changes, install the `.deb`.

Before installing a new nemo-preview, kill an idle `/usr/libexec/nemo-preview-start` (no window open) or it keeps serving old code for up to 10 minutes.

**Cleanup**: `apt-mark auto` the packages in `comm -13 pkgs-before.txt <now>` except the ones to keep, simulate `apt-get -s autoremove` and check that nothing outside the list and none of the packages in section 0 appear, then remove. `gdb` stays installed unless named, because `gcc` suggests it.

## 4. Undo (back to stock Debian Nemo, no preview)

```bash
sudo apt-mark unhold nemo nemo-data libnemo-extension1 gir1.2-nemo-3.0
sudo apt-get install --allow-downgrades nemo=6.4.5-1 nemo-data=6.4.5-1 libnemo-extension1=6.4.5-1 gir1.2-nemo-3.0=6.4.5-1
sudo apt-get --autoremove remove nemo-preview gir1.2-xreader libxreaderview3 libxreaderdocument3
nemo -q
```

## 5. Diagnostics that worked

- A frozen preview: sample its main thread with `gdb -p <pid> -batch -ex 'thread 1' -ex 'bt 50'` a few times; same stack plus high CPU means a livelock.
- Who owns the bus name: `gdbus call --session --dest org.freedesktop.DBus --object-path /org/freedesktop/DBus --method org.freedesktop.DBus.GetConnectionUnixProcessID org.nemo.Preview`.
- Start the service without a window (to measure memory): `...--method org.freedesktop.DBus.StartServiceByName org.nemo.Preview 0`.
- Preview logs go to the user journal tagged `nemo-preview-st` and `org.nemo.Preview`; the `Register mimetype` lines are normal startup noise.
- Never use synthetic input (xdotool) to test on the live desktop: the user presses the keys.
