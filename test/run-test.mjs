// Offline test for the Premier League and Champions League, and the shared time/name helpers.
//
// Replays real data captured on 13 Oct 2026 for the week 13-21 Oct:
//   fixtures/pl-current-gameweek-2026-10-13.json        premierleague.com current matchweek (7)
//   fixtures/pl-matchweek-7-2026-10-13.json             premierleague.com matches, matchweek 7
//   fixtures/pl-matchweek-8-2026-10-13.json             premierleague.com matches, matchweek 8
//   fixtures/uefa-champions-league-2026-10-13.json      uefa.com feed, Champions League 12-22 Oct
//   fixtures/sky-guide-football-2026-10-13.json         Sky TV guide 13-21 Oct, football channels
//   fixtures/skysports-football-on-sky-2026-10-13.html  skysports.com "Football on Sky" (listings only)
//   fixtures/tnt-schedule-football-2026-10-13.json      TNT Sports' schedule 13-21 Oct (football only)
//   fixtures/primevideo-ucl-tournament-2026-10-13.html  Prime Video's Champions League page (event cards)
// The Premier League's broadcaster feed answers by the requester's country; from GitHub (US) it
// gives no UK channels, so it's mocked as empty here and checked on its own below.
//
//   node test/run-test.mjs              run the checks
//   node test/run-test.mjs --write-sample also write data.json from the fixtures (don't commit that)

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build, keepKnownChannels, teamSim, ukToUtc, parsePlKickoff, ukDate, mapPlBroadcasts } from '../scripts/build.mjs';
import { footballTv } from '../scripts/sources/footballTv.mjs';
import { guideProgrammesFor } from '../scripts/sources/football.mjs';

const fx = (name) => readFile(new URL(`fixtures/${name}`, import.meta.url), 'utf8');
const GAMEWEEK = JSON.parse(await fx('pl-current-gameweek-2026-10-13.json'));
const MW = { 7: JSON.parse(await fx('pl-matchweek-7-2026-10-13.json')), 8: JSON.parse(await fx('pl-matchweek-8-2026-10-13.json')) };
const UCL = JSON.parse(await fx('uefa-champions-league-2026-10-13.json'));
const GUIDE = JSON.parse(await fx('sky-guide-football-2026-10-13.json'));
const SKY_FOOTBALL = await fx('skysports-football-on-sky-2026-10-13.html');
const TNT = JSON.parse(await fx('tnt-schedule-football-2026-10-13.json'));
const PRIME = await fx('primevideo-ucl-tournament-2026-10-13.html');

// ---------- mock fetch
let down = null; // a source to make fail
globalThis.fetch = async (url) => {
  const json = (b) => ({ ok: true, status: 200, json: async () => b, text: async () => JSON.stringify(b) });
  const html = (b) => ({ ok: true, status: 200, text: async () => b });
  if (down && url.includes(down)) return { ok: false, status: 503 };
  if (url.includes('current-gameweek')) return json(GAMEWEEK);
  if (url.includes('/api/v2/matches')) return json(MW[+/matchweek=(\d+)/.exec(url)[1]] || { data: [] });
  if (url.includes('broadcasting/match-events')) return json({ content: [] }); // as seen from GitHub's US servers
  if (url.includes('match.uefa.com')) return json(/competitionId=1&/.test(url) ? UCL : []);
  if (url.includes('awk.epgsky.com')) {
    const [, ymd, sids] = /schedule\/(\d{8})\/([\d,]+)/.exec(url);
    const day = GUIDE[ymd];
    const want = new Set(sids.split(','));
    return json(day ? { ...day, schedule: day.schedule.filter(s => want.has(String(s.sid))) } : { date: ymd, schedule: [] });
  }
  if (url.includes('skysports.com/watch/football-on-sky')) return html(SKY_FOOTBALL);
  if (url.includes('primevideo.com/tournament')) return html(PRIME);
  if (url.includes('netsport.eurosport.io')) {
    const date = JSON.parse(new URL(url).searchParams.get('variables')).date;
    return json(TNT[date] || { data: { programsByDate: { edges: [], pageInfo: { hasNextPage: false } } } });
  }
  return { ok: false, status: 404 }; // other competitions are covered by their own tests
};

