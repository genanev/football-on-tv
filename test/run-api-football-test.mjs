// Offline test for API-Football (scripts/sources/apiFootball.mjs).
//
// Replays real data captured on 19 Oct 2026 for a past week, because the free plan only serves
// seasons 2022-2024:
//   fixtures/apifootball-fixtures-2024-10-22.json   /fixtures for 22-30 Oct 2024, keyed by league id
//     (39 PL, 40 Championship, 2 UCL, 3 UEL, 45 FA Cup, 48 League Cup; only the fields we use kept)
//   That week has Champions and Europa League matchday 3, PL matchweek 9 (across the clocks going
//   back on 27 Oct) and League Cup round of 16 (one tie decided on penalties).
//   fixtures/apifootball-fixtures-2026-10-19.json   /fixtures for 19-27 Oct 2026 (Pro plan, evening
//     of 19 Oct), the same plus 848 Conference League and 44 WSL (added for the new app). The clocks
//     go back on Sunday 25 Oct.
//
//   node test/run-api-football-test.mjs

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ukHHMM, ukToUtc, ukDate } from '../scripts/lib/util.mjs';
import { build } from '../scripts/build.mjs';
import { unknownClubs } from '../scripts/sources/teamNames.mjs';
import { mapAfFixture, afErrors, afSeason, fetchApiFootball, AF_LEAGUES } from '../scripts/sources/apiFootball.mjs';

const fx = async (name) => JSON.parse(await readFile(new URL(`fixtures/${name}`, import.meta.url), 'utf8'));
const WEEKS = { 2024: await fx('apifootball-fixtures-2024-10-22.json'), 2026: await fx('apifootball-fixtures-2026-10-19.json') };

// ---------- the other sources the build reads (for the build checks at the end)
// Sky TV guide entries, hand-written in Sky's format (UK local times; the guide has no past days)
const MAIN = 4002;
let eid = 0;
const prog = (sid, date, hhmm, mins, t) => {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = hhmm.split(':').map(Number);
  return { sid, ev: { st: ukToUtc(y, m, d, hh, mm) / 1000, d: mins * 60, eid: `E${(++eid).toString(16)}`, t, sy: '', eg: 7, esg: 11, s: true, hd: true, new: false } };
};
const GUIDE = [
  prog(MAIN, '2026-10-24', '17:00', 180, 'Live PL: Chelsea v Tottenham'),
  prog(MAIN, '2026-10-27', '19:30', 180, 'Live Carabao Cup: Fleetwood v Arsenal'),
];
const skyDay = (url) => {
  const [, ymd, sids] = /schedule\/(\d{8})\/([\d,]+)/.exec(url);
  const date = `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6)}`;
  const schedule = sids.split(',').map(Number).map(sid => ({ sid: String(sid), events: GUIDE.filter(g => g.sid === sid && ukDate(g.ev.st * 1000) === date).map(g => g.ev) }));
  return { date: ymd, schedule };
};
// The FA's page: one televised tie (markup in the page's format; see thefa-facup-fixtures-2026-10-13.html)
const FA_PAGE = `<table class="gTable"><tr><td class="headl">Tuesday 20 October 2026</td><td class="headr">Fourth Round Qualifying</td></tr>
<tr class="even"><td class="cOne"><time datetime=">19:45">19:45</time></td><td class="cThree">Harrogate Town AFC</td><td class="cFive">Bury</td><td class="cSeven">Live on BBC Sport</td></tr></table>`;
// The Premier League's feed: one match, with its UK broadcaster in the league's broadcast feed
const PL_WEEK = { data: [{ matchId: 999, kickoff: '2026-10-25 14:00:00', kickoffTimezone: 'GMT', period: 'PreMatch', matchWeek: 9, homeTeam: { name: 'Crystal Palace' }, awayTeam: { name: 'Newcastle United' } }] };
const PL_TV = { content: [{ contentReference: { id: 999 }, channels: [{ info: { name: 'Sky Sports', channelTypes: [{ mediaType: 'VIDEO' }], broadcaster: { restrictedCountries: ['GB'] } } }] }] };
let afDown = false;
const ok = (b) => ({ ok: true, status: 200, json: async () => b, text: async () => (typeof b === 'string' ? b : JSON.stringify(b)) });
function otherSource(url) {
  if (url.includes('api-sports.io')) return afDown ? { ok: false, status: 500 } : null;
  if (url.includes('awk.epgsky.com')) return ok(skyDay(url));
  if (url.includes('thefa.com')) return ok(FA_PAGE);
  if (url.includes('current-gameweek')) return ok({ matchweek: 9 });
  if (url.includes('pulselive.com')) return ok(/matchweek=9&/.test(url) ? PL_WEEK : { data: [] });
  if (url.includes('api.premierleague.com/broadcasting')) return ok(PL_TV);
  if (url.includes('match.uefa.com') || url.includes('eflservices.co.uk')) throw new Error(`official feed read with API-Football: ${url}`);
  return { ok: false, status: 404 }; // other sports: covered by their own tests
}

