// Copies the app's screens into www/, the folder Capacitor builds into the phone app.
//
// The screens are the repo's own index.html (the same file GitHub Pages serves), its icons and
// sport-icons/. Only platform.js differs: the web version is swapped for the Android one
// (platform/android.js), with the Capacitor code it needs in front of it. Run it before every
// `npx cap sync` (npm run sync does both).

import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const www = join(here, 'www');

rmSync(www, { recursive: true, force: true });
mkdirSync(join(www, 'sport-icons'), { recursive: true });

// Not copied: data.json (the app downloads the latest from data.tellyfixtures.co.uk), the demo
// files and sw.js (the screens are built into the app, so it opens offline without one)
for (const f of ['index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png']) {
  cpSync(join(repo, f), join(www, f));
}
cpSync(join(repo, 'sport-icons'), join(www, 'sport-icons'), {
  recursive: true,
  filter: (src) => !/\.md$/i.test(src),
});

// Capacitor's own code and its App plugin, as plain scripts (no bundler: they set the globals
// capacitorExports and capacitorApp), then the Android platform layer. Their source-map comments
// are dropped, as the maps aren't copied.
const part = (p) => readFileSync(join(here, p), 'utf8').replace(/^\/\/# sourceMappingURL=.*$/m, '');
writeFileSync(join(www, 'platform.js'), [
  part('node_modules/@capacitor/core/dist/capacitor.js'),
  part('node_modules/@capacitor/app/dist/plugin.js'),
  part('platform/android.js'),
].join('\n'));

console.log(`Copied the screens to ${www}`);
