const UPowerGlib = imports.gi.UPowerGlib;
const Interfaces = imports.misc.interfaces;
const Constants = require('./constants');
const BatteryModel = require('./batteryModel');

const KINDS = { battery: UPowerGlib.DeviceKind.BATTERY, unknownState: UPowerGlib.DeviceState.UNKNOWN };

// The laptop battery through cinnamon-settings-daemon, the stock power applet's source. Its
// icon string carries the charging state. @onChange(battery) gets the value of
// BatteryModel.pickBattery(), null without a battery; it runs on every daemon change.
class Battery {
    constructor(onChange) {
        this._onChange = onChange;
        this._proxy = null;
        this._changedId = 0;
        this._destroyed = false;
        Interfaces.getDBusProxyAsync(Constants.POWER_PROXY, (proxy, error) => {
            if (this._destroyed)
                return;
            if (error) {
                global.logError(`${Constants.LOG_PREFIX}: connecting to ${Constants.POWER_PROXY} failed, battery hidden`, error);
                this._onChange(null);
                return;
            }
            this._proxy = proxy;
            this._changedId = proxy.connect('g-properties-changed', () => this.refresh());
            this.refresh();
        });
    }

    refresh() {
        if (!this._proxy)
            return;
        this._proxy.GetPrimaryDeviceRemote((primary, primaryError) => {
            // "There is no primary device" is a normal answer: any battery is used then.
            const primaryId = primaryError ? null : this._deviceId(primary);
            this._proxy.GetDevicesRemote((result, error) => {
                if (this._destroyed)
                    return;
                if (error) {
                    global.logError(`${Constants.LOG_PREFIX}: reading the power devices failed`, error);
                    return;
                }
                this._onChange(BatteryModel.pickBattery(result[0], primaryId, KINDS));
            });
        });
    }

    destroy() {
        this._destroyed = true;
        if (this._changedId)
            this._proxy.disconnect(this._changedId);
    }

    // GetPrimaryDevice() may return the tuple or an array holding it (stock applet comment).
    _deviceId(primary) {
        const device = primary.length === 1 ? primary[0] : primary;
        return device[0];
    }
}
