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
//   fixtures/tnt-schedule-ucl-2026-11-03.json      TNT's schedule API, 3 Nov 2026 (captured that evening):
//                                         four Champions League entries, incl. two pub and bar feeds
// The Premier League's broadcaster feed answers by the requester's country; from GitHub (US) it
// gives no UK channels, so it's mocked as empty here and checked on its own below.
//
//   node test/run-test.mjs              run the checks
//   node test/run-test.mjs --write-sample also write data.json from the fixtures (don't commit that)

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { problems } from '../scripts/watch-check.mjs';
import worker, { runCheck, HOURLY } from '../cloud/watch-worker/worker.mjs';
import { build, keepKnownChannels, markFailingSince, teamSim, ukToUtc, parsePlKickoff, ukDate, mapPlBroadcasts } from '../scripts/build.mjs';
import { footballTv } from '../scripts/sources/footballTv.mjs';
import { guideProgrammesFor } from '../scripts/sources/football.mjs';
import { mapTntDay } from '../scripts/sources/tntSchedule.mjs';
import { parsePrimeTournament } from '../scripts/sources/amazonPrime.mjs';
import { fillAddress } from '../scripts/fill-address.mjs';

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
let primeUS = false; // serve Prime Video's US page, as GitHub's US servers get it
const PRIME_US = '<article data-card-title="LASK vs. Liverpool" data-card-entity-type="EVENT"><img src="https://m.media-amazon.com/images/G/02/digital/video/merch/subs/benefit-id/u-z/vixplusus/logos/channels-logo-white.png"> Tomorrow 5 PM EDT</article>'
  + '<article data-card-title="Arsenal vs. Lille" data-card-entity-type="EVENT"><img src="https://m.media-amazon.com/images/G/02/digital/video/merch/subs/benefit-id/a-f/cbsaacf/logos/channels-logo-white.png"></article>';
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
  if (url.includes('primevideo.com/tournament')) return html(primeUS ? PRIME_US : PRIME);
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
// TNT's pub and bar feeds aren't HBO Max (George, 3 Nov 2026): TNT's schedule listed Amazon's pick,
// Man Utd v Roma, on "TNT Sports" with a "live-event-tnt-commercial-premises-1" link, which hid
// Prime Video. Real entries (fixtures/tnt-schedule-ucl-2026-11-03.json, captured that evening): the
// pub feed, a pub copy of TNT Sports 4 and the real TNT Sports 4 for Villarreal v PSG, and a genuine
// HBO Max stream ("live-event-bolt-72") for Feyenoord v Inter.
const TNT_NOV3 = { programmes: mapTntDay(JSON.parse(await fx('tnt-schedule-ucl-2026-11-03.json'))) };
assert.deepEqual(TNT_NOV3.programmes.map(p => `${p.title}: ${p.channel}`), ['Villarreal - Paris Saint-Germain: TNT Sports 4', 'Feyenoord - Inter: HBO Max']);
const PRIME_PICKS = parsePrimeTournament(PRIME, Date.parse('2026-10-13T09:00:00Z')); // lists Man Utd v Roma for 3 Nov
const nov3 = (home, away) => ({ comp: 'UCL', kind: 'match', home, away, kickoff: '2026-11-03T20:00:00.000Z' });
const roma = footballTv(nov3('Manchester United', 'Roma'), { tnt: TNT_NOV3, prime: { cards: PRIME_PICKS } });
assert.deepEqual([roma.tv.channels, roma.tv.alsoOn, roma.tv.sources], [['Amazon Prime Video'], [], ['primevideo.com']]);
const psg = footballTv(nov3('Villarreal', 'Paris Saint-Germain'), { tnt: TNT_NOV3 });
assert.deepEqual([psg.tv.channels, psg.tv.alsoOn], [['TNT Sports 4'], []]); // no "also on HBO Max" from the pub copy
assert.deepEqual(footballTv(nov3('Feyenoord', 'Inter'), { tnt: TNT_NOV3 }).tv.channels, ['HBO Max']);

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

