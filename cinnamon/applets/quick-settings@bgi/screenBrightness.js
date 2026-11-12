const Interfaces = imports.misc.interfaces;
const Constants = require('./constants');

// Laptop panel brightness through cinnamon-settings-daemon, as the stock power applet sets
// it: never through sysfs directly.
class ScreenBrightness {
    constructor() {
        this._proxyPromise = null;
    }

    async read() {
        const proxy = await this._getProxy();
        const percent = await new Promise((resolve, reject) => {
            proxy.GetPercentageRemote((result, error) => {
                if (error)
                    reject(error);
                else
                    resolve(result[0]);
            });
        });
        return percent / Constants.PERCENT;
    }

    async write(fraction) {
        const proxy = await this._getProxy();
        const percent = Math.min(Constants.PERCENT, Math.round(fraction * Constants.PERCENT));
        await new Promise((resolve, reject) => {
            proxy.SetPercentageRemote(percent, (result, error) => {
                if (error)
                    reject(new Error(`setting the laptop panel brightness to ${percent}% failed: ${error.message}`));
                else
                    resolve();
            });
        });
    }

    // A failed connection is not kept: the next read tries again, so a settings daemon
    // that starts late is still found.
    _getProxy() {
        if (!this._proxyPromise) {
            this._proxyPromise = new Promise((resolve, reject) => {
                Interfaces.getDBusProxyAsync(Constants.SCREEN_BRIGHTNESS_PROXY, (proxy, error) => {
                    if (error) {
                        this._proxyPromise = null;
                        reject(error);
                    } else {
                        resolve(proxy);
                    }
                });
            });
        }
        return this._proxyPromise;
    }
}
