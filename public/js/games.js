// Public list of games from the game log that are still live. Sub data is
// deleted after 72 hours, so older games are left out.
import { listGameLog } from './store.js';
import { escapeHtml } from './lib.js';
import { divisionLabel } from './render.js';

const $ = (id) => document.getElementById(id);
const LIVE_MS = 72 * 3600 * 1000;

try {
    const now = Date.now();
    const games = (await listGameLog())
        .filter((g) => g.createdAt && now - g.createdAt.toMillis() < LIVE_MS);
    $('rows').innerHTML = games.map((g) => {
        const created = g.createdAt.toDate();
        const q = '?g=' + encodeURIComponent(g.id);
        return `
          <tr>
            <td class="when">${escapeHtml(created.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }))}</td>
            <td>${escapeHtml(divisionLabel(g.division))}</td>
            <td>${escapeHtml(g.home)}</td>
            <td>${escapeHtml(g.away)}</td>
            <td class="links"><a href="../view.html${q}">Viewer</a> <a href="../pa.html${q}">PA</a></td>
          </tr>`;
    }).join('');
    $('table').classList.toggle('hidden', games.length === 0);
    $('summary').textContent = games.length === 1 ? '1 game.' : games.length + ' games.';
} catch (err) {
    $('summary').textContent = '';
    $('error').textContent = 'Could not load the game log: ' + err.message;
}
