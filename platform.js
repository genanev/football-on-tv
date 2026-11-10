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
};
