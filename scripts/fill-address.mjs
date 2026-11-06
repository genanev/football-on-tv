// Puts the postal address into the website's terms page while Cloudflare Pages builds the site.
//
// George wants his address on the live terms page but never on GitHub (6 Nov 2026), and the
// repository is public. So site/terms.html only ever holds a placeholder, and the address lives
// in a setting in his Cloudflare account (POSTAL_ADDRESS), which this script reads at build time.
// It changes only Cloudflare's own temporary copy of the file.
//
// Any problem stops the build, so the placeholder can never go live: Cloudflare keeps showing the
// last good version of the site. It refuses to run anywhere else, because on a real checkout it
// would write the address into a file that could then be committed.

import { readFile, writeFile } from 'node:fs/promises';

const PLACEHOLDER = /<span class="placeholder">[^<]*<\/span>/g;

export function fillAddress(html, address) {
  const clean = (address || '').trim();
  if (!clean) throw new Error('POSTAL_ADDRESS is empty');
  const found = html.match(PLACEHOLDER) || [];
  if (found.length !== 1) throw new Error(`expected one placeholder in the terms page, found ${found.length}`);
  const safe = clean.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return html.replace(PLACEHOLDER, () => safe);
}

if (process.argv[1]?.endsWith('fill-address.mjs')) {
  try {
    if (process.env.CF_PAGES !== '1') throw new Error('this only runs on Cloudflare Pages');
    const file = new URL('../site/terms.html', import.meta.url);
    await writeFile(file, fillAddress(await readFile(file, 'utf8'), process.env.POSTAL_ADDRESS));
    console.log('Postal address added to the terms page');
  } catch (err) {
    console.error(`fill-address: ${err.message}`);
    process.exit(1);
  }
}
