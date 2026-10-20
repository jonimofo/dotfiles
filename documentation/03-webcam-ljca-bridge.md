# Runbook 03 — Built-in webcam absent (LJCA USB bridge) — Dell XPS 13 9315, Debian 13

Audience: an AI assistant (Claude Code) working on this machine in a future session.
Written 2026-09-15. Related memory: `~/.claude/projects/-tmp/memory/xps-9315-webcam-ljca.md`.

## 0. The camera chain (all in-tree on kernel 6.12, nothing to install)

```
USB bus 3 port 4 ─ LJCA bridge (8086:0b63 "MCHP USB Bridge", ACPI \_SB.PC00.XHCI.RHUB.HS04)
   └─ usb-ljca ─┬─ ljca-gpio (INTC1096)  ─┐
                ├─ ljca-i2c  ─ ov01a10 sensor (ACPI OVTI01A0 under \_SB.PC00.LNK1)
                └─ ljca-spi  ─ vsc-tp / mei_vsc / ivsc-* (Intel Visual Sensing Controller, INTC1094/INTC1095 "CVFD")
MIPI CSI-2 ─ intel-ipu6 / intel-ipu6-isys (PCI 0000:00:05.0, firmware intel/ipu/ipu6ep_fw.bin)
   └─ libcamera 0.4 softISP ─ WirePlumber "Built-in Front Camera" ─ Firefox/Chrome via PipeWire camera (already enabled)
```
The bridge, the IVSC and the sensor are all physically on the camera module in the lid. Only USB, CSI-2, two IVSC GPIOs and power cross the hinge.

## 1. Symptom and root cause

Symptom: no camera anywhere (`cam -l` empty, no Video source in `wpctl status`, browsers see nothing).
Root cause: the USB bridge is electrically absent most of the time. Evidence (journal, 2026-08-11 → 2026-09-15):
- Never enumerated at boot in 8 consecutive boots; appeared hours later, then vanished.
- Connects 1–4 s after `Lid closed.` (2026-09-05 19:41, 2026-09-06 17:45) or spontaneously with the lid open; disconnects spontaneously (2026-09-08 16:04, lid open) or reported at resume.
- After a drop, four quick lid cycles did not bring it back.
- No `unable to enumerate` / descriptor errors ever: the device is either fully there or fully gone → intermittent contact (hinge/display cable or module connector), not a driver problem.
- When present, the whole chain comes up by itself in ~10 s and the camera works (uncalibrated softISP: functional, mediocre picture).

## 2. Ruled out (do not redo)

| Suspect | Check | Result |
|---|---|---|
| BIOS camera disabled | `sudo cat /sys/class/firmware-attributes/dell-wmi-sysman/attributes/Camera/current_value` | `Enabled` |
| Old BIOS | `fwupdmgr get-updates --no-unreported-check --no-metadata-check --no-remote-check` | 1.39.0, no updates |
| Port powered off by runtime PM | `usb3-port4/power/runtime_status` = active, `state` = not attached, no `pm_qos_no_power_off` file | port is powered |
| ACPI-controlled port power | `iasl -d` of DSDT, `Device (HS04)` | only `_ADR`, no `_UPC`/`_PR0`/`_PS0` |
| Missing drivers/firmware | `/usr/sbin/modinfo -n usb_ljca intel_ipu6 ov01a10 mei_vsc ivsc_ace ivsc_csi`; `ls /lib/firmware/intel/ipu /lib/firmware/intel/vsc` | all present |
| USB port toggle, xHCI rebind, IVSC reset/wake GPIOs (INTC1055 pins 265/14) | done 2026-09-13 | no effect |

## 3. First thing to run in any future session

```
lsusb | grep 0b63 || echo "bridge absent: no software fix exists"
```
If absent, stop looking for a software fix. If present: `cam -l`, `wpctl status` (Video section), test in a browser.

## 4. Non-destructive things that remain (user-performed)

1. Live test: `sudo dmesg -w | grep -E 'usb 3-4|ljca|ov01a10|intel_vsc'` while the user slowly closes/opens the lid to several angles and presses gently around the camera bezel and hinge corners. A `new full-speed USB device` line = contact confirmed and a temporary working position.
2. Dell pre-boot diagnostics (F12 → Diagnostics → camera test): tests the module outside Linux; a failure there is the evidence for Dell service.
3. EC / flea-power reset: shutdown, unplug dock and USB-C power, hold power 30 s, reconnect, boot, `lsusb | grep 0b63`.
4. Durable: Dell service (display/camera cable or camera module; service tag via `sudo dmidecode -s system-serial-number`) or an external USB webcam (plug-and-play through PipeWire).

## 5. Hard rules

- **Never restart `wireplumber`/`pipewire` after the bridge has disconnected during the session.** Processes holding the removed V4L2 subdev fds oops the kernel in `subdev_close` on exit, become unreapable zombies and their units hang in "deactivating". Reboot instead.
- No PCI/USB unbind or GPIO experiments: already tried, no effect, and unbind-from-hooks is what deadlocked suspend on the audio side (see runbook 01).
- Do not touch BIOS attributes: nothing is misconfigured.

## 6. Nice-to-have if the user asks

- Desktop notification when the bridge appears/disappears (udev rule on `ATTR{idVendor}=="8086", ATTR{idProduct}=="0b63"` + `notify-send` as the session user), so the user knows when the built-in camera is usable.
- Newer libcamera with an `ov01a10` tuning file would improve the picture quality when the camera is present; irrelevant to availability.
