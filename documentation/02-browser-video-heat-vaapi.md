# Runbook 02 — Browser video makes the fan roar (VA-API / AV1) — Dell XPS 13 9315, Debian 13

Audience: an AI assistant (Claude Code) working on this machine in a future session.
Written 2026-09-15 after the fix was verified. Related memory: `~/.claude/projects/-tmp/memory/xps-browser-video-vaapi.md`.

## 0. Symptom as reported
"VLC is fine, but YouTube/Twitch in the browser makes the fan spin up and the laptop heats."
Default browser is Firefox (Mozilla apt repo, 155.x). Google Chrome 153 and Brave 153 are also installed. Session is GNOME on **X11**.

## 1. Root cause (measured, not guessed)
1. VLC hands video to the Intel GPU decoder (VA-API), so it is cool.
2. YouTube serves **AV1** to any browser that advertises AV1 support (Firefox and Chromium both do).
3. Debian's default `intel-media-va-driver` (the *free* build of Intel's iHD driver) ships **no AV1 decode profile**
   (`vainfo` listed H264/HEVC/VP9 VLD only). The Alder Lake iGPU can decode AV1 in hardware; the driver just did not expose it.
4. Firefox therefore fell back to its bundled ffvpx/dav1d **software** AV1 decoder. Log proof:
   `D/PlatformDecoderModule Hw codec disabled by gfxVars for AV_CODEC_ID_AV1` and
   `RemoteDecoderChild ... description: ffvpx video decoder (RDD remote), process: rdd, codec: av1`.
   Chromium-based browsers have the same fallback (dav1d) and cannot be told to refuse AV1.
5. GPU proof: during YouTube playback `intel_gpu_top` showed the video engine (VCS) at **0.00 %**.
6. Aggravating factor: the ACPI platform profile is `performance` (choices: `cool quiet balanced performance`),
   which makes Dell's fan curve aggressive (8800 RPM observed at 63 °C).

Twitch is H.264, which was *already* GPU-decoded in all browsers before the fix. Any remaining Twitch heat is page JavaScript
(chat, emotes, ads) plus the fan profile, not video decoding.

## 2. Fix applied (2026-09-15)
1. Enabled the `non-free` component on the three Debian lines of `/etc/apt/sources.list`
   (backup: `/etc/apt/sources.list.bak-nonfree`). Only `non-free-firmware` was enabled before.
2. `sudo apt-get install intel-media-va-driver-non-free` → replaces `intel-media-va-driver` (same version 25.2.3, plus the non-free kernels).
   `vainfo` now lists `VAProfileAV1Profile0 : VAEntrypointVLD`.
3. Installed diagnostics: `vainfo`, `intel-gpu-tools` (provides `intel_gpu_top`, needs root).
4. **No browser configuration was changed.** Measured afterwards: Firefox 155, Chrome 153 and Brave 153 all decode
   H.264, VP9 and AV1 on the GPU with their default settings on this X11 session. Chrome needed no
   `--enable-features=AcceleratedVideoDecodeLinuxGL` (baseline without flags gave the same VCS usage).
5. Recommended to the user, not applied: `powerprofilesctl set balanced`.

## 3. Verification method (reuse this, it is robust)
YouTube is a bad test target: autoplay/consent behaviour made two of three runs play nothing. Use local clips instead.

```bash
S=$SCRATCHPAD   # any writable dir
ffmpeg -y -f lavfi -i testsrc2=size=1920x1080:rate=60 -t 20 -c:v libx264 -preset ultrafast -pix_fmt yuv420p $S/h264.mp4
ffmpeg -y -f lavfi -i testsrc2=size=1920x1080:rate=60 -t 20 -c:v libvpx-vp9 -deadline realtime -cpu-used 8 -b:v 4M $S/vp9.webm
ffmpeg -y -f lavfi -i testsrc2=size=1920x1080:rate=60 -t 20 -c:v libsvtav1 -preset 12 -crf 35 $S/av1.mp4
for c in h264:h264.mp4 vp9:vp9.webm av1:av1.mp4; do n=${c%%:*}; f=${c##*:}
  printf '<!doctype html><body style="margin:0;background:#000"><video autoplay muted loop playsinline src="%s" style="width:100vw;height:100vh"></video>' "$f" > $S/test-$n.html; done
```
Muted autoplay is always allowed, so the page plays without user interaction.

Measure (one browser + one clip at a time, ~20 s each):
```bash
export DISPLAY=:0
# Firefox, isolated profile so the user's real Firefox is never touched or killed:
MOZ_LOG="PlatformDecoderModule:5" MOZ_LOG_FILE=$S/moz.log firefox --no-remote --profile $S/ff-test --new-window "file://$S/test-av1.html" & FFPID=$!
sudo intel_gpu_top -l -s 2000 -o $S/gpu.txt &  sleep 22; sudo pkill intel_gpu_top   # (in Claude Code use `timeout 22 intel_gpu_top ...` instead of sleep)
awk 'NR>2 && $13+0>m{m=$13+0} END{print "VCS max %", m}' $S/gpu.txt      # column 13 = VCS (video engine) busy %
top -bn2 -d3 | awk '/^top/{n++} n==2' | grep -iE 'firefox|RDD|Isolated'   # RDD = Firefox decoder process
kill -TERM $FFPID
# Chromium family, throwaway profile:
google-chrome-stable --user-data-dir=$S/chrome-test --no-first-run "file://$S/test-av1.html" &
```
Interpretation:
- VCS > ~2 % and decoder process (Firefox `RDD`, Chrome renderer/utility) at single-digit CPU → **hardware** decode.
- VCS = 0 and the decoder process at tens of % → **software** decode.
- Firefox log: `Support AV_CODEC_ID_xxx for hw decoding` = VA-API available for that codec;
  `Hw codec disabled by gfxVars for AV_CODEC_ID_xxx` = the VA driver lacks the profile (fix the driver, not Firefox).
