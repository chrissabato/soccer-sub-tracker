// School names for team-name autocomplete, from
// github.com/chrissabato/college-athletics-directory. Cached per browser
// for a week; if both the cache and the network fail, autocomplete is
// simply empty and names are typed freely.
const SOURCE = 'https://raw.githubusercontent.com/chrissabato/college-athletics-directory/main/schools.json';
const CACHE_KEY = 'schools.v1';
const MAX_AGE_MS = 7 * 24 * 3600 * 1000;

let loading = null;

export function loadSchools() {
    if (!loading) {
        loading = load();
    }
    return loading;
}

async function load() {
    const cached = readCache();
    if (cached && Date.now() - cached.at < MAX_AGE_MS) {
        return cached.schools;
    }
    try {
        const res = await fetch(SOURCE);
        if (!res.ok) {
            throw new Error('HTTP ' + res.status);
        }
        const schools = (await res.json())
            .filter((s) => s && s.name)
            .map((s) => ({ name: s.name, url: s.url || '', state: s.state || '', association: s.association || '' }));
        try {
            localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), schools }));
        } catch (err) {
            // Storage full or blocked; the list still works for this visit.
        }
        return schools;
    } catch (err) {
        return cached ? cached.schools : [];
    }
}

function readCache() {
    try {
        return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    } catch (err) {
        return null;
    }
}

// Fills a <datalist> with school names.
export function fillDatalist(datalist, schools) {
    const frag = document.createDocumentFragment();
    schools.forEach((s) => {
        const opt = document.createElement('option');
        opt.value = s.name;
        opt.label = [s.association, s.state].filter(Boolean).join(' · ');
        frag.appendChild(opt);
    });
    datalist.replaceChildren(frag);
}

export function findSchool(schools, name) {
    const key = String(name || '').trim().toLowerCase();
    return schools.find((s) => s.name.toLowerCase() === key) || null;
}
