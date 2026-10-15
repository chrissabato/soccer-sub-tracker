import { requireEditor } from './gate.js';
import { getCode, updateGame, saveRoster, watchGame, watchRosters, team } from './store.js';
import { loadSchools, fillDatalist, findSchool } from './schools.js';
import { fetchFirstRoster } from './roster-import.js';
import { guessRosterUrls, parsePasteList, byNumber, escapeHtml } from './lib.js';

const $ = (id) => document.getElementById(id);
const SIDES = ['home', 'away'];

let gameId;
let game = null;
let schools = [];
const editors = {}; // side -> roster editor

loadSchools().then((list) => {
    schools = list;
    fillDatalist($('schools'), list);
    if (game) {
        SIDES.forEach((side) => editors[side].setTeam(game[side], game.division));
    }
});

gameId = await requireEditor();
$('app').classList.remove('hidden');

const base = new URL('.', location.href);
const entryUrl = new URL('entry.html?g=' + encodeURIComponent(gameId), base).href;
const viewUrl = new URL('view.html?g=' + encodeURIComponent(gameId), base).href;
$('entry-link').href = $('go-entry').href = $('nav-entry').href = entryUrl;
$('entry-link').textContent = entryUrl;
$('view-link').href = $('nav-view').href = viewUrl;
$('view-link').textContent = viewUrl;
if (window.QRCode) {
    new window.QRCode($('qr'), { text: viewUrl, width: 144, height: 144 });
}
$('copy-view').addEventListener('click', async () => {
    try {
        await navigator.clipboard.writeText(viewUrl);
        $('copy-view').textContent = 'Copied';
    } catch (err) {
        $('copy-view').textContent = 'Copy failed';
    }
    setTimeout(() => { $('copy-view').textContent = 'Copy viewer link'; }, 1500);
});
getCode(gameId).then((code) => { $('code').textContent = code || '??????'; });

SIDES.forEach((side) => { editors[side] = new RosterEditor(side); });

watchGame(gameId, (g) => {
    if (!g) {
        $('app').innerHTML = '<p class="error">This game no longer exists. Games are deleted after 72 hours.</p>';
        return;
    }
    game = g;
    $('title').textContent = (g.home.name || 'Home') + ' vs ' + (g.away.name || 'Away');
    document.title = 'Setup: ' + $('title').textContent;
    if (document.activeElement !== $('division')) {
        $('division').value = g.division;
    }
    SIDES.forEach((side) => {
        if (document.activeElement !== $(side + '-name')) {
            $(side + '-name').value = g[side].name;
        }
        editors[side].setTeam(g[side], g.division);
    });
});

watchRosters(gameId, (rosters) => {
    SIDES.forEach((side) => editors[side].setSaved(rosters[side]));
});

// --- game fields ---

async function saveGame(fields) {
    $('game-status').textContent = 'Saving…';
    try {
        await updateGame(gameId, fields);
        $('game-status').textContent = 'Saved.';
    } catch (err) {
        $('game-status').textContent = 'Could not save: ' + err.message;
    }
}

$('division').addEventListener('change', () => saveGame({ division: $('division').value }));
SIDES.forEach((side) => {
    $(side + '-name').addEventListener('change', (e) => {
        const school = findSchool(schools, e.target.value);
        // Keep the known site URL if the name was only retyped.
        const url = school ? school.url : '';
        saveGame({ [side]: team(school ? school.name : e.target.value, url) });
    });
});

// --- per-team roster import/review ---

