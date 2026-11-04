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
| The app icon's original files, one per size (the store listings take theirs from here) | `store/` |

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

## Releasing to Google Play

Google Play takes an **app bundle** (`.aab`) signed with your **upload key**. Google keeps the real signing
key itself (Play App Signing), so if the upload key is ever lost, Google can replace it (it takes a few
days); nothing is lost for good.

### Once: make the upload key

The key and its password stay outside the repo (the repo is public), in a folder `TellyFixtures-keys` in
your user folder. In a PowerShell terminal:

```powershell
New-Item -ItemType Directory "$HOME\TellyFixtures-keys"
& "C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe" -genkeypair -v -keystore "$HOME\TellyFixtures-keys\upload-key.jks" -alias upload -keyalg RSA -keysize 2048 -validity 10000
```

It asks for a password (choose a long one and save it in your password manager), then your name, "Telly
Fixtures" as the organisation, your town and county, and `GB` as the country code; leave the "unit"
empty. Then make a file `keystore.properties` in the same folder (Notepad: save as "All files", not
`.txt`) with your password on two lines:

```
storeFile=upload-key.jks
storePassword=your password
keyAlias=upload
keyPassword=your password
```

Back up the whole `TellyFixtures-keys` folder (e.g. as an attachment in the password manager).

### Each release

1. Raise `version` in `package.json` (1.0.0 → 1.0.1 for fixes, 1.1.0 for new features) and add a
   section for it at the top of `CHANGELOG.md` with what's new.
2. `npm run release`. It builds `release/telly-fixtures-<version>.aab` and prints the release notes.
   It stops with a message if the key, the version or the notes aren't right.
3. In Play Console, create a release on a testing track (or production later), upload that file and paste
   the notes.
4. Mark the version as used, so it isn't built twice: `git tag app-v<version>`, then
   `git push origin app-v<version>`.

The version number Play sees is worked out from the version: 1.2.3 is 10203 (`android/app/build.gradle`).

## Trying it without a phone

There's an emulator (a pretend Pixel 9 with Android 16) called **Pixel9**: in Android Studio, pick it in the device
list next to ▶. It's slow to start (a few minutes) and slower than a real phone. Its built-in web engine
(WebView 134) is older than a Pixel's, so there the app sits below the status bar instead of drawing
behind it; both look right.

## Icons and splash screen

To change the icon, replace the four files in `store/` (same names and sizes, square corners, no
transparency: the phone rounds them itself, and Apple refuses an icon with a transparency channel, even
an unused one), then:

```bash
npm run icons
```

`make-icons.mjs` copies them to the website's icons in the repo's root, makes `icon-maskable-512.png`
and has Capacitor's asset tool make every Android icon and splash screen. Then raise the version and
release as usual. The Play Store listing's icon is uploaded by hand in Play Console:
`store/telly-fixtures-play-store-512.png`.

`npm run sync` and the asset tool rewrite a few Android files with different line endings only (git
shows them as changed with an empty diff): `git checkout` those.
