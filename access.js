// Who sees what (George, 5 Nov 2026; playStorePlan.md, "Pricing"): a free period of full access
// counted on the phone from the first open, then the free version (one sport, today only, with a
// new choice each week), unless the person subscribes or has redeemed a promo code.
//
// These are the rules only, with no screen and no storage, so test/run-access-test.mjs can check them
// offline. index.html keeps the numbers on the phone and draws the screens; the store is reached
// through platform.billing.
//
// A plain script for the page (it sets `tellyAccess`), which Node can load as it is.
(() => {
  const DAY = 86400000;
  // The free period when the listings don't say (data.json's `app.freeDays`)
  const DEFAULT_DAYS = 30;
  // The free version's sport can be changed once this many days have passed
  const WEEK_DAYS = 7;
  // The in-app note that the free period is ending starts this many days before
  const WARN_DAYS = 3;
  // A subscription that renews is trusted this long past the last date the phone heard of, so a
  // subscriber opening the app without a signal on renewal day isn't locked out
  const GRACE_DAYS = 3;

  // The time used for the rules. The phone's clock, but never earlier than the newest listings the
  // phone has seen (`seen`, a time we set), so turning the clock back doesn't stretch the free period.
  // A clock set forward by mistake isn't remembered: only our own time is.
  const clock = (phoneNow, seen) => Math.max(phoneNow, seen || 0);

  // `acc`: { start, days, sport, sportAt } as kept on the phone. `start` is the first open; `days` the
  // free period's length when this phone first read it (null until then); `sport` and `sportAt` the
  // free version's sport and when it was chosen.
  // `ent`: what the store last said, { active, expires, willRenew, source: 'store' | 'promo' }, or null.
  function stage(acc, ent, now) {
    if (ent && ent.active) {
      const grace = ent.source === 'store' && ent.willRenew ? GRACE_DAYS * DAY : 0;
      if (!ent.expires || now < ent.expires + grace) {
        return { stage: ent.source === 'promo' ? 'promo' : 'sub', full: true, until: ent.expires || null, willRenew: !!ent.willRenew };
      }
    }
    const days = acc.days > 0 ? acc.days : DEFAULT_DAYS;
    const end = acc.start + days * DAY;
    if (now < end) {
      const daysLeft = Math.ceil((end - now) / DAY);
      return { stage: 'trial', full: true, until: end, days, daysLeft, ending: daysLeft <= WARN_DAYS };
    }
    const changeOn = acc.sport && acc.sportAt ? acc.sportAt + WEEK_DAYS * DAY : null;
    return {
      stage: 'free', full: false, days,
      sport: acc.sport || null,
      // No sport chosen yet: ask. A week after the choice: ask whether to keep it.
      needPick: !acc.sport,
      askWeek: !!acc.sport && (!changeOn || now >= changeOn),
      changeOn,
    };
  }

  // What the free period is called: "free month" for a month, "free 3 months" for a longer one
  const freeName = (days) => {
    const d = days > 0 ? days : DEFAULT_DAYS;
    return d <= 31 ? 'free month' : `free ${Math.round(d / 30)} months`;
  };

  globalThis.tellyAccess = { DAY, DEFAULT_DAYS, WEEK_DAYS, WARN_DAYS, GRACE_DAYS, clock, stage, freeName };
})();
