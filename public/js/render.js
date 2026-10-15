// Markup shared by the entry page and the viewer.
import { escapeHtml, playerLabel } from './lib.js';

export function teamName(game, side) {
    const name = game && game[side] && game[side].name;
    return name || (side === 'home' ? 'Home' : 'Away');
}

// One sub as a card. opts.minute shows the minute column; opts.actions is
// trusted HTML for the button area.
export function subCard(sub, game, opts = {}) {
    return `
      <div class="sub team-${sub.team}" data-id="${escapeHtml(sub.id)}">
        ${opts.minute ? `<span class="minute">${escapeHtml(sub.minute || '')}${sub.minute ? '’' : ''}</span>` : ''}
        <div class="swap">
          <span class="team-tag">${escapeHtml(teamName(game, sub.team))}</span>
          <span class="in">${escapeHtml(playerLabel(sub.playerIn))}</span>
          <span class="out">${escapeHtml(playerLabel(sub.playerOut))}</span>
        </div>
        ${opts.actions ? `<div class="actions">${opts.actions}</div>` : ''}
      </div>`;
}

export function divisionLabel(division) {
    return division === 'mens' ? "Men's soccer" : "Women's soccer";
}

// Executed subs, newest stoppage first, queue order within a stoppage.
export function doneNewestFirst(subs) {
    return subs
        .filter((s) => s.status === 'done')
        .map((s, i) => ({ s, i, t: s.executedAt ? s.executedAt.toMillis() : Infinity }))
        .sort((a, b) => (b.t - a.t) || (a.i - b.i))
        .map((x) => x.s);
}
