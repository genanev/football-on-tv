// EFL: Championship matches and League (Carabao) Cup ties.
//
// Sources
//   Fixtures   official EFL data feed (multi-club-matches.webapi.gc.eflservices.co.uk), the feed
//              behind efl.com's match centre. Competition 10 = Championship, 2 = League Cup.
//              Kick-off times are UTC; scores update during matches.
//   UK TV      Sky's TV guide ("Live EFL: Stoke v Middlesbrough"), then Sky's own "Football on Sky"
//              page, which also lists Sky Sports+ streams that aren't in the guide.
//
// Championship: every match is listed. Saturday 15:00 games aren't shown live in the UK; others
// without a confirmed channel say "TV channel to be confirmed" (no guessing from who holds the rights).
// League Cup: only ties confirmed on UK TV are listed (the cup tab is for televised ties).

import { getJSON, londonParts } from '../lib/util.mjs';
import { footballTv } from './footballTv.mjs';

const EFL_URL = 'https://multi-club-matches.webapi.gc.eflservices.co.uk/v2/matches';
const COMPETITION = { 10: 'CHAMP', 2: 'EFL Cup' };

const PERIOD = {
  PreMatch: 'upcoming', FirstHalf: 'live', HalfTime: 'live', SecondHalf: 'live', ExtraTime: 'live',
  ExtraFirstHalf: 'live', ExtraSecondHalf: 'live', ShootOut: 'live', FullTime: 'finished',
  Postponed: 'postponed', Abandoned: 'postponed', Cancelled: 'postponed',
};

export function mapEflMatch(d) {
  const a = d?.attributes || {};
  const kind = COMPETITION[a.competitionID];
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(a.kickOffDateUTC || '');
  if (!kind || !m) return null;
  const ts = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  const score = (t) => (typeof t?.score === 'number' ? t.score : null);
  const status = PERIOD[a.matchPeriod] || (a.postponementReason ? 'postponed' : 'upcoming');
  return {
    id: `efl-${d.id}`,
    comp: kind === 'CHAMP' ? 'CHAMP' : 'CUPS',
    label: kind === 'CHAMP' ? null : kind,
    kind: 'match',
    kickoff: new Date(ts).toISOString(),
    timeTbc: !!a.TBC,
    home: a.homeTeam?.name,
    away: a.awayTeam?.name,
    homeShort: a.homeTeam?.shortName || a.homeTeam?.name,
    awayShort: a.awayTeam?.shortName || a.awayTeam?.name,
    venue: null,
    status,
    homeScore: score(a.homeTeam),
    awayScore: score(a.awayTeam),
    source: 'efl.com',
  };
}

export async function fetchEfl(fromDate, toDate, seasonID) {
  const q = new URLSearchParams({
    from: `${fromDate} 00:00:00Z`, to: `${toDate} 23:59:59Z`, competitionID: '2,10', seasonID: String(seasonID), 'page.size': '100',
  });
  const out = [];
  for (let page = 1; page <= 5; page++) {
    const j = await getJSON(`${EFL_URL}?${q}&page.number=${page}`, { Origin: 'https://www.efl.com' });
    out.push(...(j.data || []).map(mapEflMatch).filter(Boolean));
    if (!j.links?.next) break;
  }
  return out;
}

/** EFL seasons start in summer: season 2026 = 2026/27. */
export const eflSeason = (now) => { const p = londonParts(now); return p.m >= 7 ? p.y : p.y - 1; };

export function eflEvents(matches, guide, listings) {
  const events = [];
  for (const m of matches) {
    const { tv } = footballTv(m, { guide, skyListings: listings });
    if (m.comp === 'CUPS' && !tv.channels.length) continue; // cup tab: televised ties only
    events.push({ ...m, tv });
  }
  return events;
}
