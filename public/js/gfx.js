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
const IN_MS = 900; // the staged entrance in gfx.html
const OUT_MS = 800; // the exit (reverse)
const SWAP_OUT_MS = 300; // rows fading out before the next sub in the same showing
const SWAP_IN_MS = 500; // and the next sub's rows sliding in
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

// Three stacked chevrons that light up in turn (CSS): pointing up and
// flowing upward for IN, down for OUT.
const CHEVRONS = '<svg viewBox="0 0 24 30" aria-hidden="true">'
    + [4, 12, 20].map((y) => `<polyline points="4,${y + 7} 12,${y - 1} 20,${y + 7}"/>`).join('')
    + '</svg>';

function line(p, io, label) {
    return `
      <div class="gfx-line io-${io}">
        <span class="gfx-io" role="img" aria-label="${label}">${CHEVRONS}</span>
        <span class="gfx-num">${p && p.number ? escapeHtml(p.number) : ''}</span>
        <span class="gfx-name">${escapeHtml(p && p.name ? p.name : '')}</span>
      </div>`;
}

function fill(s, index, total) {
    const gfx = $('gfx');
    gfx.classList.toggle('team-home', s.team === 'home');
    gfx.classList.toggle('team-away', s.team === 'away');
    $('gfx-clock').innerHTML = minuteLabel(s);
    // One dot per sub in this stoppage, the current one filled. Kept when
    // only the current one moves, so the fill can animate across.
    const dots = $('gfx-dots');
    const count = total > 1 ? total : 0;
    if (dots.children.length !== count) {
        dots.innerHTML = '<i></i>'.repeat(count);
    }
    [...dots.children].forEach((d, i) => d.classList.toggle('on', i === index));
    $('gfx-body').innerHTML = inOutOrder(game, line(s.playerIn, 'in', 'IN'), line(s.playerOut, 'out', 'OUT')).join('');
}

const frames = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

// Plays queued subs: the graphic animates in once, each sub holds for
// SHOW_MS (later ones swap in place: rows out, rows in), then it animates
// out once the queue is empty.
async function play() {
    if (playing) {
        return;
    }
    playing = true;
    const gfx = $('gfx');
    let first = true;
    let team = null;
    while (queue.length) {
        const { sub, index, total } = queue.shift();
        if (first) {
            gfx.style.removeProperty('--row-delay');
            fill(sub, index, total);
            // Two frames so the entrance starts from the hidden state.
            await frames();
            gfx.classList.add('show');
            await wait(IN_MS + SHOW_MS);
            first = false;
        } else {
            gfx.style.setProperty('--row-delay', '0s');
            // A different team also wipes the team block out and back in.
            gfx.classList.toggle('swap-team', sub.team !== team);
            gfx.classList.add('swap');
            await wait(SWAP_OUT_MS);
            fill(sub, index, total);
            await frames();
            gfx.classList.remove('swap', 'swap-team');
            await wait(SWAP_IN_MS + SHOW_MS);
        }
        team = sub.team;
    }
    gfx.classList.remove('show');
    await wait(OUT_MS + GAP_MS);
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
    }, {
        team: 'away', minute: '67:23',
        playerIn: { number: '22', name: 'Second Sample' },
        playerOut: { number: '4', name: 'Fourth Player' },
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
        $('gfx-team-home').textContent = teamName(g, 'home');
        $('gfx-team-away').textContent = teamName(g, 'away');
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
