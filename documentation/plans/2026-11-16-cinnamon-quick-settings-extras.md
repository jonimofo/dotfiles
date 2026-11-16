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
  and `night-light-enabled`. Same range as Cinnamon's Night Light page (widened in the third
  review round): 1700 K to 4700 K,
  step 100, inverted (handle to the right = warmer = fewer kelvin). The value shows as
  `3400 K`. The switch at the right end writes `night-light-enabled`; while off the slider is
  dimmed and takes no input. It follows the keys live. Listed in the Sliders tab as Warmth.
  The Night Light tile was removed afterwards (see below).
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
  writes `disabled` or `enabled`. Removed afterwards (see the second review round).
- CPU line: `CPU  <process> <percent>%`, the process using the most CPU, read only when the
  menu opens, through `top` in batch mode (two frames half a second apart, the second one
  measured), run asynchronously with an argv array. The parser is a pure function tested on a
  captured output. Per-core percent, as `top` shows it (212% = a bit over two cores).
  Show and hide: one more row, `CPU line`, at the end of the Tiles tab (the line sits under the
  tiles); its place in that list does not move it, as with the header's battery.
- New tiles are appended to `TILES`; a saved configuration without the new ids gets them
  appended, shown (`layoutModel.normalize`). Both changed in the second review round.
- Dark style and Touchpad share one string-setting toggle (`stringSetting.js`); Dark style
  alone uses it since the Touchpad tile was removed.

## Night Light tile removed (review round)

Request: "make sure to remove tile Nigh light (because redundant with slicer warmth)+ make vpn
... and NOrd vpn same row". The Warmth switch already turns Night Light on and off, so the
Night Light tile is gone. A saved Tiles list that still names it simply drops it
(`layoutModel.normalize` ignores ids no longer declared), which also brings NordVPN and VPN
onto one row in a saved order that had Night Light before them. In the default order VPN and
NordVPN are tiles 3 and 4, one row. Tests cover both.

```
| [ Wi-Fi           > ] [ Bluetooth       > ] |
| [ NordVPN         > ] [ VPN             > ] |
| [ Balanced        > ] [ Airplane mode     ] |
```

## Last tile rows reordered, Touchpad removed (second review round)

Request: "for the last two rows of tiles, from left to right : Airplane Mode, Performance,
other row : Keyboard, -> Remove Touchpad," (Performance is the Power profile tile, whose
label is the active profile.)

```
| [ Wi-Fi           > ] [ Bluetooth       > ] |
| [ NordVPN         > ] [ VPN             > ] |
| [ Airplane mode     ] [ Performance     > ] |
| [ Keyboard  Low     ]                       |
```

- The Touchpad tile is removed, with its keys and test.
- Default `TILES` order: wifi, bluetooth, vpn, nordvpn, airplane-mode, power-profile,
  keyboard-light, dark-style, do-not-disturb, keep-awake, mic-mute.
- A declared element missing from a saved list is no longer appended: it goes just before the
  first of its declared successors that the saved list holds, else at the end
  (`layoutModel.insertMissing`). So the grid above shows for a saved Tiles list made before
  these tiles existed, without editing it. Warmth still comes after Brightness, Battery after
  the panel icons, the CPU line at the end of the Tiles list.

## Tiles swapped, wider Warmth, VPN name on the panel (third review round)

Request: "ok swap airplane mode and performance tiles; it loads ok , the slicer warmths OK
(maybe we may need to increse max/min value, based on the software), we also need to make
sure that VPN selected is displayed in the top bar (next to icon o wifi + i want to be able to
reorganise elements from bar, tiles, etc)". Reorganising is already the Configure lists.

A. Tile grid for the saved configuration:

```
| [ Wi-Fi           > ] [ Bluetooth       > ] |
| [ NordVPN         > ] [ VPN             > ] |
| [ Performance     > ] [ Airplane mode     ] |
| [ Keyboard  Low     ]                       |
```

B. Warmth range, chosen "6500 K to 1000 K (Recommended)" (the captions are mockup notes, not
UI text):

```
Warmth   O--------------------   6500 K   [ ON ]
         no tint

Warmth   ==========O----------   3700 K   [ ON ]

Warmth   ====================O   1000 K   [ ON ]
         deepest red

Step: 100 K
```

C. VPN on the panel, chosen "Icon plus short name (Recommended)":

```
NordVPN connected to France:

  wifi  vpn France  bt  vol  87%

NetworkManager VPN connected:

  wifi  vpn <profile name>  bt  vol  87%

No VPN:

  wifi  bt  vol  87%
```

- Default `TILES`: wifi, bluetooth, vpn, nordvpn, power-profile, airplane-mode,
  keyboard-light, dark-style, do-not-disturb, keep-awake, mic-mute.
- Warmth: 6500 K to 1000 K, step 100, still inverted. A stored value outside the range keeps
  its value; the slider sits at the nearest end and the text shows the stored value.
- VPN panel item: icon, then `VpnModel.panelName()`: NordVPN's country, the active
  NetworkManager profile's name, both joined by ` + ` (NordVPN first). Each name is cut to
  16 characters, the last one `…`. Same panel text style as the battery label.
- Default `PANEL_ICON_ITEMS`: wifi, vpn, bluetooth, volume, battery. A saved Panel list keeps
  its own order.

## Out of scope

- `Charge 80%` tile: issue #52.
- `Fan` tile: issue #53.
- Media controls block: issue #34.
- gammastep: issue #39.
- Anything needing root, sudo, polkit or a new package.
