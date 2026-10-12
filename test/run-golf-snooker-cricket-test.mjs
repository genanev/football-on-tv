// Offline test for golf, snooker and cricket.
//
// Replays real data captured on 12 Oct 2026 for the week 12-20 Oct:
//   fixtures/sky-guide-2026-10-12.json         Sky TV guide, 12-20 Oct (sports programmes kept, plus
//                                              one other programme per channel and day)
//   fixtures/pgatour-schedule-2026.json        pgatour.com schedule feed
//   fixtures/dpworldtour-schedule-2026.html    europeantour.com schedule page (JSON-LD only)
//   fixtures/wst-tournaments-2026.json         WST tournaments feed (Sept-Dec)
//   fixtures/icc-schedule-2026-10-12.json      ICC fixtures feed, men's internationals 12-21 Oct
//
//   node test/run-golf-snooker-cricket-test.mjs              run the checks
//   node test/run-golf-snooker-cricket-test.mjs --write-demo also write demo-data-2.json (?demo=2)

import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { build } from '../scripts/build.mjs';
import { mapPgaSchedule, parseDpwtSchedule, mergeTours, tourOf } from '../scripts/sources/golf.mjs';
import { mapMatch, parseGmt } from '../scripts/sources/cricket.mjs';
import { cleanName } from '../scripts/sources/snooker.mjs';
import { sessionLabel } from '../scripts/sources/skyGuide.mjs';

const fx = (name) => readFile(new URL(`fixtures/${name}`, import.meta.url), 'utf8');
const GUIDE = JSON.parse(await fx('sky-guide-2026-10-12.json'));
const PGA = JSON.parse(await fx('pgatour-schedule-2026.json'));
const DPWT = await fx('dpworldtour-schedule-2026.html');
const WST = JSON.parse(await fx('wst-tournaments-2026.json'));
const ICC = JSON.parse(await fx('icc-schedule-2026-10-12.json'));

// ---------- mock fetch
let dpwtDown = false;
globalThis.fetch = async (url, opts = {}) => {
  const json = (b) => ({ ok: true, status: 200, json: async () => b, text: async () => JSON.stringify(b) });
  const no = { ok: false, status: 404 };
  if (url.includes('awk.epgsky.com')) {
    const [, ymd, sids] = /schedule\/(\d{8})\/([\d,]+)/.exec(url);
    const day = GUIDE[ymd];
    if (!day) return json({ date: ymd, schedule: [] });
    const want = new Set(sids.split(','));
    return json({ ...day, schedule: day.schedule.filter(s => want.has(String(s.sid))) });
  }
  if (url.includes('orchestrator.pgatour.com')) {
    const year = JSON.parse(opts.body).variables.year;
    return json(year === '2026' ? PGA : { data: { schedule: { completed: [], upcoming: [] } } });
  }
  if (url.includes('europeantour.com')) return !dpwtDown && /schedule\/$/.test(url) ? { ok: true, status: 200, text: async () => DPWT } : no;
  if (url.includes('wstservices.co.uk')) return json(/season=2026/.test(url) ? WST : { data: [] });
  if (url.includes('assets-icc.sportz.io')) return json(ICC);
  return no; // the other sports are covered by their own tests
};

// ---------- unit checks
assert.equal(cleanName('BetVictor Northern Ireland Open 2026'), 'BetVictor Northern Ireland Open');
assert.equal(new Date(parseGmt('10/20/2026', '08:00')).toISOString(), '2026-10-20T08:00:00.000Z');
assert.equal(sessionLabel(Date.parse('2026-10-19T09:00:00Z')), 'Morning session'); // 10:00 UK
assert.equal(sessionLabel(Date.parse('2026-10-19T12:00:00Z')), 'Afternoon session');
assert.equal(sessionLabel(Date.parse('2026-10-19T18:00:00Z')), 'Evening session');
assert.equal(tourOf({ title: 'Live LPGA Tour Golf', synopsis: '' }), 'LPGA'); // not mistaken for the PGA Tour
assert.equal(tourOf({ title: 'Live DP World Tour Golf', synopsis: '' }), 'DPWT');

// The majors appear on both tours' schedules under different names: one entry each
const tours = mergeTours([mapPgaSchedule(PGA), parseDpwtSchedule(DPWT)]);
const both = tours.filter(t => t.tours.size === 2).map(t => t.name);
for (const major of ['Masters Tournament', 'PGA Championship', 'U.S. Open', 'The Open Championship']) assert.ok(both.includes(major), major);
assert.ok(!both.includes('Hero Indian Open') && tours.some(t => t.name === 'BMW PGA CHAMPIONSHIP' && t.tours.size === 1));

// A five-day Test becomes five entries; warm-ups and non-Full-Member matches are dropped
const test = ICC.data.matches.find(m => m.teama === 'South Africa' && m.match_number === '2nd Test');
assert.deepEqual(mapMatch(test).map(e => e.session), ['2nd Test, Day 1', '2nd Test, Day 2', '2nd Test, Day 3', '2nd Test, Day 4', '2nd Test, Day 5']);
assert.equal(mapMatch({ ...test, comp_type: 'Warm-up T20 International - m' }).length, 0);
assert.equal(mapMatch({ ...test, teamb: 'Nepal' }).length, 0);

