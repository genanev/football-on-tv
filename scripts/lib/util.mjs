// Shared helpers: UK time conversion and HTTP fetching.

export const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

// ---------------------------------------------------------------- time helpers

const londonFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

export function londonParts(ts) {
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

export function ukHHMM(ts) {
  const p = londonParts(ts);
  return `${String(p.hh).padStart(2, '0')}:${String(p.mm).padStart(2, '0')}`;
}

export function ukWeekday(ts) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'short' }).format(new Date(ts));
}

/** UK midnight at the start of the given UK date ("YYYY-MM-DD"). */
export function ukMidnight(date) {
  const [y, m, d] = date.split('-').map(Number);
  return ukToUtc(y, m, d, 0, 0);
}

/** Parse local time + offset, e.g. ("2026-09-24T12:30:00", "+04:00") -> UTC timestamp. */
export function parseWithOffset(local, offset) {
  const ts = Date.parse(`${local}${/^[+-]\d{2}:\d{2}$/.test(offset || '') ? offset : 'Z'}`);
  return Number.isNaN(ts) ? null : ts;
}

// ------------------------------------------------------------------- fetch

export async function getJSON(url, headers = {}) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json', ...headers } });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return r.json();
}

export async function getText(url, headers = {}) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html', 'Accept-Language': 'en-GB,en;q=0.9', ...headers } });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return r.text();
}
