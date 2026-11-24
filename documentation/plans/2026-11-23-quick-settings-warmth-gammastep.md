Status: VALIDATED

# Quick Settings: Warmth through gammastep on every screen

Applet `cinnamon/applets/quick-settings@bgi`. Issue #39.
Usage: [`cinnamon/README.md`](../../cinnamon/README.md#quick-settings-what-it-does).

## Goal

The Warmth row sets the screen colour temperature on every connected screen through
`gammastep` one-shot mode, and no longer uses Cinnamon's Night Light at all.

Out of scope: any change to what the row looks like (same row, slider, switch, value text
such as `2000 K`, range 1000 K to 6500 K, step 100), any other row or tile, Cinnamon's
Night Light settings page, new dependencies (gammastep 2.0.9 is already installed).

## Cause

The row wrote Night Light's keys (`org.cinnamon.settings-daemon.plugins.color`). Cinnamon's
colour daemon registers one colour device per monitor, keyed on vendor-model-serial. The
two Acer CB241HY monitors report the same serial, so they share one device and the second
monitor (DP-2-3) never gets the tint. Checked on the machine: `gammastep -m randr -O 3500`
tints both outputs and `gammastep -m randr -x` resets both.

## Design

- Switch on: `gammastep -m randr -P -O <kelvin>`. Switch off: `gammastep -m randr -x`.
  Command, method and flags are constants in `constants.js`.
- `-P` was added on 2026-11-23 after the first use on the real screens: without it each run
  tints the ramps left by the previous one. Measured at 4100 K, three runs in a row gave
  xrandr gamma 1.3, 1.5 then 1.8 on green: the slider could only darken. With `-P` every run
  starts from neutral ramps. The single run used to validate the design could not show it.
- The slider sends the value while dragging, one run per 100 K step, and the value text
  follows the handle. Runs go one at a time; a change made while one runs replaces any
  other waiting one, so the newest value is the one left on the screens. The kelvin is
  written to the settings once, on release (or after a scroll stops), not on every step.
- Kelvin is checked as an integer from `WARMTH_MIN_KELVIN` to `WARMTH_MAX_KELVIN` before it
  reaches argv; anything else is logged and not run.
- State in the applet's own settings: hidden `generic` keys `warmth-enabled` (default off)
  and `warmth-kelvin` (default 2000), generated into `settings-schema.json` from
  `WARMTH_SETTINGS`, outside every dialog section.
- Applied again at start when on (nothing runs when off), and after each monitor change:
  one timer in `applet.js` (`AsyncHelpers.Debouncer`, `MONITORS_SETTLE_DELAY_MS`) runs the
  Brightness detection and the Warmth re-apply once the changes stop. A newly plugged
  screen has neutral gamma.
- gammastep missing from PATH, or a failed run: the row, slider and switch, is dimmed and
  inert. A missing gammastep is logged once, when it goes missing; a failed run is logged
  with the command and the value, and the runs waiting behind it are dropped. The next menu
  open or monitor change looks for gammastep again and re-applies the stored state.
- A stored kelvin gammastep would refuse reads as the default 2000 K.
- Every command run through `subprocess.js` is killed after `COMMAND_TIMEOUT_MS` (60 s,
  above the slowest legitimate caller, nordvpn connect and ddcutil detect) and rejected as
  timed out.
- Night Light is neither read nor written: `nightLight.js` and the `NIGHT_LIGHT_*`
  constants are removed. The switch's screen reader name becomes `Warmth`.
- 2026-11-24: a Warmth click writes the applet settings file; about 0.3 s later Cinnamon
  reloads it and reports the four layout lists as changed, since it compares arrays with
  `==`. The layout was re-applied, the switch detached under the pointer, and further
  clicks were ignored until the pointer moved. `LayoutModel.LayoutChange` now compares the
  visible ids by content and the layout is applied again only when they differ.

## Owner's answers

- Chosen option: "Switch Warmth to gammastep (Recommended)".
- "the warmth one , it MUST work on all monitors, not just one"
- "go , i dont want to use night light at all if i use gammastep"

## Files

- `gammastepWarmth.js` (new): state, gammastep runs, serialization, recovery.
- `applet.js`, `asyncHelpers.js`, `subprocess.js`, `warmthModel.js`, `sliderRow.js`,
  `constants.js`, `brightness.js`,
  `booleanSetting.js`, `settings-schema.json`; `nightLight.js` removed.
- `scripts/cinnamon-quick-settings-schema.js`, `scripts/cinnamon-quick-settings-test.js`,
  `scripts/cinnamon-quick-settings-test.sh`, `cinnamon/README.md`.

## Verification

- `scripts/check-all.sh` green, with the fake gammastep tests.
- On screen, by the owner after Alt+F2 then `r`: switch on tints both monitors, the slider
  follows on both, switch off resets both, unplugging and plugging a monitor keeps the tint.
