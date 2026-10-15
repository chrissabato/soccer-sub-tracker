# Soccer Sub Tracker

Queue soccer substitutions on a phone, execute them when play stops, and show
them live in the press box.

- **Sub entry** (phone): one official queues subs for both teams (player
  OUT → player IN, picked from the roster). When play stops they tap
  **Execute** on one sub or **Execute all**, then enter the match minute once
  (`67`, `45+2`). Pending subs can be edited or cancelled. Executed subs can
  be edited (players, minute).
- **Viewer** (press box): read-only and live. It shows the latest stoppage's
  subs highlighted (it flashes when a new one lands), pending subs per team,
  and the full log.
- **Games**: anyone can create one. Each gets an auto-generated **game code**
  that unlocks sub entry on any phone, and a separate **viewer link and QR
  code** that doesn't reveal the code. Everything is deleted 72 hours after
  the game is created.
- **Rosters**: Sidearm and PrestoSports roster pages are fetched by URL. The
  URL is guessed from the school's athletics site in
  [college-athletics-directory](https://github.com/chrissabato/college-athletics-directory),
  Sidearm first, then Presto. You can also paste a plain list. Team names
  autocomplete from the same directory, and any name is allowed.

## How it's built

- Static HTML, CSS and vanilla JS (ES modules, no build step) in `public/`,
  served by Apache.
- **Firebase (free Spark plan)**: Firestore stores the data and pushes live
  updates. Anonymous Auth gives each browser an identity. `firestore.rules`
  is the whole security model.
- **PHP** does only two jobs:
  - `public/api/fetch-roster.php` fetches roster pages, which browsers can't
    do because of CORS. The page is parsed in the browser by
    `public/js/scraper-core.js`, copied verbatim from
    [pa-script](https://github.com/chrissabato/pa-script) (MIT). Re-copy it
    to pick up scraper fixes.
  - `bin/cleanup.php` runs from cron and deletes expired games.

### Data and access

| Path | Read | Write |
| --- | --- | --- |
| `games/{id}`: teams, division, createdAt | anyone | editors (teams/division) |
| `games/{id}/rosters/{home,away}` | anyone | editors |
| `games/{id}/subs/{subId}` | anyone | editors |
| `games/{id}/secret/code` | editors | creator, at creation only |
| `games/{id}/editors/{uid}` | that user | anyone presenting the right code |
| `codes/{CODE}` → gameId | get only, no listing | at creation only |

Entering a game code writes `editors/{uid}`, which the rules accept only
when it matches `secret/code`. Clients can't read that doc, but the rules
can. After that, the browser's anonymous session keeps that phone unlocked.

Once a game is 72 hours old, anyone (even unauthenticated) may delete it and
everything under it. That's why the cleanup cron needs no credentials.

## Setup

### 1. Firebase project (free)

1. Create a project at <https://console.firebase.google.com>. Analytics isn't
   needed.
2. **Build → Firestore Database → Create database** (production mode, any
   region).
3. **Build → Authentication → Get started → Sign-in method → Anonymous →
   Enable**.
4. **Authentication → Settings → Authorized domains**: add your droplet's
   domain.
5. Deploy the rules, either by pasting `firestore.rules` into **Firestore →
   Rules** and publishing, or with:
   ```sh
   npx firebase-tools login
   npx firebase-tools deploy --only firestore:rules --project YOUR-PROJECT-ID
   ```
6. **Project settings → Your apps → Add app → Web**. Copy the config values
   into `public/js/config.js`:
   ```sh
   cp public/js/config.example.js public/js/config.js
   ```

### 2. Droplet (Apache + PHP 7.2+ with curl)

```sh
git clone <this repo> /var/www/soccer-sub-tracker
cd /var/www/soccer-sub-tracker
cp public/js/config.example.js public/js/config.js   # then fill it in
php bin/refresh-schools.php                          # writes data/schools.json
```

Point Apache at `public/`, either as a vhost's `DocumentRoot` or with an
`Alias /subs /var/www/soccer-sub-tracker/public`. `data/` and `bin/` must
stay outside the web root. All links are relative, so a subfolder works.

Add the cron jobs (`crontab -e` as a user that can write to `data/`):

```cron
# Delete games older than 72 hours
7 * * * *  FIREBASE_PROJECT_ID=your-project-id php /var/www/soccer-sub-tracker/bin/cleanup.php
# Refresh the school directory (roster-fetch allowlist)
23 4 * * * php /var/www/soccer-sub-tracker/bin/refresh-schools.php > /dev/null
```

### The roster proxy's limits

`api/fetch-roster.php` only fetches pages whose host is a school athletics
domain (or subdomain) from `data/schools.json`. It keeps pa-script's SSRF
guards (public IPs only, DNS pinned, redirects checked hop by hop, 8 MB / 20
s caps) and allows 30 fetches per IP per 10 minutes. Sites that block
servers with a bot check (e.g. an AWS WAF challenge) return a message
pointing to the paste-a-list option.

## Development

```sh
npm install
npm test             # pure logic + scraper against pa-script's saved roster pages
npm run test:rules   # security rules (needs Java and firebase-tools for the emulator)
```

To run the whole app locally against the Firebase emulators:

```sh
npx firebase-tools emulators:start --only firestore,auth --project demo-soccer-sub-tracker
# in public/js/config.js: projectId 'demo-soccer-sub-tracker', apiKey 'x', useEmulator = true
php bin/refresh-schools.php
php -S 127.0.0.1:8000 -t public
FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 FIREBASE_PROJECT_ID=demo-soccer-sub-tracker php bin/cleanup.php
```

| File | Purpose |
| --- | --- |
| `public/index.html`, `js/home.js` | Create a game / enter a code |
| `public/setup.html`, `js/setup.js` | Code, links and QR; teams; roster import and review |
| `public/entry.html`, `js/entry.js` | Phone sub entry |
| `public/view.html`, `js/view.js` | Press box viewer |
| `js/store.js` | Every Firestore read/write |
| `js/lib.js` | Pure helpers: codes, minutes, URL guessing, paste parsing |
| `js/gate.js` | Game code prompt for editor-only pages |
| `js/roster-import.js`, `js/scraper-core.js` | Proxy fetch + pa-script scraper |
| `js/schools.js` | School directory autocomplete |
