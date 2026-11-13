// API-Football: fixtures and scores for every football competition (PL, Championship, UCL, UEL,
// Conference League, Nations League, WSL, Scottish Premiership, FA Cup, League Cup), from one documented,
// paid-for service (George's decision, 19 Oct 2026), in place of the four official feeds
// (premierleague.com, uefa.com, efl.com, thefa.com) on every update. Those are still read once a
// day to check it, and win where they disagree (goldenCheck.mjs): it can be slow to pick up a
// moved game. scripts/compare-api-football.mjs lists every difference for a week.
//
// Source
//   v3.football.api-sports.io/fixtures?league=<id>&season=<YYYY>&from=&to=&timezone=UTC
//   with header x-apisports-key. One request per competition returns every fixture in the
//   window, so a full read is 10 requests. Kick-off times are UTC ("2024-10-27T15:30:00+00:00").
//   The key comes from the API_FOOTBALL_KEY environment variable (a local .env file, never in git;
//   Secret Manager in Google Cloud).
//
// Quirks
//   - Problems come back as HTTP 200 with an `errors` object, not an HTTP error: a bad key
//     ({ token: ... }), the daily limit ({ requests: ... }) or the free plan's season limit
//     ({ plan: "Free plans do not have access to this season, try from 2022 to 2024." }).
//   - `errors` is [] when there are none, an object when there are.
//   - Status "TBD" = date known, kick-off time not yet set.
//   - The UEFA Nations League (league 5) has a season every other year: 2024, 2026 (league phase
//     September-November 2026, finals and play-offs in 2027 and March 2028), then 2028. Asked for a
//     season it doesn't have (2025, 2027), the API answers with no fixtures and no error.
//   - National teams: "FYR Macedonia", "Rep. Of Ireland", "Bosnia & Herzegovina", "Türkiye".
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
  // Added by George on 19-20 Oct 2026: Conference League and WSL (televised games only),
  // Scottish Premiership (every game)
  848: { comp: 'UECL', label: null },
  44: { comp: 'WSL', label: null, women: true },
  179: { comp: 'SCOT', label: null },
  // Added by George on 13 Nov 2026: the UEFA Nations League (men's; televised games only)
  5: { comp: 'UNL', label: null, nations: true, everyOtherYear: true },
};

// National teams as UEFA and the broadcasters write them (API-Football's name is kept for matching)
const NATION_NAMES = {
  'FYR Macedonia': 'North Macedonia', 'Rep. Of Ireland': 'Republic of Ireland', 'Bosnia & Herzegovina': 'Bosnia and Herzegovina',
};

// Shown: English clubs' full names ("Wolves" -> "Wolverhampton Wanderers", teamNames.mjs); WSL teams
// come as "Arsenal W", shown as "Arsenal Women". Matched (TV listings): API-Football's name ("Arsenal").
// ("London City Lionesses W" is just "London City Lionesses": its name already says so)
const fullName = (n, { women, nations } = {}) => {
  if (nations) return NATION_NAMES[n] || n;
  if (!women) return fullClubName(n);
  const club = String(n || '').replace(/\s+W$/, '');
  return /\b(women|ladies|lionesses)\b/i.test(club) ? club : `${club} Women`;
};
const shortName = (n, women) => (women ? String(n || '').replace(/\s+W$/, '') : n);

const AF_STATUS = {
  TBD: 'upcoming', NS: 'upcoming',
  '1H': 'live', HT: 'live', '2H': 'live', ET: 'live', BT: 'live', P: 'live', SUSP: 'live', INT: 'live', LIVE: 'live',
  FT: 'finished', AET: 'finished', PEN: 'finished',
  PST: 'postponed', CANC: 'postponed', ABD: 'postponed', AWD: 'finished', WO: 'finished',
};

/** Seasons start in summer: season 2026 = 2026/27 (the same for every competition we list). */
export const afSeason = (now) => { const p = londonParts(now); return p.m >= 7 ? p.y : p.y - 1; };
/** The season to ask a competition for: the Nations League's are the even years (2027/28 is still "2026"). */
export const leagueSeason = (id, season) => (AF_LEAGUES[id]?.everyOtherYear ? season - (season % 2) : season);

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
    home: fullName(f.teams?.home?.name, league),
    away: fullName(f.teams?.away?.name, league),
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
    const q = new URLSearchParams({ league: id, season: String(leagueSeason(id, season)), from: fromDate, to: toDate, timezone: 'UTC' });
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
