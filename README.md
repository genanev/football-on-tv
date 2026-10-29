# Football on TV

A phone web app that lists what's on UK TV for **today and the next 7 days**, with **UK times** and the **UK TV channel**:

- **Football:** Premier League, Champions League, Europa League, Championship, Scottish Premiership, and televised Conference League, Women's Super League, League Cup and FA Cup games
- **Motorsport:** Formula 1, Formula 2, Formula 3 and MotoGP (qualifying, sprint and race)
- **Darts:** televised PDC events
- **Golf:** PGA Tour, DP World Tour and the majors
- **Snooker:** World Snooker Tour events on TV
- **Cricket:** men's internationals between the 12 top nations
- **Rugby:** Premiership, Champions Cup, Nations Championship and Six Nations (Super League to follow)
- **Tennis:** the four Grand Slams, the ATP Finals and the WTA Finals, one entry per day on UK TV
- **Alpine skiing:** every World Cup and World Championships race, one entry per run
- **Specials:** real one-off or yearly events, so far the European Curling Championships (televised games)

You pick a sport with a 3D icon at the top, and every game shows its sport's icon beside the time. **My TV** is the home view: you choose which sports and competitions it shows (and can narrow it to one day). Inside a sport you can switch on several competitions at once, for example just the Premier League and the Champions League. Rugby's Super League appears marked **SOON**: it's in the design but has no data connected yet. Specials lists each event as its own choice. The design is described in `designA.md`.

It's a single web page hosted free on GitHub Pages. You can add it to a phone's home screen, where it opens full-screen like an app: <https://genanev.github.io/football-on-tv/>.

The plan is to turn it into a paid app called **Telly Fixtures** on Google Play: see `playStorePlan.md`.

## Status (29 Oct 2026)

- **Live:** every sport above, updated every 30 minutes from Google Cloud in London. Football comes from API-Football, checked once a day against the official Premier League, UEFA and EFL feeds, which win if they disagree. A football game with no UK channel 48 hours before kick-off says "Not shown live on UK TV".
- **Still to connect:** rugby league's Super League (its 2027 fixtures aren't out yet), and more Specials, one real event at a time.
- **Design:** Design A (see `designA.md`). A card style with one rounded box per event was mocked up (branch `mockup-cards`, not merged); the current design stays for now.
- **Paid app:** the name (Telly Fixtures), app ID and domains are done; a personal Google Play developer account is decided but not opened yet. Data rights: the 12 permission emails went out with no replies so far, and the project goes ahead without waiting. Next steps are in `playStorePlan.md` (Phase 0 pricing and public details, then Phase 1: support email, moving `data.json` to the own domain, privacy policy and terms).

## Principles

- **Proper sources only.** Football fixtures and scores come from API-Football, a paid football data service; every other sport's fixtures come from the competition's own data. TV channels come from the broadcasters' own listings, never from fan sites.
- **No guessing.** A channel is shown only when a broadcaster's listing confirms it. Otherwise the app says "TV channel to be confirmed". The rule-based line is "Not shown live on UK TV": for Saturday 3pm football (the UK blackout), and for any football game with no channel listed 48 hours before kick-off (broadcasters announce their picks earlier than that), so people can plan.
- **Each source fails on its own.** If one site can't be read, everything else still works, and the app shows a yellow banner saying what's affected.

## How it works

```
 every 30 min (Google Cloud, London)                         phone
┌───────────────────────────────────────────────┐        ┌───────────────┐
│ scripts/build.mjs                             │        │ index.html    │
│  ├─ fixtures:  API-Football (all football),   │ writes │ (the whole    │
│  │             F1, F2, F3, MotoGP, PDC,       │ ─────► │  app: reads   │
│  │             PGA Tour, DP World Tour, WST,  │ data.  │  data.json)   │
│  │             ICC, World Rugby, WTA,         │ json   └───────────────┘
│  │             ATP Finals site, FIS (skiing), │
│  │             World Curling                  │
│  └─ channels:  Sky TV guide, Sky Sports,      │
│                TNT Sports, Prime Video,       │
│                Premier Sports, FA, PL         │
└───────────────────────────────────────────────┘
```

