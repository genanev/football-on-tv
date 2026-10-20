// Premier Sports: the streaming-only broadcaster (Premier Sports 1/2, Premier Sports Rugby,
// Premier Events 1-3, LALIGA TV) - not on Sky's platform, so its games are not in Sky's TV guide.
// Used for the Scottish Premiership first (George, 20 Oct 2026); it also shows rugby (URC, Top 14,
// rugby league), NHL, LALIGA and the Scottish League Cup ("Premier Sports Cup").
//
// Source
//   premiersports.com/gb/upcoming-fixtures - server-rendered, about three weeks ahead. A yellow day
//   header ("Live Tuesday, October 20th", no year), then one table per competition: a row with the
//   competition ("SPFL"), then one row per event: home team, the UK time coverage starts ("1:30pm",
//   usually half an hour before kick-off), away team, and the channel's logo
//   (".../channel_logos/uk/premier-sports-1.png", the only place the channel is named).

import { getText, ukToUtc, londonParts } from '../lib/util.mjs';

const PS_URL = 'https://www.premiersports.com/gb/upcoming-fixtures';
const MONTHS = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };
const CHANNEL = {
  'premier-sports-1': 'Premier Sports 1', 'premier-sports-2': 'Premier Sports 2', 'premier-sports-rugby': 'Premier Sports Rugby',
  'premier-events-1': 'Premier Events 1', 'premier-events-2': 'Premier Events 2', 'premier-events-3': 'Premier Events 3', 'laliga-tv': 'LALIGA TV',
};
/** Unknown logos: "premier-events-4" -> "Premier Events 4". */
const channelName = (slug) => CHANNEL[slug] || slug.split('-').map(w => (/^tv$/.test(w) ? 'TV' : w[0].toUpperCase() + w.slice(1))).join(' ');

const text = (html) => String(html || '').replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&#0?39;/g, "'")
  .replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

/** "Sunday, October 25" + "1:30pm" -> UTC timestamp; the year is the one that puts it nearest to `now`. */
export function parsePsTime(day, time, now) {
  const d = /([A-Za-z]+)\s+(\d{1,2})$/.exec(String(day || '').trim());
  const t = /^(\d{1,2}):(\d{2})\s*([ap]m)$/i.exec(String(time || '').trim());
  const month = d && MONTHS[d[1].toLowerCase()];
  if (!month || !t) return null;
  let hh = +t[1] % 12;
  if (t[3].toLowerCase() === 'pm') hh += 12;
  const y = londonParts(now).y;
  const candidates = [y - 1, y, y + 1].map(year => ukToUtc(year, month, +d[2], hh, +t[2]));
  return candidates.sort((a, b) => Math.abs(a - now) - Math.abs(b - now))[0];
}

/** Every event on the page: [{ start, competition, home, away, channel }]. */
export function parsePremierSports(html, now = Date.now()) {
  const out = [];
  let day = null, competition = null;
  const token = /<span class='font-semibold'>[^<]*<\/span>\s*([A-Za-z]+,\s*[A-Za-z]+\s+\d{1,2})(?:st|nd|rd|th)?|<td colspan="3" class="text-center"><div class="text-center ">([^<]*)<\/div><\/td>|<tr class="bg-white">([\s\S]*?)<\/tr>/g;
  for (const m of String(html).replace(/<script[\s\S]*?<\/script>/g, '').matchAll(token)) {
    if (m[1]) { day = m[1].split(',').pop().trim(); continue; }
    if (m[2] != null) { competition = text(m[2]); continue; }
    const row = m[3];
    const home = text((/<td class="text-right w-2\/5"[^>]*>([\s\S]*?)<\/td>/.exec(row) || [])[1]);
    const away = text((/<td class="text-left w-2\/5"[^>]*>([\s\S]*?)<\/td>/.exec(row) || [])[1]);
    const time = text((/yellow-text[^>]*>([^<]*)</.exec(row) || [])[1]);
    const logo = (/channel_logos\/uk\/([a-z0-9-]+?)(?:-mobile)?\.png/.exec(row) || [])[1];
    const start = parsePsTime(day, time, now);
    if (!home || start == null || !logo) continue;
    out.push({ start, competition, home, away: away || null, channel: channelName(logo) });
  }
  return out;
}

export async function fetchPremierSports(now = Date.now()) {
  const events = parsePremierSports(await getText(PS_URL), now);
  if (!events.length) throw new Error('No events found on premiersports.com (page layout changed?)');
  return { events };
}
