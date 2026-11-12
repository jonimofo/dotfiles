// Parsers for the nordvpn command line client (6.x). Pure functions: tested with output
// captured on this machine.

// `nordvpn status`: one "Key: value" per line. Returns { connected, country, fields }.
// Lines without a colon (progress spinners, notices) are skipped.
function parseStatus(text, connectedValue) {
    const fields = {};
    for (const line of text.split('\n')) {
        const match = line.match(/^\s*([A-Za-z][A-Za-z ]*):\s*(.*?)\s*$/);
        if (match)
            fields[match[1]] = match[2];
    }
    return {
        connected: fields.Status === connectedValue,
        country: fields.Country || null,
        fields,
    };
}

// `nordvpn countries`: names with underscores for spaces, one per line or separated by
// commas or tabs. Returns [{ name, label }] where name is what `nordvpn connect` takes.
function parseCountries(text) {
    return text.split(/[\s,]+/)
        .filter(token => /^[A-Za-z][A-Za-z_]*$/.test(token))
        .map(name => ({ name, label: name.replace(/_/g, ' ') }));
}
