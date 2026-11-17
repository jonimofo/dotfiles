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
const MediaModel = require('./mediaModel');

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

        // One line under the tiles, then the blocks; the whole section hides with no block.
        this._mediaSection = new St.BoxLayout({ style_class: 'quick-settings-media-section', vertical: true, visible: false });
        this._mediaSection.add_child(new St.Widget({ style_class: 'quick-settings-list-separator' }));
        this._mediaBox = new St.BoxLayout({ style_class: 'quick-settings-media', vertical: true });
        this._mediaSection.add_child(this._mediaBox);
        this._mediaBlocks = new Map();
        this._mediaShown = true;
        this._onMediaButton = () => {};
        this._onMediaFocus = () => {};
        this.actor.add_child(this._mediaSection);

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

    // @onButton(busName, method): a media button was clicked; @onFocus(busName): a block's
    // text was clicked.
    setOnMediaButton(onButton, onFocus) {
        this._onMediaButton = onButton;
        this._onMediaFocus = onFocus;
    }

    // @blocks: from MediaModel.visibleBlocks(), in order. A block stays in place while its
    // player stays (MediaModel.blockMoves), so focus and hover survive; one is created when a
    // player appears, destroyed when it goes; none hides the section.
    setMediaBlocks(blocks) {
        const onScreen = this._mediaBox.get_children().map(actor => this._busNameOf(actor));
        MediaModel.syncBlockViews(this._mediaBlocks, onScreen, blocks, {
            create: busName => new MediaBlock.MediaBlock(method => this._onMediaButton(busName, method),
                () => this._onMediaFocus(busName)),
            insert: (view, index) => this._mediaBox.insert_child_at_index(view.actor, index),
            move: (view, index) => this._mediaBox.set_child_at_index(view.actor, index),
        });
        this._syncMediaVisibility();
    }

    _busNameOf(actor) {
        for (const [busName, view] of this._mediaBlocks) {
            if (view.actor === actor)
                return busName;
        }
        return null;
    }

    _syncMediaVisibility() {
        this._mediaSection.visible = this._mediaShown && this._mediaBlocks.size > 0;
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
