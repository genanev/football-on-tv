# Football on TV

A phone web app that lists what's on UK TV for **today and the next 7 days**, with **UK times** and the **UK TV channel**:

- **Football:** Premier League, Champions League, Europa League, Championship, televised League Cup and FA Cup ties
- **Motorsport:** Formula 1 and Formula 2 (qualifying, sprint and race)
- **Darts:** televised PDC events
- **Golf:** PGA Tour, DP World Tour and the majors
- **Snooker:** World Snooker Tour events on TV
- **Cricket:** men's internationals between the 12 top nations

You pick a sport with a 3D icon at the top, and every game shows its sport's icon beside the time. **My TV** is the home view: you choose which sports and competitions it shows (and can narrow it to one day). Inside a sport you can switch on several competitions at once, for example just the Premier League and the Champions League. Rugby, MotoGP and some one-off big events appear marked **SOON**: they are in the design but have no data connected yet. The design is described in `designA.md`.

It's a single web page hosted free on GitHub Pages. You can add it to a phone's home screen, where it opens full-screen like an app: <https://genanev.github.io/football-on-tv/>.

## Principles

- **Official sources only.** Fixtures come from each competition's own data. TV channels come from the broadcasters' own listings, never from fan sites.
- **No guessing.** A channel is shown only when a broadcaster's listing confirms it. Otherwise the app says "TV channel to be confirmed". The one rule-based line is "Not shown live on UK TV" for Saturday 3pm football (the UK blackout).
- **Each source fails on its own.** If one site can't be read, everything else still works, and the app shows a yellow banner saying what's affected.

## How it works

```
 every 30 min (Google Cloud, London)                         phone
┌───────────────────────────────────────────────┐        ┌───────────────┐
│ scripts/build.mjs                             │        │ index.html    │
│  ├─ fixtures:  PL, UEFA, EFL, FA, F1, F2,     │ writes │ (the whole    │
│  │             PDC, PGA Tour, DP World Tour,  │ ─────► │  app: reads   │
│  │             WST, ICC                       │ data.  │  data.json)   │
│  └─ channels:  Sky TV guide, Sky Sports,      │ json   └───────────────┘
│                TNT Sports, Prime Video, FA    │
└───────────────────────────────────────────────┘
```

1. **Update:** `scripts/build.mjs` fetches fixtures and TV listings from every source, matches each event to its channel, and writes **`data.json`**.
2. **Automation:** a Google Cloud job in London (`cloud/update.sh`, started every 30 minutes by Cloud Scheduler) runs the update from a UK address and saves `data.json` to GitHub. Prime Video's Champions League page needs the UK address. `cloud/SETUP.md` is the setup guide. GitHub's own Action (`.github/workflows/update.yml`) is now only a manual backup button.
3. **The app:** `index.html` is the whole app (HTML, CSS and JavaScript in one file). It reads `data.json` straight from GitHub, so a new update shows within minutes, and it reloads whenever you open it or switch back to it.

### Data sources

| | Source | Accessed by |
|---|---|---|
| **Fixtures** | Premier League (premierleague.com) | its data feed (API) |
| | Champions League, Europa League (uefa.com) | its data feed (API) |
| | Championship, League Cup (efl.com) | its data feed (API) |
| | FA Cup (thefa.com) | reading its fixtures page |
| | Formula 1 (formula1.com), Formula 2 (fiaformula2.com) | their data feeds (API) |
| | Darts (pdc.tv), Snooker (wst.tv) | their data feeds (API) |
| | Golf: PGA Tour (pgatour.com) | its data feed (API) |
| | Golf: DP World Tour (europeantour.com) | the schedule data inside its page |
| | Cricket (icc-cricket.com) | its data feed (API) |
| **TV channels** | Sky TV guide (every channel on Sky: Sky Sports, TNT, BBC, ITV, Channel 4/5) | its data feed (API), the main source |
| | Sky Sports' "on Sky" pages (incl. Sky Sports+ streams) | reading the pages |
| | TNT Sports' schedule (incl. HBO Max streams) | its data feed (API) |
| | Prime Video's Champions League page (Amazon's Tuesday pick) | reading the page, **from the UK only** |
| | The FA's fixtures page ("Live on BBC Sport") | reading the page |
| | Premier League broadcast feed | its data feed (API); answers for the requester's country |

None of these is a published, documented API. They are the data the sites' own pages use, which is fine for a personal app. A commercial version would licence fixtures and TV-listings data instead; each source is a separate module under `scripts/sources/`, so swapping one is a like-for-like change.

## Files

