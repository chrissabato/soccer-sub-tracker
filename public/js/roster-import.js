// Roster import from a school's roster page: the droplet fetches the page
// (browsers can't, because of CORS) and pa-script's scraper-core.js parses
// it here, so every Sidearm/Presto layout pa-script handles works here too.
// scraper-core.js must be loaded as a classic <script> before this module.

const PROXY = 'api/fetch-roster.php';

export class RosterFetchError extends Error {
    constructor(message, blocked = false) {
        super(message);
        this.blocked = blocked;
    }
}

// Returns { players: [{number, name}], url }.
export async function fetchRoster(url) {
    let res;
    try {
        res = await fetch(PROXY + '?url=' + encodeURIComponent(url));
    } catch (err) {
        throw new RosterFetchError('Could not reach the roster service. Check your connection.');
    }
    let body;
    try {
        body = await res.json();
    } catch (err) {
        throw new RosterFetchError('The roster service returned an unexpected response (HTTP ' + res.status + ').');
    }
    if (!res.ok || body.error) {
        throw new RosterFetchError(body.error || ('HTTP ' + res.status), !!body.blocked);
    }
    return { players: parseRosterHtml(body.html, body.url), url: body.url };
}

export function parseRosterHtml(html, url) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const result = window.PaScriptScrape.run(doc, url);
    return result.players.map((p) => ({
        number: p.number || '',
        name: p.name || '',
    }));
}

// Tries each URL in turn and returns the first that yields players.
// Throws the most useful error if none do.
export async function fetchFirstRoster(urls) {
    let lastError = null;
    for (const url of urls) {
        try {
            const result = await fetchRoster(url);
            if (result.players.length) {
                return result;
            }
            lastError = new RosterFetchError('No players found on ' + result.url + '.');
        } catch (err) {
            lastError = err;
        }
    }
    throw lastError || new RosterFetchError('Enter a roster URL.');
}
