#!/usr/bin/env bash
# The update that runs on Google Cloud (Cloud Run Job in London, started every 15 minutes by Cloud
# Scheduler). It does what .github/workflows/update.yml does, but from a UK address: rebuild
# data.json from every source, then save it to GitHub's main branch. See cloud/SETUP.md.
#
# The job's container is Google's stock Node image; its start command clones this repo and runs
# this file, so a change merged to main takes effect on the next run with nothing to rebuild.
#
# Needs: GITHUB_TOKEN (a token that may write to this repository; the job gets it from Secret Manager).
# For testing in a throwaway clone: ALLOW_RESET=1 (this script resets the checkout to GitHub's main)
# and DRY_RUN=1 (commit locally, don't push).
set -euo pipefail
cd "$(dirname "$0")/.."

# Cloud Run sets CLOUD_RUN_JOB inside a job. Anywhere else this would throw away local changes.
if [ -z "${CLOUD_RUN_JOB:-}" ] && [ -z "${ALLOW_RESET:-}" ]; then
  echo "Refusing to run: this script resets the checkout to GitHub's main. Run it only in the Cloud Run job, or in a throwaway clone with ALLOW_RESET=1." >&2
  exit 2
fi

git config user.name "Football on TV bot"
git config user.email "football-on-tv-bot@users.noreply.github.com"

# The token goes in a request header, so it never appears in a URL or in the logs.
AUTH=()
if [ -n "${GITHUB_TOKEN:-}" ]; then
  AUTH=(-c "http.https://github.com/.extraheader=AUTHORIZATION: basic $(printf 'x-access-token:%s' "$GITHUB_TOKEN" | base64 -w0)")
fi

for attempt in 1 2 3; do
  # Start every attempt from the newest main, so the previous update (which the keep rule reads) is
  # the latest one saved.
  git ${AUTH[@]+"${AUTH[@]}"} fetch --quiet --depth 1 origin main
  git reset --quiet --hard FETCH_HEAD

  # Exits 1 (and leaves data.json alone) only when every fixture source failed: then nothing is
  # saved and the job shows as failed in Cloud Run.
  node scripts/build.mjs data.json

  git add data.json
  if git diff --cached --quiet; then echo "No changes to save."; exit 0; fi
  git commit --quiet -m "Update fixtures"

  if [ -n "${DRY_RUN:-}" ]; then echo "Dry run: committed locally, not pushed."; exit 0; fi
  if git ${AUTH[@]+"${AUTH[@]}"} push --quiet origin HEAD:main; then echo "Saved data.json to GitHub."; exit 0; fi

  # Something else was saved at the same moment (a code change, a manual run): start again on top of it.
  echo "Save was refused (attempt $attempt of 3); trying again."
  sleep $((attempt * 5))
done

echo "Gave up after 3 attempts: could not save data.json." >&2
exit 1
