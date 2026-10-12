// Golf: PGA Tour and DP World Tour events (the majors are on both), with round times and
// channels from the UK TV guide.
//
// Sources
//   PGA Tour schedule        official pgatour.com data feed (orchestrator.pgatour.com GraphQL,
//                            with the public key pgatour.com sends from every visitor's browser)
//   DP World Tour schedule   europeantour.com/dpworld-tour/schedule/ - the official page carries the
//                            whole season as schema.org "SportsEvent" data (JSON-LD), which is
//                            published for machines to read. The site turns away requests that
//                            don't look like a browser, hence the browser-style headers.
//   Round times + TV         Sky's TV guide: each live golf programme is matched to the tournament
//                            it names. Neither tour publishes UK TV times as data.
//
// A tournament day is only listed when the guide shows it live in the UK (the tours run events
// most weeks, but not all are televised here). If the guide is unavailable, each tournament day
// is listed with "TV times to be confirmed".

import { getJSON, getText, ukDate, ukMidnight } from '../lib/util.mjs';
import { SPORT_CHANNELS, guideTv, nameScore, nameWords, windowDates } from './skyGuide.mjs';

const PGA_URL = 'https://orchestrator.pgatour.com/graphql';
const PGA_KEY = 'da2-gsrx5bibzbb4njvhl7t37wqyl4'; // pgatour.com public web key
const DPWT_URL = 'https://www.europeantour.com/dpworld-tour/schedule/';
const BROWSER = {
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Sec-Fetch-Dest': 'document', 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Site': 'none', 'Upgrade-Insecure-Requests': '1',
};

const DAY = 86400000;
const isoDate = (ts) => new Date(ts).toISOString().slice(0, 10);
const addDays = (date, n) => isoDate(Date.parse(`${date}T12:00:00Z`) + n * DAY);

// ------------------------------------------------------------------ PGA Tour

export function mapPgaSchedule(j) {
  const s = j?.data?.schedule || {};
  const out = [];
  for (const m of [...(s.completed || []), ...(s.upcoming || [])]) {
    for (const t of m.tournaments || []) {
      if (!t.startDate || !t.tournamentName) continue;
      const start = isoDate(+t.startDate); // midnight UTC of the first round's date
      out.push({
        id: `pga-${t.id}`, tour: 'PGA', name: t.tournamentName, startDate: start, endDate: addDays(start, 3),
        course: t.courseName || null, source: 'pgatour.com',
      });
    }
  }
  return out;
}

export async function fetchPgaTour(year) {
  const query = 'query Schedule($tourCode: String!, $year: String) { schedule(tourCode: $tourCode, year: $year) { completed { month tournaments { id tournamentName startDate courseName city country } } upcoming { month tournaments { id tournamentName startDate courseName city country } } } }';
  const r = await fetch(PGA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': PGA_KEY, Origin: 'https://www.pgatour.com' },
    body: JSON.stringify({ query, variables: { tourCode: 'R', year: String(year) } }),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${PGA_URL}`);
  return mapPgaSchedule(await r.json());
}

// ------------------------------------------------------------- DP World Tour

/**
 * Read the season's events from the page's JSON-LD. Each event's StartDate/EndDate is local
 * midnight of the first/last round written in UTC (e.g. 2026-10-14T18:30Z = 15 Oct in Delhi),
 * so adding 12 hours lands on the right local date for any time zone.
 */
export function parseDpwtSchedule(html) {
  const out = [];
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)) {
    let j;
    try { j = JSON.parse(m[1]); } catch { continue; }
    for (const e of j.subEvent || []) {
      if (e['@type'] !== 'SportsEvent' || !e.StartDate || !e.EndDate || !e.name) continue;
      const startDate = isoDate(Date.parse(e.StartDate) + 12 * 3600000);
      const place = e.location?.[0];
      out.push({
        id: `dpwt-${startDate}-${e.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, tour: 'DPWT', name: e.name.trim(),
        startDate, endDate: isoDate(Date.parse(e.EndDate) + 12 * 3600000),
        course: place?.name || null, source: 'europeantour.com',
      });
    }
  }
  return out;
}

export async function fetchDpWorldTour(year) {
  // The current season's page, plus next season's (the season changes over in November).
  const res = await Promise.allSettled([DPWT_URL, `${DPWT_URL}${year + 1}/`].map(u => getText(u, BROWSER)));
  if (res[0].status === 'rejected') throw res[0].reason;
  return res.filter(r => r.status === 'fulfilled').flatMap(r => parseDpwtSchedule(r.value));
}

// --------------------------------------------------------------------- merge

