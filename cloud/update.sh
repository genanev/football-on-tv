#!/usr/bin/env bash
# The update that runs on Google Cloud (Cloud Run Job in London, started every 30 minutes by Cloud
# Scheduler): rebuild data.json from every source and save it to Cloudflare R2, where the app reads
# it (data.tellyfixtures.co.uk). See cloud/SETUP.md.
#
# Since 21 Nov 2026 R2 is the only copy: data.json is no longer saved to GitHub, so the repository
# can be private. The previous update, which the build reads (keep rule, daily checks, sources
# failing since when), is downloaded from R2 first.
#
# The job's container is Google's stock Node image; its start command clones this repo (with the
# GitHub key, as the repository is private) and runs this file, so a change merged to main takes
# effect on the next run with nothing to rebuild.
#
# Needs: R2_URL and R2_UPLOAD_KEY (scripts/upload-r2.mjs). For trying it out: DRY_RUN=1 builds from
# the checkout's own data.json and uploads nothing.
set -euo pipefail
cd "$(dirname "$0")/.."

# Cloud Run sets CLOUD_RUN_JOB inside a job. Anywhere else this would replace the listings everyone sees.
if [ -z "${CLOUD_RUN_JOB:-}" ] && [ -z "${DRY_RUN:-}" ]; then
  echo "Refusing to run: this script replaces the live listings. Run it only in the Cloud Run job, or with DRY_RUN=1 to try it." >&2
  exit 2
fi

if [ -n "${DRY_RUN:-}" ]; then
  echo "Dry run: building from this checkout's data.json; nothing is uploaded."
else
  # Without the previous update the keep rule would drop channels and events whose sources failed
  # this time, so a failed download stops the update and the last listings stay as they are. (The
  # hourly alert emails if that lasts two hours.)
  node scripts/upload-r2.mjs --download data.json
fi

# Exits 1 (and leaves data.json alone) only when every fixture source failed: then nothing is
# saved and the job shows as failed in Cloud Run.
node scripts/build.mjs data.json

if [ -n "${DRY_RUN:-}" ]; then echo "Dry run: built, not uploaded."; exit 0; fi
node scripts/upload-r2.mjs data.json
