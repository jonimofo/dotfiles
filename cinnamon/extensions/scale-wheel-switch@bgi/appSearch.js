const Cinnamon = imports.gi.Cinnamon;
const Clutter = imports.gi.Clutter;
const CMenu = imports.gi.CMenu;
const St = imports.gi.St;
const Main = imports.ui.main;
const Workspace = imports.ui.workspace;
const UiHelpers = require('./uiHelpers');

// Translated by Cinnamon itself: the Menu applet uses the same string.
const SEARCH_PLACEHOLDER = "Type to search...";
// Layout of the result grid. Colors, paddings, spacing and the tile width are in stylesheet.css.
const MAX_RESULTS = 12;
// Fewer columns are used when the monitor is too narrow for this many tiles.
const MAX_RESULT_COLUMNS = 6;
const RESULT_ICON_SIZE = 64;
// Unicode range of control characters, which a key can produce but are not text.
const FIRST_PRINTABLE_CODE_POINT = 0x20;
const DELETE_CODE_POINT = 0x7f;
// Keys held with one of these are shortcuts, never text for the search.
const SHORTCUT_MODIFIERS = Clutter.ModifierType.CONTROL_MASK | Clutter.ModifierType.MOD1_MASK |
    Clutter.ModifierType.MOD4_MASK | Clutter.ModifierType.SUPER_MASK;
// Rank of a match, best first; ties are sorted by name.
const MatchRank = {
    NAME_START: 0,
    NAME_WORD_START: 1,
    NAME: 2,
    GENERIC_NAME: 3,
    KEYWORDS: 4,
};

let originalOnKeyPress = null;
// The search of the Scale view currently open, if any.
let activeSearch = null;

// Lower case, accents removed: "Éditeur" matches "edit".
function normalize(text) {
    return (text || '').normalize('NFKD').replace(/\p{Grapheme_Extend}/gu, '').toLowerCase();
}

// The applications of the Cinnamon menu: the same tree walk as the Menu applet.
function collectApps(directory, apps) {
    const appSystem = Cinnamon.AppSystem.get_default();
    const iter = directory.iter();
    let type;
    while ((type = iter.next()) !== CMenu.TreeItemType.INVALID) {
        if (type === CMenu.TreeItemType.DIRECTORY) {
            const child = iter.get_directory();
            if (!child.get_is_nodisplay())
                collectApps(child, apps);
        } else if (type === CMenu.TreeItemType.ENTRY) {
            const app = appSystem.lookup_app(iter.get_entry().get_desktop_file_id());
            if (app && !app.get_nodisplay())
                apps.add(app);
        }
    }
    return apps;
}

function buildIndex() {
    const root = Cinnamon.AppSystem.get_default().get_tree().get_root_directory();
    return Array.from(collectApps(root, new Set())).map(app => ({
        app,
        name: normalize(app.get_name()),
        genericName: normalize(app.get_app_info().get_generic_name()),
        keywords: normalize(app.get_keywords()),
    }));
}

function isPrintable(character) {
    if (!character)
        return false;

    const codePoint = character.codePointAt(0);
    return codePoint >= FIRST_PRINTABLE_CODE_POINT && codePoint !== DELETE_CODE_POINT;
}

function rankMatch(entry, pattern) {
    const position = entry.name.indexOf(pattern);
    if (position === 0)
        return MatchRank.NAME_START;
    if (position > 0)
        return /[\p{L}\p{N}]/u.test(entry.name[position - 1]) ? MatchRank.NAME : MatchRank.NAME_WORD_START;
    if (entry.genericName.includes(pattern))
        return MatchRank.GENERIC_NAME;
    if (entry.keywords.includes(pattern))
        return MatchRank.KEYWORDS;
    return -1;
}

function findApps(index, text) {
    const pattern = normalize(text).trim();
    if (!pattern)
        return [];

    return index
        .map(entry => ({ entry, rank: rankMatch(entry, pattern) }))
        .filter(match => match.rank >= 0)
        .sort((a, b) => a.rank - b.rank || a.entry.name.localeCompare(b.entry.name))
        .slice(0, MAX_RESULTS)
        .map(match => match.entry.app);
}