- Results on 2026-09-15 (1080p60 clips): Firefox VCS 2–4 %, RDD 4–5 % CPU; Chrome VCS 3–6 %; Brave VCS 5–6 % — all three codecs.

Clean-up: delete the clips, the throwaway profiles, and make sure `pgrep -f "user-data-dir=$S"` and `pgrep -f "profile $S/ff-test"` are empty.

## 4. Troubleshooting playbook

### Video heats the laptop again
1. `vainfo | grep -E 'Driver version|AV1'` — must show the iHD driver and `AV1Profile0 VLD`.
   Missing AV1 → the free driver came back (an apt upgrade or a sources change). `apt policy intel-media-va-driver-non-free`; reinstall it.
2. `sudo intel_gpu_top` while the video plays: VCS at 0 → decode is on the CPU. Then find which codec the site sends
   (YouTube: right-click → "Stats for nerds" → Codecs; `av01` = AV1, `vp09` = VP9, `avc1` = H.264) and test that codec with the local-clip method.
3. Firefox-specific: `about:support` → Graphics → `HARDWARE_VIDEO_DECODING` should be *available*. If blocked:
   - `media.ffmpeg.vaapi.enabled = true` (about:config / user.js in `~/.mozilla/firefox/ifcpghdw.default-release/`),
   - only if still blocked, `media.hardware-video-decoding.force-enabled = true`,
   - fallback if AV1 hardware is unavailable for good: `media.av1.enabled = false` (YouTube then serves VP9, which is hardware-decoded).
   Firefox has no flags file; prefs live in the profile's `user.js`.
4. Chrome/Brave-specific: `chrome://gpu` → "Video Decode: Hardware accelerated". If it is software:
   - the official .deb wrappers do **not** read `~/.config/chrome-flags.conf`; put flags in a copy of
     `/usr/share/applications/google-chrome.desktop` (or `brave-browser.desktop`) under `~/.local/share/applications/` on every `Exec=` line,
   - flags known to exist in this build: `--enable-features=AcceleratedVideoDecodeLinuxGL` (first try), then add `VaapiIgnoreDriverChecks`,
     `--use-angle=gl`; `AcceleratedVideoDecodeLinuxZeroCopyGL` last (can produce green/black frames on X11).
   - a rename of these features in a future Chrome can be checked with `grep -aoE 'AcceleratedVideoDecodeLinux[A-Za-z]*' /opt/google/chrome/chrome | sort -u`.
5. If the session ever moves to **Wayland**, re-measure: Firefox uses DMABUF/VA-API natively there; Chrome may need `--ozone-platform=wayland`.
6. Fan still loud with GPU decode confirmed → it is not decoding. Check `cat /sys/firmware/acpi/platform_profile`
   (`performance` = loud), `top` for the real consumer (gnome-shell on X11 with two monitors, Twitch page JS), and `sensors` for temperatures.

### Non-obvious gotchas met during the work
- `pgrep -fc /opt/google/chrome/chrome` returns 1 even when Chrome is closed: the `chrome-devtools` MCP helper matches. Use `--user-data-dir` markers.
- Never `pkill firefox-bin`: it kills the user's real browser. Launch tests with `--no-remote --profile <tmp>` and kill by PID.
- Don't take desktop screenshots for verification without asking; the user stopped a run that included one.
- `intel_gpu_top -l` needs root; column 13 is VCS only for this header layout — re-check the header if the tool version changes.
- `vainfo`'s driver selection: with i915 it picks iHD automatically; `LIBVA_DRIVER_NAME=iHD` forces it if in doubt. `i965-va-driver` is also installed but unused.

## 5. Rollback
- Go back to the free driver: `sudo apt-get install intel-media-va-driver` (removes the non-free one), optionally remove ` non-free` from `/etc/apt/sources.list` (or restore the `.bak-nonfree` copy), `sudo apt-get update`. Expect AV1 to go back to software decode.
- Nothing else to undo: no browser prefs, flags, or desktop overrides were written.

## 6. Lessons for the assistant
- Measure the GPU video engine before changing browser flags; here the browsers were already fine and only the driver was missing a codec.
- One YouTube run that "plays" is not evidence; two later runs silently played nothing. Local muted clips are deterministic.
- Keep tests isolated from the user's session (throwaway profiles, PID-targeted kills, no screenshots) — the user is at the machine.
- The XPS 13 9315 clamshell has a fan; do not describe it as fanless.
