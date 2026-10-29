// Service worker: makes the site installable and lets pages load from
// cache when the field's connection drops. Network-first, so a deploy is
// picked up on the next online load; the cache is only a fallback.
// Apache sends no Cache-Control, so the browser's HTTP cache would guess a
// lifetime and serve stale CSS/JS; every fetch here revalidates instead.
// Live game data goes through Firestore, which this never touches.

const CACHE = 'soccersubs-v2';

// Warmed on install so the installed app opens offline even before these
// have been visited. A missing file (e.g. config.js locally) is skipped.
const SHELL = [
    '/start/',
    '/entry.html',
    '/view.html',
    '/setup.html',
    '/css/app.css',
];

// Versioned Firebase SDK files never change, so they're served cache-first.
const FIREBASE_SDK = 'https://www.gstatic.com/firebasejs/';

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE)
            .then((cache) => Promise.allSettled(SHELL.map((url) => cache.add(new Request(url, { cache: 'no-cache' })))))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') {
        return;
    }
    const url = new URL(req.url);

    if (req.url.startsWith(FIREBASE_SDK)) {
        event.respondWith(cacheFirst(req));
        return;
    }
    // Other origins (Firestore, the feedback widget) and the roster API
    // always go straight to the network.
    if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) {
        return;
    }
    event.respondWith(networkFirst(req));
});

async function networkFirst(req) {
    const cache = await caches.open(CACHE);
    try {
        const res = await fetch(req, { cache: 'no-cache' });
        if (res.ok) {
            cache.put(req, res.clone());
        }
        return res;
    } catch (err) {
        // Pages carry the game code in the query string; any cached copy
        // of the page will do, since it reads the code at runtime.
        const hit = await cache.match(req, { ignoreSearch: req.mode === 'navigate' });
        if (hit) {
            return hit;
        }
        throw err;
    }
}

async function cacheFirst(req) {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req);
    if (hit) {
        return hit;
    }
    const res = await fetch(req);
    if (res.ok) {
        cache.put(req, res.clone());
    }
    return res;
}
