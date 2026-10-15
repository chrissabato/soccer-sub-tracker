import { requireEditor } from './gate.js';
import { watchGame, watchRosters, watchSubs, addSub, editSub, cancelSub, executeSubs } from './store.js';
import { normalizeMinute, formatClockDigits, playerLabel, byNumber, escapeHtml } from './lib.js';
import { applyTeamColors, subCard, teamName, doneNewestFirst } from './render.js';

const $ = (id) => document.getElementById(id);

const gameId = await requireEditor();
$('app').classList.remove('hidden');
$('nav-setup').href = 'setup.html?g=' + encodeURIComponent(gameId);
$('nav-view').href = 'view.html?g=' + encodeURIComponent(gameId);

let game = null;
let rosters = { home: [], away: [] };
let subs = [];

function showError(err) {
    $('error').textContent = err ? (err.message || String(err)) : '';
}

watchGame(gameId, (g) => {
    if (!g) {
        $('app').innerHTML = '<p class="error">This game no longer exists. Games are deleted after 72 hours.</p>';
        $('execute-bar').classList.add('hidden');
        return;
    }
    game = g;
    applyTeamColors(g);
    $('title').textContent = teamName(g, 'home') + ' vs ' + teamName(g, 'away');
    document.querySelectorAll('#team-toggle button').forEach((b) => {
        b.textContent = teamName(g, b.dataset.team);
    });
    document.querySelectorAll('.add-team').forEach((b) => {
        b.textContent = '+ ' + teamName(g, b.dataset.team) + ' sub';
    });
    render();
}, showError);
watchRosters(gameId, (r) => { rosters = r; }, showError);
watchSubs(gameId, (list) => { subs = list; render(); }, showError);

// --- lists ---

const pendingSubs = () => subs.filter((s) => s.status === 'pending');

function render() {
    if (!game) {
        return;
    }
    const pending = pendingSubs();
    $('pending').innerHTML = pending.map((s) => subCard(s, game, {
        actions: `
          <button class="small" data-act="edit" type="button">Edit</button>
          <button class="small danger" data-act="cancel" type="button" aria-label="Cancel sub">✕</button>
          <button class="small primary" data-act="execute" type="button">Execute</button>`,
    })).join('');
    $('pending-empty').classList.toggle('hidden', pending.length > 0);
    $('pending-count').textContent = pending.length ? '(' + pending.length + ')' : '';
    $('execute-bar').classList.toggle('hidden', pending.length === 0);
    $('execute-all').textContent = pending.length === 1 ? 'Execute 1 sub' : 'Execute all ' + pending.length + ' subs';

    const done = doneNewestFirst(subs);
    $('done').innerHTML = done.map((s) => subCard(s, game, {
        minute: true,
        actions: '<button class="small" data-act="edit" type="button">Edit</button>',
    })).join('');
    $('done-empty').classList.toggle('hidden', done.length > 0);
}

function subById(id) {
    return subs.find((s) => s.id === id);
}

function onListClick(e) {
    const button = e.target.closest('button[data-act]');
    if (!button) {
        return;
    }
    const sub = subById(button.closest('.sub').dataset.id);
    if (!sub) {
        return;
    }
    if (button.dataset.act === 'edit') {
        openSubDialog(sub);
    } else if (button.dataset.act === 'cancel') {
        if (confirm('Cancel this sub?\n' + teamName(game, sub.team) + ': ' + playerLabel(sub.playerIn) + ' for ' + playerLabel(sub.playerOut))) {
            cancelSub(gameId, sub.id).catch(showError);
        }
    } else if (button.dataset.act === 'execute') {
        openMinuteDialog([sub]);
    }
}
$('pending').addEventListener('click', onListClick);
$('done').addEventListener('click', onListClick);

// --- add / edit sub dialog ---

let form = null; // { sub (when editing), team, playerIn, playerOut }

// Edits an existing sub, or adds one for `side` (from the team's add button).
function openSubDialog(sub, side = 'home') {
    form = sub
        ? { sub, team: sub.team, playerIn: { ...sub.playerIn }, playerOut: { ...sub.playerOut } }
        : { sub: null, team: side, playerIn: null, playerOut: null };
    $('sub-title').textContent = sub ? 'Edit sub' : 'Add sub';
    $('sub-save').textContent = sub ? 'Save' : 'Queue sub';
    const isDone = sub && sub.status === 'done';
    $('minute-row').classList.toggle('hidden', !isDone);
    setClock($('edit-minute'), isDone ? (sub.minute || '') : '');
    $('sub-error').textContent = '';
    renderSubForm();
    $('sub-dialog').showModal();
    if (!sub) {
        pickPlayer('playerIn');
    }
}

