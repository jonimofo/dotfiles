const St = imports.gi.St;
const Constants = require('./constants');
const Header = require('./header');
const SliderRow = require('./sliderRow');
const Tile = require('./tile');
const ThemeColors = require('./themeColors');

// Everything inside the menu, top to bottom: header, sliders, tile grid.
class MenuContent {
    constructor() {
        this.actor = new St.BoxLayout({ style_class: 'quick-settings-content', vertical: true });

        this.header = new Header.Header();
        this.actor.add_child(this.header.actor);

        const sliders = new St.BoxLayout({ style_class: 'quick-settings-sliders', vertical: true });
        this._sliderRows = Constants.SLIDERS.map(definition => {
            const row = new SliderRow.SliderRow(definition);
            sliders.add_child(row.actor);
            return row;
        });
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

        // The first slider carries the theme's slider colours: a theme change restyles it.
        this._colorSource = this._sliderRows[0].slider.actor;
        this._colorSource.connect('style-changed', () => this.refreshColors());
    }

    // Called each time the menu opens, when every actor has its style.
    refresh() {
        this.header.refreshBattery();
        this.refreshColors();
    }

    refreshColors() {
        const colors = ThemeColors.readTileColors(this._colorSource);
        for (const tile of Object.values(this.tiles))
            tile.setColors(colors);
    }
}
