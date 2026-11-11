// The platform layer: the only code that knows whether Telly Fixtures runs in a web browser or as
// the phone app. index.html only calls what's in `window.platform`.
//
// This file is the web version (GitHub Pages and the preview). In the phone app, app/build-web.mjs
// replaces it with app/platform/android.js (plus the Capacitor code that file needs), which has
// the same names. Anything new here needs a phone version there too.
window.platform = {
  // true only in the phone app
  isApp: false,
  // Offline use: the web app keeps its own files on the phone with a service worker (sw.js). The
  // phone app has them built in.
  useServiceWorker: true,
  // The phone's back button. The browser handles back itself, so nothing to do here.
  onBack(handler) {},
  // The colour theme changed ('light' or 'dark'). The browser takes the colour of its bars from the
  // page's theme-color, which index.html sets.
  themeChanged(theme) {},
  // Match reminders are a phone app feature: a website can't notify while it's closed, so the page
  // shows no bells.
  // (`exact` and `askExact`, Android's "Alarms & reminders" permission, are left out on purpose: the
  // page shows nothing about it without them.)
  // A page of the website (About, the policies): a new tab. The phone app opens it over the app.
  openPage(url) { window.open(url, '_blank', 'noopener'); },
  reminders: { supported: false, ask: async () => false, schedule: async () => {}, cancel: async () => {} },
  // Subscriptions are a phone app feature: the website has no store, so everything on it is open.
  // For the preview only, adding ?sub to the address switches on a pretend store, so every stage of
  // the free period, the free version and subscribing can be seen and tried. Nothing is charged or
  // sent anywhere: "subscribing" is remembered in this browser, and the promo code TEST3 is accepted.
  billing: (() => {
    const KEY = 'previewEntitlement';
    const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || { active: false }; } catch (e) { return { active: false }; } };
    const save = (e) => { try { localStorage.setItem(KEY, JSON.stringify(e)); } catch (err) {} return e; };
    return {
      supported: new URLSearchParams(location.search).has('sub'),
      preview: true,
      // The store's name, for "cancel at any time in …"
      store: 'Google Play',
      // Whether this platform may show the promo code box
      codes: true,
      // { active, expires (ms), willRenew, source: 'store' | 'promo' }
      status: async () => read(),
      // The yearly price as the store shows it
      price: async () => '£3.65',
      subscribe: async () => save({ active: true, expires: Date.now() + 365 * 86400000, willRenew: true, source: 'store' }),
      restore: async () => read(),
      // The store's page for cancelling: here it just ends the pretend subscription
      manage() { save({ active: false }); location.reload(); },
      // { ok, reason: 'unknown' | 'ended' | 'full' | 'used' }
      redeem: async (code) => {
        if (code.toUpperCase() !== 'TEST3') return { ok: false, reason: 'unknown' };
        if (read().source === 'promo') return { ok: false, reason: 'used' };
        save({ active: true, expires: Date.now() + 90 * 86400000, willRenew: false, source: 'promo' });
        return { ok: true };
      },
    };
  })(),
};
