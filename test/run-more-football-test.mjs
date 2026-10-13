// Offline test for the Europa League, Championship, League Cup and FA Cup.
//
// Replays real data captured on 13 Oct 2026 (evening, so Tuesday's Championship games are mid-match):
//   fixtures/uefa-europa-league-2026-10-13.json   uefa.com feed, Europa League 12-22 Oct
//   fixtures/efl-matches-2026-10-13.json          efl.com feed, Championship + League Cup 13-22 Oct
//   fixtures/thefa-facup-fixtures-2026-10-13.html thefa.com FA Cup fixtures (tables only)
//   fixtures/sky-guide-football-2026-10-13.json   Sky TV guide 13-21 Oct, football channels
//                                                 (football programmes kept, plus one other per channel/day)
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

// ---------- mock fetch
globalThis.fetch = async (url) => {
  const json = (b) => ({ ok: true, status: 200, json: async () => b, text: async () => JSON.stringify(b) });
  if (url.includes('match.uefa.com')) return json(/competitionId=14\b/.test(url) ? UEL : []);
  if (url.includes('eflservices.co.uk')) return json(EFL);
  if (url.includes('thefa.com')) return { ok: true, status: 200, text: async () => FA };
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
assert.equal(find('Celta').tv.broadcaster, 'TNT Sports');
assert.equal(find('Celta').tv.note, 'Expected – To Be Confirmed');
assert.ok(!data.events.some(e => e.home === 'Brighton')); // Conference League ("Live UCoL: ...") isn't included

// Championship: every match; TV picks from the guide, 3pm Saturday blackout, Sky Sports+ expected otherwise
const champ = data.events.filter(e => e.comp === 'CHAMP');
assert.equal(champ.length, 25);
assert.deepEqual(find('Stoke City').tv.channels, ['Sky Sports Main Event']);
assert.deepEqual(find('Stoke City').tv.alsoOn, ['Sky Sports Football']);
assert.deepEqual(champ.find(e => e.home === 'Millwall' && e.away === 'Swansea City').tv.channels, ['Sky Sports+']);
assert.deepEqual(find('Lincoln City').tv.channels, ['Sky Sports Main Event']); // "Live EFL: Lincoln City v West Ham"
assert.equal(champ.find(e => e.home === 'Bristol City' && e.away === 'Blackburn Rovers').tv.note, 'Expected – To Be Confirmed');
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

console.log('\nAll Europa League, Championship and cup tests passed');
