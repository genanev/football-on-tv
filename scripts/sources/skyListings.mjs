// Sky Sports' own "what's on" pages (skysports.com/watch/<sport>-on-sky): every event Sky is
// showing, including Sky Sports+ streams that aren't in the TV guide, with each channel's start
// time. Server-rendered HTML:
//   <h3 class="text-h4 …">Wed 14th October</h3>          a day
//   <h3 class="box text-h5 …">Football</h3>              a sport
//   <div class="event-group …"> <strong>Norwich City</strong> … <li class="col col2 …">19:45</li>
//     … <strong>Southampton</strong> … <p class="event-detail …">Championship, Sky Sports+ (19:45)</p>
// Single-title events (an F1 session, a golf round) have one <strong>.
// Each page lists a fixed number of upcoming events, so later days appear as they get closer.

import { getText, londonParts } from '../lib/util.mjs';

const BASE = 'https://www.skysports.com/watch/';
export const SKY_PAGES = ['football-on-sky', 'f1-on-sky'];
const MONTHS = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };

const text = (s) => String(s || '').replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&#0?64;?/g, '@')
  .replace(/&#0?39;|&rsquo;/g, "'").replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

/** "Wed 14th October" -> "2026-10-14"; the year is the one that puts the date nearest to `now`. */
export function parseSkyDay(label, now) {
  const m = /(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)/.exec(label || '');
  const mo = m && MONTHS[m[2].toLowerCase()];
  if (!mo) return null;
  const p = londonParts(now);
  let y = p.y;
  if (mo < p.m - 6) y++;
  else if (mo > p.m + 6) y--;
  return `${y}-${String(mo).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

/** "Championship, Sky Sports+ (19:45), Sky Sports Main Event (19:30)" -> competition + channels. */
export function parseCaption(caption) {
  const channels = [];
  let competition = null;
  const re = /([^,()]+?)\s*\((\d{1,2}:\d{2})\)/g;
  let m, first = true;
  while ((m = re.exec(caption))) {
    let name = m[1].trim();
    if (first) {
      // anything before the first channel is the competition ("Championship, Sky Sports+")
      const before = caption.slice(0, m.index).replace(/,\s*$/, '').trim();
      if (before) competition = before;
      first = false;
    }
    name = name.replace(/\s+HD$/i, '');
    channels.push({ name, time: m[2].padStart(5, '0') });
  }
  if (!channels.length) competition = caption.trim() || null;
  return { competition, channels };
}

export function parseSkyPage(html, now) {
  const out = [];
  const re = /<h3 class="text-h4[^"]*">([\s\S]*?)<\/h3>|<h3 class="box text-h5[^"]*">([\s\S]*?)<\/h3>|<div class="event-group[^"]*">([\s\S]*?)<p class="event-detail[^"]*">([\s\S]*?)<\/p>/g;
  let m, date = null, sport = null;
  while ((m = re.exec(html))) {
    if (m[1] !== undefined) { date = parseSkyDay(text(m[1]), now); continue; }
    if (m[2] !== undefined) { sport = text(m[2]); continue; }
    if (!date) continue;
    const names = [...m[3].matchAll(/<strong[^>]*>([\s\S]*?)<\/strong>/g)].map(x => text(x[1]));
    const time = (/class="col col2[^"]*">([\s\S]*?)<\/li>/.exec(m[3]) || [])[1];
    const { competition, channels } = parseCaption(text(m[4]));
    if (!channels.length) continue;
    const entry = { date, sport, competition, channels, time: /^\d{1,2}:\d{2}$/.test(text(time)) ? text(time).padStart(5, '0') : null };
    if (names.length >= 2) Object.assign(entry, { home: names[0], away: names[1] });
    else entry.title = names[0] || null;
    out.push(entry);
  }
  return out;
}

export async function fetchSkyListings(now = Date.now(), pages = SKY_PAGES) {
  const res = await Promise.allSettled(pages.map(p => getText(`${BASE}${p}`)));
  const errors = res.filter(r => r.status === 'rejected').map(r => r.reason.message);
  if (errors.length === res.length) throw new Error(errors[0]);
  const entries = res.flatMap((r, i) => (r.status === 'fulfilled' ? parseSkyPage(r.value, now).map(e => ({ ...e, page: pages[i] })) : []));
  return { entries, errors };
}

/** A `tv` object from a Sky listing entry: first channel is the main one. */
export function listingTv(entry) {
  const names = [...new Set(entry.channels.map(c => c.name))];
  return { broadcaster: names[0], channels: [names[0]], alsoOn: names.slice(1), confirmed: true, note: null, conflict: false, sources: ['skysports.com'] };
}
