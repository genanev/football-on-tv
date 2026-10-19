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
import { ukHHMM } from '../scripts/lib/util.mjs';
import { mapAfFixture, afErrors, afSeason, fetchApiFootball, AF_LEAGUES } from '../scripts/sources/apiFootball.mjs';

const fx = async (name) => JSON.parse(await readFile(new URL(`fixtures/${name}`, import.meta.url), 'utf8'));
const WEEKS = { 2024: await fx('apifootball-fixtures-2024-10-22.json'), 2026: await fx('apifootball-fixtures-2026-10-19.json') };

// ---------- mock fetch
let requests = [];
let failLeagues = new Set();
globalThis.fetch = async (url, opts = {}) => {
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

const find = (home) => matches.find(m => m.home === home && m.comp !== 'UCL' && m.comp !== 'UEL');
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
const uecl = now.matches.find(m => m.comp === 'UECL' && m.away === 'Brighton');
assert.deepEqual([uecl.home, uecl.round, uecl.label], ['FK Jablonec', 'League Stage - 2', null]);

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

console.log('All API-Football tests passed');
