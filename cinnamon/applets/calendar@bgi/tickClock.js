// The tick of calendar@bgi's clocks. The panel's WallClock ticks as its format string asks:
// with a custom date format without seconds, once a minute. The applet's own times follow
// the desktop's seconds setting, so they need a WallClock of their own, without a format:
// it then ticks every second while the desktop shows seconds, every minute otherwise.
const CinnamonDesktop = imports.gi.CinnamonDesktop;

function newTickClock() {
    const clock = new CinnamonDesktop.WallClock();
    clock.set_format_string(null);
    return clock;
}
