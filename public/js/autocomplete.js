// A small suggestion dropdown for a text input, used for school names in
// place of a native <datalist> (which Chrome on Android draws as a
// flickering, see-through overlay). The input stays free text; picking a
// suggestion fills it and fires 'change' like typing would.
import { escapeHtml } from './lib.js';

let nextId = 0;

// items(): current list to search. match(items, query): ranked matches.
// render(item): { label, detail } for one suggestion.
export function attachAutocomplete(input, { items, match, render }) {
    const listId = 'ac-list-' + (nextId++);
    const wrap = document.createElement('div');
    wrap.className = 'ac-wrap';
    input.before(wrap);
    wrap.append(input);
    const list = document.createElement('ul');
    list.className = 'ac-list';
    list.id = listId;
    list.setAttribute('role', 'listbox');
    list.hidden = true;
    wrap.append(list);

    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-controls', listId);
    input.setAttribute('aria-expanded', 'false');
    input.setAttribute('autocomplete', 'off');

    let matches = [];
    let active = -1;

    function close() {
        list.hidden = true;
        matches = [];
        active = -1;
        input.setAttribute('aria-expanded', 'false');
        input.removeAttribute('aria-activedescendant');
    }

    function show() {
        list.innerHTML = matches.map((item, i) => {
            const r = render(item);
            return `<li role="option" id="${listId}-${i}" data-i="${i}" aria-selected="${i === active}"${i === active ? ' class="active"' : ''}>
                <span class="ac-label">${escapeHtml(r.label)}</span>
                ${r.detail ? `<span class="ac-detail">${escapeHtml(r.detail)}</span>` : ''}
              </li>`;
        }).join('');
        list.hidden = matches.length === 0;
        input.setAttribute('aria-expanded', String(matches.length > 0));
        if (active >= 0) {
            input.setAttribute('aria-activedescendant', listId + '-' + active);
            const el = list.children[active];
            if (el) {
                el.scrollIntoView({ block: 'nearest' });
            }
        } else {
            input.removeAttribute('aria-activedescendant');
        }
    }

    function pick(i) {
        const item = matches[i];
        if (!item) {
            return;
        }
        input.value = render(item).label;
        close();
        input.dispatchEvent(new Event('change', { bubbles: true }));
    }

    input.addEventListener('input', () => {
        const q = input.value.trim();
        matches = q.length >= 2 ? match(items(), q) : [];
        // Typed in full: nothing left to suggest, and an open list would
        // cover whatever comes next (e.g. the Create game button).
        if (matches.some((m) => render(m).label.toLowerCase() === q.toLowerCase())) {
            matches = [];
        }
        active = -1;
        show();
    });
    input.addEventListener('keydown', (e) => {
        if (list.hidden) {
            return;
        }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            const n = matches.length;
            active = e.key === 'ArrowDown' ? (active + 1) % n : (active - 1 + n) % n;
            show();
        } else if (e.key === 'Enter' && active >= 0) {
            // Pick instead of submitting the form.
            e.preventDefault();
            pick(active);
        } else if (e.key === 'Escape') {
            close();
        }
    });
    // pointerdown + preventDefault keeps focus in the input, so blur doesn't
    // close the list before the tap lands.
    list.addEventListener('pointerdown', (e) => {
        const li = e.target.closest('li[data-i]');
        if (li) {
            e.preventDefault();
            pick(+li.dataset.i);
        }
    });
    input.addEventListener('blur', () => setTimeout(close, 120));
}
