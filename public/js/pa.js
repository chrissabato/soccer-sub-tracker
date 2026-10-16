// PA announcer view: full screen, read-only, no login. Top: the subs from
// the latest stoppage (until the next one). Bottom: pending subs. Each sub
// is two big lines, IN and OUT, sized for reading names at a distance.
import { watchGame, watchSubs } from './store.js';
import { escapeHtml } from './lib.js';
import { applyTeamColors, teamName, doneNewestFirst, minuteLabel, inOutOrder } from './render.js';
import { rememberGame } from './recent.js';

const $ = (id) => document.getElementById(id);
const gameId = new URLSearchParams(location.search).get('g') || '';
const HIGHLIGHT_MS = 20000;

let game = null;
let subs = [];
let subsLoaded = false;
let shownBatch;
let litTimer = null;

function showError(err) {
    $('error').textContent = 'Live updates stopped: ' + (err.message || err) + '. Reload the page.';
    $('status-dot').classList.remove('live');
    $('status').textContent = 'Disconnected';
}

function line(p, io, label) {
    return `
      <div class="pa-line io-${io}">
        <span class="pa-io">${label}</span>
        <span class="pa-num">${p && p.number ? escapeHtml(p.number) : '—'}</span>
        <span class="pa-name">${escapeHtml(p && p.name ? p.name : '')}</span>
      </div>`;
}

function card(s) {
    return `
      <div class="pa-card team-${s.team}">
        <span class="team-tag">${escapeHtml(teamName(game, s.team))}</span>
        ${inOutOrder(game, line(s.playerIn, 'in', 'IN'), line(s.playerOut, 'out', 'OUT')).join('')}
      </div>`;
}

// Neon highlight on the Now section for `ms`, then it fades (CSS).
function highlightNow(ms) {
    const box = $('now');
    box.classList.add('lit', 'pulse');
    clearTimeout(litTimer);
    litTimer = setTimeout(() => {
        box.classList.remove('pulse');
        requestAnimationFrame(() => requestAnimationFrame(() => box.classList.remove('lit')));
    }, ms);
}

function render() {
    if (!game) {
        return;
    }
    const done = doneNewestFirst(subs);
    const latestBatch = done.length ? done[0].batchId : null;
    const latest = done.filter((s) => s.batchId === latestBatch);
    $('now-subs').innerHTML = latest.map(card).join('');
    $('now-empty').classList.toggle('hidden', latest.length > 0);
    $('now-time').innerHTML = latest.length ? '· ' + minuteLabel(latest[0]) : '';

    const pending = subs.filter((s) => s.status === 'pending');
    $('pending-subs').innerHTML = pending.map(card).join('');
    $('pending-empty').classList.toggle('hidden', pending.length > 0);
    document.body.classList.toggle('pa-has-pending', pending.length > 0);

    if (!subsLoaded) {
        return;
    }
    if (latestBatch && latestBatch !== shownBatch) {
        if (shownBatch !== undefined) {
            highlightNow(HIGHLIGHT_MS);
        } else if (latest[0].executedAt) {
            const left = HIGHLIGHT_MS - (Date.now() - latest[0].executedAt.toMillis());
            if (left > 0) {
                highlightNow(left);
            }
        }
    }
    shownBatch = latestBatch;
}

if (!gameId) {
    $('title').textContent = 'No game in the link';
} else {
    watchGame(gameId, (g) => {
        if (!g) {
            $('title').textContent = 'Game not found';
            $('error').textContent = 'This game no longer exists. Games are deleted after 72 hours.';
            return;
        }
        game = g;
        rememberGame(gameId, g);
        applyTeamColors(g);
        $('title').textContent = teamName(g, 'home') + ' vs ' + teamName(g, 'away');
        document.title = 'PA: ' + $('title').textContent;
        render();
    }, showError);

    watchSubs(gameId, (list, meta) => {
        subs = list;
        subsLoaded = true;
        $('status-dot').classList.toggle('live', !meta.fromCache);
        $('status').textContent = meta.fromCache ? 'Reconnecting…' : 'Live';
        render();
    }, showError);
}
