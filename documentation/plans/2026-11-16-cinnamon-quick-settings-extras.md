Status: DONE

# Cinnamon Quick Settings: six extras

Applet `cinnamon/applets/quick-settings@bgi`, Cinnamon 6.4, X11. First plan:
[`2026-11-12-cinnamon-quick-settings-applet.md`](2026-11-12-cinnamon-quick-settings-applet.md).
Install and usage: [`cinnamon/README.md`](../../cinnamon/README.md).

## Goal

Six additions, each shown or hidden (and ordered where order applies) through the existing
Configure dialog lists: a Warmth row with a Night Light switch, the battery percentage on
the panel, and Keyboard light, Airplane mode, Touchpad tiles, plus a CPU line under the tiles.

## Validated mockup

```
Panel button:   wifi  bt  vpn  vol  87%

+--------------------------------------------+
| 87%                  [shot][set][lock][off] |
+--------------------------------------------+
| Sound       ==========O---------         >  |
| Microphone  =====O--------------         >  |
| Brightness  ============O-------            |
| Warmth      =======O------  3400 K  [ ON ]  |
+--------------------------------------------+
| [ Wi-Fi           > ] [ Bluetooth       > ] |
| [ NordVPN         > ] [ VPN             > ] |
| [ Balanced        > ] [ Airplane mode     ] |
| [ Keyboard  Low     ] [ Charge 80%        ] |
| [ Fan  Quiet      > ] [ Touchpad          ] |
+--------------------------------------------+
| CPU  php 212%                               |
+--------------------------------------------+
| Song title                                  |
| Artist                   [<<]  [||]  [>>]   |
+--------------------------------------------+

Switch off: slider dimmed, screen back to normal
```

Owner's answers:

- "i also want to make sure to have a night light toggle + threshold"
- "also can this slicer have some kind of toggle ? also i want the CPU  php 212% block to be
  UNDER the tiles, AND the last block is the media control one, (below it again)."
- "Switch on the row (Recommended)": a switch at the right end of the Warmth row turns Night
  Light on and off; the Night Light tile stays, in sync, and stays hideable in Configure.
- "The six no-root items": Warmth row with switch, battery % on the panel, Keyboard light,
  Airplane mode, Touchpad, CPU line.

## Decisions

- Warmth: `org.cinnamon.settings-daemon.plugins.color`, `night-light-temperature` (uint32)
  and `night-light-enabled`. Same range as Cinnamon's Night Light page: 1700 K to 4700 K,
  step 100, inverted (handle to the right = warmer = fewer kelvin). The value shows as
  `3400 K`. The switch at the right end writes `night-light-enabled`; while off the slider is
  dimmed and takes no input. One object serves the row and the Night Light tile, so both
  follow the key live. Listed in the Sliders tab as Warmth.
- Battery on the panel: a `Battery` entry at the end of the Panel tab, shown by default, text
  like `87%` after the icons, hidden without a battery. It reuses the header's battery read.
- Keyboard: UPower `KbdBacklight` on the system bus. A click goes to the next level, back to
  0 after the maximum. The label is `Keyboard` plus the level word (`Off`, `Low`, `High` for
  a maximum of 2). Checked when the level is above 0; dimmed when UPower has no such object.
  Follows `BrightnessChanged`.
- Airplane mode: a click turns Wi-Fi and Bluetooth off and remembers what each was; a second
  click turns back on only the radios that were on. Uses the applet's own Wi-Fi (libnm) and
  Bluetooth (BlueZ) code. Turning a radio back on by hand while it is checked unchecks it.
- Touchpad: `org.cinnamon.desktop.peripherals.touchpad` `send-events`. The schema range is
  `enabled`, `disabled`, `disabled-on-external-mouse`: checked unless `disabled`; a click
  writes `disabled` or `enabled`.
- CPU line: `CPU  <process> <percent>%`, the process using the most CPU, read only when the
  menu opens, through `top` in batch mode (two frames half a second apart, the second one
  measured), run asynchronously with an argv array. The parser is a pure function tested on a
  captured output. Per-core percent, as `top` shows it (212% = a bit over two cores).
  Show and hide: one more row, `CPU line`, at the end of the Tiles tab (the line sits under the
  tiles); its place in that list does not move it, as with the header's battery.
- New tiles are appended to `TILES`; a saved configuration without the new ids gets them
  appended, shown (`layoutModel.normalize`).
- Dark style and Touchpad share one string-setting toggle (`stringSetting.js`).

## Out of scope

- `Charge 80%` tile: issue #52.
- `Fan` tile: issue #53.
- Media controls block: issue #34.
- gammastep: issue #39.
- Anything needing root, sudo, polkit or a new package.
