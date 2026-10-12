// Offline test for Formula 1, Formula 2 and darts.
//
// Replays real data captured on 12 Oct 2026 for the Azerbaijan weekend (24-26 Sept: F1 + F2)
// and the World Grand Prix darts (28 Sept - 4 Oct):
//   fixtures/f1-event-tracker-baku.json   formula1.com event tracker (meeting 1295)
//   fixtures/f2-event-tracker-baku.json   fiaformula2.com event tracker, Baku timetable
//   fixtures/f2-event-tracker-qatar.json  fiaformula2.com event tracker as returned on 12 Oct (next round)
//   fixtures/pdc-tournaments-2026.json    PDC tournaments feed (mid-Sept to late Oct)
// Sky's TV guide only publishes today + ~8 days, so the guide entries below are written by hand
// in Sky's exact response format, at the real session times.
//
//   node test/run-sports-test.mjs              run the checks
//   node test/run-sports-test.mjs --write-demo also write demo-data.json (open the app with ?demo)

import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { build } from '../scripts/build.mjs';
import { ukDate, ukToUtc } from '../scripts/lib/util.mjs';
import { cleanName } from '../scripts/sources/darts.mjs';
import { seriesOf } from '../scripts/sources/motorsport.mjs';

const fx = async (name) => JSON.parse(await readFile(new URL(`fixtures/${name}`, import.meta.url), 'utf8'));
const F1 = await fx('f1-event-tracker-baku.json');
const F2 = await fx('f2-event-tracker-baku.json');
const F2_QATAR = await fx('f2-event-tracker-qatar.json');
const PDC = await fx('pdc-tournaments-2026.json');

// ---------- Sky TV guide entries (UK local times)
const SKY_F1 = 3835, MAIN = 4002, PLUS = 3940, MIX = 4090;
let eid = 0;
const prog = (sid, date, hhmm, mins, t, sy = '') => {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = hhmm.split(':').map(Number);
  return { sid, ev: { st: ukToUtc(y, m, d, hh, mm) / 1000, d: mins * 60, eid: `E${(++eid).toString(16)}`, t, sy, eg: 7, esg: 11, s: true, hd: true, new: false } };
};
const GUIDE = [
  prog(SKY_F1, '2026-09-24', '10:55', 30, 'Live Formula 2: Qualifying 1', 'Qualifying for the Formula 2 races in Baku.'),
  // (no programme for F2 Qualifying 2 at 11:30, to check the fallback)
  prog(SKY_F1, '2026-09-24', '20:00', 60, 'Ted\'s Notebook: Azerbaijan', 'Ted Kravitz is live in the paddock.'),
  prog(SKY_F1, '2026-09-25', '05:05', 65, 'Live F2: Sprint Race', 'The Formula 2 sprint race from Baku City Circuit.'),
  prog(SKY_F1, '2026-09-25', '11:05', 80, 'Live Formula 2: Feature Race 1', ''),
  prog(SKY_F1, '2026-09-25', '12:30', 120, 'Live F1: Azerbaijan GP Qualifying', 'Qualifying from Baku.'),
  prog(MAIN, '2026-09-25', '12:45', 90, 'Live F1: Azerbaijan Qualifying', 'Qualifying from Baku.'),
  prog(SKY_F1, '2026-09-25', '20:00', 60, 'Azerbaijan GP Qualifying', 'Another chance to see qualifying.'), // repeat
  prog(SKY_F1, '2026-09-26', '07:50', 70, 'Live F2: Feature Race 2', ''),
  prog(SKY_F1, '2026-09-26', '10:30', 90, 'Live Grand Prix Saturday: Azerbaijan', 'Build-up to the race.'),
  prog(SKY_F1, '2026-09-26', '12:00', 120, 'Live Azerbaijan Grand Prix', 'Lights out in Baku.'),
  prog(SKY_F1, '2026-09-26', '14:00', 60, 'Live Chequered Flag: Azerbaijan', 'Reaction from the race.'),
  prog(MIX, '2026-09-27', '00:30', 60, 'PDC Classics 2023', 'Revisit a classic World Darts Championship match.'), // not live
  prog(MAIN, '2026-09-28', '17:00', 360, 'Live World Grand Prix Darts', 'Day one of the double-in, double-out World Grand Prix in Leicester.'),
  prog(MAIN, '2026-09-29', '17:00', 360, 'Live World Grand Prix Darts', 'The first round concludes in Leicester.'),
  prog(PLUS, '2026-09-30', '18:00', 300, 'Live World Grand Prix', 'Second-round darts action from Leicester.'),
  prog(MIX, '2026-09-30', '18:00', 300, 'Live World Grand Prix', 'Second-round darts action from Leicester.'),
  prog(MAIN, '2026-10-01', '18:00', 120, 'Live World Grand Prix Darts', 'Second round, part one.'),
  prog(MAIN, '2026-10-01', '20:00', 180, 'Live World Grand Prix Darts', 'Second round, part two.'),
  prog(MAIN, '2026-10-02', '13:00', 120, 'Live: WTA Wuhan', 'Tennis.'), // something on 2 Oct, but no darts listed yet
];
for (const d of ['2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01']) GUIDE.push(prog(SKY_F1, d, '09:00', 30, 'The F1 Show', ''));

