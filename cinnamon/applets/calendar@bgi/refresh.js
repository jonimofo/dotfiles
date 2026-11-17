// When calendar@bgi refreshes its views of the events.
const Constants = require('./constants');

// Runs @callback once per burst of requests: the first request schedules it with @schedule
// (which returns a source id), the next ones are dropped until it has run. The calendar
// server sends one signal per event, about 500 on an opening here.
class Coalescer {
    constructor(schedule, cancel, callback) {
        this._schedule = schedule;
        this._cancel = cancel;
        this._callback = callback;
        this._id = 0;
    }

    // True when this request scheduled a run, false when one was already pending.
    request() {
        if (this._id !== 0)
            return false;
        this._id = this._schedule(() => {
            this._id = 0;
            this._callback();
        });
        return true;
    }

    cancel() {
        if (this._id === 0)
            return;
        this._cancel(this._id);
        this._id = 0;
    }
}

// Whether an opening asks the calendar server to send every event again. The server exits
// after 20 s without a request, and while it runs it sends each change by itself, so an
// opening within FRESH_FETCH_MS of the last forced request has nothing to gain from a new
// one. @lastMs is null before the first request; times are monotonic milliseconds.
function forcedFetchDue(lastMs, nowMs) {
    return lastMs === null || nowMs < lastMs || nowMs - lastMs >= Constants.FRESH_FETCH_MS;
}