// ---------- unit checks: time and names
assert.equal(new Date(ukToUtc(2026, 10, 10, 12, 30)).toISOString(), '2026-10-10T11:30:00.000Z'); // BST
assert.equal(new Date(ukToUtc(2026, 12, 5, 15, 0)).toISOString(), '2026-12-05T15:00:00.000Z');  // GMT
assert.equal(new Date(ukToUtc(2026, 10, 25, 14, 0)).toISOString(), '2026-10-25T14:00:00.000Z'); // day clocks go back
assert.equal(new Date(parsePlKickoff('2026-10-10 12:30:00', 'BST')).toISOString(), '2026-10-10T11:30:00.000Z');
assert.equal(ukDate(Date.parse('2026-10-10T23:30:00Z')), '2026-10-11');
assert.ok(teamSim('Atleti', 'Atlético Madrid') >= 0.85);
assert.ok(teamSim('Paris', 'PSG') >= 0.85);
assert.ok(teamSim('Bodø/Glimt', 'Bodo/Glimt') >= 0.85);
assert.ok(teamSim('B. Dortmund', 'Borussia Dortmund') >= 0.85);
assert.ok(teamSim('Bayern München', 'Bayern Munich') >= 0.85);
assert.ok(teamSim('Spurs', 'Tottenham Hotspur') >= 0.85);
assert.ok(teamSim("Nott'm Forest", 'Nottingham Forest') >= 0.85);
assert.ok(teamSim('Manchester United', 'Manchester City') < 0.85);

// Youth and women's games in the guide are other teams
const u19 = { sid: 3625, channel: 'TNT Sports 1', live: true, title: 'Live: Atletico U19 v Man Utd U19', synopsis: '', start: Date.parse('2026-10-13T18:00:00Z'), end: Date.parse('2026-10-13T21:00:00Z') };
assert.equal(guideProgrammesFor({ home: 'Atleti', away: 'Man Utd', kickoff: '2026-10-13T19:00:00.000Z' }, [u19], [3625]).length, 0);

// The Premier League's own UK broadcaster (when asked from the UK) gives the brand
const plUk = mapPlBroadcasts([{ contentReference: { id: 1 }, channels: [{ info: { name: 'Sky Sports', channelTypes: [{ mediaType: 'VIDEO' }], broadcaster: { restrictedCountries: ['GB'] } } }, { info: { name: 'NBC', channelTypes: [{ mediaType: 'VIDEO' }], broadcaster: { restrictedCountries: ['US'] } } }] }]);
assert.deepEqual(plUk['1'], ['Sky Sports']);
const brandOnly = footballTv({ comp: 'PL', home: 'A', away: 'B', kickoff: '2026-10-24T11:30:00.000Z' }, { plBrands: plUk['1'] }).tv;
assert.equal(brandOnly.broadcaster, 'Sky Sports');
assert.deepEqual(brandOnly.channels, []);

