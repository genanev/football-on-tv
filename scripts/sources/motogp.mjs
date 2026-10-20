// MotoGP: qualifying, sprint and race times for the MotoGP class (not Moto2/Moto3; George,
// 20 Oct 2026), from MotoGP's official data feed, with UK channels from the TV listings.
//
// Source
//   api.motogp.pulselive.com/motogp/v1/events?seasonYear=<YYYY> - the feed behind motogp.com
//   (Pulselive, the same platform as the Premier League's). Every event of the season, with its
//   full timetable in `broadcasts`: one entry per session per class (category MGP/MT2/MT3), with
//   `kind` (PRACTICE, QUALIFYING, RACE, WARM_UP, PRESS) and local times written "+1100" (no colon).
//   Events are `kind` GP, TEST or MEDIA; only GP weekends are used. Race entries have no end time.
//
// UK TV (no guessing): a live MotoGP programme in Sky's TV guide on a TNT Sports channel, or in TNT
// Sports' own schedule (which adds HBO Max streams), on air around the start of the session. TNT's
// coverage can start a little after the feed's time (the 25 Oct 2026 race: 14:00 local, TNT Sports 2
// from 14:15, after the Moto2 race), so a programme starting up to 30 minutes later counts.

import { getJSON } from '../lib/util.mjs';
import { SPORT_CHANNELS, channelList, liveAt } from './skyGuide.mjs';
import { tntChannelOrder } from './tntSchedule.mjs';

const MOTOGP_URL = 'https://api.motogp.pulselive.com/motogp/v1/events';
const LEAD = 30 * 60000;
const LENGTH = { Sprint: 45 * 60000, Race: 60 * 60000 }; // races have no end time in the feed

/** "2026-10-25T14:00:00+1100" -> timestamp (the feed writes offsets without a colon). */
export function parseMotoGpTime(s) {
  const t = Date.parse(String(s || '').replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
  return Number.isNaN(t) ? null : t;
}

/** "RED BULL GRAND PRIX OF AUSTRALIA" -> "Grand Prix of Australia" (sponsor dropped). */
export function motoGpTitle(name) {
  const s = String(name || '').trim();
  const gp = s.toUpperCase().indexOf('GRAND PRIX');
  return (gp >= 0 ? s.slice(gp) : s).toLowerCase()
    .replace(/(^|\s)(\S)/g, (m, sp, c) => sp + c.toUpperCase())
    .replace(/\b(Of|The|And)\b/g, (w, x, i) => (i ? w.toLowerCase() : w));
}

const STATUS = (b) => (b.is_live ? 'live' : b.status === 'FINISHED' ? 'finished' : 'upcoming');

/** One GP weekend -> its MotoGP-class sessions: Qualifying (Q1 + Q2 together), Sprint, Race. */
export function mapMotoGpEvent(ev) {
  if (ev?.kind !== 'GP') return [];
  const mgp = (ev.broadcasts || []).filter(b => b.type === 'SESSION' && b.category?.acronym === 'MGP');
  const base = { comp: 'MOTOGP', kind: 'session', title: motoGpTitle(ev.name), venue: ev.circuit?.name || null, source: 'motogp.com', timeTbc: false };
  const out = [];
  const quali = mgp.filter(b => b.kind === 'QUALIFYING');
  if (quali.length) {
    const start = Math.min(...quali.map(b => parseMotoGpTime(b.date_start)));
    const end = Math.max(...quali.map(b => parseMotoGpTime(b.date_end) ?? parseMotoGpTime(b.date_start)));
    const status = quali.some(b => b.is_live) ? 'live' : quali.every(b => b.status === 'FINISHED') ? 'finished' : 'upcoming';
    out.push({ ...base, id: `motogp-${quali[0].id}`, kickoff: new Date(start).toISOString(), end: new Date(end).toISOString(), session: 'Qualifying', status });
  }
  for (const b of mgp.filter(x => x.kind === 'RACE')) {
    const session = b.shortname === 'SPR' ? 'Sprint' : 'Race';
    const start = parseMotoGpTime(b.date_start);
    if (start == null) continue;
    const end = Math.max(parseMotoGpTime(b.date_end) ?? start, start + LENGTH[session]);
    out.push({ ...base, id: `motogp-${b.id}`, kickoff: new Date(start).toISOString(), end: new Date(end).toISOString(), session, status: STATUS(b) });
  }
  return out.sort((a, b) => a.kickoff.localeCompare(b.kickoff));
}

/** MotoGP-class sessions of every GP weekend in the seasons covering [fromDate, toDate] (UK dates). */
export async function fetchMotoGp(fromDate, toDate) {
  const years = [...new Set([fromDate.slice(0, 4), toDate.slice(0, 4)])];
  const out = [];
  for (const y of years) {
    const events = await getJSON(`${MOTOGP_URL}?seasonYear=${y}`, { Origin: 'https://www.motogp.com' });
    out.push(...(Array.isArray(events) ? events : []).flatMap(mapMotoGpEvent));
  }
  return out;
}

/** A programme about the MotoGP class (not "Moto2/3", not a "Rewind" or highlights). */
export const isMotoGpProgramme = (title, more = '') =>
  /motogp/i.test(title) && !/moto2|moto3|rewind|highlights|inside line/i.test(`${title} ${more}`);

/** UK TV for a MotoGP session: Sky's TV guide (TNT channels) and TNT's own schedule (HBO Max). */
export function motoGpTv(ev, guide, tnt) {
  const sids = SPORT_CHANNELS.motogp;
  const start = Date.parse(ev.kickoff);
  const progs = liveAt(guide?.programmes || [], start, sids, LEAD).filter(p => isMotoGpProgramme(p.title));
  // TNT's titles: "MotoGP" (its channels) or "MotoGP | Australia" (HBO Max); not "MotoGP Rewind"
  const fromTnt = (tnt?.programmes || []).filter(p => p.live && /^motogp\s*(\||$)/i.test(String(p.title).trim())
    && isMotoGpProgramme(p.title, p.subtitle) && p.start <= start + LEAD && p.end > start);
  const chans = tntChannelOrder([...channelList(progs, sids), ...fromTnt.map(p => p.channel)]);
  if (!chans.length) {
    return { broadcaster: null, channels: [], alsoOn: [], confirmed: false, note: 'TV channel to be confirmed', conflict: false, sources: [] };
  }
  const sources = [...(progs.length ? ['sky-guide'] : []), ...(fromTnt.length ? ['tntsports.co.uk'] : [])];
  return { broadcaster: chans[0], channels: [chans[0]], alsoOn: chans.slice(1), confirmed: true, note: null, conflict: false, sources };
}