function RosterEditor(side) {
    const el = $('roster-tpl').content.firstElementChild.cloneNode(true);
    el.classList.add('team-' + side);
    $('rosters').appendChild(el);
    const q = (sel) => el.querySelector(sel);
    q('.side-tag').textContent = side;

    let saved = [];
    let draft = null; // null = not editing; otherwise array being reviewed
    let draftSource = '';
    let teamInfo = { name: '', url: '' };
    let division = 'womens';

    this.setTeam = (t, div) => {
        teamInfo = t;
        division = div;
        q('.team-name').textContent = t.name || (side === 'home' ? 'Home' : 'Away');
        const guesses = guessRosterUrls(siteUrl(), division);
        q('.url').placeholder = guesses[0] || 'https://…/roster';
    };

    this.setSaved = (players) => {
        saved = players;
        q('.saved').textContent = players.length
            ? 'Saved: ' + players.length + ' players.'
            : 'No roster saved yet.';
        if (draft === null) {
            renderReview(saved, false);
        }
    };

    // The team's athletics site: stored with the game, or looked up by name
    // (covers names typed before the school list had loaded).
    function siteUrl() {
        if (teamInfo.url) {
            return teamInfo.url;
        }
        const school = findSchool(schools, teamInfo.name);
        return school ? school.url : '';
    }

    function startDraft(players, source) {
        draft = players.map((p) => ({ ...p }));
        draftSource = source;
        renderReview(draft, true);
    }

    function renderReview(players, editing) {
        const tbody = q('tbody');
        const sorted = editing ? players : players.slice().sort(byNumber);
        q('.review').classList.toggle('hidden', !sorted.length && !editing);
        tbody.innerHTML = sorted.map((p, i) => `
            <tr data-i="${i}">
              <td class="num"><input data-f="number" value="${escapeHtml(p.number)}" inputmode="numeric" maxlength="3" aria-label="Number" ${editing ? '' : 'readonly'}></td>
              <td><input data-f="name" value="${escapeHtml(p.name)}" aria-label="Name" ${editing ? '' : 'readonly'}></td>
              <td class="pos"><input data-f="position" value="${escapeHtml(p.position || '')}" aria-label="Position" ${editing ? '' : 'readonly'}></td>
              <td class="del">${editing ? '<button class="small danger" data-del type="button" aria-label="Remove">✕</button>' : ''}</td>
            </tr>`).join('');
        q('.save').classList.toggle('hidden', !editing);
        q('.discard').classList.toggle('hidden', !editing);
        q('.add-row').textContent = editing ? 'Add player' : 'Edit roster';
    }

    q('tbody').addEventListener('input', (e) => {
        if (draft === null || !e.target.dataset.f) {
            return;
        }
        const i = +e.target.closest('tr').dataset.i;
        draft[i][e.target.dataset.f] = e.target.value.trim();
    });
    q('tbody').addEventListener('click', (e) => {
        if (draft !== null && e.target.closest('[data-del]')) {
            draft.splice(+e.target.closest('tr').dataset.i, 1);
            renderReview(draft, true);
        }
    });
    q('.add-row').addEventListener('click', () => {
        if (draft === null) {
            startDraft(saved.slice().sort(byNumber), '');
            return;
        }
        draft.push({ number: '', name: '', position: '' });
        renderReview(draft, true);
        const inputs = q('tbody').querySelectorAll('tr:last-child input');
        if (inputs.length) {
            inputs[0].focus();
        }
    });
    q('.discard').addEventListener('click', () => {
        draft = null;
        renderReview(saved, false);
    });
    q('.save').addEventListener('click', async () => {
        const players = draft
            .map((p) => ({ number: String(p.number || '').replace(/\D/g, '').slice(0, 3), name: p.name.trim(), position: p.position || '' }))
            .filter((p) => p.name || p.number)
            .sort(byNumber);
        q('.save').disabled = true;
        try {
            await saveRoster(gameId, side, players, draftSource);
            draft = null;
            renderReview(players, false);
            q('.fetch-status').textContent = '';
        } catch (err) {
            q('.fetch-status').textContent = 'Could not save: ' + err.message;
        } finally {
            q('.save').disabled = false;
        }
    });

    q('.fetch').addEventListener('click', async () => {
        const typed = q('.url').value.trim();
        const urls = typed ? [typed] : guessRosterUrls(siteUrl(), division);
        if (!urls.length) {
            q('.fetch-status').textContent = 'Enter the roster page URL (this team isn\'t in the school directory, so it can\'t be guessed).';
            return;
        }
        q('.fetch').disabled = true;
        q('.fetch-status').textContent = 'Fetching ' + urls[0] + '…';
        try {
            const result = await fetchFirstRoster(urls);
            q('.url').value = result.url;
            q('.fetch-status').textContent = 'Found ' + result.players.length + ' players. Check them, then Save roster.';
            startDraft(result.players, result.url);
        } catch (err) {
            q('.fetch-status').textContent = err.message;
            if (err.blocked) {
                q('.paste-box').open = true;
            }
        } finally {
            q('.fetch').disabled = false;
        }
    });

    q('.use-paste').addEventListener('click', () => {
        const players = parsePasteList(q('.paste').value);
        if (!players.length) {
            q('.fetch-status').textContent = 'No players found in the pasted text.';
            return;
        }
        q('.fetch-status').textContent = 'Read ' + players.length + ' players. Check them, then Save roster.';
        startDraft(players, '');
    });
}
