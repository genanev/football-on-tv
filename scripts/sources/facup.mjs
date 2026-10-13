// FA Cup: televised ties, from the FA's own fixtures page.
//
// Source
//   thefa.com/competitions/thefacup/fixtures - server-rendered tables, one per match date:
//   a header ("Saturday 17 October 2026" | "Fourth Round Qualifying"), then one row per tie
//   with the UK kick-off time and a "Live on" column ("Live on BBC Sport"). That column is the
//   FA's own record of the TV picks, so it's the official source for which ties are on TV.
//   The exact channel (e.g. BBC One rather than the BBC Sport website/iPlayer) comes from Sky's
//   TV guide when the tie is listed there.
//
// Only televised ties are listed (the cup tab is for ties you can watch).

import { getText, ukToUtc } from '../lib/util.mjs';
import { SPORT_CHANNELS, guideTv } from './skyGuide.mjs';
import { guideProgrammesFor } from './football.mjs';

const FA_URL = 'https://www.thefa.com/competitions/thefacup/fixtures';
const MONTHS = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };

const text = (html) => String(html || '').replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&#0?39;|&rsquo;/g, "'")
  .replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const cell = (row, cls) => text((new RegExp(`<td class="${cls}[^"]*">([\\s\\S]*?)</td>`).exec(row) || [])[1]);

/** All ties on the page: [{ date, time, round, home, away, liveOn }]. */
export function parseFaFixtures(html) {
  const out = [];
  for (const [, table] of html.matchAll(/<table class="gTable">([\s\S]*?)<\/table>/g)) {
    const head = /class="headl">([\s\S]*?)<\/td>[\s\S]*?class="headr">([\s\S]*?)<\/td>/.exec(table);
    const dm = head && /(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/.exec(text(head[1]));
    if (!dm || !MONTHS[dm[2].toLowerCase()]) continue;
    const date = `${dm[3]}-${String(MONTHS[dm[2].toLowerCase()]).padStart(2, '0')}-${dm[1].padStart(2, '0')}`;
    for (const [, row] of table.matchAll(/<tr class="(?:even|odd)">([\s\S]*?)<\/tr>/g)) {
      // The page writes <time datetime=">12:30">12:30</time>, so take the last hh:mm in the cell.
      const time = (cell(row, 'cOne').match(/\d{1,2}:\d{2}/g) || []).pop() || '';
      const home = cell(row, 'cThree'), away = cell(row, 'cFive');
      if (!home || !away) continue;
      out.push({ date, time: /^\d{1,2}:\d{2}$/.test(time) ? time.padStart(5, '0') : null, round: text(head[2]), home, away, liveOn: cell(row, 'cSeven') || null });
    }
  }
  return out;
}

/** "Live on BBC Sport" -> "BBC Sport". */
const channelOf = (liveOn) => String(liveOn || '').replace(/^live on\s*/i, '').trim() || null;

export function mapFaTie(t) {
  if (!t.time || !channelOf(t.liveOn)) return null; // televised ties with a time only
  const [y, mo, d] = t.date.split('-').map(Number);
  const [hh, mm] = t.time.split(':').map(Number);
  const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return {
    id: `facup-${t.date}-${slug(t.home)}-${slug(t.away)}`,
    comp: 'CUPS', label: 'FA Cup', kind: 'match',
    kickoff: new Date(ukToUtc(y, mo, d, hh, mm)).toISOString(),
    home: t.home, away: t.away, homeShort: t.home, awayShort: t.away,
    venue: null, status: 'upcoming', homeScore: null, awayScore: null, round: t.round,
    source: 'thefa.com', faChannel: channelOf(t.liveOn),
  };
}

export async function fetchFaCup() {
  const html = await getText(FA_URL);
  return parseFaFixtures(html).map(mapFaTie).filter(Boolean);
}

export function faCupEvents(ties, guide) {
  const sids = SPORT_CHANNELS.football;
  return ties.map(({ faChannel, ...t }) => {
    const progs = guideProgrammesFor(t, guide?.programmes || [], sids);
    const tv = progs.length ? guideTv(progs, sids)
      : { broadcaster: faChannel, channels: [faChannel], alsoOn: [], confirmed: true, note: null, conflict: false, sources: [] };
    tv.sources = [...new Set(['thefa.com', ...tv.sources])];
    return { ...t, tv };
  });
}
