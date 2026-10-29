// Alpine skiing: every World Cup race and the World Championships (George, 29 Oct 2026), one entry
// per run, with UK channels from TNT Sports' own schedule.
//
// Source
//   FIS (the sport's governing body): the iCal calendar feed behind fis-ski.com's calendar,
//   www.fis-ski.com/DB/services/public/icalendar-feed-fis-events.html?seasoncode=<YYYY>&sectorcode=AL&categorycode=<WC|WSC>
//   (WC = World Cup, WSC = World Championships; seasoncode 2027 = the 2026/27 season). One VEVENT
//   per race: DTSTART is the first run in UTC ("20261024T083000Z"), DESCRIPTION gives the gender,
//   the discipline and each run's local start ("Run 1 loc: 10:30\nRun 2 loc: 13:30"). Slalom and
//   giant slalom have two runs, downhill and super-G one. A race without a time yet is date-only
//   ("DTSTART;VALUE=DATE:20270204": the World Championships in Oct 2026) and shows as "TBC" on its
//   day. Qualification rounds are skipped. The DESCRIPTION's escapes are FIS's own: "\n" between
//   most fields, but "Gender: Men\Event: Slalom".
//
// UK TV (no guessing): TNT Sports' schedule (sport "Alpine Skiing", titles "Sölden | Women's Giant
// Slalom", subtitles "World Cup | Run 1"), its channels and HBO Max streams. Its coverage starts
// about 30 minutes before FIS's start time. Sky's TV guide isn't used yet: no skiing listing could
// be captured from it (it has no past days, and the next race was over a week away); add it once a
// real entry has been seen.

import { getText, ukDate, ukMidnight, londonParts } from '../lib/util.mjs';
import { tntChannelOrder } from './tntSchedule.mjs';

const FIS_URL = 'https://www.fis-ski.com/DB/services/public/icalendar-feed-fis-events.html';
const CATEGORIES = { WC: 'World Cup', WSC: 'World Championships' };
const LEAD = 30 * 60000;
// How long a run is shown as live: the two-run events' runs, then downhill and super-G
const RUN_LENGTH = { twoRuns: 90 * 60000, oneRun: 120 * 60000 };

// FIS writes place names without accents ("Soelden"); the usual English spellings
const PLACES = {
  Soelden: 'Sölden', Kitzbuehel: 'Kitzbühel', Are: 'Åre', "Val d'Isere": "Val d'Isère",
  'Val Gardena-Groeden Südtirol': 'Val Gardena', 'Crans Montana': 'Crans-Montana', 'Dachstein West / Gosau': 'Gosau',
};
export const placeName = (loc) => { const s = String(loc || '').replace(/,\s*[A-Z]{2}$/, '').trim(); return PLACES[s] || s; };

/** FIS seasons start in the autumn: season 2027 = 2026/27. */
export const fisSeason = (now) => { const p = londonParts(now); return p.m >= 7 ? p.y + 1 : p.y; };

/** iCal text -> one object per VEVENT: { NAME: { value, params } } (long lines unfolded). */
export function parseIcs(text) {
  const lines = String(text || '').replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
  const events = [];
  let cur = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { cur = {}; continue; }
    if (line === 'END:VEVENT') { if (cur) events.push(cur); cur = null; continue; }
    const m = cur && /^([A-Z-]+)((?:;[^:]*)?):(.*)$/.exec(line);
    if (m) cur[m[1]] = { value: m[3], params: m[2] };
  }
  return events;
}

const field = (desc, name) => (new RegExp(`${name}:\\s*([^\\\\]+)`).exec(desc) || [])[1]?.trim() || null;
const minutes = (hhmm) => { const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || ''); return m ? +m[1] * 60 + +m[2] : null; };

