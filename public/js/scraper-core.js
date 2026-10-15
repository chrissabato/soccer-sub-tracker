// Core roster-scraping logic, developed/verified against real captured
// markup in tests/fixtures/roster-pages/ (Sidearm classic + Nuxt cards,
// PrestoSports tables in the current, legacy, and Willamette themes) plus
// synthetic fixtures for Presto cards, a generic <table>, and the
// raw-text fallback. tests/scraper/run.sh replays every fixture through
// headless Chrome.
//
// Exposed as PaScriptScrape.run(doc, sourceUrl). The bookmarklet calls it
// with no arguments against the live page; the roster page's "Fetch
// roster" button calls it on a DOMParser document built from HTML the
// server fetched (or the user pasted). One parser serves both paths.
var PaScriptScrape = (function () {
    'use strict';

    // The document being scraped — set per run().
    var doc = null;

    function text(el) {
        return el ? el.textContent.replace(/\s+/g, ' ').trim() : '';
    }

    // Text of an element minus any inline "Pos.:"-style labels that some
    // themes render for mobile (Presto: <span class="label">) and any
// audio-player controls.
    function cellText(el) {
        if (!el) {
            return '';
        }
        var clone = el.cloneNode(true);
        Array.prototype.forEach.call(clone.querySelectorAll('.label, .sr-only, .visually-hidden, button, audio'), function (l) {
            l.parentNode.removeChild(l);
        });
        return text(clone);
    }

    function longestText(nodeList) {
        var best = '';
        Array.prototype.forEach.call(nodeList, function (el) {
            var t = text(el);
            if (t.length > best.length) {
                best = t;
            }
        });
        return best;
    }

    // Jersey numbers: first digit run only ("#4" -> "4", "29/29" -> "29").
    function jersey(value) {
        var m = String(value || '').match(/\d+/);
        return m ? m[0] : '';
    }

    function first(row, selectors) {
        for (var i = 0; i < selectors.length; i++) {
            var el = row.querySelector(selectors[i]);
            if (el && text(el)) {
                return el;
            }
        }
        return null;
    }

    // Classic Sidearm Sports template — <ul class="sidearm-roster-players">
    // of <li class="sidearm-roster-player">. Verified against live captured
    // Calvin University and GOLC pages.
    function scrapeSidearmClassic() {
        var rows = doc.querySelectorAll('li.sidearm-roster-player');
        if (!rows.length) {
            return null;
        }
        var players = [];
        rows.forEach(function (row) {
            // Target the inner link/heading: newer Sidearm nests the jersey
            // number inside .sidearm-roster-player-name, so the container's
            // text would read "4 Jane Doe".
            var name = text(first(row, [
                '.sidearm-roster-player-name h3 a',
                '.sidearm-roster-player-name h3',
                '.sidearm-roster-player-name a',
                '.sidearm-roster-player-name'
            ]));
            if (!name) {
                return;
            }
            players.push({
                number: jersey(text(row.querySelector('.sidearm-roster-player-jersey-number'))),
                name: name,
                position: text(row.querySelector('.sidearm-roster-player-position .text-bold'))
                    || text(row.querySelector('.sidearm-roster-player-position-long-short'))
                    || text(row.querySelector('.sidearm-roster-player-position')),
                year: longestText(row.querySelectorAll('.sidearm-roster-player-academic-year')),
                hometown: text(row.querySelector('.sidearm-roster-player-hometown')),
                pronunciation: ''
            });
        });
        return players.length ? players : null;
    }

    // Newer Nuxt-based Sidearm template — <div class="roster-card">.
    // This card view does not always render hometown, so that field may be
    // left blank for the human reviewer to fill in.
    function scrapeSidearmCards() {
        var rows = doc.querySelectorAll('.roster-card');
        if (!rows.length) {
            return null;
        }
        var players = [];
        rows.forEach(function (row) {
            var name = text(row.querySelector('.roster-card__title-link'))
                || text(row.querySelector('.roster-card__title'));
            if (!name) {
                return;
            }
            players.push({
                number: jersey(text(row.querySelector('.roster-card__jersey-number'))),
                name: name,
                position: text(row.querySelector('.roster-card__position')),
                year: text(row.querySelector('[class*="profile-field__value--class"]')),
                hometown: text(row.querySelector('[class*="profile-field__value--hometown"]')),
                pronunciation: ''
            });
        });
        return players.length ? players : null;
    }

    // Photo-card layouts — PrestoSports card view (e.g. wubearcats.com) and
    // Sidearm's photo grid both use <div class="player-card">. Presto labels
    // every field on the card back (<ul class="bio-data"><li>Position: ...),
    // with a short [position, class, height] row on the front as backup;
    // the Sidearm grid usually only has number + name.
    function scrapePlayerCards() {
        var rows = doc.querySelectorAll('.player-card-wrapper, .player-card');
        if (!rows.length) {
            return null;
        }
        var players = [];
        rows.forEach(function (row) {
            // A wrapper and its inner .player-card both match; skip the inner one.
            if (row.parentElement && row.parentElement.closest('.player-card-wrapper, .player-card')) {
                return;
            }

            var labelled = function (label) {
                var items = row.querySelectorAll('.bio-data li');
                var re = new RegExp('^\\s*' + label + '\\s*:?\\s*', 'i');
                for (var i = 0; i < items.length; i++) {
                    var t = text(items[i]);
                    if (re.test(t)) {
                        return t.replace(re, '');
                    }
                }
                return '';
            };

            var name = text(row.querySelector('.player-name'));
            if (!name) {
                var firstName = text(row.querySelector('.firstname'));
                var lastName = text(row.querySelector('.lastname')).split(' - ')[0];
                name = (firstName + ' ' + lastName).trim();
            }
            if (!name) {
                name = text(row.querySelector('a[href*="/bios/"]'));
            }
            if (!name) {
                return;
            }

            var short = Array.prototype.map.call(row.querySelectorAll('.bio-attr-short span'), text)
                .filter(Boolean);

            players.push({
                number: jersey(text(row.querySelector('.number')) || text(row.querySelector('.jersey-number'))),
                name: name,
                position: labelled('Position') || short[0] || '',
                year: labelled('Class') || labelled('Year') || short[1] || '',
                hometown: labelled('Hometown'),
                pronunciation: ''
            });
        });
        return players.length ? players : null;
    }

    // Generic table adapter — any <table> whose header row has a
    // recognizable "Name" column. Covers PrestoSports' list view (name in a
    // <th scope="row">, mobile-only duplicate cells, inline "Pos.:" labels)
    // as well as plain non-CMS tables.
    function scrapeGenericTable() {
        var tables = doc.querySelectorAll('table');
        for (var i = 0; i < tables.length; i++) {
            var table = tables[i];
            var headerCells = table.querySelectorAll('thead th, thead td');
            if (!headerCells.length) {
                var firstRow = table.querySelector('tr');
                headerCells = firstRow ? firstRow.querySelectorAll('th, td') : [];
            }
            var headers = Array.prototype.map.call(headerCells, function (th) {
                return text(th).toLowerCase();
            });

            var find = function (re) {
                for (var h = 0; h < headers.length; h++) {
                    if (re.test(headers[h])) {
                        return h;
                    }
                }
                return -1;
            };
            var nameIdx = find(/name|player/);
            if (nameIdx === -1) {
                continue;
            }
            var numIdx = find(/^no\.?$|number|^#$|jersey/);
            var posIdx = find(/^pos/);
            var yearIdx = find(/year|^yr\.?$|^cl\.?$|class|academic/);
            var hometownIdx = find(/hometown/);
            var pronunciationIdx = find(/pronunciation|phonetic|pronounce/);
            // "Hometown/High School" columns read "Salem, Ore. / South Salem".
            var hometownHasSchool = hometownIdx >= 0 && /school|previous|last/.test(headers[hometownIdx]);

            var bodyRows = table.querySelectorAll('tbody tr');
            if (!bodyRows.length) {
                continue;
            }
            var players = [];
            bodyRows.forEach(function (tr) {
                var cells = Array.prototype.filter.call(tr.children, function (c) {
                    return c.tagName === 'TD' || c.tagName === 'TH';
                });
                // Drop cells the theme only shows on phones (Presto repeats
                // the jersey number in a .d-md-none cell) so indexes line
                // up with the header.
                if (cells.length > headers.length) {
                    cells = cells.filter(function (c) {
                        return !/(^|\s)d-md-none(\s|$)/.test(c.className);
                    });
                }
                var cell = function (idx) {
                    return idx >= 0 && cells[idx] ? cellText(cells[idx]) : '';
                };
                // Prefer the bio link: Presto repeats the name in a
                // print-only copy, so the whole cell reads "Jane Doe Jane Doe".
                var nameCell = nameIdx >= 0 ? cells[nameIdx] : null;
                var name = '';
                if (nameCell) {
                    var links = nameCell.querySelectorAll('a');
                    for (var l = 0; l < links.length && !name; l++) {
                        name = text(links[l]);
                    }
                    name = name || cellText(nameCell);
                }
                if (!name) {
                    return;
                }
                var hometown = cell(hometownIdx);
                if (hometownHasSchool) {
                    hometown = hometown.split(' / ')[0].split('/')[0].trim();
                }
                players.push({
                    number: numIdx >= 0 ? jersey(cell(numIdx)) : '',
                    name: name,
                    position: cell(posIdx),
                    year: cell(yearIdx),
                    hometown: hometown,
                    pronunciation: cell(pronunciationIdx)
                });
            });
            if (players.length) {
                return players;
            }
        }
        return null;
    }

    // ---- Coaches ------------------------------------------------------
    //
    // Each returns [{name, title, pronunciation}] in page order (head coach
    // first on every site seen so far) or null. Support staff (student
    // managers, trainers) are kept — the review page leaves non-"coach"
    // titles unchecked rather than guessing here.

    // Sidearm classic: <li class="sidearm-roster-coach">.
    function scrapeSidearmCoaches() {
        var rows = doc.querySelectorAll('.sidearm-roster-coach');
        var coaches = [];
        rows.forEach(function (row) {
            var name = text(row.querySelector('.sidearm-roster-coach-name'));
            if (name) {
                coaches.push({ name: name, title: text(row.querySelector('.sidearm-roster-coach-title')), pronunciation: '' });
            }
        });
        return coaches.length ? coaches : null;
    }

    // PrestoSports' current theme: headshot cards under .roster-coaches.
    // (The legacy theme only lists coaches on a separate /coaches page.)
    function scrapePrestoCoaches() {
        var cards = doc.querySelectorAll('.roster-coaches .card');
        var coaches = [];
        cards.forEach(function (card) {
            var name = text(card.querySelector('.card-title'));
            if (name) {
                coaches.push({ name: name, title: text(card.querySelector('.card-text')), pronunciation: '' });
            }
        });
        return coaches.length ? coaches : null;
    }

    // Fallback: on-site bio links under a /coaches/ path (Sidearm Nuxt,
    // others). Name is the link text, title is the rest of its card's text.
    // Off-site links (share buttons carry the page URL) and link text that
    // isn't a two-plus-word name ("Print", "Full Bio") are skipped.
    function scrapeCoachLinks() {
        var links = doc.querySelectorAll('a[href^="/"][href*="/coaches/"]');
        var seen = {};
        var coaches = [];
        Array.prototype.forEach.call(links, function (a) {
            var name = text(a).replace(/^full bio( for)?\s*/i, '');
            if (!/^[A-Z][^\s\d]*(\s+[^\s\d]+)+$/.test(name) || name.length > 60
                || /coach|staff|bio|index/i.test(name) || seen[name]) {
                return;
            }
            var card = a.closest('li, article, .card, [class*="card"], [class*="coach"]') || a.parentElement;
            var title = text(card).replace(name, '').split(/full bio|email|phone/i)[0].replace(/^[\s,–—-]+|[\s,–—-]+$/g, '');
            seen[name] = true;
            coaches.push({ name: name, title: title.length <= 60 ? title : '', pronunciation: '' });
        });
        return coaches.length ? coaches : null;
    }

    function scrapeCoaches() {
        return scrapeSidearmCoaches() || scrapePrestoCoaches() || scrapeCoachLinks() || [];
    }

    // Presto's coach-directory cards (legacy theme's separate coaches
    // page): <h5 class="card-title"> + the first <p class="card-text">.
    function scrapePrestoCoachDirectory() {
        var coaches = [];
        doc.querySelectorAll('.card').forEach(function (card) {
            var name = text(card.querySelector('.card-title'));
            if (name && name.length <= 60) {
                coaches.push({ name: name, title: text(card.querySelector('.card-text')), pronunciation: '' });
            }
        });
        return coaches.length ? coaches : null;
    }

    // When a roster page lists no coaches (legacy Presto), the URL of the
    // same sport's separate coaches page, or null.
    function coachesPageUrl(targetDoc, rosterUrl) {
        var sport = String(rosterUrl || '').match(/\/sports\/([^\/?#]+)\//);
        if (!sport) {
            return null;
        }
        var holder = targetDoc.querySelector('.roster-coaches[data-coaches-url]');
        var href = holder ? holder.getAttribute('data-coaches-url') : '';
        if (!href) {
            var links = targetDoc.querySelectorAll('a[href*="/sports/' + sport[1] + '/coaches"]');
            for (var i = 0; i < links.length && !href; i++) {
                if (/\/coaches(\/index)?\/?$/.test(links[i].getAttribute('href'))) {
                    href = links[i].getAttribute('href');
                }
            }
        }
        try {
            return href ? new URL(href, rosterUrl).href : null;
        } catch (e) {
            return null;
        }
    }

    // Coaches from a sport's separate coaches page.
    function coachesFromPage(targetDoc) {
        doc = targetDoc;
        return scrapeSidearmCoaches() || scrapePrestoCoaches() || scrapePrestoCoachDirectory()
            || scrapeCoachLinks() || [];
    }

    function grabRawText() {
        var candidates = ['[class*="roster"]', 'main', 'body'];
        for (var i = 0; i < candidates.length; i++) {
            var el = doc.querySelector(candidates[i]);
            if (el) {
                return text(el).slice(0, 20000);
            }
        }
        return '';
    }

    // Sites often ship the roster in more than one view at once (list +
    // card), so the same athlete can appear twice. Collapse by number+name,
    // backfilling blank fields from later copies.
    function dedupe(players) {
        var seen = {};
        var out = [];
        players.forEach(function (p) {
            var key = (p.number + '|' + p.name).toLowerCase();
            var prev = seen[key];
            if (!prev) {
                seen[key] = p;
                out.push(p);
                return;
            }
            ['position', 'year', 'hometown'].forEach(function (f) {
                if (!prev[f] && p[f]) {
                    prev[f] = p[f];
                }
            });
        });
        return out;
    }

    function run(targetDoc, sourceUrl) {
        doc = targetDoc || document;

        var adapters = [
            ['sidearm-classic', scrapeSidearmClassic],
            ['sidearm-cards', scrapeSidearmCards],
            ['player-cards', scrapePlayerCards],
            ['table', scrapeGenericTable]
        ];

        var players = null;
        var scrapedVia = 'rawtext';
        for (var i = 0; i < adapters.length; i++) {
            var result = adapters[i][1]();
            if (result) {
                players = dedupe(result);
                scrapedVia = adapters[i][0];
                break;
            }
        }

        return {
            sourceUrl: sourceUrl || window.location.href,
            scrapedVia: scrapedVia,
            players: players || [],
            coaches: scrapeCoaches(),
            rawText: players ? '' : grabRawText()
        };
    }

    return { run: run, coachesPageUrl: coachesPageUrl, coachesFromPage: coachesFromPage };
})();
