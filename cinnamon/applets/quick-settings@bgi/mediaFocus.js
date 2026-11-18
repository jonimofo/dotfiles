const MediaModel = require('./mediaModel');

// The window of @busName's player, only among the windows of the player's own process: the
// process id is read first (GetConnectionUnixProcessID), then, in this order, the windows of
// the application its DesktopEntry names that belong to that process, else the process's
// windows. A player cannot reach another application's window by naming it. Among the kept
// windows, MediaModel.chooseWindow() picks one with the track title (none for a player
// without one: the window used last). @onWindow(window) with it; @onNone() when the player is
// no longer listed, the process is unknown (the call failed, or a sandboxed player whose bus
// owner is a proxy without windows) or no window is found. The window part is only reached
// through @windows, so this runs on fakes in the tests.
// @players: MediaPlayers (focusInfo, processId).
// @windows: { ofApp(desktopEntry), ofPid(pid), describe(window) -> { title, userTime, pid } }.
function findPlayerWindow(busName, players, windows, onWindow, onNone) {
    const info = players.focusInfo(busName);
    if (!info) {
        onNone();
        return;
    }
    const pickAmong = candidates => {
        const index = MediaModel.chooseWindow(candidates.map(window => windows.describe(window)), info.title);
        return index < 0 ? null : candidates[index];
    };
    players.processId(busName, pid => {
        const ownWindows = info.desktopEntry
            ? windows.ofApp(info.desktopEntry).filter(window => windows.describe(window).pid === pid)
            : [];
        const window = pickAmong(ownWindows) || pickAmong(windows.ofPid(pid));
        if (window)
            onWindow(window);
        else
            onNone();
    }, onNone);
}

// Brings @busName's player forward through the window findPlayerWindow() finds. No window:
// MPRIS Raise when the player offers it, else nothing (players.noWindow logs it once).
// @players: MediaPlayers (focusInfo, processId, raise, noWindow).
// @windows: as findPlayerWindow(), plus activate(window, time).
// @time: the click's event time, read during the click: the window found after the
// asynchronous process id reply is still activated with it, as the window manager wants for
// a focus the user asked for.
function focusPlayer(busName, players, windows, time) {
    const info = players.focusInfo(busName);
    if (!info)
        return;
    findPlayerWindow(busName, players, windows, window => windows.activate(window, time), () => {
        if (info.canRaise)
            players.raise(busName);
        else
            players.noWindow(busName);
    });
}