// ---------- mock fetch
let requests = [];
let failLeagues = new Set();
globalThis.fetch = async (url, opts = {}) => {
  const other = otherSource(url);
  if (other) return other;
  requests.push({ url, key: opts.headers?.['x-apisports-key'] });
  const q = new URL(url).searchParams;
  const league = q.get('league');
  const body = failLeagues.has(league)
    ? { errors: { plan: 'Free plans do not have access to this season, try from 2022 to 2024.' }, results: 0, response: [] }
    : WEEKS[q.get('season')]?.[league] || { errors: [], results: 0, response: [] };
  return { ok: true, status: 200, json: async () => body };
};

// ---------- unit checks
assert.equal(afSeason(Date.parse('2026-10-19T12:00:00Z')), 2026);
assert.equal(afSeason(Date.parse('2027-03-01T12:00:00Z')), 2026);
assert.equal(afSeason(Date.parse('2026-07-01T12:00:00Z')), 2026);
assert.equal(afSeason(Date.parse('2026-06-30T12:00:00Z')), 2025);

assert.equal(afErrors({ errors: [] }), null);
assert.equal(afErrors({ errors: {} }), null);
assert.equal(afErrors({ errors: { requests: 'You have reached the request limit for the day' } }), 'requests: You have reached the request limit for the day');

const fixture = (short, extra = {}) => ({
  fixture: { id: 1, date: '2026-10-24T14:00:00+00:00', venue: { name: 'Anfield' }, status: { short } },
  league: { id: 39, round: 'Regular Season - 9' },
  teams: { home: { name: 'Liverpool' }, away: { name: 'Arsenal' } },
  goals: { home: null, away: null }, ...extra,
});
assert.equal(mapAfFixture(fixture('NS')).status, 'upcoming');
assert.equal(mapAfFixture(fixture('NS')).homeScore, null);
assert.equal(mapAfFixture(fixture('NS')).timeTbc, false);
assert.equal(mapAfFixture(fixture('TBD')).timeTbc, true);
assert.equal(mapAfFixture(fixture('1H', { goals: { home: 1, away: 0 } })).status, 'live');
assert.equal(mapAfFixture(fixture('1H', { goals: { home: 1, away: 0 } })).homeScore, 1);
assert.equal(mapAfFixture(fixture('PST')).status, 'postponed');
assert.equal(mapAfFixture({ ...fixture('NS'), league: { id: 140 } }), null); // La Liga: not ours
assert.deepEqual(mapAfFixture(fixture('NS')), {
  id: 'af-1', sourceId: '1', comp: 'PL', label: null, kind: 'match', kickoff: '2026-10-24T14:00:00.000Z', timeTbc: false,
  home: 'Liverpool', away: 'Arsenal', homeShort: 'Liverpool', awayShort: 'Arsenal', venue: 'Anfield',
  status: 'upcoming', homeScore: null, awayScore: null, round: 'Regular Season - 9', source: 'api-football.com',
});

// A club missing from teamNames.mjs (e.g. newly promoted) keeps API-Football's name and is reported
assert.deepEqual(unknownClubs([{ comp: 'CHAMP', homeShort: 'Wolves', awayShort: 'Boreham Wood' }, { comp: 'CUPS', homeShort: 'Anstey Nomads', awayShort: 'Macclesfield' }]), ['Boreham Wood']);
assert.equal(mapAfFixture({ ...fixture('NS'), teams: { home: { name: 'Boreham Wood' }, away: { name: 'Wolves' } } }).home, 'Boreham Wood');
assert.equal(mapAfFixture({ ...fixture('NS'), teams: { home: { name: 'Boreham Wood' }, away: { name: 'Wolves' } } }).away, 'Wolverhampton Wanderers');

// ---------- the captured week
const { matches, errors } = await fetchApiFootball('2024-10-22', '2024-10-30', 2024, 'test-key');
assert.deepEqual(errors, []);
assert.equal(requests.length, 8); // one per competition
assert.ok(requests.every(r => r.key === 'test-key'));
const q = new URL(requests[0].url).searchParams;
assert.deepEqual([q.get('season'), q.get('from'), q.get('to'), q.get('timezone')], ['2024', '2024-10-22', '2024-10-30', 'UTC']);

