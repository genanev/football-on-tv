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
// The build checks are made with the other sources mocked, including the once-a-day check against
// the official feeds (goldenCheck.mjs), whose answers are hand-written in each feed's format.
//
//   node test/run-api-football-test.mjs

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ukHHMM, ukToUtc, ukDate } from '../scripts/lib/util.mjs';
import { build, markNotOnTv } from '../scripts/build.mjs';
import { unknownClubs } from '../scripts/sources/teamNames.mjs';
import { parsePremierSports, parsePsTime } from '../scripts/sources/premierSports.mjs';
import { mapAfFixture, afErrors, afSeason, fetchApiFootball, AF_LEAGUES } from '../scripts/sources/apiFootball.mjs';

const fx = async (name) => JSON.parse(await readFile(new URL(`fixtures/${name}`, import.meta.url), 'utf8'));
const WEEKS = { 2024: await fx('apifootball-fixtures-2024-10-22.json'), 2026: await fx('apifootball-fixtures-2026-10-19.json') };

// ---------- the other sources the build reads (for the build checks at the end)
// Sky TV guide entries, hand-written in Sky's format (UK local times; the guide has no past days)
const MAIN = 4002, PL_CH = 4010, TNT1 = 3625;
let eid = 0;
const prog = (sid, date, hhmm, mins, t) => {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = hhmm.split(':').map(Number);
  return { sid, ev: { st: ukToUtc(y, m, d, hh, mm) / 1000, d: mins * 60, eid: `E${(++eid).toString(16)}`, t, sy: '', eg: 7, esg: 11, s: true, hd: true, new: false } };
};
const GUIDE = [
  prog(MAIN, '2026-10-24', '17:00', 180, 'Live PL: Chelsea v Tottenham'),
  prog(MAIN, '2026-10-27', '19:30', 180, 'Live Carabao Cup: Fleetwood v Arsenal'),
  prog(TNT1, '2026-10-22', '17:30', 135, 'Live UEFA Conference League: Jablonec v Brighton'),
  prog(MAIN, '2026-10-24', '12:30', 150, 'Live WSL: Tottenham v Arsenal'),
  prog(PL_CH, '2026-10-25', '11:30', 150, 'Live PL: Crystal Palace v Chelsea'), // made up: a men's game at the time of the WSL one
  prog(MAIN, '2026-10-25', '11:30', 150, 'Live SPFL: Hibernian v Celtic'),
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
// (and, made up for the daily check, Sunderland v Leeds an hour later than API-Football has it,
// like API-Football's PL games on the day the clocks went back in 2024)
const PL_WEEK = { data: [
  { matchId: 999, kickoff: '2026-10-25 14:00:00', kickoffTimezone: 'GMT', period: 'PreMatch', matchWeek: 9, homeTeam: { name: 'Crystal Palace' }, awayTeam: { name: 'Newcastle United' } },
  { matchId: 998, kickoff: '2026-10-25 17:30:00', kickoffTimezone: 'GMT', period: 'PreMatch', matchWeek: 9, homeTeam: { name: 'Sunderland' }, awayTeam: { name: 'Leeds United' } },
  // beyond the app's window (the real feed reaches weeks ahead): not "missing" from API-Football
  { matchId: 997, kickoff: '2026-11-08 14:00:00', kickoffTimezone: 'GMT', period: 'PreMatch', matchWeek: 11, homeTeam: { name: 'Arsenal' }, awayTeam: { name: 'Hull City' } },
] };
const PL_TV = { content: [{ contentReference: { id: 999 }, channels: [{ info: { name: 'Sky Sports', channelTypes: [{ mediaType: 'VIDEO' }], broadcaster: { restrictedCountries: ['GB'] } } }] }] };
// The official feeds API-Football is checked against once a day (goldenCheck.mjs), in each feed's
// format, made up after the real case of 28 Oct 2026 (UEFA moved Rennes v Olympiacos a day earlier;
// API-Football still had the old date): Juventus v Rennes moved from Thursday to Wednesday;
// Lech Poznań v Sunderland as API-Football has it. The EFL: Bolton v Middlesbrough postponed, a
// game API-Football lacks (Leicester v Sheffield Wednesday), Stoke v Bristol City as it has it.
const UEFA_UEL = [
  { id: 2047001, kickOffTime: { dateTime: '2026-10-21T15:30:00Z' }, status: 'UPCOMING', homeTeam: { internationalName: 'Juventus' }, awayTeam: { internationalName: 'Rennes' } },
  { id: 2047002, kickOffTime: { dateTime: '2026-10-22T16:45:00Z' }, status: 'UPCOMING', homeTeam: { internationalName: 'Lech Poznań' }, awayTeam: { internationalName: 'Sunderland' } },
];
const eflMatch = (id, utc, period, home, away) => ({ id, attributes: { competitionID: 10, kickOffDateUTC: utc, matchPeriod: period, homeTeam: { name: home }, awayTeam: { name: away } } });
const EFL_FEED = { data: [
  eflMatch('e1', '2026-10-23 19:00:00', 'Postponed', 'Bolton Wanderers', 'Middlesbrough'),
  eflMatch('e2', '2026-10-24 14:00:00', 'PreMatch', 'Leicester City', 'Sheffield Wednesday'),
  eflMatch('e3', '2026-10-24 14:00:00', 'PreMatch', 'Stoke City', 'Bristol City'),
], links: {} };
let afDown = false, psDown = false, psForeign = false, uefaDown = false, faLate = false;
let officialReads = []; // requests to the official fixture feeds (read once a day with API-Football)
// Premier Sports' fixtures page (streaming only, not in Sky's guide), trimmed; see the file's comment
const PS_PAGE = await readFile(new URL('fixtures/premiersports-upcoming-fixtures-2026-10-20.html', import.meta.url), 'utf8');
const ok = (b) => ({ ok: true, status: 200, json: async () => b, text: async () => (typeof b === 'string' ? b : JSON.stringify(b)) });
function otherSource(url) {
  if (url.includes('api-sports.io')) return afDown ? { ok: false, status: 500 } : null;
  if (url.includes('awk.epgsky.com')) return ok(skyDay(url));
  if (url.includes('thefa.com')) return ok(faLate ? FA_PAGE.replace(/19:45/g, '20:00') : FA_PAGE);
  if (url.includes('premiersports.com')) return psDown ? { ok: false, status: 503 } : ok(psForeign ? '<html><body>Premier Sports is not available in your region</body></html>' : PS_PAGE);
  if (/current-gameweek|premier-league-prod\.pulselive\.com|match\.uefa\.com|eflservices\.co\.uk/.test(url)) officialReads.push(url);
  if (url.includes('current-gameweek')) return ok({ matchweek: 9 });
  if (url.includes('pulselive.com')) return ok(/matchweek=9&/.test(url) ? PL_WEEK : { data: [] });
  if (url.includes('api.premierleague.com/broadcasting')) return ok(PL_TV);
  if (url.includes('match.uefa.com')) return uefaDown ? { ok: false, status: 503 } : ok(/competitionId=14&/.test(url) ? UEFA_UEL : []);
  if (url.includes('eflservices.co.uk')) return ok(EFL_FEED);
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

// Premier Sports' page: days have no year; the nearest one to now is used
assert.equal(new Date(parsePsTime('Sunday, January 3', '7:45pm', Date.parse('2026-12-20T12:00:00Z'))).toISOString(), '2027-01-03T19:45:00.000Z');
assert.equal(new Date(parsePsTime('Sunday, October 25', '1:30pm', Date.parse('2026-10-20T12:00:00Z'))).toISOString(), '2026-10-25T13:30:00.000Z'); // GMT by then
assert.equal(new Date(parsePsTime('Saturday, October 24', '12:15am', Date.parse('2026-10-20T12:00:00Z'))).toISOString(), '2026-10-23T23:15:00.000Z'); // BST
const psEvents = parsePremierSports(PS_PAGE, Date.parse('2026-10-20T00:15:00Z'));
assert.deepEqual(psEvents.filter(e => e.competition === 'SPFL').map(e => `${e.home} v ${e.away} on ${e.channel}`), ['Motherwell v Hearts on Premier Sports 1', 'Aberdeen v Hibernian on Premier Sports 1']);

// ---------- the captured week
const { matches, errors } = await fetchApiFootball('2024-10-22', '2024-10-30', 2024, 'test-key');
assert.deepEqual(errors, []);
assert.equal(requests.length, 9); // one per competition
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
assert.deepEqual([c26('PL'), c26('CHAMP'), c26('UCL'), c26('UEL'), c26('UECL'), c26('WSL'), c26('SCOT'), c26('CUPS', 'FA Cup'), c26('CUPS', 'EFL Cup')], [11, 13, 18, 18, 18, 7, 6, 11, 2]);
// After the clocks go back (Sun 25 Oct): 14:00 UTC = 14:00 UK, as premierleague.com says
const utd = now.matches.find(m => m.home === 'Manchester United' && m.comp === 'PL');
assert.equal(ukHHMM(Date.parse(utd.kickoff)), '14:00');
// Before (Sat 24 Oct, BST): 11:30 UTC = 12:30 UK
const villa = now.matches.find(m => m.home === 'Aston Villa' && m.comp === 'PL');
assert.equal(ukHHMM(Date.parse(villa.kickoff)), '12:30');
// WSL: "Tottenham Hotspur W" shown as "… Women", matched (TV listings) as "Tottenham Hotspur"
const wsl = now.matches.find(m => m.comp === 'WSL' && m.homeShort === 'Tottenham Hotspur');
assert.deepEqual([wsl.home, wsl.away, wsl.awayShort], ['Tottenham Hotspur Women', 'Arsenal Women', 'Arsenal']);
const lionesses = now.matches.find(m => m.comp === 'WSL' && m.homeShort === 'Liverpool');
assert.equal(`${lionesses.home} v ${lionesses.away}`, 'Liverpool Women v London City Lionesses');
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
// Conference League and WSL: televised games only (George, 20 Oct 2026)
const listed = (comp) => data.events.filter(e => e.comp === comp).map(e => `${e.home} v ${e.away} on ${e.tv.channels[0]}`);
assert.deepEqual(listed('UECL'), ['FK Jablonec v Brighton and Hove Albion on TNT Sports 1']);
assert.deepEqual(listed('WSL'), ['Tottenham Hotspur Women v Arsenal Women on Sky Sports Main Event']);
// the men's programme at the same time doesn't put Crystal Palace Women v Chelsea Women on TV
assert.ok(!data.events.some(e => e.comp === 'WSL' && e.homeShort === 'Crystal Palace'));
assert.deepEqual([r.conferenceLeague, r.wsl], [{ ok: true, televised: 1 }, { ok: true, televised: 1 }]);
// Scottish Premiership: every game, full names, the 3pm blackout, channels from the guide
assert.deepEqual(r.scottishPremiership, { ok: true, matches: 6 });
const scot = (home) => data.events.find(e => e.comp === 'SCOT' && e.homeShort === home);
assert.equal(`${scot('ST Mirren').home} v ${scot('ST Mirren').away}`, 'St Mirren v Dundee');
assert.equal(scot('ST Mirren').tv.note, 'Not shown live on UK TV'); // Sat 24 Oct, 15:00 BST
assert.deepEqual(scot('Hibernian').tv.channels, ['Sky Sports Main Event']); // Sun 25 Oct, 12:00 GMT
// Motherwell v Hearts is only on Premier Sports (streaming, not in Sky's guide): its page lists it
// from 13:30, the start of coverage, for a 14:00 kick-off
assert.equal(`${scot('Motherwell').away}: ${scot('Motherwell').tv.channels[0]}`, 'Heart of Midlothian: Premier Sports 1');
assert.deepEqual(scot('Motherwell').tv.sources, ['premiersports.com']);
assert.equal(r.premierSports.ok, true);
// Premier Sports' page unreachable: back to "to be confirmed" (the app shows a banner in Scottish views)
psDown = true;
const noPs = await build(NOW, null, { footballSource: 'api-football' });
psDown = false;
assert.equal(noPs.report.premierSports.ok, false);
assert.equal(noPs.events.find(e => e.comp === 'SCOT' && e.homeShort === 'Motherwell').tv.note, 'TV channel to be confirmed');
// ...unless an earlier update had confirmed it (the keep rule)
psDown = true;
const keptNoPs = await build(NOW, data, { footballSource: 'api-football' });
psDown = false;
assert.deepEqual(keptNoPs.events.find(e => e.comp === 'SCOT' && e.homeShort === 'Motherwell').tv.channels, ['Premier Sports 1']);
// From GitHub's US servers the site serves a page without the UK listings: "wrong region" (check.yml
// only notes it, the app shows no banner) and the channel found earlier is kept
psForeign = true;
const usRun = await build(NOW, data, { footballSource: 'api-football' });
psForeign = false;
assert.equal(usRun.report.premierSports.ok, false);
assert.equal(usRun.report.premierSports.wrongRegion, true);
assert.deepEqual(usRun.events.find(e => e.comp === 'SCOT' && e.homeShort === 'Motherwell').tv.channels, ['Premier Sports 1']);
// Every football event is from API-Football, with its kick-off and score (except one game it lacks,
// added from the EFL's feed by the daily check, below)
assert.deepEqual(data.events.filter(e => e.kind === 'match' && e.source !== 'api-football.com').map(e => `${e.home} (${e.source})`), ['Leicester City (efl.com)']);
assert.deepEqual([ev('PL', 'Tottenham').status, ev('PL', 'Tottenham').homeScore, ev('PL', 'Tottenham').awayScore], ['finished', 3, 1]);
// Channel from the Sky guide
assert.deepEqual(ev('PL', 'Chelsea').tv.channels, ['Sky Sports Main Event']);
// Saturday 15:00 UK: not shown live
assert.equal(ev('PL', 'Arsenal').tv.note, 'Not shown live on UK TV');
assert.equal(ev('CHAMP', 'Wolves').kickoff, '2026-10-20T18:45:00.000Z'); // Tuesday's game, not the Saturday one
// Within 48 hours with no channel, but Sky's pages and TNT's schedule aren't mocked here (they
// fail), so it isn't marked "not on TV" (the 48-hour cut-off, checked below)
assert.equal(r.skyListings.ok, false);
assert.equal(ev('CHAMP', 'Wolves').tv.note, 'TV channel to be confirmed');
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
assert.ok(['premierLeague', 'championsLeague', 'europaLeague', 'efl', 'faCup', 'conferenceLeague', 'wsl', 'scottishPremiership'].every(k => down.report[k].ok === false));
assert.equal(down.events.filter(e => e.kind === 'match').length, 0);
assert.equal(down.report.tvGuide.ok, true);

// ---------- the daily check against the official feeds (goldenCheck.mjs; George, 29 Oct 2026)
// The first update (no earlier check) reads them all; where they disagree with API-Football, they win
const g = data.report.goldenCheck;
assert.deepEqual(Object.fromEntries(Object.entries(g).filter(([k]) => k !== 'changed').map(([k, v]) => [k, `${v.ok} ${v.corrections}`])),
  { premierLeague: 'true 1', championsLeague: 'true 0', europaLeague: 'true 1', conferenceLeague: 'true 0', efl: 'true 2' });
assert.deepEqual(g.changed, [
  'PL Sunderland v Leeds United: Sun 10-25 16:30 -> Sun 10-25 17:30 (premierleague.com)',
  'UEL Juventus v Rennes: Thu 10-22 17:45 -> Wed 10-21 16:30 (uefa.com)',
  'CHAMP Bolton Wanderers v Middlesbrough: upcoming -> postponed (efl.com)',
  'CHAMP Leicester City v Sheffield Wednesday: added, Sat 10-24 15:00 (efl.com)',
]);
const rennes = (d) => d.events.find(e => e.comp === 'UEL' && e.awayShort === 'Rennes');
assert.deepEqual([rennes(data).kickoff, rennes(data).checkedBy, rennes(data).source], ['2026-10-21T15:30:00.000Z', 'uefa.com', 'api-football.com']);
assert.equal(ev('PL', 'Sunderland').kickoff, '2026-10-25T17:30:00.000Z');
assert.equal(ev('CHAMP', 'Bolton').status, 'postponed');
const leicester = data.events.find(e => e.comp === 'CHAMP' && e.home === 'Leicester City');
assert.deepEqual([leicester.away, leicester.tv.note], ['Sheffield Wednesday', 'Not shown live on UK TV']); // Sat 15:00
assert.equal(ev('UEL', 'Lech Poznan').checkedBy, undefined); // agrees: unchanged
assert.ok(officialReads.some(u => u.includes('match.uefa.com')) && officialReads.some(u => u.includes('eflservices')));
// What the check found is saved in data.json, with the PL's match ids for its broadcaster feed
assert.deepEqual(Object.keys(data.golden), ['premierLeague', 'championsLeague', 'europaLeague', 'conferenceLeague', 'efl']);
assert.ok(data.golden.premierLeague.matches.some(m => m.sourceId === '999'));
assert.ok(!data.golden.premierLeague.matches.some(m => m.sourceId === '997')); // beyond the window

// The next update, 30 minutes later: no official feed is read, yesterday's findings still apply,
// and the PL broadcaster is still found (match ids from the saved check)
officialReads = [];
const next = await build(NOW + 30 * 60000, data, { footballSource: 'api-football' });
assert.deepEqual(officialReads, []);
assert.equal(rennes(next).kickoff, '2026-10-21T15:30:00.000Z');
assert.equal(next.events.find(e => e.comp === 'CHAMP' && e.homeShort === 'Bolton').status, 'postponed');
assert.ok(next.events.some(e => e.home === 'Leicester City'));
assert.equal(next.events.find(e => e.comp === 'PL' && e.homeShort === 'Crystal Palace').tv.broadcaster, 'Sky Sports');
assert.equal(next.report.goldenCheck.europaLeague.checkedAt, data.golden.europaLeague.checkedAt);
assert.deepEqual(next.golden, data.golden);

// API-Football has changed the game since the check: it has newer news, so its kick-off stands
const changedSince = structuredClone(data);
changedSince.golden.europaLeague.corrections[0].was.kickoff = '2026-10-22T19:00:00.000Z';
assert.equal(rennes(await build(NOW + 30 * 60000, changedSince, { footballSource: 'api-football' })).kickoff, '2026-10-22T16:45:00.000Z');

// Once a day: not before 06:00 UK the next day, then on the first update from 06:00
officialReads = [];
await build(Date.parse('2026-10-20T04:30:00Z'), data, { footballSource: 'api-football' }); // 05:30 UK
assert.deepEqual(officialReads, []);
const six = await build(Date.parse('2026-10-20T05:00:00Z'), data, { footballSource: 'api-football' }); // 06:00 UK
assert.ok(officialReads.some(u => u.includes('match.uefa.com')));
assert.equal(six.golden.europaLeague.checkedAt, '2026-10-20T05:00:00.000Z');

// A feed fails at its check: its last findings still apply, and it is tried again on the next update
uefaDown = true;
const failed = await build(Date.parse('2026-10-20T05:00:00Z'), data, { footballSource: 'api-football' });
uefaDown = false;
assert.equal(failed.report.goldenCheck.europaLeague.ok, false);
assert.equal(failed.report.goldenCheck.europaLeague.lastChecked, data.golden.europaLeague.checkedAt);
assert.equal(failed.report.goldenCheck.efl.ok, true);
assert.equal(rennes(failed).kickoff, '2026-10-21T15:30:00.000Z');
officialReads = [];
const retried = await build(Date.parse('2026-10-20T05:30:00Z'), failed, { footballSource: 'api-football' });
assert.ok(officialReads.some(u => u.includes('match.uefa.com')) && !officialReads.some(u => u.includes('eflservices')));
assert.equal(retried.golden.europaLeague.ok, true);

// The FA's page is read on every update: its televised ties' kick-offs win straight away
faLate = true;
const faMoved = await build(NOW + 30 * 60000, data, { footballSource: 'api-football' });
faLate = false;
const harrogate = faMoved.events.find(e => e.label === 'FA Cup' && e.homeShort.startsWith('Harrogate'));
assert.deepEqual([harrogate.kickoff, harrogate.checkedBy, harrogate.tv.channels[0]], ['2026-10-20T19:00:00.000Z', 'thefa.com', 'BBC Sport']);

// The official-feeds mode (GitHub's backup button) doesn't check, but keeps the last check for the
// next API-Football update
assert.deepEqual((await build(NOW + 30 * 60000, data, { footballSource: 'official' })).golden, data.golden);

// ---------- the 48-hour cut-off (markNotOnTv; George, 29 Oct 2026)
// No channel or broadcaster 48 hours before kick-off: not on UK TV, if every TV listing was read
const T0 = Date.parse('2026-10-26T19:45:00Z');
const listingsOk = { tvGuide: { ok: true }, skyListings: { ok: true }, tntSchedule: { ok: true }, premierSports: { ok: true }, primeVideo: { ok: true } };
const game = (comp, hoursAhead, tv = {}) => ({ kind: 'match', comp, status: 'upcoming', kickoff: new Date(T0 + hoursAhead * 3600000).toISOString(),
  tv: { broadcaster: null, channels: [], alsoOn: [], note: 'TV channel to be confirmed', sources: [], ...tv } });
const noteAfter = (e, report = listingsOk) => markNotOnTv([e], report, T0)[0].tv.note;
assert.equal(noteAfter(game('SCOT', 47)), 'Not shown live on UK TV');
assert.equal(noteAfter(game('CHAMP', 48)), 'Not shown live on UK TV');
assert.equal(noteAfter(game('CHAMP', 49)), 'TV channel to be confirmed'); // too early to tell
// the league's own pick ("Sky Sports"), a channel, a postponed game or an unknown kick-off time: unchanged
assert.equal(noteAfter(game('PL', 10, { broadcaster: 'Sky Sports', note: 'Exact channel to be confirmed' })), 'Exact channel to be confirmed');
assert.equal(noteAfter(game('SCOT', 10, { broadcaster: 'Sky Sports Football', channels: ['Sky Sports Football'], note: null })), null);
assert.equal(noteAfter({ ...game('CHAMP', 10), status: 'postponed' }), 'TV channel to be confirmed');
assert.equal(noteAfter({ ...game('CHAMP', 10), timeTbc: true }), 'TV channel to be confirmed');
// a TV listing that could name the game wasn't read: still "to be confirmed"
assert.equal(noteAfter(game('CHAMP', 10), { ...listingsOk, tvGuide: { ok: false } }), 'TV channel to be confirmed');
assert.equal(noteAfter(game('SCOT', 10), { ...listingsOk, premierSports: { ok: false, wrongRegion: true } }), 'TV channel to be confirmed');
assert.equal(noteAfter(game('CHAMP', 10), { ...listingsOk, premierSports: { ok: false } }), 'Not shown live on UK TV'); // not a Premier Sports game
assert.equal(noteAfter(game('UCL', 10), { ...listingsOk, primeVideo: { ok: false } }), 'TV channel to be confirmed');

console.log('All API-Football tests passed');
