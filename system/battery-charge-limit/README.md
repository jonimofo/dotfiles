# battery-charge-limit

Root helper for the Charge tile of the Quick Settings applet
(`cinnamon/applets/quick-settings@bgi`). It sets the laptop battery's charge mode through
sysfs (`/sys/class/power_supply/BAT0`, Dell `dell_laptop` driver):

| Command | Writes |
|---|---|
| `battery-charge-limit limit` | the thresholds 75 and 80, then `charge_types` = `Custom` |
| `battery-charge-limit full` | `charge_types` = `Adaptive`; the thresholds stay |

The thresholds only apply in `Custom` mode; the driver stores them in any mode, so they are
written first and the mode last: a failing threshold write never leaves `Custom` with the
old values. The `dell-laptop` driver keeps the end at least 5 above the start and silently
moves a value that would break that, so the thresholds are written in the order that keeps
the gap, a second pass covers a start that was already outside it, and all three values are
read back: the helper fails with a message rather than report a state it did not reach.

The applet shows `Charge 80%` only for `Custom` with the end threshold at 80; any other
state shows as `Charge 100%`, and a click from it applies `limit`.

Any other argument, no argument or two arguments: a usage line, exit 2, nothing written.
Missing sysfs files or a threshold that is not a number: a message, exit 1, nothing written.
A state already in place is left alone: nothing is written, it prints `unchanged`, exit 0. It uses no environment variable, no current
directory and no other command. Tests: `scripts/battery-charge-limit-test.sh`, on a fake
sysfs tree.

## Install (once per machine)

The applet calls the helper as `/usr/bin/sudo -n /usr/local/sbin/battery-charge-limit limit`
or `... full`, from the desktop session, with no terminal: `-n` never asks for a password,
so step 2 is what lets the tile work. Without it every click is refused (logged) and the
tile keeps showing the real mode.

1. Install the helper. It is a copy, not a link: a file root runs must not be writable by
   the user. Install again after a change to the script.

   ```bash
   sudo install -o root -g root -m 0755 \
     ~/Repos/dotfiles/system/battery-charge-limit/battery-charge-limit \
     /usr/local/sbin/battery-charge-limit
   ```

2. Allow exactly these two command lines through `sudo -n`, and nothing else. No sudoers
   file is shipped: create it with `sudo visudo -f /etc/sudoers.d/battery-charge-limit`,
   with this line, `youruser` replaced by your user name:

   ```
   youruser ALL=(root) NOPASSWD: /usr/local/sbin/battery-charge-limit limit, /usr/local/sbin/battery-charge-limit full
   ```

3. Reload the applet: `~/Repos/dotfiles/cinnamon/applet.sh reload quick-settings@bgi`.

## Uninstall

```bash
sudo rm /etc/sudoers.d/battery-charge-limit
sudo rm /usr/local/sbin/battery-charge-limit
```

The battery keeps the last mode written. To go back to the firmware's default first:
`sudo /usr/local/sbin/battery-charge-limit full`.
