// Daily check of API-Football against the official ("golden") fixture feeds (George, 29 Oct 2026).
//
// Why: API-Football can be slow to pick up a moved game. On 28 Oct 2026 it still had Rennes v
// Olympiacos (Europa League) on Thursday 5 Nov at 17:45, a day after UEFA had moved it to
// Wednesday 4 Nov at 15:30 because of a French general strike. When they disagree, the official
// feed wins.
//
// To keep our footprint on those websites small, each is read once a day, not on every update:
// the first update after 06:00 UK (straight away if there is no earlier check, and again on the
// next update if the feed failed). What a check found is saved in data.json (`golden`) and applied
// by every update until the next check:
//   premierLeague      premierleague.com: PL kick-offs, plus the league's match ids, which its
//                      UK broadcaster feed needs (footballTv.mjs)
//   championsLeague,   uefa.com
//   europaLeague,
//   conferenceLeague
//   efl                efl.com: Championship, League Cup
// The FA's page is read on every update anyway (for its "Live on" TV picks), so FA Cup ties are
// checked against it each time (kick-offs only: the page lists every tie as upcoming).
//
// What the official feed wins on: the kick-off, and upcoming/postponed. Live and finished games
// stay API-Football's (it is read every 30 minutes, the official feeds once a day). A game the
// official feed has and API-Football doesn't is added from the official feed.
// A correction is applied only while API-Football still says what it said at the check: if it has
// changed the game since, it has newer news than our check, and the next check looks again.

import { ukDate, ukHHMM, ukWeekday, londonParts } from '../lib/util.mjs';
import { teamSim } from './football.mjs';

export const CHECK_HOUR = 6; // UK time: the first update from 06:00 each day reads the official feeds

/** Is a feed's daily check due? (no check yet, the last one failed, or a new UK day from 06:00) */
export function checkDue(last, now) {
  if (!last?.ok) return true;
  return ukDate(Date.parse(last.checkedAt)) !== ukDate(now) && londonParts(now).hh >= CHECK_HOUR;
}

const group = (m) => m.label || m.comp; // PL, CHAMP, UCL, UEL, UECL, WSL, EFL Cup, FA Cup
const SETTLED = new Set(['live', 'finished']);
const sim = (o, a, side) => Math.max(teamSim(o[side], a[side]), teamSim(o[side], a[`${side}Short`] || ''));

/**
 * Pairs each official match with API-Football's: same competition, kick-offs within 4 days, both
 * teams alike. `missing`: official matches API-Football doesn't have; `extra`: the reverse.
 */
export function pairMatches(official, af) {
  const used = new Set(), pairs = [], missing = [];
  for (const o of official) {
    let best = null, bestScore = 0;
    for (const a of af) {
      if (used.has(a) || group(a) !== group(o)) continue;
      if (Math.abs(Date.parse(a.kickoff) - Date.parse(o.kickoff)) > 4 * 86400000) continue;
      const s = Math.min(sim(o, a, 'home'), sim(o, a, 'away'));
      if (s >= 0.5 && s > bestScore) { best = a; bestScore = s; }
    }
    if (best) { used.add(best); pairs.push({ o, a: best }); } else missing.push(o);
  }
  return { pairs, missing, extra: af.filter(a => !used.has(a)) };
}

/**
 * Where the official feed disagrees with API-Football, as corrections to save and apply:
 *   { id, was: { kickoff, status }, kickoff, status, timeTbc, source }   a game to change
 *   { add: <official match>, source }                                     a game API-Football lacks
 * `status: false` keeps API-Football's status (the FA's page), `adds: false` adds nothing.
 * `within`: the dates API-Football was asked for (the PL feed reaches weeks further; a game beyond
 * them isn't missing).
 */
export function findCorrections(official, af, source, { status = true, adds = true, within = () => true } = {}) {
  const { pairs, missing } = pairMatches(official.filter(o => !o.placeholder), af);
  const out = [];
  for (const { o, a } of pairs) {
    if (SETTLED.has(o.status) || SETTLED.has(a.status)) continue;
    const newStatus = status ? o.status : a.status;
    if (o.kickoff === a.kickoff && newStatus === a.status) continue;
    out.push({ id: a.id, was: { kickoff: a.kickoff, status: a.status }, kickoff: o.kickoff, status: newStatus, timeTbc: !!o.timeTbc, source });
  }
  if (adds) {
    for (const o of missing) {
      if (SETTLED.has(o.status) || !within(o)) continue;
      const { homeAlt, awayAlt, placeholder, ...m } = o;
      out.push({ add: { label: null, kind: 'match', ...m, homeScore: null, awayScore: null, source }, source });
    }
  }
  return out;
}

const when = (iso) => { const t = Date.parse(iso); return `${ukWeekday(t)} ${ukDate(t).slice(5)} ${ukHHMM(t)}`; };

/**
 * Applies saved corrections to API-Football's matches (changing them in place, adding missing
 * games) and returns one line per change for the report.
 */
export function applyCorrections(matches, corrections) {
  const applied = [];
  const byId = new Map(matches.map(m => [m.id, m]));
  for (const c of corrections || []) {
    if (c.add) {
      if (pairMatches([c.add], matches).pairs.length) continue; // API-Football has it by now
      matches.push({ ...c.add });
      applied.push(`${group(c.add)} ${c.add.home} v ${c.add.away}: added, ${when(c.add.kickoff)} (${c.source})`);
      continue;
    }
    const m = byId.get(c.id);
    if (!m || m.kickoff !== c.was.kickoff || m.status !== c.was.status) continue; // changed since the check
    const what = [];
    if (m.kickoff !== c.kickoff) { what.push(`${when(m.kickoff)} -> ${when(c.kickoff)}`); m.kickoff = c.kickoff; m.timeTbc = c.timeTbc; }
    if (m.status !== c.status) { what.push(`${m.status} -> ${c.status}`); m.status = c.status; }
    m.checkedBy = c.source;
    applied.push(`${group(m)} ${m.home} v ${m.away}: ${what.join(', ')} (${c.source})`);
  }
  return applied;
}
