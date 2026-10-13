// Builds data.json: what's on UK TV for today + the next 7 days, with UK times.
//
// Competitions and where their data comes from (one module per source family):
//   Premier League, Champions League,  sources/football.mjs
//   Europa League
//   Championship, League Cup           sources/efl.mjs
//   FA Cup (televised ties)            sources/facup.mjs
//   Formula 1, Formula 2               sources/motorsport.mjs
//   Darts (televised PDC events)       sources/darts.mjs
//   Golf (PGA Tour, DP World Tour)     sources/golf.mjs
//   Snooker (World Snooker Tour)       sources/snooker.mjs
//   Cricket (men's internationals)     sources/cricket.mjs
//   UK TV guide (Sky, TNT, BBC, ITV)   sources/skyGuide.mjs
//
// Runs on Node 18+ with no dependencies:  node scripts/build.mjs
// Each source is optional - if one fails, the others still produce output and the
// report says which failed (the app shows a banner for it).

import { readFile, writeFile } from 'node:fs/promises';
import { ukDate, ukMidnight } from './lib/util.mjs';
import { fetchPremierLeague, fetchPlBroadcasts, fetchChampionsLeague, fetchUefa, fetchListings, findListing, resolveTv, guideProgrammesFor } from './sources/football.mjs';
import { fetchEfl, eflEvents, eflSeason } from './sources/efl.mjs';
import { fetchFaCup, faCupEvents } from './sources/facup.mjs';
import { fetchF1, fetchF2, motorsportTv } from './sources/motorsport.mjs';
import { fetchTournaments as fetchDarts, dartsEvents } from './sources/darts.mjs';
import { fetchGolf, golfEvents } from './sources/golf.mjs';
import { fetchTournaments as fetchSnooker, snookerEvents } from './sources/snooker.mjs';
import { fetchCricket, cricketEvents } from './sources/cricket.mjs';
import { fetchGuide, SPORT_CHANNELS, guideTv } from './sources/skyGuide.mjs';
import { fetchSkyListings } from './sources/skyListings.mjs';
import { fetchTntSchedule, tntProgrammesFor, tntChannelOrder } from './sources/tntSchedule.mjs';

// Re-exported so the tests can reach them in one place.
export { ukToUtc, ukDate } from './lib/util.mjs';
export { parseListings, teamSim, normTeam, parsePlKickoff, isUkChannel, mapPlBroadcasts, brandOf, tidyChannels } from './sources/football.mjs';

export const DAYS_AHEAD = 8; // a little over 7 so the app still has a full week if an update is missed

const ok = (r) => r.status === 'fulfilled';
const fail = (r) => ({ ok: false, error: r.reason?.message || String(r.reason) });

/**
 * Keep the channel from the previous update when a source stops listing an event. The football
 * listings site drops matches once they've been played, which would otherwise leave a finished
 * match with "TV channel to be confirmed".
 */
export function keepKnownChannels(events, previous) {
  const before = new Map((previous?.events || previous?.matches || []).map(e => [e.id, e]));
  for (const e of events) {
    const old = before.get(e.id);
    if (!e.tv?.channels?.length && old?.tv?.channels?.length) {
      e.tv = { ...old.tv, sources: [...new Set([...(old.tv.sources || []), 'previous-update'])] };
    }
  }
  return events;
}

