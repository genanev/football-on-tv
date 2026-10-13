// Offline test for the Europa League, Championship, League Cup and FA Cup.
//
// Replays real data captured on 13 Oct 2026 (evening, so Tuesday's Championship games are mid-match):
//   fixtures/uefa-europa-league-2026-10-13.json   uefa.com feed, Europa League 12-22 Oct
//   fixtures/efl-matches-2026-10-13.json          efl.com feed, Championship + League Cup 13-22 Oct
//   fixtures/thefa-facup-fixtures-2026-10-13.html thefa.com FA Cup fixtures (tables only)
//   fixtures/sky-guide-football-2026-10-13.json   Sky TV guide 13-21 Oct, football channels
//                                                 (football programmes kept, plus one other per channel/day)
//   fixtures/skysports-football-on-sky-2026-10-13.html  skysports.com "Football on Sky" (listings only)
//   fixtures/skysports-f1-on-sky-2026-10-13.html        skysports.com "F1 on Sky" (listings only)
//   fixtures/tnt-schedule-2026-10-15.json                TNT Sports' schedule for Thu 15 Oct (football only)
//
//   node test/run-more-football-test.mjs

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from '../scripts/build.mjs';
import { guideTeams } from '../scripts/sources/football.mjs';
import { mapEflMatch, eflEvents } from '../scripts/sources/efl.mjs';
import { parseFaFixtures } from '../scripts/sources/facup.mjs';

const fx = (name) => readFile(new URL(`fixtures/${name}`, import.meta.url), 'utf8');
const UEL = JSON.parse(await fx('uefa-europa-league-2026-10-13.json'));
const EFL = JSON.parse(await fx('efl-matches-2026-10-13.json'));
const FA = await fx('thefa-facup-fixtures-2026-10-13.html');
const GUIDE = JSON.parse(await fx('sky-guide-football-2026-10-13.json'));
const SKY_FOOTBALL = await fx('skysports-football-on-sky-2026-10-13.html');
const SKY_F1 = await fx('skysports-f1-on-sky-2026-10-13.html');
const TNT_THU = JSON.parse(await fx('tnt-schedule-2026-10-15.json'));

// ---------- mock fetch
let tntDown = false;
globalThis.fetch = async (url) => {
  const json = (b) => ({ ok: true, status: 200, json: async () => b, text: async () => JSON.stringify(b) });
  if (url.includes('match.uefa.com')) return json(/competitionId=14\b/.test(url) ? UEL : []);
  if (url.includes('eflservices.co.uk')) return json(EFL);
  if (url.includes('thefa.com')) return { ok: true, status: 200, text: async () => FA };
  if (url.includes('skysports.com/watch/football-on-sky')) return { ok: true, status: 200, text: async () => SKY_FOOTBALL };
  if (url.includes('skysports.com/watch/f1-on-sky')) return { ok: true, status: 200, text: async () => SKY_F1 };
  if (url.includes('netsport.eurosport.io')) {
    if (tntDown) return { ok: false, status: 500 };
    const date = JSON.parse(new URL(url).searchParams.get('variables')).date;
    return json(date === '2026-10-14T23:00:00.000Z' ? TNT_THU : { data: { programsByDate: { edges: [], pageInfo: { hasNextPage: false } } } });
  }
  if (url.includes('awk.epgsky.com')) {
    const [, ymd, sids] = /schedule\/(\d{8})\/([\d,]+)/.exec(url);
    const day = GUIDE[ymd];
    const want = new Set(sids.split(','));
    return json(day ? { ...day, schedule: day.schedule.filter(s => want.has(String(s.sid))) } : { date: ymd, schedule: [] });
  }
  return { ok: false, status: 404 }; // other competitions are covered by their own tests
};

// ---------- unit checks
assert.deepEqual(guideTeams('Live UEL: Lyon v Crystal Palace'), ['Lyon', 'Crystal Palace']);
assert.deepEqual(guideTeams('Live EFL: Mansfield v Oxford Utd'), ['Mansfield', 'Oxford Utd']);
assert.deepEqual(guideTeams('Live Stoke v Middlesbrough'), ['Stoke', 'Middlesbrough']);
assert.equal(guideTeams('Live: FA Cup 1st Round Draw'), null);

const ties = parseFaFixtures(FA);
assert.equal(ties.length, 20);
assert.deepEqual(ties[0], { date: '2026-10-17', time: '12:30', round: 'Fourth Round Qualifying', home: 'Bury', away: 'Harrogate Town AFC', liveOn: 'Live on BBC Sport' });

// A League Cup tie is only listed when it's on UK TV
const cupTie = mapEflMatch({ id: 'g1', attributes: { competitionID: 2, kickOffDateUTC: '2026-10-27 19:45:00', homeTeam: { name: 'Lincoln City' }, awayTeam: { name: 'West Ham United' }, matchPeriod: 'PreMatch' } });
assert.equal(cupTie.comp, 'CUPS');
assert.equal(cupTie.label, 'EFL Cup');
assert.equal(eflEvents([cupTie], { programmes: [] }).length, 0);
const onSky = { sid: 4002, channel: 'Sky Sports Main Event', live: true, title: 'Live Carabao Cup: Lincoln v West Ham', synopsis: '', start: Date.parse('2026-10-27T19:15:00Z'), end: Date.parse('2026-10-27T22:00:00Z') };
assert.deepEqual(eflEvents([cupTie], { programmes: [onSky] })[0].tv.channels, ['Sky Sports Main Event']);

