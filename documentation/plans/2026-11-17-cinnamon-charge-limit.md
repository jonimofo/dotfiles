Status: VALIDATED

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
  `limit` (Custom, then the thresholds in a safe order, ending at 75 and 80) or `full`
  (Adaptive, thresholds left). Anything else writes nothing and exits non-zero.
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
- No sudoers file is shipped: on this machine the owner's account already runs commands
  without a password. A narrow rule for another machine is an optional example in the
  helper's README.

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
