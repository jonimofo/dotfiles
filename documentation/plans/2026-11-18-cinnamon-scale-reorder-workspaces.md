Status: DONE

# Cinnamon Scale: drag a workspace thumbnail to reorder workspaces

Extension `cinnamon/extensions/scale-wheel-switch@bgi`, Cinnamon 6.4, X11.
Earlier designs: [`2026-11-11-cinnamon-scale-overview.md`](2026-11-11-cinnamon-scale-overview.md),
[`2026-11-12-cinnamon-scale-second-screen.md`](2026-11-12-cinnamon-scale-second-screen.md),
[`2026-11-17-cinnamon-scale-enter-workspace.md`](2026-11-17-cinnamon-scale-enter-workspace.md).
Install and usage: [`cinnamon/README.md`](../../cinnamon/README.md).

## Goal

In Scale, drag and drop a workspace thumbnail in the strip to change the workspace's
position, for example from position 2 to 3, with an insertion bar as drop marker.

Out of scope: live shifting of the other thumbnails, the top row, dock, search, hot corners,
applets, renaming, adding or removing workspaces, any settings key.

## Validated answers

A. Drop marker, chosen "Insertion bar": "A thin violet bar appears between two thumbnails
where the dragged one will land. Nothing else moves until you release."

```
1. Press and move a thumbnail: it follows the pointer,
   half transparent, its slot stays empty.

+--------+            +--------+ | +--------+
|   1    |   (gap)    |   3    | | |   4    |
+--------+            +--------+ | +--------+
                  +--------+     ^ violet bar
                  |   2    |
                  +--------+

2. Release: the workspace moves there with its windows.

+--------+ +--------+ +--------+ +--------+
|   1    | |   2    | |   3    | |   4    |
| (same) | | (ex 3) | | (ex 2) | | (same) |
+--------+ +--------+ +--------+ +--------+

3. Release outside the strip, or on its own slot:
   nothing changes, the thumbnail returns.

Unchanged: click enters, wheel switches,
dropping a window on a thumbnail moves the window.
```

B. Behaviour: "Short click still enters the workspace. A drag past a few pixels starts the
move. Windows follow their workspace. Labels renumber by position. The overview stays open
and the active workspace stays the same one."

## Decisions

1. Each thumbnail is made draggable with `imports.ui.dnd.makeDraggable`, as `windowDrag.js`
   does for Scale's windows. The drag starts past dnd's own threshold, GTK's drag threshold
   (8 px here); no threshold of our own.
2. The picture that follows the pointer is a `Clutter.Clone` of the thumbnail at half
   opacity; the thumbnail itself turns transparent and keeps its place, so its slot stays
   empty and dnd snaps the picture back to it on a refused drop.
3. The strip is the drop target, not the thumbnails: the thumbnails only take window drops,
   and the strip only takes thumbnail drops. A thumbnail is never taken as a window, a window
   never shows the bar.
4. A pure function gives the slot under the pointer (the number of thumbnails whose middle
   is left of it), another the new index, null for the two slots around the thumbnail's own
   place. No equality test on stage coordinates. On those two slots no bar is shown and the
   drop is refused, so the thumbnail returns.
5. The drop calls `global.workspace_manager.reorder_workspace(workspace, index)`. Muffin
   emits `workspaces-reordered`, no workspace switch: every strip listens and rebuilds its
   thumbnails, which read their label (`Main.getWorkspaceName`) and windows from the new
   index. The active workspace object does not change, its highlight follows it.
6. Scale's big view keeps its workspaces in their opening order and picks the shown one by
   the active index. The first strip to see the signal sorts `view._workspaces` again, lays
   it out with `_updateWorkspaceActors(false)` and sets its scroll adjustment to the active
   index under `_animatingScroll`, as Scale itself does, so the value change switches nothing.
7. A thumbnail can be dropped on any screen's strip: they all show the same workspaces.
8. The bar uses the violet of the calendar applet (`#7B5CD6`). The extension's own accent is
   `#78aeed`, a blue: the owner's answer asks for violet.
9. The bar is a separate actor above the strip, hidden from dnd's pick: a drop on the bar
   still reaches the strip.
10. Custom workspace names are kept by position: moving them would write the
    `workspace-names` key, out of scope.

## How it is built

| File | Change |
|---|---|
| `workspaceStrip.js` | Draggable thumbnails, the strip as drop target, insertion bar, `findInsertionSlot`, `getReorderIndex`, `getInsertionBarX`, `syncBigViewOrder` |
| `stylesheet.css` | `.scale-strip-insertion-bar` |
| `uiHelpers.js` | `makeDraggable` and `createDragClone`, shared by the window drag and the thumbnails; `connectClick` returns a function forgetting a press that turned into a drag |
| `windowDrag.js` | Uses the shared draggable, same behaviour |
| `scripts/cinnamon-scale-test.js` | Slot and index rules with float noise, dnd's parent walk from a thumbnail's label, drag, bar, drop on both screens, own slot, cancel, release after a drag, window drops, window drag opacities, big view order and scroll animation |
| `scripts/cinnamon-scale-test.sh` | Header lists the workspace reorder |
| `cinnamon/README.md` | Behaviour, limitation on custom names, private members, assumptions |

## Checked by hand

Tried live by the owner on 2026-11-18 after a Cinnamon restart: "ok working as expected".
The list below is what to check again after a change here (Alt+F2 r):

1. Super, a short click on a thumbnail enters its workspace.
2. Drag thumbnail 2 right of thumbnail 3: the copy is half transparent, slot 2 is empty, the
   violet bar is between 3 and 4. Release: order 1, ex 3, ex 2, 4, labels 1 to 4, windows
   moved with their workspace, Scale still open on the same workspace.
3. Same drag on the second screen's strip, and from one screen's strip to another's.
4. Release over the big view, and on its own slot: it snaps back, nothing changes.
5. A window dropped on a thumbnail still moves; the wheel still switches.
6. Close Scale after a reorder: it zooms back on the active workspace's windows.
