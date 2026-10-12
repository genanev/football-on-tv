// UK TV guide from Sky's own electronic programme guide (EPG) feed - the same data
// that drives the guide on Sky boxes and sky.com/tv-guide. It covers every channel on
// the Sky platform (Sky Sports, TNT Sports, ITV, Channel 4...), from today to about
// 8 days ahead. Past days are not available.
//
// Live programmes are marked by Sky with a "Live" title prefix ("Live MNF: ...",
// "Live: ATP Shanghai"), which is how repeats and highlights are told apart.

import { getJSON, ukDate, ukMidnight } from '../lib/util.mjs';

const BASE = 'https://awk.epgsky.com/hawk/linear/schedule';

/** Sky service IDs (from awk.epgsky.com/hawk/linear/services/4101/1) and display names. */
export const CHANNELS = {
  4002: 'Sky Sports Main Event',
  4010: 'Sky Sports Premier League',
  3939: 'Sky Sports Football',
  3940: 'Sky Sports+',
  3835: 'Sky Sports F1',
  4090: 'Sky Sports Mix',
  4081: 'Sky Sports Cricket',
  6504: 'ITV1',
  6534: 'ITV4',
  4075: 'Channel 4',
};

/** Channels searched for each sport, most likely first (that order picks the main channel). */
export const SPORT_CHANNELS = {
  motorsport: [3835, 4002, 3940, 4075],
  darts: [4002, 3940, 4090, 4081, 3939, 4010, 6534, 6504],
};

export const isLiveTitle = (t) => /^live\b/i.test(String(t || '').trim());

/** Flatten one day's EPG response into programmes. */
export function mapGuideDay(json) {
  const out = [];
  for (const s of json?.schedule || []) {
    const channel = CHANNELS[s.sid];
    if (!channel) continue;
    for (const e of s.events || []) {
      if (typeof e.st !== 'number' || typeof e.d !== 'number') continue;
      out.push({
        id: `${s.sid}-${e.eid}-${e.st}`,
        sid: Number(s.sid),
        channel,
        start: e.st * 1000,
        end: (e.st + e.d) * 1000,
        title: String(e.t || '').trim(),
        synopsis: String(e.sy || '').trim(),
        live: isLiveTitle(e.t),
      });
    }
  }
  return out;
}

/**
 * Fetch the guide for every UK date from `from` (inclusive) for `days` days.
 * Returns { programmes, coveredDates } - coveredDates are the days Sky actually returned listings for.
 */
export async function fetchGuide(from, days, sids = [...new Set(Object.values(SPORT_CHANNELS).flat())]) {
  const seen = new Map();
  const coveredDates = new Set();
  const errors = [];
  for (let i = 0; i < days; i++) {
    const date = ukDate(ukMidnight(from) + i * 86400000 + 3 * 3600000); // +3h keeps DST days on the right date
    try {
      const j = await getJSON(`${BASE}/${date.replace(/-/g, '')}/${sids.join(',')}`);
      const progs = mapGuideDay(j);
      if (progs.length) coveredDates.add(date);
      for (const p of progs) seen.set(p.id, p);
    } catch (e) {
      errors.push(`${date}: ${e.message}`);
    }
  }
  if (errors.length === days) throw new Error(errors[0]);
  return { programmes: [...seen.values()].sort((a, b) => a.start - b.start), coveredDates: [...coveredDates], errors };
}

/** Live programmes that are on air at `ts` (or start within `leadMs` after it), on the given channels. */
export function liveAt(programmes, ts, sids, leadMs = 15 * 60000) {
  return programmes.filter(p => p.live && sids.includes(p.sid) && p.start <= ts + leadMs && p.end > ts);
}

/** Order programmes by the channel order in `sids`, then drop duplicate channel names. */
export function channelList(progs, sids) {
  const sorted = [...progs].sort((a, b) => sids.indexOf(a.sid) - sids.indexOf(b.sid));
  return [...new Set(sorted.map(p => p.channel))];
}
