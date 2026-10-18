# Setting up the UK update on Google Cloud (London)

Today the hourly update runs on GitHub's computers in the USA. This guide moves it to Google's
London data centre, so it runs from a UK address, **every 15 minutes**. That fixes three things:

- Amazon's Champions League pick (Prime Video only shows its UK page to UK visitors), so the weekly
  "run it from your own computer" job goes away.
- The Premier League's own broadcaster feed, which also answers by country.
- GitHub's late and skipped hourly runs.

You do the steps below in your web browser (Google's built-in **Cloud Shell**, so there's nothing
to install). It takes about 30–45 minutes the first time. Nothing here touches the live app until
the last step, and every step can be undone (see "Stopping it").

## What gets set up

| Piece | What it does |
|---|---|
| **Cloud Run Job** `football-update` | A tiny computer that starts, runs the update (about 6 seconds of work), saves `data.json` to GitHub and switches off. |
| **Cloud Scheduler** `football-update-trigger` | The alarm clock: starts the job every 15 minutes. |
| **Secret Manager** `github-token` | A locked box for the key that lets the job save to GitHub. |

The job downloads the newest code from GitHub every time it runs, so changes you merge to `main`
take effect on the next run with nothing to redeploy. The script it runs is `cloud/update.sh`.

## What it costs