1. **Update:** `scripts/build.mjs` fetches fixtures and TV listings from every source, matches each event to its channel, and writes **`data.json`**.
2. **Automation:** a Google Cloud job in London (`cloud/update.sh`, started every 30 minutes by Cloud Scheduler) runs the update from a UK address and saves `data.json` to GitHub. Prime Video's and Premier Sports' pages need the UK address, and the job holds the API-Football key. `cloud/SETUP.md` is the setup guide. GitHub's own Action (`.github/workflows/update.yml`) is now only a manual backup button.
3. **The app:** `index.html` is the whole app (HTML, CSS and JavaScript in one file). It reads `data.json` straight from GitHub, so a new update shows within minutes, and it reloads whenever you open it or switch back to it.

### Data sources

| | Source | Accessed by |
|---|---|---|
| **Fixtures** | All football (Premier League, Champions League, Europa League, Conference League, Championship, Scottish Premiership, WSL, FA Cup, League Cup): API-Football | a paid, documented data service (Pro plan, about $19 a month) |
| | Check and backup for football: the Premier League, UEFA, EFL and FA feeds | their data feeds and pages; read once a day to check API-Football (they win if the two disagree, e.g. a moved game), and used in full if API-Football is switched off |
| | Formula 1 (formula1.com), Formula 2 (fiaformula2.com), Formula 3 (fiaformula3.com) | their data feeds (API) |
| | MotoGP (motogp.com) | its data feed (API) |
| | Darts (pdc.tv), Snooker (wst.tv) | their data feeds (API) |
| | Golf: PGA Tour (pgatour.com) | its data feed (API) |
| | Golf: DP World Tour (europeantour.com) | the schedule data inside its page |
| | Cricket (icc-cricket.com) | its data feed (API) |
| | Tennis dates (wtatennis.com; the ATP Finals from nittoatpfinals.com) | the WTA's data feed (API); reading the ATP Finals' page |
| | Alpine skiing (fis-ski.com) | its calendar feed (iCal) |
| | Curling championships (worldcurling.org) | its event pages' data feed |
| | Rugby union (world.rugby) | World Rugby's data feed (API) |
| **TV channels** | Sky TV guide (every channel on Sky: Sky Sports, TNT, BBC, ITV, Channel 4/5) | its data feed (API), the main source |
| | Sky Sports' "on Sky" pages (incl. Sky Sports+ streams) | reading the pages |
| | TNT Sports' schedule (incl. HBO Max streams) | its data feed (API) |
| | Prime Video's Champions League page (Amazon's Tuesday pick) | reading the page, **from the UK only** |
| | Premier Sports' fixtures page (streaming only; Scottish Premiership games) | reading the page |
| | The FA's fixtures page ("Live on BBC Sport") | reading the page |
| | Premier League broadcast feed | its data feed (API); answers for the requester's country |

Apart from API-Football, none of these is a published, documented API. They are the data the sites' own pages use. For the paid app, permission was asked from the 12 main organisations in October 2026; none has replied, and the project goes ahead without waiting, dealing with any objection if it comes (see `playStorePlan.md`, Phase 0). Each source is a separate module under `scripts/sources/`, so switching one off or swapping it is a like-for-like change.

## Files

