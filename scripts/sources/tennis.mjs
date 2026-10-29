// Tennis: the four Grand Slams, the ATP Finals and the WTA Finals (George, 29 Oct 2026), one entry
// per tournament per day it's live on UK TV, with times and channels from the TV listings.
//
// Sources
//   Dates   WTA's data feed behind wtatennis.com (api.wtatennis.com/tennis/tournaments/?from=&to=,
//           no key): every WTA event, including the Grand Slams (tournamentGroup.id 901 Australian
//           Open, 903 Roland-Garros, 904 Wimbledon, 905 US Open; the men's singles runs on the same
//           dates) and the WTA Finals (808; 8-15 Nov 2026 at Indian Wells, Charlotte in 2027). The
//           ATP's site and feeds refuse scripts (Cloudflare), so the ATP Finals' dates come from the
//           tournament's own site, nittoatpfinals.com ("Inalpi Arena, Torino. 15-22 November 2026").
//   TV      Sky's TV guide - Sky Sports Tennis, Main Event and Sky Sports+ (ATP/WTA Finals, US Open),
//           the BBC (Wimbledon), TNT (Australian Open, Roland-Garros) - and TNT's schedule (HBO Max
//           streams): each live programme naming the tournament ("Live ATP Paris", "Live: WTA Tokyo &
//           Guangzhou" were the titles in Oct 2026). Generic titles ("Live: ATP/WTA Tennis") aren't
//           matched: no guessing.
//
// A tournament day is listed only when it's live on UK TV, from the first to the last programme
// naming it ("Day 3"). If the guide is unavailable for a tournament day: "TV times to be confirmed".

import { getJSON, getText, ukDate, ukMidnight } from '../lib/util.mjs';
import { SPORT_CHANNELS, channelList, windowDates } from './skyGuide.mjs';
import { tntChannelOrder } from './tntSchedule.mjs';

const WTA_URL = 'https://api.wtatennis.com/tennis/tournaments/';
const ATP_FINALS_URL = 'https://www.nittoatpfinals.com/en/';

/** The tournaments the app lists: their competition id, WTA tournament group and TV-title pattern. */
export const TOURNAMENTS = [
  { comp: 'TEN_AO', wta: 901, name: 'Australian Open', tv: /australian open/i },
  { comp: 'TEN_RG', wta: 903, name: 'Roland-Garros', tv: /roland[\s-]*garros|french open/i },
  { comp: 'TEN_WIM', wta: 904, name: 'Wimbledon', tv: /wimbledon/i },
  { comp: 'TEN_USO', wta: 905, name: 'US Open', tv: /\bus open\b/i },
  { comp: 'TEN_ATPF', wta: null, name: 'ATP Finals', tv: /\batp (tour )?finals\b|nitto/i },
  { comp: 'TEN_WTAF', wta: 808, name: 'WTA Finals', tv: /\bwta finals\b/i },
];

