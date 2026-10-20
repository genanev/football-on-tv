// Snooker: World Snooker Tour events, with session times and channels from the UK TV guide.
//
// Sources
//   Tournaments + dates  official WST data feed (tournaments.snooker.web.gc.wstservices.co.uk),
//                        the feed behind wst.tv. Same platform as the PDC darts feed. It has no
//                        "televised" flag, so the TV guide decides which events are shown.
//   Session times + TV   Sky's TV guide: each live snooker programme on a tournament day becomes
//                        a session (morning / afternoon / evening). BBC and Channel 5 titles don't
//                        say "Live", so free-to-air programmes count too unless they look like
//                        replays (isLiveCoverage).
//
// Qualifiers are skipped. If the guide is unavailable, each main tournament day is listed with
// "TV times to be confirmed".

import { getJSON, ukDate, ukMidnight } from '../lib/util.mjs';
import { SPORT_CHANNELS, groupSessions, guideTv, nameScore, sessionLabel, windowDates, isLiveCoverage } from './skyGuide.mjs';

const WST_URL = 'https://tournaments.snooker.web.gc.wstservices.co.uk/v2/';

/** "BetVictor Northern Ireland Open 2026" -> "BetVictor Northern Ireland Open". */
export const cleanName = (name) => String(name || '').replace(/\s+\d{4}(\/\d{2,4})?\s*$/, '').trim();

export function mapTournament(d) {
  const a = d?.attributes || {};
  if (!a.startDate || !a.endDate || !a.name) return null;
  return { id: String(d.id), name: cleanName(a.name), venue: a.venue || a.city || null, startDate: a.startDate.slice(0, 10), endDate: a.endDate.slice(0, 10) };
}

const isMainEvent = (t) => !/qualif|championship league/i.test(t.name);

/** WST seasons start in summer: the 2026 season is 2026/27. */
export async function fetchTournaments(fromDate, toDate) {
  const y = +fromDate.slice(0, 4);
  const out = [];
  for (const season of [y - 1, y]) {
    const j = await getJSON(`${WST_URL}?season=${season}`, { Origin: 'https://www.wst.tv' });
    for (const d of j.data || []) {
      const t = mapTournament(d);
      if (t && !/qualif/i.test(t.name) && t.endDate >= fromDate && t.startDate <= toDate) out.push(t);
    }
  }
  return [...new Map(out.map(t => [t.id, t])).values()];
}

const isSnooker = (p) => /\bsnooker\b/i.test(p.title) || /\bsnooker\b/i.test(p.synopsis);

export function snookerEvents(tournaments, guide, fromDate, days) {
  const sids = SPORT_CHANNELS.snooker;
  const live = (guide?.programmes || []).filter(p => isLiveCoverage(p) && sids.includes(p.sid) && isSnooker(p));
  const covered = new Set(guide?.coveredDates || []);
  const events = [];
  for (const date of windowDates(fromDate, days)) {
    const today = tournaments.filter(t => t.startDate <= date && t.endDate >= date);
    if (!today.length) continue;
    const progs = live.filter(p => ukDate(p.start) === date);
    for (const t of today) {
      const mine = today.length === 1 ? progs
        : progs.filter(p => nameScore(p, t.name) > 0 && nameScore(p, t.name) === Math.max(...today.map(o => nameScore(p, o.name))));
      const base = { comp: 'SNOOKER', kind: 'session', title: t.name, venue: t.venue, source: 'wst.tv', status: 'upcoming' };
      if (!mine.length) {
        if (!covered.has(date) && isMainEvent(t)) {
          events.push({
            ...base, id: `snooker-${t.id}-${date}`, kickoff: new Date(ukMidnight(date) + 12 * 3600000).toISOString(), end: null,
            session: null, timeTbc: true, allDay: true,
            tv: { broadcaster: null, channels: [], alsoOn: [], confirmed: false, note: 'TV times to be confirmed', conflict: false, sources: [] },
          });
        }
        continue;
      }
      for (const s of groupSessions(mine)) {
        events.push({
          ...base, id: `snooker-${t.id}-${s.start / 1000}`, kickoff: new Date(s.start).toISOString(), end: new Date(s.end).toISOString(),
          session: sessionLabel(s.start), timeTbc: false, tv: guideTv(s.progs, sids),
        });
      }
    }
  }
  return events;
}
