// Football: Premier League, Champions League and Europa League fixtures and their UK TV channels,
// plus the TV-guide matching shared with the EFL and FA Cup modules.
//
// Sources
//   Premier League schedule   official premierleague.com data feed
//   Premier League TV (brand) official premierleague.com broadcast feed
//   Champions League schedule official uefa.com data feed
//   Europa League schedule    official uefa.com data feed (same feed, competition 14)
//   Exact TV channel (PL/UCL) live-footballontv.com listings (cross-reference)
//   Exact TV channel (UEL)    Sky's TV guide ("Live UEL: Lyon v Crystal Palace")

import { getJSON, getText, londonParts, ukToUtc, ukDate, ukHHMM, ukWeekday } from '../lib/util.mjs';

// ----------------------------------------------------------- name matching

const STOP = new Set(['fc', 'afc', 'cf', 'sc', 'rc', 'fk', 'ac', 'as', 'sk', 'cd', 'ss', 'ssc', 'club', 'de', 'the', 'and', 'vfb', 'vfl', 'sv', 'bk', 'if', 'calcio', 'football', 'cp', 'sl', 'nk', 'gnk', 'hnk', 'ud', 'rcd']);

const ALIASES = {
  'man utd': 'manchester united', 'man united': 'manchester united', 'man city': 'manchester city',
  'spurs': 'tottenham hotspur', 'tottenham': 'tottenham hotspur', 'wolves': 'wolverhampton wanderers',
  "nott'm forest": 'nottingham forest', 'notts forest': 'nottingham forest', 'forest': 'nottingham forest',
  'brighton': 'brighton hove albion', 'west ham': 'west ham united', 'newcastle': 'newcastle united',
  'leeds': 'leeds united', 'atleti': 'atletico madrid', 'atletico de madrid': 'atletico madrid',
  'paris': 'paris saint germain', 'psg': 'paris saint germain', 'paris sg': 'paris saint germain',
  'inter': 'inter milan', 'internazionale': 'inter milan', 'milan': 'ac milan',
  'b dortmund': 'borussia dortmund', 'dortmund': 'borussia dortmund', 'bvb': 'borussia dortmund',
  'b monchengladbach': 'borussia monchengladbach', 'leverkusen': 'bayer leverkusen',
  'bayern munchen': 'bayern munich', 'bayern': 'bayern munich', 'leipzig': 'rb leipzig',
  's bratislava': 'slovan bratislava', 'slavia praha': 'slavia prague', 'sparta praha': 'sparta prague',
  'bodo glimt': 'bodo glimt', 'psv': 'psv eindhoven', 'sporting': 'sporting lisbon', 'sporting cp': 'sporting lisbon',
  'benfica': 'benfica', 'qarabag': 'qarabag', 'crvena zvezda': 'red star belgrade', 'fcsb': 'fcsb',
  'olympiacos': 'olympiakos', 'olympiakos': 'olympiakos', 'kobenhavn': 'copenhagen', 'fc kobenhavn': 'copenhagen',
  'shakhtar': 'shakhtar donetsk', 'dinamo zagreb': 'dinamo zagreb', 'salzburg': 'red bull salzburg',
  'aek athens': 'aek athens', 'union sg': 'union saint gilloise', 'club brugge': 'club brugge',
};

function stripAccents(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ø/g, 'o').replace(/Ø/g, 'O').replace(/ß/g, 'ss').replace(/æ/g, 'ae');
}