export async function build(now = Date.now(), previous = null) {
  const report = {};
  const today = ukDate(now);
  const windowStart = ukMidnight(today);
  const windowEnd = windowStart + (DAYS_AHEAD + 1) * 86400000;
  const lastDay = ukDate(windowEnd - 3600000);
  const inWindow = (e) => { const t = Date.parse(e.kickoff); return t >= windowStart && t < windowEnd; };

  const [plRes, uclRes, listRes, uelRes, eflRes, faRes, f1Res, f2Res, dartsRes, golfRes, snookerRes, cricketRes, guideRes, skyRes, tntRes] = await Promise.allSettled([
    fetchPremierLeague(now), fetchChampionsLeague(now, DAYS_AHEAD), fetchListings(),
    fetchUefa(now, DAYS_AHEAD, 'UEL'), fetchEfl(today, lastDay, eflSeason(now)), fetchFaCup(),
    fetchF1(), fetchF2(), fetchDarts(today, lastDay),
    fetchGolf(today, lastDay), fetchSnooker(today, lastDay), fetchCricket(today, lastDay),
    fetchGuide(today, DAYS_AHEAD + 1), fetchSkyListings(now), fetchTntSchedule(today, DAYS_AHEAD + 1),
  ]);

  // ---- UK TV guide (used by every competition except the PL and Champions League)
  const guide = ok(guideRes) ? guideRes.value : null;
  report.tvGuide = guide ? { ok: true, days: guide.coveredDates.length, programmes: guide.programmes.length, errors: guide.errors } : fail(guideRes);
  // Sky's own "what's on" pages (football, F1): confirm channels the guide doesn't list (Sky Sports+ streams)
  const skyListings = ok(skyRes) ? skyRes.value : null;
  report.skyListings = skyListings ? { ok: true, events: skyListings.entries.length, errors: skyListings.errors } : fail(skyRes);
  // TNT Sports' own schedule: its channels plus events streamed only on HBO Max
  const tnt = ok(tntRes) ? tntRes.value : null;
  report.tntSchedule = tnt ? { ok: true, programmes: tnt.programmes.length, errors: tnt.errors } : fail(tntRes);

  // ---- football
  const pl = ok(plRes) ? plRes.value.filter(inWindow) : [];
  report.premierLeague = ok(plRes) ? { ok: true, matches: pl.length } : fail(plRes);

  const ucl = ok(uclRes) ? uclRes.value.filter(inWindow) : [];
  report.championsLeague = ok(uclRes) ? { ok: true, matches: ucl.length } : fail(uclRes);

  const listings = ok(listRes) ? listRes.value : { PL: [], UCL: [], errors: [listRes.reason.message] };
  report.tvListings = { ok: !listings.errors.length, premierLeague: listings.PL.length, championsLeague: listings.UCL.length, errors: listings.errors };

  let plTv = {};
  if (pl.length) {
    try {
      plTv = await fetchPlBroadcasts(pl.map(m => m.sourceId));
      report.premierLeagueTv = { ok: true, matches: Object.keys(plTv).length };
    } catch (e) {
      report.premierLeagueTv = { ok: false, error: e.message };
    }
  }

  const events = [];
  let matched = 0;
  for (const m of [...pl, ...ucl]) {
    const listing = findListing(m, listings[m.comp] || []);
    if (listing) matched++;
    const tv = resolveTv(m, m.comp === 'PL' ? plTv[m.sourceId] : null, listing);
    const { sourceId, homeAlt, awayAlt, ...rest } = m;
    // UEFA uses short international names ("Atleti", "Paris"); the UK listing names read better.
    if (m.comp === 'UCL' && listing) { rest.home = listing.home; rest.away = listing.away; }
    events.push({ ...rest, kind: 'match', source: m.comp === 'PL' ? 'premierleague.com' : 'uefa.com', tv });
  }
  report.crossReferenced = `${matched}/${pl.length + ucl.length}`;

  // ---- Europa League: channels from the TV guide and TNT's own schedule (incl. HBO Max streams)
  if (ok(uelRes)) {
    const uel = uelRes.value.filter(inWindow);
    report.europaLeague = { ok: true, matches: uel.length };
    for (const m of uel) {
      const progs = guideProgrammesFor(m, guide?.programmes || [], SPORT_CHANNELS.football);
      const fromTnt = tntProgrammesFor(m, tnt, 'Europa League');
      const chans = tntChannelOrder([...progs.map(p => p.channel), ...fromTnt.map(p => p.channel)]);
      const sources = [...(progs.length ? ['sky-guide'] : []), ...(fromTnt.length ? ['tntsports.co.uk'] : [])];
      const tv = chans.length
        ? { broadcaster: chans[0], channels: [chans[0]], alsoOn: chans.slice(1), confirmed: true, note: null, conflict: false, sources }
        : { broadcaster: null, channels: [], alsoOn: [], confirmed: false, note: 'TV channel to be confirmed', conflict: false, sources: [] };
      const { sourceId, homeAlt, awayAlt, ...rest } = m;
      events.push({ ...rest, kind: 'match', source: 'uefa.com', tv });
    }
  } else report.europaLeague = fail(uelRes);

  // ---- EFL (Championship, League Cup) and FA Cup
  if (ok(eflRes)) {
    const efl = eflEvents(eflRes.value.filter(inWindow), guide, skyListings);
    report.efl = { ok: true, championship: efl.filter(e => e.comp === 'CHAMP').length, leagueCup: efl.filter(e => e.comp === 'CUPS').length };
    events.push(...efl);
  } else report.efl = fail(eflRes);

  if (ok(faRes)) {
    const fa = faCupEvents(faRes.value.filter(inWindow), guide);
    report.faCup = { ok: true, ties: fa.length };
    events.push(...fa);
  } else report.faCup = fail(faRes);

  // ---- F1 / F2
  for (const [key, res] of [['formula1', f1Res], ['formula2', f2Res]]) {
    if (!ok(res)) { report[key] = fail(res); continue; }
    const sessions = res.value.filter(inWindow);
    report[key] = { ok: true, sessions: sessions.length };
    for (const s of sessions) events.push({ ...s, tv: motorsportTv(s, guide, skyListings) });
  }

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

  keepKnownChannels(events, previous);
  return { generatedAt: new Date(now).toISOString(), windowDays: DAYS_AHEAD, report, events };
}

const isMain = import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('build.mjs');
if (isMain) {
  const out = process.argv[2] || 'data.json';
  let previous = null;
  try { previous = JSON.parse(await readFile(out, 'utf8')); } catch { /* first run */ }
  const data = await build(Date.now(), previous);
  console.log(JSON.stringify(data.report, null, 2));
  const scheduleOk = ['premierLeague', 'championsLeague', 'europaLeague', 'efl', 'faCup', 'formula1', 'formula2', 'darts', 'golf', 'snooker', 'cricket'].some(k => data.report[k]?.ok);
  if (!scheduleOk) {
    console.error('Every fixture source failed - keeping the previous data.json');
    process.exit(1);
  }
  await writeFile(out, JSON.stringify(data, null, 1));
  console.log(`Wrote ${data.events.length} events to ${out}`);
}
