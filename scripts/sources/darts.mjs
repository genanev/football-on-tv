// Darts: televised PDC tournaments, with session times and channels from the UK TV guide.
//
// Sources
//   Tournaments + dates  official PDC data feed (tournaments.darts.web.gc.pdcservices.co.uk),
//                        the same feed behind pdc.tv. Each tournament has an isTelevised flag;
//                        only televised ones are shown.
//   Session times + TV   Sky's TV guide. The PDC does not publish session start times as data
//                        (only in news articles), so each live darts programme in the guide on
//                        a tournament day becomes one session.

import { getJSON, ukDate, ukMidnight } from '../lib/util.mjs';
import { SPORT_CHANNELS, groupSessions, guideTv, nameScore, sessionLabel, windowDates } from './skyGuide.mjs';

const PDC_URL = 'https://tournaments.darts.web.gc.pdcservices.co.uk/v2/';

/** "2026 World Grand Prix" -> "World Grand Prix", "2026/27 World Championship" -> "World Championship". */
export function cleanName(name) {
  return String(name || '').replace(/^\d{4}(\/\d{2,4})?\s+/, '').trim();
}

export function mapTournament(d) {
  const a = d?.attributes || {};
  if (!a.startDate || !a.endDate) return null;
  return {
    id: String(d.id),
    name: cleanName(a.name),
    venue: a.venue || null,
    startDate: a.startDate,
    endDate: a.endDate,
    televised: !!a.isTelevised,
  };
}

/** Televised tournaments overlapping [fromDate, toDate] (UK dates, inclusive). */
export async function fetchTournaments(fromDate, toDate) {
  const years = [...new Set([+fromDate.slice(0, 4) - 1, +fromDate.slice(0, 4), +toDate.slice(0, 4)])];
  const out = [];
  for (const y of years) {
    const j = await getJSON(`${PDC_URL}?seasonID=${y}&page.size=300`, { Origin: 'https://www.pdc.tv' });
    for (const d of j.data || []) {
      const t = mapTournament(d);
      if (t && t.televised && t.endDate >= fromDate && t.startDate <= toDate) out.push(t);
    }
  }
  return [...new Map(out.map(t => [t.id, t])).values()];
}

const isDarts = (p) => /\bdarts?\b/i.test(p.title) || /\bdarts?\b/i.test(p.synopsis);


/**
 * Build darts events for the window: one per live TV session, or one "times to be confirmed"
 * entry per tournament day the guide has nothing for.
 */
export function dartsEvents(tournaments, guide, fromDate, days) {
  const sids = SPORT_CHANNELS.darts;
  const live = (guide?.programmes || []).filter(p => p.live && sids.includes(p.sid) && isDarts(p));
  const events = [];
  for (const date of windowDates(fromDate, days)) {
    const today = tournaments.filter(t => t.startDate <= date && t.endDate >= date);
    if (!today.length) continue;
    const progs = live.filter(p => ukDate(p.start) === date);
    for (const t of today) {
      const mine = today.length === 1 ? progs
        : progs.filter(p => nameScore(p, t.name) === Math.max(...today.map(o => nameScore(p, o.name))) && nameScore(p, t.name) > 0);
      const base = { comp: 'DARTS', kind: 'session', title: t.name, venue: t.venue, source: 'pdc.tv' };
      if (!mine.length) {
        events.push({
          ...base, id: `darts-${t.id}-${date}`, kickoff: new Date(ukMidnight(date) + 12 * 3600000).toISOString(), end: null,
          session: null, status: 'upcoming', timeTbc: true, allDay: true,
          tv: { broadcaster: null, channels: [], alsoOn: [], confirmed: false, note: 'TV times to be confirmed', conflict: false, sources: [] },
        });
        continue;
      }
      for (const s of groupSessions(mine)) {
        events.push({
          ...base, id: `darts-${t.id}-${s.start / 1000}`, kickoff: new Date(s.start).toISOString(), end: new Date(s.end).toISOString(),
          session: sessionLabel(s.start), status: 'upcoming', timeTbc: false, tv: guideTv(s.progs, sids),
        });
      }
    }
  }
  return events;
}
