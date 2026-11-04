// Builds the file to upload to Google Play: a signed app bundle (.aab) of the current screens.
//
// Copies the screens in (as npm run sync), has Gradle build the release bundle, signed with the upload
// key kept outside the repo (~/TellyFixtures-keys, see README.md "Releasing to Google Play"), and saves
// it as release/telly-fixtures-<version>.aab. Then prints CHANGELOG.md's lines for this version, ready
// to paste into Play Console's release notes.
//
// It stops first if anything would make Play refuse the upload or leave it without notes: no upload
// key, no CHANGELOG.md section for the version, or a version already uploaded (its git tag
// app-v<version> exists: Play never takes the same version number twice).

import { execSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const stop = (msg) => { console.error(`\n${msg}\n`); process.exit(1); };

const { version } = JSON.parse(readFileSync(join(here, 'package.json'), 'utf8'));
if (!/^\d+\.\d{1,2}\.\d{1,2}$/.test(version)) {
  stop(`package.json's version "${version}" must look like 1.2.3 (the last two numbers up to 99: build.gradle turns it into Play's version code).`);
}

// Same place build.gradle looks
const keys = process.env.TELLY_KEYS || join(homedir(), 'TellyFixtures-keys', 'keystore.properties');
if (!existsSync(keys)) stop(`No upload key: ${keys} doesn't exist. See README.md, "Releasing to Google Play".`);

const tag = `app-v${version}`;
if (execSync(`git tag -l ${tag}`, { cwd: here, encoding: 'utf8' }).trim()) {
  stop(`Version ${version} was already uploaded (git tag ${tag}). Raise the version in package.json and add a section to CHANGELOG.md.`);
}

// The section under "## <version>", up to the next heading
const changelog = readFileSync(join(here, 'CHANGELOG.md'), 'utf8').replace(/\r\n/g, '\n');
const section = changelog.split(/^## /m).find((s) => s.split(/\s/)[0] === version);
if (!section) stop(`CHANGELOG.md has no "## ${version}" section: add what's new in this version first.`);
const notes = section.split('\n').slice(1).join('\n').trim();
if (!notes) stop(`CHANGELOG.md's "## ${version}" section is empty.`);
if (notes.length > 500) stop(`CHANGELOG.md's "## ${version}" notes are ${notes.length} characters; Google Play takes 500 at most.`);

const run = (cmd, cwd = here, env = process.env) => {
  try {
    execSync(cmd, { cwd, env, stdio: 'inherit' });
  } catch {
    stop(`"${cmd}" failed (its messages are above).`);
  }
};
run('node build-web.mjs');
run('npx cap sync android');

// Gradle needs Java: Android Studio's own, unless JAVA_HOME already names one. Gradle's script is
// named with its full path: Windows doesn't always look in the current folder for it.
const studioJava = 'C:\\Program Files\\Android\\Android Studio\\jbr';
const env = { ...process.env };
if (!env.JAVA_HOME && existsSync(studioJava)) env.JAVA_HOME = studioJava;
const android = join(here, 'android');
run(`"${join(android, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew')}" bundleRelease`, android, env);

mkdirSync(join(here, 'release'), { recursive: true });
const out = join(here, 'release', `telly-fixtures-${version}.aab`);
copyFileSync(join(here, 'android', 'app', 'build', 'outputs', 'bundle', 'release', 'app-release.aab'), out);

console.log(`
Built Telly Fixtures ${version}: ${out}

Release notes to paste into Play Console:

<en-GB>
${notes}
</en-GB>

Once it's uploaded, mark this version as used:  git tag ${tag}  then  git push origin ${tag}
`);
