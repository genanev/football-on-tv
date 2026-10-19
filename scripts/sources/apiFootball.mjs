// API-Football: fixtures and scores for every football competition (the six in today's app, plus
// the Conference League and the WSL for the new app), from one documented,
// paid-for service (George's decision, 19 Oct 2026). It replaces the four official feeds
// (premierleague.com, uefa.com, efl.com, thefa.com) once a side-by-side comparison has shown it
// agrees with them (scripts/compare-api-football.mjs).
//
// Source
//   v3.football.api-sports.io/fixtures?league=<id>&season=<YYYY>&from=&to=&timezone=UTC
//   with header x-apisports-key. One request per competition returns every fixture in the
//   window, so a full read is 8 requests. Kick-off times are UTC ("2024-10-27T15:30:00+00:00").
//   The key comes from the API_FOOTBALL_KEY environment variable (a local .env file, never in git;
//   Secret Manager in Google Cloud).
//
// Quirks
//   - Problems come back as HTTP 200 with an `errors` object, not an HTTP error: a bad key
//     ({ token: ... }), the daily limit ({ requests: ... }) or the free plan's season limit
//     ({ plan: "Free plans do not have access to this season, try from 2022 to 2024." }).
//   - `errors` is [] when there are none, an object when there are.
//   - Status "TBD" = date known, kick-off time not yet set.
//
// No TV channels here: those still come from the TV listings (footballTv.mjs).

import { getJSON, londonParts } from '../lib/util.mjs';
import { fullClubName } from './teamNames.mjs';

const AF_URL = 'https://v3.football.api-sports.io/fixtures';

/** API-Football league id -> our competition. Cups share the "CUPS" tab, labelled by cup. */
export const AF_LEAGUES = {
  39: { comp: 'PL', label: null },
  40: { comp: 'CHAMP', label: null },
  2: { comp: 'UCL', label: null },
  3: { comp: 'UEL', label: null },
  45: { comp: 'CUPS', label: 'FA Cup' },
  48: { comp: 'CUPS', label: 'EFL Cup' },
  // Added for the new app only (George, 19 Oct 2026); the current app doesn't list them
  848: { comp: 'UECL', label: null },
  44: { comp: 'WSL', label: null, women: true },
};

// Shown: English clubs' full names ("Wolves" -> "Wolverhampton Wanderers", teamNames.mjs); WSL teams
// come as "Arsenal W", shown as "Arsenal Women". Matched (TV listings): API-Football's name ("Arsenal").
const fullName = (n, women) => (women ? String(n || '').replace(/\s+W$/, ' Women') : fullClubName(n));
const shortName = (n, women) => (women ? String(n || '').replace(/\s+W$/, '') : n);

const AF_STATUS = {
  TBD: 'upcoming', NS: 'upcoming',
  '1H': 'live', HT: 'live', '2H': 'live', ET: 'live', BT: 'live', P: 'live', SUSP: 'live', INT: 'live', LIVE: 'live',
  FT: 'finished', AET: 'finished', PEN: 'finished',
  PST: 'postponed', CANC: 'postponed', ABD: 'postponed', AWD: 'finished', WO: 'finished',
};

/** Seasons start in summer: season 2026 = 2026/27 (the same for every competition we list). */
export const afSeason = (now) => { const p = londonParts(now); return p.m >= 7 ? p.y : p.y - 1; };

export function mapAfFixture(f) {
  const league = AF_LEAGUES[f?.league?.id];
  const ts = Date.parse(f?.fixture?.date || '');
  if (!league || Number.isNaN(ts)) return null;
  const short = f.fixture.status?.short;
  const goals = (n) => (typeof n === 'number' ? n : null);
  return {
    id: `af-${f.fixture.id}`,
    sourceId: String(f.fixture.id),
    comp: league.comp,
    label: league.label,
    kind: 'match',
    kickoff: new Date(ts).toISOString(),
    timeTbc: short === 'TBD',
    home: fullName(f.teams?.home?.name, league.women),
    away: fullName(f.teams?.away?.name, league.women),
    homeShort: shortName(f.teams?.home?.name, league.women),
    awayShort: shortName(f.teams?.away?.name, league.women),
    venue: f.fixture.venue?.name || null,
    status: AF_STATUS[short] || 'upcoming',
    homeScore: goals(f.goals?.home),
    awayScore: goals(f.goals?.away),
    round: f.league?.round || null,
    source: 'api-football.com',
  };
}

/** The API's `errors` as one line, or null ([] and {} mean no errors). */
export function afErrors(j) {
  const e = j?.errors;
  if (!e || (Array.isArray(e) ? !e.length : !Object.keys(e).length)) return null;
  return Array.isArray(e) ? e.join('; ') : Object.entries(e).map(([k, v]) => `${k}: ${v}`).join('; ');
}

/**
 * Every fixture of our competitions between two UK dates ("YYYY-MM-DD", inclusive).
 * One competition failing doesn't stop the others (it's listed in `errors`); if all fail, it throws.
 */
export async function fetchApiFootball(fromDate, toDate, season, key = process.env.API_FOOTBALL_KEY) {
  if (!key) throw new Error('API_FOOTBALL_KEY is not set');
  const matches = [], errors = [];
  for (const id of Object.keys(AF_LEAGUES)) {
    const q = new URLSearchParams({ league: id, season: String(season), from: fromDate, to: toDate, timezone: 'UTC' });
    try {
      const j = await getJSON(`${AF_URL}?${q}`, { 'x-apisports-key': key });
      const err = afErrors(j);
      if (err) throw new Error(err);
      matches.push(...(j.response || []).map(mapAfFixture).filter(Boolean));
    } catch (e) {
      errors.push(`${AF_LEAGUES[id].label || AF_LEAGUES[id].comp}: ${e.message}`);
    }
  }
  if (errors.length === Object.keys(AF_LEAGUES).length) throw new Error(errors[0]);
  return { matches, errors };
}