/** WTA feed -> our tournaments, with their dates and place. */
export function mapWtaTournaments(j) {
  return (j?.content || []).flatMap(t => {
    const def = TOURNAMENTS.find(d => d.wta && d.wta === t.tournamentGroup?.id);
    if (!def || !t.startDate || !t.endDate) return [];
    // "INDIAN WELLS" -> "Indian Wells" (the title doesn't always name the place)
    const place = String(t.city || '').toLowerCase().replace(/(^|[\s-])\p{L}/gu, (c) => c.toUpperCase()) || null;
    return [{ comp: def.comp, name: def.name, id: `${t.tournamentGroup.id}-${t.year}`, startDate: t.startDate, endDate: t.endDate, place, source: 'wtatennis.com' }];
  });
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

/** The ATP Finals' home page ("Inalpi Arena, Torino. 15-22 November 2026") -> the tournament. */
export function parseAtpFinals(html) {
  const text = String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const m = /(?:([^.]{2,40})\.\s*)?(\d{1,2})\s*[-–]\s*(\d{1,2})\s+([A-Za-z]+)\s+(20\d\d)/.exec(text);
  const month = m ? MONTHS.indexOf(m[4].toLowerCase()) + 1 : 0;
  if (!month) return null;
  const d = (n) => `${m[5]}-${String(month).padStart(2, '0')}-${String(n).padStart(2, '0')}`;
  return { comp: 'TEN_ATPF', name: 'ATP Finals', id: `atpf-${m[5]}`, startDate: d(+m[2]), endDate: d(+m[3]), place: m[1]?.trim() || null, source: 'nittoatpfinals.com' };
}

/** Our tournaments overlapping [fromDate, toDate]; the two sources fail independently. */
export async function fetchTennis(fromDate, toDate) {
  const q = new URLSearchParams({ page: '0', pageSize: '100', excludeLevels: 'ITF', from: fromDate, to: toDate });
  const res = await Promise.allSettled([
    getJSON(`${WTA_URL}?${q}`).then(mapWtaTournaments),
    getText(ATP_FINALS_URL).then(h => { const t = parseAtpFinals(h); if (!t) throw new Error('no dates on nittoatpfinals.com'); return [t]; }),
  ]);
  const errors = res.filter(r => r.status === 'rejected').map(r => r.reason.message);
  if (errors.length === res.length) throw new Error(errors[0]);
  const tournaments = res.filter(r => r.status === 'fulfilled').flatMap(r => r.value)
    .filter(t => t.endDate >= fromDate && t.startDate <= toDate);
  return { tournaments, errors };
}

const isTennisProgramme = (text) => !/\bgolf\b|darts|snooker/i.test(text); // "US Open" is also golf

/** One entry per tournament per day it's live on UK TV ("Day 3"). */
export function tennisEvents(tournaments, guide, tnt, fromDate, days) {
  const sids = SPORT_CHANNELS.tennis;
  const covered = new Set(guide?.coveredDates || []);
  const events = [];
  for (const date of windowDates(fromDate, days)) {
    for (const t of tournaments.filter(t => t.startDate <= date && t.endDate >= date)) {
      const def = TOURNAMENTS.find(d => d.comp === t.comp);
      const fromGuide = (guide?.programmes || []).filter(p => p.live && sids.includes(p.sid) && ukDate(p.start) === date
        && def.tv.test(p.title) && isTennisProgramme(`${p.title} ${p.synopsis}`));
      const fromTnt = (tnt?.programmes || []).filter(p => p.live && /tennis/i.test(p.sport || '') && ukDate(p.start) === date
        && def.tv.test(`${p.title} ${p.subtitle}`));
      const day = Math.round((Date.parse(`${date}T12:00:00Z`) - Date.parse(`${t.startDate}T12:00:00Z`)) / 86400000) + 1;
      const base = { comp: t.comp, kind: 'session', title: t.name, session: `Day ${day}`, venue: t.place, source: t.source, status: 'upcoming', label: null };
      const progs = [...fromGuide, ...fromTnt];
      if (progs.length) {
        const start = Math.min(...progs.map(p => p.start)), end = Math.max(...progs.map(p => p.end));
        const chans = [...channelList(fromGuide, sids)];
        for (const c of tntChannelOrder(fromTnt.map(p => p.channel))) if (!chans.includes(c)) chans.push(c);
        const sources = [...(fromGuide.length ? ['sky-guide'] : []), ...(fromTnt.length ? ['tntsports.co.uk'] : [])];
        events.push({ ...base, id: `tennis-${t.id}-${date}`, kickoff: new Date(start).toISOString(), end: new Date(end).toISOString(), timeTbc: false,
          tv: { broadcaster: chans[0], channels: [chans[0]], alsoOn: chans.slice(1), confirmed: true, note: null, conflict: false, sources } });
      } else if (!covered.has(date)) {
        events.push({ ...base, id: `tennis-${t.id}-${date}`, kickoff: new Date(ukMidnight(date) + 12 * 3600000).toISOString(), end: null, timeTbc: true, allDay: true,
          tv: { broadcaster: null, channels: [], alsoOn: [], confirmed: false, note: 'TV times to be confirmed', conflict: false, sources: [] } });
      }
    }
  }
  return events;
}
