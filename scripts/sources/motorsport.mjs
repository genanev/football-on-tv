// Formula 1, Formula 2 and Formula 3 session times, from the official Formula 1 data platform
// (api.formula1.com) that powers formula1.com, fiaformula2.com and fiaformula3.com.
//
// Each site's "event tracker" returns the current or next race weekend with its full
// session timetable (local start time + GMT offset). The API keys below are the public
// keys those websites send from every visitor's browser; if one stops working, the new
// one is in the site's JavaScript (search for "apikey").
//
// The tracker alone isn't enough: it keeps the current weekend until well after its race, so on
// a race Sunday a back-to-back weekend 5-6 days later was missing (Mexico City, 1 Nov 2026,
// hid the São Paulo GP of 6-8 Nov, which George spotted). So:
// - F1 reads its season calendar (the "Schedule" page's data) every update, then each weekend in
//   the window from /event-tracker/meeting/<key>. Careful: that answer's `seasonContext` still
//   describes the CURRENT weekend; the asked-for weekend's sessions are in `meetingContext`.
// - F2 and F3 have no calendar feed with the key we have, so they keep their tracker and, when
//   its weekend ends inside the window (another round may follow within it), read the season
//   calendar page (fiaformula2.com/en/racing/<year>) and the following round's own page, whose
//   data has the same session list as the tracker. That's only on race weekends, so the two big
//   pages aren't read on every update.
// A calendar weekend in the window whose sessions can't be read is reported (ok: false, so the
// app shows its yellow banner) rather than silently missing.
//
// UK TV: from Sky's TV guide when a live programme covers the session, else from Sky's own
// "F1 on Sky" page; otherwise "TV channel to be confirmed" (no guessing from who holds the rights).

import { getJSON, getText, parseWithOffset, ukDate, ukMidnight } from '../lib/util.mjs';
import { listingTv } from './skyListings.mjs';
import { SPORT_CHANNELS, channelList, liveAt } from './skyGuide.mjs';

const F1_URL = 'https://api.formula1.com/v1/event-tracker';
const F1_CALENDAR_URL = 'https://api.formula1.com/v1/editorial-eventlisting/events';
const F1_MEETING_URL = 'https://api.formula1.com/v1/event-tracker/meeting/';
const F1_KEY = 'BQ1SiSmLUOsp460VzXBlLrh689kGgYEZ'; // formula1.com public web key
const F2_URL = 'https://api.formula1.com/v1/core-event-tracker/f2';
const F2_KEY = 'MsEALPOPbzgjZIWE6GmU2O69VKY8zZpi'; // fiaformula2.com public web key
const F3_URL = 'https://api.formula1.com/v1/core-event-tracker/f3';
// fiaformula3.com public web key (in the page's config as api.key.public, not as "apikey")
const F3_KEY = 'gGX8kMJ7NQmaRfrltWE0xrGgHaEfv1Cn';
const SOURCE = { F1: 'formula1.com', F2: 'fiaformula2.com', F3: 'fiaformula3.com' };

const STATE = { completed: 'finished', live: 'live', started: 'live', upcoming: 'upcoming', cancelled: 'cancelled' };

