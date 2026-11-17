const St = imports.gi.St;
const Constants = require('./constants');
const Header = require('./header');
const SliderRow = require('./sliderRow');
const Tile = require('./tile');
const ThemeColors = require('./themeColors');
const ListPanel = require('./listPanel');
const ListHost = require('./listHost');
const LayoutModel = require('./layoutModel');
const MediaBlock = require('./mediaBlock');

// Everything inside the menu, top to bottom: header, sliders, tile grid, media blocks. Every
// tile and slider row is built once; applyLayout() picks which ones show and in which order.
// Media blocks come and go with the players (setMediaBlocks).
class MenuContent {
    constructor() {
        this.actor = new St.BoxLayout({ style_class: 'quick-settings-content', vertical: true });

        this.header = new Header.Header();
        this.actor.add_child(this.header.actor);

        this._slidersBox = new St.BoxLayout({ style_class: 'quick-settings-sliders', vertical: true });
        // Slider rows by id, so the applet can wire them.
        this.sliders = {};
        for (const definition of Constants.SLIDERS)
            this.sliders[definition.id] = new SliderRow.SliderRow(definition);
        this.actor.add_child(this._slidersBox);

        // Tiles by id, so the applet can wire them.
        this.tiles = {};
        for (const definition of Constants.TILES)
            this.tiles[definition.id] = new Tile.Tile(definition);
        this._grid = new St.BoxLayout({ style_class: 'quick-settings-grid', vertical: true });
        this.actor.add_child(this._grid);

        this._mediaBox = new St.BoxLayout({ style_class: 'quick-settings-media', vertical: true, visible: false });
        this._mediaBlocks = new Map();
        this._mediaShown = true;
        this._onMediaButton = () => {};
        this.actor.add_child(this._mediaBox);

        // One in-place list at a time, moved under the row whose arrow opened it.
        this.listPanel = new ListPanel.ListPanel();
        this.lists = new ListHost.ListHost(this.listPanel);

        // The sliders carry the theme's slider colours: a theme change restyles them.
        for (const row of Object.values(this.sliders))
            row.slider.actor.connect('style-changed', () => this.refreshColors());

        this.applyLayout(Constants.SLIDERS.map(item => item.id), Constants.TILE_LAYOUT_ITEMS.map(item => item.id));
    }

    // @sliderIds, @tileLayoutIds: the ones to show, in order; @tileLayoutIds may hold the media
    // controls' id. Hidden rows leave no gap; tiles reflow two per row, an odd last tile on the
    // left. An open list is closed first: its row may be gone.
    applyLayout(sliderIds, tileLayoutIds) {
        const { tileIds, media } = LayoutModel.splitTileLayout(tileLayoutIds, Constants.MEDIA_ITEM.id);
        this._mediaShown = media;
        this._syncMediaVisibility();
        this.lists.close();
        this._detach(this.listPanel.actor);

        for (const row of Object.values(this.sliders))
            this._detach(row.actor);
        for (const id of sliderIds)
            this._slidersBox.add_child(this.sliders[id].actor);
        this._slidersBox.visible = sliderIds.length > 0;

        for (const tile of Object.values(this.tiles))
            this._detach(tile.actor);
        this._grid.destroy_all_children();
        for (const ids of LayoutModel.rows(tileIds, Constants.TILES_PER_ROW)) {
            const row = new St.BoxLayout({ style_class: 'quick-settings-grid-row' });
            for (const id of ids)
                row.add_child(this.tiles[id].actor);
            this._grid.add_child(row);
        }
        this._grid.visible = tileIds.length > 0;
    }

    // @onButton(busName, method): a media button was clicked.
    setOnMediaButton(onButton) {
        this._onMediaButton = onButton;
    }

    // @blocks: from MediaModel.visibleBlocks(), in order. A block is kept while its player
    // stays, created when one appears, destroyed when it goes; none hides the section.
    setMediaBlocks(blocks) {
        const wanted = new Set(blocks.map(block => block.busName));
        for (const [busName, view] of this._mediaBlocks) {
            if (!wanted.has(busName)) {
                view.destroy();
                this._mediaBlocks.delete(busName);
            }
        }
        for (const view of this._mediaBlocks.values())
            this._detach(view.actor);
        for (const block of blocks) {
            let view = this._mediaBlocks.get(block.busName);
            if (!view) {
                view = new MediaBlock.MediaBlock(method => this._onMediaButton(block.busName, method));
                this._mediaBlocks.set(block.busName, view);
            }
            view.update(block);
            this._mediaBox.add_child(view.actor);
        }
        this._syncMediaVisibility();
    }

    _syncMediaVisibility() {
        this._mediaBox.visible = this._mediaShown && this._mediaBlocks.size > 0;
    }

    // Called each time the menu opens, when every actor has its style.
    refresh() {
        this.refreshColors();
    }

    // Hidden tiles and rows are off the stage: the menu's own destroy would not reach them.
    destroy() {
        this.lists.close();
        this.header.destroy();
        for (const row of Object.values(this.sliders))
            row.destroy();
        for (const tile of Object.values(this.tiles))
            tile.destroy();
        for (const view of this._mediaBlocks.values())
            view.destroy();
        this._mediaBlocks.clear();
        this.listPanel.actor.destroy();
    }

    // Read from the first slider on screen; with every slider hidden, the stylesheet's.
    refreshColors() {
        const shown = Object.values(this.sliders).find(row => row.actor.get_stage());
        const colors = shown ? ThemeColors.readTileColors(shown.slider.actor) : null;
        for (const tile of Object.values(this.tiles))
            tile.setColors(colors);
    }

    _detach(actor) {
        const parent = actor.get_parent();
        if (parent)
            parent.remove_child(actor);
    }
}
