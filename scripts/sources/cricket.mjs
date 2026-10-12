// Cricket: men's internationals (Tests, ODIs, T20Is) between the 12 ICC Full Members.
//
// Sources
//   Fixtures   official ICC data feed (assets-icc.sportz.io), the feed behind icc-cricket.com
//              fixtures. Start and end times are given in GMT.
//   UK TV      Sky's TV guide: a programme on a cricket channel that is on air at the start of
//              play and names one of the teams.
//
// England matches are always listed (with "TV channel to be confirmed" until the guide shows
// them). Other internationals are listed only when they are live on UK TV.
// A Test has one entry per day of play.

import { getJSON } from '../lib/util.mjs';
import { SPORT_CHANNELS, guideTv } from './skyGuide.mjs';

const ICC_URL = 'https://assets-icc.sportz.io/cricket/v1/schedule';
const ICC_CLIENT = 'tPZJbRgIub3Vua93/DWtyQ=='; // icc-cricket.com public client id

export const FULL_MEMBERS = new Set(['Afghanistan', 'Australia', 'Bangladesh', 'England', 'India', 'Ireland', 'New Zealand',
  'Pakistan', 'South Africa', 'Sri Lanka', 'West Indies', 'Zimbabwe']);

const FORMAT = { 'Test International - m': 'Test', 'ODI International - m': 'ODI', 'T20 International - m': 'T20I' };

/** "10/20/2026" + "08:00" (GMT) -> timestamp. */
export function parseGmt(date, time) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(date || '');
  const t = /^(\d{1,2}):(\d{2})$/.exec(time || '');
  if (!m || !t) return null;
  return Date.UTC(+m[3], +m[1] - 1, +m[2], +t[1], +t[2]);
}

const STATUS = (m) => (m.live ? 'live' : /ended|abandon|result|won|drawn|tied/i.test(m.match_status || '') ? 'finished' : 'upcoming');

/** One entry per match, or per day of a Test. */
export function mapMatch(m) {
  const fmt = FORMAT[m.comp_type];
  if (!fmt || !FULL_MEMBERS.has(m.teama) || !FULL_MEMBERS.has(m.teamb)) return [];
  const start = parseGmt(m.match_date_gmt, m.match_time_gmt);
  if (start == null) return [];
  const lastEnd = parseGmt(m.end_match_date_gmt, m.end_match_time_gmt) ?? start + 8 * 3600000;
  const num = m.match_number || '';
  const label = new RegExp(`\\b${fmt === 'T20I' ? 'T20' : fmt}`, 'i').test(num) ? num : `${num} (${fmt})`.trim();
  const base = {
    comp: 'CRICKET', kind: 'session', title: `${m.teama} v ${m.teamb}`, teams: [m.teama, m.teamb],
    venue: m.venue || null, series: m.series_name || null, source: 'icc-cricket.com', matchNumber: num,
  };
  if (fmt !== 'Test') {
    return [{ ...base, id: `cricket-${m.match_id}`, kickoff: new Date(start).toISOString(), end: new Date(lastEnd).toISOString(), session: label, status: STATUS(m), timeTbc: false }];
  }
  // Test: same start time each day; each day lasts as long as the last day's play window suggests
  const dayLen = Math.max(6 * 3600000, (lastEnd - start) % 86400000 || 7 * 3600000);
  const days = Math.max(1, Math.round((lastEnd - start) / 86400000) + 1);
  return Array.from({ length: days }, (_, i) => {
    const k = start + i * 86400000;
    return { ...base, id: `cricket-${m.match_id}-d${i + 1}`, kickoff: new Date(k).toISOString(), end: new Date(k + dayLen).toISOString(), session: `${label}, Day ${i + 1}`, status: 'upcoming', timeTbc: false };
  });
}

export async function fetchCricket(fromDate, toDate) {
  const ymd = (d) => d.replace(/-/g, '');
  const from = ymd(new Date(Date.parse(`${fromDate}T00:00:00Z`) - 6 * 86400000).toISOString().slice(0, 10)); // catch Tests already under way
  const out = [];
  for (let page = 1; page <= 10; page++) {
    const q = new URLSearchParams({
      client_id: ICC_CLIENT, feed_format: 'json', lang: 'en', league_ids: '1', is_deleted: 'false', is_live: 'true', is_recent: 'true', is_upcoming: 'true',
      pagination: 'true', page_size: '100', page_number: String(page), from_date: from, to_date: ymd(toDate), timezone: '0000',
    });
    const j = await getJSON(`${ICC_URL}?${q}`, { Origin: 'https://www.icc-cricket.com' });
    const matches = j?.data?.matches || [];
    out.push(...matches.flatMap(mapMatch));
    if (matches.length < 100) break;
  }
  return out;
}

const NOT_LIVE = /\bhlts\b|highlights|reload|review|preview|my icon|official film|countdown|classic|greatest|auction|the test within/i;
const CRICKET = /cricket|\bT20|\bODI\b|\bTest\b/i;
const ordinal = (s) => (/(\d+)(?:st|nd|rd|th)\b/i.exec(s || '') || [])[1] || null;

/** Programmes showing this match (or Test day) live: on air at the start, naming a team, same match number. */
export function cricketProgrammes(ev, programmes) {
  const sids = SPORT_CHANNELS.cricket;
  const start = Date.parse(ev.kickoff);
  const num = ordinal(ev.matchNumber);
  return programmes.filter(p => {
    if (!sids.includes(p.sid) || NOT_LIVE.test(p.title)) return false;
    if (!(p.start <= start + 3600000 && p.end > start + 30 * 60000)) return false; // on air around the start of play
    // Programmes labelled "Live" may name the teams in the synopsis ("Live 1st Test Day 4: SA v AUS").
    // Unlabelled ones ("India - T20 International Cricket") must start close to play and say it in the title.
    if (!p.live && p.start < start - 90 * 60000) return false;
    const text = p.live ? `${p.title} ${p.synopsis}` : p.title;
    if (!CRICKET.test(text) || !ev.teams.some(t => text.includes(t))) return false;
    const pNum = ordinal(p.title);
    return !(num && pNum && num !== pNum);
  });
}

export function cricketEvents(matches, guide) {
  const events = [];
  for (const ev of matches) {
    const progs = cricketProgrammes(ev, guide?.programmes || []);
    const { teams, matchNumber, ...out } = ev;
    if (progs.length) {
      // The main channel is one that's on air at the start of play; channels joining later are "also on".
      const start = Date.parse(ev.kickoff);
      const atStart = progs.filter(p => p.start <= start + 15 * 60000);
      const tv = guideTv(atStart.length ? atStart : progs, SPORT_CHANNELS.cricket);
      const every = guideTv(progs, SPORT_CHANNELS.cricket);
      tv.alsoOn = [...new Set([...tv.alsoOn, ...every.channels, ...every.alsoOn])].filter(c => !tv.channels.includes(c));
      events.push({ ...out, tv });
    }
    else if (teams.includes('England')) {
      events.push({ ...out, tv: { broadcaster: null, channels: [], alsoOn: [], confirmed: false, note: 'TV channel to be confirmed', conflict: false, sources: [] } });
    }
  }
  return events;
}
