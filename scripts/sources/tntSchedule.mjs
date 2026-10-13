// TNT Sports' own TV schedule (tntsports.co.uk/watch/schedule.shtml), which lists everything TNT
// shows: its TV channels (TNT Sports 1-4) and live events streamed only on HBO Max, which aren't
// in any TV guide (most Europa League games, for example).
//
// The page loads each day from the Eurosport/TNT platform's GraphQL API (netsport.eurosport.io)
// with a "persisted query" - a fingerprint of the query in TNT's website code - and needs a
// `domain: www.tntsports.co.uk` header. If TNT updates its site the fingerprint can change; the
// request then fails, the report says so and the app shows a banner. To find the new one, open the
// schedule page, pick another day and look for "programsByDateQuery" in the network requests.

import { getJSON, ukMidnight } from '../lib/util.mjs';
import { windowDates } from './skyGuide.mjs';
import { teamSim } from './football.mjs';

const API = 'https://netsport.eurosport.io';
const QUERY_HASH = '343f6cbe5b3958cd35c13c61c74d6ae3127f8b7802a8dad90d488ddad9828084'; // programsByDateQuery
const HEADERS = { domain: 'www.tntsports.co.uk', Origin: 'https://www.tntsports.co.uk' };

/** TNT labels HBO Max streams with the bare channel name "TNT Sports". */
export function tntChannel(n) {
  const name = String(n?.channel?.name || '').trim();
  if (/^TNT Sports \d+$/i.test(name) || /box office/i.test(name)) return name;
  if (/hbomax/i.test(n?.programLink?.url || '') || /^TNT Sports$/i.test(name)) return 'HBO Max';
  return name || null;
}

export function mapTntDay(json) {
  return (json?.data?.programsByDate?.edges || []).map(({ node: n }) => ({
    id: n.id,
    start: Date.parse(n.startTime),
    end: Date.parse(n.endTime),
    title: String(n.title || '').trim(),
    subtitle: String(n.subtitle || '').trim(),
    sport: n.sportName || null,
    live: !!n.isLive,
    channel: tntChannel(n),
  })).filter(p => p.channel && !Number.isNaN(p.start));
}

/** Every programme from UK date `from` for `days` days (the page's own day boundaries: UK midnight). */
export async function fetchTntSchedule(from, days) {
  const seen = new Map();
  const errors = [];
  for (const date of windowDates(from, days)) {
    let after = null;
    try {
      for (let page = 0; page < 5; page++) {
        const variables = { after, date: new Date(ukMidnight(date)).toISOString(), first: 500 };
        const q = new URLSearchParams({
          extensions: JSON.stringify({ persistedQuery: { version: 1, sha256Hash: QUERY_HASH } }),
          operationName: 'programsByDateQuery',
          variables: JSON.stringify(variables),
        });
        const j = await getJSON(`${API}?${q}`, HEADERS);
        if (j.errors?.length) throw new Error(j.errors[0].message);
        for (const p of mapTntDay(j)) seen.set(`${p.id}-${p.channel}`, p);
        const info = j.data?.programsByDate?.pageInfo;
        if (!info?.hasNextPage) break;
        after = info.endCursor;
      }
    } catch (e) {
      errors.push(`${date}: ${e.message}`);
    }
  }
  if (errors.length === days) throw new Error(errors[0]);
  return { programmes: [...seen.values()].sort((a, b) => a.start - b.start), errors };
}

/** "RB Salzburg - AC Milan" -> ['RB Salzburg', 'AC Milan']. */
export function tntTeams(title) {
  const m = /^(.+?)\s+-\s+(.+?)(?:\s*\|.*)?$/.exec(String(title || ''));
  return m ? [m[1].trim(), m[2].trim()] : null;
}

/**
 * Live TNT programmes for a match: on air at kick-off (channel coverage often starts up to an
 * hour before with build-up), for the right competition, naming both teams (or one exactly, when
 * the other is spelt differently, e.g. "NEC" for UEFA's "N.E.C.").
 */
export function tntProgrammesFor(match, tnt, competition) {
  const ko = Date.parse(match.kickoff);
  const names = (side) => [match[side], match[`${side}Short`], match[`${side}Alt`]].filter(Boolean);
  return (tnt?.programmes || []).filter(p => {
    if (!p.live || !(p.start <= ko + 15 * 60000 && p.end > ko + 15 * 60000 && p.start >= ko - 2 * 3600000)) return false;
    if (competition && !p.subtitle.toLowerCase().includes(competition.toLowerCase())) return false;
    const teams = tntTeams(p.title);
    if (!teams) return false;
    const h = Math.max(...names('home').map(n => teamSim(n, teams[0])));
    const a = Math.max(...names('away').map(n => teamSim(n, teams[1])));
    return (h >= 0.5 && a >= 0.5) || Math.max(h, a) >= 0.85;
  });
}

/** TNT's TV channels first, then HBO Max. */
export function tntChannelOrder(names) {
  const rank = (c) => (/^TNT Sports \d+$/.test(c) ? +c.split(' ').pop() : c === 'HBO Max' ? 50 : 99);
  return [...new Set(names)].sort((a, b) => rank(a) - rank(b));
}
