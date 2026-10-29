// Curling (a Special): the European Curling Championships (George, 29 Oct 2026), one entry per
// televised game, with times and channels from the UK TV listings.
//
// Sources
//   Dates  World Curling's own site (worldcurling.org, WordPress): /wp-json/wp/v2/event?slug=europeans
//          gives the current edition; its page header ("hero") reads "Ostrava, Czechia" and
//          "27 October – 1 November 2026". The slug stays the same each year.
//   TV     TNT Sports' schedule (sport "Curling", subtitle "Men | Round Robin | European Championships",
//          title "Germany - Scotland", or just "Curling" for the semi-finals and finals)
//          and Sky's TV guide on TNT Sports 1-4 ("Live: Curling European Champs", the game in the
//          synopsis: "...the men's round robin contest between Germany and Scotland at..."). TNT's
//          schedule also has games streamed only on HBO Max.
//
// A game is listed only when it's live on UK TV (TNT shows a few games a day, not every draw).
// Simulcasts (the same start within 15 minutes, same men's/women's draw) are one entry.

import { getJSON, ukDate } from '../lib/util.mjs';
import { SPORT_CHANNELS, windowDates } from './skyGuide.mjs';
import { tntChannelOrder } from './tntSchedule.mjs';

const WCF_URL = 'https://worldcurling.org/wp-json/wp/v2/event';

