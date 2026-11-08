// GitHub's back-up check of the listings (.github/workflows/watch.yml; the rules are in watch-check.mjs).
// A failed run makes GitHub email George ("Run failed: Listings alert"). GitHub runs schedules when it
// can: in its first 12 hours (8 Nov 2026) it ran once instead of hourly, so the dependable alert is the
// Cloudflare one (cloud/watch-worker/); this one still helps if Cloudflare's own alert ever stops.
//
//   node scripts/watch.mjs [url]

import { appendFile } from 'node:fs/promises';
import { DATA_URL, checkListings } from './watch-check.mjs';

const url = process.argv[2] || DATA_URL;
const { found } = await checkListings(url);
const summary = found.length ? found.map(p => `- ${p}`).join('\n') : 'All sources answered on the latest updates.';
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `## Telly Fixtures listings\n\n${summary}\n`);
// Each one as an error note on the run's page; a failed run is what makes GitHub send the email
for (const p of found) console.log(`::error::${p}`);
if (found.length) process.exit(1);
