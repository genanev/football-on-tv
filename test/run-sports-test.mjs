// Offline test for Formula 1, Formula 2 and darts.
//
// Replays real data captured on 12 Oct 2026 for the Azerbaijan weekend (24-26 Sept: F1 + F2)
// and the World Grand Prix darts (28 Sept - 4 Oct):
//   fixtures/f1-event-tracker-baku.json   formula1.com event tracker (meeting 1295)
//   fixtures/f2-event-tracker-baku.json   fiaformula2.com event tracker, Baku timetable
//   fixtures/f2-event-tracker-qatar.json  fiaformula2.com event tracker as returned on 12 Oct (next round)
//   fixtures/motogp-events-2026.json      motogp.com events feed for 2026 (Japan, Australia, Malaysia
//                                         weekends; trimmed), captured 20 Oct
//   fixtures/f3-racing-monza-2026.json    F3's Monza weekend (4-6 Sept) in the event tracker's format, taken on
//                                         20 Oct from fiaformula3.com/en/racing/2026/monza (the tracker itself
//                                         only returns the next weekend, and the F3 season had ended)
//   fixtures/pdc-tournaments-2026.json    PDC tournaments feed (mid-Sept to late Oct)
// Sky's TV guide only publishes today + ~8 days, so the guide entries below are written by hand
// in Sky's exact response format, at the real session times.
//
//   node test/run-sports-test.mjs              run the checks
//   node test/run-sports-test.mjs --write-demo also write demo-data.json (open the app with ?demo)

import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { build } from '../scripts/build.mjs';
import { ukDate, ukToUtc } from '../scripts/lib/util.mjs';
import { cleanName, dartsEvents } from '../scripts/sources/darts.mjs';
import { isLiveCoverage } from '../scripts/sources/skyGuide.mjs';
import { seriesOf, motorsportTv, sessionMatches, mapF3Tracker } from '../scripts/sources/motorsport.mjs';
import { mapMotoGpEvent, motoGpTitle, motoGpTv } from '../scripts/sources/motogp.mjs';
import { parseSkyPage } from '../scripts/sources/skyListings.mjs';

const fx = async (name) => JSON.parse(await readFile(new URL(`fixtures/${name}`, import.meta.url), 'utf8'));
const F1 = await fx('f1-event-tracker-baku.json');
const F2 = await fx('f2-event-tracker-baku.json');
const F2_QATAR = await fx('f2-event-tracker-qatar.json');
const F3_MONZA = await fx('f3-racing-monza-2026.json');
const MOTOGP = await fx('motogp-events-2026.json');
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
  prog(SKY_F1, '2026-09-24', '10:55', 60, 'Live Formula 2: Qualifying', 'Both qualifying sessions for the Formula 2 races in Baku.'),
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
  if (url.includes('api.motogp.pulselive.com/motogp/v1/events')) return json(/seasonYear=2026/.test(url) ? MOTOGP : []);
  if (url.includes('core-event-tracker/f3')) return json({ seasonContext: { seasonYear: '2026', seasonState: 'DURING-SEASON' } }); // as on 20 Oct: no next F3 weekend
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
assert.deepEqual(find(f2, 'Qualifying 2').tv.channels, ['Sky Sports F1']); // same programme covers both

// A session no official source lists gets no channel - never a guess from who holds the rights
const noProg = motorsportTv({ comp: 'F2', session: 'Qualifying', kickoff: '2026-09-24T10:30:00.000Z' }, { programmes: [], coveredDates: ['2026-09-24'] });
assert.deepEqual(noProg.channels, []);
assert.equal(noProg.broadcaster, null);
assert.equal(noProg.note, 'TV channel to be confirmed');

// Sky's own "F1 on Sky" page confirms sessions the TV guide doesn't cover yet (real page, 13 Oct:
// the United States GP, 23-25 Oct, is beyond the guide's 8 days)
const SKY_F1_PAGE = { entries: parseSkyPage(readFileSync(new URL('fixtures/skysports-f1-on-sky-2026-10-13.html', import.meta.url), 'utf8'), Date.parse('2026-10-13T20:00:00Z')).map(e => ({ ...e, page: 'f1-on-sky' })) };
assert.ok(sessionMatches({ comp: 'F1', session: 'Qualifying' }, 'MSC Cruises United States GP - Qualifying 1'));
assert.ok(!sessionMatches({ comp: 'F1', session: 'Race' }, 'MSC Cruises United States GP - Grand Prix Sunday'));
const usQuali = motorsportTv({ comp: 'F1', session: 'Qualifying', kickoff: '2026-10-24T21:00:00.000Z' }, null, SKY_F1_PAGE);
assert.deepEqual(usQuali.channels, ['Sky Sports F1']);
assert.ok(usQuali.sources.includes('skysports.com'));
assert.deepEqual(motorsportTv({ comp: 'F1', session: 'Race', kickoff: '2026-10-25T20:00:00.000Z' }, null, SKY_F1_PAGE).channels, ['Sky Sports F1']);
assert.equal(motorsportTv({ comp: 'F1', session: 'Sprint', kickoff: '2026-10-24T17:00:00.000Z' }, null, SKY_F1_PAGE).note, 'TV channel to be confirmed');
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

