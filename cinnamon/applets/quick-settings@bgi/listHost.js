// Which in-place list is open. One at a time: opening a list closes the other one, a second
// click on the same arrow closes it. The view draws the list; this file only decides.
//
// A list registers with:
//   anchor: what the view puts the list under (a tile row or a slider row)
//   build(): { title, items: [{ label, iconName, trailingIconName, active, secure, onActivate }], settings }
//            settings is { label, onActivate } or null
//   onExpanded(bool): flips the arrow
//   onOpen(): optional, e.g. a Wi-Fi scan or a NordVPN status read
class ListHost {
    constructor(view) {
        this._view = view;
        this._lists = new Map();
        this.openKey = null;
    }

    register(key, list) {
        this._lists.set(key, list);
    }

    toggle(key) {
        if (this.openKey === key) {
            this.close();
            return;
        }
        this.close();
        const list = this._lists.get(key);
        if (!list)
            return;
        this.openKey = key;
        list.onExpanded(true);
        this._view.show(list.build(), list.anchor);
        if (list.onOpen)
            list.onOpen();
    }

    close() {
        if (this.openKey === null)
            return;
        const list = this._lists.get(this.openKey);
        this.openKey = null;
        list.onExpanded(false);
        this._view.hide();
    }

    // Redraws @key's list when it is the open one: its data changed.
    refresh(key) {
        if (this.openKey !== key)
            return;
        this._view.update(this._lists.get(key).build());
    }
}
