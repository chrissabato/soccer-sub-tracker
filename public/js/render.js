// Markup shared by the entry page and the viewer.
import { escapeHtml, playerLabel, normalizeColor, contrastText } from './lib.js';

// Overrides --home/--away (and their badge text colors) with the game's
// team colors. Teams without a color keep the theme defaults.
export function applyTeamColors(game) {
    const style = document.documentElement.style;
    ['home', 'away'].forEach((side) => {
        const color = normalizeColor(game && game[side] && game[side].color);
        if (color) {
            style.setProperty('--' + side, color);
            style.setProperty('--' + side + '-text', contrastText(color));
        } else {
            style.removeProperty('--' + side);
            style.removeProperty('--' + side + '-text');
        }
    });
}

export function teamName(game, side) {
    const name = game && game[side] && game[side].name;
    return name || (side === 'home' ? 'Home' : 'Away');
}

// Time of day a sub was executed, e.g. "7:42 PM" ('' if not executed).
export function timeOfDay(sub) {
    return sub.executedAt
        ? sub.executedAt.toDate().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
        : '';
}

// Match clock time as shown: "67:23" (older subs without seconds: "67’").
export function minuteLabel(sub) {
    if (!sub.minute) {
        return '';
    }
    return escapeHtml(sub.minute) + (sub.minute.includes(':') ? '' : '’');
}

// One sub as a card. opts.minute shows the time of day and minute column;
// opts.actions is trusted HTML for the button area.
export function subCard(sub, game, opts = {}) {
    return `
      <div class="sub team-${sub.team}" data-id="${escapeHtml(sub.id)}">
        ${opts.minute ? `<span class="minute">${minuteLabel(sub)}<span class="tod">${escapeHtml(timeOfDay(sub))}</span></span>` : ''}
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

// Executed subs: newest time of day first, then away before home, then
// queue order.
const TEAM_ORDER = { away: 0, home: 1 };
export function doneNewestFirst(subs) {
    return subs
        .filter((s) => s.status === 'done')
        .map((s, i) => ({ s, i, t: s.executedAt ? s.executedAt.toMillis() : Infinity }))
        .sort((a, b) => (b.t - a.t) || (TEAM_ORDER[a.s.team] - TEAM_ORDER[b.s.team]) || (a.i - b.i))
        .map((x) => x.s);
}
