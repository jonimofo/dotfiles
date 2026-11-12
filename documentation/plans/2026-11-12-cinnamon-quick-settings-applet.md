Status: VALIDATED

# Cinnamon Quick Settings applet

Applet `cinnamon/applets/quick-settings@bgi`, Cinnamon 6.4, X11.
Install and usage: [`cinnamon/README.md`](../../cinnamon/README.md).

## Goal

One panel button that opens a GNOME-style Quick Settings menu: status icons on the panel,
then sliders and toggle tiles in one popup, in place of the separate network, sound and
power applets.

Out of scope: patching Cinnamon internals, any file under `/usr/share/cinnamon`, new
packages, removing the stock network, sound and power applets (the user removes them once
the applet is validated), per-monitor brightness sliders.

## Validated mockup

```
Panel:  [ wifi bt vpn vol ]   one button

+------------------------------------------+
| 87%      [shot] [settings] [lock] [power]|
|                                          |
| sun  Monitors   ======o----              |
| vol  Output     =========o--   >         |
| mic  Input      =====o------   >         |
|                                          |
| [ Wi-Fi     > ]   [ Bluetooth     > ]    |
| [ VPN SEB   > ]   [ NordVPN       > ]    |
| [ Power: Bal > ]  [ Night Light     ]    |
| [ Dark style  ]   [ Do Not Disturb  ]    |
| [ Keep awake  ]   [ Mic mute        ]    |
+------------------------------------------+
'>' opens a submenu: networks, devices,
VPN profiles, NordVPN countries, profiles.
```

## Slider rows reordered and renamed (after step 3)

Request: "first show Sound, second Microphone, 3rd brigthness". Answer: "Reorder and rename
(Recommended)": the labels become Sound, Microphone, Brightness. The order is the `SLIDERS`
array in `constants.js`, the only place that sets it.

```
| 100%     [shot] [settings] [lock] [power]|
|                                          |
| vol  Sound       =========o--   >        |
| mic  Microphone  =====o------   >        |
| sun  Brightness  ======o-----            |
|                                          |
| [ Wi-Fi     > ]   [ Bluetooth     > ]    |
```

## Validated list mockup (step 3)

Answer: "GNOME style, in place (Recommended)": the list opens as a panel inside the menu,
under the row of the tile, and pushes the rest down. A second click on '>' or opening
another list closes it.

```
| [ Wi-Fi     v ]   [ Bluetooth     > ]    |
| +--------------------------------------+ |
| | Wi-Fi                                | |
| |  * HomeBox            lock  ||||     | |
| |    Office-5G          lock  |||      | |
| |    Cafe                     ||       | |
| |  ----------------------------------  | |
| |  All networks...                     | |
| +--------------------------------------+ |
| [ VPN SEB   > ]   [ NordVPN       > ]    |
| [ Power: Bal > ]  [ Night Light     ]    |
```

## Decisions

| Question | Answer |
|---|---|
| Tiles | GNOME parity plus NordVPN, Do Not Disturb, Keep awake, Mic mute, screenshot button |
| Brightness | One linked slider for both Acer CB241HY monitors (DDC/CI through `ddcutil`), value sent on release. The laptop panel uses `intel_backlight` when it is the active screen |
| Stock applets | Kept on the panel until the user validates the new applet |
| Preview | Live on the panel: layout first with two working tiles, the rest after the look is validated |

## Facts checked on the machine (2026-11-12)

- `ddcutil detect` sees both monitors without sudo (`/dev/i2c-18`, `/dev/i2c-19`). Writing
  works without sudo: the same value written back on bus 18 (step 2). One read or write takes
  about 1.3 s, detection about 1.7 s.
- The laptop panel brightness answers through cinnamon-settings-daemon
  (`org.cinnamon.SettingsDaemon.Power.Screen GetPercentage`).
- No PulseAudio source exists while the internal microphone is disabled: the Input slider is
  dimmed, as the stock sound applet hides its input section.
- `power-profiles-daemon` is active. `nordvpn`, `nmcli`, `bluetoothctl`, `flameshot` are installed.
- NetworkManager has one VPN profile, `SEB` (OpenVPN). NordVPN creates no NetworkManager
  profile while disconnected; its interface is `nordlynx` (name found in its binaries), left
  out of the VPN tile. Not checked while connected.
- `nordvpn` 6.0.2: `nordvpn status` prints `Status: Disconnected`; `nordvpn countries` prints
  one name per line with underscores for spaces. The connected status format comes from the
  binary's strings (`Status: %s`, `Country: %s`), not from a capture.
- Bluetooth: BlueZ is active (adapter `hci0`, four paired devices), driven over D-Bus
  (`org.bluez`, ObjectManager). blueman is the installed settings tool (`blueman-manager`);
  blueberry and the GNOME panel are not usable here.
- Settings pages, as the stock applets open them: `cinnamon-settings network`,
  `cinnamon-settings sound`; 802.1x Wi-Fi goes to `cinnamon-settings network connect-8021x-wifi`.
- `NM.Device.disconnect()` takes the device offline and shadows GObject's `disconnect()`:
  signal handlers on NetworkManager objects are removed with `GObject.signal_handler_disconnect`.
- Night Light: `org.cinnamon.settings-daemon.plugins.color night-light-enabled`.
- Dark style: `org.x.apps.portal color-scheme` (`prefer-dark` today).
- Do Not Disturb and Keep awake: mechanism to read from the stock `notifications@cinnamon.org`
  and `inhibit@cinnamon.org` applets, not guessed.

## Steps

1. Layout with every tile visible, Wi-Fi and Dark style working. Look validated live on the panel.
2. Sliders: monitor brightness, output volume, microphone.
3. Network tiles and submenus: Wi-Fi, Bluetooth, VPN SEB, NordVPN.
4. System tiles and header buttons: power profile, Night Light, Do Not Disturb, Keep awake,
   Mic mute, screenshot, settings, lock, power.
5. README, install script, checks on the panel, PR ready for review.