/** Turn one event-tracker timetable entry into an app event (practice sessions are skipped). */
export function mapSession(comp, s, race) {
  const label = comp === 'F1' ? s.description : (s.shortName || s.description);
  if (!label || /practice/i.test(`${s.sessionType} ${s.description} ${s.shortName}`)) return null;
  const start = parseWithOffset(s.startTime, s.gmtOffset);
  if (start == null) return null;
  const end = parseWithOffset(s.endTime, s.gmtOffset) ?? start + 3600000;
  const status = String(s.sessionStatus || '').toLowerCase() === 'cancelled' ? 'cancelled' : STATE[s.state] || 'upcoming';
  const tbc = String(s.sessionStatus || '').toUpperCase() === 'TBC';
  // Before the times are out, F2/F3 put every session at local midnight ("2026-12-04T00:00:00",
  // Abu Dhabi), which is the evening before in the UK: show it as "TBC" on its own day instead
  if (tbc && /T00:00(:00)?$/.test(s.startTime || '')) {
    const date = s.startTime.slice(0, 10);
    return {
      id: `${comp.toLowerCase()}-${s.meetingSessionKey}`, comp, kind: 'session',
      kickoff: new Date(ukMidnight(date) + 12 * 3600000).toISOString(), end: null,
      title: comp === 'F1' ? race?.meetingName : race?.meetingCountryName || race?.meetingName,
      session: label, venue: race?.circuitShortName || race?.meetingLocation || null,
      status, timeTbc: true, allDay: true, source: SOURCE[comp],
    };
  }
  return {
    id: `${comp.toLowerCase()}-${s.meetingSessionKey}`,
    comp,
    kind: 'session',
    kickoff: new Date(start).toISOString(),
    end: new Date(end).toISOString(),
    title: comp === 'F1' ? race?.meetingName : race?.meetingCountryName || race?.meetingName,
    session: label,
    venue: race?.circuitShortName || race?.meetingLocation || null,
    status,
    // F2/F3 mark provisional timetables "TBC" until the times are confirmed.
    timeTbc: tbc,
    source: SOURCE[comp],
  };
}

export function mapF1Tracker(j) {
  return (j?.seasonContext?.timetables || []).map(s => mapSession('F1', s, j.race)).filter(Boolean);
}

export function mapF2Tracker(j) {
  return (j?.race?.meetingSessions || []).map(s => mapSession('F2', s, j.race)).filter(Boolean);
}

/**
 * F3 qualifies in two groups, ten minutes each, 20 minutes apart ("Group A - Qualifying",
 * "Group B - Qualifying"); TV shows them as one programme, so they become one "Qualifying" entry.
 */
export function mapF3Tracker(j) {
  const out = [];
  for (const s of (j?.race?.meetingSessions || []).map(x => mapSession('F3', x, j.race)).filter(Boolean)) {
    const prev = out[out.length - 1];
    if (/qualifying/i.test(s.session) && prev && /qualifying/i.test(prev.session)
      && (Date.parse(s.kickoff) - Date.parse(prev.end) <= 3600000 || (s.allDay && prev.allDay && s.kickoff === prev.kickoff))) {
      prev.end = s.end;
      prev.timeTbc = prev.timeTbc || s.timeTbc;
      continue;
    }
    out.push(/qualifying/i.test(s.session) ? { ...s, session: 'Qualifying' } : s);
  }
  return out;
}

/** The F1 calendar's race weekends (test events skipped) that overlap [from, to), in ms. */
export function f1MeetingsIn(calendar, from, to) {
  return (calendar?.events || []).filter(e => e.meetingKey && !e.isTestEvent).filter(e => {
    const start = parseWithOffset(e.meetingStartDate, e.gmtOffset);
    const end = parseWithOffset(e.meetingEndDate, e.gmtOffset);
    return start != null && end != null && start < to && end >= from;
  }).map(e => ({ key: String(e.meetingKey), name: e.meetingName }));
}

/** One weekend's sessions from /event-tracker/meeting/<key> (its meetingContext, not seasonContext). */
export function mapF1Meeting(j, key) {
  if (key != null && String(j?.meetingContext?.meetingKey) !== String(key)) return [];
  return (j?.meetingContext?.timetables || []).map(s => mapSession('F1', s, j.race)).filter(Boolean);
}

/**
 * Every F1 weekend that overlaps [from, to): { sessions, weekends, warning }. Without the
 * calendar it falls back to the tracker's current-or-next weekend, with a warning.
 */
export async function fetchF1(from, to) {
  const get = (url) => getJSON(url, { apikey: F1_KEY, locale: 'en' });
  let meetings;
  try {
    meetings = f1MeetingsIn(await get(F1_CALENDAR_URL), from, to);
  } catch (e) {
    return { sessions: mapF1Tracker(await get(F1_URL)), weekends: [], warning: `F1 calendar unavailable (${e.message}), so only the current or next weekend` };
  }
  const got = await Promise.allSettled(meetings.map(m => get(F1_MEETING_URL + m.key)));
  const sessions = [];
  const missing = [];
  got.forEach((g, i) => {
    const s = g.status === 'fulfilled' ? mapF1Meeting(g.value, meetings[i].key) : [];
    if (!s.length) missing.push(meetings[i].name);
    sessions.push(...s);
  });
  return { sessions, weekends: meetings.map(m => m.name), warning: missing.length ? `no sessions read for ${missing.join(', ')}` : null };
}

