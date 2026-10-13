// UK TV channel for a football match, from official broadcaster sources only (no guessing):
//   1. Sky's TV guide       every channel on Sky ("Live PL: Leeds v Manchester United")
//   2. Sky Sports' page     Sky games incl. Sky Sports+ streams ("Football on Sky")
//   3. TNT Sports' schedule TNT games incl. HBO Max streams
//   4. Prime Video          Amazon's own Champions League pick (its tournament page), for a game
//                           none of the above shows
//   5. Premier League feed  the league's own UK broadcaster (only answers UK requests; GitHub's
//                           servers are in the US, so in practice it rarely adds anything)
// All confirmed channels are combined (main channel first, HBO Max last). Without any:
// Saturday 15:00 league games are "Not shown live on UK TV", everything else
// "TV channel to be confirmed".

import { londonParts, ukDate, ukWeekday } from '../lib/util.mjs';
import { SPORT_CHANNELS, channelList } from './skyGuide.mjs';
import { guideProgrammesFor, teamSim, brandOf } from './football.mjs';
import { tntProgrammesFor, tntTeams } from './tntSchedule.mjs';
import { primePickFor, amazonTv } from './amazonPrime.mjs';

const COMPETITION = { PL: 'Premier League', UCL: 'Champions League', UEL: 'Europa League', CHAMP: 'Championship', CUPS: null };

/** The entry on Sky's football page for this match: same UK date, both team names. */
export function skyListingFor(m, entries) {
  const date = ukDate(Date.parse(m.kickoff));
  const names = (side) => [m[side], m[`${side}Short`], m[`${side}Alt`]].filter(Boolean);
  const sim = (side, name) => Math.max(...names(side).map(n => teamSim(n, name)));
  return (entries || []).find(e => e.page !== 'f1-on-sky' && e.date === date && e.home && sim('home', e.home) >= 0.5 && sim('away', e.away) >= 0.5) || null;
}

export const isSat3pm = (ts) => { const p = londonParts(ts); return ukWeekday(ts) === 'Sat' && p.hh === 15 && p.mm === 0; };

/**
 * Returns { tv, tntNames } - tntNames are the broadcaster's (TNT's or Amazon's) spellings of the teams ("Manchester City",
 * "Paris Saint-Germain"), which read better than UEFA's short names ("Man City", "Paris").
 */
export function footballTv(m, { guide, skyListings, tnt, prime, plBrands } = {}) {
  const sids = SPORT_CHANNELS.football;
  const progs = guideProgrammesFor(m, guide?.programmes || [], sids);
  const listed = skyListingFor(m, skyListings?.entries);
  const fromTnt = tntProgrammesFor(m, tnt, COMPETITION[m.comp]);

  const names = [
    ...channelList(progs, sids),
    ...(listed ? listed.channels.map(c => c.name) : []),
    ...fromTnt.map(p => p.channel),
  ];
  const chans = [...new Set(names)].sort((a, b) => (a === 'HBO Max') - (b === 'HBO Max'));
  const sources = [
    ...(progs.length ? ['sky-guide'] : []), ...(listed ? ['skysports.com'] : []), ...(fromTnt.length ? ['tntsports.co.uk'] : []),
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
  } else if ((m.comp === 'PL' || m.comp === 'CHAMP') && isSat3pm(Date.parse(m.kickoff))) {
    tv.note = 'Not shown live on UK TV';
  } else {
    tv.note = 'TV channel to be confirmed';
  }
  return { tntNames, tv };
}
