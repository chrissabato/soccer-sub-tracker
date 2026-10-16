import { createGame, joinWithCode, team } from './store.js';
import { loadSchools, fillDatalist, findSchool } from './schools.js';
import { recentGames, forgetGame } from './recent.js';
import { escapeHtml } from './lib.js';
import { divisionLabel } from './render.js';

const $ = (id) => document.getElementById(id);
let schools = [];

function renderRecent() {
    const games = recentGames();
    $('recent').classList.toggle('hidden', games.length === 0);
    $('recent-list').innerHTML = games.map((g) => {
        const q = '?g=' + encodeURIComponent(g.id);
        const when = g.createdAt
            ? new Date(g.createdAt).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
            : '';
        return `
          <li data-id="${escapeHtml(g.id)}">
            <div class="recent-info">
              <strong>${escapeHtml(g.home || 'Home')} vs ${escapeHtml(g.away || 'Away')}</strong>
              <span class="muted">${escapeHtml([divisionLabel(g.division), when].filter(Boolean).join(' · '))}</span>
            </div>
            <div class="recent-actions">
              <a class="button small primary" href="entry.html${q}">Sub entry</a>
              <a class="button small" href="setup.html${q}">Setup</a>
              <a class="button small" href="view.html${q}">Viewer</a>
              <button class="small" type="button" data-forget aria-label="Remove from recent games" title="Remove from recent games">✕</button>
            </div>
          </li>`;
    }).join('');
}
$('recent-list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-forget]');
    if (b) {
        forgetGame(b.closest('li').dataset.id);
        renderRecent();
    }
});
renderRecent();

loadSchools().then((list) => {
    schools = list;
    fillDatalist($('schools'), list);
});

$('join').addEventListener('submit', async (e) => {
    e.preventDefault();
    const button = e.submitter;
    button.disabled = true;
    $('join-error').textContent = '';
    try {
        const gameId = await joinWithCode($('code').value);
        location.href = 'entry.html?g=' + encodeURIComponent(gameId);
    } catch (err) {
        $('join-error').textContent = err.message;
        button.disabled = false;
    }
});

$('create').addEventListener('submit', async (e) => {
    e.preventDefault();
    const button = e.submitter;
    button.disabled = true;
    $('create-error').textContent = '';
    // The list may still be downloading if the form was filled quickly.
    schools = await loadSchools();
    const side = (input) => {
        const school = findSchool(schools, input.value);
        return team(school ? school.name : input.value, school ? school.url : '');
    };
    try {
        const { gameId } = await createGame({
            home: side($('home')),
            away: side($('away')),
            division: $('division').value,
        });
        location.href = 'setup.html?g=' + encodeURIComponent(gameId);
    } catch (err) {
        $('create-error').textContent = 'Could not create the game: ' + err.message;
        button.disabled = false;
    }
});
