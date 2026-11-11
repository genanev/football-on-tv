// Promo codes (George, 5 and 11 Nov 2026): a Cloudflare Worker that checks a code typed into the app
// and, if it's good, tells RevenueCat to give that phone full access for the code's length.
//
// Codes are free and never sold; they're shareable (one code posted on a forum, say), so each has an
// end date and a maximum number of uses, and works once per phone. The phone is known only by
// RevenueCat's anonymous ID: no name, no email. This is the only server of ours the app talks to,
// and it exists because the RevenueCat key that grants access must never be in the app.
//
// The codes live in Cloudflare's key-value store (the CODES binding), so George can add one or switch
// one off in the dashboard without deploying anything (cloud/SETUP.md):
//   code:FORUM3        {"days": 90, "ends": "2027-01-31", "max": 500}     ("off": true switches it off)
//   uses:FORUM3        how many phones have used it
//   used:FORUM3:<id>   this phone has used it (kept until the access ends)
// Counting isn't exact when two phones redeem in the same second (the store has no locks), so a code
// can go a few over its maximum. That's fine for a promotion.
//
// Settings: RC_SECRET (a secret: RevenueCat's secret API key), ENTITLEMENT (what a code unlocks).

const DAY = 86400000;
const RC_API = 'https://api.revenuecat.com/v1';

// Answers { ok: true, until } or { ok: false, reason }: 'unknown' (no such code, or switched off),
// 'ended', 'full', 'used', or 'error' (try again later).
export async function redeem({ code, id }, env, now = Date.now(), fetcher = fetch) {
  const name = String(code || '').trim().toUpperCase();
  // Codes are letters and digits; the ID is RevenueCat's ("$RCAnonymousID:" and 32 hex digits)
  if (!/^[A-Z0-9]{3,20}$/.test(name) || !/^[\w$:.-]{8,100}$/.test(String(id || ''))) return { ok: false, reason: 'unknown' };
  const promo = await env.CODES.get(`code:${name}`, 'json');
  if (!promo || promo.off || !(promo.days > 0)) return { ok: false, reason: 'unknown' };
  // Good until the end of its last day, UK time or near enough
  if (promo.ends && now > Date.parse(`${promo.ends}T23:59:59Z`)) return { ok: false, reason: 'ended' };
  if (await env.CODES.get(`used:${name}:${id}`)) return { ok: false, reason: 'used' };
  const uses = +(await env.CODES.get(`uses:${name}`)) || 0;
  if (promo.max && uses >= promo.max) return { ok: false, reason: 'full' };

  const until = now + promo.days * DAY;
  const res = await fetcher(`${RC_API}/subscribers/${encodeURIComponent(id)}/entitlements/${encodeURIComponent(env.ENTITLEMENT)}/promotional`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RC_SECRET}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ end_time_ms: until }),
  });
  // Nothing is counted unless the access was really given
  if (!res.ok) {
    console.log(`RevenueCat refused ${name}: HTTP ${res.status}`);
    return { ok: false, reason: 'error' };
  }
  await env.CODES.put(`uses:${name}`, String(uses + 1));
  // Forgotten a little after the access ends: the phone could then use the code again, if it's still running
  await env.CODES.put(`used:${name}:${id}`, new Date(now).toISOString(), { expirationTtl: Math.ceil((promo.days + 1) * DAY / 1000) });
  return { ok: true, until };
}

// The app's pages are served from inside the app (https://localhost), so any origin may ask
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS } });

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (request.method !== 'POST' || new URL(request.url).pathname !== '/redeem') return json({ ok: false, reason: 'error' }, 404);
    let body;
    try { body = await request.json(); } catch (e) { return json({ ok: false, reason: 'unknown' }, 400); }
    try {
      return json(await redeem(body || {}, env));
    } catch (e) {
      console.log(`redeem failed: ${e.message}`);
      return json({ ok: false, reason: 'error' }, 500);
    }
  },
};
