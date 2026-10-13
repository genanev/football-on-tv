// Amazon Prime Video's own Champions League picks (one Tuesday game a week, 2024/25-2026/27).
//
// Source: Prime Video's Champions League tournament page (primevideo.com/tournament/<id>). It lists
// every Champions League event on Prime Video as server-rendered cards:
//   <article data-card-title="Liverpool vs. Villarreal" data-card-entity-type="EVENT" …>
//     … …/benefit-id/m-r/Prime/logos/…   <- who provides it: "Prime" = Amazon's own pick;
//                                           "discoverytntuk" = TNT Sports resold via Prime Video
//     … "Tue, Oct 20 6:30 PM BST" / "Tomorrow 7:45 PM BST"   <- start of coverage
// Only "Prime" cards count (TNT's games already come from TNT's own schedule). Amazon drops an event
// once it's over; the build keeps a channel already found until the end of the match day.
// amazon.co.uk's own pages turn away scripted requests (HTTP 503); primevideo.com doesn't.

import { getText, londonParts, ukDate } from '../lib/util.mjs';
import { teamSim } from './football.mjs';

export const UCL_TOURNAMENT = 'https://www.primevideo.com/tournament/amzn1.dv.icid.f40b96cd-f09e-48db-a9ec-0b0e298a39c8';
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

/** "Tue, Oct 20 6:30 PM BST" / "Tue 20 Oct …" / "Tomorrow 7 PM BST" / "Today …" -> UK date "2026-10-20". */
export function amazonDay(text, now) {
  if (/\bToday\b/i.test(text)) return ukDate(now);
  if (/\bTomorrow\b/i.test(text)) return ukDate(now + 86400000);
  const m = /\b([A-Z][a-z]{2}) (\d{1,2})\b/.exec(text || '') || /\b(\d{1,2}) ([A-Z][a-z]{2})\b/.exec(text || '');
  if (!m) return null;
  const [mon, d] = /^\d/.test(m[1]) ? [m[2], m[1]] : [m[1], m[2]];
  const mo = MONTHS[mon.toLowerCase()];
  if (!mo) return null;
  const p = londonParts(now);
  const y = mo < p.m - 6 ? p.y + 1 : mo > p.m + 6 ? p.y - 1 : p.y;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

const decode = (s) => String(s).replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"');

/** Event cards: [{ title, home, away, day, provider }] - provider "Prime" = Amazon's own pick. */
export function parsePrimeTournament(html, now) {
  const out = [];
  for (const m of html.matchAll(/<article[^>]*data-card-title="([^"]*)"[^>]*data-card-entity-type="EVENT"[\s\S]*?<\/article>/g)) {
    const title = decode(m[1]);
    const teams = /^(.+?)\s+vs?\.?\s+(.+)$/i.exec(title);
    if (!teams) continue;
    const provider = (/benefit-id\/[a-z]-[a-z]\/([A-Za-z0-9]+)\/logos/.exec(m[0]) || [])[1] || null;
    const text = m[0].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    const when = (/(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),? (?:[A-Z][a-z]{2} \d{1,2}|\d{1,2} [A-Z][a-z]{2}) \d{1,2}(?::\d{2})? [AP]M|(?:Today|Tomorrow) \d{1,2}(?::\d{2})? [AP]M/.exec(text) || [])[0];
    out.push({ title, home: teams[1].trim(), away: teams[2].trim(), day: when ? amazonDay(when, now) : null, provider });
  }
  return out;
}

export async function fetchPrimeUcl(now = Date.now()) {
  const html = await getText(UCL_TOURNAMENT, { Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' });
  const cards = parsePrimeTournament(html, now);
  if (!cards.length) throw new Error('no events found on the Prime Video Champions League page');
  return { cards };
}

/**
 * Amazon's own card for this match: provider "Prime", both teams in the same order (a knockout
 * tie's other leg has them the other way round), and the same UK date when the card shows one.
 */
export function primePickFor(m, prime) {
  const names = (side) => [m[side], m[`${side}Short`], m[`${side}Alt`]].filter(Boolean);
  const sim = (side, n) => Math.max(...names(side).map(x => teamSim(x, n)));
  const day = ukDate(Date.parse(m.kickoff));
  return (prime?.cards || []).find(c => c.provider === 'Prime' && (!c.day || c.day === day) &&
    !/\bU\d{2}\b|Women/i.test(c.title) && sim('home', c.home) >= 0.5 && sim('away', c.away) >= 0.5) || null;
}

export const amazonTv = () => ({
  broadcaster: 'Amazon Prime Video', channels: ['Amazon Prime Video'], alsoOn: [], confirmed: true, note: null, conflict: false, sources: ['primevideo.com'],
});