const count = (comp, label = null) => matches.filter(m => m.comp === comp && m.label === label).length;
assert.equal(count('PL'), 10);
assert.equal(count('CHAMP'), 24);
assert.equal(count('UCL'), 18);
assert.equal(count('UEL'), 18);
assert.equal(count('CUPS', 'EFL Cup'), 8);
assert.equal(count('CUPS', 'FA Cup'), 0); // FA Cup first round was 2 Nov 2024

const find = (home) => matches.find(m => m.homeShort === home && m.comp !== 'UCL' && m.comp !== 'UEL');
// Friday night before the clocks went back: 19:00 UTC = 20:00 UK (BST)
assert.equal(find('Leicester').kickoff, '2024-10-25T19:00:00.000Z');
assert.equal(ukHHMM(Date.parse(find('Leicester').kickoff)), '20:00');
// Sunday the clocks went back: API-Football says 15:30 UTC (= 15:30 GMT), but the real kick-off
// was 16:30 GMT, as premierleague.com says. All four PL games that day are an hour early in its
// data (found by compare-api-football.mjs); this checks we pass its time through unchanged.
const arsenal = matches.find(m => m.home === 'Arsenal' && m.comp === 'PL');
assert.equal(arsenal.kickoff, '2024-10-27T15:30:00.000Z');
assert.deepEqual([arsenal.away, arsenal.status, arsenal.homeScore, arsenal.awayScore], ['Liverpool', 'finished', 2, 2]);
// League Cup tie decided on penalties: finished, the score is the 90/120-minute score
const pens = matches.find(m => m.home === 'Brentford' && m.label === 'EFL Cup');
assert.deepEqual([pens.away, pens.status, pens.homeScore, pens.awayScore], ['Sheffield Wednesday', 'finished', 1, 1]);
assert.ok(matches.every(m => m.source === 'api-football.com' && m.id.startsWith('af-')));
// English clubs are shown by their full names; API-Football's own name is kept for matching
assert.deepEqual([find('Leicester').home, find('Leicester').homeShort], ['Leicester City', 'Leicester']);
const swed = matches.find(m => m.homeShort === 'Sheffield Wednesday' && m.comp === 'CHAMP');
assert.equal(swed.home, 'Sheffield Wednesday'); // not confused with Sheffield United ("Sheffield Utd")
assert.equal(matches.find(m => m.awayShort === 'Crvena Zvezda' || m.awayShort === 'FK Crvena Zvezda').away, 'FK Crvena Zvezda'); // not English: as given

// ---------- this week (19-27 Oct 2026), with the Conference League and the WSL
requests = [];
const now = await fetchApiFootball('2026-10-19', '2026-10-27', 2026, 'test-key');
assert.deepEqual(now.errors, []);
const c26 = (comp, label = null) => now.matches.filter(m => m.comp === comp && m.label === label).length;
assert.deepEqual([c26('PL'), c26('CHAMP'), c26('UCL'), c26('UEL'), c26('UECL'), c26('WSL'), c26('CUPS', 'FA Cup'), c26('CUPS', 'EFL Cup')], [11, 13, 18, 18, 18, 7, 11, 2]);
// After the clocks go back (Sun 25 Oct): 14:00 UTC = 14:00 UK, as premierleague.com says
const utd = now.matches.find(m => m.home === 'Manchester United' && m.comp === 'PL');
assert.equal(ukHHMM(Date.parse(utd.kickoff)), '14:00');
// Before (Sat 24 Oct, BST): 11:30 UTC = 12:30 UK
const villa = now.matches.find(m => m.home === 'Aston Villa' && m.comp === 'PL');
assert.equal(ukHHMM(Date.parse(villa.kickoff)), '12:30');
// WSL: "Tottenham Hotspur W" shown as "… Women", matched (TV listings) as "Tottenham Hotspur"
const wsl = now.matches.find(m => m.comp === 'WSL' && m.homeShort === 'Tottenham Hotspur');
assert.deepEqual([wsl.home, wsl.away, wsl.awayShort], ['Tottenham Hotspur Women', 'Arsenal Women', 'Arsenal']);
const uecl = now.matches.find(m => m.comp === 'UECL' && m.awayShort === 'Brighton');
assert.deepEqual([uecl.home, uecl.away, uecl.round, uecl.label], ['FK Jablonec', 'Brighton and Hove Albion', 'League Stage - 2', null]);

// ---------- failures
// One competition refused: the others still arrive, and the error names the competition
requests = []; failLeagues = new Set(['45']);
const partial = await fetchApiFootball('2024-10-22', '2024-10-30', 2024, 'test-key');
assert.equal(partial.matches.length, 78);
assert.deepEqual(partial.errors, ['FA Cup: plan: Free plans do not have access to this season, try from 2022 to 2024.']);

