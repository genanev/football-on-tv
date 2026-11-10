// The platform layer for the Android app: the same names as the web version (../../platform.js).
// build-web.mjs puts this after Capacitor's own code (capacitorExports) and its App plugin
// (capacitorApp) in the app's platform.js.
(() => {
  const { SystemBars, SystemBarsStyle } = capacitorExports;
  const { App } = capacitorApp;
  const { LocalNotifications } = capacitorLocalNotifications;
  const { Browser } = capacitorBrowser;

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
  };
})();
