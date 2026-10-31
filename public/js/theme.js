// Dark mode switch for browsers that aren't already set to dark. Loaded as
// a plain script in <head> so a saved choice applies before first paint.
// A browser that prefers dark gets dark from the CSS and no switch.
(function () {
    const KEY = 'theme';
    const root = document.documentElement;
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');

    function saved() {
        try {
            return localStorage.getItem(KEY);
        } catch (e) {
            return null;
        }
    }

    function save(value) {
        try {
            if (value) {
                localStorage.setItem(KEY, value);
            } else {
                localStorage.removeItem(KEY);
            }
        } catch (e) {
            // Private mode or blocked storage: the switch still works for this page.
        }
    }

    if (saved() === 'dark') {
        root.dataset.theme = 'dark';
    }

    const MOON = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
    const SUN = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';

    function addSwitch() {
        const header = document.querySelector('header.bar, header.pa-head');
        if (!header) {
            return;
        }
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'theme-toggle';
        function update() {
            const dark = root.dataset.theme === 'dark';
            button.innerHTML = dark ? SUN : MOON;
            button.title = dark ? 'Light mode' : 'Dark mode';
            button.setAttribute('aria-label', button.title);
            button.setAttribute('aria-pressed', String(dark));
            button.hidden = prefersDark.matches;
        }
        button.addEventListener('click', () => {
            if (root.dataset.theme === 'dark') {
                delete root.dataset.theme;
                save(null);
            } else {
                root.dataset.theme = 'dark';
                save('dark');
            }
            update();
        });
        prefersDark.addEventListener('change', update);
        update();
        header.appendChild(button);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', addSwitch);
    } else {
        addSwitch();
    }
})();