function renderSubForm() {
    document.querySelectorAll('#team-toggle button').forEach((b) => {
        b.setAttribute('aria-pressed', String(b.dataset.team === form.team));
    });
    const label = (p) => (p && (p.number || p.name))
        ? escapeHtml(playerLabel(p))
        : '<span class="placeholder">Tap to choose</span>';
    $('pick-out').innerHTML = label(form.playerOut);
    $('pick-in').innerHTML = label(form.playerIn);
}

$('team-toggle').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-team]');
    if (!b || b.dataset.team === form.team) {
        return;
    }
    form.team = b.dataset.team;
    // Players belong to a team; switching clears them.
    form.playerIn = null;
    form.playerOut = null;
    renderSubForm();
});
$('pick-out').addEventListener('click', () => pickPlayer('playerOut'));
$('pick-in').addEventListener('click', () => pickPlayer('playerIn'));
$('sub-cancel').addEventListener('click', () => $('sub-dialog').close());

$('sub-save').addEventListener('click', async () => {
    const has = (p) => p && (p.number || p.name);
    if (!has(form.playerOut) || !has(form.playerIn)) {
        $('sub-error').textContent = 'Choose both players.';
        return;
    }
    const data = { team: form.team, playerIn: form.playerIn, playerOut: form.playerOut };
    if (form.sub && form.sub.status === 'done') {
        const minute = normalizeMinute($('edit-minute').value);
        if (!minute) {
            $('sub-error').textContent = 'Enter the match time as MM:SS, like 67:23.';
            return;
        }
        data.minute = minute;
    }
    // Firestore applies writes locally at once and syncs when it can, so
    // don't wait for the server: a weak stadium signal mustn't hang the UI.
    const write = form.sub ? editSub(gameId, form.sub.id, data) : addSub(gameId, data);
    write.catch((err) => showError(new Error('A sub change was not saved: ' + err.message)));
    $('sub-dialog').close();
});

// --- player picker ---

let pickingField = null;

function pickPlayer(field) {
    pickingField = field;
    const isIn = field === 'playerIn';
    $('picker').classList.toggle('picking-in', isIn);
    $('picker').classList.toggle('picking-out', !isIn);
    $('picker-title').innerHTML = `<span class="io-badge">${isIn ? 'IN' : 'OUT'}</span>
        <span class="team-tag team-${form.team}">${escapeHtml(teamName(game, form.team))}</span>`;
    // Show the player already chosen for the other side of the swap.
    const other = form[isIn ? 'playerOut' : 'playerIn'];
    const hasOther = other && (other.number || other.name);
    $('picker-context').classList.toggle('hidden', !hasOther);
    $('picker-context').innerHTML = hasOther
        ? `<span class="io-badge io-${isIn ? 'out' : 'in'}">${isIn ? 'OUT' : 'IN'}</span> ${escapeHtml(playerLabel(other))}`
        : '';
    $('picker-filter').value = '';
    renderPicker();
    $('picker').showModal();
}

function renderPicker() {
    const filter = $('picker-filter').value.trim();
    // The player already chosen for the other side of the swap stays in the
    // grid, disabled and colored (green IN / red OUT), so it's clear who it is.
    const otherSide = pickingField === 'playerOut' ? 'in' : 'out';
    const other = form[otherSide === 'in' ? 'playerIn' : 'playerOut'];
    const isOther = (number, name) => !!other && (other.number || other.name)
        && number === other.number && name === other.name;
    const isNum = /^\d+$/.test(filter);
    const players = (rosters[form.team] || [])
        .filter((p) => !filter || (isNum ? p.number.startsWith(filter) : p.name.toLowerCase().includes(filter.toLowerCase())))
        .slice()
        .sort(byNumber);
    const button = (number, name, sub) => isOther(number, name)
        ? `<button type="button" class="chosen io-${otherSide}" disabled>
             <span class="n">${number ? '#' + escapeHtml(number) : '—'}</span>
             <span class="nm">${otherSide === 'in' ? 'IN' : 'OUT'}${sub ? ' · ' + escapeHtml(sub) : ''}</span>
           </button>`
        : `<button type="button" data-number="${escapeHtml(number)}" data-name="${escapeHtml(name)}">
             <span class="n">${number ? '#' + escapeHtml(number) : '—'}</span>
             <span class="nm">${escapeHtml(sub)}</span>
           </button>`;
    let html = players.map((p) => button(p.number, p.name, p.name)).join('');
    // Allow a number that isn't on the roster (late addition, typo in the
    // imported roster) so entry is never blocked.
    if (isNum && filter.length <= 3 && !players.some((p) => p.number === filter)) {
        html += button(filter, '', 'not on roster');
    }
    if (!html) {
        html = '<p class="muted">' + ((rosters[form.team] || []).length
            ? 'No match. Type a jersey number to use it anyway.'
            : 'No roster loaded for this team. Type a jersey number.') + '</p>';
    }
    $('picker-grid').innerHTML = html;
}

