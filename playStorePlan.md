# Plan: from personal web app to a paid Google Play app

Written 18 Oct 2026. Tick items off (`[x]`) as they're done; add the date next to big ones.

**The goal:** "Football on TV" (to be renamed) on the Google Play Store for a wide UK audience. No ads, no betting links, no tracking. A small subscription, advertised as **"1p a day"** = **£3.65 a year**, paid annually. In the app: a **My account** screen (subscription status, renew date, manage/cancel) and a **Feedback** button. Run it on free or basic tiers until it has momentum.

Facts below about Google Play's rules and prices were right as of mid-2026. Check each against Google's current help pages when you get to it, because they change.

## The short version

1. **Decide the name and check the data rights first** (Phase 0). These two are the only real blockers: the rest is ordinary work.
2. **Move off GitHub Pages to your own domain** (Phase 1). GitHub Pages doesn't allow commercial sites, and the Android app needs a domain you control.
3. **Wrap the web app as an Android app** (Phase 2). This is a *Trusted Web Activity* (TWA): a thin Android shell that opens your website full-screen. `index.html` stays the app, so there's no second app to maintain.
4. **Add the subscription through Google Play Billing** (Phase 3). Google requires its own billing for digital subscriptions sold in Android apps. It handles payment cards, VAT, receipts, renewals and cancellations, so you never touch card details.
5. **Closed test with 12 people for 14 days** (Phase 4). New personal developer accounts must do this before Google lets them publish. **Line up the 12 testers early**: it's the longest wait in the plan.
6. **Launch** (Phase 5), then look after it (Phase 6).

