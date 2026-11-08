// The listings watcher (George, 8 Nov 2026): runs every hour on GitHub (.github/workflows/watch.yml),
// separately from the London job, and reads the listings file the phone app reads. It fails, so GitHub
// emails George ("Run failed: Listings alert"), when
//   - the file can't be read, or is more than 2 hours old (the London job has stopped, or the upload to
//     the own domain is failing), or
//   - a source has failed on two updates in a row (`failingSince`, written by build.mjs). A one-off
//     failure, such as a 429 from a busy server, is cleared by the next update, so it stays quiet.
// The app shows no banner for a failed source any more; this is how George hears about it.
//
//   node scripts/watch.mjs [url]

export const DATA_URL = 'https://data.tellyfixtures.co.uk/data.json';
export const MAX_AGE_MINUTES = 120;
// Updates are 30 minutes apart: failing since an earlier update = failed on two in a row
export const REPEAT_MINUTES = 20;

const NAMES = {
  tvGuide: 'Sky TV guide', skyListings: "Sky Sports' listings", tntSchedule: "TNT Sports' schedule",
  primeVideo: "Prime Video's Champions League page", premierSports: "Premier Sports' fixtures page",
  apiFootball: 'API-Football', premierLeague: 'Premier League fixtures', championsLeague: 'Champions League fixtures',
  europaLeague: 'Europa League fixtures', conferenceLeague: 'Conference League fixtures', wsl: 'WSL fixtures',
  scottishPremiership: 'Scottish Premiership fixtures', efl: 'Championship and League Cup fixtures',
  faCup: 'FA Cup ties', faPage: "The FA's fixtures page", premierLeagueTv: "The Premier League's broadcaster feed",
  formula1: 'Formula 1', formula2: 'Formula 2', formula3: 'Formula 3', motogp: 'MotoGP', darts: 'Darts',
  golf: 'Golf', snooker: 'Snooker', cricket: 'Cricket', skiing: 'Alpine skiing', tennis: 'Tennis',
  rugby: 'Rugby union', curling: 'Curling (Specials)',
};

const ukTime = (iso) => new Date(iso).toLocaleString('en-GB', {
  timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
});

/** What's wrong with this data.json at `now`, in plain words; an empty list when all is well. */
export function problems(data, now = Date.now()) {
  const out = [];
  const generated = Date.parse(data?.generatedAt);
  if (Number.isNaN(generated)) return ['The listings file has no update time.'];
  const age = Math.round((now - generated) / 60000);
  if (age > MAX_AGE_MINUTES) {
    out.push(`The listings haven't been updated for ${Math.floor(age / 60)} h ${age % 60} min (last update ${ukTime(data.generatedAt)}): check the London job, and the upload to data.tellyfixtures.co.uk.`);
  }
  const check = (name, entry) => {
    // A US run's Prime Video or Premier Sports page (wrongRegion) is expected, not a fault
    if (entry?.ok !== false || entry.wrongRegion || !entry.failingSince) return;
    if (generated - Date.parse(entry.failingSince) < REPEAT_MINUTES * 60000) return;
    out.push(`${name} has failed since ${ukTime(entry.failingSince)}: ${entry.error || 'no details'}`);
  };
  const report = data.report || {};
  for (const [key, entry] of Object.entries(report)) check(NAMES[key] || key, entry);
  for (const [key, entry] of Object.entries(report.goldenCheck || {})) check(`The daily check's ${NAMES[key] || key} feed`, entry);
  return out;
}

const isMain = process.argv[1]?.endsWith('watch.mjs');
if (isMain) {
  const url = process.argv[2] || DATA_URL;
  let found;
  try {
    // A changing query string, so no cached copy is read
    const r = await fetch(`${url}?watch=${Date.now()}`, { headers: { 'Cache-Control': 'no-cache' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    found = problems(await r.json());
  } catch (e) {
    found = [`The listings file couldn't be read from ${url}: ${e.message}`];
  }
  const summary = found.length ? found.map(p => `- ${p}`).join('\n') : 'All sources answered on the latest updates.';
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) {
    const { appendFile } = await import('node:fs/promises');
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `## Telly Fixtures listings\n\n${summary}\n`);
  }
  // Each one as an error note on the run's page; a failed run is what makes GitHub send the email
  for (const p of found) console.log(`::error::${p}`);
  if (found.length) process.exit(1);
}
