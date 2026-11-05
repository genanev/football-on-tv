// The platform layer for the Android app: the same names as the web version (../../platform.js).
// build-web.mjs puts this after Capacitor's own code (capacitorExports) and its App plugin
// (capacitorApp) in the app's platform.js.
(() => {
  const { SystemBars, SystemBarsStyle } = capacitorExports;
  const { App } = capacitorApp;
  const { LocalNotifications } = capacitorLocalNotifications;

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
    // Match reminders: the phone keeps them, so they fire with the app closed, offline and after a
    // restart. No exact-alarm permission (removed in AndroidManifest.xml): Android may deliver one a
    // few minutes either side to save battery, which is fine for a warning 15-60 minutes ahead.
    reminders: {
      supported: true,
      // Android 13 and later ask the first time
      async ask() {
        const now = await LocalNotifications.checkPermissions();
        if (now.display === 'granted') return true;
        return (await LocalNotifications.requestPermissions()).display === 'granted';
      },
      // Each { id, title, body, at (ms) }; the same id replaces an earlier one
      schedule(items) {
        return LocalNotifications.schedule({
          // isExactNotification: false, or the plugin sends people to Android's exact-alarm settings page
          notifications: items.map(r => ({ id: r.id, title: r.title, body: r.body, isExactNotification: false, schedule: { at: new Date(r.at), allowWhileIdle: true } })),
        });
      },
      cancel(ids) {
        return LocalNotifications.cancel({ notifications: ids.map(id => ({ id })) });
      },
    },
  };
})();
