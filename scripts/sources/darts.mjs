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
import { SPORT_CHANNELS, channelList } from './skyGuide.mjs';

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

/** How well a programme's text mentions the tournament name (for days with two tournaments). */
function nameScore(p, t) {
  const words = t.name.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  const text = `${p.title} ${p.synopsis}`.toLowerCase();
  return words.filter(w => text.includes(w)).length;
}

/** Group programmes into sessions: simulcasts (same start) and back-to-back parts on one channel merge. */
function groupSessions(progs) {
  const sessions = [];
  for (const p of [...progs].sort((a, b) => a.start - b.start)) {
    const s = sessions.find(s => Math.abs(s.start - p.start) <= 10 * 60000 ||
      (s.progs.some(q => q.sid === p.sid && p.start - q.end <= 5 * 60000 && p.start >= q.start)));
    if (s) { s.progs.push(p); s.end = Math.max(s.end, p.end); }
    else sessions.push({ start: p.start, end: p.end, progs: [p] });
  }
  return sessions;
}

const sessionLabel = (ts) => (+new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', hourCycle: 'h23' }).format(new Date(ts)) < 17
  ? 'Afternoon session' : 'Evening session');

/**
 * Build darts events for the window: one per live TV session, or one "times to be confirmed"
 * entry per tournament day the guide has nothing for.
 */
export function dartsEvents(tournaments, guide, fromDate, days) {
  const sids = SPORT_CHANNELS.darts;
  const live = (guide?.programmes || []).filter(p => p.live && sids.includes(p.sid) && isDarts(p));
  const events = [];
  for (let i = 0; i < days; i++) {
    const date = ukDate(ukMidnight(fromDate) + i * 86400000 + 3 * 3600000);
    const today = tournaments.filter(t => t.startDate <= date && t.endDate >= date);
    if (!today.length) continue;
    const progs = live.filter(p => ukDate(p.start) === date);
    for (const t of today) {
      const mine = today.length === 1 ? progs
        : progs.filter(p => nameScore(p, t) === Math.max(...today.map(o => nameScore(p, o))) && nameScore(p, t) > 0);
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
        const chans = channelList(s.progs, sids);
        events.push({
          ...base, id: `darts-${t.id}-${s.start / 1000}`, kickoff: new Date(s.start).toISOString(), end: new Date(s.end).toISOString(),
          session: sessionLabel(s.start), status: 'upcoming', timeTbc: false,
          tv: { broadcaster: chans[0], channels: [chans[0]], alsoOn: chans.slice(1), confirmed: true, note: null, conflict: false, sources: ['sky-guide'] },
        });
      }
    }
  }
  return events;
}