// When a source started failing (8 Nov 2026), for the hourly watcher's emails: this update's time on
// the first failure, carried over while it keeps failing, gone once it answers
assert.equal(noTnt.report.tntSchedule.failingSince, '2026-10-13T09:00:00.000Z');
assert.equal(noTnt.report.tvGuide.failingSince, undefined);
down = 'netsport.eurosport.io';
const noTntAgain = await build(Date.parse('2026-10-13T09:30:00Z'), noTnt);
down = null;
assert.equal(noTntAgain.report.tntSchedule.failingSince, '2026-10-13T09:00:00.000Z');
const tntBack = await build(Date.parse('2026-10-13T10:00:00Z'), noTntAgain);
assert.equal(tntBack.report.tntSchedule.ok, true);
assert.equal(tntBack.report.tntSchedule.failingSince, undefined);
{
  const report = { motogp: { ok: false }, goldenCheck: { efl: { ok: false }, premierLeague: { ok: true } } };
  markFailingSince(report, { report: { goldenCheck: { efl: { ok: false, failingSince: '2026-11-07T06:00:00.000Z' } } } }, Date.parse('2026-11-08T00:00:00Z'));
  assert.equal(report.motogp.failingSince, '2026-11-08T00:00:00.000Z');
  assert.equal(report.goldenCheck.efl.failingSince, '2026-11-07T06:00:00.000Z');
  assert.equal(report.goldenCheck.premierLeague.failingSince, undefined);
}