/**
 * Same event on both tours? Same week, and the same distinctive words once generic ones are
 * dropped: "THE MASTERS" = "Masters Tournament", "U.S. PGA CHAMPIONSHIP" = "PGA Championship",
 * "THE 154TH OPEN" = "The Open Championship" (nothing distinctive left on either side).
 */
export function sameEvent(a, b) {
  if (Math.abs(Date.parse(a.startDate) - Date.parse(b.startDate)) > DAY) return false;
  const x = nameWords(a.name, 3), y = nameWords(b.name, 3);
  if (!x.length || !y.length) return !x.length && !y.length;
  return x.some(w => y.includes(w));
}

/** Majors and co-sanctioned events appear on both tours: keep one entry, playable by either tour. */
export function mergeTours(lists) {
  const out = [];
  for (const t of lists.flat()) {
    const dup = out.find(o => !o.tours.has(t.tour) && sameEvent(o, t));
    if (dup) dup.tours.add(t.tour);
    else if (!out.some(o => o.id === t.id)) out.push({ ...t, tours: new Set([t.tour]) });
  }
  return out;
}

// ---------------------------------------------------------------- TV guide

/** Which tour a programme says it is (LPGA/LIV are not covered, so their programmes are ignored). */
export function tourOf(p) {
  if (/\bDP World Tour\b/i.test(p.title)) return 'DPWT';
  if (/\bLPGA\b/i.test(p.title) || /\bLPGA\b/i.test(p.synopsis)) return 'LPGA';
  if (/\bLIV\b/.test(p.title)) return 'LIV';
  if (/\bPGA Tour\b/i.test(p.title)) return 'PGA';
  return null;
}

const isGolf = (p) => /\bgolf\b|\bPGA\b|DP World Tour|Ryder Cup|Solheim Cup|\bMasters\b|The Open/i.test(`${p.title} ${p.synopsis}`) &&
  !/snooker|darts|tennis|football/i.test(p.title);

function roundLabel(t, date) {
  const n = Math.round((Date.parse(date) - Date.parse(t.startDate)) / DAY) + 1;
  return /ryder cup|solheim cup/i.test(t.name) ? `Day ${n}` : `Round ${n}`;
}

/** One event per tournament per day it's live on UK TV. */
export function golfEvents(tournaments, guide, fromDate, days) {
  const sids = SPORT_CHANNELS.golf;
  const live = (guide?.programmes || []).filter(p => p.live && sids.includes(p.sid) && isGolf(p));
  const covered = new Set(guide?.coveredDates || []);
  const events = [];
  for (const date of windowDates(fromDate, days)) {
    const today = tournaments.filter(t => t.startDate <= date && t.endDate >= date);
    if (!today.length) continue;
    const progsByT = new Map();
    for (const p of live.filter(p => ukDate(p.start) === date)) {
      const tour = tourOf(p);
      let best = null, bestScore = 0;
      for (const t of today) {
        if (tour && !t.tours.has(tour)) continue;
        const score = nameScore(p, t.name) + (tour ? 1 : 0);
        if (score > bestScore) { best = t; bestScore = score; }
      }
      if (best) progsByT.set(best, [...(progsByT.get(best) || []), p]);
    }
    for (const t of today) {
      const base = { comp: 'GOLF', kind: 'session', title: t.name, venue: t.course, source: t.source, session: roundLabel(t, date), status: 'upcoming' };
      const progs = progsByT.get(t);
      if (progs) {
        const start = Math.min(...progs.map(p => p.start)), end = Math.max(...progs.map(p => p.end));
        events.push({ ...base, id: `golf-${t.id}-${date}`, kickoff: new Date(start).toISOString(), end: new Date(end).toISOString(), timeTbc: false, tv: guideTv(progs, sids) });
      } else if (!covered.has(date)) {
        events.push({
          ...base, id: `golf-${t.id}-${date}`, kickoff: new Date(ukMidnight(date) + 12 * 3600000).toISOString(), end: null, timeTbc: true, allDay: true,
          tv: { broadcaster: null, channels: [], alsoOn: [], confirmed: false, note: 'TV times to be confirmed', conflict: false, sources: [] },
        });
      }
    }
  }
  return events;
}

/** Both tours' events overlapping [fromDate, toDate]; one tour failing still returns the other. */
export async function fetchGolf(fromDate, toDate) {
  const year = +fromDate.slice(0, 4);
  const res = await Promise.allSettled([fetchPgaTour(year), fetchPgaTour(year + 1), fetchDpWorldTour(year)]);
  const errors = res.filter(r => r.status === 'rejected').map(r => r.reason.message);
  if (errors.length === res.length) throw new Error(errors[0]);
  const lists = res.filter(r => r.status === 'fulfilled').map(r => r.value);
  const all = mergeTours(lists).filter(t => t.endDate >= fromDate && t.startDate <= toDate);
  return { tournaments: all, errors };
}