export function normTeam(name) {
  let s = stripAccents(String(name || '')).toLowerCase()
    .replace(/&/g, ' and ').replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (ALIASES[s]) s = ALIASES[s];
  const noApos = s.replace(/'/g, '');
  if (ALIASES[noApos]) s = ALIASES[noApos];
  return s.replace(/'/g, '').split(' ').filter(w => w && !STOP.has(w)).join(' ');
}

/** 0..1 similarity between two team names. */
export function teamSim(a, b) {
  const x = normTeam(a), y = normTeam(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.includes(y) || y.includes(x)) return 0.85;
  const tx = new Set(x.split(' ')), ty = new Set(y.split(' '));
  let common = 0;
  for (const t of tx) if (ty.has(t) && t.length >= 3) common++;
  if (!common) return 0;
  return 0.5 + 0.3 * (common / Math.min(tx.size, ty.size));
}

const PL_HEADERS = { Origin: 'https://www.premierleague.com', Referer: 'https://www.premierleague.com/' };
const UEFA_HEADERS = { Origin: 'https://www.uefa.com', Referer: 'https://www.uefa.com/' };

// ---------------------------------------------------- Premier League (official)

export function plSeason(now) {
  const p = londonParts(now);
  return p.m >= 7 ? p.y : p.y - 1; // season "2026" = 2026/27
}

/** Parse "2026-10-10 12:30:00" + "BST"/"GMT" into a UTC timestamp. */
export function parsePlKickoff(kickoff, tz) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(kickoff || '');
  if (!m) return null;
  const [, y, mo, d, hh, mi] = m.map(Number);
  if (tz === 'GMT' || tz === 'UTC') return Date.UTC(y, mo - 1, d, hh, mi);
  if (tz === 'BST') return Date.UTC(y, mo - 1, d, hh - 1, mi);
  return ukToUtc(y, mo, d, hh, mi); // unknown label: assume UK local time
}

const PL_STATUS = { PreMatch: 'upcoming', FullTime: 'finished', Postponed: 'postponed', Abandoned: 'postponed', Cancelled: 'postponed' };

export function mapPlMatch(d) {
  const ts = parsePlKickoff(d.kickoff, d.kickoffTimezone);
  if (ts == null) return null;
  const score = (t) => (typeof t?.score === 'number' ? t.score : null);
  return {
    id: `pl-${d.matchId}`,
    sourceId: String(d.matchId),
    comp: 'PL',
    kickoff: new Date(ts).toISOString(),
    home: d.homeTeam?.name,
    away: d.awayTeam?.name,
    homeShort: d.homeTeam?.shortName || d.homeTeam?.name,
    awayShort: d.awayTeam?.shortName || d.awayTeam?.name,
    venue: d.ground || null,
    status: PL_STATUS[d.period] || (d.period ? 'live' : 'upcoming'),
    homeScore: score(d.homeTeam),
    awayScore: score(d.awayTeam),
    round: d.matchWeek ? `Matchweek ${d.matchWeek}` : null,
  };
}

export async function fetchPremierLeague(now) {
  const season = plSeason(now);
  let current = 1;
  try {
    const gw = await getJSON('https://resources.premierleague.com/premierleague25/config/current-gameweek.json', PL_HEADERS);
    if (gw?.matchweek) current = gw.matchweek;
  } catch (e) {
    console.warn('PL: could not read current matchweek, scanning from 1:', e.message);
  }
  const weeks = [];
  for (let w = Math.max(1, current - 1); w <= Math.min(38, current + 3); w++) weeks.push(w);
  const all = [];
  for (const w of weeks) {
    const url = `https://sdp-prem-prod.premier-league-prod.pulselive.com/api/v2/matches?competition=8&season=${season}&matchweek=${w}&_limit=50`;
    const j = await getJSON(url, PL_HEADERS);
    for (const d of j.data || []) {
      const m = mapPlMatch(d);
      if (m) all.push(m);
    }
  }
  return all;
}

/**
 * Is this channel a UK one? The Premier League feed answers with the broadcasters for the
 * country the request comes from (GitHub's servers are in the US), so US channels such as
 * NBC or Peacock must be thrown away. Each channel says which countries it covers.
 */
export function isUkChannel(c) {
  const countries = [
    ...(c.info?.broadcaster?.restrictedCountries || []),
    ...(c.restrictedCountries || []),
  ];
  const regions = [...(c.restrictedRegions || []), ...(c.info?.broadcaster?.restrictedRegions || [])].map(r => r?.name);
  if (countries.length || regions.length) return countries.includes('GB') || regions.includes('UK') || regions.includes('England');
  // No country info: only trust names that are clearly UK broadcasters.
  return /^(sky|tnt|amazon|prime video|bbc|itv|channel 4)/i.test(c.info?.name || '');
}

/** Official PL broadcaster per match: { [matchId]: ['Sky Sports', ...] } (UK video channels only). */
export function mapPlBroadcasts(content) {
  const out = {};
  for (const ev of content || []) {
    const id = String(ev?.contentReference?.id ?? '');
    if (!id) continue;
    const names = (ev.channels || [])
      .filter(c => (c.info?.channelTypes || []).some(t => t.mediaType === 'VIDEO'))
      .filter(isUkChannel)
      .map(c => c.info?.name)
      .filter(Boolean);
    out[id] = [...new Set(names)];
  }
  return out;
}

export async function fetchPlBroadcasts(ids) {
  const out = {};
  for (let i = 0; i < ids.length; i += 20) {
    const chunk = ids.slice(i, i + 20);
    const url = `https://api.premierleague.com/broadcasting/match-events?sportDataId=${chunk.join(',')}&pageSize=50`;
    const j = await getJSON(url, PL_HEADERS);
    Object.assign(out, mapPlBroadcasts(j.content));
  }
  return out;
}

// ------------------------------------------ Champions / Europa League (official)

const UEFA_STATUS = { UPCOMING: 'upcoming', LIVE: 'live', FINISHED: 'finished', POSTPONED: 'postponed', CANCELLED: 'postponed', ABANDONED: 'postponed' };

export function mapUefaMatch(m, comp = 'UCL') {
  const iso = m?.kickOffTime?.dateTime;
  if (!iso) return null;
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return null;
  const name = (t) => t?.translations?.displayName?.EN || t?.internationalName;
  const total = m.score?.total;
  return {
    id: `${comp.toLowerCase()}-${m.id}`,
    sourceId: String(m.id),
    comp,
    kickoff: new Date(ts).toISOString(),
    home: m.homeTeam?.internationalName || name(m.homeTeam),
    away: m.awayTeam?.internationalName || name(m.awayTeam),
    homeAlt: m.homeTeam?.translations?.displayOfficialName?.EN || null,
    awayAlt: m.awayTeam?.translations?.displayOfficialName?.EN || null,
    homeShort: name(m.homeTeam),
    awayShort: name(m.awayTeam),
    venue: m.stadium?.translations?.name?.EN || null,
    status: UEFA_STATUS[m.status] || 'upcoming',
    homeScore: typeof total?.home === 'number' ? total.home : null,
    awayScore: typeof total?.away === 'number' ? total.away : null,
    round: m.round?.translations?.name?.EN || null,
    placeholder: !!(m.homeTeam?.isPlaceHolder || m.awayTeam?.isPlaceHolder),
  };
}

const UEFA_COMPETITION = { UCL: 1, UEL: 14 };

export async function fetchUefa(now, daysAhead, comp = 'UCL') {
  const from = ukDate(now - 86400000);
  const to = ukDate(now + (daysAhead + 1) * 86400000);
  const url = `https://match.uefa.com/v5/matches?competitionId=${UEFA_COMPETITION[comp]}&fromDate=${from}&toDate=${to}&order=ASC&offset=0&limit=100`;
  const j = await getJSON(url, UEFA_HEADERS);
  return (Array.isArray(j) ? j : j.data || []).map(m => mapUefaMatch(m, comp)).filter(Boolean);
}

export const fetchChampionsLeague = (now, daysAhead) => fetchUefa(now, daysAhead, 'UCL');

// ------------------------------------------------ TV guide (Sky EPG) matching

/** "Live UEL: Lyon v Crystal Palace" -> ['Lyon', 'Crystal Palace']; null if the title isn't a match. */
export function guideTeams(title) {
  const t = String(title || '').replace(/^live\b[:\s-]*/i, '');
  const part = t.includes(':') ? t.slice(t.lastIndexOf(':') + 1) : t;
  const m = /^\s*(.+?)\s+v\s+(.+?)\s*$/i.exec(part);
  return m ? [m[1], m[2]] : null;
}

/**
 * Live programmes showing this match: on air at kick-off (or starting up to 2h before it) on a
 * football channel, with both team names in the title (fuzzy, so "Oxford Utd" = "Oxford United").
 */
export function guideProgrammesFor(match, programmes, sids) {
  const ko = Date.parse(match.kickoff);
  const names = (side) => [match[side], match[`${side}Short`], match[`${side}Alt`]].filter(Boolean);
  return programmes.filter(p => {
    if (!p.live || !sids.includes(p.sid)) return false;
    if (!(p.start <= ko + 15 * 60000 && p.end > ko + 15 * 60000 && p.start >= ko - 2 * 3600000)) return false;
    const teams = guideTeams(p.title);
    if (!teams) return false;
    const sim = (side, name) => Math.max(...names(side).map(n => teamSim(n, name)));
    return sim('home', teams[0]) >= 0.5 && sim('away', teams[1]) >= 0.5;
  });
}

// ---------------------------------------------- TV listings (live-footballontv)

const MONTHS = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };

