// Press box viewer: read-only, no login, updates live.
import { watchGame, watchSubs } from './store.js';
import { rememberGame } from './recent.js';
import { escapeHtml, playerLabel, toCsv, slug } from './lib.js';
import { applyTeamColors, glanceCard, teamName, divisionLabel, doneNewestFirst, doneOldestFirst, timeOfDay, minuteLabel, inOutOrder } from './render.js';

const $ = (id) => document.getElementById(id);
const gameId = new URLSearchParams(location.search).get('g') || '';

let game = null;
let subs = [];
let subsLoaded = false;
let shownBatch; // batch on screen; unset until the first subs snapshot
let litTimer = null;
const HIGHLIGHT_MS = 20000;

// Neon highlight on the latest-sub box for `ms`, then it fades (CSS).
function highlightLatest(ms) {
    const box = $('latest');
    box.classList.add('lit', 'pulse');
    clearTimeout(litTimer);
    litTimer = setTimeout(() => {
        // Stop the pulse first so the fade starts from the steady glow.
        box.classList.remove('pulse');
        requestAnimationFrame(() => requestAnimationFrame(() => box.classList.remove('lit')));
    }, ms);
}

function showError(err) {
    $('error').textContent = 'Live updates stopped: ' + (err.message || err) + '. Reload the page.';
    $('status-dot').classList.remove('live');
    $('status').textContent = 'Disconnected';
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
        const title = teamName(g, 'home') + ' vs ' + teamName(g, 'away');
        $('title').textContent = title + ' · ' + divisionLabel(g.division);
        document.title = 'Subs: ' + title;
        $('home-name').textContent = teamName(g, 'home');
        $('away-name').textContent = teamName(g, 'away');
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

function render() {
    if (!game) {
        return;
    }
    ['home', 'away'].forEach((side) => {
        const pending = subs.filter((s) => s.status === 'pending' && s.team === side);
        $('pending-' + side).innerHTML = pending.map((s) => glanceCard(s, game, { team: false })).join('');
        $('pending-' + side + '-empty').classList.toggle('hidden', pending.length > 0);
    });

    const done = doneNewestFirst(subs);
    $('log').innerHTML = done.map((s) => `
        <tr class="team-${s.team}">
          <td class="tod">${escapeHtml(timeOfDay(s))}</td>
          <td class="minute">${minuteLabel(s)}</td>
          <td><span class="team-tag">${escapeHtml(teamName(game, s.team))}</span></td>
          ${inOutOrder(game, `<td>${escapeHtml(playerLabel(s.playerIn))}</td>`, `<td>${escapeHtml(playerLabel(s.playerOut))}</td>`).join('')}
        </tr>`).join('');
    [$('col-a').textContent, $('col-b').textContent] = inOutOrder(game, 'In', 'Out');
    $('log-empty').classList.toggle('hidden', done.length > 0);
    $('print').disabled = $('export').disabled = done.length === 0;

    // Latest = every sub from the most recent stoppage (one execute tap).
    const latestBatch = done.length ? done[0].batchId : null;
    const latest = done.filter((s) => s.batchId === latestBatch);
    $('latest').classList.toggle('hidden', latest.length === 0);
    if (latest.length) {
        $('latest-title').textContent = (latest.length === 1 ? 'Latest sub' : 'Latest subs') + ' · ' + latest[0].minute + (latest[0].minute.includes(':') ? '' : '’');
        $('latest-subs').innerHTML = latest.map((s) => glanceCard(s, game)).join('');
    }
    if (!subsLoaded) {
        return;
    }
    if (latestBatch && latestBatch !== shownBatch) {
        if (shownBatch !== undefined) {
            highlightLatest(HIGHLIGHT_MS);
        } else if (latest[0].executedAt) {
            // Page opened just after a sub: highlight for what's left of
            // the 20 s.
            const left = HIGHLIGHT_MS - (Date.now() - latest[0].executedAt.toMillis());
            if (left > 0) {
                highlightLatest(left);
            }
        }
    }
    shownBatch = latestBatch;
}

// --- print and CSV export (oldest first) ---

function gameDate() {
    return game && game.createdAt ? game.createdAt.toDate() : new Date();
}

function buildPrintSheet() {
    if (!game) {
        return;
    }
    const done = doneOldestFirst(subs);
    $('print-sheet').innerHTML = `
        <h1>${escapeHtml(teamName(game, 'home'))} vs ${escapeHtml(teamName(game, 'away'))}</h1>
        <p>${escapeHtml(divisionLabel(game.division))} · ${escapeHtml(gameDate().toLocaleDateString([], { dateStyle: 'long' }))}
           · Substitutions: ${done.length}</p>
        <table>
          <thead><tr><th>#</th><th>TOD</th><th>Clock</th><th>Team</th>${inOutOrder(game, '<th>In</th>', '<th>Out</th>').join('')}</tr></thead>
          <tbody>${done.map((s, i) => `
            <tr>
              <td>${i + 1}</td>
              <td>${escapeHtml(timeOfDay(s))}</td>
              <td>${minuteLabel(s)}</td>
              <td>${escapeHtml(teamName(game, s.team))} (${s.team === 'home' ? 'H' : 'A'})</td>
              ${inOutOrder(game, `<td>${escapeHtml(playerLabel(s.playerIn))}</td>`, `<td>${escapeHtml(playerLabel(s.playerOut))}</td>`).join('')}
            </tr>`).join('')}</tbody>
        </table>
        <p class="printed">Printed ${escapeHtml(new Date().toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }))}</p>`;
}

// Ctrl+P / the browser's print menu also get an up-to-date sheet.
window.addEventListener('beforeprint', buildPrintSheet);
$('print').addEventListener('click', () => {
    buildPrintSheet();
    window.print();
});

const pad = (n) => String(n).padStart(2, '0');
const isoDate = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());

$('export').addEventListener('click', () => {
    if (!game) {
        return;
    }
    const rows = [['Date', 'TOD', 'Clock', 'Team', 'Home/Away', ...inOutOrder(game, ['In #', 'In name'], ['Out #', 'Out name']).flat()]];
    doneOldestFirst(subs).forEach((s) => {
        const t = s.executedAt ? s.executedAt.toDate() : null;
        rows.push([
            t ? isoDate(t) : '',
            t ? pad(t.getHours()) + ':' + pad(t.getMinutes()) + ':' + pad(t.getSeconds()) : '',
            s.minute || '',
            teamName(game, s.team),
            s.team === 'home' ? 'Home' : 'Away',
            ...inOutOrder(game, [s.playerIn.number, s.playerIn.name], [s.playerOut.number, s.playerOut.name]).flat(),
        ]);
    });
    const name = ['subs', slug(teamName(game, 'home')), 'vs', slug(teamName(game, 'away')), isoDate(gameDate())].join('-') + '.csv';
    // BOM so Excel reads accented names as UTF-8.
    const blob = new Blob(['﻿' + toCsv(rows)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
