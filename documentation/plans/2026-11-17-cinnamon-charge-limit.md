Status: DONE

# Cinnamon Quick Settings: charge limit

Applet `cinnamon/applets/quick-settings@bgi`, Cinnamon 6.4, X11. Issue #52. Earlier plans:
[`2026-11-16-cinnamon-quick-settings-extras.md`](2026-11-16-cinnamon-quick-settings-extras.md),
[`2026-11-17-cinnamon-quick-settings-media.md`](2026-11-17-cinnamon-quick-settings-media.md).

## Goal

A `Charge` tile that shows and switches the battery charge mode between the 80 % limit
(Custom, thresholds 75 and 80) and full charge (Adaptive), and goes back to the 80 % limit
by itself once the battery has been full and the charger is unplugged. The write goes through
one small root helper kept in the repo, installed by the owner.

## Owner's words

- "on fait 3 d'abord" (the charge limit)
- After the explanation of the facts below: "oui mais comment faire charge complete ??"
  (yes to the 80 % limit as the normal state, full charge on demand; the tile answers the
  question).

## Validated look and behaviour

```
Aujourd'hui :
   mode Adaptive, charge jusqu'à 100 %

Après, état normal :
   [ Charge 80%       ]    mode Custom, seuils 75 / 80

Un clic avant un déplacement :
   [ Charge 100%      ]    mode Adaptive, comme aujourd'hui

Pleine puis débranchée :
   [ Charge 80%       ]    retour automatique
```

## Facts read on the machine

Dell XPS, kernel 6.12, `dell_laptop` loaded.

- `/sys/class/power_supply/BAT0/charge_types` reads `Trickle Fast Standard [Adaptive] Custom`
  (the bracketed one is active), root-writable only.
- `charge_control_start_threshold` 75 and `charge_control_end_threshold` 80, root-writable
  only; they apply only in `Custom` mode. Today the mode is `Adaptive`, the battery at 100 %,
  status `Full`.
- `/sys/class/power_supply/AC/online` is 1; UPower reports `fully-charged`.
- The applet already follows the battery through cinnamon-settings-daemon.

## Decisions

- Helper `system/battery-charge-limit/battery-charge-limit`, POSIX `sh`, installed by the
  owner as `/usr/local/sbin/battery-charge-limit`, root:root 0755. Exactly one argument:
  `limit` (the thresholds 75 and 80 in an order that keeps the driver's gap, then Custom;
  all read back) or `full` (Adaptive, thresholds left). A state already in place is left
  alone (`unchanged`). Anything else writes nothing and exits non-zero. Changed by the
  audit, below.
- Tile `charge-limit` (`Charge limit` in Configure), after `keyboard-light`, shown by default.
  `Charge 80%` (not checked) in the limit state, `Charge 100%` (checked) otherwise. The limit
  state is: active charge type `Custom` and end threshold 80. Read from sysfs as files (no
  subprocess) at start, when the menu opens, after each write and on every battery change the
  applet receives; never on a timer.
- A click runs `sudo -n /usr/local/sbin/battery-charge-limit <limit|full>` as an argv array;
  `-n` never prompts; a refusal is logged and the tile shows the real state. Dimmed while the
  sysfs files or the helper file are absent.
- Automatic return: in the full state, once the battery has been seen full on AC, the next
  reading on battery runs `limit` once. "On AC" comes from the battery state
  cinnamon-settings-daemon already sends (charging, fully charged, pending charge: on AC;
  discharging, pending discharge: on battery). The memory is kept in the applet instance.
- No sudoers file is shipped. The helper must be runnable through `sudo -n`; the helper's
  README shows an optional narrow rule for a machine where it is not.

## As built

- Helper: `system/battery-charge-limit/battery-charge-limit`, with its README (install,
  uninstall, the optional narrow sudoers line). Tests: `scripts/battery-charge-limit-test.sh`,
  on a fake sysfs tree, through a copy that differs only by its `BATTERY_DIR` line; the write
  order is read from the copy's `sh -x` trace.
- Applet: `chargeModel.js` (pure: state from the sysfs texts, labels, the helper command,
  the automatic return), `chargeLimit.js` (reads with `Gio.File.load_contents_async`, runs
  the helper through `Subprocess.runCommand`), wired in `applet.js`.
- "On AC" comes from the battery state cinnamon-settings-daemon already sends with
  `GetDevices()`: `BatteryModel.pickBattery()` now also returns `onAc` and `full`. No extra
  read.
- A test compares the applet's constants with the helper's.

## Audit fixes

- Helper: the `dell-laptop` driver keeps the end at least 5 above the start and silently
  moves a value otherwise (v6.12): the thresholds are written in the order that keeps that
  gap, with a second pass for a start already outside it, then read back; the mode is
  written last, so a failing threshold write never leaves Custom with old values; a state
  already in place writes nothing and prints `unchanged`. Its tests run a copy whose
  `write_value()` is a model of the driver (`scripts/fixtures/battery-charge-limit/`).
- Tile: two states kept; anything other than Custom with the end at 80 shows as
  `Charge 100%`, and a click from it applies the limit. Labels built from the constants.
  `/usr/bin/sudo` by its absolute path; a run without an answer within 10 s is given up on;
  error text cut in the log; the busy flag cleared after the re-read; the last battery
  reading applied right after each write (a battery already full on AC when full is chosen
  counts as seen full); a hidden tile does nothing.

## Security reasoning for the helper

- It runs as root, so its only inputs are its argument and the sysfs files: a fixed `PATH`,
  absolute paths, no environment variable and no current directory used, no `eval`, the
  argument compared to two fixed words and never used to build a path or a command.
- It refuses to run when the sysfs files are missing, and writes nothing on any refusal.
- The values (battery name, thresholds, mode names) are constants at the top; the applet's
  copy is checked against them by a test.
- Writing the state already in place is harmless: it exits 0.
- The narrow sudoers example allows only the two exact command lines.

## Out of scope

Any other charge mode or threshold value; a settings UI for the values; a sudoers or polkit
file; installing anything.