function decodeEntities(s) {
  return String(s)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#0?39;|&apos;|&rsquo;/g, "'")
    .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/\s+/g, ' ').trim();
}

/** Parse a live-footballontv.com listing page into [{date, time, home, away, competition, channels}]. */
export function parseListings(html) {
  const out = [];
  const marker = /<div class="fixture-date">([\s\S]*?)<\/div>|<div class="fixture">/g;
  const marks = [];
  let m;
  while ((m = marker.exec(html))) marks.push({ index: m.index, end: marker.lastIndex, date: m[1] });
  let currentDate = null;
  for (let i = 0; i < marks.length; i++) {
    const mk = marks[i];
    if (mk.date !== undefined) {
      const t = decodeEntities(mk.date);
      const dm = /(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{4})/.exec(t);
      currentDate = dm && MONTHS[dm[2].toLowerCase()]
        ? `${dm[3]}-${String(MONTHS[dm[2].toLowerCase()]).padStart(2, '0')}-${dm[1].padStart(2, '0')}`
        : null;
      continue;
    }
    if (!currentDate) continue;
    const block = html.slice(mk.end, i + 1 < marks.length ? marks[i + 1].index : mk.end + 4000);
    const pick = (cls) => {
      const r = new RegExp(`class="${cls}"[^>]*>([\\s\\S]*?)</div>`).exec(block);
      return r ? decodeEntities(r[1]) : '';
    };
    const teams = pick('fixture__teams');
    const parts = teams.split(/\s+v\s+/i);
    if (parts.length !== 2) continue;
    const time = pick('fixture__time');
    const channels = [...block.matchAll(/class="channel-pill"[^>]*>([\s\S]*?)<\/span>/g)].map(x => decodeEntities(x[1])).filter(Boolean);
    out.push({
      date: currentDate,
      time: /^\d{1,2}:\d{2}$/.test(time) ? time.padStart(5, '0') : null,
      home: parts[0].trim(),
      away: parts[1].trim(),
      competition: pick('fixture__competition'),
      channels,
    });
  }
  return out;
}