// Every competition refused (e.g. the free plan asked for the current season): the source fails
failLeagues = new Set(Object.keys(AF_LEAGUES));
await assert.rejects(fetchApiFootball('2026-10-19', '2026-10-27', 2026, 'test-key'), /plan: Free plans/);
failLeagues = new Set();

// No key: fails before making any request
requests = [];
await assert.rejects(fetchApiFootball('2026-10-19', '2026-10-27', 2026, ''), /API_FOOTBALL_KEY is not set/);
assert.equal(requests.length, 0);

// ---------- the build with API-Football as the football source (Mon 19 Oct 2026, 23:00 UK)
process.env.API_FOOTBALL_KEY = 'test-key';
const NOW = Date.parse('2026-10-19T22:00:00Z');
const data = await build(NOW, null, { footballSource: 'api-football' });
const r = data.report;
assert.equal(r.footballSource, 'api-football');
assert.equal(r.apiFootball.ok, true);
assert.deepEqual([r.premierLeague, r.championsLeague, r.europaLeague], [{ ok: true, matches: 11 }, { ok: true, matches: 18 }, { ok: true, matches: 18 }]);
assert.equal(r.efl.ok, true);
assert.equal(r.faPage.ok, true);
assert.equal(r.scores, 'on');
const ev = (comp, home) => data.events.find(e => e.comp === comp && e.homeShort === home); // by API-Football's name
// New-app-only competitions are read but not in this app's data
assert.ok(!data.events.some(e => e.comp === 'UECL' || e.comp === 'WSL'));
// Every football event is from API-Football, with its kick-off and score
assert.ok(data.events.filter(e => e.kind === 'match').every(e => e.source === 'api-football.com'));
assert.deepEqual([ev('PL', 'Tottenham').status, ev('PL', 'Tottenham').homeScore, ev('PL', 'Tottenham').awayScore], ['finished', 3, 1]);
// Channel from the Sky guide
assert.deepEqual(ev('PL', 'Chelsea').tv.channels, ['Sky Sports Main Event']);
// Saturday 15:00 UK: not shown live
assert.equal(ev('PL', 'Arsenal').tv.note, 'Not shown live on UK TV');
assert.equal(ev('CHAMP', 'Wolves').kickoff, '2026-10-20T18:45:00.000Z'); // Tuesday's game, not the Saturday one
assert.equal(`${ev('CHAMP', 'Wolves').home} v ${ev('CHAMP', 'Wolves').away}`, 'Wolverhampton Wanderers v Portsmouth');
assert.equal(`${ev('CHAMP', 'Sheffield Utd').home} v ${ev('CHAMP', 'Sheffield Utd').away}`, 'Sheffield United v Derby County');
assert.equal(`${ev('CHAMP', 'QPR').home} v ${ev('CHAMP', 'QPR').away}`, 'Queens Park Rangers v Swansea City');
assert.deepEqual(r.apiFootball.unknownClubs, []); // every league club this week is in teamNames.mjs
assert.equal(data.events.find(e => e.comp === 'CHAMP' && e.homeShort === 'Wolves' && e.awayShort === 'Watford').tv.note, 'Not shown live on UK TV');
// The Premier League's own broadcaster, paired with API-Football's match by teams
assert.deepEqual([ev('PL', 'Crystal Palace').tv.broadcaster, ev('PL', 'Crystal Palace').tv.note], ['Sky Sports', 'Exact channel to be confirmed']);
assert.equal(r.premierLeagueTv.ok, true);
// Cups: televised ties only. League Cup from the guide; FA Cup from the FA's "Live on" list
const cups = data.events.filter(e => e.comp === 'CUPS');
assert.deepEqual(cups.map(e => `${e.label}: ${e.home} v ${e.away} on ${e.tv.channels[0]}`), [
  'FA Cup: Harrogate Town v Bury on BBC Sport',
  'EFL Cup: Fleetwood Town v Arsenal on Sky Sports Main Event',
]);
assert.ok(cups[0].tv.sources.includes('thefa.com'));

// Scores switched off: none anywhere
const noScores = await build(NOW, null, { footballSource: 'api-football', showScores: false });
assert.equal(noScores.report.scores, 'off');
assert.ok(noScores.events.every(e => e.homeScore == null && e.awayScore == null));

// API-Football down: every football competition reports a failure (the app shows its banners),
// the rest of the build carries on, and no official fixture feed is read instead
afDown = true;
const down = await build(NOW, null, { footballSource: 'api-football' });
afDown = false;
assert.equal(down.report.apiFootball.ok, false);
assert.ok(['premierLeague', 'championsLeague', 'europaLeague', 'efl', 'faCup'].every(k => down.report[k].ok === false));
assert.equal(down.events.filter(e => e.kind === 'match').length, 0);
assert.equal(down.report.tvGuide.ok, true);

console.log('All API-Football tests passed');
