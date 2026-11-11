// The platform layer for the Android app: the same names as the web version (../../platform.js).
// build-web.mjs puts this after Capacitor's own code (capacitorExports) and its App plugin
// (capacitorApp) in the app's platform.js.
(() => {
  const { SystemBars, SystemBarsStyle } = capacitorExports;
  const { App } = capacitorApp;
  const { LocalNotifications } = capacitorLocalNotifications;
  const { Browser } = capacitorBrowser;

  // Subscriptions go through RevenueCat, which talks to Google Play's billing and remembers who has
  // paid (playStorePlan.md, Phase 3). Its Capacitor plugin (@revenuecat/purchases-capacitor) ships no
  // plain script, only modules for a bundler, and its JavaScript is a thin wrapper, so the plugin's
  // Android code is called directly through Capacitor.
  const Purchases = capacitorExports.registerPlugin('Purchases');
  // RevenueCat's public key for the Android app ("goog_…", from its dashboard: cloud/SETUP.md). It is
  // meant to be in the app, so it can be in this file. While it's empty the app has no store, and
  // everything is open, as before subscriptions.
  const RC_KEY = '';
  // What a subscription or a promo code unlocks, as named in RevenueCat
  const ENTITLEMENT = 'full_access';
  // The promo code server (cloud/codes-worker)
  const CODES_URL = 'https://codes.tellyfixtures.co.uk/redeem';
  const MANAGE_URL = 'https://play.google.com/store/account/subscriptions?sku=annual&package=uk.co.tellyfixtures';
  // No account of ours: RevenueCat gives the phone an anonymous ID, and the Google Play account is
  // what a purchase belongs to
  let configured = null;
  const rc = () => (configured ||= Purchases.configure({ apiKey: RC_KEY }).catch((e) => { configured = null; throw e; }));
  const entitlement = (info) => {
    const e = info && info.entitlements && info.entitlements.active && info.entitlements.active[ENTITLEMENT];
    if (!e) return { active: false };
    const expires = e.expirationDateMillis || (e.expirationDate ? Date.parse(e.expirationDate) : null);
    return { active: true, expires: expires || null, willRenew: !!e.willRenew, source: e.store === 'PROMOTIONAL' ? 'promo' : 'store' };
  };
  // The yearly subscription as RevenueCat offers it (its "current offering")
  const yearly = async () => {
    await rc();
    const now = (await Purchases.getOfferings()).current;
    return (now && (now.annual || (now.availablePackages || [])[0])) || null;
  };

  window.platform = {
    isApp: true,
    // The screens are built into the app, so no service worker is needed to open offline
    useServiceWorker: false,
    // The back button (or back gesture). The handler returns true if it did something (closed a
    // sheet, went back to My TV); otherwise the app goes to the background, as Android apps do
    // on their first screen.
    onBack(handler) {
      App.addListener('backButton', () => { if (!handler()) App.minimizeApp(); });
    },
    // The status bar's and navigation bar's icons: dark on the light theme, light on the dark one
    themeChanged(theme) {
      SystemBars.setStyle({ style: theme === 'dark' ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch(() => {});
    },
    // A page of the website (About, the policies), opened over the app in an in-app browser (Chrome's
    // Custom Tabs): its close button, or back, comes straight back to Telly Fixtures (George, 10 Nov 2026:
    // leaving for the phone's browser felt odd). Its bar takes the app's theme colour.
    openPage(url, theme) {
      Browser.open({ url, toolbarColor: theme === 'dark' ? '#111412' : '#f4f5f2' }).catch(() => window.open(url, '_blank'));
    },
    // Match reminders: the phone keeps them, so they fire with the app closed, offline and after a
    // restart. On time only with Android's "Alarms & reminders" permission (Settings → Apps → Special
    // app access), which Android 14 and later leave off for new installs. Without it a reminder is an
    // inexact alarm, which Android may hold back to save battery: up to three quarters of the time
    // between setting it and its time, often a few minutes late in practice (George's Pixel, 7 Nov
    // 2026: 15 and 30 minutes before came 3-4 minutes late, "when it starts" a minute late).
    reminders: {
      supported: true,
      // Android 13 and later ask the first time
      async ask() {
        const now = await LocalNotifications.checkPermissions();
        if (now.display === 'granted') return true;
        return (await LocalNotifications.requestPermissions()).display === 'granted';
      },
      // Whether reminders can be set to the minute ("Alarms & reminders" allowed)
      async exact() {
        return (await LocalNotifications.checkExactNotificationSetting()).exact_alarm === 'granted';
      },
      // Opens Android's "Alarms & reminders" page for the app; resolves with exact() once the person
      // comes back. The plugin's own answer may never come (the emulator's didn't), so coming back to
      // the app counts too.
      askExact() {
        return new Promise((resolve) => {
          let done = false, listener = null;
          const finish = () => {
            if (done) return;
            done = true;
            if (listener) listener.remove();
            this.exact().then(resolve, () => resolve(false));
          };
          App.addListener('resume', finish).then((l) => { listener = l; if (done) l.remove(); });
          LocalNotifications.changeExactNotificationSetting().then(finish, finish);
        });
      },
      // Each { id, title, body, at (ms), exact }; the same id replaces an earlier one. `exact` only
      // when exact() said so: asked for without the permission, the plugin would send people to
      // Android's settings page itself, and its call never returns.
      schedule(items) {
        return LocalNotifications.schedule({
          notifications: items.map(r => ({ id: r.id, title: r.title, body: r.body, isExactNotification: !!r.exact, schedule: { at: new Date(r.at), allowWhileIdle: true } })),
        });
      },
      cancel(ids) {
        return LocalNotifications.cancel({ notifications: ids.map(id => ({ id })) });
      },
    },
    // The app's version, for Settings
    version: () => App.getInfo().then(i => i.version),
    // Subscriptions: the same names as the web's pretend store (../../platform.js)
    billing: {
      supported: !!RC_KEY,
      store: 'Google Play',
      // The promo code box: allowed on Google Play for free codes that are never sold (checked 11 Nov
      // 2026). An iPhone version must leave this out: Apple doesn't allow an app's own codes.
      codes: true,
      async status() {
        await rc();
        return entitlement((await Purchases.getCustomerInfo()).customerInfo);
      },
      async price() {
        const pack = await yearly();
        return pack && pack.product ? pack.product.priceString : null;
      },
      // Opens Google Play's own purchase sheet. Closing it without buying rejects with `cancelled`.
      async subscribe() {
        const pack = await yearly();
        if (!pack) throw new Error('No subscription on offer');
        try {
          return entitlement((await Purchases.purchasePackage({ aPackage: pack })).customerInfo);
        } catch (e) {
          // RevenueCat's code 1 = the person closed the sheet
          if (e && (String(e.code) === '1' || e.userCancelled || (e.data && e.data.userCancelled))) e.cancelled = true;
          throw e;
        }
      },
      // Finds a subscription bought with this Google Play account, after a reinstall or on a new phone
      async restore() {
        await rc();
        return entitlement((await Purchases.restorePurchases()).customerInfo);
      },
      // Google Play's page for this subscription, where it's cancelled. Leaving the app's own pages
      // makes Capacitor hand the address to Android, which opens it in the Play Store.
      manage() { window.location.href = MANAGE_URL; },
      // A promo code: our server checks it and tells RevenueCat to give this phone's anonymous ID full
      // access for the code's length. The server answers { ok } or { ok: false, reason }.
      async redeem(code) {
        await rc();
        const id = (await Purchases.getAppUserID()).appUserID;
        const res = await fetch(CODES_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, id }) });
        const answer = await res.json();
        // RevenueCat keeps the last answer for a few minutes: ask afresh so the access shows at once
        if (answer.ok) await Purchases.invalidateCustomerInfoCache().catch(() => {});
        return answer;
      },
    },
  };
})();
