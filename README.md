# Football on TV

A phone web app that lists what's on UK TV for **today and the next 7 days**, with **UK times** and the **UK TV channel**:

- **Football:** Premier League, Champions League, Europa League, Championship, televised League Cup and FA Cup ties
- **Motorsport:** Formula 1 and Formula 2 (qualifying, sprint and race)
- **Darts:** televised PDC events
- **Golf:** PGA Tour, DP World Tour and the majors
- **Snooker:** World Snooker Tour events on TV
- **Cricket:** men's internationals between the 12 top nations

It's a single web page hosted free on GitHub Pages. You can add it to a phone's home screen, where it opens full-screen like an app: <https://genanev.github.io/football-on-tv/>.

## Principles

- **Official sources only.** Fixtures come from each competition's own data. TV channels come from the broadcasters' own listings, never from fan sites.
- **No guessing.** A channel is shown only when a broadcaster's listing confirms it. Otherwise the app says "TV channel to be confirmed". The one rule-based line is "Not shown live on UK TV" for Saturday 3pm football (the UK blackout).
- **Each source fails on its own.** If one site can't be read, everything else still works, and the app shows a yellow banner saying what's affected.

## How it works

```
 hourly (GitHub Actions)                                     phone
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
2. **Automation:** a GitHub Action (`.github/workflows/update.yml`) runs the update every hour and commits `data.json`. GitHub often starts these runs late or skips some.
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
| `demo-data.json`, `demo-data-2.json` | Recorded weeks for the demo views (see below) |
| `manifest.webmanifest`, `icon-*.png`, `apple-touch-icon.png` | What makes it installable on a phone |
| `scripts/build.mjs` | The update: runs every source and writes `data.json` |
| `scripts/sources/*.mjs` | One module per source (fixtures and TV listings) |
| `scripts/lib/util.mjs` | Shared helpers (UK time, fetching) |
| `test/*.mjs`, `test/fixtures/` | Offline tests and the real data they replay |
| `.github/workflows/update.yml` | Hourly update |
| `.github/workflows/check.yml` | Runs the tests and a live check on every branch except `main` |
| `CLAUDE.md` | Detailed notes, rules and conventions for Claude Code |

## Running it

You need **Node.js 24**. There are no packages to install.

| To… | Run (in this folder) |
|---|---|
| Run an update now (writes `data.json`) | `node scripts/build.mjs` |
| Run an update into another file | `node scripts/build.mjs some-file.json` |
| Run all the tests | `node test/run-test.mjs`, `node test/run-sports-test.mjs`, `node test/run-golf-snooker-cricket-test.mjs`, `node test/run-more-football-test.mjs` |
| Look at the app on your computer | start a local web server in this folder and open it in a browser: e.g. `npx serve` (then `http://localhost:3000/`), or the `app` preview in `.claude/launch.json` (`http://localhost:8123/`) |
| See the recorded demo weeks | add `?demo` (F1, F2, darts) or `?demo=2` (golf, snooker, cricket) to the address |

The update prints a short report of every source, and the same report is stored in `data.json` under `report`.

### Updating from the UK (Amazon stopgap)

Prime Video only shows the UK Champions League page to UK visitors, and the hourly updates run on GitHub's US servers. So until the updates move to a UK server, run one update from a UK computer each week before Tuesday's Champions League games. In this folder:

```
node scripts/build.mjs
git add data.json
git commit -m "Update fixtures"
git pull --rebase
git push
```

Later updates keep Amazon's pick until the end of the match day.

## Working on it

- **Branches:** new work goes on a branch. Pushing it runs the tests and a live check on GitHub (`check.yml`). Changes reach the live app only when the branch is merged into `main`, because GitHub Pages publishes `main`.
- **Tests:** they replay real data captured from each source, so they run offline. Run all four after any change to `scripts/`.
- **Running an update by hand on GitHub:** **Actions** tab → **Update fixtures** → **Run workflow**. That button always uses the latest version. "Re-run" on an old run repeats that old run; since 17 Oct 2026 it also uses the latest version, but "Run workflow" is the right button.

## If something looks wrong

- **A yellow banner** means a source couldn't be read on the last update. Everything else still works, and channels already confirmed are kept.
- **Finding out what happened:** open the latest run on the **Actions** tab and expand **Fetch fixtures and TV channels**. It prints the report for each source.
- **A channel says "TV channel to be confirmed"** when no broadcaster's listing has confirmed it yet. Broadcasters publish their picks a few days ahead.
- **Paused updates:** GitHub pauses scheduled actions after 60 days without activity. Each update commits, so this shouldn't happen. If it does, re-enable it from the Actions tab.

## One-off setup (for a new copy)

1. Create a **public** GitHub repository and upload this folder, including `.github`.
2. **Settings → Pages:** deploy from branch `main`, folder `/ (root)`.
3. **Actions:** enable workflows, open **Update fixtures** and click **Run workflow**.
4. On a phone, open `https://<username>.github.io/<repository>/` in Chrome, then **⋮ → Add to home screen**.
