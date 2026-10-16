// Games opened in this browser, for the home page's Recent games list.
// Browser storage only (per device); entries drop off once the game is past
// its 72-hour lifetime. Storage can be unavailable (private mode, blocked
// site data), so every access is guarded and the list just comes back empty.
const KEY = 'recentGames.v1';
const MAX = 10;
const LIFETIME_MS = 72 * 3600 * 1000;

function read() {
    try {
        const list = JSON.parse(localStorage.getItem(KEY) || '[]');
        return Array.isArray(list) ? list : [];
    } catch (err) {
        return [];
    }
}

function write(list) {
    try {
        localStorage.setItem(KEY, JSON.stringify(list));
    } catch (err) {
        // Storage full or blocked; the list is a convenience only.
    }
}

const alive = (g) => !g.createdAt || Date.now() - g.createdAt < LIFETIME_MS;

// Record (or refresh) a game as just opened.
export function rememberGame(gameId, game) {
    if (!gameId || !game) {
        return;
    }
    const entry = {
        id: gameId,
        home: (game.home && game.home.name) || '',
        away: (game.away && game.away.name) || '',
        division: game.division || '',
        createdAt: game.createdAt && game.createdAt.toMillis ? game.createdAt.toMillis() : null,
        openedAt: Date.now(),
    };
    write([entry, ...read().filter((g) => g.id !== gameId)].filter(alive).slice(0, MAX));
}

// Most recently opened first, expired games removed.
export function recentGames() {
    const list = read();
    const live = list.filter(alive);
    if (live.length !== list.length) {
        write(live);
    }
    return live.sort((a, b) => b.openedAt - a.openedAt);
}

export function forgetGame(gameId) {
    write(read().filter((g) => g.id !== gameId));
}
