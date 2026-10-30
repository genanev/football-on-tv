# Setting up the UK update on Google Cloud (London)

Today the hourly update runs on GitHub's computers in the USA. This guide moves it to Google's
London data centre, so it runs from a UK address, **every 15 or 30 minutes** (the steps below start at 15; George changed it to 30, see "Changing how often it runs"). That fixes three things:

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
| **Cloud Scheduler** `football-update-trigger` | The alarm clock: starts the job every 15 minutes (30 once changed). |
| **Secret Manager** `github-token` | A locked box for the key that lets the job save to GitHub. |
| **Cloudflare R2** `tellyfixtures-data` (added later) | Storage on your own domain: the job also uploads `data.json` there (see "Saving data.json to your own domain"). |

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

Paste this **one line exactly as it is, without putting the key in it**, and press Enter:

```bash
read -s -p "Paste the GitHub key, then press Enter: " KEY; echo; printf '%s' "$KEY" | gcloud secrets create github-token --data-file=-; unset KEY
```

The terminal then shows **Paste the GitHub key, then press Enter:** and waits. *Now* paste the key
(nothing appears on screen as you do; that's normal) and press Enter. You should see
`Created secret [github-token]` and `Created version [1] of the secret [github-token]`.

## Step 6 – Create the job's "identity" and let it use the key

First check Cloud Shell still remembers your project name. Paste this; it should print your project
ID and `europe-west2`:

```bash
echo "$PROJECT_ID $REGION"
```

If it prints nothing (or only one of them), the two `export` lines from step 4 were lost, for
example because Cloud Shell restarted. Paste them again, with your own project ID, before going on.

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

## Step 10 – Hand over from GitHub (done on 18 Oct 2026)

Leave both running for a day. That's safe: if GitHub's US run and the London run overlap, the
London run's Amazon pick is kept (the US run can't read Prime Video, which counts as "that source
failed", so the keep rule leaves it alone).

When the London runs look good (a new "Update fixtures" commit on schedule, no yellow banners
you didn't expect), **tell Claude**. Claude switches off GitHub's hourly schedule in
`.github/workflows/update.yml` (the "Run workflow" button stays as a backup) and updates the docs.
You can then stop the weekly UK run from your own computer. This was done on 18 Oct 2026.

## Watching it

- **Is it running?** The newest "Update fixtures" commit on GitHub should never be more than about
  20 minutes old. The app also shows "updated … ago" at the top, and a yellow warning appears if
  the listings are over 12 hours old.
- **Did a run fail?** Cloud Run → Jobs → `football-update` → **Executions** (failed ones are red).
  A single failed run doesn't matter: the next one is 15 or 30 minutes later and the app keeps the last
  good data.

## Changing how often it runs

In Cloud Shell, after the two `export` lines from step 4. Every 30 minutes:

```bash
gcloud scheduler jobs update http football-update-trigger --location="$REGION" --schedule="*/30 * * * *"
```

Every 15 minutes: use `*/15 * * * *` in the same command. Every hour: `0 * * * *`. It takes
effect straight away. Faster than every 10 minutes isn't recommended: GitHub Pages rebuilds on
every save and starts dropping builds above about 10 an hour.

## When the key expires

In a year GitHub's key stops working and runs will fail with "Permission denied" or "Authentication
failed". Make a new key (step 3), then in Cloud Shell (after the `export` lines from step 4):

```bash
read -s -p "Paste the new GitHub key, then press Enter: " KEY; echo; printf '%s' "$KEY" | gcloud secrets versions add github-token --data-file=-; unset KEY
```

(Same as step 5: paste this line as it is, then paste the key when it asks.)

The job always uses the newest version, so nothing else changes.

## Switching football to API-Football

The update reads football fixtures and scores from API-Football as soon as the job has the
API-Football key; without it, it keeps using the official websites. So: first merge the
`api-football` branch into `main` (that changes nothing yet), then give the job the key.

In Cloud Shell (after the `export` lines from step 4):

1. Put the key in the locked box. Paste this line as it is, then paste the key from your
   API-Football dashboard when it asks (it won't show on screen):

```bash
read -s -p "Paste the API-Football key, then press Enter: " KEY; echo; printf '%s' "$KEY" | gcloud secrets create api-football-key --data-file=-; unset KEY
```

2. Let the job read it, and hand it to the job (its GitHub key stays as it is):

```bash
gcloud secrets add-iam-policy-binding api-football-key \
  --member="serviceAccount:football-job@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
gcloud run jobs update football-update --region="$REGION" \
  --update-secrets="API_FOOTBALL_KEY=api-football-key:latest"
```

3. Run it once and check, as in step 8:
   `gcloud run jobs execute football-update --region="$REGION" --wait`. The printed report should
   say `"footballSource": "api-football"` and `"apiFootball": { "ok": true, ... }`.

Each update uses 9 of the Pro plan's 7,500 requests a day (about 430 a day at every 30 minutes).

**Going back to the official websites** (for example if API-Football stops working):

```bash
gcloud run jobs update football-update --region="$REGION" --update-env-vars="FOOTBALL_SOURCE=official"
```

Undo it with `--remove-env-vars="FOOTBALL_SOURCE"`.

**Turning football scores off everywhere** (if they ever have to go):

```bash
gcloud run jobs update football-update --region="$REGION" --update-env-vars="SHOW_SCORES=off"
```

Undo it with `--remove-env-vars="SHOW_SCORES"`. Both take effect on the next run.

## Saving data.json to your own domain (Cloudflare R2)

Step 1 of the paid-app work (`playStorePlan.md`, Phase 1). The job keeps saving `data.json` to
GitHub as before, and **also** uploads it to Cloudflare's storage (**R2**), where it's served at
**https://data.tellyfixtures.co.uk/data.json**. The app reads both and shows whichever is newer, so
nothing changes for you if one of them fails. Later the phone app reads only the domain, and the
GitHub saves can stop.

It takes about 20 minutes. Until you've done it, the job just prints "R2 is not set up" and carries on.

**Cost:** R2's free allowance is 10 GB of storage, a million uploads and ten million downloads a
month. We use one small file, about 1,500 uploads a month, and one download each time someone opens
the app. Cloudflare may ask for a payment card to switch R2 on, even though it stays free.

### A. Create the storage (Cloudflare dashboard)

1. Go to <https://dash.cloudflare.com> and sign in (the account that holds tellyfixtures.co.uk).
2. In the left menu: **R2 Object Storage** (under "Storage & databases"). The first time, it asks
   you to switch R2 on (and maybe add a card). The free plan is all we need.
3. **Create bucket**. Name: `tellyfixtures-data`. Location: **Automatic** (or a Western Europe hint
   if offered). Storage class: **Standard**. → **Create bucket**.

(If any screen looks different from this, tell Claude what you see.)

### B. Put it on data.tellyfixtures.co.uk

1. In the bucket: **Settings** → **Custom Domains** → **Add**.
2. Type `data.tellyfixtures.co.uk` → **Continue** → **Connect domain**. Cloudflare adds the
   address itself. It shows "Initializing" for a few minutes, then **Active**.
3. Leave **Public Development URL** (r2.dev) **disabled**: the custom domain is the only public
   address.

### C. Let the app read it from any page

Still in **Settings**: **CORS Policy** → **Add CORS policy** (or **Edit**). Replace what's there with
this, then **Save**:

```json
[
  {
    "AllowedOrigins": ["*"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 86400
  }
]
```

This lets the app (on github.io today, later the phone app) download the file. It only allows
reading: uploads still need the key from step D.

### D. A key for the London job

1. While still in **Settings**, find **S3 API** and copy the address shown. It looks like
   `https://1a2b3c….r2.cloudflarestorage.com/tellyfixtures-data`. Keep it for step E. (It isn't
   secret.)
2. Back on the R2 overview page: **Manage API tokens** (sometimes under **{} API**) → **Create
   Account API token** (or **Create API token**).
3. Name: `London update job`. Permissions: **Object Read & Write**. Specify bucket(s): **Apply to
   specific buckets only** → `tellyfixtures-data`. TTL: **Forever** (it can only write to this one
   bucket, so it doesn't need to expire). → **Create**.
4. The next page shows an **Access Key ID** and a **Secret Access Key** once. Keep the page open
   for step E. (The other values on that page aren't needed.)

### E. Give the key to the job (Cloud Shell)

Open Cloud Shell as in step 4 at the top, and paste the two `export` lines first.

1. Put the key in the locked box. Paste this line **as it is**. It asks for the two values one at a
   time; paste each when asked (nothing shows on screen) and press Enter:

```bash
read -s -p "Paste the Access Key ID, then press Enter: " A; echo; read -s -p "Paste the Secret Access Key, then press Enter: " S; echo; printf '%s:%s' "$A" "$S" | gcloud secrets create r2-upload-key --data-file=-; unset A S
```

2. Let the job read it, and hand it to the job together with the bucket's address. In the last
   line, **replace the address with the S3 API address you copied in step D**:

```bash
gcloud secrets add-iam-policy-binding r2-upload-key \
  --member="serviceAccount:football-job@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
gcloud run jobs update football-update --region="$REGION" \
  --update-secrets="R2_UPLOAD_KEY=r2-upload-key:latest" \
  --update-env-vars="R2_URL=https://1a2b3c.r2.cloudflarestorage.com/tellyfixtures-data"
```

(This only adds to the job. Its GitHub and API-Football keys stay as they are.)

### F. Run it once and check

1. `gcloud run jobs execute football-update --region="$REGION" --wait`
2. In the log (Cloud Run → Jobs → `football-update` → the latest execution → **Logs**), look for
   **"Uploaded data.json (… bytes) to https://….r2.cloudflarestorage.com/tellyfixtures-data/data.json."**
   followed by "Saved data.json to GitHub."
3. Open **https://data.tellyfixtures.co.uk/data.json** in your browser. You should see the data
   (a page of text starting `{"generatedAt":`), with today's time in `generatedAt`.
4. Tell Claude it's done.

**Replacing the R2 key** (if it was pasted wrongly, or ever shown on screen): make a new token
(R2 step D), paste this line as it is and the two values when asked, then delete the old token in
Cloudflare:

```bash
read -s -p "Paste the Access Key ID, then press Enter: " A; echo; read -s -p "Paste the Secret Access Key, then press Enter: " S; echo; printf '%s:%s' "$A" "$S" | gcloud secrets versions add r2-upload-key --data-file=-; unset A S
```

**Stopping the upload** (it carries on saving to GitHub):
`gcloud run jobs update football-update --region="$REGION" --remove-env-vars="R2_URL" --remove-secrets="R2_UPLOAD_KEY"`.

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
| Step 6 or later says **Invalid service account (`football-job@.iam.gserviceaccount.com`)**, with the project name missing | Cloud Shell forgot the two `export` lines from step 4. Paste them again with your project ID, then rerun only the command that failed (the service account itself was already created; don't create it twice). |
| Step 5 says the secret **already exists** | You did step 5 twice. Use the "When the key expires" commands to add the key instead. |
| You **typed or pasted the key into a command** (or it showed on screen or in a screenshot) | Press **Ctrl+C** to cancel. Treat that key as used up: on GitHub, delete it (Settings → Developer settings → Fine-grained tokens), make a new one (step 3), and redo step 5. If `gcloud secrets list` shows `github-token` already, add the new key with the "When the key expires" command instead of creating it again. |
| Step 9: **PERMISSION_DENIED** on the scheduler | Repeat the first command of step 9 (the `run.invoker` one), then the `scheduler` command. |
| The run ends with **"Gave up after 3 attempts"** | Something else kept saving to `main` at the same moment, or GitHub was down. The next run in 15 minutes will usually work. If it keeps happening, tell Claude. |
| The execution is red and the log says **every fixture source failed** | The London computer couldn't reach any source (for example a Google network problem). It will retry in 15 minutes; the app keeps the old data meanwhile. |
| The log shows **Prime Video `wrongRegion`** | Prime Video still isn't seeing a UK address. Tell Claude. |
| Log says **Upload to R2 failed: HTTP 403** (`SignatureDoesNotMatch`, `InvalidAccessKeyId` or `AccessDenied`) | The R2 key was pasted wrongly, or the token can't write to `tellyfixtures-data`. Follow "Replacing the R2 key" (end of R2 step F). |
| Log says **Upload to R2 failed: HTTP 404** (`NoSuchBucket`) | `R2_URL` doesn't end with the bucket's name. Rerun the last command of R2 step E with the S3 API address copied exactly. |
| **data.tellyfixtures.co.uk** doesn't open, but the log says "Uploaded" | The custom domain is still being set up (R2 step B shows "Initializing"): wait 10 minutes. |

## For Claude (not needed to follow the steps)

- `cloud/update.sh` refuses to run unless `CLOUD_RUN_JOB` is set (Cloud Run sets it) or
  `ALLOW_RESET=1`, because it does `git reset --hard` to `origin/main`. `DRY_RUN=1` commits
  locally without pushing. It was tested on 18 Oct 2026 against a local bare repository: dry run,
  a real save, a save refused once by a hook and retried, and the token not appearing in output.
  The Google side (steps 4–9) could not be tested from the dev machine, which has no `gcloud`;
  the first real run is the test.
- Docker Hub's official images are accepted directly by Cloud Run; `mirror.gcr.io/library/node:24`
  is the fallback. The full `node:24` image is used because it has `git` and `bash`.
- The R2 upload is `scripts/upload-r2.mjs`: an S3 `PUT` signed with AWS Signature Version 4 in
  node:crypto (no SDK, per the no-packages rule; region `auto`, path-style
  `https://<account>.r2.cloudflarestorage.com/<bucket>/data.json`). The signer reproduces the
  "PUT Object" example in Amazon's SigV4 docs (`test/run-test.mjs`). It couldn't be tried against
  R2 itself from the dev machine (no R2 key there); the first real run is the test. `update.sh`
  runs it after each build and ignores its failure, and skips it on `DRY_RUN`.
- Every run commits (`generatedAt` always changes), so `main` gets about 96 commits a day and
  GitHub Pages rebuilds 4 times an hour (its soft limit is about 10). Going faster than every
  10 minutes means saving only when the events changed (plus a heartbeat every few hours so the
  app's 12-hour staleness banner doesn't appear).
