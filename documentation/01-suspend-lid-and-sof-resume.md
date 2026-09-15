# Runbook 01 — Suspend / lid / SOF audio-on-resume (Dell XPS 13 9315, Debian 13)

Audience: an AI assistant (Claude Code) working on this machine in a future session.
Written 2026-09-15 after the fix was verified. Related memory: `~/.claude/projects/-tmp/memory/xps-sof-audio-dsp-crash.md`.

## 0. Machine facts you need before touching anything

| Item | Value |
|---|---|
| Host | `xps`, Dell XPS 13 9315 (clamshell, Alder Lake-UP4, i915 iGPU 8086:46aa) |
| OS | Debian 13 trixie, kernel 6.12.x, systemd (logind), GNOME on **X11** |
| Audio | `sof-audio-pci-intel-tgl` on PCI `0000:00:1f.3`, card `sofsoundwire`, SOF firmware 2:2:0-57864 |
| Sleep mode | `s2idle` only (`/sys/power/mem_sleep` = `[s2idle]`), no `deep` |
| Fan | Present (`dell_smm` fan1, nominal max 8100 RPM). Not fanless. |
| Journal | User is NOT in `adm`/`systemd-journal`: system/kernel journal needs `sudo`. `sudo -n` works (passwordless). |
| Journal gotcha | `journalctl -k` implies current boot only. For history use `journalctl -k -b -N` or drop `-k` and grep `kernel:`. |
| Docking | USB-C dock, 2 external 1920x1080 monitors on DP-MST (`DP-9`/`DP-10` = `DP-3-2`/`DP-3-3` in xrandr). Internal `eDP-1` is disabled by the user's display config. |

## 1. Problem history (debrief)

### 1a. Original audio bug (July–Sept 2026)
The SOF DSP fails "IMR restore" when it comes back from D3 after suspend and wedges:
kernel logs `ipc tx timed out` / `IPC timeout` from `sof-audio-pci-intel-tgl 0000:00:1f.3`,
PipeWire logs `spa.alsa: set_hw_params: Connection timed out`, Speaker sink dies or becomes "Dummy Output".
Restarting PipeWire/WirePlumber never fixes it (the crash is in kernel/firmware); only a driver cold-boot does.
A second, unrelated trigger was found on 2026-09-14: starting capture on the broken internal SoundWire mic
(rt715-sdca). That mic is now hidden by `~/.config/wireplumber/wireplumber.conf.d/50-disable-broken-soundwire-mic.conf`.

### 1b. First fix attempt (July 2026) — the resume hook, later the cause of the suspend failure
`/usr/local/bin/sof-resume-reset` + `/etc/systemd/system/sof-resume-reset.service` (WantedBy suspend.target):
on every resume it did `echo 0000:00:1f.3 > .../unbind`, then `bind`, then `modprobe -r/modprobe snd_soc_sof_sdw`,
logging to `/var/log/sof-resume-reset.log`. `TimeoutStartSec=150` was added on 2026-09-14 09:27.

### 1c. What actually broke suspend (2026-09-14 evening)
1. After a PipeWire-related kernel oops, a dead process kept ALSA fds open.
2. The hook's `echo > unbind` then blocked forever in `snd_card_disconnect_sync` → an `sh` task stuck in **D state**.
3. Every following suspend attempt failed: the kernel cannot freeze a D-state task.
   Journal signature (`sudo journalctl _COMM=systemd-sleep`):
   ```
   systemd-sleep: Failed to freeze unit 'user.slice': Connection timed out
   systemd-sleep: Performing sleep operation 'suspend'...
   systemd-sleep: Failed to put system to sleep. System resumed again: Device or resource busy
   ```
   Kernel (with pm_debug_messages): `task:sh  state:D ... ppid:1` repeated once per hook run (12 stuck `sh` by 23:25).
   systemd: `sof-resume-reset.service: Unit process NNN (sh) remains running after unit stopped`.
4. Each failed attempt re-triggered suspend.target → the hook ran again (~every 8 min, see the log file) → one more D-state task. Loop until reboot.
5. Symptom seen by the user: "laptop does not sleep when I close the lid / seems to need Suspend clicked".
   In reality the lid was always configured correctly; the sleep itself was failing.

### 1d. The fix (applied 2026-09-15 ~10:11, reboot 10:24)
- `sudo systemctl disable sof-resume-reset.service` (unit file and script left on disk, **do not re-enable**).
- `/etc/modprobe.d/snd-sof-resume.conf`:
  ```
  options snd_sof sof_debug=0x80
  ```
  Bit 7 = `SOF_DBG_IGNORE_D3_PERSISTENT`: the driver re-downloads the DSP firmware on every D3 exit
  instead of restoring from IMR (the step that wedged). Verify with `cat /sys/module/snd_sof/parameters/sof_debug` → `128`.
- `/etc/tmpfiles.d/pm-debug-messages.conf`: `w /sys/power/pm_debug_messages - - - - 1` so a failed freeze names the guilty task.
- `sudo update-initramfs -u` (snd_sof is in the initramfs, so the modprobe option must be baked in).
- `sudo modprobe -r kvm_intel kvm` also appears in that morning's sudo log; it was a troubleshooting step, not part of the persistent fix.

### 1e. Verification done (2026-09-15)
Three lid-close suspends at 10:25, 10:26 and 10:27: `Lid closed.` → `Suspending...` → `PM: suspend entry (s2idle)`
~8 s later → `Lid opened.` → `PM: suspend exit` → `System returned from sleep operation 'suspend'`.
After all three: Speaker sink present in `wpctl status`, no `ipc tx timed out` in dmesg.