// The hourly watcher (scripts/watch.mjs): quiet for a one-off failure, a US run's wrong-country page
// and a fresh file; an email (a failed run) for a source failing on two updates in a row, or an old file
{
  const at = (t) => Date.parse(`2026-11-08T${t}Z`);
  const file = (report, generatedAt = '2026-11-08T00:30:00.000Z') => ({ generatedAt, report });
  assert.deepEqual(problems(file({ motogp: { ok: true } }), at('01:20:00')), []);
  assert.deepEqual(problems(file({ motogp: { ok: false, error: 'HTTP 429', failingSince: '2026-11-08T00:30:00.000Z' } }), at('01:20:00')), []);
  assert.deepEqual(problems(file({ premierSports: { ok: false, wrongRegion: true, failingSince: '2026-11-07T00:00:00.000Z' } }), at('01:20:00')), []);
  assert.deepEqual(problems(file({ motogp: { ok: false, error: 'HTTP 429', failingSince: '2026-11-08T00:00:00.000Z' } }), at('01:20:00')),
    ['MotoGP has failed since Sun 8 Nov, 00:00: HTTP 429']);
  assert.deepEqual(problems(file({ goldenCheck: { efl: { ok: false, error: 'HTTP 500', failingSince: '2026-11-07T06:00:00.000Z' } } }), at('01:20:00')),
    ["The daily check's Championship and League Cup fixtures feed has failed since Sat 7 Nov, 06:00: HTTP 500"]);
  assert.deepEqual(problems(file({}), at('02:30:00')), []);
  assert.match(problems(file({}), at('02:31:00'))[0], /^The listings haven't been updated for 2 h 1 min \(last update Sun 8 Nov, 00:30\)/);
  assert.deepEqual(problems({}), ['The listings file has no update time.']);

  // The Cloudflare alert: silent on an hourly run when all is well, an email for a problem or an
  // unreadable file, and always an email from any other run (the weekly "all well", or a test)
  const realFetch = globalThis.fetch;
  const sent = [];
  const env = { ALERT_TO: 'owner@example.test', EMAIL: { send: async (m) => { sent.push(m); } } };
  const serve = (body, status = 200) => { globalThis.fetch = async () => ({ ok: status < 300, status, json: async () => body }); };
  const now = at('01:20:00');
  serve(file({ motogp: { ok: true } }));
  assert.equal(await runCheck(env, HOURLY, now), 'all well, no email');
  assert.equal(sent.length, 0);
  await runCheck(env, '0 9 * * 1', now);
  assert.equal(sent.pop().subject, 'Telly Fixtures: all well (weekly check)');
  serve(file({ motogp: { ok: false, error: 'HTTP 429', failingSince: '2026-11-08T00:00:00.000Z' } }));
  await runCheck(env, HOURLY, now);
  const alert = sent.pop();
  assert.equal(alert.subject, 'Telly Fixtures alert: a problem with the listings');
  assert.equal(alert.to, 'owner@example.test');
  assert.equal(alert.from, 'alerts@tellyfixtures.co.uk');
  assert.match(alert.text, /^- MotoGP has failed since Sun 8 Nov, 00:00: HTTP 429\n/);
  serve({}, 503);
  await runCheck(env, HOURLY, now);
  assert.match(sent.pop().text, /couldn't be read from https:\/\/data\.tellyfixtures\.co\.uk\/data\.json: HTTP 503/);
  // The check itself asks for a fresh copy, and Cloudflare's schedule reaches the same code
  let asked;
  globalThis.fetch = async (url) => { asked = url; return { ok: true, status: 200, json: async () => file({}, new Date(Date.now()).toISOString()) }; };
  await worker.scheduled({ cron: HOURLY }, env);
  assert.match(asked, /^https:\/\/data\.tellyfixtures\.co\.uk\/data\.json\?watch=\d+$/);
  assert.equal(sent.length, 0);
  globalThis.fetch = realFetch;
}

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
// The refined rule (14 Oct 2026): keep a previous channel only if its source failed this time, or
// the event has started; a source that answered and dropped a game before kick-off wins
const NOW = Date.parse('2026-10-20T12:00:00Z');
const blank = (id, kickoff) => ({ id, kickoff, tv: { channels: [], note: 'TV channel to be confirmed', sources: [] } });
const prevTv = (id, channels, sources) => ({ id, tv: { channels, sources } });
const keep = (ev, prev, report) => keepKnownChannels([ev], { events: [prev] }, { report, now: NOW })[0].tv;
const LATER = '2026-10-20T19:00:00.000Z', EARLIER = '2026-10-20T11:00:00.000Z';
assert.deepEqual(keep(blank('a', LATER), prevTv('a', ['Amazon Prime Video'], ['primevideo.com']), { primeVideo: { ok: false, wrongRegion: true } }).channels, ['Amazon Prime Video']); // US page
assert.deepEqual(keep(blank('b', LATER), prevTv('b', ['HBO Max'], ['tntsports.co.uk']), { tntSchedule: { ok: false } }).channels, ['HBO Max']); // TNT offline
assert.deepEqual(keep(blank('c', LATER), prevTv('c', ['Sky Sports+'], ['skysports.com']), { skyListings: { ok: true } }).channels, []); // Sky dropped it
assert.deepEqual(keep(blank('d', EARLIER), prevTv('d', ['Sky Sports+'], ['skysports.com']), { skyListings: { ok: true } }).channels, ['Sky Sports+']); // kicked off
assert.deepEqual(keep(blank('e', EARLIER), prevTv('e', ['Amazon Prime Video'], ['listings']), {}).channels, []); // old fan site
assert.ok(keep(blank('f', LATER), prevTv('f', ['HBO Max'], ['tntsports.co.uk']), { tntSchedule: { ok: false } }).sources.includes('previous-update'));
// a new confirmed channel always replaces the old one (Sky moving a game to another channel)
const moved = keepKnownChannels([{ id: 'g', kickoff: LATER, tv: { channels: ['Sky Sports Premier League'], sources: ['sky-guide'] } }],
  { events: [prevTv('g', ['Sky Sports Main Event'], ['sky-guide'])] }, { report: { tvGuide: { ok: true } }, now: NOW })[0].tv;
assert.deepEqual(moved.channels, ['Sky Sports Premier League']);

// Prime Video's US page (GitHub's servers): reported as the wrong region, not as "no Amazon pick",
// so the pick a UK update found is kept; with no earlier UK update the game stays to be confirmed
primeUS = true;
const fromUS = await build(Date.parse('2026-10-13T09:00:00Z'));
const fromUSafterUK = await build(Date.parse('2026-10-13T09:00:00Z'), data);
primeUS = false;
assert.equal(fromUS.report.primeVideo.ok, false);
assert.equal(fromUS.report.primeVideo.wrongRegion, true);
assert.match(fromUS.report.primeVideo.error, /non-UK page \(providers: vixplusus, cbsaacf\)/);
const lv = (d) => d.events.find(e => e.comp === 'UCL' && /Liverpool/.test(e.home) && /Villarreal/.test(e.away));
assert.equal(lv(fromUS).tv.note, 'TV channel to be confirmed');
assert.deepEqual(lv(fromUSafterUK).tv.channels, ['Amazon Prime Video']);
assert.ok(lv(fromUSafterUK).tv.sources.includes('previous-update'));

// Uploading data.json to Cloudflare R2 (own domain). The signer must give Amazon's documented
// result for its "PUT Object" example (S3 Signature Version 4 docs), since R2 checks it the same way.
{
  const { signS3, uploadToR2 } = await import('../scripts/upload-r2.mjs');
  const signed = signS3({
    method: 'PUT', url: 'https://examplebucket.s3.amazonaws.com/test$file.text', body: 'Welcome to Amazon S3.',
    headers: { date: 'Fri, 24 May 2013 00:00:00 GMT', 'x-amz-storage-class': 'REDUCED_REDUNDANCY' },
    accessKeyId: 'AKIAIOSFODNN7EXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    region: 'us-east-1', now: Date.UTC(2013, 4, 24),
  });
  assert.equal(signed.authorization, 'AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, '
    + 'SignedHeaders=date;host;x-amz-content-sha256;x-amz-date;x-amz-storage-class, Signature=98ad721746da40c64f1a55b78f14c238d841ea1380cd77a1b5971af0ece108bd');

  const { mkdtemp, writeFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const file = join(await mkdtemp(join(tmpdir(), 'r2-')), 'data.json');
  await writeFile(file, '{"generatedAt":"2026-10-30T09:00:00Z"}');
  const sent = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    sent.push({ url, ...opts });
    return sent.length === 1 ? { ok: true, status: 200 }
      : { ok: false, status: 403, text: async () => '<?xml version="1.0"?><Error><Code>SignatureDoesNotMatch</Code></Error>' };
  };
  const r2 = { url: 'https://acc123.r2.cloudflarestorage.com/tellyfixtures-data/', key: 'KEYID:SECRETVALUE', now: Date.UTC(2026, 9, 30, 9) };
  const up = await uploadToR2(file, r2);
  assert.equal(up.url, 'https://acc123.r2.cloudflarestorage.com/tellyfixtures-data/data.json');
  assert.equal(sent[0].method, 'PUT');
  assert.equal(sent[0].headers['content-type'], 'application/json; charset=utf-8');
  assert.equal(sent[0].headers['cache-control'], 'public, max-age=60');
  assert.equal(sent[0].headers.host, undefined); // fetch sets it
  assert.match(sent[0].headers.authorization, /^AWS4-HMAC-SHA256 Credential=KEYID\/20261030\/auto\/s3\/aws4_request, SignedHeaders=cache-control;content-type;host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/);
  // A refused upload names R2's error code, never the key
  await assert.rejects(uploadToR2(file, r2), (e) => e.message === 'HTTP 403 SignatureDoesNotMatch' && !/SECRETVALUE/.test(e.message));
  await assert.rejects(uploadToR2(file, { ...r2, key: 'KEYID' }), /R2_UPLOAD_KEY is missing or incomplete/);
  globalThis.fetch = realFetch;
}

// A site answering 429 ("too many requests") is asked again after a wait, twice at most; other errors aren't
{
  const { getJSON, RETRY_WAITS } = await import('../scripts/lib/util.mjs');
  const realWaits = [...RETRY_WAITS];
  RETRY_WAITS.splice(0, RETRY_WAITS.length, 1, 1);
  const realFetch = globalThis.fetch;
  const answers = (list) => { let calls = 0; globalThis.fetch = async () => { const status = list[Math.min(calls++, list.length - 1)]; return { ok: status === 200, status, json: async () => ({ calls }) }; }; };
  answers([429, 200]);
  assert.deepEqual(await getJSON('https://example.test/'), { calls: 2 });
  answers([429, 429, 200]);
  assert.deepEqual(await getJSON('https://example.test/'), { calls: 3 });
  let tries = 0;
  globalThis.fetch = async () => { tries++; return { ok: false, status: 429 }; };
  await assert.rejects(getJSON('https://example.test/'), /HTTP 429/);
  assert.equal(tries, 3);
  tries = 0;
  globalThis.fetch = async () => { tries++; return { ok: false, status: 500 }; };
  await assert.rejects(getJSON('https://example.test/'), /HTTP 500/);
  assert.equal(tries, 1);
  globalThis.fetch = realFetch;
  RETRY_WAITS.splice(0, RETRY_WAITS.length, ...realWaits);
}

// The website's postal address: filled in only by Cloudflare's build, so the repository's copy of
// the terms must keep its placeholder. The address here is made up.
{
  const terms = await readFile(new URL('../site/terms.html', import.meta.url), 'utf8');
  const filled = fillAddress(terms, '  1 Test & Co Street, Testville TE1 1ST ');
  assert.ok(filled.includes('Telly Fixtures, 1 Test &amp; Co Street, Testville TE1 1ST. Email:'));
  assert.ok(!filled.includes('class="placeholder"'));
  assert.ok(!filled.includes('POSTAL ADDRESS'));
  assert.ok(fillAddress(terms, 'a<b>').includes('a&lt;b&gt;'));
  // A "$&" must stay as typed, not be read as a replacement pattern.
  assert.ok(fillAddress(terms, 'Flat $& 2').includes('Flat $&amp; 2'));
  // Without an address, or with the placeholder missing or doubled, the build must stop.
  assert.throws(() => fillAddress(terms, ''), /empty/);
  assert.throws(() => fillAddress(terms, '   '), /empty/);
  assert.throws(() => fillAddress(terms, undefined), /empty/);
  assert.throws(() => fillAddress('<p>no placeholder</p>', '1 Test Street'), /found 0/);
  assert.throws(() => fillAddress(terms + terms, '1 Test Street'), /found 2/);
}

console.log('\nAll tests passed');

// Save a sample data.json so the app has something to show before the first live update
if (process.argv.includes('--write-sample')) {
  const { writeFile } = await import('node:fs/promises');
  await writeFile(new URL('../data.json', import.meta.url), JSON.stringify(data, null, 1));
  console.log('sample data.json written');
}
