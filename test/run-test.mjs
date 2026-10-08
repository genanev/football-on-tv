// Offline test: replays response shapes captured from the real sites on 8 Oct 2026.
import assert from 'node:assert/strict';
import { build, parseListings, teamSim, ukToUtc, parsePlKickoff, ukDate } from '../scripts/build.mjs';

// ---------- fixtures (shapes copied from the live feeds)
const pl = (mw, kickoff, home, away, id, tz = 'BST') => ({ kickoff, kickoffTimezone: tz, period: 'PreMatch', matchWeek: mw, matchId: String(id), ground: 'X', homeTeam: { name: home, shortName: home }, awayTeam: { name: away, shortName: away } });
const MW = {
  6: [pl(6, '2026-10-10 12:30:00', 'Arsenal', 'Leeds United', 2645245), pl(6, '2026-10-10 15:00:00', 'Aston Villa', 'Brentford', 2645249),
      pl(6, '2026-10-10 15:00:00', 'Chelsea', 'Bournemouth', 2645250), pl(6, '2026-10-10 17:30:00', 'Manchester United', 'Tottenham Hotspur', 2645246),
      pl(6, '2026-10-11 14:00:00', 'Crystal Palace', 'Nottingham Forest', 2645247), pl(6, '2026-10-11 14:00:00', 'Hull City', 'Everton', 2645251),
      pl(6, '2026-10-11 16:30:00', 'Liverpool', 'Manchester City', 2645254), pl(6, '2026-10-12 20:00:00', 'Coventry City', 'Newcastle United', 2645253)],
  7: [pl(7, '2026-10-17 12:30:00', 'Everton', 'Chelsea', 2645258), pl(7, '2026-10-17 15:00:00', 'Brentford', 'Liverpool', 2645256),
      pl(7, '2026-10-18 14:00:00', 'Bournemouth', 'Sunderland', 2645255), pl(7, '2026-10-18 14:00:00', 'Brighton and Hove Albion', 'Crystal Palace', 2645257),
      pl(7, '2026-10-18 14:00:00', 'Leeds United', 'Manchester United', 2645260), pl(7, '2026-10-19 20:00:00', 'Tottenham Hotspur', 'Coventry City', 2645264)],
};
const ch = (name, mediaType = 'VIDEO') => ({ info: { name, channelTypes: [{ mediaType }] } });
const BROADCAST = {
  2645245: [ch('TNT Sports'), ch('TalkSport', 'AUDIO')], 2645246: [ch('BBC Radio 5 Live', 'AUDIO'), ch('Sky Sports')],
  2645247: [ch('Sky Sports')], 2645251: [ch('Sky Sports')], 2645254: [ch('Sky Sports')], 2645253: [ch('Sky Sports')],
  2645249: [], 2645250: [], 2645258: [ch('TNT Sports')], 2645256: [], 2645255: [ch('Sky Sports')], 2645257: [ch('Sky Sports')],
  2645260: [ch('Sky Sports')], 2645264: [ch('Sky Sports')],
};
const team = (n) => ({ internationalName: n, isPlaceHolder: false, translations: { displayName: { EN: n } } });
const U = (iso, h, a, id) => ({ id: String(id), kickOffTime: { dateTime: iso }, homeTeam: team(h), awayTeam: team(a), status: 'UPCOMING', round: { translations: { name: { EN: 'League phase' } } } });
const UEFA = [
  ['2026-10-13T16:45:00Z', 'Lens', 'Sporting CP'], ['2026-10-13T16:45:00Z', 'Sabah', 'Slavia Praha'], ['2026-10-13T19:00:00Z', 'Inter', 'Club Brugge'],
  ['2026-10-13T19:00:00Z', 'Arsenal', 'Lille'], ['2026-10-13T19:00:00Z', 'Atleti', 'Man Utd'], ['2026-10-13T19:00:00Z', 'Leipzig', 'PSV'],
  ['2026-10-13T19:00:00Z', 'Villarreal', 'Napoli'], ['2026-10-13T19:00:00Z', 'Galatasaray', 'Barcelona'], ['2026-10-13T19:00:00Z', 'Viking', 'Bayern München'],
  ['2026-10-14T16:45:00Z', 'Feyenoord', 'Como'], ['2026-10-14T16:45:00Z', 'LASK', 'Liverpool'], ['2026-10-14T19:00:00Z', 'Man City', 'Paris'],
  ['2026-10-14T19:00:00Z', 'Roma', 'Real Madrid'], ['2026-10-14T19:00:00Z', 'Aston Villa', 'Fenerbahçe'], ['2026-10-14T19:00:00Z', 'Real Betis', 'Porto'],
  ['2026-10-14T19:00:00Z', 'Bodø/Glimt', 'B. Dortmund'], ['2026-10-14T19:00:00Z', 'Shakhtar', 'AEK Athens'], ['2026-10-14T19:00:00Z', 'S. Bratislava', 'Stuttgart'],
].map(([iso, h, a], i) => U(iso, h, a, 2040000 + i));

