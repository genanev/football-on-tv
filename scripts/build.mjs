// Builds data.json: what's on UK TV for today + the next 7 days, with UK times.
//
// Competitions and where their data comes from (one module per source family):
//   All football fixtures and scores   sources/apiFootball.mjs when API_FOOTBALL_KEY is set
//                                      (George's decision, 19 Oct 2026); otherwise the official
//                                      feeds below. FOOTBALL_SOURCE=official|api-football forces one.
//   Premier League, Champions League,  sources/football.mjs (official feeds)
//   Europa League
//   Championship, League Cup           sources/efl.mjs (official feed)
//   FA Cup (televised ties)            sources/facup.mjs (the FA's page: fixtures in "official"
//                                      mode, the FA's "Live on" TV picks in both modes)
//   Formula 1, Formula 2, Formula 3    sources/motorsport.mjs
//   MotoGP (MotoGP class)              sources/motogp.mjs
//   Darts (televised PDC events)       sources/darts.mjs
//   Golf (PGA Tour, DP World Tour)     sources/golf.mjs
//   Snooker (World Snooker Tour)       sources/snooker.mjs
//   Cricket (men's internationals)     sources/cricket.mjs
//   Football UK TV channels            sources/footballTv.mjs (Sky guide, Sky Sports, TNT Sports)
//   UK TV guide (Sky, TNT, BBC, ITV)   sources/skyGuide.mjs
//
// Runs on Node 18+ with no dependencies:  node scripts/build.mjs
// Each source is optional - if one fails, the others still produce output and the
// report says which failed (the app shows a banner for it).

import { readFile, writeFile } from 'node:fs/promises';
import { ukDate, ukMidnight } from './lib/util.mjs';
import { fetchPremierLeague, fetchPlBroadcasts, fetchChampionsLeague, fetchUefa, teamSim } from './sources/football.mjs';
import { footballTv } from './sources/footballTv.mjs';
import { fetchEfl, eflEvents, eflSeason } from './sources/efl.mjs';
import { fetchFaCup, faCupEvents, faChannelFor } from './sources/facup.mjs';
import { fetchApiFootball, afSeason } from './sources/apiFootball.mjs';
import { unknownClubs } from './sources/teamNames.mjs';
import { fetchF1, fetchF2, fetchF3, motorsportTv } from './sources/motorsport.mjs';
import { fetchMotoGp, motoGpTv } from './sources/motogp.mjs';
import { fetchTournaments as fetchDarts, dartsEvents } from './sources/darts.mjs';
import { fetchGolf, golfEvents } from './sources/golf.mjs';
import { fetchTournaments as fetchSnooker, snookerEvents } from './sources/snooker.mjs';
import { fetchCricket, cricketEvents } from './sources/cricket.mjs';
import { fetchGuide } from './sources/skyGuide.mjs';
import { fetchSkyListings } from './sources/skyListings.mjs';
import { fetchTntSchedule } from './sources/tntSchedule.mjs';
import { fetchPrimeUcl } from './sources/amazonPrime.mjs';
import { fetchPremierSports } from './sources/premierSports.mjs';

// Re-exported so the tests can reach them in one place.
export { ukToUtc, ukDate } from './lib/util.mjs';
export { teamSim, normTeam, parsePlKickoff, isUkChannel, mapPlBroadcasts, brandOf } from './sources/football.mjs';

export const DAYS_AHEAD = 8; // a little over 7 so the app still has a full week if an update is missed

/** Where football fixtures and scores come from: API-Football once its key is set up, else the official feeds. */
export const defaultFootballSource = () =>
  process.env.FOOTBALL_SOURCE || (process.env.API_FOOTBALL_KEY ? 'api-football' : 'official');

/**
 * Football scores on or off everywhere (George, 19 Oct 2026: scores are an accepted risk and may have
 * to be removed). SHOW_SCORES=off removes them from data.json, so the app shows none.
 */
