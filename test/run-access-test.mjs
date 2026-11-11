// Offline test of subscriptions' rules (11 Nov 2026): who sees what (access.js: the free period, the
// free version's weekly sport, subscribers and promo codes) and the promo code server
// (cloud/codes-worker/worker.mjs, with a pretend key-value store and a pretend RevenueCat).
//
// Run: node test/run-access-test.mjs

import assert from 'node:assert/strict';
import '../access.js';
import worker, { redeem } from '../cloud/codes-worker/worker.mjs';
import { APP_SETTINGS } from '../scripts/app-settings.mjs';

const A = globalThis.tellyAccess;
const DAY = 86400000;
const T0 = Date.parse('2026-11-11T12:00:00Z');
const acc = (over = {}) => ({ start: T0, days: null, sport: null, sportAt: null, ...over });

// --- The free period ---
let s = A.stage(acc(), null, T0);
assert.equal(s.stage, 'trial');
assert.equal(s.full, true);
assert.equal(s.daysLeft, 30, 'a month when the listings give no length');
assert.equal(s.ending, false);
s = A.stage(acc(), null, T0 + 26.5 * DAY);
assert.equal(s.daysLeft, 4);
assert.equal(s.ending, false);
s = A.stage(acc(), null, T0 + 27 * DAY);
assert.equal(s.daysLeft, 3);
assert.equal(s.ending, true, 'the note starts 3 days before the end');
assert.equal(A.stage(acc(), null, T0 + 30 * DAY - 1).stage, 'trial', 'the last moment of the month');
assert.equal(A.stage(acc(), null, T0 + 30 * DAY - 1).daysLeft, 1);
assert.equal(A.stage(acc(), null, T0 + 30 * DAY).stage, 'free', 'the month is over');
// The length the phone started with (3 months, George's fallback) is the one that counts
assert.equal(A.stage(acc({ days: 90 }), null, T0 + 60 * DAY).stage, 'trial');
assert.equal(A.stage(acc({ days: 90 }), null, T0 + 60 * DAY).daysLeft, 30);
assert.equal(A.stage(acc({ days: 90 }), null, T0 + 90 * DAY).stage, 'free');
assert.equal(A.freeName(30), 'free month');
assert.equal(A.freeName(null), 'free month');
assert.equal(A.freeName(90), 'free 3 months');

// --- The clock: never earlier than the newest listings seen ---
assert.equal(A.clock(T0, 0), T0);
assert.equal(A.clock(T0 - 40 * DAY, T0), T0, 'the phone’s clock turned back doesn’t stretch the month');
assert.equal(A.clock(T0 + 5 * DAY, T0), T0 + 5 * DAY, 'offline for five days: the phone’s clock');

// --- The free version ---
const over = T0 + 31 * DAY;
s = A.stage(acc(), null, over);
assert.deepEqual([s.stage, s.full, s.sport, s.needPick, s.askWeek], ['free', false, null, true, false]);
s = A.stage(acc({ sport: 'football', sportAt: over }), null, over + 6.9 * DAY);
assert.deepEqual([s.sport, s.needPick, s.askWeek], ['football', false, false], 'no changing mid-week');
assert.equal(s.changeOn, over + 7 * DAY);
s = A.stage(acc({ sport: 'football', sportAt: over }), null, over + 7 * DAY);
assert.equal(s.askWeek, true, 'a week later: keep it or pick another');
assert.equal(s.sport, 'football', 'and it stays until answered');

// --- Subscribers and promo codes ---
const sub = { active: true, expires: over + 300 * DAY, willRenew: true, source: 'store' };
s = A.stage(acc(), sub, over);
assert.deepEqual([s.stage, s.full, s.until, s.willRenew], ['sub', true, sub.expires, true]);
assert.equal(A.stage(acc(), sub, T0).stage, 'sub', 'subscribing during the free period');
// Offline on renewal day: trusted for 3 more days, then the free version until the store answers
assert.equal(A.stage(acc(), sub, sub.expires + 2 * DAY).stage, 'sub');
assert.equal(A.stage(acc(), sub, sub.expires + 3 * DAY).stage, 'free');
// Cancelled: ends on the day paid up to
assert.equal(A.stage(acc(), { ...sub, willRenew: false }, sub.expires - 1).stage, 'sub');
assert.equal(A.stage(acc(), { ...sub, willRenew: false }, sub.expires).stage, 'free', 'a lapsed subscription drops to the free version');
assert.equal(A.stage(acc(), { active: false }, over).stage, 'free');
const promo = { active: true, expires: T0 + 90 * DAY, willRenew: false, source: 'promo' };
assert.equal(A.stage(acc(), promo, T0 + 89 * DAY).stage, 'promo', 'a code gives 3 months in place of the 1');
assert.equal(A.stage(acc(), promo, T0 + 90 * DAY).stage, 'free');
assert.equal(A.stage(acc({ start: T0 + 80 * DAY }), promo, T0 + 90 * DAY).stage, 'trial', 'a newer free period still counts');

// --- What the listings carry ---
assert.equal(APP_SETTINGS.freeDays > 0, true);
assert.equal(typeof APP_SETTINGS.promoCodes, 'boolean');
assert.equal(typeof APP_SETTINGS.testTools, 'boolean');

