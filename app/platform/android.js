// The platform layer for the Android app: the same names as the web version (../../platform.js).
// build-web.mjs puts this after Capacitor's own code (capacitorExports) and its App plugin
// (capacitorApp) in the app's platform.js.
(() => {
  const { SystemBars, SystemBarsStyle } = capacitorExports;
  const { App } = capacitorApp;

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
  };
})();