export const SHOW_SCORES = process.env.SHOW_SCORES !== 'off';

/**
 * Competitions from API-Football only (no official feed in this app). Conference League and WSL games
 * are listed only when a TV source confirms a channel (George, 20 Oct 2026: many games, few on UK TV);
 * the Scottish Premiership lists every game, like the PL and the Championship.
 */
const AF_ONLY = ['UECL', 'WSL', 'SCOT'];
const TELEVISED_ONLY = new Set(['UECL', 'WSL']);
const AF_ONLY_REPORT = { UECL: 'conferenceLeague', WSL: 'wsl', SCOT: 'scottishPremiership' };

const ok = (r) => r.status === 'fulfilled';
const fail = (r) => ({ ok: false, error: r.reason?.message || String(r.reason), ...(r.reason?.wrongRegion ? { wrongRegion: true } : {}) });

/** Which report entries say whether the source behind a `tv.sources` tag worked on this update. */
const SOURCE_REPORT = {
  'sky-guide': 'tvGuide', 'skysports.com': 'skyListings', 'tntsports.co.uk': 'tntSchedule',
  'primevideo.com': 'primeVideo', 'premiersports.com': 'premierSports', 'thefa.com': ['faCup', 'faPage'], 'premierleague.com': 'premierLeagueTv',
};

/**
 * Keep a channel confirmed by the previous update when this update finds none for the event -
 * but only when that's not news (George's rule, 14 Oct 2026):
 *   - the source that confirmed it failed this time (offline, unreadable, or - for Prime Video -
 *     the wrong country's page, which is what GitHub's US servers get), or
 *   - the event has already started (Sky's pages and Prime Video drop games once they kick off or
 *     finish).
 * If the source answered fine and simply no longer lists an event that hasn't started, the
 * broadcaster has dropped it: back to "TV channel to be confirmed".
 * Channels from the old fan-site listings (sources "listings", before 13 Oct 2026) are never kept.
 */
export function keepKnownChannels(events, previous, { report = {}, now = Date.now() } = {}) {
  const before = new Map((previous?.events || previous?.matches || []).map(e => [e.id, e]));
  for (const e of events) {
    const old = before.get(e.id);
    if (e.tv?.channels?.length || !old?.tv?.channels?.length) continue;
    const sources = old.tv.sources || [];
    if (sources.includes('listings')) continue;
    const sourceFailed = sources.some(s => [].concat(SOURCE_REPORT[s] || []).some(k => report[k]?.ok === false));
    const started = Date.parse(e.kickoff) <= now;
    if (sourceFailed || started) {
      e.tv = { ...old.tv, sources: [...new Set([...sources, 'previous-update'])] };
    }
  }
  return events;
}

