# Caffiend

*Caffeine + fiend.* Internal names (folder, Worker `kyle-energy-api`, database `kyle-energy`) stay as they
were so nothing has to be recreated.

A tiny PWA for logging energy drinks: grouped by brand, then flavor, rated 0.0 to 10.0.
Vanilla HTML/CSS/JS ES modules, no build step. The site is on GitHub Pages; ratings live in a free
Cloudflare Worker + D1 (SQLite) database, which also sends native push notifications.

## How it fits together

```
 Phone (installed PWA, GitHub Pages)
   │  GET  /api/ratings          ─┐
   │  POST /api/ratings  (PIN)    ├─▶ Cloudflare Worker ──▶ D1 database (ratings, push_subs)
   │  PUT  /api/ratings/:id (PIN) │          │
   │  POST /api/push/subscribe   ─┘          └──▶ Web Push to every other subscribed phone
   ▲                                                  (Apple / Google / Mozilla push services)
   └── service worker shows the notification; tapping it opens the Lineup
```

- Saves are instant: no GitHub commit, no Pages delay. The app keeps the last list in localStorage so it
  still opens offline.
- The database enforces "no duplicates" with a UNIQUE index on the normalized brand + flavor.
- Scores are stored as whole tenths (8.6 → 86), so there is no floating-point drift.
- Push is standard Web Push (VAPID + aes128gcm), done with Web Crypto inside the Worker. No dependencies,
  no third-party push account.

## Files

```
index.html          three tabs (Lineup, Rate, Pick), top-bar bell
styles.css          all styling
manifest.json       PWA install metadata
sw.js               cache-first shell, push display, notification click
data.json           SAMPLE data, used only in preview mode
icons/              icon.svg + 192/512 PNGs
js/
  app.js            entry: registers sw, wires pages, loads data
  config.js         API_BASE (Worker URL), VAPID_PUBLIC_KEY
  state.js          the only state writer (ratings, edit mode, push status)
  api.js            Worker API calls
  push.js           browser push permission / subscribe / unsubscribe
  derive.js         the only place averages, grouping, sorting, score cleanup happen
  dom.js, format.js, nav.js
  pages/lineup.js   list by brand (search, sort, Edit)
  pages/rate.js     add / edit form, duplicate checks
  pages/pick.js     slot-machine random picker
  pages/alerts.js   bell, Lineup banner, Settings notification controls
worker/
  src/index.js      the API + web push sender
  schema.sql        D1 tables
  wrangler.toml     Worker config (no secrets)
  gen-vapid.mjs     makes the push key pair
```

## Preview mode

With `API_BASE` empty in `js/config.js`, the app reads `data.json` and saves only on that device. Good for
trying the UI before the backend exists. Notifications are hidden in preview mode.

## Setup (about 15 minutes, needs Node 18+ on your computer)

1. **Repo + Pages.** Create a public repo, push everything, enable Pages on the default branch, root.
2. **Cloudflare account.** Free plan, no card. Then in the `worker/` folder:
   ```
   npx wrangler login
   npx wrangler d1 create kyle-energy           # copy the database_id into wrangler.toml
   npx wrangler d1 execute kyle-energy --remote --file=schema.sql
   ```
3. **Push keys.** `node gen-vapid.mjs` prints a public and a private key.
4. **Secrets** (typed into the terminal prompt, never into a file):
   ```
   npx wrangler secret put CREW_PIN
   npx wrangler secret put VAPID_PUBLIC_KEY
   npx wrangler secret put VAPID_PRIVATE_KEY
   ```
5. **Allowed site.** In `wrangler.toml`, set `ALLOWED_ORIGINS` to your Pages **origin only**, e.g.
   `"https://<user>.github.io"`. No repo path: `https://<user>.github.io/kyle-energy/` won't match
   (a trailing slash alone is fine). Optionally set `VAPID_SUBJECT` to a `mailto:` address of yours.
6. **Deploy.** `npx wrangler deploy` prints the Worker URL.
7. **Point the app at it.** In `js/config.js` set `API_BASE` to that URL and `VAPID_PUBLIC_KEY` to the
   public key, bump `VERSION` in `sw.js`, and push.
8. **Enter the PIN on each phone.** Rate tab → scroll to the bottom → *Settings & notifications* →
   *Crew PIN*. Use the value you gave `CREW_PIN`. It's remembered on that phone. If you try to save
   without it, the app opens that box for you.
9. **Turn on alerts on each phone.**
   - iPhone (iOS 16.4+): open the site in Safari, Share → *Add to Home Screen*, open it from the Home
     Screen, then tap the bell or *Turn on*. Web push on iPhone only works from the Home Screen app.
   - Android: open in Chrome, tap the bell or *Turn on* (installing is optional but nicer).
   - Settings → *Send a test* confirms that phone receives notifications.

## Rules the code follows

- No duplicates: brand and flavor match ignoring case and extra spaces. Typing "ghost" files under the
  existing "Ghost"; a flavor that already exists is blocked with an "Edit that one" link. The Worker and
  the database enforce the same rule, so two phones saving at once can't create a duplicate.
- Every rated flavor has an Edit button (brand, flavor, score, note). Editing keeps the original date.
- Scores are clamped to 0–10 and rounded to one decimal in the form and again in the Worker.
- The phone that saves a rating doesn't notify itself; everyone else subscribed gets
  "New rating: Ghost / Swedish Fish scored 8.6/10". Edits send "Rating updated".
- Phones that uninstall or turn off notifications are removed automatically (push service answers 404/410).
- Bump `VERSION` in `sw.js` whenever you change front-end files so installed apps pick it up.

## Settings, likes and caffeine

- **Settings** (your name, crew PIN, notifications) open from the bell button in the top right.
- **Crew PIN** can be letters and/or numbers and is case-sensitive. To change it:
  `cd worker && npx wrangler secret put CREW_PIN`, type the new PIN, then enter it on each phone in Settings.
  No redeploy needed.
- **Likes**: each person types their name once in Settings. Tapping ♥ on a flavor likes it as that name;
  the Lineup shows who liked what, and the picker's *♥ My likes* chip spins only your likes. No PIN is
  needed to like. There are no accounts, so anyone with the app can type any name; fine for a group of friends.
- **Caffeine**: optional mg per can on the Rate form. Picking a brand prefills its most common logged value.
  Brand cards show the typical value, or the range when flavors differ ("200–300 mg"). Computed in `derive.js`.

### Upgrading an existing database (one time)

```
cd worker
npx wrangler d1 execute kyle-energy --remote --file=migrations/0002_caffeine_and_likes.sql
npx wrangler deploy
```

The migration only adds a `caffeine_mg` column and a `likes` table; every rating stays. Running it twice
just fails with "duplicate column name" and changes nothing.
