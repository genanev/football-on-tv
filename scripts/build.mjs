// Builds data.json: what's on UK TV for today + the next 7 days, with UK times.
//
// Competitions and where their data comes from (one module per source family):
//   All football fixtures and scores   sources/apiFootball.mjs when API_FOOTBALL_KEY is set
//                                      (George's decision, 19 Oct 2026); otherwise the official
//                                      feeds below. FOOTBALL_SOURCE=official|api-football forces one.
//                                      With API-Football, the official feeds are read once a day to
//                                      check it, and win where they disagree (sources/goldenCheck.mjs).
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
//   Alpine skiing (World Cup, Worlds)  sources/skiing.mjs (FIS)
//   Tennis (Grand Slams, ATP/WTA       sources/tennis.mjs (dates: WTA feed, nittoatpfinals.com;
//   Finals)                            times and channels: the TV listings)
//   Rugby union (Premiership, Champions sources/rugby.mjs (World Rugby's feed; channels: the TV
//   Cup, Nations Championship, 6N)     listings)
//   Specials: curling (European        sources/curling.mjs (dates: World Curling; games and channels:
//   Championships)                     the TV listings)
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
import { checkDue, findCorrections, applyCorrections } from './sources/goldenCheck.mjs';
import { APP_SETTINGS } from './app-settings.mjs';
import { unknownClubs } from './sources/teamNames.mjs';
import { fetchF1, fetchF2, fetchF3, motorsportTv } from './sources/motorsport.mjs';
import { fetchMotoGp, motoGpTv } from './sources/motogp.mjs';
import { fetchTournaments as fetchDarts, dartsEvents } from './sources/darts.mjs';
import { fetchGolf, golfEvents } from './sources/golf.mjs';
import { fetchTournaments as fetchSnooker, snookerEvents } from './sources/snooker.mjs';
import { fetchCricket, cricketEvents } from './sources/cricket.mjs';
import { fetchSkiing, skiTv } from './sources/skiing.mjs';
import { fetchTennis, fetchTennisPlay, tennisDays } from './sources/tennis.mjs';
import { fetchCurling, curlingEvents } from './sources/curling.mjs';
import { specialsInScope } from './sources/specials.mjs';
import { fetchRugby, rugbyTv } from './sources/rugby.mjs';
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
 * The UEFA Nations League too (George, 13 Nov 2026: England, Wales and Scotland play in it):
 * televised games only, whichever nations play.
 */
const AF_ONLY = ['UECL', 'WSL', 'SCOT', 'UNL'];
const TELEVISED_ONLY = new Set(['UECL', 'WSL', 'UNL']);
const AF_ONLY_REPORT = { UECL: 'conferenceLeague', WSL: 'wsl', SCOT: 'scottishPremiership', UNL: 'nationsLeague' };

/**
 * The official feeds API-Football is checked against once a day (goldenCheck.mjs; George, 29 Oct
 * 2026): their key in data.json's `golden`, the competitions each covers and where it comes from.
 */
const GOLDEN = {
  premierLeague: { groups: ['PL'], source: 'premierleague.com' },
  championsLeague: { groups: ['UCL'], source: 'uefa.com' },
  europaLeague: { groups: ['UEL'], source: 'uefa.com' },
  conferenceLeague: { groups: ['UECL'], source: 'uefa.com' },
  nationsLeague: { groups: ['UNL'], source: 'uefa.com' },
  efl: { groups: ['CHAMP', 'EFL Cup'], source: 'efl.com' },
};

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
// Which events each fixture source's report entry stands for
const FROM_SOURCE = {
  premierLeague: (e) => e.comp === 'PL',
  championsLeague: (e) => e.comp === 'UCL',
  europaLeague: (e) => e.comp === 'UEL',
  conferenceLeague: (e) => e.comp === 'UECL',
  nationsLeague: (e) => e.comp === 'UNL',
  scottishPremiership: (e) => e.comp === 'SCOT',
  wsl: (e) => e.comp === 'WSL',
  efl: (e) => e.comp === 'CHAMP' || (e.comp === 'CUPS' && e.label !== 'FA Cup'),
  faCup: (e) => e.comp === 'CUPS' && e.label === 'FA Cup',
  formula1: (e) => e.comp === 'F1',
  formula2: (e) => e.comp === 'F2',
  formula3: (e) => e.comp === 'F3',
  motogp: (e) => e.comp === 'MOTOGP',
  darts: (e) => e.comp === 'DARTS',
  golf: (e) => e.comp === 'GOLF',
  snooker: (e) => e.comp === 'SNOOKER',
  cricket: (e) => e.comp === 'CRICKET',
  skiing: (e) => e.comp === 'SKI',
  tennis: (e) => e.comp.startsWith('TEN_'),
  rugby: (e) => e.comp.startsWith('RU_'),
  curling: (e) => e.comp === 'SPECIAL_CURLING',
};

