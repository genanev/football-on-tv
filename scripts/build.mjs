// Builds data.json: Premier League + Champions League fixtures for the next
// few days, with UK kick-off times and UK TV channels.
//
// Sources
//   Premier League schedule   official premierleague.com data feed
//   Premier League TV (brand) official premierleague.com broadcast feed
//   Champions League schedule official uefa.com data feed
//   Exact TV channel          live-footballontv.com listings (cross-reference)
//
// Runs on Node 18+ with no dependencies:  node scripts/build.mjs
// Each source is optional - if one fails, the others still produce output.

import { writeFile } from 'node:fs/promises';

export const DAYS_AHEAD = 8; // a little over 7 so the app still has a full week if an update is missed
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

// ---------------------------------------------------------------- time helpers

const londonFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

function londonParts(ts) {
  const p = Object.fromEntries(londonFmt.formatToParts(new Date(ts)).map(x => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, hh: +p.hour, mm: +p.minute, ss: +p.second };
}

/** Offset of London from UTC (ms) at a given instant. */
function londonOffset(ts) {
  const p = londonParts(ts);
  return Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm, p.ss) - Math.floor(ts / 1000) * 1000;
}

/** Convert a UK wall-clock time to a UTC timestamp (handles BST/GMT). */
export function ukToUtc(y, m, d, hh = 0, mm = 0) {
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  let ts = guess - londonOffset(guess);
  ts = guess - londonOffset(ts); // second pass settles DST-boundary cases
  return ts;
}

/** UK calendar date (YYYY-MM-DD) for an instant. */
export function ukDate(ts) {
  const p = londonParts(ts);
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}

function ukHHMM(ts) {
  const p = londonParts(ts);
  return `${String(p.hh).padStart(2, '0')}:${String(p.mm).padStart(2, '0')}`;
}

function ukWeekday(ts) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'short' }).format(new Date(ts));
}

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

// ------------------------------------------------------------------- fetch

async function getJSON(url, headers = {}) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json', ...headers } });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return r.json();
}

async function getText(url, headers = {}) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html', 'Accept-Language': 'en-GB,en;q=0.9', ...headers } });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return r.text();
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