// ---------------------------------------------------------------- F2 and F3 season calendars

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const pad = (n) => String(n).padStart(2, '0');

/**
 * The rounds on fiaformula2.com's or fiaformula3.com's season page (/en/racing/<year>): each card
 * links to /en/racing/<year>/<slug> and shows the dates ("04 - 06 Dec", "30 Oct - 01 Nov"; past
 * rounds show results instead, so they may have none). Returns [{ slug, url, name, country,
 * start, end }] with dates as YYYY-MM-DD (the track's local dates).
 */
export function parseRounds(html) {
  const rounds = new Map();
  const links = [...html.matchAll(/href="(\/en\/racing\/(\d{4})\/([a-z0-9-]+))"[^>]*>([^<]+)<\/a>/g)];
  links.forEach((m, i) => {
    const [, url, year, slug, name] = m;
    const seg = html.slice(m.index, Math.min(links[i + 1]?.index ?? html.length, m.index + 4000));
    const country = (/^[^]*?<\/a>(?:<\/span>)?<span[^>]*>([^<]+)<\/span>/.exec(seg) || [])[1];
    const d = />\s*(\d{1,2})(?:\s+([A-Za-z]{3}))?\s*-\s*(\d{1,2})\s+([A-Za-z]{3})\s*</.exec(seg);
    const r = rounds.get(slug) || { slug, url, name: name.trim(), country: null, start: null, end: null };
    // The highlight cards (previous/next) have no country line: only take a real-looking one
    if (!r.country && country && !/^\d|round/i.test(country.trim())) r.country = country.trim();
    if (!r.start && d) {
      const endMonth = MONTHS[d[4].toLowerCase()];
      const startMonth = d[2] ? MONTHS[d[2].toLowerCase()] : endMonth;
      if (startMonth && endMonth) {
        r.start = `${year}-${pad(startMonth)}-${pad(d[1])}`;
        r.end = `${year}-${pad(endMonth)}-${pad(d[3])}`;
      }
    }
    rounds.set(slug, r);
  });
  return [...rounds.values()];
}

/**
 * A round page's session list. The page embeds the same data as the event tracker
 * ("meetingSessions": [...]), usually inside an escaped string of the page's script data.
 */
export function parseRoundSessions(html) {
  for (const [marker, escaped] of [['"meetingSessions":[', false], ['\\"meetingSessions\\":[', true]]) {
    const at = html.indexOf(marker);
    if (at < 0) continue;
    const open = at + marker.length - 1;
    let depth = 0;
    let close = -1;
    for (let i = open; i < html.length; i++) {
      if (html[i] === '[') depth++;
      else if (html[i] === ']' && --depth === 0) { close = i; break; }
    }
    if (close < 0) return [];
    const raw = html.slice(open, close + 1);
    return JSON.parse(escaped ? JSON.parse(`"${raw}"`) : raw);
  }
  return [];
}

/**
 * The current-or-next weekend from the tracker, plus any later round that starts inside the
 * window when the tracker's weekend ends inside it (back-to-back weekends): { sessions, weekends,
 * warning }.
 */
