const Clutter = imports.gi.Clutter;
const St = imports.gi.St;
const Constants = require('./constants');
const Header = require('./header');
const SliderRow = require('./sliderRow');
const Tile = require('./tile');
const ThemeColors = require('./themeColors');
const ListPanel = require('./listPanel');
const ListHost = require('./listHost');
const LayoutModel = require('./layoutModel');
const TopParser = require('./topParser');

// Everything inside the menu, top to bottom: header, sliders, tile grid, CPU line. Every tile
// and slider row is built once; applyLayout() picks which ones show and in which order.
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

        this._cpuLine = new St.BoxLayout({ style_class: 'quick-settings-cpu-line' });
        this._cpuLine.add_child(new St.Label({
            text: Constants.CPU_LINE_TITLE,
            style_class: 'quick-settings-cpu-title',
            y_align: Clutter.ActorAlign.CENTER,
        }));
        this._cpuProcess = new St.Label({ y_align: Clutter.ActorAlign.CENTER });
        this._cpuLine.add_child(this._cpuProcess);
        this.actor.add_child(this._cpuLine);

        // One in-place list at a time, moved under the row whose arrow opened it.
        this.listPanel = new ListPanel.ListPanel();
        this.lists = new ListHost.ListHost(this.listPanel);

        // The sliders carry the theme's slider colours: a theme change restyles them.
        for (const row of Object.values(this.sliders))
            row.slider.actor.connect('style-changed', () => this.refreshColors());

        this.applyLayout(Constants.SLIDERS.map(item => item.id), Constants.TILE_LAYOUT_ITEMS.map(item => item.id));
    }

    // @sliderIds, @tileLayoutIds: the ones to show, in order; @tileLayoutIds may hold the CPU
    // line's id. Hidden rows leave no gap; tiles reflow two per row, an odd last tile on the
    // left. An open list is closed first: its row may be gone.
    applyLayout(sliderIds, tileLayoutIds) {
        const tileIds = tileLayoutIds.filter(id => id !== Constants.CPU_LINE_ID);
        this._cpuLine.visible = tileLayoutIds.includes(Constants.CPU_LINE_ID);
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

    // @process: from TopParser.busiestProcess(), null shows the title alone.
    setTopProcess(process) {
        this._cpuProcess.text = TopParser.label(process);
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
