// Formula 1 and Formula 2 session times, from the official Formula 1 data platform
// (api.formula1.com) that powers formula1.com and fiaformula2.com.
//
// Each site's "event tracker" returns the current or next race weekend with its full
// session timetable (local start time + GMT offset). The API keys below are the public
// keys those websites send from every visitor's browser; if one stops working, the new
// one is in the site's JavaScript (search for "apikey").
//
// Known limit: only the current-or-next weekend is returned, so on a race Sunday a
// back-to-back weekend 5-6 days later appears once the current weekend has finished.
//
// UK TV: Sky Sports F1 holds the UK rights to F1 and F2 (Channel 4 shows the British GP
// live). The channel is confirmed from Sky's TV guide when a live programme covers the session.

import { getJSON, parseWithOffset, ukDate } from '../lib/util.mjs';
import { SPORT_CHANNELS, channelList, liveAt } from './skyGuide.mjs';

const F1_URL = 'https://api.formula1.com/v1/event-tracker';
const F1_KEY = 'BQ1SiSmLUOsp460VzXBlLrh689kGgYEZ'; // formula1.com public web key
const F2_URL = 'https://api.formula1.com/v1/core-event-tracker/f2';
const F2_KEY = 'MsEALPOPbzgjZIWE6GmU2O69VKY8zZpi'; // fiaformula2.com public web key

const STATE = { completed: 'finished', live: 'live', started: 'live', upcoming: 'upcoming', cancelled: 'cancelled' };

/** Turn one event-tracker timetable entry into an app event (practice sessions are skipped). */
export function mapSession(comp, s, race) {
  const label = comp === 'F1' ? s.description : (s.shortName || s.description);
  if (!label || /practice/i.test(`${s.sessionType} ${s.description} ${s.shortName}`)) return null;
  const start = parseWithOffset(s.startTime, s.gmtOffset);
  if (start == null) return null;
  const end = parseWithOffset(s.endTime, s.gmtOffset) ?? start + 3600000;
  const status = String(s.sessionStatus || '').toLowerCase() === 'cancelled' ? 'cancelled' : STATE[s.state] || 'upcoming';
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
    // F2 marks provisional timetables "TBC" until the times are confirmed.
    timeTbc: String(s.sessionStatus || '').toUpperCase() === 'TBC',
    source: comp === 'F1' ? 'formula1.com' : 'fiaformula2.com',
  };
}

export function mapF1Tracker(j) {
  return (j?.seasonContext?.timetables || []).map(s => mapSession('F1', s, j.race)).filter(Boolean);
}

export function mapF2Tracker(j) {
  return (j?.race?.meetingSessions || []).map(s => mapSession('F2', s, j.race)).filter(Boolean);
}

export async function fetchF1() {
  return mapF1Tracker(await getJSON(F1_URL, { apikey: F1_KEY, locale: 'en' }));
}

export async function fetchF2() {
  return mapF2Tracker(await getJSON(F2_URL, { apikey: F2_KEY, locale: 'en', Origin: 'https://www.fiaformula2.com' }));
}

/** Which series a TV programme is about, from its title (or synopsis if the title is vague). */
export function seriesOf(p) {
  const classify = (s) => {
    if (/formula 2|\bf2\b/i.test(s)) return 'F2';
    if (/formula 3|\bf3\b|f1 academy|porsche|supercup/i.test(s)) return 'other';
    if (/formula 1|\bf1\b|grand prix|\bgp\b|qualifying|sprint/i.test(s)) return 'F1';
    return null;
  };
  return classify(p.title) || classify(p.synopsis) || 'unknown';
}

/** UK TV for an F1/F2 session, confirmed from the Sky guide where possible. */
export function motorsportTv(ev, guide) {
  const sids = SPORT_CHANNELS.motorsport;
  const start = Date.parse(ev.kickoff);
  const progs = liveAt(guide?.programmes || [], start, sids).filter(p => seriesOf(p) === ev.comp);
  const tv = { broadcaster: 'Sky Sports', channels: [], alsoOn: [], confirmed: false, note: null, conflict: false, sources: ['uk-rights'] };
  if (progs.length) {
    const chans = channelList(progs, sids);
    tv.channels = [chans[0]];
    tv.alsoOn = chans.slice(1);
    tv.broadcaster = chans[0];
    tv.confirmed = true;
    tv.sources.push('sky-guide');
  } else {
    tv.broadcaster = 'Sky Sports F1';
    const listed = guide?.coveredDates?.includes(ukDate(start));
    tv.note = listed ? 'Not yet confirmed in the TV guide' : 'Expected – TV guide not available yet';
  }
  return tv;
}
