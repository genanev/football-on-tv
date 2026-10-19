// Side-by-side check: API-Football against the official feeds we use today (premierleague.com,
// uefa.com, efl.com, thefa.com), for the same 9-day window. Lists every difference, so George can
// decide when API-Football is good enough to replace them (decision 19 Oct 2026). Saves nothing.
//
//   node --env-file=.env scripts/compare-api-football.mjs              window starting today
//   node --env-file=.env scripts/compare-api-football.mjs 2024-10-22   a past window (the free
//                                                                       plan only has 2022-2024)
//
// Uses 6 API-Football requests per run.

import { ukDate, ukMidnight, ukHHMM, ukWeekday } from './lib/util.mjs';
import { getJSON } from './lib/util.mjs';
import { mapPlMatch, fetchUefa, teamSim, normTeam } from './sources/football.mjs';
import { fetchEfl } from './sources/efl.mjs';
import { fetchFaCup } from './sources/facup.mjs';
import { fetchApiFootball, afSeason } from './sources/apiFootball.mjs';

const DAYS = 9; // the app's window: today + 8 days
const start = process.argv[2] || ukDate(Date.now());
if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) { console.error('Date must be YYYY-MM-DD'); process.exit(1); }
const from = ukMidnight(start), to = from + DAYS * 86400000;
const end = ukDate(to - 3600000);
const season = afSeason(from + 12 * 3600000);
const isPast = to < Date.now() - 86400000;
const inWindow = (m) => { const t = Date.parse(m.kickoff); return t >= from && t < to; };

// ---------------------------------------------------------------- official feeds

// The Premier League feed is by matchweek; read the whole season once rather than guess which
// matchweeks fall in the window (works for past seasons too).
async function plSeasonMatches() {
  const headers = { Origin: 'https://www.premierleague.com', Referer: 'https://www.premierleague.com/' };
  const weeks = await Promise.all(Array.from({ length: 38 }, (_, i) =>
    getJSON(`https://sdp-prem-prod.premier-league-prod.pulselive.com/api/v2/matches?competition=8&season=${season}&matchweek=${i + 1}&_limit=50`, headers)
      .then(j => (j.data || []).map(mapPlMatch).filter(Boolean))));
  return weeks.flat();
}

const official = {}, notes = [];
const settle = async (name, p) => { try { official[name] = (await p).filter(inWindow); } catch (e) { notes.push(`${name}: official feed failed (${e.message})`); } };
await Promise.all([
  settle('PL', plSeasonMatches()),
  settle('UCL', fetchUefa(from + 86400000, DAYS - 1, 'UCL')),
  settle('UEL', fetchUefa(from + 86400000, DAYS - 1, 'UEL')),
  settle('EFL', fetchEfl(start, end, season)),
  isPast ? Promise.resolve(notes.push('FA Cup: not compared (thefa.com only shows the next round)'))
    : settle('FA Cup', fetchFaCup()),
]);

let af;
try {
  af = await fetchApiFootball(start, end, season);
} catch (e) {
  console.error(`API-Football failed: ${e.message}`);
  process.exit(1);
}
const afMatches = af.matches.filter(inWindow);

// ---------------------------------------------------------------- compare

const group = (m) => m.label || m.comp; // PL, CHAMP, UCL, UEL, EFL Cup, FA Cup
const officialAll = Object.values(official).flat();
const when = (iso) => { const t = Date.parse(iso); return `${ukWeekday(t)} ${ukDate(t).slice(5)} ${ukHHMM(t)}`; };
const name = (m) => `${m.home} v ${m.away}`;

const used = new Set();
const rows = { same: 0, time: [], status: [], score: [], names: [], missing: [], extra: [] };
for (const o of officialAll) {
  let best = null, bestScore = 0;
  for (const a of afMatches) {
    if (used.has(a) || group(a) !== group(o)) continue;
    if (Math.abs(Date.parse(a.kickoff) - Date.parse(o.kickoff)) > 4 * 86400000) continue;
    const s = Math.min(teamSim(o.home, a.home), teamSim(o.away, a.away));
    if (s >= 0.5 && s > bestScore) { best = a; bestScore = s; }
  }
  if (!best) { rows.missing.push(`${group(o)}  ${when(o.kickoff)}  ${name(o)}`); continue; }
  used.add(best);
  let differs = false;
  if (best.kickoff !== o.kickoff) { differs = true; rows.time.push(`${group(o)}  ${name(o)}: official ${when(o.kickoff)}, API-Football ${when(best.kickoff)}`); }
  if (best.status !== o.status) { differs = true; rows.status.push(`${group(o)}  ${name(o)}: official ${o.status}, API-Football ${best.status}`); }
  if (o.status === 'finished' && best.status === 'finished' && (best.homeScore !== o.homeScore || best.awayScore !== o.awayScore)) {
    differs = true; rows.score.push(`${group(o)}  ${name(o)}: official ${o.homeScore}-${o.awayScore}, API-Football ${best.homeScore}-${best.awayScore}`);
  }
  for (const side of ['home', 'away']) {
    if (normTeam(o[side]) !== normTeam(best[side])) rows.names.push(`"${o[side]}" = "${best[side]}"`);
  }
  if (!differs) rows.same++;
}
for (const a of afMatches) {
  if (used.has(a)) continue;
  // The FA page lists televised ties only, so other FA Cup ties are expected here
  const why = group(a) === 'FA Cup' ? '  (expected: thefa.com lists televised ties only)' : '';
  rows.extra.push(`${group(a)}  ${when(a.kickoff)}  ${name(a)}${why}`);
}

// ---------------------------------------------------------------- report

const counts = (list) => Object.entries(list.reduce((c, m) => ({ ...c, [group(m)]: (c[group(m)] || 0) + 1 }), {})).map(([k, v]) => `${k} ${v}`).join(', ') || 'none';
const section = (title, list) => { if (list.length) console.log(`\n${title} (${list.length})\n  ${list.join('\n  ')}`); };

console.log(`API-Football vs official feeds, ${start} to ${end} (season ${season})`);
console.log(`  Official:     ${officialAll.length} matches (${counts(officialAll)})`);
console.log(`  API-Football: ${afMatches.length} matches (${counts(afMatches)})`);
if (af.errors.length) console.log(`  API-Football errors: ${af.errors.join(' | ')}`);
for (const n of notes) console.log(`  Note: ${n}`);
console.log(`\nIdentical (teams, UK kick-off, status${isPast ? ', final score' : ''}): ${rows.same}`);
section('Different kick-off time', rows.time);
section('Different status', rows.status);
section('Different final score', rows.score);
section('Missing from API-Football', rows.missing);
section('Only in API-Football', rows.extra);
section('Team names that differ (fine if the TV listings still match them)', [...new Set(rows.names)]);
const problems = rows.time.length + rows.status.length + rows.score.length + rows.missing.length;
console.log(`\n${problems ? `${problems} difference(s) to look at` : 'No differences in kick-off times, statuses, scores or missing matches'}`);
