// Puts the app icon everywhere it's needed, from the four files in store/ (npm run icons). To change
// the icon, replace those files (same names, same sizes, square corners, no transparency) and run it.
//
// - The website's icons in the repo's root are copies of them.
// - icon-maskable-512.png: phones crop a "maskable" icon to their own shape, so the TV is shrunk to
//   stay inside the circle every shape keeps, and its edge colours are copied outwards to fill the
//   square without a seam.
// - The Android app's icons and splash screens come from Capacitor's asset tool, which reads its
//   inputs from a folder made here for it (deleted afterwards: store/ is the original).

import { execSync } from 'node:child_process';
import { copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const store = (name) => join(here, 'store', `telly-fixtures-${name}.png`);
const GREEN = '#0b6b3a';

copyFileSync(store('android-192'), join(repo, 'icon-192.png'));
copyFileSync(store('play-store-512'), join(repo, 'icon-512.png'));
copyFileSync(store('ios-180'), join(repo, 'apple-touch-icon.png'));

const inner = 446; // of 512: the TV's far corners end up inside the safe circle (40% of the width)
const before = Math.floor((512 - inner) / 2);
const after = 512 - inner - before;
await sharp(store('play-store-512'))
  .resize(inner)
  .extend({ top: before, bottom: after, left: before, right: after, extendWith: 'copy' })
  .png()
  .toFile(join(repo, 'icon-maskable-512.png'));

const assets = join(here, 'assets');
rmSync(assets, { recursive: true, force: true });
mkdirSync(assets);
copyFileSync(store('app-store-1024'), join(assets, 'icon-only.png'));
copyFileSync(store('app-store-1024'), join(assets, 'icon-foreground.png'));
await sharp({ create: { width: 1024, height: 1024, channels: 3, background: GREEN } })
  .png()
  .toFile(join(assets, 'icon-background.png'));

// Only phones before Android 12 show this picture: the icon with rounded corners, on the app's green
const SIZE = 768;
const rounded = await sharp(store('app-store-1024'))
  .resize(SIZE)
  .composite([{ input: Buffer.from(`<svg width="${SIZE}" height="${SIZE}"><rect width="${SIZE}" height="${SIZE}" rx="170"/></svg>`), blend: 'dest-in' }])
  .png()
  .toBuffer();
const splash = await sharp({ create: { width: 2732, height: 2732, channels: 3, background: GREEN } })
  .composite([{ input: rounded }])
  .png()
  .toBuffer();
await sharp(splash).toFile(join(assets, 'splash.png'));
await sharp(splash).toFile(join(assets, 'splash-dark.png'));

try {
  execSync('npx @capacitor/assets generate --android', { cwd: here, stdio: 'inherit' });
} finally {
  rmSync(assets, { recursive: true, force: true });
}
console.log('Icons done. To see them in the app: npm run sync, then build it.');