async function fetchPremierLeague(now) {
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

/** Official PL broadcaster per match: { [matchId]: ['Sky Sports', ...] } (UK video channels only). */
export function mapPlBroadcasts(content) {
  const out = {};
  for (const ev of content || []) {
    const id = String(ev?.contentReference?.id ?? '');
    if (!id) continue;
    const names = (ev.channels || [])
      .filter(c => (c.info?.channelTypes || []).some(t => t.mediaType === 'VIDEO'))
      .map(c => c.info?.name)
      .filter(Boolean);
    out[id] = [...new Set(names)];
  }
  return out;
}

async function fetchPlBroadcasts(ids) {
  const out = {};
  for (let i = 0; i < ids.length; i += 20) {
    const chunk = ids.slice(i, i + 20);
    const url = `https://api.premierleague.com/broadcasting/match-events?sportDataId=${chunk.join(',')}&pageSize=50`;
    const j = await getJSON(url, PL_HEADERS);
    Object.assign(out, mapPlBroadcasts(j.content));
  }
  return out;
}

// -------------------------------------------------- Champions League (official)

const UEFA_STATUS = { UPCOMING: 'upcoming', LIVE: 'live', FINISHED: 'finished', POSTPONED: 'postponed', CANCELLED: 'postponed', ABANDONED: 'postponed' };

export function mapUefaMatch(m) {
  const iso = m?.kickOffTime?.dateTime;
  if (!iso) return null;
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return null;
  const name = (t) => t?.translations?.displayName?.EN || t?.internationalName;
  const total = m.score?.total;
  return {
    id: `ucl-${m.id}`,
    sourceId: String(m.id),
    comp: 'UCL',
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

async function fetchChampionsLeague(now) {
  const from = ukDate(now - 86400000);
  const to = ukDate(now + (DAYS_AHEAD + 1) * 86400000);
  const url = `https://match.uefa.com/v5/matches?competitionId=1&fromDate=${from}&toDate=${to}&order=ASC&offset=0&limit=100`;
  const j = await getJSON(url, UEFA_HEADERS);
  return (Array.isArray(j) ? j : j.data || []).map(mapUefaMatch).filter(Boolean);
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

async function fetchListings() {
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
    if (match.comp === 'PL' && isSat3pm) tv.note = 'Not shown live on UK TV (3pm blackout)';
    else tv.note = 'TV channel to be confirmed';
  } else if (!tv.channels.length) {
    tv.note = 'Exact channel to be confirmed';
  }
  return tv;
}

// -------------------------------------------------------------------- main

export async function build(now = Date.now()) {
  const report = {};
  const windowStart = ukToUtc(...ukDate(now).split('-').map(Number), 0, 0);
  const windowEnd = windowStart + (DAYS_AHEAD + 1) * 86400000;
  const inWindow = (m) => { const t = Date.parse(m.kickoff); return t >= windowStart && t < windowEnd; };

  const [plRes, uclRes, listRes] = await Promise.allSettled([fetchPremierLeague(now), fetchChampionsLeague(now), fetchListings()]);

  const pl = plRes.status === 'fulfilled' ? plRes.value.filter(inWindow) : [];
  report.premierLeague = plRes.status === 'fulfilled' ? { ok: true, matches: pl.length } : { ok: false, error: plRes.reason.message };

  const ucl = uclRes.status === 'fulfilled' ? uclRes.value.filter(inWindow) : [];
  report.championsLeague = uclRes.status === 'fulfilled' ? { ok: true, matches: ucl.length } : { ok: false, error: uclRes.reason.message };

  const listings = listRes.status === 'fulfilled' ? listRes.value : { PL: [], UCL: [], errors: [listRes.reason.message] };
  report.tvListings = { ok: !listings.errors.length, premierLeague: listings.PL.length, championsLeague: listings.UCL.length, errors: listings.errors };

  let plTv = {};
  if (pl.length) {
    try {
      plTv = await fetchPlBroadcasts(pl.map(m => m.sourceId));
      report.premierLeagueTv = { ok: true, matches: Object.keys(plTv).length };
    } catch (e) {
      report.premierLeagueTv = { ok: false, error: e.message };
    }
  }

  const matches = [];
  let matched = 0;
  for (const m of [...pl, ...ucl]) {
    const listing = findListing(m, listings[m.comp] || []);
    if (listing) matched++;
    const tv = resolveTv(m, m.comp === 'PL' ? plTv[m.sourceId] : null, listing);
    const { sourceId, homeAlt, awayAlt, ...rest } = m;
    // UEFA uses short international names ("Atleti", "Paris"); the UK listing names read better.
    if (m.comp === 'UCL' && listing) { rest.home = listing.home; rest.away = listing.away; }
    matches.push({ ...rest, tv });
  }
  matches.sort((a, b) => a.kickoff.localeCompare(b.kickoff) || a.comp.localeCompare(b.comp) || a.home.localeCompare(b.home));
  report.crossReferenced = `${matched}/${matches.length}`;

  return { generatedAt: new Date(now).toISOString(), windowDays: DAYS_AHEAD, report, matches };
}

const isMain = import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('build.mjs');
if (isMain) {
  const out = process.argv[2] || 'data.json';
  const data = await build();
  console.log(JSON.stringify(data.report, null, 2));
  const officialOk = data.report.premierLeague.ok || data.report.championsLeague.ok;
  if (!officialOk) {
    console.error('Both official sources failed - keeping the previous data.json');
    process.exit(1);
  }
  await writeFile(out, JSON.stringify(data, null, 1));
  console.log(`Wrote ${data.matches.length} matches to ${out}`);
}
