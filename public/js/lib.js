// Pure helpers with no Firebase or DOM dependency, so they run in the
// browser and under `node --test` alike.

// Game codes: no I, O, 0 or 1 so they survive being read aloud or
// squinted at on a phone.
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 6;
export const CODE_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/;

export function generateCode(random = defaultRandom) {
    const bytes = random(CODE_LENGTH);
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i++) {
        code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
    }
    return code;
}

function defaultRandom(n) {
    return crypto.getRandomValues(new Uint8Array(n));
}

// Uppercases and drops spaces/dashes. Returns '' if it can't be a code.
export function normalizeCode(input) {
    const code = String(input || '').toUpperCase().replace(/[\s-]/g, '');
    return CODE_PATTERN.test(code) ? code : '';
}

// Match minute as typed by the official: "67", "67'", "45+2", "90 + 3".
// Returns the canonical form ("45+2") or null if it isn't a minute.
export function normalizeMinute(input) {
    const m = String(input || '').replace(/[\s'’]/g, '').match(/^(\d{1,3})(?:\+(\d{1,2}))?$/);
    if (!m) {
        return null;
    }
    const base = String(parseInt(m[1], 10));
    return m[2] ? base + '+' + parseInt(m[2], 10) : base;
}

// Sort key for minutes so "45+2" lands between 45 and 46.
export function minuteSortValue(minute) {
    const m = String(minute || '').match(/^(\d+)(?:\+(\d+))?$/);
    return m ? parseInt(m[1], 10) + (m[2] ? parseInt(m[2], 10) / 100 : 0) : -1;
}

// Academic-year season label used in Presto URLs: July 2026–June 2027 is
// "2026-27". Port of pa-script RosterUrlGuesser::season().
export function season(date = new Date()) {
    let year = date.getFullYear();
    if (date.getMonth() < 6) {
        year--;
    }
    return year + '-' + String((year + 1) % 100).padStart(2, '0');
}

// Candidate roster URLs for a school's soccer team, Sidearm first then
// Presto. schools.json has no CMS field, so both are tried. Port of
// pa-script RosterUrlGuesser::guess() for soccer.
export function guessRosterUrls(siteUrl, division, date = new Date()) {
    const base = String(siteUrl || '').trim().replace(/\/+$/, '');
    if (!/^https?:\/\//i.test(base) || (division !== 'mens' && division !== 'womens')) {
        return [];
    }
    const presto = division === 'womens' ? 'wsoc' : 'msoc';
    return [
        base + '/sports/' + division + '-soccer/roster',
        base + '/sports/' + presto + '/' + season(date) + '/roster',
    ];
}

// Plain pasted roster, one player per line:
//   10 Jane Smith
//   #10 Jane Smith
//   10, Jane Smith
//   10<TAB>Jane Smith
// With commas or tabs, columns after the name (e.g. class year) are
// ignored. Blank lines and lines with no letters are skipped.
export function parsePasteList(text) {
    const players = [];
    String(text || '').split(/\r?\n/).forEach((raw) => {
        const line = raw.trim();
        if (!/[A-Za-z]/.test(line)) {
            return;
        }
        let number = '';
        let name;
        if (/[\t,]/.test(line)) {
            const fields = line.split(/\s*[\t,]\s*/).filter(Boolean);
            if (/^#?\d{1,3}$/.test(fields[0])) {
                number = fields.shift().replace('#', '');
            }
            name = fields.shift() || '';
        } else {
            const m = line.match(/^#?(\d{1,3})\.?\s+(.*)$/);
            if (m) {
                number = m[1];
            }
            name = m ? m[2] : line;
        }
        name = name.replace(/\s+/g, ' ').trim();
        if (name) {
            players.push({ number, name });
        }
    });
    return players;
}

// "#4 Jane Smith" / "#4" / "Jane Smith" for a {number, name} player.
export function playerLabel(p) {
    if (!p) {
        return '';
    }
    const num = p.number ? '#' + p.number : '';
    return [num, p.name || ''].filter(Boolean).join(' ');
}

// Sort roster players by jersey number, unnumbered last.
export function byNumber(a, b) {
    const na = a.number === '' ? Infinity : parseInt(a.number, 10);
    const nb = b.number === '' ? Infinity : parseInt(b.number, 10);
    return na - nb || String(a.name).localeCompare(String(b.name));
}

// "#1D4ED8" / "#1d4ed8" -> "#1d4ed8"; anything else -> ''.
export function normalizeColor(c) {
    const s = String(c || '').trim().toLowerCase();
    return /^#[0-9a-f]{6}$/.test(s) ? s : '';
}

// Black or white, whichever reads better on a #rrggbb background
// (WCAG relative luminance).
export function contrastText(hex) {
    const c = normalizeColor(hex);
    if (!c) {
        return '#ffffff';
    }
    const lin = (i) => {
        const v = parseInt(c.slice(i, i + 2), 16) / 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    const l = 0.2126 * lin(1) + 0.7152 * lin(3) + 0.0722 * lin(5);
    // Contrast with white is 1.05/(l+.05); with black (l+.05)/.05.
    return 1.05 / (l + 0.05) >= (l + 0.05) / 0.05 ? '#ffffff' : '#000000';
}

export function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
}
