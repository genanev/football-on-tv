# Football on TV – project notes for Claude

A personal phone web app for George: Premier League (PL) and Champions League (UCL) games for **today + the next 7 days**, with **UK kick-off times** and the **UK TV channel**. It's hosted on GitHub Pages and added to his phone's home screen. Keep the app simple; George is not a developer, so explain any steps he has to do on GitHub in plain language.

## How it works

- `scripts/build.mjs` (Node 24, no dependencies) fetches the data and writes `data.json`.
- `.github/workflows/update.yml` runs it every hour (GitHub often starts these late or skips some) (and on demand from the Actions tab), then commits `data.json`. Each run commits because `generatedAt` changes, which also stops GitHub pausing the schedule for inactivity.
- `index.html` is the whole app (inline CSS/JS). On `*.github.io` it reads `data.json` from `raw.githubusercontent.com/<user>/<repo>/main/` so updates show within minutes, and falls back to the local `data.json`.
- `test/run-test.mjs` is an offline test that replays real response shapes captured on 8 Oct 2026: `node test/run-test.mjs`. Run it after any change to `build.mjs`. `--write-sample` rewrites `data.json` from the fixtures (don't commit that over live data).

## Data sources (all unofficial, undocumented endpoints)

| What | Source |
|---|---|
| PL fixtures | `sdp-prem-prod.premier-league-prod.pulselive.com/api/v2/matches?competition=8&season=<YYYY>&matchweek=<n>`; current matchweek from `resources.premierleague.com/premierleague25/config/current-gameweek.json`. `kickoff` is UK local time, labelled by `kickoffTimezone` (BST/GMT). |
| PL broadcaster | `api.premierleague.com/broadcasting/match-events?sportDataId=<ids>`. Answers for the **requester's country by IP** (no query parameter overrides it). GitHub runners are in the US, so it returns NBC/Peacock etc.; `isUkChannel()` keeps only channels whose `restrictedCountries` include `GB`. In practice it adds nothing when run on GitHub. |
| UCL fixtures | `match.uefa.com/v5/matches?competitionId=1&fromDate=&toDate=` (kick-off times in real UTC). UEFA doesn't publish UK channels. |
| Exact UK channels (both comps) | live-footballontv.com: `/live-premier-league-football-on-tv.html` and `/live-champions-league-football-on-tv.html`. Server-rendered HTML: `.fixture-date` headers followed by `.fixture` blocks (`.fixture__time`, `.fixture__teams` "Home v Away", `.channel-pill`). It shows "Sky Sports TBC" before picks are announced. |

Listings are matched to official fixtures by UK date plus fuzzy team names (`normTeam`/`teamSim` and an `ALIASES` map: e.g. Atleti → Atlético Madrid, Paris → PSG). If a new team fails to match, add an alias. For UCL the UK listing names are shown instead of UEFA's short names.

Rules: a Saturday 15:00 PL game with no channel gets "Not shown live on UK TV". Otherwise, a game with no channel shows "TV channel to be confirmed". UK rights for 2026/27: PL is on Sky Sports and TNT Sports. UCL is on TNT Sports, plus Amazon Prime Video for one Tuesday pick; Paramount+ takes over from 2027/28. Each source can fail independently; the app shows a yellow banner when it does.

## UI decisions George has made (keep these)

- Tabs: **All** (narrower) · **Premier League** · **Champions League**, full names.
- Every day of the 8-day window is listed. An empty day says "No scheduled PL / UCL games" (or "No scheduled PL games" / "No scheduled UCL games" when filtered).
- Day/date headings are 16px, uppercase.
- Channel pills: TNT magenta, Amazon blue, **Sky Sports orange** (`#d35400`, not red). White text in light mode; dark text on lighter pills in dark mode.
- Theme toggle shows **Light / Dark only** (no Auto). The first visit follows the phone's setting; after that the choice is saved in localStorage.
- No refresh button: the app reloads data on open and when you switch back to it.
- Footer: only the two "Fixtures from… / Channels from…" sentences.
- All times are shown in Europe/London time.