const pill = (c) => `<span class="channel-pill" style="background-color: #fb28fc;border: 0;">${c}</span>`;
const fx = (time, teams, comp, chans) => `<div class="fixture"><div class="fixture__time">${time}</div><div class="fixture__teams">${teams}  </div><div class="fixture__competition">${comp}</div><div class="fixture__channel"><div class="span3 channels">${chans.map(pill).join('')}</div></div></div>`;
const day = (label) => `<div class="fixture-date">${label}</div>`;
const AD = '<div class="advertfixtures"><ins class="adsbygoogle"></ins></div>';
const PLC = 'Premier League';
const LIST_PL = `<html><div class="fixture-group"><div class="anchor"><a id="2026Oct10"></a></div>${day('Saturday 10th October 2026')}
${fx('12:30', 'Arsenal v Leeds United', PLC, ['TNT Sports 1', 'TNT Sports Ultimate', 'HBO Max'])}${AD}
${fx('17:30', 'Manchester United v Tottenham Hotspur', PLC, ['Sky Sports Main Event', 'Sky Sports Premier League', 'Sky Sports Ultra HDR'])}
${day('Sunday 11th October 2026')}${fx('14:00', 'Crystal Palace v Nottingham Forest', PLC, ['Sky Sports Main Event', 'Sky Sports Ultra HDR'])}
${fx('14:00', 'Hull City v Everton', PLC, ['Sky Sports Premier League'])}${fx('16:30', 'Liverpool v Manchester City', PLC, ['Sky Sports Main Event', 'Sky Sports Premier League'])}
</div><div class="fixture-group">${day('Monday 12th October 2026')}${fx('20:00', 'Coventry City v Newcastle United', PLC, ['Sky Sports Main Event', 'Sky Sports Premier League'])}
${day('Saturday 17th October 2026')}${fx('12:30', 'Everton v Chelsea', PLC, ['TNT Sports 1', 'HBO Max'])}
${day('Sunday 18th October 2026')}${fx('14:00', 'AFC Bournemouth v Sunderland', PLC, ['Sky Sports TBC'])}${fx('14:00', 'Brighton &amp; Hove Albion v Crystal Palace', PLC, ['Sky Sports TBC'])}
${fx('14:00', 'Leeds United v Manchester United', PLC, ['Sky Sports TBC'])}</div></html>`;
const UCLC = 'UEFA Champions League&nbsp;League Phase';
const LIST_UCL = `<div class="fixture-group">${day('Tuesday 13th October 2026')}
${fx('17:45', 'RC Lens v Sporting CP', UCLC, ['TNT Sports 2', 'HBO Max'])}${fx('17:45', 'Sabah FC v Slavia Prague', UCLC, ['TNT Sports 4', 'HBO Max'])}
${fx('20:00', 'Arsenal v Lille', UCLC, ['TNT Sports 1', 'TNT Sports Ultimate', 'HBO Max'])}${fx('20:00', 'Atlético Madrid v Manchester United', UCLC, ['Amazon Prime Video'])}
${fx('20:00', 'Galatasaray v Barcelona', UCLC, ['TNT Sports 2', 'TNT Sports 8', 'HBO Max'])}${fx('20:00', 'Inter Milan v Club Brugge', UCLC, ['TNT Sports 5', 'HBO Max'])}
${fx('20:00', 'RB Leipzig v PSV Eindhoven', UCLC, ['TNT Sports 7', 'HBO Max'])}${fx('20:00', 'Viking FK v Bayern Munich', UCLC, ['TNT Sports 4', 'TNT Sports 9', 'HBO Max'])}
${fx('20:00', 'Villarreal v Napoli', UCLC, ['TNT Sports 6', 'HBO Max'])}</div><div class="fixture-group">${day('Wednesday 14th October 2026')}
${fx('17:45', 'Feyenoord v Como', UCLC, ['TNT Sports 4', 'HBO Max'])}${fx('17:45', 'LASK v Liverpool', UCLC, ['TNT Sports 2', 'HBO Max'])}
${fx('20:00', 'Aston Villa v Fenerbahce', UCLC, ['TNT Sports 2', 'HBO Max'])}${fx('20:00', 'Bodo/Glimt v Borussia Dortmund', UCLC, ['TNT Sports 5', 'HBO Max'])}
${fx('20:00', 'Manchester City v PSG', UCLC, ['TNT Sports 1', 'TNT Sports Ultimate', 'HBO Max'])}${fx('20:00', 'Real Betis v FC Porto', UCLC, ['TNT Sports 6', 'HBO Max'])}
${fx('20:00', 'Roma v Real Madrid', UCLC, ['TNT Sports 4', 'TNT Sports 10', 'HBO Max'])}${fx('20:00', 'Shakhtar Donetsk v AEK Athens', UCLC, ['TNT Sports 8', 'HBO Max'])}
${fx('20:00', 'Slovan Bratislava v VfB Stuttgart', UCLC, ['TNT Sports 7', 'HBO Max'])}</div>`;