// F3 (Monza, 4-6 Sept, real timetable): practice skipped; the two 10-minute qualifying groups
// (Group A 14:00, Group B 14:20 local) are one "Qualifying" entry, 14:00-14:30 local = 12:00-12:30 UTC
const f3 = mapF3Tracker(F3_MONZA);
assert.deepEqual(f3.map(e => `${e.session} ${e.kickoff}-${e.end.slice(11, 16)}`), [
  'Qualifying 2026-09-04T12:00:00.000Z-12:30',
  'Sprint Race 2026-09-05T07:30:00.000Z-08:15',
  'Feature Race 2026-09-06T06:15:00.000Z-07:05',
]);
assert.ok(f3.every(e => e.comp === 'F3' && e.title === 'Italy' && e.venue === 'Monza' && e.source === 'fiaformula3.com' && e.status === 'finished'));
assert.equal(data.report.formula3.ok, true); // no F3 weekend ahead in the off-season: ok, nothing listed
assert.equal(data.report.formula3.sessions, 0);
// TV: a Formula 3 programme on Sky Sports F1 confirms it; an F2 programme at the same time doesn't
const f3Prog = (title, start, mins) => ({ id: title, sid: SKY_F1, channel: 'Sky Sports F1', live: true, title, synopsis: '', start: Date.parse(start), end: Date.parse(start) + mins * 60000 });
assert.deepEqual(motorsportTv(f3[0], { programmes: [f3Prog('Live Formula 3: Qualifying', '2026-09-04T11:55:00Z', 45)] }).channels, ['Sky Sports F1']);
assert.equal(motorsportTv(f3[0], { programmes: [f3Prog('Live F2: Qualifying', '2026-09-04T11:55:00Z', 45)] }).note, 'TV channel to be confirmed');
assert.equal(seriesOf({ title: 'Live F3: Feature Race', synopsis: '' }), 'F3');

// MotoGP (MotoGP class only): qualifying (Q1 + Q2 as one), sprint and race of each GP weekend
assert.deepEqual(data.report.motogp, { ok: true, sessions: 0 }); // no MotoGP in the 24 Sept window
const aus = mapMotoGpEvent(MOTOGP.find(e => /AUSTRALIA/.test(e.name)));
assert.deepEqual(aus.map(e => `${e.session} ${e.kickoff}-${e.end.slice(11, 16)}`), [
  'Qualifying 2026-10-23T23:50:00.000Z-00:30', // 10:50-11:30 local (+11:00), Q1 to Q2
  'Sprint 2026-10-24T04:00:00.000Z-04:45',     // 15:00 local; races have no end time: 45 minutes
  'Race 2026-10-25T03:00:00.000Z-04:00',       // 14:00 local
]);
assert.ok(aus.every(e => e.comp === 'MOTOGP' && e.title === 'Grand Prix of Australia' && e.venue === 'Phillip Island' && e.status === 'upcoming'));
assert.ok(MOTOGP.flatMap(mapMotoGpEvent).filter(e => /Japan/.test(e.title)).every(e => e.status === 'finished'));
assert.equal(motoGpTitle('RED BULL GRAND PRIX OF SAN MARINO AND THE RIMINI RIVIERA'), 'Grand Prix of San Marino and the Rimini Riviera');
// Channels: Sky's guide (TNT Sports 2) and TNT's schedule (HBO Max), real entries for 23-25 Oct 2026
const TNT2 = 3627;
const gp = (title, start, mins, live = true) => ({ id: `${title}${start}`, sid: TNT2, channel: 'TNT Sports 2', live, title, synopsis: '', start: Date.parse(start), end: Date.parse(start) + mins * 60000 });
const motoGuide = { programmes: [
  gp('Live MotoGP: Australia Qualifying', '2026-10-23T23:00:00Z', 165),
  gp('Live Moto2/3: Australia Qualify.', '2026-10-24T01:45:00Z', 120),
  gp('Live MotoGP: Australia Sprint Race', '2026-10-24T03:45:00Z', 60),
  gp('MotoGP: Australia Sprint Race', '2026-10-24T12:00:00Z', 30, false), // replay
  gp('Live Moto2: GP of Australia', '2026-10-25T01:00:00Z', 135),        // on air at the MotoGP race's start time
  gp('Live MotoGP: GP of Australia', '2026-10-25T03:15:00Z', 105),       // starts 15 minutes after it
] };
const tntProg = (subtitle, start, mins, channel = 'HBO Max') => ({ title: 'MotoGP | Australia', subtitle, channel, live: true, start: Date.parse(start), end: Date.parse(start) + mins * 60000 });
const motoTnt = { programmes: [
  tntProg('Sprint Race', '2026-10-24T04:00:00Z', 25),
  tntProg('Race', '2026-10-25T03:00:00Z', 45),
  { ...tntProg('', '2026-10-24T04:45:00Z', 15, 'TNT Sports 2'), title: 'MotoGP Rewind', live: false },
] };
const motoTv = (e) => { const tv = motoGpTv(e, motoGuide, motoTnt); return `${tv.channels[0]} | ${tv.alsoOn.join(', ')}`; };
assert.deepEqual(aus.map(motoTv), ['TNT Sports 2 | ', 'TNT Sports 2 | HBO Max', 'TNT Sports 2 | HBO Max']);
assert.deepEqual(motoGpTv(aus[2], motoGuide, motoTnt).sources, ['sky-guide', 'tntsports.co.uk']);
assert.equal(motoGpTv(aus[0], { programmes: [] }, null).note, 'TV channel to be confirmed');