// ---------- full build, "now" = Tue 13 Oct 2026 10:00 UK
const data = await build(Date.parse('2026-10-13T09:00:00Z'));
const uk = (iso) => new Date(iso).toLocaleString('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
console.log(JSON.stringify({ premierLeague: data.report.premierLeague, championsLeague: data.report.championsLeague, footballChannels: data.report.footballChannels }));
for (const m of data.events) {
  console.log(m.comp.padEnd(4), uk(m.kickoff).padEnd(14), `${m.home} v ${m.away}`.padEnd(44), (m.tv.channels.join(', ') || '-').padEnd(26), m.tv.alsoOn.length ? `+ ${m.tv.alsoOn.join(', ')}` : '', m.tv.note && !m.tv.channels.length ? m.tv.note : '', m.tv.sources.join('+'));
}
const find = (comp, home) => data.events.find(e => e.comp === comp && e.home === home);
const pl = data.events.filter(e => e.comp === 'PL');
const ucl = data.events.filter(e => e.comp === 'UCL');

// Premier League: Sky games from the TV guide, TNT's game from the guide + TNT's schedule,
// Saturday 15:00 blackout; nothing from the old fan site
assert.equal(pl.length, 10);
assert.deepEqual(find('PL', 'Everton').tv.channels, ['TNT Sports 1']);
assert.deepEqual(find('PL', 'Everton').tv.sources, ['sky-guide', 'tntsports.co.uk']);
assert.deepEqual(find('PL', 'Newcastle United').tv.channels, ['Sky Sports Main Event']);
assert.deepEqual(find('PL', 'Newcastle United').tv.alsoOn, ['Sky Sports Premier League']);
assert.deepEqual(find('PL', 'Leeds United').tv.channels, ['Sky Sports Main Event']);
assert.deepEqual(find('PL', 'Bournemouth').tv.channels, ['Sky Sports+']);
assert.deepEqual(find('PL', 'Brighton and Hove Albion').tv.channels, ['Sky Sports Premier League']);
assert.deepEqual(find('PL', 'Nottingham Forest').tv.channels, ['Sky Sports Main Event']); // "Live PL: Nott'm Forest v Arsenal"
assert.deepEqual(find('PL', 'Tottenham Hotspur').tv.channels, ['Sky Sports Main Event']); // "Live MNF: Spurs v Coventry City"
for (const home of ['Brentford', 'Fulham', 'Manchester City']) {
  assert.equal(find('PL', home).tv.note, 'Not shown live on UK TV');
  assert.deepEqual(find('PL', home).tv.channels, []);
}
assert.ok(data.events.every(e => !e.tv.sources.includes('listings')));

// Champions League: TNT's TV channels from the guide + TNT, HBO Max streams from TNT's schedule,
// Amazon's Tuesday pick from Prime Video's own Champions League page
assert.equal(ucl.length, 36);
const arsenal = ucl.find(e => e.home === 'Arsenal' && e.away === 'Lille');
assert.deepEqual(arsenal.tv.channels, ['TNT Sports 1']);
assert.deepEqual(arsenal.tv.alsoOn, ['HBO Max']);
assert.deepEqual(find('UCL', 'Villarreal').tv.channels, ['HBO Max']);
assert.deepEqual(find('UCL', 'Villarreal').tv.sources, ['tntsports.co.uk']);
const atleti = ucl.find(e => e.kickoff === '2026-10-13T19:00:00.000Z' && /Atl/.test(e.home));
assert.deepEqual(atleti.tv.channels, ['Amazon Prime Video']);
assert.deepEqual(atleti.tv.sources, ['primevideo.com']);
assert.equal(`${atleti.home} v ${atleti.away}`, 'Atlético Madrid v Manchester United'); // Amazon's names, not UEFA's "Atleti v Man Utd"
assert.deepEqual(ucl.find(e => e.home === 'Liverpool' && e.away === 'Villarreal').tv.channels, ['Amazon Prime Video']);
// TNT's games that Prime Video resells through the TNT Sports channel are not Amazon's
assert.ok(!ucl.some(e => e.home === 'LASK' && e.tv.channels.includes('Amazon Prime Video')));
assert.deepEqual(data.report.primeVideo.amazonPicks.slice(0, 2), ['Liverpool vs. Villarreal', 'Manchester United vs. Roma']);
// TNT's team names read better than UEFA's short ones
assert.ok(ucl.some(e => e.home === 'Manchester City' && e.away === 'Paris Saint-Germain'));
assert.equal(data.report.footballChannels, '43/46 PL+UCL matches with a confirmed channel'); // the other 3: Saturday 15:00

// A failing source must not break the rest: TNT's schedule down -> TNT channel games still come
// from the guide, HBO Max-only games say "TV channel to be confirmed"
down = 'netsport.eurosport.io';
const noTnt = await build(Date.parse('2026-10-13T09:00:00Z'));
down = null;
assert.equal(noTnt.report.tntSchedule.ok, false);
assert.deepEqual(noTnt.events.find(e => e.comp === 'PL' && e.home === 'Everton').tv.channels, ['TNT Sports 1']);
assert.equal(noTnt.events.find(e => e.comp === 'UCL' && e.home === 'Villarreal').tv.note, 'TV channel to be confirmed');

// Prime Video's page down: Amazon's game says "TV channel to be confirmed" (no guess)...
down = 'primevideo.com';
const noPrime = await build(Date.parse('2026-10-13T09:00:00Z'));
down = null;
assert.equal(noPrime.report.primeVideo.ok, false);
assert.equal(noPrime.events.find(e => e.comp === 'UCL' && e.home === 'Liverpool' && e.away === 'Villarreal').tv.note, 'TV channel to be confirmed');
// ...unless an earlier update found it: it then stays until the end of the match day
const primeKept = await build(Date.parse('2026-10-13T09:00:00Z'), data);
assert.deepEqual(primeKept.events.find(e => e.comp === 'UCL' && e.home === 'Liverpool' && e.away === 'Villarreal').tv.channels, ['Amazon Prime Video']);

// ...and with the previous update to hand, a confirmed channel is kept - but never one that came
// from the old fan-site listings
const prevWithTnt = await build(Date.parse('2026-10-13T09:00:00Z'), data);
assert.deepEqual(prevWithTnt.events.find(e => e.comp === 'UCL' && e.home === 'Villarreal').tv.channels, ['HBO Max']);
const kept = keepKnownChannels(
  [{ id: 'x', tv: { channels: [], note: 'TV channel to be confirmed', sources: [] } }, { id: 'y', tv: { channels: [], note: 'TV channel to be confirmed', sources: [] } }],
  { events: [{ id: 'x', tv: { channels: ['Amazon Prime Video'], sources: ['listings'] } }, { id: 'y', tv: { channels: ['HBO Max'], sources: ['tntsports.co.uk'] } }] });
assert.deepEqual(kept[0].tv.channels, []);
assert.deepEqual(kept[1].tv.channels, ['HBO Max']);
assert.ok(kept[1].tv.sources.includes('previous-update'));

console.log('\nAll tests passed');

// Save a sample data.json so the app has something to show before the first live update
if (process.argv.includes('--write-sample')) {
  const { writeFile } = await import('node:fs/promises');
  await writeFile(new URL('../data.json', import.meta.url), JSON.stringify(data, null, 1));
  console.log('sample data.json written');
}
