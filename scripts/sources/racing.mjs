// Christmas racing (a Special; George, 14 Nov 2026): ITV's four days of jump racing after
// Christmas - the King George VI Chase at Kempton on Boxing Day, Kempton again on the 27th, the Welsh
// Grand National at Chepstow and the Challow Hurdle at Newbury (26-29 Dec 2026). One entry per ITV
// programme, named after the course, with the day's feature race.
//
// Sources
//   Dates  **Written here by hand** (George agreed, 14 Nov 2026): 26-29 December each year. This is
//          the one Special whose dates don't come from the organiser: the British Horseracing
//          Authority's fixtures feeds refuse scripts (503 / 403), and the four days were announced by
//          the BHA and ITV. If a year's days differ (the Welsh Grand National moves when the 27th is a
//          Sunday), change `christmasRacing`.
//   TV     Sky's TV guide, ITV1 and ITV4 (no guessing). ITV's titles, seen on 14 Nov 2026 (ITV4):
//          "ITV Racing: Live from Cheltenham", description "Ed Chamberlin presents live action from
//          Cheltenham and Windsor. Today's feature race is the Paddy Power Gold Cup."; and "ITV
//          Racing: The Opening Show" (a morning preview, not racing: skipped). No "Live" prefix.
//          Check the Christmas titles when they appear (from about 19 Dec 2026).

import { ukDate, londonParts } from '../lib/util.mjs';
import { isLiveCoverage, groupSessions, guideTv, windowDates } from './skyGuide.mjs';
import { SPECIALS } from './specials.mjs';

const COMP = 'SPECIAL_RACING';
const ITV = [6504, 6534]; // ITV1 first, then ITV4

/** This Christmas's racing days (UK dates): 26-29 December of the year `now` is in. */
export function christmasRacing(now) {
  const { y } = londonParts(now);
  return { comp: COMP, name: SPECIALS.find(s => s.comp === COMP).name, startDate: `${y}-12-26`, endDate: `${y}-12-29`, source: 'sky-guide' };
}

const isRacing = (p) => /^ITV Racing\b/i.test(p.title) && !/opening show|preview/i.test(p.title);
const courseOf = (p) => /\blive from\s+(.+?)\s*$/i.exec(p.title)?.[1] || null;
const featureOf = (p) => /feature race is the\s+(.+?)\.(?:\s|$)/i.exec(p.synopsis || '')?.[1] || null;

/** One entry per ITV racing programme on the event's days (ITV1 and ITV4 together are one entry). */
export function racingEvents(ev, guide, fromDate, days) {
  const dates = new Set(windowDates(fromDate, days).filter(d => d >= ev.startDate && d <= ev.endDate));
  if (!dates.size) return [];
  const progs = (guide?.programmes || []).filter(p => ITV.includes(p.sid) && isRacing(p) && isLiveCoverage(p) && dates.has(ukDate(p.start)));
  return groupSessions(progs).map(s => {
    const named = s.progs.find(courseOf) || s.progs[0];
    return {
      id: `racing-${s.start}`, comp: ev.comp, kind: 'session', label: null,
      title: courseOf(named) || 'ITV Racing', session: s.progs.map(featureOf).find(Boolean) || null,
      source: ev.source, status: 'upcoming',
      kickoff: new Date(s.start).toISOString(), end: new Date(s.end).toISOString(), timeTbc: false,
      tv: guideTv(s.progs, ITV),
    };
  });
}
