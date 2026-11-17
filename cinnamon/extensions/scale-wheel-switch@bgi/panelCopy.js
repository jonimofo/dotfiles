const Clutter = imports.gi.Clutter;
const St = imports.gi.St;
const Mainloop = imports.mainloop;
const Main = imports.ui.main;
const UiHelpers = require('./uiHelpers');

// Panel clocks the fallback band shows, first found first used.
const PANEL_CLOCK_UUIDS = ['calendar@bgi', 'calendar@cinnamon.org'];
const CLOCK_BAND_STYLE_CLASS = 'scale-clock-bar';
// Stage coordinates carry float noise (a panel at y 0.000122, 29.999878 high): snapped to
// the hundredth of a pixel, so a panel on the edge compares equal to the monitor's edge.
const STAGE_SNAP = 100;
// After Scale closes, the copy goes once the real panel is fully shown again (its fade-in
// lasts 0.2 s), or after this delay whatever happens.
const RELEASE_TIMEOUT_MS = 1000;

// Copies whose Scale has closed, waiting for their panel to be fully shown.
const releasedCopies = new Set();

// Stage box {x, y, width, height} of @actor, snapped.
function boxOf(actor) {
    const [x, y] = actor.get_transformed_position();
    const [width, height] = actor.get_transformed_size();
    return snapBox({ x, y, width, height });
}

function snapBox(box) {
    const snap = value => Math.round(value * STAGE_SNAP) / STAGE_SNAP;
    return { x: snap(box.x), y: snap(box.y), width: snap(box.width), height: snap(box.height) };
}

// A panel along the top edge of @monitor, within its width. False for a panel at the bottom
// or on a side, on another monitor, or moved above the screen by autohide.
function isOnTopEdge(box, monitor) {
    return box.y === monitor.y && box.x >= monitor.x && box.x + box.width <= monitor.x + monitor.width;
}

// The first of @panels ({actor, box}) on @monitor's top edge, or null.
function findTopPanel(panels, monitor) {
    return panels.find(panel => isOnTopEdge(panel.box, monitor)) || null;
}

// The real panel is back once it is shown at full opacity.
function isPanelShown(actor) {
    return actor.visible && actor.opacity >= UiHelpers.OPAQUE;
}

function primaryPanels() {
    return Main.panelManager.getPanelsInMonitor(Main.layoutManager.primaryIndex)
        .map(panel => ({ actor: panel.actor, box: boxOf(panel.actor) }));
}

// The running panel clock applets' actors.
function findPanelClockActors() {
    const actors = [];
    for (const uuid of PANEL_CLOCK_UUIDS) {
        for (const applet of Main.AppletManager.getRunningInstancesForUuid(uuid)) {
            if (applet.actor)
                actors.push(applet.actor);
        }
    }
    return actors;
}

// The top of the primary monitor in Scale, which hides the panels: a copy of the top panel at
// its place, or, without a top panel there, a band with a copy of the panel clock centred.
// Null with neither.
function createPanelCopy() {
    const monitor = Main.layoutManager.primaryMonitor;
    const topPanel = findTopPanel(primaryPanels(), monitor);
    if (topPanel)
        return new PanelCopy(monitor, topPanel);

    const [clockActor] = findPanelClockActors();
    return clockActor ? new ClockBand(monitor, clockActor) : null;
}

// Removes the copies still waiting for their panel: Scale opening again, disable().
function destroyReleasedCopies() {
    for (const copy of [...releasedCopies])
        copy.destroy();
}

// A live copy of the whole top panel at its pixels, above Scale's group and at full opacity:
// Scale fades the real panel out and back in above it, so the top of the screen never
// changes. It takes no input; the click blocker under it, as high as the panel, swallows
// the clicks so none reaches Scale's background.
var PanelCopy = class PanelCopy {
    constructor(monitor, panel) {
        this._panelActor = panel.actor;
        this._opacityId = 0;
        this._timeoutId = 0;
        this._copy = new Clutter.Clone({ source: panel.actor, x: panel.box.x, y: panel.box.y,
            width: panel.box.width, height: panel.box.height });
        this.actor = new St.Widget({ reactive: true, x: monitor.x, y: monitor.y, width: monitor.width });
        this.actor.set_height(panel.box.y + panel.box.height - monitor.y);
        UiHelpers.swallowClicks(this.actor);

        UiHelpers.destroyOnFailure(this, () => this._show());
    }

    _show() {
        Main.overview._group.insert_child_below(this.actor, Main.overview._coverPane);
        global.overlay_group.add_actor(this._copy);
    }

    getHeight() {
        return UiHelpers.getNaturalHeight(this.actor);
    }

    // Scale has closed: the copy stays until the real panel is fully shown again.
    release() {
        this._destroyBlocker();
        if (isPanelShown(this._panelActor)) {
            this.destroy();
            return;
        }

        releasedCopies.add(this);
        this._opacityId = this._panelActor.connect('notify::opacity', () => {
            if (isPanelShown(this._panelActor))
                this.destroy();
        });
        this._timeoutId = Mainloop.timeout_add(RELEASE_TIMEOUT_MS, () => {
            this._timeoutId = 0;
            this.destroy();
            return false;
        });
    }

    destroy() {
        releasedCopies.delete(this);
        if (this._opacityId) {
            this._panelActor.disconnect(this._opacityId);
            this._opacityId = 0;
        }
        if (this._timeoutId) {
            Mainloop.source_remove(this._timeoutId);
            this._timeoutId = 0;
        }
        if (this._copy) {
            this._copy.destroy();
            this._copy = null;
        }
        this._destroyBlocker();
    }

    _destroyBlocker() {
        if (this.actor) {
            this.actor.destroy();
            this.actor = null;
        }
    }
};

// Fallback without a top panel on the primary monitor: the panel clock, copied live and
// centred in a band at the top. Not reactive: the band swallows the clicks.
var ClockBand = class ClockBand {
    constructor(monitor, clockActor) {
        this._copy = new Clutter.Clone({ source: clockActor, x_align: Clutter.ActorAlign.CENTER });
        this.actor = new St.Bin({ style_class: CLOCK_BAND_STYLE_CLASS, reactive: true, child: this._copy });
        UiHelpers.swallowClicks(this.actor);
        this.actor.set_position(monitor.x, monitor.y);
        this.actor.set_width(monitor.width);

        UiHelpers.destroyOnFailure(this, () => this._show());
    }

    _show() {
        Main.overview._group.insert_child_below(this.actor, Main.overview._coverPane);
    }

    getHeight() {
        return UiHelpers.getNaturalHeight(this.actor);
    }

    release() {
        this.destroy();
    }

    destroy() {
        this.actor.destroy();
    }
};
