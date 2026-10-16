import { requireEditor } from './gate.js';
import { getCode, updateGame, saveRoster, watchGame, watchRosters, team } from './store.js';
import { applyTeamColors } from './render.js';
import { rememberGame } from './recent.js';
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
$('nav-entry').href = entryUrl;
$('nav-view').href = $('open-view').href = viewUrl;
$('open-pa').href = new URL('pa.html?g=' + encodeURIComponent(gameId), base).href;
$('site-host').textContent = location.host;
$('copy-view').addEventListener('click', async () => {
    try {
        await navigator.clipboard.writeText(viewUrl);
        $('copy-view').textContent = 'Copied';
    } catch (err) {
        $('copy-view').textContent = 'Copy failed';
    }
    setTimeout(() => { $('copy-view').textContent = 'Copy link'; }, 1500);
});
getCode(gameId).then((code) => {
    $('code').textContent = code || '??????';
    // The entry QR carries the code after '#' (never sent to the server), so
    // scanning it unlocks sub entry without typing. See gate.js.
    if (code && window.QRCode) {
        new window.QRCode($('entry-qr'), { text: entryUrl + '#code=' + code, width: 152, height: 152 });
    }
});

SIDES.forEach((side) => { editors[side] = new RosterEditor(side); });

watchGame(gameId, (g) => {
    if (!g) {
        $('app').innerHTML = '<p class="error">This game no longer exists. Games are deleted after 72 hours.</p>';
        return;
    }
    game = g;
    rememberGame(gameId, g);
    $('title').textContent = (g.home.name || 'Home') + ' vs ' + (g.away.name || 'Away');
    document.title = 'Setup: ' + $('title').textContent;
    applyTeamColors(g);
    if (document.activeElement !== $('division')) {
        $('division').value = g.division;
    }
    SIDES.forEach((side) => {
        if (document.activeElement !== $(side + '-name')) {
            $(side + '-name').value = g[side].name;
        }
        if (document.activeElement !== $(side + '-color')) {
            $(side + '-color').value = g[side].color || themeColor(side);
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
        await updateGame(gameId, fields, game);
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
        saveGame({ [side]: team(school ? school.name : e.target.value, url, game[side].color) });
    });
    // Preview while dragging the picker; save once a color is chosen.
    $(side + '-color').addEventListener('input', (e) => {
        applyTeamColors({ ...game, [side]: { ...game[side], color: e.target.value } });
    });
    $(side + '-color').addEventListener('change', (e) => {
        const t = game[side];
        saveGame({ [side]: team(t.name, t.url, e.target.value) });
    });
});

// The theme's default color for a side, for teams with no color set yet.
function themeColor(side) {
    const probe = document.createElement('span');
    probe.className = 'team-' + side;
    probe.style.color = 'var(--team)';
    document.body.appendChild(probe);
    const rgb = getComputedStyle(probe).color.match(/\d+/g) || [0, 0, 0];
    probe.remove();
    return '#' + rgb.slice(0, 3).map((n) => (+n).toString(16).padStart(2, '0')).join('');
}

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
        updateOpenLink();
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

    // The open-in-new-tab button goes to the typed URL, else the default
    // (Sidearm) guess; disabled when there's neither.
    function updateOpenLink() {
        const url = q('.url').value.trim() || guessRosterUrls(siteUrl(), division)[0] || '';
        const link = q('.open-roster');
        if (/^https?:\/\//i.test(url)) {
            link.href = url;
            link.removeAttribute('aria-disabled');
        } else {
            link.removeAttribute('href');
            link.setAttribute('aria-disabled', 'true');
        }
    }
    q('.url').addEventListener('input', updateOpenLink);

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
        draft.push({ number: '', name: '' });
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
            .map((p) => ({ number: String(p.number || '').replace(/\D/g, '').slice(0, 3), name: p.name.trim() }))
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
            updateOpenLink();
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
