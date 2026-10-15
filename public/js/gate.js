// Editor-only pages (setup, entry) start here: reads ?g=, and if this
// browser hasn't joined the game yet, shows a code prompt in #gate and
// waits for a correct code. Resolves with the gameId once allowed.
import { isEditor, joinGame } from './store.js';

export function gameIdFromUrl() {
    return new URLSearchParams(location.search).get('g') || '';
}

export async function requireEditor() {
    const gameId = gameIdFromUrl();
    const gate = document.getElementById('gate');
    if (!gameId) {
        gate.innerHTML = '<p class="error">No game in the link. <a href="./">Start over</a>.</p>';
        gate.classList.remove('hidden');
        return new Promise(() => {});
    }
    if (await isEditor(gameId)) {
        return gameId;
    }
    gate.innerHTML = `
        <h2>Enter the game code</h2>
        <form class="row" autocomplete="off">
          <input name="code" placeholder="ABC234" maxlength="8" autocapitalize="characters" spellcheck="false" aria-label="Game code" required>
          <button class="primary" type="submit">Unlock</button>
        </form>
        <p class="error" role="alert"></p>`;
    gate.classList.remove('hidden');
    return new Promise((resolve) => {
        const form = gate.querySelector('form');
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const button = form.querySelector('button');
            button.disabled = true;
            try {
                await joinGame(gameId, form.code.value);
                gate.classList.add('hidden');
                resolve(gameId);
            } catch (err) {
                gate.querySelector('.error').textContent = err.message;
                button.disabled = false;
            }
        });
    });
}