// A listed event stays when its source fails (George, 5 Nov 2026): a source that couldn't be read says
// nothing about the schedule, so the last update's events carry on, as they were, until it answers.
// Only a source that answers without an event removes it. `report.<source>.keptEvents` tells the app.
export function keepEventsOfFailedSources(events, previous, report, inWindow) {
  const listed = new Set(events.map(e => e.id));
  for (const [source, isFrom] of Object.entries(FROM_SOURCE)) {
    if (report[source]?.ok !== false) continue;
    const kept = (previous?.events || []).filter(e => isFrom(e) && inWindow(e) && !listed.has(e.id));
    events.push(...kept);
    if (kept.length) report[source].keptEvents = kept.length;
  }
  return events;
}

// When each failing source started failing (George, 8 Nov 2026): the app no longer shows a banner for a
// failed source; scripts/watch.mjs emails George instead, but only once a source has failed on two
// updates in a row (a one-off 429 is cleared by the next update). `failingSince` is carried over from
// the previous update while the source keeps failing. The daily check's feeds (`goldenCheck`) too.
export function markFailingSince(report, previous, now) {
  const mark = (entry, before) => {
    if (entry?.ok !== false) return;
    entry.failingSince = before?.ok === false && before.failingSince ? before.failingSince : new Date(now).toISOString();
  };
  const prev = previous?.report || {};
  for (const [key, entry] of Object.entries(report)) mark(entry, prev[key]);
  for (const [key, entry] of Object.entries(report.goldenCheck || {})) mark(entry, prev.goldenCheck?.[key]);
  return report;
}

// Sky Sports Main Event is always the primary channel, in every sport (George, 9 Nov 2026): the other
// channel it displaces moves to "also on", as a single row shows one main channel.
const MAIN_EVENT = 'Sky Sports Main Event';
export function mainEventFirst(events) {
  for (const e of events) {
    const tv = e.tv;
    if (!tv?.channels?.length || tv.channels[0] === MAIN_EVENT) continue;
    const old = tv.channels[0];
    if (tv.channels.includes(MAIN_EVENT)) {
      tv.channels = [MAIN_EVENT, ...tv.channels.filter(c => c !== MAIN_EVENT)];
    } else if (tv.alsoOn?.includes(MAIN_EVENT)) {
      tv.channels = [MAIN_EVENT, ...tv.channels.slice(1)];
      tv.alsoOn = [old, ...tv.alsoOn.filter(c => c !== MAIN_EVENT)];
    } else continue;
    if (tv.broadcaster === old) tv.broadcaster = MAIN_EVENT;
  }
  return events;
}

export function keepKnownChannels(events, previous, { report = {}, now = Date.now() } = {}) {
  const before = previousEvents(previous);
  for (const e of events) {
    if (e.tv?.channels?.length) continue;
    const tv = keptTv(e, before.get(e.id), report, now);
    if (tv) e.tv = tv;
  }
  return events;
}

const previousEvents = (previous) => new Map((previous?.events || previous?.matches || []).map(e => [e.id, e]));