| Path | What it is |
|---|---|
| `index.html` | The app |
| `data.json` | The latest fixtures and channels (rewritten by every update; don't edit by hand) |
| `demo-data.json`, `demo-data-2.json`, `preview-data.json` | Recorded weeks for the demo views (see below) |
| `manifest.webmanifest`, `icon-*.png`, `apple-touch-icon.png` | What makes it installable on a phone |
| `sport-icons/` | The 3D sport icons (SVG) used in the top row and on every game |
| `scripts/build.mjs` | The update: runs every source and writes `data.json` |
| `scripts/sources/*.mjs` | One module per source (fixtures and TV listings) |
| `scripts/lib/util.mjs` | Shared helpers (UK time, fetching) |
| `test/*.mjs`, `test/fixtures/` | Offline tests and the real data they replay |
| `.github/workflows/update.yml` | Manual backup update (the "Run workflow" button on the Actions tab; no schedule) |
| `cloud/update.sh`, `cloud/SETUP.md` | The regular update that runs on Google Cloud in London, and the guide to set it up |
| `.github/workflows/check.yml` | Runs the tests and a live check on every branch except `main` |
| `designA.md` | How the app's navigation works (sports, competition chips, My TV, day picker) |
| `playStorePlan.md` | The plan (with tick boxes) for turning this into a paid Google Play app |
| `CLAUDE.md` | Detailed notes, rules and conventions for Claude Code |

## Running it

You need **Node.js 24**. There are no packages to install.

| To… | Run (in this folder) |
|---|---|
| Run an update now (writes `data.json`) | `node scripts/build.mjs` |
| Run an update into another file | `node scripts/build.mjs some-file.json` |
| Run all the tests | `node test/run-test.mjs`, `node test/run-sports-test.mjs`, `node test/run-golf-snooker-cricket-test.mjs`, `node test/run-more-football-test.mjs` |
| Look at the app on your computer | start a local web server in this folder and open it in a browser: e.g. `npx serve` (then `http://localhost:3000/`), or the `app` preview in `.claude/launch.json` (`http://localhost:8123/`) |
| See the recorded demo weeks | add `?demo` (F1, F2, darts), `?demo=2` (golf, snooker, cricket) or `?demo=3` (the week of 17 Oct 2026 plus made-up rugby, MotoGP and special-event games marked SAMPLE) to the address |

The update prints a short report of every source, and the same report is stored in `data.json` under `report`.

### Where the update runs

The regular update runs on Google Cloud in London: a Cloud Run job started every 30 minutes by Cloud Scheduler. From a UK address, Prime Video shows Amazon's Champions League pick and the Premier League's broadcaster feed answers for the UK. `cloud/SETUP.md` explains how it was set up, how to change how often it runs, how to pause it and how to renew its GitHub key (the key expires after a year, around 18 Oct 2027).

The "Run workflow" button on GitHub's Actions tab still works as a manual backup. It runs from GitHub's US servers, so Prime Video's UK page isn't available to it; Amazon picks already found are kept.

## Working on it

- **Branches:** new work goes on a branch. Pushing it runs the tests and a live check on GitHub (`check.yml`). Changes reach the live app only when the branch is merged into `main`, because GitHub Pages publishes `main`.
- **Tests:** they replay real data captured from each source, so they run offline. Run all four after any change to `scripts/`.
- **Running an update by hand on GitHub:** **Actions** tab → **Update fixtures** → **Run workflow**. That button always uses the latest version. "Re-run" on an old run repeats that old run; since 17 Oct 2026 it also uses the latest version, but "Run workflow" is the right button.

## If something looks wrong

- **A yellow banner** means a source couldn't be read on the last update. Everything else still works, and channels already confirmed are kept.
- **Finding out what happened:** in Google Cloud, open Cloud Run → **Jobs** → `football-update` → **Executions** → a run → **Logs**; it prints the report for each source. The same report is saved in `data.json` under `report`.
- **A channel says "TV channel to be confirmed"** when no broadcaster's listing has confirmed it yet. Broadcasters publish their picks a few days ahead.
- **Updates stopped:** the newest "Update fixtures" commit on GitHub should be under about 40 minutes old. If not, check in Google Cloud that the Cloud Scheduler job `football-update-trigger` is enabled and that the latest job execution didn't fail with a GitHub permission error (the key expires after a year; see `cloud/SETUP.md`).

## One-off setup (for a new copy)

1. Create a **public** GitHub repository and upload this folder, including `.github`.
2. **Settings → Pages:** deploy from branch `main`, folder `/ (root)`.
3. **First data:** **Actions** → enable workflows → open **Update fixtures** and click **Run workflow**. That fills `data.json` once, from GitHub's US servers. For regular updates from a UK address, set up the Google Cloud job with `cloud/SETUP.md`.
4. On a phone, open `https://<username>.github.io/<repository>/` in Chrome, then **⋮ → Add to home screen**.
