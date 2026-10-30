// Uploads data.json to Cloudflare R2 (the storage behind data.tellyfixtures.co.uk), so the app can
// read it from our own domain instead of from GitHub. Run by cloud/update.sh after every build.
//
//   node scripts/upload-r2.mjs data.json
//
// Needs two settings from the Cloud Run job (see cloud/SETUP.md, "Saving data.json to your own domain"):
//   R2_URL         the bucket's S3 address from Cloudflare: https://<account id>.r2.cloudflarestorage.com/<bucket>
//   R2_UPLOAD_KEY  "<access key id>:<secret access key>" of an R2 API token (Secret Manager r2-upload-key)
// Without them it says so and does nothing (exit 0), so the job works before R2 is set up.
//
// R2 speaks Amazon S3's API, whose requests are signed with AWS "Signature Version 4". That's done
// here with node:crypto rather than with Amazon's SDK, to keep scripts/ free of npm packages.

import { createHash, createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
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
export async function uploadToR2(file, { url = process.env.R2_URL, key = process.env.R2_UPLOAD_KEY, now } = {}) {
  const [accessKeyId, secretAccessKey] = (key || '').split(':');
  if (!url || !accessKeyId || !secretAccessKey) throw new Error('R2_URL or R2_UPLOAD_KEY is missing or incomplete');
  const body = await readFile(file);
  const target = `${url.replace(/\/+$/, '')}/${basename(file)}`;
  // A minute's caching at most: the app asks for a fresh copy each time it opens anyway.
  const headers = signS3({
    method: 'PUT', url: target, body, accessKeyId, secretAccessKey, now,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=60' },
  });
  delete headers.host; // fetch sets it from the URL (the same value that was signed)
  const r = await fetch(target, { method: 'PUT', headers, body });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    const code = /<Code>([^<]+)<\/Code>/.exec(text)?.[1];
    throw new Error(`HTTP ${r.status}${code ? ` ${code}` : ''}`);
  }
  return { bytes: body.length, url: target };
}

if (process.argv[1]?.endsWith('upload-r2.mjs')) {
  const file = process.argv[2] || 'data.json';
  if (!process.env.R2_URL && !process.env.R2_UPLOAD_KEY) {
    console.log('R2 is not set up (no R2_URL / R2_UPLOAD_KEY): not uploaded to the own domain.');
  } else {
    try {
      const { bytes, url } = await uploadToR2(file);
      console.log(`Uploaded ${file} (${bytes} bytes) to ${url}.`);
    } catch (e) {
      console.error(`Upload to R2 failed: ${e.message}`);
      process.exit(1);
    }
  }
}