function skyDay(url) {
  const [, ymd, sids] = /schedule\/(\d{8})\/([\d,]+)/.exec(url);
  const date = `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6)}`;
  const wanted = sids.split(',').map(Number);
  const schedule = wanted.map(sid => ({ sid: String(sid), events: GUIDE.filter(g => g.sid === sid && ukDate(g.ev.st * 1000) === date).map(g => g.ev) }));
  return { date: ymd, schedule };
}

// ---------- mock fetch
let guideDown = false, f2Feed = F2;
globalThis.fetch = async (url) => {
  const json = (b) => ({ ok: true, status: 200, json: async () => b });
  if (url.includes('api.formula1.com/v1/event-tracker')) return json(F1);
  if (url.includes('core-event-tracker/f2')) return json(f2Feed);
  if (url.includes('tournaments.darts')) return json(/seasonID=2026/.test(url) ? PDC : { data: [], meta: { totalCount: 0 } });
  if (url.includes('awk.epgsky.com')) return guideDown ? { ok: false, status: 503 } : json(skyDay(url));
  return { ok: false, status: 404 }; // football sources are covered by run-test.mjs
};

// ---------- unit checks
assert.equal(cleanName('2026 World Grand Prix'), 'World Grand Prix');
assert.equal(cleanName('2026/27 World Championship'), 'World Championship');
assert.equal(seriesOf({ title: 'Live F2: Sprint Race', synopsis: '' }), 'F2');
assert.equal(seriesOf({ title: 'Live Azerbaijan Grand Prix', synopsis: '' }), 'F1');
assert.equal(seriesOf({ title: 'Live F1 Academy', synopsis: '' }), 'other');