/** One FIS race -> one session per run (or one "TBC" entry while it has no time). */
export function mapFisRace(ev) {
  const desc = ev.DESCRIPTION?.value || '';
  const discipline = field(desc, 'Event');
  const start = ev.DTSTART?.value || '';
  if (!discipline || /qualification/i.test(discipline)) return [];
  const gender = field(desc, 'Gender');
  const who = gender === 'Men' ? "Men's" : gender === 'Women' ? "Women's" : gender || '';
  const base = {
    comp: 'SKI', kind: 'session', label: field(desc, 'Category') || 'World Cup', // shown as the event's tag
    title: `${who} ${discipline.replace(/^Super G$/i, 'Super-G')}`.trim(), gender, discipline,
    place: placeName(ev.LOCATION?.value), source: 'fis-ski.com', status: 'upcoming',
  };
  const id = `ski-${String(ev.UID?.value || '').replace(/^AL/, '')}`;
  const day = /^(\d{4})(\d{2})(\d{2})/.exec(start);
  if (!day) return [];
  if (/VALUE=DATE/.test(ev.DTSTART.params) || !/T\d{6}Z$/.test(start)) {
    const date = `${day[1]}-${day[2]}-${day[3]}`;
    return [{ ...base, id, session: base.place, kickoff: new Date(ukMidnight(date) + 12 * 3600000).toISOString(), end: null, timeTbc: true, allDay: true }];
  }
  const first = Date.UTC(+day[1], +day[2] - 1, +day[3], +start.slice(9, 11), +start.slice(11, 13));
  const runs = [...desc.matchAll(/Run (\d) loc:\s*(\d{1,2}:\d{2})/g)].map(m => ({ run: +m[1], min: minutes(m[2]) }));
  if (runs.length < 2) {
    return [{ ...base, id, session: base.place, kickoff: new Date(first).toISOString(), end: new Date(first + RUN_LENGTH.oneRun).toISOString(), timeTbc: false }];
  }
  // Later runs: FIS gives local times only, so they're placed by their gap after the first run
  const starts = runs.map(r => first + ((((r.min - runs[0].min) % 1440) + 1440) % 1440) * 60000);
  return runs.map((r, i) => {
    const end = Math.min(starts[i] + RUN_LENGTH.twoRuns, starts[i + 1] ?? Infinity);
    return { ...base, id: `${id}-${r.run}`, run: r.run, session: `${base.place} · Run ${r.run}`, kickoff: new Date(starts[i]).toISOString(), end: new Date(end).toISOString(), timeTbc: false };
  });
}

/** Every World Cup and World Championships run of the seasons covering [fromDate, toDate] (UK dates). */
export async function fetchSkiing(fromDate, toDate) {
  const seasons = [...new Set([fisSeason(ukMidnight(fromDate)), fisSeason(ukMidnight(toDate))])];
  const out = [], errors = [];
  let tries = 0;
  for (const season of seasons) {
    for (const cat of Object.keys(CATEGORIES)) {
      tries++;
      try {
        const q = new URLSearchParams({ seasoncode: String(season), sectorcode: 'AL', categorycode: cat });
        out.push(...parseIcs(await getText(`${FIS_URL}?${q}`, { Accept: 'text/calendar' })).flatMap(mapFisRace));
      } catch (e) {
        errors.push(`${season} ${cat}: ${e.message}`); // not every season has World Championships
      }
    }
  }
  if (errors.length === tries) throw new Error(errors[0]);
  return { sessions: out.sort((a, b) => a.kickoff.localeCompare(b.kickoff)), errors };
}

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’`]/g, "'")
  .toLowerCase().replace(/-/g, ' ').replace(/\s+/g, ' ');
const genderIn = (title, gender) => (gender === 'Women' ? /\bwomen'?s\b/.test(title)
  : gender === 'Men' ? /(^|[^a-z])men'?s\b/.test(title) : !/\b(wo)?men'?s\b/.test(title));

/** UK TV for a run: TNT Sports' schedule, live, same gender, discipline and run, on air at its start. */
export function skiTv(s, tnt) {
  const start = Date.parse(s.kickoff);
  const progs = (tnt?.programmes || []).filter(p => {
    const title = norm(p.title);
    if (!p.live || p.sport !== 'Alpine Skiing' || /highlights/.test(title)) return false;
    if (!genderIn(title, s.gender) || !title.includes(norm(s.discipline))) return false;
    const run = /\brun\s*(\d)/i.exec(p.subtitle || '');
    if (run && s.run && +run[1] !== s.run) return false;
    return s.allDay ? ukDate(p.start) === ukDate(start) : p.start <= start + LEAD && p.end > start && p.start >= start - 2 * 3600000;
  });
  const chans = tntChannelOrder(progs.map(p => p.channel));
  if (!chans.length) {
    return { broadcaster: null, channels: [], alsoOn: [], confirmed: false, note: 'TV channel to be confirmed', conflict: false, sources: [] };
  }
  return { broadcaster: chans[0], channels: [chans[0]], alsoOn: chans.slice(1), confirmed: true, note: null, conflict: false, sources: ['tntsports.co.uk'] };
}
