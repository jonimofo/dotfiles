const Constants = require('./constants');

const MAX_CHANNEL = 255;

// @opacity, out of 255, scales the alpha: a dimmed tile keeps its label opaque and only
// its background fades, as much as Constants.INACTIVE_OPACITY dims its icon.
function toCss(color, opacity = MAX_CHANNEL) {
    const alpha = (color.alpha / MAX_CHANNEL) * (opacity / MAX_CHANNEL);
    return `rgba(${color.red}, ${color.green}, ${color.blue}, ${alpha.toFixed(3)})`;
}

function lookupColor(themeNode, property) {
    const [found, color] = themeNode.lookup_color(property, false);
    return found ? color : null;
}

// The tile colours of the current theme, read from @sliderActor (a styled slider on the
// stage): its track for a tile that is off, its filled part for a tile that is on.
// Returns { normal: { tile, checked }, dimmed: { tile, checked } } as CSS colours, or null
// when the actor has no style yet or the theme sets neither colour.
function readTileColors(sliderActor) {
    if (!sliderActor.get_stage())
        return null;

    const themeNode = sliderActor.get_theme_node();
    const tile = lookupColor(themeNode, Constants.THEME_TILE_COLOR);
    const checked = lookupColor(themeNode, Constants.THEME_TILE_CHECKED_COLOR);
    if (!tile || !checked)
        return null;
    return {
        normal: { tile: toCss(tile), checked: toCss(checked) },
        dimmed: { tile: toCss(tile, Constants.INACTIVE_OPACITY), checked: toCss(checked, Constants.INACTIVE_OPACITY) },
    };
}
