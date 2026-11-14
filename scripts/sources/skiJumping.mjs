// Ski jumping's Four Hills Tournament (a Special; George, 14 Nov 2026): the men's and women's
// competitions at Oberstdorf, Garmisch-Partenkirchen, Innsbruck and Bischofshofen, 28 Dec - 6 Jan.
// Televised competitions only, one entry each; qualifying is left out (as for alpine skiing).
//
// Sources
//   Dates  FIS's iCal calendar feed, the one alpine skiing uses (skiing.mjs), with sectorcode=JP
//          (ski jumping) and categorycode=WC. One VEVENT per competition, but **date-only**
//          ("DTSTART;VALUE=DATE:20261229"): FIS publishes no start times for ski jumping, even six
//          days ahead (Lillehammer, 14 Nov 2026). LOCATION is the hill's town; DESCRIPTION has
//          "Gender: Men\Event: Individual Large Hill" (qualification rounds: "…Large Hill
//          Qualification"). Nothing marks a competition as part of the Four Hills: they're picked by
//          town and date. Two rows on 29 Dec with LOCATION "FIS Four Hills Tournament" stand for the
//          overall standings and are skipped. 2026/27: women 28 Dec, 31 Dec, 2 Jan, 5 Jan; men a day
//          later at each hill (29 Dec, 1 Jan, 3 Jan, 6 Jan).
//   TV     TNT Sports' schedule gives the times and channels (no guessing): sport "Ski Jumping",
//          title "Lillehammer | Men's HS 140" (the hill's size, not "Large Hill"), subtitle "World Cup |
//          Day 1" or "World Cup | Qualifying"; "Highlights" in the title aren't live. Seen for the
//          season's opener (20-22 Nov 2026): men on TNT Sports 4 and HBO Max, women on HBO Max only.
//          The Four Hills' own titles hadn't been published when this was written: check them when
//          they appear (from about 21 Dec 2026), e.g. whether Garmisch-Partenkirchen is written in full.

import { getText, ukDate, ukMidnight } from '../lib/util.mjs';
import { parseIcs, fisSeason, placeName } from './skiing.mjs';
import { windowDates } from './skyGuide.mjs';
import { tntChannelOrder } from './tntSchedule.mjs';
import { SPECIALS } from './specials.mjs';

const FIS_URL = 'https://www.fis-ski.com/DB/services/public/icalendar-feed-fis-events.html';
const COMP = 'SPECIAL_FOURHILLS';
const HILLS = ['Oberstdorf', 'Garmisch-Partenkirchen', 'Innsbruck', 'Bischofshofen'];

const field = (desc, name) => (new RegExp(`${name}:\\s*([^\\\\]+)`).exec(desc) || [])[1]?.trim() || null;

/** FIS's calendar (parsed VEVENTs) -> the Four Hills' competitions of season `season` (2027 = 2026/27). */
export function fourHillsOf(icsEvents, season) {
  const from = `${season - 1}-12-26`, to = `${season}-01-08`;
  const out = [];
  for (const ev of icsEvents) {
    const d = /^(\d{4})(\d{2})(\d{2})/.exec(ev.DTSTART?.value || '');
    const place = placeName(ev.LOCATION?.value);
    const desc = ev.DESCRIPTION?.value || '';
    const discipline = field(desc, 'Event');
    const gender = field(desc, 'Gender');
    if (!d || !HILLS.includes(place) || !discipline || /qualification|team/i.test(discipline) || !/^(Men|Women)$/.test(gender || '')) continue;
    const date = `${d[1]}-${d[2]}-${d[3]}`;
    if (date < from || date > to) continue;
    out.push({ date, place, gender, discipline: discipline.replace(/^Individual\s+/i, '') });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.gender.localeCompare(b.gender));
}

/** The Four Hills of the season(s) covering [fromDate, toDate]: its competitions and its dates. */
export async function fetchFourHills(fromDate, toDate) {
  // the tournament spans New Year inside one FIS season; before July the next one isn't out yet
  const seasons = [...new Set([fisSeason(ukMidnight(fromDate)), fisSeason(ukMidnight(toDate))])];
  const name = SPECIALS.find(s => s.comp === COMP).name;
  const events = [], competitions = [];
  for (const season of seasons) {
    const q = new URLSearchParams({ seasoncode: String(season), sectorcode: 'JP', categorycode: 'WC' });
    const found = fourHillsOf(parseIcs(await getText(`${FIS_URL}?${q}`, { Accept: 'text/calendar' })), season);
    // The calendar answered but has no Four Hills: a failure, never a silent gap - except before
    // December, when next season's calendar may simply not be out yet
    if (!found.length && toDate < `${season - 1}-12-01`) continue;
    if (!found.length) throw new Error(`no Four Hills competitions in FIS's ${season - 1}/${String(season).slice(2)} ski jumping calendar`);
    competitions.push(...found);
    events.push({ comp: COMP, name, startDate: found[0].date, endDate: found[found.length - 1].date, source: 'fis-ski.com' });
  }
  return { events, competitions };
}

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’`]/g, "'").toLowerCase();
const genderIn = (title, gender) => (gender === 'Women' ? /\bwomen'?s?\b/.test(title) : /(^|[^a-z])men'?s?\b/.test(title));

/** One entry per competition TNT shows live, with TNT's times: [fromDate, fromDate + days). */
export function fourHillsEvents(competitions, tnt, fromDate, days) {
  const dates = new Set(windowDates(fromDate, days));
  const out = [];
  for (const c of competitions) {
    if (!dates.has(c.date)) continue;
    const town = norm(c.place).split('-')[0]; // "garmisch" also finds "Garmisch-Partenkirchen"
    const progs = (tnt?.programmes || []).filter(p => {
      const title = norm(p.title);
      return p.live && p.sport === 'Ski Jumping' && !/highlights/.test(title) && !/qualif/i.test(`${p.title} ${p.subtitle}`)
        && ukDate(p.start) === c.date && title.includes(town) && genderIn(title, c.gender);
    });
    if (!progs.length) continue;
    // TNT's own channels and its HBO Max stream start within minutes of each other: one entry
    const start = Math.min(...progs.map(p => p.start)), end = Math.max(...progs.map(p => p.end));
    const chans = tntChannelOrder(progs.map(p => p.channel));
    out.push({
      id: `fourhills-${c.date}-${c.gender.toLowerCase()}`, comp: COMP, kind: 'session', label: null,
      title: `${c.gender}'s ${c.discipline}`, session: c.place, source: 'fis-ski.com', status: 'upcoming',
      kickoff: new Date(start).toISOString(), end: new Date(end).toISOString(), timeTbc: false,
      tv: { broadcaster: chans[0], channels: [chans[0]], alsoOn: chans.slice(1), confirmed: true, note: null, conflict: false, sources: ['tntsports.co.uk'] },
    });
  }
  return out.sort((a, b) => a.kickoff.localeCompare(b.kickoff));
}