Rough time if worked on steadily: 6–10 weeks, most of it waiting (domain/DNS, Google's account checks, the 14-day test, app review).

## What it costs

| Item | Cost | Notes |
|---|---|---|
| Google Play developer account | $25 (≈ £20), **once** | Needs ID checks; takes a few days |
| Domain name | ≈ £10 a year | e.g. a `.co.uk` or `.app` |
| Hosting (Cloudflare Pages) | free | Commercial use allowed; plenty of bandwidth |
| Data file storage (Cloudflare R2 or Google Cloud Storage) | free tier | `data.json` is 72 KB (≈ 10 KB compressed) |
| Update job (Cloud Run, already running) | free tier (≈ £0) | Already in place |
| Subscription checks (Cloudflare Worker or Cloud Run) | free tier | 100,000 requests a day free on Workers |
| Feedback (Google Form → Google Sheet) | free | |
| Email (Cloudflare Email Routing to your Gmail) | free | e.g. `hello@yourdomain` forwards to you |
| ICO data protection fee | ≈ £50 a year, **maybe £0** | Check the ICO's self-assessment; a no-login, no-tracking app may be exempt |
| Google's cut of each subscription | 15% | Google's rate for all subscriptions |
| **Licensed data** (see Phase 0) | **unknown: the big one** | Could be £0 or the biggest cost of all |

**What you'd get per subscriber:** £3.65 includes 20% VAT (Google collects and pays it), leaving £3.04; minus Google's 15% leaves **about £2.59 a year**. The fixed costs above (≈ £60 a year, plus the one-off £20) are covered by **about 25 subscribers**, not counting any data licence.

**Tax:** as a sole trader, income up to £1,000 a year is covered by HMRC's trading allowance, so there's nothing to declare below that. Above it, register for Self Assessment.

---

## Phase 0: decisions and groundwork (before building anything)

- [ ] **Data rights: get a clear answer.** Today's sources are the unofficial feeds and pages behind each website. That's fine for a personal app, but **charging money changes it**: most of these sites' terms forbid commercial reuse, and Google can remove an app after a rights complaint. Options, cheapest first:
  - Ask each source. Some (the FA, WST, PDC, the tours) may be happy to be listed and linked; ask for written permission.
  - Fixture lists themselves have weak legal protection in the UK (the 2012 *Football DataCo v Yahoo* ruling), but Football DataCo still sells licences for Premier League/EFL fixtures. Worth an hour with a solicitor or the IPO's free advice, rather than guessing.
  - TV listings: a commercial EPG feed, or the broadcasters' own affiliate/partner schemes (Sky, TNT and Amazon all run them, and some *pay* you for links to their sign-up pages).
  - Licensed sports data APIs (fixtures, sometimes with TV channels) at small-business prices. Compare a few; the source modules make swapping one a like-for-like change.
  - **Decision to record here:** which sources we keep, which we replace, and what it costs.
- [ ] **Name.** Rename before the store listing: the Android *package name* (e.g. `uk.co.yourdomain.app`) can never be changed after the first upload. Check that the name isn't already a Play app or a UK trademark (search Play and the IPO trademark register), and that the domain is free.
- [ ] **Pricing model.** Recommended: **one-month free trial, then £3.65 a year**. Google Play runs the trial and reminds people before they're charged. Alternatives: a free tier (today + tomorrow, or football only) with the full week and My TV paid. A free tier gets more installs and reviews but is more to build; decide before Phase 3.
- [ ] **"1p a day" wording.** UK advertising rules (CAP code) allow it if the real price is just as clear: "£3.65 a year – that's 1p a day", plus the trial terms.
- [ ] **Accounts: recommended no separate login.** On Android, the person's Google Play account *is* their account: Google knows they've paid, and "Restore purchase" works on a new phone. The **My account** screen shows: subscription status, renewal date, *Manage or cancel* (opens Google Play), *Restore purchase*, Feedback, Privacy policy, app version. Benefits: no passwords to store, a much smaller privacy job, and no in-app "delete my account" feature, which Google requires for any app that lets you create an account. Add real sign-in (Firebase Authentication, free) later only if you add an iPhone or web version, or want My TV picks to follow people between phones.
- [ ] **Your public details.** Google shows a paid app's seller contact details (address, email) on the store listing. Decide whether to use your home address or a cheap virtual business address.

## Phase 1: make it a product on your own domain

- [ ] Buy the domain; put its DNS on Cloudflare (free).
- [ ] Host the app on **Cloudflare Pages** (free, commercial use allowed), deployed from the GitHub repository. GitHub Pages' terms don't allow running a business on it.
- [ ] Make the GitHub repository **private** (free on GitHub; the Cloudflare deploy still works).
- [ ] Change the London update job to **upload `data.json` to storage** (Cloudflare R2 or Google Cloud Storage) instead of committing it to GitHub every 30 minutes. The app then reads it from your domain. This also removes the ~48 commits a day and the GitHub-key expiry (Oct 2027).
- [ ] Add a small **offline page / service worker**, so the app opens without signal and shows the last data it had. Google's quality checks expect an app that doesn't show a browser error page when offline.
- [ ] **Feedback button:** opens a Google Form with the app version and current view filled in automatically. Answers land in a Google Sheet; tick "email me on new responses". Also show your support email.
- [ ] **Privacy policy page** on the domain (required by Google). Plain English: what's stored on the phone (picks, theme), that there's no tracking or ads, what Google Play shares with you about purchases, how to contact you. Also a short **Terms** page (subscription, refunds via Google Play, "listings can change, check your broadcaster").
- [ ] Update `manifest.webmanifest`: new name, description covering all sports, proper icons (including a maskable one and the 512×512 Play icon).
- [ ] **Icon licence:** confirm the licence and ownership of the 3D sport icons (see `sport-icons/README.md`) before using them commercially; replace any you can't confirm.
- [ ] Remove or hide the developer bits from the public app (`?demo` views can stay, but nothing that looks unfinished: "SOON" items are fine if clearly labelled).

## Phase 2: the Android app (Trusted Web Activity)

- [ ] Create the **Google Play developer account** (personal, $25). Do this early: identity checks can take days, and the 14-day test (Phase 4) can't start without it.
- [ ] Generate the Android project with **Bubblewrap** (Google's command-line tool) or **PWABuilder** (a website that does the same). It produces the signed app bundle (`.aab`) to upload.
- [ ] **Digital Asset Links:** put `/.well-known/assetlinks.json` on the domain. It proves the app and website belong together; without it Android shows a browser address bar inside the app.
- [ ] Let Google Play hold the app signing key (Play App Signing). Keep the upload key and its password safe (password manager plus a backup); losing it is a nuisance to recover.
- [ ] Upload to **internal testing** (just you), install it on the Pixel 9, check it opens full-screen, theme colours, the back button, and offline.

## Phase 3: the subscription

- [ ] In Play Console: create the subscription product (e.g. `annual`), price **£3.65**, with the free-trial offer. Set it to the UK only to start with (the app is UK TV).
- [ ] In the app: use the browser's **Digital Goods API** with Google Play Billing (Bubblewrap supports this in TWAs). Screens:
  - **Paywall:** what you get, "£3.65 a year – 1p a day", trial terms, Subscribe, Restore purchase, links to Terms and Privacy.
  - **My account:** status, renewal date, Manage/cancel, Restore, Feedback, Privacy, version.
- [ ] **Check purchases on a server, not just in the app.** A small Cloudflare Worker (free) asks Google's Play Developer API whether a purchase is real and current, then gives the app a signed pass valid for a few days. The data file is served only with a valid pass.
  - Good enough for launch: the app checks the subscription and hides the content without one. The data file is still reachable directly by someone determined; at £3.65 a year that's an acceptable first step, and the server check closes it.
- [ ] Turn on Google's **real-time notifications** (via Google Cloud Pub/Sub, free tier), so cancellations, refunds and renewals are picked up.
- [ ] **The website in a normal browser:** show a short landing page ("Get it on Google Play") instead of the full app, so the web isn't a free back door.
- [ ] Test with Play's **licence testers** (test purchases are free and renew every few minutes): subscribe, trial, cancel, restore on a reinstall, lapse.

## Phase 4: closed testing (Google's rule for new personal accounts)

- [ ] **Recruit 12+ testers** (friends, family, colleagues with Android phones). Each needs a Google account, opts in via a link, and must **stay opted in for 14 days in a row**. Recruit 15–20 to be safe; some will drop out.
- [ ] Run the closed test for at least 14 days. Ask testers to use it normally and send feedback through the Feedback button (that tests the button too).
- [ ] Fix what they find. Google asks, when you apply for production, what you learned from testing and what you changed: keep notes as you go.

## Phase 5: store listing and launch

- [ ] **Store listing:** name, short description (80 characters), full description, the 512×512 icon, a 1024×500 feature graphic, 4–8 phone screenshots (light and dark). Lead with "No ads. No betting. Just what's on TV." Put the price and trial in the description.
- [ ] **Data safety form:** collects no personal data (if we keep no-login); purchase info handled by Google Play.
- [ ] **Content rating** questionnaire (IARC): no gambling, no violence, so it should come out as suitable for everyone.
- [ ] **Target audience:** adults/general (18+ avoids the extra rules for apps aimed at children). Category: Sports.
- [ ] **App access for reviewers:** Google's reviewers must be able to see the paid content. Add them as licence testers or give instructions in "App access".
- [ ] Target the Android API level Google currently requires (Bubblewrap sets this; check before upload).
- [ ] Apply for production access, then a **staged rollout** (e.g. 20% first) once approved.

## Phase 6: after launch

- [ ] Watch Play Console (installs, crashes, ratings) and reply to reviews.
- [ ] Watch the update job's report: a failing source now affects paying customers. Consider an email alert when a source fails for several updates in a row.
- [ ] Make the update job **save only when something changed** (plus a heartbeat), if updates ever need to run more often.
- [ ] Connect the "SOON" competitions (rugby, MotoGP, Specials) as new reasons to subscribe.
- [ ] Simple, privacy-friendly growth: a website landing page, football/darts/snooker forums and Facebook groups, asking happy users for a review.
- [ ] Later: an iPhone version (Apple developer account £79 a year; the same web app wrapped), push notifications ("your team is on TV tonight"), the rename if not done.

## Decisions log

Record decisions here as they're made (date, what, why).

- 18 Oct 2026: plan written. Recommended: no separate login (Google Play account = the account), one-month free trial then £3.65 a year, Cloudflare for hosting, Google Form for feedback.