// ---------- full build, "now" = Thu 24 Sept 2026 07:00 UK
const NOW = Date.parse('2026-09-24T06:00:00Z');
const data = await build(NOW);
const uk = (iso) => new Date(iso).toLocaleString('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
console.log(JSON.stringify(data.report, null, 1));
for (const e of data.events) {
  console.log(e.comp.padEnd(6), (e.allDay ? 'all day' : uk(e.kickoff)).padEnd(14), `${e.title} · ${e.session || ''}`.padEnd(46),
    (e.tv.channels.join(', ') || e.tv.broadcaster || '-').padEnd(24), e.tv.alsoOn.length ? `+ ${e.tv.alsoOn.join(', ')}` : '', e.tv.note || '');
}

const f1 = data.events.filter(e => e.comp === 'F1');
const f2 = data.events.filter(e => e.comp === 'F2');
const darts = data.events.filter(e => e.comp === 'DARTS');
const find = (list, session) => list.find(e => e.session === session);

assert.equal(data.report.formula1.ok, true);
assert.equal(data.report.formula2.ok, true);
assert.equal(data.report.darts.ok, true);
assert.equal(data.report.tvGuide.ok, true);
assert.equal(data.report.premierLeague.ok, false); // independent failure must not stop the rest

// F1: practice is skipped; qualifying + race at the right UK times
assert.deepEqual(f1.map(e => e.session), ['Qualifying', 'Race']);
assert.equal(find(f1, 'Qualifying').kickoff, '2026-09-25T12:00:00.000Z'); // 16:00 Baku = 13:00 UK
assert.equal(find(f1, 'Race').kickoff, '2026-09-26T11:00:00.000Z');
assert.equal(find(f1, 'Race').title, 'Azerbaijan Grand Prix');
assert.deepEqual(find(f1, 'Qualifying').tv.channels, ['Sky Sports F1']);
assert.deepEqual(find(f1, 'Qualifying').tv.alsoOn, ['Sky Sports Main Event']);
assert.deepEqual(find(f1, 'Race').tv.channels, ['Sky Sports F1']);
assert.equal(find(f1, 'Race').tv.confirmed, true);

// F2: five race-weekend sessions, F2 programmes only, missing one falls back to the rights holder
assert.deepEqual(f2.map(e => e.session), ['Qualifying 1', 'Qualifying 2', 'Sprint Race', 'Feature Race 1', 'Feature Race 2']);
assert.equal(f2[0].title, 'Azerbaijan');
assert.deepEqual(find(f2, 'Qualifying 1').tv.channels, ['Sky Sports F1']);
assert.deepEqual(find(f2, 'Qualifying 2').tv.channels, []);
assert.equal(find(f2, 'Qualifying 2').tv.broadcaster, 'Sky Sports F1');
assert.equal(find(f2, 'Qualifying 2').tv.note, 'Not yet confirmed in the TV guide');
assert.deepEqual(find(f2, 'Sprint Race').tv.channels, ['Sky Sports F1']);
assert.ok(f2.every(e => e.status === 'finished' && !e.timeTbc));

// Darts: only the televised World Grand Prix (not the qualifiers/Challenge Tour in the same days)
assert.deepEqual(data.report.darts.tournaments, ['World Grand Prix']);
assert.deepEqual(darts.map(e => ukDate(Date.parse(e.kickoff))), ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02']);
assert.equal(darts[0].kickoff, '2026-09-28T16:00:00.000Z');
assert.equal(darts[0].session, 'Evening session');
assert.deepEqual(darts[0].tv.channels, ['Sky Sports Main Event']);
assert.deepEqual(darts[2].tv.channels, ['Sky Sports+']);
assert.deepEqual(darts[2].tv.alsoOn, ['Sky Sports Mix']);
assert.equal(darts[3].end, '2026-10-01T22:00:00.000Z'); // two back-to-back programmes = one session
assert.equal(darts[4].allDay, true);
assert.equal(darts[4].tv.note, 'TV times to be confirmed');
assert.ok(darts.every(e => e.title === 'World Grand Prix' && e.venue === 'Mattioli Arena, Leicester'));

// TV guide down: sessions still listed, with the expected channel / TBC
guideDown = true;
const noGuide = await build(NOW);
guideDown = false;
assert.equal(noGuide.report.tvGuide.ok, false);
assert.equal(noGuide.events.filter(e => e.comp === 'F1').length, 2);
assert.ok(noGuide.events.filter(e => e.comp === 'F1').every(e => e.tv.broadcaster === 'Sky Sports F1' && /not available/.test(e.tv.note)));
assert.ok(noGuide.events.filter(e => e.comp === 'DARTS').every(e => e.allDay));

// Today's real F2 answer (next round Qatar, 27-29 Nov): nothing in a 12 Oct window, and provisional times are flagged
f2Feed = F2_QATAR;
const oct = await build(Date.parse('2026-10-12T09:00:00Z'));
assert.equal(oct.report.formula2.sessions, 0);
const late = await build(Date.parse('2026-11-25T09:00:00Z'));
const qatar = late.events.filter(e => e.comp === 'F2');
assert.deepEqual(qatar.map(e => e.session), ['Qualifying', 'Sprint Race', 'Feature Race']);
assert.ok(qatar.every(e => e.timeTbc));
f2Feed = F2;

console.log('\nAll sports tests passed');

if (process.argv.includes('--write-demo')) {
  await writeFile(new URL('../demo-data.json', import.meta.url), JSON.stringify(data, null, 1));
  console.log('demo-data.json written (open the app with ?demo to see it)');
}