export async function build(now = Date.now(), previous = null, { footballSource = defaultFootballSource(), showScores = SHOW_SCORES } = {}) {
  const report = {};
  const today = ukDate(now);
  const windowStart = ukMidnight(today);
  const windowEnd = windowStart + (DAYS_AHEAD + 1) * 86400000;
  const lastDay = ukDate(windowEnd - 3600000);
  const inWindow = (e) => { const t = Date.parse(e.kickoff); return t >= windowStart && t < windowEnd; };
  const useAf = footballSource === 'api-football';
  const skip = Promise.resolve([]); // official football feed not needed with API-Football

  // With API-Football, the Premier League feed is still read, but only to look up the league's own
  // UK broadcaster for each match (its broadcast feed is keyed by the league's match ids), and the
  // FA's page only for its "Live on" TV picks.
  const [plRes, uclRes, uelRes, eflRes, faRes, f1Res, f2Res, f3Res, motogpRes, dartsRes, golfRes, snookerRes, cricketRes, guideRes, skyRes, tntRes, primeRes, psRes, afRes] = await Promise.allSettled([
    fetchPremierLeague(now), useAf ? skip : fetchChampionsLeague(now, DAYS_AHEAD),
    useAf ? skip : fetchUefa(now, DAYS_AHEAD, 'UEL'), useAf ? skip : fetchEfl(today, lastDay, eflSeason(now)), fetchFaCup(),
    fetchF1(), fetchF2(), fetchF3(), fetchMotoGp(today, lastDay), fetchDarts(today, lastDay),
    fetchGolf(today, lastDay), fetchSnooker(today, lastDay), fetchCricket(today, lastDay),
    fetchGuide(today, DAYS_AHEAD + 1), fetchSkyListings(now), fetchTntSchedule(today, DAYS_AHEAD + 1), fetchPrimeUcl(now), fetchPremierSports(now),
    // from the day before: API-Football's dates are UTC, the window's edges are UK midnight
    useAf ? fetchApiFootball(ukDate(windowStart - 3600000), lastDay, afSeason(now)) : skip,
  ]);

  // ---- UK TV guide (used by every competition)
  const guide = ok(guideRes) ? guideRes.value : null;
  report.tvGuide = guide ? { ok: true, days: guide.coveredDates.length, programmes: guide.programmes.length, errors: guide.errors } : fail(guideRes);
  // Sky's own "what's on" pages (football, F1): confirm channels the guide doesn't list (Sky Sports+ streams)
  const skyListings = ok(skyRes) ? skyRes.value : null;
  report.skyListings = skyListings ? { ok: true, events: skyListings.entries.length, errors: skyListings.errors } : fail(skyRes);
  // TNT Sports' own schedule: its channels plus events streamed only on HBO Max
  const tnt = ok(tntRes) ? tntRes.value : null;
  report.tntSchedule = tnt ? { ok: true, programmes: tnt.programmes.length, errors: tnt.errors } : fail(tntRes);
  // Prime Video's Champions League page: Amazon's own picks
  const prime = ok(primeRes) ? primeRes.value : null;
  report.primeVideo = prime ? { ok: true, events: prime.cards.length, amazonPicks: prime.cards.filter(c => c.provider === 'Prime').map(c => c.title) } : fail(primeRes);

  // Premier Sports (streaming only, not in Sky's guide): Scottish Premiership channels
  const premierSports = ok(psRes) ? psRes.value : null;
  report.premierSports = premierSports ? { ok: true, events: premierSports.events.length } : fail(psRes);

  // ---- football fixtures: API-Football, or the official feeds
  report.footballSource = footballSource;
  const plFeed = ok(plRes) ? plRes.value.filter(inWindow) : [];
  const faPage = ok(faRes) ? faRes.value.filter(inWindow) : null;
  let pl, ucl, uel, efl, fa, more = [];
  let eflError = null, faError = null;
  let errorOf = () => null;
  if (useAf) {
    const af = ok(afRes) ? afRes.value : null;
    const all = af ? af.matches.filter(inWindow) : [];
    // unknownClubs: league clubs shown by API-Football's short name (add them to teamNames.mjs)
    report.apiFootball = af ? { ok: true, matches: af.matches.length, errors: af.errors, unknownClubs: unknownClubs(all) } : fail(afRes);
    // One report entry per competition as before, so the app's banners still say what's missing
    errorOf = (name) => (af ? af.errors.find(e => e.startsWith(`${name}:`)) || null : report.apiFootball.error);
    const entry = (name, n) => (errorOf(name) ? { ok: false, error: errorOf(name) } : { ok: true, matches: n });
    pl = all.filter(m => m.comp === 'PL');
    ucl = all.filter(m => m.comp === 'UCL');
    uel = all.filter(m => m.comp === 'UEL');
    more = all.filter(m => AF_ONLY.includes(m.comp));
    efl = all.filter(m => m.comp === 'CHAMP' || m.label === 'EFL Cup');
    fa = all.filter(m => m.label === 'FA Cup').map(t => ({ ...t, faChannel: faChannelFor(t, faPage) }));
    report.premierLeague = entry('PL', pl.length);
    report.championsLeague = entry('UCL', ucl.length);
    report.europaLeague = entry('UEL', uel.length);
    eflError = errorOf('CHAMP') || errorOf('EFL Cup');
    faError = errorOf('FA Cup');
    report.faPage = faPage ? { ok: true, televisedTies: faPage.length } : fail(faRes);
  } else {
    pl = plFeed;
    report.premierLeague = ok(plRes) ? { ok: true, matches: pl.length } : fail(plRes);
    ucl = ok(uclRes) ? uclRes.value.filter(inWindow) : [];
    report.championsLeague = ok(uclRes) ? { ok: true, matches: ucl.length } : fail(uclRes);
    uel = ok(uelRes) ? uelRes.value.filter(inWindow) : [];
    report.europaLeague = ok(uelRes) ? { ok: true, matches: uel.length } : fail(uelRes);
    efl = ok(eflRes) ? eflRes.value.filter(inWindow) : [];
    eflError = ok(eflRes) ? null : fail(eflRes).error;
    fa = faPage || [];
    faError = faPage ? null : fail(faRes).error;
  }

  // The Premier League's own UK broadcaster per match (only answers UK requests; see footballTv.mjs).
  // Its feed is keyed by the league's match ids: API-Football's matches are paired with them by teams.
  const plIdOf = (m) => (useAf
    ? plFeed.find(p => Math.abs(Date.parse(p.kickoff) - Date.parse(m.kickoff)) < 86400000
      && teamSim(p.home, m.home) >= 0.5 && teamSim(p.away, m.away) >= 0.5)?.sourceId
    : m.sourceId);
  let plTv = {};
  const plIds = pl.map(plIdOf).filter(Boolean);
  if (plIds.length) {
    try {
      plTv = await fetchPlBroadcasts(plIds);
      report.premierLeagueTv = { ok: true, matches: Object.values(plTv).filter(v => v.length).length };
    } catch (e) {
      report.premierLeagueTv = { ok: false, error: e.message };
    }
  } else if (useAf && pl.length && !ok(plRes)) report.premierLeagueTv = fail(plRes);

  // Channels from the Sky TV guide, Sky Sports' page and TNT's schedule (footballTv.mjs)
  const events = [];
  for (const m of [...pl, ...ucl, ...uel, ...more]) {
    const { tv, tntNames } = footballTv(m, { guide, skyListings, tnt, prime, premierSports, plBrands: m.comp === 'PL' ? plTv[plIdOf(m)] : null });
    if (TELEVISED_ONLY.has(m.comp) && !tv.channels.length) continue;
    const { sourceId, homeAlt, awayAlt, ...rest } = m;
    // UEFA and API-Football use short names ("Atleti", "Paris"); TNT's names read better.
    if (m.comp !== 'PL' && tntNames) { rest.home = tntNames[0]; rest.away = tntNames[1]; }
    events.push({ ...rest, kind: 'match', source: m.source || (m.comp === 'PL' ? 'premierleague.com' : 'uefa.com'), tv });
  }
  const football = events.filter(e => e.comp === 'PL' || e.comp === 'UCL');
  report.footballChannels = `${football.filter(e => e.tv.channels.length).length}/${football.length} PL+UCL matches with a confirmed channel`;
  if (useAf) {
    for (const comp of AF_ONLY) {
      const err = errorOf(comp);
      report[AF_ONLY_REPORT[comp]] = err ? { ok: false, error: err }
        : { ok: true, [TELEVISED_ONLY.has(comp) ? 'televised' : 'matches']: events.filter(e => e.comp === comp).length };
    }
  }

  // ---- EFL (Championship, League Cup) and FA Cup: televised cup ties only
  if (!eflError) {
    const eflEv = eflEvents(efl, guide, skyListings);
    report.efl = { ok: true, championship: eflEv.filter(e => e.comp === 'CHAMP').length, leagueCup: eflEv.filter(e => e.comp === 'CUPS').length };
    events.push(...eflEv);
  } else report.efl = { ok: false, error: eflError };

  if (!faError) {
    const faEv = faCupEvents(fa, guide);
    report.faCup = { ok: true, ties: faEv.length };
    events.push(...faEv);
  } else report.faCup = { ok: false, error: faError };

  // ---- F1 / F2
  for (const [key, res] of [['formula1', f1Res], ['formula2', f2Res], ['formula3', f3Res]]) {
    if (!ok(res)) { report[key] = fail(res); continue; }
    const sessions = res.value.filter(inWindow);
    report[key] = { ok: true, sessions: sessions.length };
    for (const s of sessions) events.push({ ...s, tv: motorsportTv(s, guide, skyListings) });
  }

  // ---- MotoGP (channels from the TV guide's TNT channels and TNT's own schedule)
  if (ok(motogpRes)) {
    const sessions = motogpRes.value.filter(inWindow);
    report.motogp = { ok: true, sessions: sessions.length };
    for (const s of sessions) events.push({ ...s, tv: motoGpTv(s, guide, tnt) });
  } else report.motogp = fail(motogpRes);

  // ---- darts
  if (ok(dartsRes)) {
    const darts = dartsEvents(dartsRes.value, guide, today, DAYS_AHEAD + 1).filter(inWindow);
    report.darts = { ok: true, tournaments: dartsRes.value.map(t => t.name), sessions: darts.length };
    events.push(...darts);
  } else {
    report.darts = fail(dartsRes);
  }

  // ---- golf / snooker / cricket
  if (ok(golfRes)) {
    const golf = golfEvents(golfRes.value.tournaments, guide, today, DAYS_AHEAD + 1).filter(inWindow);
    report.golf = { ok: true, tournaments: golfRes.value.tournaments.map(t => t.name), rounds: golf.length, errors: golfRes.value.errors };
    events.push(...golf);
  } else report.golf = fail(golfRes);

  if (ok(snookerRes)) {
    const snooker = snookerEvents(snookerRes.value, guide, today, DAYS_AHEAD + 1).filter(inWindow);
    report.snooker = { ok: true, tournaments: snookerRes.value.map(t => t.name), sessions: snooker.length };
    events.push(...snooker);
  } else report.snooker = fail(snookerRes);

  if (ok(cricketRes)) {
    const cricket = cricketEvents(cricketRes.value.filter(inWindow), guide);
    report.cricket = { ok: true, matches: cricket.length };
    events.push(...cricket);
  } else report.cricket = fail(cricketRes);

  const label = (e) => e.home || e.title || '';
  events.sort((a, b) => a.kickoff.localeCompare(b.kickoff) || a.comp.localeCompare(b.comp) || label(a).localeCompare(label(b)));

  keepKnownChannels(events, previous, { report, now });
  if (!showScores) for (const e of events) if (e.kind === 'match') { e.homeScore = null; e.awayScore = null; }
  report.scores = showScores ? 'on' : 'off';
  return { generatedAt: new Date(now).toISOString(), windowDays: DAYS_AHEAD, report, events };
}

const isMain = import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('build.mjs');
if (isMain) {
  const out = process.argv[2] || 'data.json';
  let previous = null;
  try { previous = JSON.parse(await readFile(out, 'utf8')); } catch { /* first run */ }
  const data = await build(Date.now(), previous);
  console.log(JSON.stringify(data.report, null, 2));
  const scheduleOk = ['apiFootball', 'premierLeague', 'championsLeague', 'europaLeague', 'efl', 'faCup', 'formula1', 'formula2', 'formula3', 'motogp', 'darts', 'golf', 'snooker', 'cricket'].some(k => data.report[k]?.ok);
  if (!scheduleOk) {
    console.error('Every fixture source failed - keeping the previous data.json');
    process.exit(1);
  }
  await writeFile(out, JSON.stringify(data, null, 1));
  console.log(`Wrote ${data.events.length} events to ${out}`);
}
