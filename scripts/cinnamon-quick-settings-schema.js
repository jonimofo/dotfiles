// Prints the settings-schema.json of the quick-settings@bgi applet, built from the ordered
// declarations in its constants.js, so the dialog's rows and defaults cannot drift from them.
// Usage: gjs scripts/cinnamon-quick-settings-schema.js <applet folder> > <applet folder>/settings-schema.json
// cinnamon-quick-settings-test.sh checks that the committed file equals this output.
const GLib = imports.gi.GLib;
const ByteArray = imports.byteArray;

const INDENT = 4;
const LIST_HEIGHT = 340;

function loadConstants(appletDir) {
    const source = ByteArray.toString(GLib.file_get_contents(`${appletDir}/constants.js`)[1]);
    const names = [...source.matchAll(/^const ([A-Za-z0-9_]+)/gm)].map(match => match[1]);
    return new Function(`${source}\nreturn { ${names.join(', ')} };`)();
}

// One tab: a page with one untitled section holding one list.
function listSetting(declared, columnTitle) {
    return {
        type: 'list',
        description: columnTitle,
        height: LIST_HEIGHT,
        columns: [
            { id: 'show', title: 'Show', type: 'boolean' },
            { id: 'id', title: columnTitle, type: 'string', options: Object.fromEntries(declared.map(item => [item.name, item.id])) },
        ],
        default: declared.map(item => ({ show: true, id: item.id })),
    };
}

function buildSchema(constants) {
    const tabs = [
        { key: constants.LAYOUT_KEYS.tiles, title: 'Tiles', column: 'Tile', declared: constants.TILES },
        { key: constants.LAYOUT_KEYS.sliders, title: 'Sliders', column: 'Slider', declared: constants.SLIDERS },
        { key: constants.LAYOUT_KEYS.header, title: 'Header', column: 'Element', declared: constants.HEADER_ITEMS },
        { key: constants.LAYOUT_KEYS.panelIcons, title: 'Panel', column: 'Icon', declared: constants.PANEL_ICON_ITEMS },
    ];
    const layout = { type: 'layout', pages: tabs.map(tab => `${tab.key}-page`) };
    for (const tab of tabs) {
        layout[`${tab.key}-page`] = { type: 'page', title: tab.title, sections: [`${tab.key}-section`] };
        layout[`${tab.key}-section`] = { type: 'section', title: '', keys: [tab.key] };
    }
    const schema = { layout };
    for (const tab of tabs)
        schema[tab.key] = listSetting(tab.declared, tab.column);
    return schema;
}

function schemaText(appletDir) {
    return `${JSON.stringify(buildSchema(loadConstants(appletDir)), null, INDENT)}\n`;
}

if (ARGV.length === 1 && !globalThis.QUICK_SETTINGS_SCHEMA_AS_MODULE)
    print(schemaText(ARGV[0]).trimEnd());
