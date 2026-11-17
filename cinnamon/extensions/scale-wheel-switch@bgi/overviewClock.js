const Clutter = imports.gi.Clutter;
const St = imports.gi.St;
const Main = imports.ui.main;
const UiHelpers = require('./uiHelpers');

// Panel clocks the row shows, first found first used.
const PANEL_CLOCK_UUIDS = ['calendar@bgi', 'calendar@cinnamon.org'];
const BAND_STYLE_CLASS = 'scale-clock-bar';
// Off the panel's top edge, the copy sits in a band with the search bar's padding.
const CENTRED_BAND_STYLE_CLASS = 'scale-clock-bar-centred';
// Stage coordinates carry float noise (a panel at y 0.000122, 29.999878 high): snapped to
// the hundredth of a pixel, so a panel on the edge compares equal to the monitor's edge.
const STAGE_SNAP = 100;

// Stage box {x, y, width, height} of @actor.
function boxOf(actor) {
    const [x, y] = actor.get_transformed_position();
    const [width, height] = actor.get_transformed_size();
    return { x, y, width, height };
}

function snapBox(box) {
    const snap = value => Math.round(value * STAGE_SNAP) / STAGE_SNAP;
    return { x: snap(box.x), y: snap(box.y), width: snap(box.width), height: snap(box.height) };
}

// The panel clock's place, relative to @monitor, when its panel runs along the top edge of
// @monitor: {x, y, bandHeight}, the band reaching the panel's bottom edge. Null otherwise
// (panel at the bottom or on the side, on another monitor, or hidden by autohide).
function placeAtPanel(rawClockBox, rawPanelBox, monitor) {
    const clockBox = snapBox(rawClockBox);
    const panelBox = snapBox(rawPanelBox);
    const onTopEdge = panelBox.y === monitor.y && panelBox.x >= monitor.x &&
        panelBox.x + panelBox.width <= monitor.x + monitor.width;
    const inPanel = clockBox.x >= panelBox.x && clockBox.x + clockBox.width <= panelBox.x + panelBox.width &&
        clockBox.y >= panelBox.y && clockBox.y + clockBox.height <= panelBox.y + panelBox.height;
    if (!onTopEdge || !inPanel)
        return null;

    return {
        x: clockBox.x - monitor.x,
        y: clockBox.y - monitor.y,
        bandHeight: Math.round(panelBox.y + panelBox.height - monitor.y),
    };
}

// The running panel clocks, as {actor, clockBox, panelBox}.
function findPanelClocks() {
    const clocks = [];
    for (const uuid of PANEL_CLOCK_UUIDS) {
        for (const applet of Main.AppletManager.getRunningInstancesForUuid(uuid)) {
            if (applet.actor && applet.panel)
                clocks.push({ actor: applet.actor, clockBox: boxOf(applet.actor), panelBox: boxOf(applet.panel.actor) });
        }
    }
    return clocks;
}

// The clock on @monitor's top panel first, then any other: {clock, place}, place null when
// the clock is not on that panel. Null without a clock.
function chooseClock(clocks, monitor) {
    for (const clock of clocks) {
        const place = placeAtPanel(clock.clockBox, clock.panelBox, monitor);
        if (place)
            return { clock, place };
    }
    return clocks.length > 0 ? { clock: clocks[0], place: null } : null;
}

// The panel clock in Scale, on the primary monitor: a live copy of the panel's own, which
// Scale hides, so the same text, look and updates. With the clock on the primary monitor's
// top panel, the copy sits on the clock's pixels and the band behind it reaches the panel's
// bottom edge: the clock does not move when Scale opens. Otherwise the copy is centred in a
// band at the top. Null without a panel clock: no band.
function createOverviewClock() {
    const monitor = Main.layoutManager.primaryMonitor;
    const chosen = chooseClock(findPanelClocks(), monitor);
    return chosen ? new OverviewClock(monitor, chosen.clock, chosen.place) : null;
}

var OverviewClock = class OverviewClock {
    // @place is null when the copy goes in the centred band.
    constructor(monitor, clock, place) {
        this._isAtPanel = Boolean(place);
        // Not reactive: the band under it swallows the clicks, so no calendar opens.
        this._copy = new Clutter.Clone({ source: clock.actor, width: clock.clockBox.width, height: clock.clockBox.height });
        this.actor = new St.Bin({ style_class: BAND_STYLE_CLASS, reactive: true });
        UiHelpers.swallowClicks(this.actor);
        this.actor.set_position(monitor.x, monitor.y);
        this.actor.set_width(monitor.width);
        if (this._isAtPanel) {
            this.actor.set_height(place.bandHeight);
            this._copy.set_position(monitor.x + place.x, monitor.y + place.y);
        } else {
            this.actor.add_style_class_name(CENTRED_BAND_STYLE_CLASS);
            this._copy.x_align = Clutter.ActorAlign.CENTER;
            this.actor.set_child(this._copy);
        }

        UiHelpers.destroyOnFailure(this, () => this._show());
    }

    // At the panel's place the copy is above Scale's group, at full opacity while the group
    // fades in and out over the panel, which fades the other way: the text never blinks.
    _show() {
        Main.overview._group.insert_child_below(this.actor, Main.overview._coverPane);
        if (this._isAtPanel)
            global.overlay_group.add_actor(this._copy);
    }

    getHeight() {
        return UiHelpers.getNaturalHeight(this.actor);
    }

    destroy() {
        this._copy.destroy();
        this.actor.destroy();
    }
};