/** The championships World Curling runs that the app lists, by their event page's slug. */
export const CURLING_EVENTS = [
  { comp: 'SPECIAL_CURLING', slug: 'europeans', name: 'European Curling Championships', tv: /european champ|curling ec\b/i },
];

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** "27 October – 1 November 2026" or "1–7 March 2027" -> { startDate, endDate }. */
export function parseDateRange(text) {
  const s = String(text || '').replace(/&ndash;|&#8211;/g, '–').replace(/&nbsp;/g, ' ');
  const m = /(\d{1,2})(?:\s+([A-Za-z]+))?\s*[–-]\s*(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/.exec(s);
  if (!m) return null;
  const endMonth = MONTHS.indexOf(m[4].toLowerCase()) + 1;
  const startMonth = m[2] ? MONTHS.indexOf(m[2].toLowerCase()) + 1 : endMonth;
  if (!startMonth || !endMonth) return null;
  const year = +m[5];
  return { startDate: iso(startMonth > endMonth ? year - 1 : year, startMonth, +m[1]), endDate: iso(year, endMonth, +m[3]) };
}

/** World Curling's event (from its WordPress feed) -> { comp, name, place, startDate, endDate }. */
export function mapWcfEvent(def, e) {
  const text = String(e?.content?.rendered || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const dates = parseDateRange(text);
  if (!dates) return null;
  const place = /Icon for location\s+([^]+?)\s+Calendar Icon/.exec(text)?.[1]?.trim() || null;
  return { comp: def.comp, name: def.name, place, ...dates, source: 'worldcurling.org' };
}

export async function fetchCurling() {
  const out = [], errors = [];
  for (const def of CURLING_EVENTS) {
    try {
      const [e] = await getJSON(`${WCF_URL}?slug=${def.slug}`);
      const ev = mapWcfEvent(def, e);
      if (!ev) throw new Error(`no dates on World Curling's ${def.slug} page`);
      out.push(ev);
    } catch (err) {
      errors.push(`${def.slug}: ${err.message}`);
    }
  }
  if (errors.length === CURLING_EVENTS.length) throw new Error(errors[0]);
  return { events: out, errors };
}

const GENDER = { men: "Men's", women: "Women's" };
const STAGE = (s) => (/semi/i.test(s) ? 'Semi-Final' : /bronze/i.test(s) ? 'Bronze Medal Game' : /final/i.test(s) ? 'Final' : /tie[- ]?breaker/i.test(s) ? 'Tie-Breaker' : /round robin/i.test(s) ? 'Round Robin' : null);
const tidy = (team) => team.trim().replace(/^Czech Republic$/i, 'Czechia');

/** What a TV programme says about the game: men's/women's, the stage and (round robin) the teams. */
export function gameOf(p) {
  if (p.fromTnt) { // "Germany - Scotland" (or just "Curling") + "Men | Round Robin | European Championships"
    const [, g, stage] = /^(Men|Women)\s*\|\s*([^|]+)/i.exec(p.subtitle) || [];
    const teams = /^(.+?)\s+-\s+(.+?)$/.exec(p.title);
    return { gender: g?.toLowerCase() || null, stage: STAGE(stage || ''), teams: teams ? [tidy(teams[1]), tidy(teams[2])] : null };
  }
  // "Action from the men's round robin contest between Germany and Scotland at the Curling European..."
  const sy = p.synopsis || '';
  const g = /\b(men|women)'s\b/i.exec(sy)?.[1]?.toLowerCase() || null;
  const teams = /\bbetween\s+(.+?)\s+and\s+(.+?)\s+at\b/i.exec(sy);
  return { gender: g, stage: STAGE(sy), teams: teams ? [tidy(teams[1]), tidy(teams[2])] : null };
}

/** One entry per televised game on the event's days, from the TV guide and TNT's schedule. */
export function curlingEvents(events, guide, tnt, fromDate, days) {
  const sids = SPORT_CHANNELS.curling;
  const out = [];
  for (const ev of events) {
    const def = CURLING_EVENTS.find(d => d.comp === ev.comp);
    const dates = new Set(windowDates(fromDate, days).filter(d => d >= ev.startDate && d <= ev.endDate));
    if (!dates.size) continue;
    const progs = [
      ...(guide?.programmes || []).filter(p => p.live && sids.includes(p.sid) && /curling/i.test(p.title) && def.tv.test(`${p.title} ${p.synopsis}`))
        .map(p => ({ ...p, src: 'sky-guide' })),
      ...(tnt?.programmes || []).filter(p => p.live && p.sport === 'Curling' && def.tv.test(`${p.title} ${p.subtitle}`))
        .map(p => ({ ...p, fromTnt: true, src: 'tntsports.co.uk' })),
    ].filter(p => dates.has(ukDate(p.start))).map(p => ({ ...p, game: gameOf(p) })).sort((a, b) => a.start - b.start);
    // Simulcasts: the same start (within 15 minutes) and the same draw (men's or women's)
    const games = [];
    for (const p of progs) {
      const g = games.find(x => Math.abs(x.start - p.start) <= 15 * 60000 && (!x.game.gender || !p.game.gender || x.game.gender === p.game.gender));
      if (g) {
        g.progs.push(p);
        g.end = Math.max(g.end, p.end);
        for (const k of ['gender', 'stage', 'teams']) if (!g.game[k] || (k === 'teams' && p.fromTnt && p.game.teams)) g.game[k] = p.game[k] || g.game[k];
      } else games.push({ start: p.start, end: p.end, progs: [p], game: { ...p.game } });
    }
    for (const g of games) {
      const who = GENDER[g.game.gender] || '';
      const stage = [who, g.game.stage].filter(Boolean).join(' ') || null;
      const guideChans = [...new Set(g.progs.filter(p => !p.fromTnt).sort((a, b) => sids.indexOf(a.sid) - sids.indexOf(b.sid)).map(p => p.channel))];
      const chans = tntChannelOrder([...guideChans, ...g.progs.filter(p => p.fromTnt).map(p => p.channel)]);
      out.push({
        id: `curling-${ev.comp}-${g.start}`, comp: ev.comp, kind: 'session', label: null,
        title: g.game.teams ? `${g.game.teams[0]} v ${g.game.teams[1]}` : stage || ev.name,
        session: g.game.teams ? stage : null, venue: ev.place, source: ev.source, status: 'upcoming',
        kickoff: new Date(g.start).toISOString(), end: new Date(g.end).toISOString(), timeTbc: false,
        tv: { broadcaster: chans[0], channels: [chans[0]], alsoOn: chans.slice(1), confirmed: true, note: null, conflict: false, sources: [...new Set(g.progs.map(p => p.src))] },
      });
    }
  }
  return out;
}
