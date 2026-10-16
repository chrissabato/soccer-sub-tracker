// Public list of every game ever created (the permanent game log). Sub
// data is deleted after 72 hours; games still inside that window link to
// their viewer.
import { listGameLog } from './store.js';
import { escapeHtml } from './lib.js';
import { divisionLabel } from './render.js';

const $ = (id) => document.getElementById(id);
const LIVE_MS = 72 * 3600 * 1000;

try {
    const games = await listGameLog();
    const now = Date.now();
    $('rows').innerHTML = games.map((g) => {
        const created = g.createdAt ? g.createdAt.toDate() : null;
        const live = created && now - created.getTime() < LIVE_MS;
        return `
          <tr>
            <td class="when">${created ? escapeHtml(created.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })) : ''}</td>
            <td>${escapeHtml(divisionLabel(g.division))}</td>
            <td>${escapeHtml(g.home)}</td>
            <td>${escapeHtml(g.away)}</td>
            <td>${live ? `<a href="../view.html?g=${encodeURIComponent(g.id)}">Viewer</a>` : ''}</td>
          </tr>`;
    }).join('');
    $('table').classList.toggle('hidden', games.length === 0);
    $('summary').textContent = games.length === 1 ? '1 game.' : games.length + ' games.';
} catch (err) {
    $('summary').textContent = '';
    $('error').textContent = 'Could not load the game log: ' + err.message;
}
