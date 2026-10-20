// UK TV channel for a football match, from official broadcaster sources only (no guessing):
//   1. Sky's TV guide       every channel on Sky ("Live PL: Leeds v Manchester United")
//   2. Sky Sports' page     Sky games incl. Sky Sports+ streams ("Football on Sky")
//   3. TNT Sports' schedule TNT games incl. HBO Max streams
//   4. Prime Video          Amazon's own Champions League pick (its tournament page), for a game
//                           none of the above shows
//   4b. Premier Sports      streaming-only, not in Sky's guide: its fixtures page (Scottish
//                           Premiership games, premierSports.mjs)
//   5. Premier League feed  the league's own UK broadcaster (only answers UK requests; GitHub's
//                           servers are in the US, so in practice it rarely adds anything)
// All confirmed channels are combined (main channel first, HBO Max last). Without any:
// Saturday 15:00 league games (PL, Championship, Scottish Premiership) are "Not shown live on UK
// TV", everything else "TV channel to be confirmed". Women's and men's games between the same
// clubs never confirm each other.

import { londonParts, ukDate, ukWeekday } from '../lib/util.mjs';
import { SPORT_CHANNELS, channelList } from './skyGuide.mjs';
import { guideProgrammesFor, teamSim, brandOf } from './football.mjs';
import { tntProgrammesFor, tntTeams } from './tntSchedule.mjs';
import { primePickFor, amazonTv } from './amazonPrime.mjs';

// The competition as TNT writes it in a programme's subtitle (null: any subtitle; false: TNT doesn't
// show it, so its schedule isn't searched - a men's "Arsenal - Chelsea" mustn't confirm the WSL game)
const COMPETITION = {
  PL: 'Premier League', UCL: 'Champions League', UEL: 'Europa League', UECL: 'Conference League',
  CHAMP: 'Championship', CUPS: null, WSL: false, SCOT: false,
};

// Competitions looked up on Premier Sports, as its page names them (Scottish Premiership first;
// George, 20 Oct 2026). Its listed time is when coverage starts, usually 30 minutes before kick-off.
const PREMIER_SPORTS = { SCOT: 'SPFL' };

/** Premier Sports' listing for this match: same competition, both teams, coverage from up to 2h before kick-off. */
export function premierSportsFor(m, ps) {
  const comp = PREMIER_SPORTS[m.comp];
  if (!comp) return [];
  const ko = Date.parse(m.kickoff);
  const names = (side) => [m[side], m[`${side}Short`]].filter(Boolean);
  const sim = (side, name) => Math.max(...names(side).map(n => teamSim(n, name)));
  return (ps?.events || []).filter(e => e.competition === comp && e.start >= ko - 2 * 3600000 && e.start <= ko + 15 * 60000
    && e.away && sim('home', e.home) >= 0.5 && sim('away', e.away) >= 0.5);
}

/** Women's games ("Arsenal Women", WSL) and men's games must not confirm each other. */
const WOMEN = /\bwomen\b|\bwsl\b/i;
export const isWomen = (m) => m.comp === 'WSL' || WOMEN.test(`${m.home} ${m.away}`);

/** The entry on Sky's football page for this match: same UK date, both team names. */
export function skyListingFor(m, entries) {
  const date = ukDate(Date.parse(m.kickoff));
  const names = (side) => [m[side], m[`${side}Short`], m[`${side}Alt`]].filter(Boolean);
  const sim = (side, name) => Math.max(...names(side).map(n => teamSim(n, name)));
  const women = isWomen(m);
  return (entries || []).find(e => e.page !== 'f1-on-sky' && e.date === date && e.home
    && WOMEN.test(`${e.competition || ''} ${e.home} ${e.away}`) === women
    && sim('home', e.home) >= 0.5 && sim('away', e.away) >= 0.5) || null;
}

export const isSat3pm = (ts) => { const p = londonParts(ts); return ukWeekday(ts) === 'Sat' && p.hh === 15 && p.mm === 0; };

/**
 * Returns { tv, tntNames } - tntNames are the broadcaster's (TNT's or Amazon's) spellings of the teams ("Manchester City",
 * "Paris Saint-Germain"), which read better than UEFA's short names ("Man City", "Paris").
 */
export function footballTv(m, { guide, skyListings, tnt, prime, plBrands, premierSports } = {}) {
  const sids = SPORT_CHANNELS.football;
  const progs = guideProgrammesFor(m, guide?.programmes || [], sids);
  const listed = skyListingFor(m, skyListings?.entries);
  const fromTnt = COMPETITION[m.comp] === false ? [] : tntProgrammesFor(m, tnt, COMPETITION[m.comp]);
  const fromPs = premierSportsFor(m, premierSports);

  const names = [
    ...channelList(progs, sids),
    ...(listed ? listed.channels.map(c => c.name) : []),
    ...fromTnt.map(p => p.channel),
    ...fromPs.map(e => e.channel),
  ];
  const chans = [...new Set(names)].sort((a, b) => (a === 'HBO Max') - (b === 'HBO Max'));
  const sources = [
    ...(progs.length ? ['sky-guide'] : []), ...(listed ? ['skysports.com'] : []), ...(fromTnt.length ? ['tntsports.co.uk'] : []),
    ...(fromPs.length ? ['premiersports.com'] : []),
  ];
  const tntNames = fromTnt.length ? tntTeams(fromTnt[0].title) : null;

  if (chans.length) {
    return { tntNames, tv: { broadcaster: chans[0], channels: [chans[0]], alsoOn: chans.slice(1), confirmed: true, note: null, conflict: false, sources } };
  }
  const pick = m.comp === 'UCL' ? primePickFor(m, prime) : null;
  if (pick) return { tntNames: [pick.home, pick.away], tv: amazonTv() }; // Amazon's names read better too
  const tv = { broadcaster: null, channels: [], alsoOn: [], confirmed: false, note: null, conflict: false, sources: [] };
  if (plBrands?.length) {
    // The league's own broadcaster for this match: a brand ("Sky Sports"), not yet a channel
    tv.broadcaster = brandOf(plBrands[0]);
    tv.note = 'Exact channel to be confirmed';
    tv.sources.push('premierleague.com');
  } else if ((m.comp === 'PL' || m.comp === 'CHAMP' || m.comp === 'SCOT') && isSat3pm(Date.parse(m.kickoff))) {
    // the Saturday 3pm blackout applies in Scotland too
    tv.note = 'Not shown live on UK TV';
  } else {
    tv.note = 'TV channel to be confirmed';
  }
  return { tntNames, tv };
}
