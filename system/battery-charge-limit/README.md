# battery-charge-limit

Root helper for the Charge tile of the Quick Settings applet
(`cinnamon/applets/quick-settings@bgi`). It sets the laptop battery's charge mode through
sysfs (`/sys/class/power_supply/BAT0`, Dell `dell_laptop` driver):

| Command | Writes |
|---|---|
| `battery-charge-limit limit` | `charge_types` = `Custom`, then the thresholds 75 and 80, in an order that keeps the start below the end |
| `battery-charge-limit full` | `charge_types` = `Adaptive`; the thresholds stay |

Any other argument, no argument or two arguments: a usage line, exit 2, nothing written.
Missing sysfs files or a threshold that is not a number: a message, exit 1, nothing written.
Applying the state already in place exits 0. It uses no environment variable, no current
directory and no other command. Tests: `scripts/battery-charge-limit-test.sh`, on a fake
sysfs tree.

## Install (by the owner, once)

```bash
sudo install -o root -g root -m 0755 \
  ~/Repos/dotfiles/system/battery-charge-limit/battery-charge-limit \
  /usr/local/sbin/battery-charge-limit
```

It is a copy, not a link: a file root runs must not be writable by the user. Install again
after a change to the script. The applet then reloads with
`~/Repos/dotfiles/cinnamon/applet.sh reload quick-settings@bgi`.

## Uninstall

```bash
sudo rm /usr/local/sbin/battery-charge-limit
```

The battery keeps the last mode written. To go back to the firmware's default first:
`sudo /usr/local/sbin/battery-charge-limit full`.

## Without passwordless sudo (another machine, optional)

The applet runs `sudo -n /usr/local/sbin/battery-charge-limit limit` or `... full`, which
never asks for a password. On an account that needs a password for sudo, a rule allowing
only these two command lines does it. Example, not shipped, edited with
`sudo visudo -f /etc/sudoers.d/battery-charge-limit`:

```
youruser ALL=(root) NOPASSWD: /usr/local/sbin/battery-charge-limit limit, /usr/local/sbin/battery-charge-limit full
```
