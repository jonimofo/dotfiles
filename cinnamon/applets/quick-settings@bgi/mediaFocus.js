const MediaModel = require('./mediaModel');

// Brings @busName's player forward, in this order: a window of the application its
// DesktopEntry names, else a window of its process, else MPRIS Raise when the player offers
// it, else nothing (players.noWindow logs it once). Among several windows,
// MediaModel.chooseWindow() picks one. The window part is only reached through @windows, so
// this runs on fakes in the tests.
// @players: MediaPlayers (focusInfo, processId, raise, noWindow).
// @windows: { ofApp(desktopEntry), ofPid(pid), describe(window) -> { title, userTime },
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
    if (info.desktopEntry && activateAmong(windows.ofApp(info.desktopEntry)))
        return;
    players.processId(busName, pid => {
        if (!activateAmong(windows.ofPid(pid)))
            fallBack();
    }, fallBack);
}
