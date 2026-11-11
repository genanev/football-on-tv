// Settings the phone app reads from the listings (data.json's `app`), so they can change without a
// new version of the app going through Google's review. A change here is live on the next update
// after it's merged.

export const APP_SETTINGS = {
  // The free period of full access for a phone that opens the app for the first time, in days. A
  // phone keeps the length it started with, so changing this only affects new installs.
  // George, 11 Nov 2026: 30 to start with; 90 if Google objects to the promo code box (and on the
  // iPhone, which can't have one), until there are enough users, then back to 30.
  freeDays: 30,
  // The "Enter a promo code" box in Settings. false hides it (the off-switch in case Google objects).
  promoCodes: true,
  // The testers' tools in Settings, which jump to the end of the free period and so on: a 14-day
  // closed test never gets there by itself. Set to false before the app is public.
  testTools: true,
};