export async function fetchListings() {
  const base = 'https://www.live-footballontv.com';
  const [pl, ucl] = await Promise.allSettled([
    getText(`${base}/live-premier-league-football-on-tv.html`),
    getText(`${base}/live-champions-league-football-on-tv.html`),
  ]);
  const res = { PL: [], UCL: [], errors: [] };
  if (pl.status === 'fulfilled') res.PL = parseListings(pl.value).filter(x => /premier league/i.test(x.competition) || !x.competition);
  else res.errors.push('PL listings: ' + pl.reason.message);
  if (ucl.status === 'fulfilled') res.UCL = parseListings(ucl.value).filter(x => /champions league/i.test(x.competition) || !x.competition);
  else res.errors.push('UCL listings: ' + ucl.reason.message);
  return res;
}

// ------------------------------------------------------------------- merge

/** Find the listing that corresponds to an official match (same UK date, best team-name match). */
export function findListing(match, listings) {
  const ts = Date.parse(match.kickoff);
  const date = ukDate(ts);
  const time = ukHHMM(ts);
  let best = null, bestScore = 0;
  for (const l of listings) {
    if (l.date !== date) continue;
    const h = Math.max(teamSim(match.home, l.home), teamSim(match.homeShort, l.home), teamSim(match.homeAlt, l.home));
    const a = Math.max(teamSim(match.away, l.away), teamSim(match.awayShort, l.away), teamSim(match.awayAlt, l.away));
    if (h < 0.5 || a < 0.5) continue;
    const score = h + a + (l.time === time ? 0.25 : 0);
    if (score > bestScore) { best = l; bestScore = score; }
  }
  return best;
}

