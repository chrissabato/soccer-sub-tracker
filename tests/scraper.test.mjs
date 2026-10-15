// Replays pa-script's saved roster pages through scraper-core.js the way
// public/js/roster-import.js does (DOMParser document + run()).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const root = new URL('..', import.meta.url);
const scraper = readFileSync(new URL('public/js/scraper-core.js', root), 'utf8');
const fixtures = new URL('tests/fixtures/roster-pages/', root);

for (const file of readdirSync(fixtures).filter((f) => f.endsWith('.html'))) {
    test(file, () => {
        const dom = new JSDOM('<!doctype html><html><body></body></html>', { runScripts: 'outside-only' });
        dom.window.eval(scraper + '\nwindow.PaScriptScrape = PaScriptScrape;');
        const doc = new dom.window.DOMParser().parseFromString(readFileSync(new URL(file, fixtures), 'utf8'), 'text/html');
        const result = dom.window.PaScriptScrape.run(doc, 'https://example.edu/roster');
        assert.ok(result.players.length > 0, 'no players parsed (via ' + result.scrapedVia + ')');
        assert.ok(result.players.every((p) => p.name), 'a player has no name');
        assert.ok(result.players.some((p) => /^\d+$/.test(p.number)), 'no jersey numbers parsed');
    });
}