// ---------- mock fetch
const calls = [];
globalThis.fetch = async (url) => {
  calls.push(url);
  const json = (b) => ({ ok: true, status: 200, json: async () => b, text: async () => JSON.stringify(b) });
  const html = (b) => ({ ok: true, status: 200, text: async () => b });
  if (url.includes('current-gameweek')) return json({ matchweek: 6 });
  if (url.includes('/api/v2/matches')) { const w = +/matchweek=(\d+)/.exec(url)[1]; return json({ pagination: {}, data: MW[w] || [] }); }
  if (url.includes('broadcasting/match-events')) {
    const ids = /sportDataId=([\d,]+)/.exec(url)[1].split(',');
    return json({ content: ids.map(id => ({ contentReference: { id: +id }, channels: BROADCAST[id] || [] })) });
  }
  if (url.includes('match.uefa.com')) return json(UEFA);
  if (url.includes('premier-league-football-on-tv')) return html(LIST_PL);
  if (url.includes('champions-league-football-on-tv')) return html(LIST_UCL);
  return { ok: false, status: 404 };
};

// ---------- unit checks
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
assert.ok(teamSim('Bournemouth', 'AFC Bournemouth') >= 0.85);
assert.ok(teamSim('Brighton and Hove Albion', 'Brighton & Hove Albion') >= 0.85);
assert.ok(teamSim('Manchester United', 'Manchester City') < 0.85);
const parsed = parseListings(LIST_PL);
assert.equal(parsed.length, 10);
assert.deepEqual(parsed.find(p => p.home === 'Liverpool'), { date: '2026-10-11', time: '16:30', home: 'Liverpool', away: 'Manchester City', competition: 'Premier League', channels: ['Sky Sports Main Event', 'Sky Sports Premier League'] });

// ---------- full build, "now" = Thu 8 Oct 2026 10:00 UK
const data = await build(Date.parse('2026-10-08T09:00:00Z'));
const by = (h) => data.matches.find(m => m.home === h || m.homeShort === h);
console.log(JSON.stringify(data.report, null, 1));
for (const m of data.matches) {
  const t = new Date(m.kickoff).toLocaleString('en-GB', { timeZone: 'Europe/London', weekday: 'short', hour: '2-digit', minute: '2-digit' });
  console.log(m.comp.padEnd(4), t.padEnd(10), `${m.home} v ${m.away}`.padEnd(42), (m.tv.channels.join(', ') || m.tv.broadcaster || '-').padEnd(40), m.tv.note || '', m.tv.conflict ? 'CONFLICT' : '');
}
assert.equal(data.matches.filter(m => m.comp === 'PL').length, 8);  // window ends before 17 Oct
assert.equal(data.matches.filter(m => m.comp === 'UCL').length, 18);
assert.equal(data.report.crossReferenced, '24/26');
assert.deepEqual(by('Arsenal').tv.channels, ['TNT Sports 1']);
assert.equal(by('Arsenal').tv.broadcaster, 'TNT Sports');
assert.match(by('Aston Villa').tv.note, /blackout/);
assert.deepEqual(data.matches.find(m => m.homeShort === 'Atleti').tv.channels, ['Amazon Prime Video']);
assert.deepEqual(data.matches.find(m => m.homeShort === 'Man City').tv.channels, ['TNT Sports 1']);
assert.equal(data.matches.find(m => m.homeShort === 'Man City').kickoff, '2026-10-14T19:00:00.000Z');
assert.ok(data.matches.every(m => !m.tv.conflict));

// later in the week: TBC entries and Sky brand only
const later = await build(Date.parse('2026-10-12T09:00:00Z'));
const bour = later.matches.find(m => m.home === 'Bournemouth');
assert.equal(bour.tv.broadcaster, 'Sky Sports');
assert.equal(bour.tv.note, 'Exact channel to be confirmed');
assert.match(later.matches.find(m => m.home === 'Brentford').tv.note, /blackout/);

// a failing source must not break the rest
const realFetch = globalThis.fetch;
globalThis.fetch = async (url) => (url.includes('live-footballontv') ? { ok: false, status: 403 } : realFetch(url));
const degraded = await build(Date.parse('2026-10-08T09:00:00Z'));
assert.equal(degraded.report.tvListings.ok, false);
assert.equal(degraded.matches.find(m => m.home === 'Arsenal' && m.comp === 'PL').tv.broadcaster, 'TNT Sports');
assert.match(degraded.matches.find(m => m.homeShort === 'Atleti').tv.note, /to be confirmed/);
console.log('\nAll tests passed');

// Save a sample data.json so the app has something to show before the first live update
if (process.argv.includes('--write-sample')) {
  const { writeFile } = await import('node:fs/promises');
  globalThis.fetch = realFetch;
  await writeFile(new URL('../data.json', import.meta.url), JSON.stringify(await build(Date.parse('2026-10-08T09:00:00Z')), null, 1));
  console.log('sample data.json written');
}
