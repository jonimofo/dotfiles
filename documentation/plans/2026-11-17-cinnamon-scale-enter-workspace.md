Status: DONE

# Cinnamon Scale: a thumbnail click enters its workspace

Extension `cinnamon/extensions/scale-wheel-switch@bgi`, Cinnamon 6.4, X11.
Earlier designs: [`2026-11-11-cinnamon-scale-overview.md`](2026-11-11-cinnamon-scale-overview.md),
[`2026-11-12-cinnamon-scale-second-screen.md`](2026-11-12-cinnamon-scale-second-screen.md).
Install and usage: [`cinnamon/README.md`](../../cinnamon/README.md).

## Goal

A primary click on any workspace thumbnail switches to that workspace and closes Scale, on
every strip and however Scale was opened. A click on the current workspace's thumbnail only
closes Scale.

Out of scope: the mouse wheel (it still switches with Scale open), drag and drop on the
thumbnails (unchanged), anything else.

## Owner's words

"when i press super key, i would like to be able to enter a workspace if i click on it's
thumbnail, Ask me questions to confirm your understanding"

## Validated answers

A. Click, chosen "One click enters, always":

```
Overview open on workspace 1:

   [ws 1]*  [ws 2]   [ws 3]   [ws 4]

Click on [ws 3]:

   overview closes
   you are on workspace 3, on its desktop

Click on [ws 1], the current one:

   overview closes, you stay on workspace 1

Mouse wheel: switches workspace, overview stays open
```

B. Scope, chosen "Everywhere":

```
Opened with Super         click a thumbnail: enters
Opened with the hot corner click a thumbnail: enters

Primary screen strip      click: enters
Second screen strip       click: enters
```

## Decisions

1. The click activates the workspace when it is not the active one, then calls
   `Main.overview.hide()`, the call the Super key and the search's app launch already use.
2. Order: switch first, then close. `Overview._animateNotVisible` calls
   `WorkspacesView.hide()`, which zooms the windows of the *active* workspace back into
   place: closing first would animate the old workspace's windows, then switch. It is also
   the order of `Main.activateWindow` (activate, then `overview.hide()`) and of the dock's
   `activateWindow`, which switches workspace before calling it.
3. A drop never counts as a click: `UiHelpers.connectClick` only fires when the press and
   the release are both on the thumbnail, and a window drag starts with a press on the
   window, not on the thumbnail. `acceptDrop` is unchanged and does not close Scale.
4. During a search, the strips keep their clicks (the click blockers only cover the other
   screens' window areas): a click enters the workspace, and Scale's `hiding` clears the
   field as on any close.
5. Every strip and both ways of opening share one code path: each thumbnail of each strip is
   a `WorkspaceThumbnail`, and its click does not depend on how Scale was opened.

## How it is built

| File | Change |
|---|---|
| `workspaceStrip.js` | `_activateWorkspace` becomes `_enterWorkspace`: activate if needed, then close Scale |
| `scripts/cinnamon-scale-test.js` | Click, current workspace, second screen, other buttons, drop, wheel |