## 2. How lid / dock behaviour works here (do not "fix" this, it is correct)

- `/etc/systemd/logind.conf` is untouched → defaults: `HandleLidSwitch=suspend`, `HandleLidSwitchExternalPower=suspend`, `HandleLidSwitchDocked=ignore`.
- GNOME does **not** handle the lid itself. `gsd-media-keys` blocks power/suspend/hibernate **keys**, not the lid switch.
- When ≥1 external monitor is connected, `gsd-power` takes a `handle-lid-switch` **block** inhibitor
  ("External monitor attached or configuration changed recently") and logind reports `Docked=true`.
  → Closing the lid while docked does nothing (correct, desired).
- Unplugging the dock with the lid closed: monitors vanish → gsd-power releases the inhibitor after its safety timer,
  logind re-checks the lid → **suspend within seconds**. Plugging the dock back in does not wake it; opening the lid does.
- `Delay lock is active (gnome-shell) but inhibitor timeout is reached` in the logind log is benign
  (gnome-shell took >5 s to lock the screen; suspend proceeds anyway).
- Check state quickly:
  ```
  busctl get-property org.freedesktop.login1 /org/freedesktop/login1 org.freedesktop.login1.Manager Docked
  busctl get-property org.freedesktop.login1 /org/freedesktop/login1 org.freedesktop.login1.Manager LidClosed
  systemd-inhibit --list --no-legend | grep -i lid
  ```

## 3. Troubleshooting playbook

### "It does not suspend" (lid or menu)
1. Did logind even try?  `sudo journalctl -u systemd-logind --since -2d -g 'Lid closed|Suspending|inhibited'`
   - `Lid closed.` with no `Suspending...` → an inhibitor (`systemd-inhibit --list`) or `Docked=true`. Expected when docked.
2. Did the kernel enter sleep?  `sudo journalctl --since -2d -g 'PM: suspend entry|PM: suspend exit'` (no `-k`, see gotcha).
3. Did systemd-sleep fail?  `sudo journalctl _COMM=systemd-sleep --since -2d`
   - `Failed to freeze unit 'user.slice'` / `Device or resource busy` → a task refuses to freeze.
4. Find the stuck task: `ps -eo pid,ppid,stat,wchan:32,comm | awk '$3 ~ /D/'` and, with pm_debug_messages on,
   `sudo journalctl -k -g 'refusing to freeze|task:.*state:D'`.
   - D-state `sh` under ppid 1 with wchan `snd_card_disconnect_sync` → someone re-enabled the old hook or ran a PCI unbind while a process held `/dev/snd/*`. Only a reboot clears a D-state task.
5. Confirm the modprobe option is live: `cat /sys/module/snd_sof/parameters/sof_debug` must print `128`.
   If it prints `0`, the initramfs is stale: `sudo update-initramfs -u` and reboot.

### "Audio is dead after resume" (even with the fix)
1. `sudo dmesg | grep -E 'ipc tx timed out|IPC timeout|failed to free widget'`.
2. Make sure nothing holds ALSA fds before any driver reset: `sudo fuser -v /dev/snd/*` — if a zombie/dead process holds them, **do not unbind/bind**, reboot instead.
3. Manual recovery when the DSP is wedged and nothing holds fds (from the memory file):
   ```
   systemctl --user stop pipewire.socket pipewire-pulse.socket pipewire pipewire-pulse wireplumber
   sudo modprobe -r snd_soc_sof_sdw snd_sof_pci_intel_tgl
   sudo modprobe snd_sof_pci_intel_tgl && sudo modprobe snd_soc_sof_sdw
   systemctl --user start pipewire.socket pipewire-pulse.socket wireplumber
   systemctl --user is-active pipewire-pulse.service   # restart it if inactive
   ```
4. `Slave 6 initialization failed: -61` spam (~10k lines) at every resume is harmless noise from the rt715 codec; ignore it.

### Things that look like bugs but are not
- Lid closed while docked → stays awake. By design.
- ~8 s delay between lid close and sleep. GNOME delay inhibitors (screen lock, screen-time data).
- `journalctl -k --since -14d` shows only today: `-k` limits to the current boot.

## 4. Rollback / change control

- Revert the SOF option: delete `/etc/modprobe.d/snd-sof-resume.conf`, `sudo update-initramfs -u`, reboot. Expect dead audio after resume again.
- Never re-enable `sof-resume-reset.service`. If a resume-time reset is ever needed again, it must (a) check `fuser /dev/snd/*` first and (b) never be `WantedBy=suspend.target` in a way that re-enters the sleep path.
- `pm_debug_messages` costs nothing; leave it on.
- Lid/logind config: leave at defaults. If the user ever wants "close lid on dock = suspend", that is a GNOME/gsd-power behaviour change (there is no supported GNOME toggle; the only clean way is a logind `HandleLidSwitchDocked=suspend` drop-in **plus** stopping gsd-power's inhibitor, which is not supported). Advise against.

## 5. Lessons for the assistant
- Read the actual journal before theorising: the user framed it as a lid problem; the logs showed a freeze failure.
- A resume hook that touches PCI bind/unbind can deadlock the whole sleep path. Prefer driver options over hooks.
- Always confirm privilege boundaries first (`journalctl` empty ≠ no events; it was a permissions issue).
- Verify with real events (`PM: suspend entry/exit`, `System returned from sleep`) and check audio afterwards, not just "no errors".
