// The listings alert (George, 8 Nov 2026): a Cloudflare Worker that checks the file the phone app reads
// once an hour and emails George when something's wrong (the rules: scripts/watch-check.mjs). It replaced
// GitHub's schedule as the main alert because GitHub ran that once in its first 12 hours.
//
// A silent alert looks the same as a broken one, so a weekly run says "all well". Any run that isn't the
// hourly one always sends its result, which is also how a new deployment is tested (cloud/SETUP.md).
//
// Sending only to an address verified in Cloudflare's Email Routing is free on every plan. The address
// is the secret ALERT_TO, as this repository is public.

import { checkListings, ukTime } from '../../scripts/watch-check.mjs';

export const HOURLY = '20 * * * *';
const FROM = 'alerts@tellyfixtures.co.uk';

export async function runCheck(env, cron, now = Date.now()) {
  const { data, found } = await checkListings(undefined, now);
  if (!found.length && cron === HOURLY) return 'all well, no email';
  const subject = found.length
    ? `Telly Fixtures alert: ${found.length === 1 ? 'a problem' : `${found.length} problems`} with the listings`
    : 'Telly Fixtures: all well (weekly check)';
  const text = found.length
    ? `${found.map(p => `- ${p}`).join('\n')}\n\nThis alert repeats every hour until the problem clears.`
    : `All sources answered on the latest updates. Last update: ${ukTime(data.generatedAt)}.`;
  await env.EMAIL.send({ to: env.ALERT_TO, from: FROM, subject, text });
  return `sent: ${subject}`;
}

export default {
  async scheduled(controller, env) {
    console.log(await runCheck(env, controller.cron));
  },
};
