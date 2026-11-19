// What reaches the Charge tile, by whether the tile shows. A hidden tile does nothing at
// all: no read and no automatic return, since the automatic return is the only write to
// the battery without a click. Showing the tile reads once; each battery change while it
// shows goes to ChargeLimit.onBattery(). @charge: a ChargeLimit, or a fake in the tests.
class ChargeGate {
    constructor(charge) {
        this._charge = charge;
        this._shown = false;
    }

    // @shown: whether the layout shows the tile; called on every layout change.
    setShown(shown) {
        if (shown && !this._shown)
            this._charge.refresh();
        this._shown = shown;
    }

    // @battery: from BatteryModel.pickBattery(), null without a battery.
    onBattery(battery) {
        if (this._shown)
            this._charge.onBattery(battery);
    }
}