At one run every 15 minutes (2,880 a month) the job uses roughly a quarter of Google's monthly free
allowance for Cloud Run, and one scheduler job is within the free allowance. In the worst case, if
the free allowance didn't apply, it should still cost pennies a month. Google asks for a payment
card even for free use, so step 2 sets a **£1 budget alert** that emails you if anything is ever
charged. (A budget alert warns you; it doesn't stop spending by itself.)

## Before you start

You need:
1. A **Google account** (your Gmail is fine).
2. A **payment card** for Google's billing account.
3. Your **GitHub login**.

## Step 1 – Create a Google Cloud project

1. Go to <https://console.cloud.google.com> and sign in. Accept the terms if asked.
2. Click the project picker at the top (it may say "Select a project") → **New project**.
3. Name it `football-on-tv`. Note the **Project ID** shown under the name (for example
   `football-on-tv-123456`). You need it in step 4. → **Create**.
4. Make sure the new project is the one selected at the top.

## Step 2 – Billing and a £1 alert

1. Menu (☰) → **Billing**. If asked, **Link a billing account**, or create one and add your card.
   A new account may offer a free trial with credit: that's fine.
2. Billing → **Budgets & alerts** → **Create budget**. Name `football-on-tv`, amount **£1**, keep the
   default alert points (50%, 90%, 100%), and make sure your email is set to receive the alerts.

## Step 3 – A GitHub key for the job

The job needs permission to save `data.json` to your repository, and nothing else.

1. On GitHub: your profile picture → **Settings** → **Developer settings** (bottom of the left
   menu) → **Personal access tokens** → **Fine-grained tokens** → **Generate new token**.
2. Name: `football-on-tv London job`. Expiration: **1 year** (put a reminder in your calendar for
   then; see "When the key expires").
3. **Repository access** → **Only select repositories** → `football-on-tv`.
4. **Permissions** → **Repository permissions** → **Contents** → **Read and write**. Leave
   everything else as it is.
5. **Generate token** and **copy it now** (GitHub shows it once). Keep the page open until step 6.

## Step 4 – Open Cloud Shell and set two names

1. In the Google Cloud page, click the **`>_` button** at the top right (**Activate Cloud Shell**).
   A terminal opens at the bottom. Click **Authorize** if it asks.
2. Paste these two lines, **replacing the project ID** with yours from step 1, then press Enter:

```bash
export PROJECT_ID="football-on-tv-123456"
export REGION="europe-west2"
```

3. Tell Cloud Shell to use the project, and switch on the three Google services we need:

```bash
gcloud config set project "$PROJECT_ID"
gcloud services enable run.googleapis.com cloudscheduler.googleapis.com secretmanager.googleapis.com
```

(`europe-west2` is London. This takes a minute. If Cloud Shell loses its place later, for example
after a break, repeat the two `export` lines before carrying on.)

## Step 5 – Put the GitHub key in the locked box

This asks you to paste the key **without showing it**, so it doesn't end up in any history:

```bash
read -s -p "Paste the GitHub key, then press Enter: " KEY; echo
printf '%s' "$KEY" | gcloud secrets create github-token --data-file=-
unset KEY
```

## Step 6 – Create the job's "identity" and let it use the key

```bash
gcloud iam service-accounts create football-job --display-name="Football on TV update job"

gcloud secrets add-iam-policy-binding github-token \
  --member="serviceAccount:football-job@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

## Step 7 – Create the job

```bash
gcloud run jobs create football-update \
  --region="$REGION" \
  --image="docker.io/library/node:24" \
  --cpu=1 --memory=512Mi \
  --task-timeout=120s --max-retries=0 \
  --service-account="football-job@${PROJECT_ID}.iam.gserviceaccount.com" \
  --set-secrets="GITHUB_TOKEN=github-token:latest" \
  --command="bash" \
  --args="^@^-c@git clone --quiet --depth 1 https://github.com/genanev/football-on-tv.git /work && bash /work/cloud/update.sh"
```

That's Google's standard Node 24 image: nothing of yours to build. (The odd `^@^` just tells
Google to split the start command at `@` instead of at commas.)

## Step 8 – Run it once by hand and check

```bash
gcloud run jobs execute football-update --region="$REGION" --wait
```

It takes about a minute. You want to see it finish with a green tick or "completed successfully".

Then check three things:

1. **The save.** On GitHub, open the repository: the newest commit should be **"Update fixtures"**
   by **Football on TV bot**, a minute or so old.
2. **The log.** Cloud Run → **Jobs** → `football-update` → the latest execution → **Logs**. It should
   end with "Saved data.json to GitHub." and show the source report above it.
3. **The UK address worked.** Run this; Prime Video should *not* say it got the wrong country:

```bash
curl -s https://raw.githubusercontent.com/genanev/football-on-tv/main/data.json | grep -A6 '"primeVideo"'
```

You want `"ok": true`. If you see `"wrongRegion": true`, tell Claude: it means Prime Video still
sees a non-UK address.

If something failed, see "If it doesn't work" at the bottom.

## Step 9 – Start the 15-minute alarm

Let the scheduler's identity start the job, then create the schedule:

```bash
gcloud run jobs add-iam-policy-binding football-update \
  --region="$REGION" \
  --member="serviceAccount:football-job@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/run.invoker"

gcloud scheduler jobs create http football-update-trigger \
  --location="$REGION" \
  --schedule="*/15 * * * *" \
  --time-zone="Europe/London" \
  --uri="https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${PROJECT_ID}/jobs/football-update:run" \
  --http-method=POST \
  --oauth-service-account-email="football-job@${PROJECT_ID}.iam.gserviceaccount.com"
```

(If Cloud Shell asks to enable another service, say yes and run the command again.) To check it
without waiting, click **Cloud Scheduler** in the console and press **Force run** on
`football-update-trigger`; or wait 15 minutes and look at GitHub for a new "Update fixtures" commit.

## Step 10 – Hand over from GitHub

Leave both running for a day. That's safe: if GitHub's US run and the London run overlap, the
London run's Amazon pick is kept (the US run can't read Prime Video, which counts as "that source
failed", so the keep rule leaves it alone).

When the London runs look good (a new "Update fixtures" commit every ~15 minutes, no yellow banners
you didn't expect), **tell Claude**. Claude will switch off GitHub's hourly schedule in
`.github/workflows/update.yml` (the "Run workflow" button stays as a backup) and update the docs.
You can then stop the weekly UK run from your own computer.

## Watching it

- **Is it running?** The newest "Update fixtures" commit on GitHub should never be more than about
  20 minutes old. The app also shows "updated … ago" at the top, and a yellow warning appears if
  the listings are over 12 hours old.
- **Did a run fail?** Cloud Run → Jobs → `football-update` → **Executions** (failed ones are red).
  A single failed run doesn't matter: the next one is 15 minutes later and the app keeps the last
  good data.

## When the key expires

In a year GitHub's key stops working and runs will fail with "Permission denied" or "Authentication
failed". Make a new key (step 3), then in Cloud Shell (after the `export` lines from step 4):

```bash
read -s -p "Paste the new GitHub key, then press Enter: " KEY; echo
printf '%s' "$KEY" | gcloud secrets versions add github-token --data-file=-
unset KEY
```

The job always uses the newest version, so nothing else changes.

## Stopping it

- **Pause** (keeps everything, runs stop):
  `gcloud scheduler jobs pause football-update-trigger --location="$REGION"`
  Resume with `gcloud scheduler jobs resume football-update-trigger --location="$REGION"`.
- **Remove everything:** Google Cloud console → ☰ → **IAM & Admin** → **Settings** → **Shut down**
  (deletes the whole project and its billing use). Also delete the GitHub key under Settings →
  Developer settings.

## If it doesn't work

| What you see | Likely cause and fix |
|---|---|
| Step 7 or 8 says it **can't pull the image** `docker.io/library/node:24` | Google's Docker Hub link is busy or blocked. Replace the image with Google's own copy and try again: `gcloud run jobs update football-update --region="$REGION" --image="mirror.gcr.io/library/node:24"` |
| Log says **Permission denied**, **403** or **Authentication failed** when saving | The GitHub key is wrong, expired, or lacks **Contents: Read and write** on `football-on-tv`. Redo step 3, then the "When the key expires" commands. |
| Step 5 says the secret **already exists** | You did step 5 twice. Use the "When the key expires" commands to add the key instead. |
| Step 9: **PERMISSION_DENIED** on the scheduler | Repeat the first command of step 9 (the `run.invoker` one), then the `scheduler` command. |
| The run ends with **"Gave up after 3 attempts"** | Something else kept saving to `main` at the same moment, or GitHub was down. The next run in 15 minutes will usually work. If it keeps happening, tell Claude. |
| The execution is red and the log says **every fixture source failed** | The London computer couldn't reach any source (for example a Google network problem). It will retry in 15 minutes; the app keeps the old data meanwhile. |
| The log shows **Prime Video `wrongRegion`** | Prime Video still isn't seeing a UK address. Tell Claude. |

## For Claude (not needed to follow the steps)

- `cloud/update.sh` refuses to run unless `CLOUD_RUN_JOB` is set (Cloud Run sets it) or
  `ALLOW_RESET=1`, because it does `git reset --hard` to `origin/main`. `DRY_RUN=1` commits
  locally without pushing. It was tested on 18 Oct 2026 against a local bare repository: dry run,
  a real save, a save refused once by a hook and retried, and the token not appearing in output.
  The Google side (steps 4–9) could not be tested from the dev machine, which has no `gcloud`;
  the first real run is the test.
- Docker Hub's official images are accepted directly by Cloud Run; `mirror.gcr.io/library/node:24`
  is the fallback. The full `node:24` image is used because it has `git` and `bash`.
- Every run commits (`generatedAt` always changes), so `main` gets about 96 commits a day and
  GitHub Pages rebuilds 4 times an hour (its soft limit is about 10). Going faster than every
  10 minutes means saving only when the events changed (plus a heartbeat every few hours so the
  app's 12-hour staleness banner doesn't appear).