// --- The promo code server ---
const ID = '$RCAnonymousID:0123456789abcdef0123456789abcdef';
function fakeEnv(codes) {
  const store = new Map(Object.entries(codes).map(([k, v]) => [k, JSON.stringify(v)]));
  const puts = [];
  return {
    ENTITLEMENT: 'full_access', RC_SECRET: 'sk_test',
    CODES: {
      get: async (key, type) => (store.has(key) ? (type === 'json' ? JSON.parse(store.get(key)) : store.get(key)) : null),
      put: async (key, value, opts) => { store.set(key, value); puts.push({ key, value, opts }); },
    },
    store, puts,
  };
}
const calls = [];
const rcOk = async (url, init) => { calls.push({ url, init }); return new Response('{}', { status: 201 }); };
const rcDown = async () => new Response('{}', { status: 500 });

let env = fakeEnv({ 'code:FORUM3': { days: 90, ends: '2027-01-31', max: 2 } });
let r = await redeem({ code: ' forum3 ', id: ID }, env, T0, rcOk);
assert.deepEqual(r, { ok: true, until: T0 + 90 * DAY }, 'typed in lower case with spaces');
assert.equal(calls.length, 1);
assert.equal(calls[0].url, `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(ID)}/entitlements/full_access/promotional`);
assert.equal(calls[0].init.method, 'POST');
assert.equal(calls[0].init.headers.Authorization, 'Bearer sk_test');
assert.deepEqual(JSON.parse(calls[0].init.body), { end_time_ms: T0 + 90 * DAY });
assert.equal(env.store.get('uses:FORUM3'), '1');
assert.equal(env.puts.find(p => p.key === `used:FORUM3:${ID}`).opts.expirationTtl, 91 * 86400, 'forgotten a day after the access ends');
// Once per phone
assert.deepEqual(await redeem({ code: 'FORUM3', id: ID }, env, T0 + DAY, rcOk), { ok: false, reason: 'used' });
assert.equal(calls.length, 1);
// Its maximum number of uses
assert.equal((await redeem({ code: 'FORUM3', id: ID.replace(/f$/, '0') }, env, T0, rcOk)).ok, true);
assert.deepEqual(await redeem({ code: 'FORUM3', id: ID.replace(/f$/, '1') }, env, T0, rcOk), { ok: false, reason: 'full' });
// Its end date: good on the last day, not after
env = fakeEnv({ 'code:FORUM3': { days: 90, ends: '2027-01-31', max: 2 }, 'code:OFF': { days: 90, off: true }, 'code:OPEN': { days: 30 } });
assert.equal((await redeem({ code: 'FORUM3', id: ID }, env, Date.parse('2027-01-31T22:00:00Z'), rcOk)).ok, true);
assert.deepEqual(await redeem({ code: 'FORUM3', id: ID.replace(/f$/, '0') }, env, Date.parse('2027-02-01T00:00:00Z'), rcOk), { ok: false, reason: 'ended' });
// Unknown, switched off, or not a code at all
assert.deepEqual(await redeem({ code: 'NOPE', id: ID }, env, T0, rcOk), { ok: false, reason: 'unknown' });
assert.deepEqual(await redeem({ code: 'OFF', id: ID }, env, T0, rcOk), { ok: false, reason: 'unknown' });
assert.deepEqual(await redeem({ code: 'a b; drop', id: ID }, env, T0, rcOk), { ok: false, reason: 'unknown' });
assert.deepEqual(await redeem({ code: 'OPEN', id: 'x' }, env, T0, rcOk), { ok: false, reason: 'unknown' });
assert.deepEqual(await redeem({}, env, T0, rcOk), { ok: false, reason: 'unknown' });
// No end date and no maximum
assert.equal((await redeem({ code: 'OPEN', id: ID }, env, T0, rcOk)).ok, true);
// RevenueCat down: nothing is counted, so the person can try again
env = fakeEnv({ 'code:FORUM3': { days: 90 } });
assert.deepEqual(await redeem({ code: 'FORUM3', id: ID }, env, T0, rcDown), { ok: false, reason: 'error' });
assert.equal(env.store.has('uses:FORUM3'), false);
assert.equal((await redeem({ code: 'FORUM3', id: ID }, env, T0, rcOk)).ok, true);

// The web side: only POST /redeem, and the app (served from inside itself) may read the answer
let res = await worker.fetch(new Request('https://codes.tellyfixtures.co.uk/redeem', { method: 'OPTIONS' }), env);
assert.equal(res.status, 204);
assert.equal(res.headers.get('Access-Control-Allow-Origin'), '*');
res = await worker.fetch(new Request('https://codes.tellyfixtures.co.uk/'), env);
assert.equal(res.status, 404);
res = await worker.fetch(new Request('https://codes.tellyfixtures.co.uk/redeem', { method: 'POST', body: 'not json' }), env);
assert.equal(res.status, 400);
res = await worker.fetch(new Request('https://codes.tellyfixtures.co.uk/redeem', { method: 'POST', body: JSON.stringify({ code: 'NOPE', id: ID }) }), env);
assert.equal(res.status, 200);
assert.deepEqual(await res.json(), { ok: false, reason: 'unknown' });
assert.equal(res.headers.get('Access-Control-Allow-Origin'), '*');

console.log('Access rules and promo code server: all tests passed');
