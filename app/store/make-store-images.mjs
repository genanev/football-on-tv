// Makes the Google Play listing's pictures from the real app screens: six phone screenshots
// (1080×1920) and the feature graphic (1024×500), saved in app/store/listing/.
//
//   cd app && npm run store-images [-- 2026-11-08T07:30:00Z]
//
// How: a small local web server serves the repo's index.html with the phone app's reminders switched
// on (as app/platform/android.js does) and today's data.json, and Chrome (or Edge) runs without a window,
// driven over its debugging protocol. The page's clock is set to 07:30 tomorrow (or the time given), so
// every listed game is still to come and no scores show (George: scores are never advertised). The
// screenshots use Roboto, the Pixel's font, from Google Fonts; the app itself uses the phone's own font.
// Google takes 24-bit PNGs without transparency, hence sharp's removeAlpha.

import { createServer } from 'node:http';
import { readFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const OUT = fileURLToPath(new URL('./listing/', import.meta.url));
const BROWSER = [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p => p && existsSync(p));
if (!BROWSER) throw new Error('No Chrome or Edge found: set CHROME to the browser\'s .exe');

const tomorrow = new Date();
tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
tomorrow.setUTCHours(7, 30, 0, 0);
const AT = Date.parse(process.argv[2] || tomorrow.toISOString());
if (Number.isNaN(AT)) throw new Error(`Not a time: ${process.argv[2]}`);

// ---- the local web server. `isApp` stays false: the app would read the live listings from the own
// domain, while the web page on any other address reads this server's data.json.
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const PHONE = `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Roboto:wght@400..700&display=block">
<style>body { font-family: Roboto, sans-serif; }</style>
<script>window.platform = { isApp: false, useServiceWorker: false, onBack() {}, themeChanged() {},
  reminders: { supported: true, ask: async () => true, schedule: async () => {}, cancel: async () => {} } };</script>`;
const server = createServer(async (req, res) => {
  try {
    let url = decodeURIComponent(req.url.split('?')[0]);
    if (url === '/') url = '/index.html';
    const file = path.join(ROOT, url);
    if (!file.startsWith(ROOT)) return res.writeHead(403).end();
    let body = await readFile(file);
    if (url === '/index.html') {
      const html = body.toString();
      if (!html.includes('<script src="platform.js"></script>')) throw new Error('index.html no longer loads platform.js as expected');
      body = html.replace('<script src="platform.js"></script>', PHONE);
    } else if (url === '/data.json') {
      // "updated 12 min ago" at the page's clock
      body = JSON.stringify({ ...JSON.parse(body), generatedAt: new Date(AT - 12 * 60000).toISOString() });
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' }).end(body);
  } catch (e) {
    res.writeHead(404).end(String(e.message));
  }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

// ---- the browser, without a window
const profile = await mkdtemp(path.join(tmpdir(), 'telly-store-'));
const browser = spawn(BROWSER, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
let port;
for (let i = 0; i < 100 && !port; i++) {
  await new Promise(r => setTimeout(r, 100));
  try { port = (await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; } catch (e) {}
}
if (!port) throw new Error('The browser didn\'t start');
const page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = fail; });
let nextId = 0;
const pending = new Map();
ws.onmessage = (m) => {
  const j = JSON.parse(m.data);
  if (!pending.has(j.id)) return;
  const { ok, fail } = pending.get(j.id);
  pending.delete(j.id);
  if (j.error) fail(new Error(j.error.message)); else ok(j.result);
};
const send = (method, params = {}) => new Promise((ok, fail) => {
  const id = ++nextId;
  pending.set(id, { ok, fail });
  ws.send(JSON.stringify({ id, method, params }));
});
const run = async (code) => {
  const r = await send('Runtime.evaluate', { expression: `(async () => { ${code} })()`, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
// Scripts added before a page loads (the clock below) only run with the Page domain on
await send('Page.enable');
// No sliding sheets: the app stops its animations when the phone asks for less motion
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });

// The page's clock, its colour theme, and no first-time tip
const setup = (theme) => `(() => {
  const AT = ${AT}, start = Date.now(), Real = Date;
  window.Date = class extends Real {
    constructor(...a) { if (a.length) super(...a); else super(AT + Real.now() - start); }
    static now() { return AT + Real.now() - start; }
  };
  try { localStorage.clear(); localStorage.setItem('theme', '${theme}'); localStorage.setItem('reminderHint', '1'); } catch (e) {}
})();`;

// In-page helpers for the steps below
const HELP = `
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const sport = (name) => [...document.querySelectorAll('.sport')].find(b => b.textContent.trim() === name).click();
  const row = (re) => [...document.querySelectorAll('.match[data-r]')].find(r => re.test(r.querySelector('.teams').textContent));
  const remind = async (re, lead) => {
    row(re).click(); await wait(50);
    document.querySelector('#reminder-body [data-lead="' + lead + '"]').click(); await wait(100);
    document.querySelector('#toast').textContent = '';
  };`;

async function shot(file, { width, height, scale, url = '/', theme = 'light', steps = '' }) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile: scale > 1 });
  const { identifier } = await send('Page.addScriptToEvaluateOnNewDocument', { source: setup(theme) });
  await send('Page.navigate', { url: base + url });
  await sleep(300);
  for (let i = 0; i < 100; i++) {
    const ready = await run(`return document.readyState === 'complete' && document.fonts.status === 'loaded'
      && (!document.querySelector('#main') || document.querySelectorAll('.match').length > 0)`).catch(() => false);
    if (ready) break;
    await sleep(100);
  }
  if (steps) await run(HELP + steps);
  await sleep(400);
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  await sharp(Buffer.from(data, 'base64')).removeAlpha().png().toFile(path.join(OUT, file));
  await send('Page.removeScriptToEvaluateOnNewDocument', { identifier });
  console.log(`  ${file}`);
}

// 360×640 at 3× = 1080×1920, a 9:16 phone screen (Google: at least 1080 pixels for its best placements)
const PHONE_SIZE = { width: 360, height: 640, scale: 3 };
try {
  await mkdir(OUT, { recursive: true });
  console.log(`Clock set to ${new Date(AT).toISOString()}; saving to ${OUT}`);
  await shot('1-my-tv.png', { ...PHONE_SIZE, steps: `await remind(/ v /, 30);` }); // the first match of the day
  await shot('2-football.png', { ...PHONE_SIZE, theme: 'dark', steps: `sport('Football'); await wait(100);` });
  await shot('3-reminder.png', { ...PHONE_SIZE, steps: `const r = row(/England v Australia/);
    r.scrollIntoView({ block: 'start' }); window.scrollBy(0, -210); r.click();` }); // the row just below the fixed bar, above the sheet
  await shot('4-customise.png', { ...PHONE_SIZE, theme: 'dark', steps: `document.querySelector('#edit').click();` });
  await shot('5-pick-a-day.png', { ...PHONE_SIZE, steps: `document.querySelector('#dayBtn').click(); await wait(50);
    [...document.querySelectorAll('#day-body .dayopt')].at(-1).click(); await wait(100);
    document.querySelector('#chanBtn').click(); await wait(50);
    [...document.querySelectorAll('#chan-body .dayopt')].find(b => b.textContent === 'TNT Sports').click(); await wait(50);
    document.querySelector('#chan-done').click(); await wait(100);` });
  await shot('6-motorsport.png', { ...PHONE_SIZE, theme: 'dark', steps: `sport('Motorsport'); await wait(100);` });
  await shot('feature-graphic.png', { width: 1024, height: 500, scale: 1, url: '/app/store/feature-graphic.html' });
} finally {
  ws.close();
  browser.kill();
  server.close();
  await sleep(500);
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}