$('picker-filter').addEventListener('input', renderPicker);
$('picker-filter').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        const first = $('picker-grid').querySelector('button:not(:disabled)');
        if (first) {
            first.click();
        }
    }
});
$('picker-cancel').addEventListener('click', () => $('picker').close());
$('picker-grid').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-number]');
    if (!b) {
        return;
    }
    form[pickingField] = { number: b.dataset.number, name: b.dataset.name };
    const next = pickingField === 'playerIn' && !form.playerOut ? 'playerOut' : null;
    $('picker').close();
    renderSubForm();
    if (next) {
        pickPlayer(next);
    }
});

// --- clock-time boxes: the colon goes in by itself as digits are typed ---

// The digits typed so far live in data-digits; the box shows them
// formatted. Tracking digits (not re-reading the box) is what lets
// backspace remove the padding zero in ":01".
function setClock(input, value) {
    input.dataset.digits = String(value || '').replace(/\D/g, '');
    input.value = value || '';
}

function attachClock(input) {
    input.addEventListener('input', (e) => {
        let digits = input.dataset.digits || '';
        const before = formatClockDigits(digits);
        if (e.inputType === 'insertText' && e.data && input.value === before + e.data) {
            // Typed at the end.
            digits += e.data.replace(/\D/g, '');
        } else if (e.inputType === 'deleteContentBackward' && input.value === before.slice(0, -1)) {
            // Backspace at the end: drop the last digit, not just the
            // character (so ":01" clears instead of re-padding to ":00").
            digits = digits.slice(0, -1);
        } else {
            // Anything else (select-all and type, paste, autofill): take
            // the digits that are now in the box.
            digits = input.value.replace(/\D/g, '');
        }
        input.dataset.digits = digits.slice(0, 5);
        input.value = formatClockDigits(input.dataset.digits);
        caretToEnd(input);
    });
    // Digits are always added/removed at the end, so keep the caret there
    // (a prefilled box would otherwise focus with the caret at the start,
    // where Backspace does nothing). A selection is left alone so
    // select-all-and-type still replaces the value.
    ['focus', 'click'].forEach((type) => input.addEventListener(type, () => setTimeout(() => {
        if (input.selectionStart === input.selectionEnd) {
            caretToEnd(input);
        }
    }, 0)));
}

function caretToEnd(input) {
    input.setSelectionRange(input.value.length, input.value.length);
}
attachClock($('minute'));
attachClock($('edit-minute'));

// --- execute with minute ---

let executing = [];
let lastMinute = '';

function openMinuteDialog(list) {
    executing = list;
    $('minute-title').textContent = list.length === 1 ? 'Execute sub' : 'Execute ' + list.length + ' subs';
    $('minute-summary').innerHTML = list.map((s) => subCard(s, game)).join('');
    // Blank, not prefilled: a stale minute accepted by habit is worse than
    // typing two digits.
    setClock($('minute'), '');
    $('minute').placeholder = lastMinute ? 'last: ' + lastMinute : '67:23';
    $('minute-error').textContent = '';
    $('minute-dialog').showModal();
    $('minute').focus();
}

$('execute-all').addEventListener('click', () => {
    const pending = pendingSubs();
    if (pending.length) {
        openMinuteDialog(pending);
    }
});
$('minute-cancel').addEventListener('click', () => $('minute-dialog').close());
$('minute').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        $('minute-ok').click();
    }
});
$('minute-ok').addEventListener('click', async () => {
    const minute = normalizeMinute($('minute').value);
    if (!minute) {
        $('minute-error').textContent = 'Enter the match time as MM:SS, like 67:23 (or 6723).';
        return;
    }
    // Skip any that were cancelled or executed elsewhere meanwhile.
    const ids = executing.map((s) => s.id).filter((id) => {
        const s = subById(id);
        return s && s.status === 'pending';
    });
    if (!ids.length) {
        $('minute-dialog').close();
        return;
    }
    executeSubs(gameId, ids, minute)
        .catch((err) => showError(new Error('Executing subs failed: ' + err.message)));
    lastMinute = minute;
    $('minute-dialog').close();
});

document.querySelectorAll('.add-team').forEach((b) => {
    b.addEventListener('click', () => openSubDialog(null, b.dataset.team));
});