// ---------- full build, "now" = Tue 13 Oct 2026 10:00 UK
const data = await build(Date.parse('2026-10-13T09:00:00Z'));
const uk = (iso) => new Date(iso).toLocaleString('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
for (const k of ['europaLeague', 'efl', 'faCup', 'tvGuide']) console.log(k, JSON.stringify(data.report[k]));
for (const e of data.events) {
  console.log(e.comp.padEnd(6), (e.label || '').padEnd(7), uk(e.kickoff).padEnd(14), `${e.home} v ${e.away}`.padEnd(44),
    (e.tv.channels.join(', ') || e.tv.broadcaster || '-').padEnd(24), e.tv.alsoOn.length ? `+ ${e.tv.alsoOn.join(', ')}` : '', e.tv.note || '');
}
const find = (home) => data.events.find(e => e.home === home);

// Europa League: every match listed; the ones in TNT's schedule get the exact channel
assert.equal(data.report.europaLeague.ok, true);
assert.equal(data.events.filter(e => e.comp === 'UEL').length, 18);
assert.deepEqual(find('Lyon').tv.channels, ['TNT Sports 1']);
assert.deepEqual(find('Torreense').tv.channels, ['TNT Sports 2']);
assert.deepEqual(find('Benfica').tv.channels, ['TNT Sports 3']);
assert.deepEqual(find('Bournemouth').tv.channels, ['TNT Sports 1']);
// TNT's own schedule confirms the games streamed only on HBO Max (not in any TV guide)...
assert.deepEqual(find('Celta').tv.channels, ['HBO Max']);
assert.deepEqual(find('Celta').tv.sources, ['tntsports.co.uk']);
assert.deepEqual(find('N.E.C.').tv.channels, ['HBO Max']); // TNT writes "NEC - Levski Sofia"
assert.ok(data.events.filter(e => e.comp === 'UEL').every(e => e.tv.channels.length)); // all 18 confirmed
// ...and cross-checks the TV guide's picks
assert.deepEqual(find('Lyon').tv.sources, ['sky-guide', 'tntsports.co.uk']);
assert.deepEqual(find('Bournemouth').tv.alsoOn, ['HBO Max']);
assert.ok(!data.events.some(e => e.home === 'Brighton')); // Conference League ("Live UCoL: ...") isn't included

// Championship: every match; TV picks from the guide, 3pm Saturday blackout, Sky Sports+ expected otherwise
const champ = data.events.filter(e => e.comp === 'CHAMP');
assert.equal(champ.length, 25);
assert.deepEqual(find('Stoke City').tv.channels, ['Sky Sports Main Event']);
assert.deepEqual(find('Stoke City').tv.alsoOn, ['Sky Sports Football']);
assert.deepEqual(champ.find(e => e.home === 'Millwall' && e.away === 'Swansea City').tv.channels, ['Sky Sports+']);
assert.deepEqual(find('Lincoln City').tv.channels, ['Sky Sports Main Event']); // "Live EFL: Lincoln City v West Ham"
// Sky Sports+ streams aren't in the TV guide: Sky's own "Football on Sky" page confirms them
const norwich = champ.find(e => e.home === 'Norwich City' && e.away === 'Southampton');
assert.deepEqual(norwich.tv.channels, ['Sky Sports+']);
assert.ok(norwich.tv.sources.includes('skysports.com'));
assert.deepEqual(champ.find(e => e.home === 'Middlesbrough' && e.away === 'Cardiff City').tv.channels, ['Sky Sports+']);
// Not in the guide or on Sky's page (the page was captured after these 19:45 kick-offs): no guess
const bristol = champ.find(e => e.home === 'Bristol City' && e.away === 'Blackburn Rovers');
assert.deepEqual(bristol.tv.channels, []);
assert.equal(bristol.tv.note, 'TV channel to be confirmed');
assert.ok(champ.every(e => !e.tv.sources.includes('uk-rights')));
const sat3pm = champ.filter(e => uk(e.kickoff) === 'Sat 17, 15:00');
assert.equal(sat3pm.length, 8);
assert.ok(sat3pm.every(e => e.tv.note === 'Not shown live on UK TV' && !e.tv.channels.length));
assert.ok(!data.events.some(e => e.home === 'Mansfield Town')); // League One isn't included
assert.equal(data.report.efl.leagueCup, 0); // no League Cup ties this week

// FA Cup: the FA's own TV pick (streamed on BBC Sport, not in the TV guide)
const fa = data.events.filter(e => e.label === 'FA Cup');
assert.equal(fa.length, 1);
assert.equal(fa[0].home, 'Bury');
assert.equal(fa[0].kickoff, '2026-10-17T11:30:00.000Z'); // 12:30 UK
assert.equal(fa[0].round, 'Fourth Round Qualifying');
assert.deepEqual(fa[0].tv.channels, ['BBC Sport']);
assert.ok(fa[0].tv.sources.includes('thefa.com'));

// TNT's schedule unreachable: every Europa League game is still listed (fixtures come from UEFA);
// games on TNT's TV channels keep their channel from the Sky guide, HBO Max-only games say
// "TV channel to be confirmed" - unless an earlier update already confirmed them
tntDown = true;
const noTnt = await build(Date.parse('2026-10-13T09:00:00Z'));
const withPrevious = await build(Date.parse('2026-10-13T09:00:00Z'), data);
tntDown = false;
assert.equal(noTnt.report.tntSchedule.ok, false);
const uel = (d, home) => d.events.find(e => e.comp === 'UEL' && e.home === home);
assert.equal(noTnt.events.filter(e => e.comp === 'UEL').length, 18);
assert.deepEqual(uel(noTnt, 'Lyon').tv.channels, ['TNT Sports 1']);
assert.deepEqual(uel(noTnt, 'Celta').tv.channels, []);
assert.equal(uel(noTnt, 'Celta').tv.note, 'TV channel to be confirmed');
assert.deepEqual(uel(withPrevious, 'Celta').tv.channels, ['HBO Max']);

console.log('\nAll Europa League, Championship and cup tests passed');