async function trackerAndNextRound(comp, trackerUrl, key, site, from, to) {
  const map = comp === 'F3' ? mapF3Tracker : mapF2Tracker;
  const tracker = await getJSON(trackerUrl, { apikey: key, locale: 'en', Origin: site });
  const sessions = map(tracker);
  const race = tracker?.race;
  const weekends = race ? [race.meetingCountryName || race.meetingName] : [];
  const lastSession = Math.max(0, ...sessions.map(s => Date.parse(s.end)));
  const trackerEnd = Math.max(Date.parse(race?.meetingEndDate) || 0, lastSession);
  if (!race || trackerEnd >= to) return { sessions, weekends, warning: null };

  // Compare the track's local dates with the window's, a day wider each side (time zones)
  const first = ukDate(from - 86400000);
  const last = ukDate(to + 86400000);
  const done = ukDate(trackerEnd);
  try {
    const year = ukDate(from).slice(0, 4);
    const rounds = parseRounds(await getText(`${site}/en/racing/${year}`));
    const next = rounds.filter(r => r.start && r.start > done && r.start <= last && r.end >= first);
    const missing = [];
    for (const r of next) {
      const got = parseRoundSessions(await getText(site + r.url));
      const more = map({ race: { meetingSessions: got, meetingCountryName: r.country, meetingName: r.name, circuitShortName: r.name } });
      if (!more.length) missing.push(r.country || r.name);
      for (const s of more) if (!sessions.some(x => x.id === s.id)) sessions.push(s);
      weekends.push(r.country || r.name);
    }
    return { sessions, weekends, warning: missing.length ? `no sessions read for ${missing.join(', ')}` : null };
  } catch (e) {
    return { sessions, weekends, warning: `${comp} calendar unavailable (${e.message}), so only the current or next weekend` };
  }
}

export function fetchF2(from, to) {
  return trackerAndNextRound('F2', F2_URL, F2_KEY, 'https://www.fiaformula2.com', from, to);
}

/** F3 weekends (none between the season's last round, in September, and March). */
export function fetchF3(from, to) {
  return trackerAndNextRound('F3', F3_URL, F3_KEY, 'https://www.fiaformula3.com', from, to);
}

/** Which series a TV programme is about, from its title (or synopsis if the title is vague). */
export function seriesOf(p) {
  const classify = (s) => {
    if (/formula 2|\bf2\b/i.test(s)) return 'F2';
    if (/formula 3|\bf3\b/i.test(s)) return 'F3';
    if (/f1 academy|porsche|supercup/i.test(s)) return 'other';
    if (/formula 1|\bf1\b|grand prix|\bgp\b|qualifying|sprint/i.test(s)) return 'F1';
    return null;
  };
  return classify(p.title) || classify(p.synopsis) || 'unknown';
}

/** Does a Sky "F1 on Sky" title ("United States GP - Qualifying 1") describe this session? */
export function sessionMatches(ev, title) {
  if (seriesOf({ title, synopsis: '' }) !== ev.comp) return false;
  const part = String(title).split(' - ').pop().toLowerCase();
  const s = String(ev.session).toLowerCase();
  if (/sprint qualifying|sprint shootout/.test(s)) return /sprint (qualifying|shootout)/.test(part);
  if (/qualifying/.test(s)) return /qualifying/.test(part) && !/sprint/.test(part);
  if (/feature race/.test(s)) return /feature/.test(part);
  if (/sprint/.test(s)) return /sprint/.test(part) && !/qualifying|shootout/.test(part);
  if (/race/.test(s)) return /^race$|grand prix$/.test(part.trim()) && !/sunday|saturday/.test(part);
  return false;
}

/** UK TV for an F1/F2/F3 session: the TV guide, then Sky's F1 page; never a guess. */
export function motorsportTv(ev, guide, listings) {
  const sids = SPORT_CHANNELS.motorsport;
  const start = Date.parse(ev.kickoff);
  // A session without a time yet (allDay) has no moment to be on air at: only Sky's page can name it
  const progs = ev.allDay ? [] : liveAt(guide?.programmes || [], start, sids).filter(p => seriesOf(p) === ev.comp);
  const tv = { broadcaster: null, channels: [], alsoOn: [], confirmed: false, note: null, conflict: false, sources: [] };
  if (progs.length) {
    const chans = channelList(progs, sids);
    tv.channels = [chans[0]];
    tv.alsoOn = chans.slice(1);
    tv.broadcaster = chans[0];
    tv.confirmed = true;
    tv.sources.push('sky-guide');
    return tv;
  }
  const date = ukDate(start);
  const listed = (listings?.entries || []).find(e => e.page === 'f1-on-sky' && e.date === date && e.title && sessionMatches(ev, e.title));
  if (listed) return listingTv(listed);
  return { broadcaster: null, channels: [], alsoOn: [], confirmed: false, note: 'TV channel to be confirmed', conflict: false, sources: [] };
}
