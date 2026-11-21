// Uploads data.json to Cloudflare R2 (the storage behind data.tellyfixtures.co.uk), where the app
// reads it, and downloads the last one saved there, which the next build reads as the previous
// update (keep rule, daily checks). Run by cloud/update.sh on every update. Since 21 Nov 2026 R2 is
// the only place data.json is saved: the GitHub copy stopped.
//
//   node scripts/upload-r2.mjs data.json              upload
//   node scripts/upload-r2.mjs --download data.json   download (straight from the bucket, not the
//                                                     public address, which Cloudflare may cache)
//
// Needs two settings from the Cloud Run job (see cloud/SETUP.md, "Saving data.json to your own domain"):
//   R2_URL         the bucket's S3 address from Cloudflare: https://<account id>.r2.cloudflarestorage.com/<bucket>
//   R2_UPLOAD_KEY  "<access key id>:<secret access key>" of an R2 API token (Secret Manager r2-upload-key;
//                  "Object Read & Write", so it can download too)
// Without them it says so and stops (exit 1): there's nowhere else to save the listings.
//
// R2 speaks Amazon S3's API, whose requests are signed with AWS "Signature Version 4". That's done
// here with node:crypto rather than with Amazon's SDK, to keep scripts/ free of npm packages.

import { createHash, createHmac } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';

const sha256 = (data) => createHash('sha256').update(data).digest('hex');
const hmac = (key, data) => createHmac('sha256', key).update(data).digest();

// S3 paths are encoded once per segment, RFC 3986 style (encodeURIComponent leaves !'()* alone).
const encodePath = (path) => path.split('/')
  .map(s => encodeURIComponent(s).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase()))
  .join('/');

/**
 * Signs an S3 request (AWS Signature Version 4, header form). Returns the headers to send: the
 * given ones plus x-amz-date, x-amz-content-sha256 and authorization. Every given header is signed.
 * `region` is "auto" for R2.
 */
export function signS3({ method, url, headers = {}, body = '', accessKeyId, secretAccessKey, region = 'auto', now = Date.now() }) {
  const u = new URL(url);
  const amzDate = new Date(now).toISOString().replace(/[-:]/g, '').replace(/\.\d+/, ''); // 20130524T000000Z
  const day = amzDate.slice(0, 8);
  const all = { ...headers, host: u.host, 'x-amz-date': amzDate, 'x-amz-content-sha256': sha256(body) };
  const canon = Object.entries(all)
    .map(([k, v]) => [k.toLowerCase(), String(v).trim().replace(/\s+/g, ' ')])
    .sort(([a], [b]) => (a < b ? -1 : 1));
  const signedHeaders = canon.map(([k]) => k).join(';');
  const query = [...u.searchParams].map(([k, v]) => [encodeURIComponent(k), encodeURIComponent(v)])
    .sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join('&');
  const request = [method, encodePath(decodeURIComponent(u.pathname)), query,
    canon.map(([k, v]) => `${k}:${v}\n`).join(''), signedHeaders, all['x-amz-content-sha256']].join('\n');
  const scope = `${day}/${region}/s3/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(request)].join('\n');
  const key = ['s3', 'aws4_request'].reduce(hmac, hmac(hmac(`AWS4${secretAccessKey}`, day), region));
  const signature = createHmac('sha256', key).update(toSign).digest('hex');
  return { ...all, authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}` };
}

/**
 * Uploads a file to the bucket under its own name (data.json). Throws with R2's error code on
 * failure; the key never appears in messages.
 */
function r2Settings(file, url, key) {
  const [accessKeyId, secretAccessKey] = (key || '').split(':');
  if (!url || !accessKeyId || !secretAccessKey) throw new Error('R2_URL or R2_UPLOAD_KEY is missing or incomplete');
  return { accessKeyId, secretAccessKey, target: `${url.replace(/\/+$/, '')}/${basename(file)}` };
}

async function r2Error(r) {
  const text = await r.text().catch(() => '');
  const code = /<Code>([^<]+)<\/Code>/.exec(text)?.[1];
  return new Error(`HTTP ${r.status}${code ? ` ${code}` : ''}`);
}

/**
 * Downloads the file of the same name (data.json) from the bucket and saves it to `file`. Asked
 * three times (after 5 and 20 seconds) before giving up, as a failure stops the update. Throws with
 * R2's error code; the key never appears in messages.
 */
export async function downloadFromR2(file, { url = process.env.R2_URL, key = process.env.R2_UPLOAD_KEY, now, waits = [5000, 20000] } = {}) {
  const { accessKeyId, secretAccessKey, target } = r2Settings(file, url, key);
  for (let attempt = 0; ; attempt++) {
    const headers = signS3({ method: 'GET', url: target, accessKeyId, secretAccessKey, now: now ?? Date.now() });
    delete headers.host;
    let r, body, err;
    try {
      r = await fetch(target, { method: 'GET', headers });
      if (r.ok) {
        body = await r.text();
        JSON.parse(body); // a half-read or broken file must not become the previous update
      }
    } catch (e) { err = e; }
    if (!err && r.ok) {
      await writeFile(file, body);
      return { bytes: Buffer.byteLength(body), url: target };
    }
    if (!err) {
      err = await r2Error(r);
      if (r.status === 403 || r.status === 404) throw err; // a wrong key or address: asking again won't help
    }
    if (attempt >= waits.length) throw err;
    await new Promise(res => setTimeout(res, waits[attempt]));
  }
}

export async function uploadToR2(file, { url = process.env.R2_URL, key = process.env.R2_UPLOAD_KEY, now } = {}) {
  const { accessKeyId, secretAccessKey, target } = r2Settings(file, url, key);
  const body = await readFile(file);
  // A minute's caching at most: the app asks for a fresh copy each time it opens anyway.
  const headers = signS3({
    method: 'PUT', url: target, body, accessKeyId, secretAccessKey, now,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=60' },
  });
  delete headers.host; // fetch sets it from the URL (the same value that was signed)
  const r = await fetch(target, { method: 'PUT', headers, body });
  if (!r.ok) throw await r2Error(r);
  return { bytes: body.length, url: target };
}

if (process.argv[1]?.endsWith('upload-r2.mjs')) {
  const download = process.argv[2] === '--download';
  const file = process.argv[download ? 3 : 2] || 'data.json';
  if (!process.env.R2_URL && !process.env.R2_UPLOAD_KEY) {
    console.error('R2 is not set up (no R2_URL / R2_UPLOAD_KEY): the listings can\'t be saved anywhere. See cloud/SETUP.md.');
    process.exit(1);
  }
  try {
    const { bytes, url } = await (download ? downloadFromR2 : uploadToR2)(file);
    console.log(download ? `Downloaded the previous update (${bytes} bytes) from ${url}.` : `Uploaded ${file} (${bytes} bytes) to ${url}.`);
  } catch (e) {
    console.error(`${download ? 'Download from' : 'Upload to'} R2 failed: ${e.message}`);
    process.exit(1);
  }
}