// ITV doesn't start live titles with "Live": the European Championship on ITV4 (real guide entries,
// captured 20 Oct 2026) is still one session per programme, while a highlights show and a short
// programme on the same days are not
const ITV4 = 6534;
const ec = { id: 'ec', name: 'European Championship', venue: 'Westfalenhallen, Dortmund', startDate: '2026-10-22', endDate: '2026-10-25', televised: true };
const itv = (start, mins, title, synopsis) => ({ id: `itv-${start}`, sid: ITV4, channel: 'ITV4', start: Date.parse(start), end: Date.parse(start) + mins * 60000, live: false, title, synopsis });
const itvGuide = { programmes: [
  itv('2026-10-22T17:00:00Z', 240, 'Darts: European Championship', 'Pete Graces, Chris Mason and Maxx Hopp present day one of the European Championship Darts from Westfalenhallen in Dortmund, featuring eight first-round ties.'),
  itv('2026-10-23T17:00:00Z', 240, 'Darts: European Championship', 'The first round concludes at the European Championship Darts in Dortmund, with eight more matches and places in the last 16 up for grabs.'),
  itv('2026-10-24T11:00:00Z', 240, 'Darts: European Championship', 'The race for the European Championship title steps up a gear in Dortmund. Four last-16 matches take centre stage, with a place in the last eight at stake.'),
  itv('2026-10-24T17:00:00Z', 240, 'Darts: European Championship', "The last 16 concludes at the European Championship as four more players book their places in Sunday's quarter-finals."),
  itv('2026-10-25T12:00:00Z', 240, 'Darts: European Championship', "It's quarter-finals time at the European Championship in Dortmund. Eight players remain, but only four can progress to tonight's showpiece."),
  itv('2026-10-25T18:00:00Z', 240, 'Darts: European Championship', 'The European Championship reaches its thrilling conclusion in Dortmund, with two semi-finals followed by the final. Only one player can be crowned European champion.'),
  itv('2026-10-23T09:00:00Z', 60, 'Darts: European Championship Highlights', 'Highlights of day one in Dortmund.'), // made up
  itv('2026-10-24T10:30:00Z', 30, 'Darts: European Championship Preview', 'A look ahead to the last 16.'), // made up
] };
const ecEvents = dartsEvents([ec], itvGuide, '2026-10-22', 4);
assert.deepEqual(ecEvents.map(e => `${ukDate(Date.parse(e.kickoff))} ${e.session} ${e.tv.channels[0]}`), [
  '2026-10-22 Evening session ITV4', '2026-10-23 Evening session ITV4',
  '2026-10-24 Afternoon session ITV4', '2026-10-24 Evening session ITV4',
  '2026-10-25 Afternoon session ITV4', '2026-10-25 Evening session ITV4',
]);
assert.ok(ecEvents.every(e => !e.allDay && e.tv.note == null));
// Sky's own non-"Live" darts programmes are still not live coverage (e.g. "PDC Classics" above)
assert.ok(!isLiveCoverage({ sid: 4090, live: false, title: 'PDC Classics 2023', synopsis: '', start: 0, end: 3600000 }));

// TV guide down: sessions still listed, with the expected channel / TBC
guideDown = true;
const noGuide = await build(NOW);
guideDown = false;
assert.equal(noGuide.report.tvGuide.ok, false);
assert.equal(noGuide.events.filter(e => e.comp === 'F1').length, 2);
assert.ok(noGuide.events.filter(e => e.comp === 'F1').every(e => !e.tv.channels.length && e.tv.note === 'TV channel to be confirmed'));
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