| Path | What it is |
|---|---|
| `index.html` | The app |
| `data.json` | The latest fixtures and channels (rewritten by every update; don't edit by hand) |
| `demo-data.json`, `demo-data-2.json`, `preview-data.json` | Recorded weeks for the demo views (see below) |
| `manifest.webmanifest`, `icon-*.png`, `apple-touch-icon.png` | What makes it installable on a phone |
| `sport-icons/` | The 3D sport icons (SVG) used in the top row and on every game |
| `scripts/build.mjs` | The update: runs every source and writes `data.json` |
| `scripts/sources/*.mjs` | One module per source (fixtures and TV listings); `teamNames.mjs` has the full club names |
| `scripts/compare-api-football.mjs` | Compares API-Football's fixtures with the official feeds for a week |
| `.env` | The API-Football key, on your PC only (never uploaded to GitHub) |
| `business/` | Permission emails and research for the paid app, on your PC only (not in GitHub while the repository is public) |
| `scripts/lib/util.mjs` | Shared helpers (UK time, fetching) |
| `test/*.mjs`, `test/fixtures/` | Offline tests and the real data they replay |
| `.github/workflows/update.yml` | Manual backup update (the "Run workflow" button on the Actions tab; no schedule) |
| `cloud/update.sh`, `cloud/SETUP.md` | The regular update that runs on Google Cloud in London, and the guide to set it up |
| `.github/workflows/check.yml` | Runs the tests and a live check on every branch except `main` |
| `designA.md` | How the app's navigation works (sports, competition chips, My TV, day picker) |
| `playStorePlan.md` | The plan (with tick boxes) for turning this into a paid app: Google Play first, the App Store later |
| `CLAUDE.md` | Detailed notes, rules and conventions for Claude Code |

## Running it

You need **Node.js 24**. There are no packages to install.

| To… | Run (in this folder) |
|---|---|
| Run an update now (writes `data.json`) | `node --env-file=.env scripts/build.mjs` (without `--env-file=.env`, football comes from the backup feeds) |
| Run an update into another file | `node scripts/build.mjs some-file.json` |
| Run all the tests | `node test/run-test.mjs`, `node test/run-sports-test.mjs`, `node test/run-golf-snooker-cricket-test.mjs`, `node test/run-more-football-test.mjs`, `node test/run-api-football-test.mjs` |
| Look at the app on your computer | start a local web server in this folder and open it in a browser: e.g. `npx serve` (then `http://localhost:3000/`), or the `app` preview in `.claude/launch.json` (`http://localhost:8123/`) |
| See the recorded demo weeks | add `?demo` (F1, F2, darts), `?demo=2` (golf, snooker, cricket) or `?demo=3` (the week of 17 Oct 2026 plus made-up rugby, MotoGP and special-event games marked SAMPLE) to the address |

The update prints a short report of every source, and the same report is stored in `data.json` under `report`.

### Where the update runs

The regular update runs on Google Cloud in London: a Cloud Run job started every 30 minutes by Cloud Scheduler. From a UK address, Prime Video shows Amazon's Champions League pick, Premier Sports shows its UK listings, and the Premier League's broadcaster feed answers for the UK. `cloud/SETUP.md` explains how it was set up, how to change how often it runs, how to pause it, how to renew its GitHub key (the key expires after a year, around 18 Oct 2027), and how to switch football back to the backup feeds or turn scores off.

The "Run workflow" button on GitHub's Actions tab still works as a manual backup. It runs from GitHub's US servers without the API-Football key, so it uses the backup football feeds (the Conference League, WSL and Scottish Premiership are missing until the next London run), and Prime Video's and Premier Sports' UK pages aren't available to it; channels already found are kept.

## Working on it

- **Branches:** new work goes on a branch. Pushing it runs the tests and a live check on GitHub (`check.yml`). Changes reach the live app only when the branch is merged into `main`, because GitHub Pages publishes `main`.
- **Tests:** they replay real data captured from each source, so they run offline. Run all five after any change to `scripts/`.
- **Running an update by hand on GitHub:** **Actions** tab → **Update fixtures** → **Run workflow**. That button always uses the latest version. "Re-run" on an old run repeats that old run; since 17 Oct 2026 it also uses the latest version, but "Run workflow" is the right button.

## If something looks wrong

- **A yellow banner** means a source couldn't be read on the last update. Everything else still works, and channels already confirmed are kept.
- **Finding out what happened:** in Google Cloud, open Cloud Run → **Jobs** → `football-update` → **Executions** → a run → **Logs**; it prints the report for each source. The same report is saved in `data.json` under `report`.
- **A channel says "TV channel to be confirmed"** when no broadcaster's listing has confirmed it yet. Broadcasters publish their picks a few days ahead.
- **Football looks wrong** (wrong times, missing games): the report's `apiFootball` entry says whether API-Football answered, and `goldenCheck` says when the official feeds last checked it and which games they corrected (`changed`). `scripts/compare-api-football.mjs` compares it with the official feeds, and `cloud/SETUP.md` explains how to switch back to them.
- **Updates stopped:** the newest "Update fixtures" commit on GitHub should be under about 40 minutes old. If not, check in Google Cloud that the Cloud Scheduler job `football-update-trigger` is enabled and that the latest job execution didn't fail with a GitHub permission error (the key expires after a year; see `cloud/SETUP.md`).

## One-off setup (for a new copy)

1. Create a **public** GitHub repository and upload this folder, including `.github`.
2. **Settings → Pages:** deploy from branch `main`, folder `/ (root)`.
3. **First data:** **Actions** → enable workflows → open **Update fixtures** and click **Run workflow**. That fills `data.json` once, from GitHub's US servers. For regular updates from a UK address, set up the Google Cloud job with `cloud/SETUP.md`, including the API-Football key ("Switching football to API-Football").
4. On a phone, open `https://<username>.github.io/<repository>/` in Chrome, then **⋮ → Add to home screen**.
