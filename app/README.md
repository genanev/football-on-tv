# Telly Fixtures – the phone app

The Android app (an iPhone version can follow later), made with **Capacitor**: a real app whose screens are the
repo's own `index.html`, built into the app (not loaded from a website). Only the listings
(`data.json`) come from the internet, from https://data.tellyfixtures.co.uk/data.json.

| What | Where |
|---|---|
| App ID (permanent once uploaded to a store) | `uk.co.tellyfixtures` |
| Name on the phone | Telly Fixtures |
| Capacitor settings | `capacitor.config.json` |
| Copies the screens into `www/` | `build-web.mjs` |
| What the app does differently from the website (back button, status bar, where the listings come from) | `platform/android.js`; the website's version is `../platform.js` |
| The Android project (open it in Android Studio) | `android/` |
| Icon and splash screen source (the white TV, on the app's green `#0b6b3a`) | `assets/logo.png` |

The npm packages (Capacitor) live here in `app/` only: the update scripts in `../scripts/` stay
package-free.

## Building it

Needs Node.js, and Android Studio with its Android SDK (in `%LOCALAPPDATA%\Android\Sdk`).

```bash
npm install        # once, and after the packages change
npm run sync       # copy the screens into the Android project (after every change to index.html)
npm run open       # open the Android project in Android Studio
```

In Android Studio, the green ▶ (Run) button builds the app and puts it on the phone connected by USB (or on
an emulator). Without Android Studio: `cd android` then `gradlew assembleDebug` builds
`android/app/build/outputs/apk/debug/app-debug.apk`.

## Icons and splash screen

Made from `assets/logo.png` by Capacitor's asset tool:

```bash
npx @capacitor/assets generate --android --iconBackgroundColor "#0b6b3a" --iconBackgroundColorDark "#0b6b3a" --splashBackgroundColor "#0b6b3a" --splashBackgroundColorDark "#0b6b3a"
```

That tool leaves the icons for Android 7 (`mipmap-*/ic_launcher.png` and `ic_launcher_round.png`) without
the green background, so they were then replaced with `../icon-512.png` resized (square and round).
Redo both steps when the real app icon arrives (`playStorePlan.md`, Phase 1: icon licence).
