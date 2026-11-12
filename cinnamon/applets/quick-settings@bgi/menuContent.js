const St = imports.gi.St;
const Constants = require('./constants');
const Header = require('./header');
const SliderRow = require('./sliderRow');
const Tile = require('./tile');
const ThemeColors = require('./themeColors');
const ListPanel = require('./listPanel');
const ListHost = require('./listHost');

// Everything inside the menu, top to bottom: header, sliders, tile grid.
class MenuContent {
    constructor() {
        this.actor = new St.BoxLayout({ style_class: 'quick-settings-content', vertical: true });

        this.header = new Header.Header();
        this.actor.add_child(this.header.actor);

        const sliders = new St.BoxLayout({ style_class: 'quick-settings-sliders', vertical: true });
        // Slider rows by id, so the applet can wire them.
        this.sliders = {};
        for (const definition of Constants.SLIDERS) {
            const row = new SliderRow.SliderRow(definition);
            sliders.add_child(row.actor);
            this.sliders[definition.id] = row;
        }
        this.actor.add_child(sliders);

        // Tiles by id, so the applet can wire the working ones.
        this.tiles = {};
        const grid = new St.BoxLayout({ style_class: 'quick-settings-grid', vertical: true });
        let row = null;
        Constants.TILES.forEach((definition, index) => {
            if (index % Constants.TILES_PER_ROW === 0) {
                row = new St.BoxLayout({ style_class: 'quick-settings-grid-row' });
                grid.add_child(row);
            }
            const tile = new Tile.Tile(definition);
            row.add_child(tile.actor);
            this.tiles[definition.id] = tile;
        });
        this.actor.add_child(grid);

        // One in-place list at a time, moved under the row whose arrow opened it.
        this.listPanel = new ListPanel.ListPanel();
        this.lists = new ListHost.ListHost(this.listPanel);

        // The first slider carries the theme's slider colours: a theme change restyles it.
        this._colorSource = this.sliders[Constants.SLIDERS[0].id].slider.actor;
        this._colorSource.connect('style-changed', () => this.refreshColors());
    }

    // Called each time the menu opens, when every actor has its style.
    refresh() {
        this.refreshColors();
    }

    destroy() {
        this.header.destroy();
        for (const row of Object.values(this.sliders))
            row.destroy();
    }

    refreshColors() {
        const colors = ThemeColors.readTileColors(this._colorSource);
        for (const tile of Object.values(this.tiles))
            tile.setColors(colors);
    }
}
