// The Specials table: every one-off or yearly event the app knows about (George, 5 Nov 2026).
//
// An event stays here all year, but the app only names it while it's in scope: from a week before it
// starts until its last day. Its dates come from its own source (curling.mjs reads World Curling's),
// so next year's edition comes back by itself once the organiser publishes the new dates.
//
// To add an event: a row here, a source module that gives its dates and televised entries, and a line
// passing those dates to specialsInScope in build.mjs. The app needs no change.

export const SPECIALS = [
  { comp: 'SPECIAL_CURLING', name: 'European Curling Championships', tag: 'Curling' },
];

export const SCOPE_DAYS = 7;

const daysBefore = (date, days) => new Date(Date.parse(`${date}T12:00:00Z`) - days * 86400000).toISOString().slice(0, 10);

/**
 * The rows of the table in scope today, for data.json's `specials`: { comp, name, tag, startDate, endDate }.
 * `dated` is what the sources say this update ({ comp, startDate, endDate }). An event whose source
 * failed keeps the dates of the previous update (`previous`, its `specials`), so a failed read doesn't
 * take it off the app while it's on.
 */
export function specialsInScope(dated, today, previous = []) {
  const out = [];
  for (const row of SPECIALS) {
    const dates = dated.find(d => d.comp === row.comp) || previous.find(d => d.comp === row.comp);
    if (!dates || today > dates.endDate || today < daysBefore(dates.startDate, SCOPE_DAYS)) continue;
    out.push({ ...row, startDate: dates.startDate, endDate: dates.endDate });
  }
  return out;
}