// ---------- full build, "now" = Mon 12 Oct 2026 22:00 UK
const NOW = Date.parse('2026-10-12T21:00:00Z');
const data = await build(NOW);
const uk = (iso) => new Date(iso).toLocaleString('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
for (const k of ['tvGuide', 'golf', 'snooker', 'cricket']) console.log(k, JSON.stringify(data.report[k]));
for (const e of data.events) {
  console.log(e.comp.padEnd(8), (e.allDay ? 'all day' : uk(e.kickoff)).padEnd(14), `${e.title} · ${e.session || ''}`.padEnd(58),
    (e.tv.channels.join(', ') || '-').padEnd(20), e.tv.alsoOn.length ? `+ ${e.tv.alsoOn.join(', ')}` : '', e.tv.note || '');
}
const golf = data.events.filter(e => e.comp === 'GOLF');
const snooker = data.events.filter(e => e.comp === 'SNOOKER');
const cricket = data.events.filter(e => e.comp === 'CRICKET');

// Golf: the DP World India Championship, Thu-Sun, on Sky Sports Golf; the LPGA event on the same
// channel that week is not one of the covered tours, and the PGA Tour's next event starts on 22 Oct
assert.equal(data.report.golf.ok, true);
assert.deepEqual(golf.map(e => e.session), ['Round 1', 'Round 2', 'Round 3', 'Round 4']);
assert.ok(golf.every(e => e.title === 'DP World India Championship' && e.venue === 'Delhi GC'));
assert.equal(golf[0].kickoff, '2026-10-15T05:30:00.000Z'); // 06:30 UK, after the LPGA coverage ends
assert.deepEqual(golf[0].tv.channels, ['Sky Sports Golf']);
assert.deepEqual(golf[0].tv.alsoOn, ['Sky Sports Main Event']);

// Snooker: Northern Ireland Open, TV days 19-20 Oct; two tables on TNT 1 and 4 count as one session
assert.equal(data.report.snooker.ok, true);
assert.ok(data.report.snooker.tournaments.includes('BetVictor Northern Ireland Open'));
assert.deepEqual(snooker.map(e => `${uk(e.kickoff)} ${e.session}`), [
  'Mon 19, 10:00 Morning session', 'Mon 19, 13:00 Afternoon session', 'Mon 19, 19:00 Evening session',
  'Tue 20, 10:00 Morning session', 'Tue 20, 13:00 Afternoon session', 'Tue 20, 19:00 Evening session',
]);
assert.deepEqual(snooker[0].tv.channels, ['TNT Sports 1']);
assert.deepEqual(snooker[0].tv.alsoOn, ['TNT Sports 4']);
assert.equal(snooker[1].end, '2026-10-19T16:00:00.000Z'); // 13:00-15:00 and 15:00-17:00 merge

// Cricket: only internationals live on UK TV (plus any England match)
const by = (title, session) => cricket.find(e => e.title === title && e.session === session);
assert.deepEqual(by('India v West Indies', '4th T20I').tv.channels, ['TNT Sports 1']);
assert.deepEqual(by('India v West Indies', '5th T20I').tv.channels, ['TNT Sports 3']); // unlabelled "India - T20 International Cricket"
assert.deepEqual(by('Pakistan v Sri Lanka', 'Match 1 (ODI)').tv.channels, ['Sky Sports+']);
const eng = by('Pakistan v England', 'Match 2 (ODI)');
assert.deepEqual(eng.tv.channels, ['Sky Sports Cricket']);
assert.deepEqual(eng.tv.alsoOn, ['Sky Sports Main Event']); // not TNT's "The Breakdown: Harry Kane"
assert.equal(by('South Africa v Australia', '2nd Test, Day 1').kickoff, '2026-10-18T08:00:00.000Z');
assert.ok(!cricket.some(e => /Bangladesh|Zimbabwe|Afghanistan/.test(e.title))); // not on UK TV
assert.ok(!cricket.some(e => e.title === 'Pakistan v Sri Lanka' && /T20I/.test(e.session))); // 13 Oct, not on UK TV

// DP World Tour site unreachable: the PGA Tour list still works, and the report says what failed
dpwtDown = true;
const partial = await build(NOW);
dpwtDown = false;
assert.equal(partial.report.golf.ok, true);
assert.equal(partial.report.golf.errors.length, 1);
assert.equal(partial.events.filter(e => e.comp === 'GOLF').length, 0); // the India event is DP World Tour only

console.log('\nAll golf, snooker and cricket tests passed');

if (process.argv.includes('--write-demo')) {
  await writeFile(new URL('../demo-data-2.json', import.meta.url), JSON.stringify(data, null, 1));
  console.log('demo-data-2.json written (open the app with ?demo=2 to see it)');
}
