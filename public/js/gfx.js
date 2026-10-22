// Broadcast overlay (OBS / vMix browser source): transparent page, read-only,
// no login. When subs are executed, each one wipes in as a lower third for a
// few seconds, one after another. Subs already done when the page loads are
// not shown.
//
// URL options:
//   s=5      seconds each sub stays on screen (default 5)
//   test=1   loop the latest executed sub, for positioning the source
//   debug=1  show connection problems on screen (hidden on air by default)
import { watchGame, watchSubs } from './store.js';
import { escapeHtml } from './lib.js';
import { applyTeamColors, teamName, doneOldestFirst, minuteLabel, inOutOrder } from './render.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const gameId = params.get('g') || '';
const SHOW_MS = Math.min(Math.max(Number(params.get('s')) || 5, 1), 60) * 1000;
const WIPE_MS = 450; // matches the .gfx clip-path transition
const GAP_MS = 250;
const testMode = params.has('test');
const debug = params.has('debug');

let game = null;
let subs = [];
let synced = false; // had a snapshot from the server, not just the local cache
let seen = null; // id:batchId of every executed sub; null until the first snapshot
const queue = [];
let playing = false;

function message(text) {
    $('msg').textContent = text;
    $('msg').classList.toggle('hidden', !debug || !text);
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function line(p, io, label) {
    return `
      <div class="gfx-line io-${io}">
        <span class="gfx-io">${label}</span>
        <span class="gfx-num">${p && p.number ? escapeHtml(p.number) : ''}</span>
        <span class="gfx-name">${escapeHtml(p && p.name ? p.name : '')}</span>
      </div>`;
}

function fill(s, index, total) {
    $('gfx').className = 'gfx team-' + s.team;
    $('gfx-team').textContent = teamName(game, s.team);
    $('gfx-meta').innerHTML = [minuteLabel(s), total > 1 ? (index + 1) + '/' + total : '']
        .filter(Boolean).join(' · ');
    $('gfx-body').innerHTML = inOutOrder(game, line(s.playerIn, 'in', 'IN'), line(s.playerOut, 'out', 'OUT')).join('');
}

// Plays queued subs one at a time: wipe in, hold, wipe out.
async function play() {
    if (playing) {
        return;
    }
    playing = true;
    while (queue.length) {
        const { sub, index, total } = queue.shift();
        fill(sub, index, total);
        // Two frames so the wipe starts from the hidden state.
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        $('gfx').classList.add('show');
        await wait(WIPE_MS + SHOW_MS);
        $('gfx').classList.remove('show');
        await wait(WIPE_MS + GAP_MS);
    }
    playing = false;
    if (testMode) {
        queueTest();
    }
}

function enqueue(list) {
    list.forEach((sub, index) => queue.push({ sub, index, total: list.length }));
    play();
}

// Test mode: the latest stoppage on repeat (or a sample sub if none yet).
function queueTest() {
    const done = doneOldestFirst(subs);
    const last = done.length ? done.filter((s) => s.batchId === done[done.length - 1].batchId) : [{
        team: 'home', minute: '67:23',
        playerIn: { number: '10', name: 'Sample Player' },
        playerOut: { number: '7', name: 'Another Player' },
    }];
    setTimeout(() => enqueue(last), queue.length || playing ? 0 : 1000);
}

function onSubs() {
    if (!game || !synced) {
        return;
    }
    const done = doneOldestFirst(subs);
    const key = (s) => s.id + ':' + s.batchId;
    if (seen === null) {
        seen = new Set(done.map(key));
        if (testMode) {
            queueTest();
        }
        return;
    }
    const fresh = done.filter((s) => !seen.has(key(s)));
    fresh.forEach((s) => seen.add(key(s)));
    if (fresh.length && !testMode) {
        enqueue(fresh);
    }
}

if (!gameId) {
    message('No game in the link (?g=…)');
} else {
    watchGame(gameId, (g) => {
        if (!g) {
            message('Game not found');
            return;
        }
        game = g;
        applyTeamColors(g);
        document.title = 'GFX: ' + teamName(g, 'home') + ' vs ' + teamName(g, 'away');
        onSubs();
    }, (err) => message('Live updates stopped: ' + (err.message || err)));

    watchSubs(gameId, (list, meta) => {
        subs = list;
        synced = synced || !meta.fromCache;
        message(meta.fromCache ? 'Reconnecting…' : '');
        onSubs();
    }, (err) => message('Live updates stopped: ' + (err.message || err)));
}
