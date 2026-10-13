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
  4026: 'Sky Sports Golf',
  3625: 'TNT Sports 1',
  3627: 'TNT Sports 2',
  3629: 'TNT Sports 3',
  4040: 'TNT Sports 4',
  3000: 'BBC One',
  2075: 'BBC Two',
  2086: 'BBC Four',
  6504: 'ITV1',
  6534: 'ITV4',
  4075: 'Channel 4',
  4058: 'Channel 5',
};

/** Channels searched for each sport, most likely first (that order picks the main channel). */
export const SPORT_CHANNELS = {
  motorsport: [3835, 4002, 3940, 4075],
  darts: [4002, 3940, 4090, 4081, 3939, 4010, 6534, 6504],
  golf: [4026, 4002, 3940, 4090, 2075, 3000],
  snooker: [3625, 3627, 3629, 4040, 3000, 2075, 2086, 4058, 6534, 6504],
  cricket: [4081, 4002, 3940, 4090, 3625, 3627, 3629, 4040, 3000, 2075],
  football: [4002, 4010, 3939, 3940, 4090, 3625, 3627, 3629, 4040, 3000, 2075, 6504, 6534, 4058],
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

/** A confirmed `tv` object from the programmes that show an event. */
export function guideTv(progs, sids) {
  const chans = channelList(progs, sids);
  return { broadcaster: chans[0], channels: [chans[0]], alsoOn: chans.slice(1), confirmed: true, note: null, conflict: false, sources: ['sky-guide'] };
}

/** The UK dates (YYYY-MM-DD) of a window starting at UK date `from`. */
export function windowDates(from, days) {
  return Array.from({ length: days }, (_, i) => ukDate(ukMidnight(from) + i * 86400000 + 3 * 3600000)); // +3h keeps DST days right
}

const NAME_STOP = new Set(['championship', 'championships', 'open', 'golf', 'tour', 'presented', 'the', 'and', 'world', 'snooker', 'darts', 'classic', 'invitational', 'tournament', 'u', 's', 'us']);

/**
 * How many distinctive words of an event name appear in a programme's title + synopsis
 * (used to tell apart two tournaments on the same day). Generic words like "Open" don't count.
 */
export function nameScore(p, name) {
  const text = new Set(nameWords(`${p.title} ${p.synopsis}`, 1));
  return nameWords(name).filter(w => text.has(w)).length;
}

/** Distinctive lower-case words of a name (no accents, generic words, numbers or "154th"). */
export function nameWords(s, minLen = 4) {
  return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/)
    .filter(w => w.length >= minLen && !NAME_STOP.has(w) && !/^\d+(st|nd|rd|th)?$/.test(w));
}

/** Group programmes into sessions: simulcasts (same start) and back-to-back parts on one channel merge. */
export function groupSessions(progs) {
  const sessions = [];
  for (const p of [...progs].sort((a, b) => a.start - b.start)) {
    const s = sessions.find(s => Math.abs(s.start - p.start) <= 10 * 60000 ||
      (s.progs.some(q => q.sid === p.sid && p.start - q.end <= 5 * 60000 && p.start >= q.start)));
    if (s) { s.progs.push(p); s.end = Math.max(s.end, p.end); }
    else sessions.push({ start: p.start, end: p.end, progs: [p] });
  }
  return sessions;
}

/** "Morning session" before 12:00 UK, "Afternoon session" before 17:00, otherwise "Evening session". */
export function sessionLabel(ts) {
  const h = +new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', hourCycle: 'h23' }).format(new Date(ts));
  return h < 12 ? 'Morning session' : h < 17 ? 'Afternoon session' : 'Evening session';
}