// Search field above the workspace strip, and the application grid that takes the place
// of Scale's windows while the field has text. Scale keeps the keyboard focus: keys arrive
// through handleKeyPress (see enable()), so typing needs no click.
var AppSearch = class AppSearch {
    constructor() {
        this._monitor = Main.layoutManager.primaryMonitor;
        this._index = null;
        this._apps = [];
        this._tiles = [];
        this._columns = MAX_RESULT_COLUMNS;
        this._selected = 0;

        // Not reactive: a click must not move the keyboard focus away from Scale.
        this._entry = new St.Entry({
            style_class: 'scale-search-entry',
            hint_text: _(SEARCH_PLACEHOLDER),
            can_focus: false,
        });
        this._entry.clutter_text.connect('text-changed', () => this._onTextChanged());

        this.actor = new St.Bin({ style_class: 'scale-search-bar', child: this._entry, reactive: true });
        UiHelpers.swallowClicks(this.actor);
        this.actor.set_position(this._monitor.x, this._monitor.y);
        this.actor.set_width(this._monitor.width);
        Main.overview._group.insert_child_below(this.actor, Main.overview._coverPane);

        // Above Scale's windows, which live in the overlay group: it covers them and takes their clicks.
        this._results = new St.BoxLayout({ style_class: 'scale-search-grid', vertical: true, reactive: true });
        UiHelpers.swallowClicks(this._results);
        this._results.hide();
        global.overlay_group.add_actor(this._results);

        // Scale closing with text in the field (launch, Super): the windows come back for its animation.
        this._hidingId = Main.overview.connect('hiding', () => this._entry.set_text(''));

        activeSearch = this;
    }

    getHeight() {
        return UiHelpers.getNaturalHeight(this.actor);
    }

    // The grid takes the area of Scale's big view, below the strip.
    setResultsArea({ x, y, width, height }) {
        this._results.set_position(x, y);
        this._results.set_size(width, height);
    }

    _getText() {
        return this._entry.get_text();
    }

    _isSearching() {
        return this._getText().length > 0;
    }

    _onTextChanged() {
        const isSearching = this._isSearching();
        this._setWindowsVisible(!isSearching);
        this._results.visible = isSearching;
        if (isSearching)
            this._results.raise_top();

        if (isSearching && !this._index)
            this._index = buildIndex();
        this._apps = isSearching ? findApps(this._index, this._getText()) : [];
        this._selected = 0;
        this._buildTiles();
    }

    // Hidden through opacity: unmapping Scale's view would drop its keyboard focus
    // and make it connect its swipe handlers a second time.
    _setWindowsVisible(isVisible) {
        const view = Main.overview.workspacesView;
        if (view)
            view.actor.opacity = isVisible ? UiHelpers.OPAQUE : UiHelpers.TRANSPARENT;
    }

    _buildTiles() {
        this._results.destroy_all_children();
        this._tiles = [];

        let row = null;
        this._apps.forEach((app, i) => {
            const tile = this._createTile(app, i);
            this._tiles.push(tile);
            if (i === 0) {
                row = this._addRow();
                row.add_actor(tile);
                this._columns = this._countColumns(row, tile);
                return;
            }
            if (i % this._columns === 0)
                row = this._addRow();
            row.add_actor(tile);
        });
        this._syncSelection();
    }

    _addRow() {
        const row = new St.BoxLayout({ style_class: 'scale-search-row', x_align: Clutter.ActorAlign.CENTER });
        this._results.add_actor(row);
        return row;
    }

    // How many tiles fit in the width of the grid, measured on the first tile of the first
    // row: sizes come from the stylesheet, and are only known once the actors are on the stage.
    _countColumns(row, tile) {
        const resultsNode = this._results.get_theme_node();
        const padding = resultsNode.get_padding(St.Side.LEFT) + resultsNode.get_padding(St.Side.RIGHT);
        const spacing = row.get_theme_node().get_length('spacing');
        const tileWidth = UiHelpers.getNaturalWidth(tile);
        const fitting = Math.floor((this._results.width - padding + spacing) / (tileWidth + spacing));
        return Math.min(MAX_RESULT_COLUMNS, Math.max(1, fitting));
    }

    _createTile(app, index) {
        const tile = new St.BoxLayout({
            style_class: 'scale-search-result',
            vertical: true,
            reactive: true,
            track_hover: true,
        });
        tile.add_actor(new St.Bin({ child: app.create_icon_texture(RESULT_ICON_SIZE) }));
        tile.add_actor(new St.Label({ style_class: 'scale-search-result-label', text: app.get_name() }));
        // Connected before swallowClicks, whose handlers stop the event.
        tile.connect('button-release-event', (actor, event) => {
            if (event.get_button() === Clutter.BUTTON_PRIMARY)
                this._launch(index);
        });
        UiHelpers.swallowClicks(tile);
        return tile;
    }

    _syncSelection() {
        this._tiles.forEach((tile, i) => {
            if (i === this._selected)
                tile.add_style_pseudo_class(UiHelpers.SELECTED_PSEUDO_CLASS);
            else
                tile.remove_style_pseudo_class(UiHelpers.SELECTED_PSEUDO_CLASS);
        });
    }

    _moveSelection(step) {
        const target = this._selected + step;
        if (target < 0 || target >= this._apps.length)
            return;

        this._selected = target;
        this._syncSelection();
    }

    _launch(index) {
        const app = this._apps[index];
        if (!app)
            return;

        app.open_new_window(-1);
        Main.overview.hide();
    }

    // Returns true when the key was for the search; false leaves it to Scale.
    // With an empty field only a printable key is taken: arrows, Enter and Escape stay Scale's.
    // With text, every key is taken, so no Scale shortcut acts on the hidden windows.
    // Scale keeps its modal grab during its close animation: keys typed then are not text.
    handleKeyPress(event) {
        if (Main.overview._hideInProgress)
            return false;
        if (!this._isSearching())
            return this._appendCharacter(event, false);

        switch (event.get_key_symbol()) {
        case Clutter.KEY_Escape:
            this._entry.set_text('');
            break;
        case Clutter.KEY_BackSpace:
            this._entry.set_text(Array.from(this._getText()).slice(0, -1).join(''));
            break;
        case Clutter.KEY_Return:
        case Clutter.KEY_KP_Enter:
            this._launch(this._selected);
            break;
        case Clutter.KEY_Left:
            this._moveSelection(-1);
            break;
        case Clutter.KEY_Right:
            this._moveSelection(1);
            break;
        case Clutter.KEY_Up:
            this._moveSelection(-this._columns);
            break;
        case Clutter.KEY_Down:
            this._moveSelection(this._columns);
            break;
        default:
            this._appendCharacter(event, true);
        }
        return true;
    }

    // A leading space is not text: Scale uses the space bar to activate the selected window.
    _appendCharacter(event, allowSpace) {
        if (Cinnamon.get_event_state(event) & SHORTCUT_MODIFIERS)
            return false;

        const character = event.get_key_unicode();
        if (!isPrintable(character) || (character === ' ' && !allowSpace))
            return false;

        this._entry.set_text(this._getText() + character);
        return true;
    }

    destroy() {
        if (activeSearch === this)
            activeSearch = null;
        Main.overview.disconnect(this._hidingId);
        this._setWindowsVisible(true);
        this._results.destroy();
        this.actor.destroy();
    }
};

// Scale's key handling starts in Workspace._onKeyPress, looked up on each key: wrap it so
// the search sees the key first. Undone in disable().
function enable() {
    // Already patched: saving the wrapper as the original would make it permanent.
    if (originalOnKeyPress)
        return;

    const prototype = Workspace.Workspace.prototype;
    originalOnKeyPress = prototype._onKeyPress;
    prototype._onKeyPress = function(actor, event) {
        if (activeSearch && activeSearch.handleKeyPress(event))
            return true;
        return originalOnKeyPress.call(this, actor, event);
    };
}

function disable() {
    if (originalOnKeyPress) {
        Workspace.Workspace.prototype._onKeyPress = originalOnKeyPress;
        originalOnKeyPress = null;
    }
}
