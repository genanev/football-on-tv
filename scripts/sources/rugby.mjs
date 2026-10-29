// Rugby union: the Premiership, the Champions Cup, the Nations Championship and the Six Nations
// (George, 18 Oct 2026; connected 29 Oct 2026), every match, with UK channels from the TV listings.
// Super League (rugby league) isn't connected yet: World Rugby doesn't cover league, and its 2027
// fixtures weren't published (the 2026 list came out on 27 Nov 2025).
//
// Source
//   World Rugby's data feed (Pulselive, behind world.rugby; no key):
//   api.wr-rims-prod.pulselive.com/rugby/v3/match?startDate=<YYYY-MM-DD>&endDate=&sort=asc&pageSize=100&page=<n>
//   Every match World Rugby records, club and international: about 200 a month in the season, so
//   the competitions are picked by their label ("English Premiership 2027", "EPCR Champions Cup 2027",
//   "Nations Championship 2026", "Six Nations 2027"; not "U20 Six Nations", "Premiership Womens
//   Rugby", "Premiership Rugby Cup"...). `time.millis` is the kick-off in UTC. `status`: U = upcoming,
//   C = complete (others treated as live while they last).
//
// UK TV (no guessing), as for football: a live programme on a rugby channel in Sky's guide on air at
// kick-off naming both teams ("Live: Bath Rugby v Sale Sharks", "Live: Northampton v Gloucester";
// on BBC/ITV a programme counts as live by `isLiveCoverage`), TNT's schedule (title "Bath Rugby -
// Sale Sharks", subtitle "Gallagher PREM | Round 5"; HBO Max streams), and Premier Sports' page for
// the Champions Cup (streaming only, not in Sky's guide). Else "TV channel to be confirmed".

import { getJSON } from '../lib/util.mjs';
import { SPORT_CHANNELS, isLiveCoverage, channelList } from './skyGuide.mjs';
import { guideTeams, teamSim } from './football.mjs';
import { tntProgrammesFor, tntChannelOrder } from './tntSchedule.mjs';

const WR_URL = 'https://api.wr-rims-prod.pulselive.com/rugby/v3/match';

/** World Rugby's competition labels -> our competitions, and how TNT's subtitles name them. */
export const RUGBY_COMPS = [
  { comp: 'RU_PREM', label: /^English Premiership \d{4}$/, tnt: 'PREM' },
  { comp: 'RU_CUP', label: /^EPCR Champions Cup \d{4}$/, tnt: 'Champions Cup', premierSports: /champions cup/i },
  { comp: 'RU_NATIONS', label: /^Nations Championship \d{4}$/, tnt: null },
  { comp: 'RU_6N', label: /^Six Nations \d{4}$/, tnt: 'Six Nations' },
];

const STATUS = { U: 'upcoming', C: 'finished' };

export function mapWrMatch(m) {
  const label = m?.competition || m?.events?.[0]?.label || '';
  const def = RUGBY_COMPS.find(d => d.label.test(label));
  const [home, away] = m?.teams || [];
  if (!def || !home?.name || !away?.name || typeof m.time?.millis !== 'number') return null;
  return {
    id: `wr-${m.matchId}`, comp: def.comp, kind: 'match', label: null,
    kickoff: new Date(m.time.millis).toISOString(), timeTbc: false,
    home: home.name, away: away.name, homeShort: home.name, awayShort: away.name,
    venue: m.venue?.name || null, status: STATUS[m.status] || 'live',
    homeScore: null, awayScore: null, // fixtures only (scores are a football-only, accepted risk)
    round: [m.eventPhase, m.description].filter(Boolean).join(' ') || null, source: 'world.rugby',
  };
}

/** Our competitions' matches between two dates (YYYY-MM-DD, inclusive). */
export async function fetchRugby(fromDate, toDate) {
  const out = [];
  for (let page = 0; page < 10; page++) {
    const q = new URLSearchParams({ startDate: fromDate, endDate: toDate, sort: 'asc', pageSize: '100', page: String(page) });
    const j = await getJSON(`${WR_URL}?${q}`);
    out.push(...(j.content || []).map(mapWrMatch).filter(Boolean));
    if (page + 1 >= (j.pageInfo?.numPages || 0)) break;
  }
  return out;
}

const names = (m, side) => [m[side], m[`${side}Short`]].filter(Boolean);
const sim = (m, side, name) => Math.max(...names(m, side).map(n => teamSim(n, name)));

/** Live guide programmes for a match: on air at kick-off, naming both teams (women's/U20 games aren't ours). */
export function rugbyGuideFor(m, programmes) {
  const sids = SPORT_CHANNELS.rugby;
  const ko = Date.parse(m.kickoff);
  return (programmes || []).filter(p => {
    if (!sids.includes(p.sid) || !isLiveCoverage(p)) return false;
    if (!(p.start <= ko + 15 * 60000 && p.end > ko + 15 * 60000 && p.start >= ko - 2 * 3600000)) return false;
    if (/\bU\d{2}\b|\bwomen\b|\bwomen's\b/i.test(`${p.title} ${p.synopsis}`)) return false;
    const teams = guideTeams(p.title);
    return !!teams && sim(m, 'home', teams[0]) >= 0.5 && sim(m, 'away', teams[1]) >= 0.5;
  });
}

/** UK TV for a rugby match: Sky's guide, then Premier Sports (Champions Cup), then TNT (HBO Max last). */
export function rugbyTv(m, { guide, tnt, premierSports } = {}) {
  const def = RUGBY_COMPS.find(d => d.comp === m.comp);
  const ko = Date.parse(m.kickoff);
  const progs = rugbyGuideFor(m, guide?.programmes);
  const fromTnt = tntProgrammesFor(m, tnt, def?.tnt).filter(p => /rugby/i.test(p.sport || 'rugby'));
  const fromPs = def?.premierSports ? (premierSports?.events || []).filter(e => def.premierSports.test(e.competition)
    && e.start >= ko - 2 * 3600000 && e.start <= ko + 15 * 60000 && e.away && sim(m, 'home', e.home) >= 0.5 && sim(m, 'away', e.away) >= 0.5) : [];
  const chans = [...channelList(progs, SPORT_CHANNELS.rugby)];
  for (const c of [...fromPs.map(e => e.channel), ...tntChannelOrder(fromTnt.map(p => p.channel))]) if (!chans.includes(c)) chans.push(c);
  if (!chans.length) {
    return { broadcaster: null, channels: [], alsoOn: [], confirmed: false, note: 'TV channel to be confirmed', conflict: false, sources: [] };
  }
  const sources = [...(progs.length ? ['sky-guide'] : []), ...(fromPs.length ? ['premiersports.com'] : []), ...(fromTnt.length ? ['tntsports.co.uk'] : [])];
  return { broadcaster: chans[0], channels: [chans[0]], alsoOn: chans.slice(1), confirmed: true, note: null, conflict: false, sources };
}