/** The previous update's channel for an event, when the keep rule above says to keep it; else null. */
export function keptTv(e, old, report, now) {
  if (!old?.tv?.channels?.length) return null;
  const sources = old.tv.sources || [];
  if (sources.includes('listings')) return null;
  const sourceFailed = sources.some(s => [].concat(SOURCE_REPORT[s] || []).some(k => report[k]?.ok === false));
  const started = Date.parse(e.kickoff) <= now;
  return sourceFailed || started ? { ...old.tv, sources: [...new Set([...sources, 'previous-update'])] } : null;
}

/**
 * A football game with no channel or broadcaster 48 hours before kick-off isn't on UK TV (George,
 * 29 Oct 2026: "to be confirmed" until kick-off raised false hopes, e.g. midweek Scottish and
 * Championship games). Broadcasters list their picks earlier than that: in the updates of 20-29 Oct
 * 2026, every game that went from "TV channel to be confirmed" to a channel did so at least 79 hours
 * before kick-off. Only when every TV listing that could name the game answered on this update -
 * otherwise a failed read would look like "not on TV". A channel found later replaces the note.
 */
export const NO_TV_CUTOFF_HOURS = 48;
const FOOTBALL_COMPS = new Set(['PL', 'UCL', 'UEL', 'UECL', 'UNL', 'CHAMP', 'SCOT', 'WSL', 'CUPS']); // not rugby
export function markNotOnTv(events, report, now) {
  for (const e of events) {
    if (e.kind !== 'match' || !FOOTBALL_COMPS.has(e.comp) || e.status === 'postponed' || e.timeTbc || !e.tv || e.tv.channels?.length || e.tv.broadcaster) continue;
    if (!/confirm/i.test(e.tv.note || '') || Date.parse(e.kickoff) - now > NO_TV_CUTOFF_HOURS * 3600000) continue;
    const listings = ['tvGuide', 'skyListings', 'tntSchedule', ...(e.comp === 'SCOT' ? ['premierSports'] : []), ...(e.comp === 'UCL' ? ['primeVideo'] : [])];
    if (listings.every(k => report[k]?.ok === true)) e.tv = { ...e.tv, note: 'Not shown live on UK TV' };
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
  const skip = Promise.resolve([]); // official football feed not needed on this update

  // With API-Football, the official fixture feeds are read once a day only, to check it
  // (goldenCheck.mjs); the Premier League's also gives the league's match ids, which its UK
  // broadcaster feed is keyed by. The FA's page is read every time, for its "Live on" TV picks.
  const prevGolden = previous?.golden || {};
  const due = Object.fromEntries(Object.keys(GOLDEN).map(k => [k, !useAf || checkDue(prevGolden[k], now)]));
  // When play starts at the tennis tournaments, from their own schedules: once a day too (tennis.mjs)
  const prevPlay = previous?.playTimes?.tennis;
  const playDue = checkDue(prevPlay, now);
  const [plRes, uclRes, uelRes, eflRes, faRes, f1Res, f2Res, f3Res, motogpRes, dartsRes, golfRes, snookerRes, cricketRes, guideRes, skyRes, tntRes, primeRes, psRes, afRes, ueclRes, skiRes, tennisRes, curlingRes, rugbyRes, unlRes] = await Promise.allSettled([
    due.premierLeague ? fetchPremierLeague(now) : skip, due.championsLeague ? fetchChampionsLeague(now, DAYS_AHEAD) : skip,
    due.europaLeague ? fetchUefa(now, DAYS_AHEAD, 'UEL') : skip, due.efl ? fetchEfl(today, lastDay, eflSeason(now)) : skip, fetchFaCup(),
    fetchF1(windowStart, windowEnd), fetchF2(windowStart, windowEnd), fetchF3(windowStart, windowEnd), fetchMotoGp(today, lastDay), fetchDarts(today, lastDay),
    fetchGolf(today, lastDay), fetchSnooker(today, lastDay), fetchCricket(today, lastDay),
    fetchGuide(today, DAYS_AHEAD + 1), fetchSkyListings(now), fetchTntSchedule(today, DAYS_AHEAD + 1), fetchPrimeUcl(now), fetchPremierSports(now),
    // from the day before: API-Football's dates are UTC, the window's edges are UK midnight
    useAf ? fetchApiFootball(ukDate(windowStart - 3600000), lastDay, afSeason(now)) : skip,
    useAf && due.conferenceLeague ? fetchUefa(now, DAYS_AHEAD, 'UECL') : skip, // no official-mode Conference League
    fetchSkiing(today, lastDay), fetchTennis(today, lastDay).then(async t => ({ ...t, play: playDue ? await fetchTennisPlay(t.tournaments) : null })), fetchCurling(),
    fetchRugby(ukDate(windowStart - 3600000), lastDay), // from the day before, like API-Football
    useAf && due.nationsLeague ? fetchUefa(now, DAYS_AHEAD, 'UNL') : skip, // no official-mode Nations League either
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
  const faPage = ok(faRes) ? faRes.value.filter(inWindow) : null;
  let pl, ucl, uel, efl, fa, plFeed, more = [];
  let eflError = null, faError = null;
  let errorOf = () => null;
  // In official mode the daily check isn't made; the last one is kept for the next API-Football update
  let golden = useAf ? {} : previous?.golden;
  if (useAf) {
    const af = ok(afRes) ? afRes.value : null;
    // One report entry per competition as before, so the app's banners still say what's missing
    errorOf = (name) => (af ? af.errors.find(e => e.startsWith(`${name}:`)) || null : fail(afRes).error);
    const entry = (name, n) => (errorOf(name) ? { ok: false, error: errorOf(name) } : { ok: true, matches: n });

    // The daily check against the official feeds (goldenCheck.mjs): a feed read on this update is
    // compared with API-Football now; the others keep their last findings. Nothing is compared
    // when API-Football failed for that competition.
    const officialRes = { premierLeague: plRes, championsLeague: uclRes, europaLeague: uelRes, conferenceLeague: ueclRes, nationsLeague: unlRes, efl: eflRes };
    for (const [key, { groups, source }] of Object.entries(GOLDEN)) {
      const res = officialRes[key], last = prevGolden[key];
      if (!due[key] || groups.some(errorOf)) { if (last) golden[key] = last; continue; }
      if (!ok(res)) { golden[key] = { corrections: [], ...last, ok: false, error: fail(res).error }; continue; }
      golden[key] = { ok: true, checkedAt: new Date(now).toISOString(), corrections: findCorrections(res.value, af.matches, source, { within: inWindow }) };
      // the PL's match ids until the next check: today's window plus the day it moves on by
      const untilNextCheck = (m) => { const t = Date.parse(m.kickoff); return t >= windowStart && t < windowEnd + 86400000; };
      if (key === 'premierLeague') golden[key].matches = res.value.filter(untilNextCheck).map(({ sourceId, home, away, kickoff }) => ({ sourceId, home, away, kickoff }));
    }
    // The FA's page is read every time: its televised ties' kick-offs win too
    const faFixes = af && faPage && !errorOf('FA Cup') ? findCorrections(faPage, af.matches, 'thefa.com', { status: false, adds: false }) : [];
    const changed = af ? [...Object.values(golden).flatMap(g => applyCorrections(af.matches, g.corrections)), ...applyCorrections(af.matches, faFixes)] : [];
    report.goldenCheck = {
      ...Object.fromEntries(Object.entries(golden).map(([k, g]) => [k, g.ok
        ? { ok: true, checkedAt: g.checkedAt, corrections: g.corrections.length }
        : { ok: false, error: g.error, lastChecked: g.checkedAt || null }])),
      changed,
    };
    plFeed = (golden.premierLeague?.matches || []).filter(inWindow);

    const all = af ? af.matches.filter(inWindow) : [];
    // unknownClubs: league clubs shown by API-Football's short name (add them to teamNames.mjs)
    report.apiFootball = af ? { ok: true, matches: af.matches.length, errors: af.errors, unknownClubs: unknownClubs(all.filter(m => m.source === 'api-football.com')) } : fail(afRes);
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
    pl = plFeed = ok(plRes) ? plRes.value.filter(inWindow) : [];
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
  } else if (useAf && pl.length && golden.premierLeague?.ok === false) {
    report.premierLeagueTv = { ok: false, error: golden.premierLeague.error }; // no match ids yet
  }

  // Games listed only when televised (Conference League, WSL, cup ties) stay listed when the keep rule
  // keeps their channel: Sky's page drops a game once it's over, which once removed a finished
  // League Cup tie (Everton v Newcastle, 29 Oct 2026) before the end of its day
  const before = previousEvents(previous);
  const kept = (m) => !!keptTv(m, before.get(m.id), report, now);

  // Channels from the Sky TV guide, Sky Sports' page and TNT's schedule (footballTv.mjs)
  const events = [];
  for (const m of [...pl, ...ucl, ...uel, ...more]) {
    const { tv, tntNames } = footballTv(m, { guide, skyListings, tnt, prime, premierSports, plBrands: m.comp === 'PL' ? plTv[plIdOf(m)] : null });
    if (TELEVISED_ONLY.has(m.comp) && !tv.channels.length && !kept(m)) continue;
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
    const eflEv = eflEvents(efl, guide, skyListings, kept);
    report.efl = { ok: true, championship: eflEv.filter(e => e.comp === 'CHAMP').length, leagueCup: eflEv.filter(e => e.comp === 'CUPS').length };
    events.push(...eflEv);
  } else report.efl = { ok: false, error: eflError };

  if (!faError) {
    const faEv = faCupEvents(fa, guide, kept);
    report.faCup = { ok: true, ties: faEv.length };
    events.push(...faEv);
  } else report.faCup = { ok: false, error: faError };

  // ---- F1 / F2
  for (const [key, res] of [['formula1', f1Res], ['formula2', f2Res], ['formula3', f3Res]]) {
    if (!ok(res)) { report[key] = fail(res); continue; }
    // A calendar weekend whose sessions couldn't be read counts as a failure (the app's banner),
    // though whatever was read is still shown
    const { sessions: all, weekends, warning } = res.value;
    const sessions = all.filter(inWindow);
    report[key] = { ok: !warning, sessions: sessions.length, weekends, ...(warning ? { error: warning } : {}) };
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

  // ---- alpine skiing: one entry per run, channels from TNT Sports' schedule
  if (ok(skiRes)) {
    const runs = skiRes.value.sessions.filter(inWindow);
    report.skiing = { ok: true, runs: runs.length, errors: skiRes.value.errors };
    for (const { gender, discipline, run, place, ...s } of runs) events.push({ ...s, tv: skiTv({ ...s, gender, discipline, run }, tnt) });
  } else report.skiing = fail(skiRes);

  // ---- tennis: one entry per tournament day live on UK TV
  const playTimes = prevPlay ? { tennis: prevPlay } : {};
  if (ok(tennisRes)) {
    // The tournaments' own start of play (read once a day): a day's entry starts with its first match, and a
    // day with play but no TV entry is reported, so the alert emails George (11 Nov 2026). The WTA only
    // publishes the next day, so the days read earlier are kept; a failed read keeps them all.
    const { tournaments, play } = tennisRes.value;
    if (play) {
      const starts = {};
      for (const t of tournaments) {
        const days = { ...prevPlay?.starts?.[t.comp], ...play.starts[t.comp] };
        const kept = Object.entries(days).filter(([d]) => d >= today && d <= t.endDate).map(([d, at]) => [d, new Date(at).toISOString()]);
        if (kept.length) starts[t.comp] = Object.fromEntries(kept);
      }
      playTimes.tennis = play.errors.length
        ? { ...prevPlay, starts, ok: false, error: play.errors.join('; ') }
        : { ok: true, checkedAt: new Date(now).toISOString(), starts };
    }
    const found = tennisDays(tournaments, guide, tnt, today, DAYS_AHEAD + 1, now, playTimes.tennis?.starts);
    const tennis = found.events.filter(inWindow);
    report.tennis = { ok: true, tournaments: tournaments.map(t => t.name), days: tennis.length, errors: tennisRes.value.errors };
    events.push(...tennis);
    const tp = playTimes.tennis;
    if (tp && (!tp.ok || Object.keys(tp.starts).length)) {
      const wrong = [...(tp.ok ? [] : [tp.error]), ...found.mismatches];
      report.tennisSchedule = { ok: !wrong.length, checkedAt: tp.checkedAt || null, days: Object.values(tp.starts).reduce((n, d) => n + Object.keys(d).length, 0), ...(wrong.length ? { error: wrong.join('; ') } : {}) };
    }
  } else report.tennis = fail(tennisRes);

  // ---- rugby union: every match of the four competitions, channels as for football
  if (ok(rugbyRes)) {
    const rugby = rugbyRes.value.filter(inWindow);
    report.rugby = { ok: true, matches: rugby.length };
    for (const m of rugby) events.push({ ...m, tv: rugbyTv(m, { guide, tnt, premierSports }) });
  } else report.rugby = fail(rugbyRes);

  // ---- Specials: curling, one entry per televised game
  if (ok(curlingRes)) {
    const curling = curlingEvents(curlingRes.value.events, guide, tnt, today, DAYS_AHEAD + 1).filter(inWindow);
    report.curling = { ok: true, events: curlingRes.value.events.map(e => `${e.name} ${e.startDate}..${e.endDate}`), games: curling.length, errors: curlingRes.value.errors };
    events.push(...curling);
  } else report.curling = fail(curlingRes);
  // The Specials the app names right now: a week before each starts until its last day
  const specials = specialsInScope(ok(curlingRes) ? curlingRes.value.events : [], today, previous?.specials);

  keepEventsOfFailedSources(events, previous, report, inWindow);

  const label = (e) => e.home || e.title || '';
  events.sort((a, b) => a.kickoff.localeCompare(b.kickoff) || a.comp.localeCompare(b.comp) || label(a).localeCompare(label(b)));

  keepKnownChannels(events, previous, { report, now });
  markNotOnTv(events, report, now);
  mainEventFirst(events);
  if (!showScores) for (const e of events) if (e.kind === 'match') { e.homeScore = null; e.awayScore = null; }
  report.scores = showScores ? 'on' : 'off';
  markFailingSince(report, previous, now);
  // `golden`: what the daily check found (goldenCheck.mjs), for the next updates; the app ignores it
  // `playTimes`: when play starts at the tennis tournaments (tennis.mjs), read once a day; the app ignores it
  // `app`: settings the phone app reads (app-settings.mjs): the free period's length and so on
  return { generatedAt: new Date(now).toISOString(), windowDays: DAYS_AHEAD, app: APP_SETTINGS, report, specials, events, golden, playTimes };
}

const isMain = import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('build.mjs');
if (isMain) {
  const out = process.argv[2] || 'data.json';
  let previous = null;
  try { previous = JSON.parse(await readFile(out, 'utf8')); } catch { /* first run */ }
  const data = await build(Date.now(), previous);
  console.log(JSON.stringify(data.report, null, 2));
  const scheduleOk = ['apiFootball', 'premierLeague', 'championsLeague', 'europaLeague', 'efl', 'faCup', 'formula1', 'formula2', 'formula3', 'motogp', 'darts', 'golf', 'snooker', 'cricket', 'skiing', 'tennis', 'curling', 'rugby'].some(k => data.report[k]?.ok);
  if (!scheduleOk) {
    console.error('Every fixture source failed - keeping the previous data.json');
    process.exit(1);
  }
  await writeFile(out, JSON.stringify(data, null, 1));
  console.log(`Wrote ${data.events.length} events to ${out}`);
}
