// The Lionesses' World Cup play-off (a Special; George, 14 Nov 2026): England Women's two-leg
// play-off for a place at the 2027 Women's World Cup, both legs, as football matches.
//
// Sources
//   Fixtures  API-Football (the paid service behind all our football): /fixtures?league=880
//             ("World Cup - Women - Qualification Europe") &season=2027&team=1721 ("England W") gives
//             every England game of the qualifiers; the play-off's round reads "Qualification -
//             Promotion - Play Offs" (the earlier rounds: "Group Stage - 6", "Semi-finals"). On
//             14 Nov 2026: Ukraine W v England W, Tue 1 Dec 17:00 UTC, and England W v Ukraine W,
//             Sat 5 Dec 17:30 UTC (Wembley). One request per update. No official feed checks it:
//             UEFA's match feed didn't answer for the women's qualifiers under any id tried.
//   TV        Sky's TV guide (no guessing): a programme on a football channel that counts as live
//             (free-to-air channels don't write "Live": skyGuide.mjs), on air at kick-off, naming both
//             nations and saying it's the women's game ("Women", "Lionesses"). ITV showed the
//             Lionesses' home qualifiers in 2025; no listing for these two games had been published
//             when this was written (the guide reaches 8 days), so check the real titles once they
//             appear (from 23 Nov 2026).
//
// The next edition (the 2031 World Cup's qualifiers) needs a new row in PLAYOFFS.

import { getJSON, ukDate } from '../lib/util.mjs';
import { afErrors } from './apiFootball.mjs';
import { fullGuideTitle } from './football.mjs';
import { SPORT_CHANNELS, isLiveCoverage, guideTv } from './skyGuide.mjs';
import { SPECIALS } from './specials.mjs';

const AF_URL = 'https://v3.football.api-sports.io/fixtures';
const COMP = 'SPECIAL_LIONESSES';
export const PLAYOFFS = [{ comp: COMP, league: 880, season: 2027, team: 1721, round: /play[- ]?offs?/i }];

const AF_STATUS = {
  TBD: 'upcoming', NS: 'upcoming',
  '1H': 'live', HT: 'live', '2H': 'live', ET: 'live', BT: 'live', P: 'live', SUSP: 'live', INT: 'live', LIVE: 'live',
  FT: 'finished', AET: 'finished', PEN: 'finished',
  PST: 'postponed', CANC: 'postponed', ABD: 'postponed', AWD: 'finished', WO: 'finished',
};
const nation = (n) => String(n || '').replace(/\s+W$/, '');

/** API-Football's fixture -> a match; null unless it's a play-off game. */
export function mapPlayoffFixture(f, def = PLAYOFFS[0]) {
  const ts = Date.parse(f?.fixture?.date || '');
  if (Number.isNaN(ts) || !def.round.test(f?.league?.round || '')) return null;
  const short = f.fixture.status?.short;
  const goals = (n) => (typeof n === 'number' ? n : null);
  return {
    id: `af-${f.fixture.id}`, sourceId: String(f.fixture.id), comp: def.comp, label: null, kind: 'match',
    kickoff: new Date(ts).toISOString(), timeTbc: short === 'TBD',
    home: `${nation(f.teams?.home?.name)} Women`, away: `${nation(f.teams?.away?.name)} Women`,
    homeShort: nation(f.teams?.home?.name), awayShort: nation(f.teams?.away?.name),
    venue: f.fixture.venue?.name || null, status: AF_STATUS[short] || 'upcoming',
    homeScore: goals(f.goals?.home), awayScore: goals(f.goals?.away), round: f.league?.round || null,
    source: 'api-football.com',
  };
}

/** The play-off's games and its dates (first to last leg, UK dates), for the Specials table. */
export async function fetchLionesses(key = process.env.API_FOOTBALL_KEY) {
  if (!key) throw new Error('API_FOOTBALL_KEY is not set');
  const def = PLAYOFFS[0];
  const q = new URLSearchParams({ league: String(def.league), season: String(def.season), team: String(def.team), timezone: 'UTC' });
  const j = await getJSON(`${AF_URL}?${q}`, { 'x-apisports-key': key });
  const err = afErrors(j);
  if (err) throw new Error(err);
  const matches = (j.response || []).map(f => mapPlayoffFixture(f, def)).filter(Boolean).sort((a, b) => a.kickoff.localeCompare(b.kickoff));
  if (!matches.length) return { matches, events: [] }; // England didn't need (or didn't reach) the play-offs
  const days = matches.map(m => ukDate(Date.parse(m.kickoff)));
  const name = SPECIALS.find(s => s.comp === def.comp).name;
  return { matches, events: [{ comp: def.comp, name, startDate: days[0], endDate: days[days.length - 1], source: 'api-football.com' }] };
}

const WOMEN = /\bwomen(?:'s)?\b|\blionesses\b/i;
const names = (text, n) => new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text);

/** UK TV for a play-off game: a live women's programme in the guide naming both nations, on air at kick-off. */
export function lionessesTv(m, guide) {
  const ko = Date.parse(m.kickoff);
  const sids = SPORT_CHANNELS.football;
  const progs = (guide?.programmes || []).filter(p => {
    if (!sids.includes(p.sid) || !isLiveCoverage(p)) return false;
    if (!(p.start <= ko + 15 * 60000 && p.end > ko + 15 * 60000 && p.start >= ko - 2 * 3600000)) return false;
    const text = `${fullGuideTitle(p)} ${p.synopsis || ''}`;
    return WOMEN.test(text) && names(text, m.homeShort) && names(text, m.awayShort);
  });
  if (progs.length) return guideTv(progs, sids);
  return { broadcaster: null, channels: [], alsoOn: [], confirmed: false, note: 'TV channel to be confirmed', conflict: false, sources: [] };
}
