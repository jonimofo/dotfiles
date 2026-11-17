const MediaModel = require('./mediaModel');

// Brings @busName's player forward, only through a window of the player's own process: the
// process id is read first (GetConnectionUnixProcessID), then, in this order, the windows of
// the application its DesktopEntry names that belong to that process, else the process's
// windows. A player cannot bring another application's window forward by naming it. Unknown
// process (the call failed, or a sandboxed player whose bus owner is a proxy without
// windows) or no window: MPRIS Raise when the player offers it, else nothing
// (players.noWindow logs it once). Among the kept windows, MediaModel.chooseWindow() picks
// one. The window part is only reached through @windows, so this runs on fakes in the tests.
// @players: MediaPlayers (focusInfo, processId, raise, noWindow).
// @windows: { ofApp(desktopEntry), ofPid(pid), describe(window) -> { title, userTime, pid },
//             activate(window, time) }.
// @time: the click's event time, read during the click: the window found after the
// asynchronous process id reply is still activated with it, as the window manager wants for
// a focus the user asked for.
function focusPlayer(busName, players, windows, time) {
    const info = players.focusInfo(busName);
    if (!info)
        return;
    const activateAmong = candidates => {
        const index = MediaModel.chooseWindow(candidates.map(window => windows.describe(window)), info.title);
        if (index < 0)
            return false;
        windows.activate(candidates[index], time);
        return true;
    };
    const fallBack = () => {
        if (info.canRaise)
            players.raise(busName);
        else
            players.noWindow(busName);
    };
    players.processId(busName, pid => {
        const ownWindows = info.desktopEntry
            ? windows.ofApp(info.desktopEntry).filter(window => windows.describe(window).pid === pid)
            : [];
        if (activateAmong(ownWindows) || activateAmong(windows.ofPid(pid)))
            return;
        fallBack();
    }, fallBack);
}