const TBC_RE = /\bTBC\b|\bTBA\b/i;

/** Which broadcaster family a channel name belongs to. */
export function brandOf(channel) {
  const c = channel.toLowerCase();
  if (c.includes('sky')) return 'Sky Sports';
  if (c.includes('tnt') || c.includes('hbo max') || c.includes('discovery+')) return 'TNT Sports';
  if (c.includes('amazon') || c.includes('prime video')) return 'Amazon Prime Video';
  if (c.includes('bbc')) return 'BBC';
  if (c.includes('itv')) return 'ITV';
  if (c.includes('channel 4')) return 'Channel 4';
  if (c.includes('paramount')) return 'Paramount+';
  return channel;
}

/** Order channels so the most useful one comes first; drop pure duplicates/extras. */
export function tidyChannels(channels) {
  const clean = [...new Set(channels.map(c => c.trim()).filter(c => c && !TBC_RE.test(c)))];
  const rank = (c) => {
    const l = c.toLowerCase();
    if (/ultra hdr|ultimate|hbo max|discovery\+|sky go|now\b|app/.test(l)) return 3; // alternative ways to watch
    if (/main event/.test(l)) return 0;
    return 1;
  };
  return clean.sort((a, b) => rank(a) - rank(b));
}

export function resolveTv(match, officialBrands, listing) {
  const ts = Date.parse(match.kickoff);
  const listed = listing ? tidyChannels(listing.channels) : [];
  const listingTbc = listing ? listing.channels.some(c => TBC_RE.test(c)) : false;
  const official = (officialBrands || []).map(brandOf);
  const tv = { broadcaster: null, channels: [], alsoOn: [], confirmed: false, note: null, conflict: false, sources: [] };

  if (official.length) { tv.broadcaster = official[0]; tv.sources.push('official'); }

  if (listed.length) {
    const primary = listed.filter(c => !/ultra hdr|ultimate|hbo max|discovery\+/i.test(c));
    tv.channels = primary.length ? primary : listed.slice(0, 1);
    tv.alsoOn = listed.filter(c => !tv.channels.includes(c));
    const listedBrand = brandOf(tv.channels[0]);
    if (!tv.broadcaster) tv.broadcaster = listedBrand;
    else if (official.length && !official.includes(listedBrand)) tv.conflict = true;
    tv.sources.push('listings');
    tv.confirmed = !tv.conflict;
  } else if (listingTbc && !tv.broadcaster) {
    tv.broadcaster = brandOf(listing.channels.find(c => TBC_RE.test(c)).replace(TBC_RE, '').trim()) || null;
  }

  if (!tv.broadcaster && !tv.channels.length) {
    const p = londonParts(ts);
    const isSat3pm = ukWeekday(ts) === 'Sat' && p.hh === 15 && p.mm === 0;
    if (match.comp === 'PL' && isSat3pm) tv.note = 'Not shown live on UK TV';
    else tv.note = 'TV channel to be confirmed';
  } else if (!tv.channels.length) {
    tv.note = 'Exact channel to be confirmed';
  }
  return tv;
}
