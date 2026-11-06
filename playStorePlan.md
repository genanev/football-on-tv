# Plan: from personal web app to a paid app on Google Play (and later the App Store)

First written 18 Oct 2026; revised the same day to use Capacitor so the app can go to Apple's App Store later. Tick items off (`[x]`) as they're done, with the date next to big ones. Record every decision in the **Decisions log** at the end.

This is run like a real business project: clear goals, decision gates, a budget, a risk register and measures of success. The aim is mainly learning, so each phase also says what you'll learn.

Google's and Apple's rules, prices and free tiers below were right as of mid-2026. Check each one against the provider's current pages when you reach that step, because they change.

---

## 1. Goals

**Product:** a UK app showing what sport is on TV today and the next 7 days, with UK times and the confirmed channel. It's for a wide audience: **no ads, no betting, no tracking**.

**Business model:** a subscription, advertised as **"1p a day" = £3.65 a year**, paid annually. **No card and no email to start, and nothing is charged unless the person chooses to subscribe** (George, 5 Nov 2026); once they do, the subscription renews yearly through Google Play until they cancel:
- **First month:** full access from the first open. A promo code gives **3 months** instead.
- **After that:** a **free tier** for as long as people want it: **one sport (all its competitions), today only**. Loss should be felt, so the subscription is the way back to everything.

**Launch scope:**
- **Google Play first.**
- **Built so the same code can go to Apple's App Store later** without starting again. The App Store is a separate decision (Gate G3).

**In the app at launch:**
- The current features (My TV, sports, competition chips, day picker).
- The **free month**, the **free tier**, and a **promo code** option for 3 months free.
- A **subscription offer** (paywall) when the free month ends and whenever someone taps something locked.
- A **My account** screen.
- A **Feedback** button.
- A privacy policy and terms.
- Works offline.
- **Match reminders** ("remind me 30 minutes before"): the first phone feature, useful on its own and needed for Apple later.

**Not in scope for launch:** an iPhone version, sign-in accounts, email registration, push notifications sent from a server, countries other than the UK. (Rugby union, MotoGP, tennis, alpine skiing and a first Special, curling, were added in Oct 2026; Super League follows once its 2027 fixtures are out.)

## 2. Measures of success

Look at these monthly once launched. The targets are starting guesses; adjust them after the first three months.

| Measure | Where it comes from | First target |
|---|---|---|
| Installs | Play Console | 500 in the first 3 months |
| Free month or free tier → paid conversion | RevenueCat | 30% or more was set for a card-first trial. Paying is now a choice, so expect lower; reset it from real numbers after launch |
| Paying subscribers | RevenueCat | 95 (covers running costs), then 250 |
| Renewal rate after year 1 | RevenueCat | 60% or more |
| Store rating | Play Console | 4.3 or higher |
| Crash-free users | Play Console (Android vitals) | 99.5% or more |
| Data freshness | Update job report | Every source OK in 95% of updates |
| Feedback answered | Feedback sheet | Within 3 days |

## 3. The technical approach (one set of code, two stores)

```
                 ┌────────────────────────────────────────┐
 Google Cloud    │ Update job (every 30 min, London)      │
 (unchanged)     │ scripts/build.mjs → data.json          │
                 └───────────────┬────────────────────────┘
                                 │ uploads
                 ┌───────────────▼────────────────────────┐
 Cloudflare      │ yourdomain: data.json, privacy, terms, │
                 │ landing page ("Get it on Google Play") │
                 └───────────────┬────────────────────────┘
                                 │ downloads data only
          ┌──────────────────────┴───────────────────┐
 ┌────────▼─────────┐                      ┌─────────▼────────┐
 │ Android app      │   same index.html,   │ iPhone (later)   │
 │ (Capacitor)      │   same screens       │ (Capacitor)      │
 │ Google Play      │◄────────────────────►│ App Store        │
 │ Billing          │                      │ in-app purchase  │
 └────────┬─────────┘                      └─────────┬────────┘
          └──────────────► RevenueCat ◄──────────────┘
             (checks subscriptions for both stores)
```

- **Capacitor** (free, open source) packages `index.html` inside a real Android app and a real iPhone app. The screens are **inside the app**, not loaded from a website. Only `data.json` comes from the internet. That's what Apple requires (review rule 4.2: no "website in a wrapper"), and it also makes the app open instantly and work offline.
- **RevenueCat** handles subscriptions for both stores: starting the purchase, checking it's real, renewals, cancellations, refunds and restoring on a new phone. It's free until revenue reaches about $2,500 a month. That means no server of our own for billing.
- **Phone-specific code stays in a few small files** (billing, reminders, opening the store's subscription page). The rest of the app doesn't know which phone it's on. This rule is what keeps the iPhone version a small job.
- **The free month and free tier run on the phone, outside Google's billing (George, 5 Nov 2026).** Google's own free trials and promo codes need a payment method on the person's account, so they can't give a no-card month ([Google's promo code page](https://developer.android.com/google/play/billing/billing_promotions)). Instead:
  - The first open saves the date on the phone, and the app counts 30 days from it. No account or server is involved, and nothing about the person leaves the phone.
  - Online, the app counts from the "last updated" time in the listings it downloads, which we set, so changing the phone's clock doesn't stretch the month. Offline, it uses the phone's clock.
  - The chosen sport and the date it was chosen are saved the same way.
  - Uninstalling, clearing the app's data or moving to a new phone will usually start the month again. That's accepted (see the risk register): stopping it would mean recording something that identifies each phone on a server, which goes against "no tracking".
  - Paying goes through Google Play at £3.65 a year, only when the person chooses to.
- **Promo codes need one very small server.** A Cloudflare Worker (free tier) checks the code and tells RevenueCat to unlock the app for 3 months, against an anonymous ID on the phone. RevenueCat calls this a [promotional entitlement](https://www.revenuecat.com/docs/dashboard-and-metrics/customer-history/promotionals); it ends by itself, and the secret key that grants it has to stay on a server, never in the app. A code doesn't carry over to a new phone or a reinstall.
- **No sign-in at launch.** The store account (Google, later Apple) is the person's account, and RevenueCat remembers the subscription against it, so Restore purchase brings it back after a reinstall or on a new phone.
  - Limitation to accept: someone who pays on Android and later switches to an iPhone would have to subscribe again there. Real sign-in (Firebase Authentication, free) can be added later if people ask for it.
  - If Google sign-in is ever offered on iPhone, Apple requires "Sign in with Apple" too.
- **The data side doesn't change.** `scripts/`, the tests and the update job stay as they are; only where `data.json` is saved moves.
- **The project's no-packages rule:** the update scripts stay package-free. The app shell needs Capacitor and RevenueCat's npm packages; keep these in a separate `app/` folder with its own `package.json`, so the data side stays untouched.

## 4. Budget

| Item | Year 1 (Android only) | Each later year | Adding the iPhone version |
|---|---|---|---|
| Google Play developer account | $25 (≈ £20), once | – | – |
| Apple Developer Program | – | – | ≈ £79 a year |
| Domain name | ≈ £10 | ≈ £10 | – |
| Cloudflare (hosting, data file, email forwarding) | £0 | £0 | £0 |
| Google Cloud update job | ≈ £0 (free tier) | ≈ £0 | – |
| RevenueCat | £0 (under ~$2,500 a month) | £0 | £0 |
| iPhone builds (Codemagic or similar; no Mac needed) | – | – | £0 (free monthly allowance) |
| ICO data protection fee | £0–≈ £52 | £0–≈ £52 | – |
| Optional: an hour of legal advice on data rights | ≈ £150–300, once | – | – |
| Football fixtures: API-Football (free while building; Pro, ≈ $19 a month, from launch) | ≈ £45–180 (depends on launch month) | ≈ £180 | – |
| **Other data licences (if needed, see Phase 0)** | **unknown** | **unknown** | – |
| **Total excluding other data licences** | **≈ £75–£560** | **≈ £190–£240** | **+ ≈ £79 a year** |

**Income per subscriber:** £3.65 includes 20% VAT (the stores collect and pay it), leaving £3.04. After the store's 15%: **≈ £2.59 a year**. Running costs are covered by **about 95 subscribers** with API-Football Pro (about 25 without it), about 125 with the iPhone version.

**Business set-up:** start as a **sole trader**: no registration fee, and HMRC's trading allowance means no tax return until income passes £1,000 a year. A limited company (personal liability protection, but accounts to file every year) can wait until revenue is meaningful. Use a separate bank account (many are free) for store payouts.

## 5. Decision gates

The project only moves past a gate when its question has a clear answer. Write the answer in the Decisions log.

| Gate | When | Question | If "no" |
|---|---|---|---|
| **G0** | End of Phase 0 | Do we have the right to use our data commercially, at a cost we can afford? | Change sources, keep it free and personal, or pause |
| **G1** | End of Phase 4 | Did the closed test show the app works and people would pay? | Fix and test again before applying for production |
| **G2** | 3 months after launch | Is it growing enough to keep investing time? | Keep it as a learning project; reduce effort |
| **G3** | Any time after G2 | Is the App Store worth it? Suggested test: 100+ paying subscribers, or you simply want the learning | Stay Android-only; the code stays ready |

## 6. Risk register

| Risk | Likelihood | Impact | What we do about it |
|---|---|---|---|
| A data source objects to commercial use, or the store removes the app after a rights complaint | Low while small | High | **Accepted risk (George, 29 Oct 2026).** Permission was asked from all 12 organisations (emails sent); none has replied, and we go ahead without waiting. Any objection is dealt with when it arises: one module per source, so any one can be switched off or swapped quickly. Review if the app grows |
| Football DataCo objects to scores (live match data; its 2013 win against Sportradar) | Low while small | Medium | **Accepted risk (George, 19 Oct 2026).** Fixtures are facts. Scores are refreshed only every 5 minutes (never live), are **not a selling point** (not in the store listing or paywall), and sit behind one switch so they can be removed quickly. Review if the app grows or DataCo makes contact |
| API-Football stops operating, changes terms or raises prices | Low–Medium | High (all football) | Accepted for now: focus on getting to market. Its own source module, so a swap is like-for-like; football-data.org is the known fallback (PL, Championship, UCL free; the rest paid) |
| A source changes its website and stops answering | High (happens often) | Medium | Already handled: each source fails on its own, with yellow banners and the keep rule. Add an email alert (Phase 6) |
| Google rejects the app or delays production access | Low–Medium | Medium | Follow the store checklist (Phase 5); complete the 14-day closed test properly; keep notes for Google's questions |
| Apple rejects the app as "just a website" (rule 4.2) | Medium if done thinly | Medium | Screens packaged inside the app, offline mode, reminders, and later push notifications or a widget |
| Too few people pay | Medium | Medium | Free month, then a deliberately limited free tier; measure conversion. A no-card month brings more people in, but fewer go on to pay because paying is a choice. Review at Gate G2 |
| The free tier is so limited that people uninstall | Medium | Medium | **George's choice (5 Nov 2026): start strict.** Loosening it later feels like a gift, while tightening it would annoy people and could hurt ratings. Watch uninstalls and loosen if needed |
| People restart the free month by reinstalling | Low | Low | **Accepted (5 Nov 2026).** They'd have to set up My TV and reminders again each time, for an app costing 1p a day. Review if it shows in the numbers |
| The new UK subscription rules (expected January 2027) apply around launch | High | Medium | On the list in "Legal review before launch" (Phase 5) |
| The name clashes with an existing app or trademark | Medium | Medium | Check before the first upload (the Android package name can't change afterwards) |
| Losing the app's upload key or account access | Low | High | Play App Signing; keys and passwords in a password manager with a backup; two-step sign-in on every account |
| A key or token expires unnoticed (e.g. the GitHub key, Oct 2027) | Medium | Medium | Expiry dates in a calendar; moving the data file off GitHub (Phase 1) removes the GitHub key |
| Icon licence unclear | Closed | – | George confirmed on 4 Nov 2026 that all the icons are generic and created from scratch (Phase 1) |
| Costs grow with users | Low | Low | `data.json` is ≈ 10 KB compressed; free tiers cover many thousands of users |
| Personal workload (support, fixes) | Medium | Medium | Feedback via a form and sheet, a FAQ, a 3-day reply target, store refunds handled by the stores |

---

## Phase 0: decisions and groundwork

*You'll learn: what makes an app legal to sell, naming and branding, pricing.*

- [x] **Data rights (Gate G0), 29 Oct 2026: going ahead.** The 12 permission emails were sent; no replies so far. George's decision: we don't wait. We asked for consent, and any objection will be dealt with as it arises (he doubts there will be any unless the app really takes off). Sources added after the emails (MotoGP, F3, tennis, skiing, curling, rugby) weren't asked; same approach. See the decisions log and the risk register.
- Background (18 Oct 2026): today's sources are the unofficial feeds and pages behind each website. That's fine for personal use, but most of these sites' terms forbid commercial reuse. For each source, decide **keep with permission / replace / licence**, and record it below.
  - **Ask:** governing bodies (FA, WST, PDC, the golf tours, ICC) may be happy to be listed and linked. Get written permission.
  - **Football fixtures:** fixture lists themselves have weak UK legal protection (the 2012 *Football DataCo v Yahoo* ruling), but Football DataCo still sells licences for Premier League/EFL fixtures. Worth an hour with a solicitor or the IPO's free advice service, rather than guessing.
  - **TV listings:** a commercial TV guide (EPG) feed, or the broadcasters' partner/affiliate schemes. Some pay you for links to their sign-up pages, which could become a second income without breaking the no-ads principle.
  - **Licensed sports data APIs:** some sell fixtures (some with TV channels) at small-business prices. Compare a few.

| Source | Decision | Cost | Evidence (email/licence) |
|---|---|---|---|
| Premier League fixtures and scores | **Replace** with API-Football (19 Oct 2026) | Free while building; Pro ≈ $19/month live | Fixtures treated as facts; scores an accepted risk (see risk register) |
| Premier League broadcaster feed | Keep; asked (email 4) | £0 | Sent; no reply (29 Oct 2026) |
| UEFA (UCL, UEL) | **Replace** with API-Football; read once a day to check it (29 Oct 2026) | (same subscription) | as above |
| EFL (Championship, League Cup) | **Replace** with API-Football; read once a day to check it | (same subscription) | as above |
| FA (FA Cup fixtures) | **Replace** with API-Football | (same subscription) | The FA's "Live on" TV pick: asked (email 5), no reply |
| F1 / F2 (F3 added later) | Keep; asked (email 6) | £0 | Sent; no reply |
| PDC | Keep; asked (email 7) | £0 | Sent; no reply |
| PGA Tour / DP World Tour | Keep; asked (emails 9, 10) | £0 | Sent; no reply |
| WST | Keep; asked (email 8) | £0 | Sent; no reply |
| ICC | Keep; asked (email 11) | £0 | Sent; no reply |
| Sky TV guide / Sky Sports pages | Keep; asked (email 1) | £0 | Sent; no reply |
| TNT Sports | Keep; asked (email 2) | £0 | Sent; no reply |
| Prime Video | Keep; asked (email 3) | £0 | Sent; no reply |
| Premier Sports (streaming; Scottish Premiership, rugby's Champions Cup) | Keep; asked (email 12) | £0 | Sent; no reply |
| MotoGP, FIS (skiing), WTA and the ATP Finals' site (tennis), World Curling, World Rugby | Keep; not asked (added after the emails, 20-29 Oct 2026) | £0 | Same approach: deal with any objection as it arises |

- [x] **Name and brand (19 Oct 2026): Telly Fixtures.**
  - [x] Name chosen: **Telly Fixtures**. Store title along the lines of "Telly Fixtures: Sport on UK TV".
  - [x] No clashing app found in the stores; trademark register checked by George (no conflict).
  - [x] App ID: **`uk.co.tellyfixtures`** (Android and, later, Apple). **It can't change after the first upload.**
  - [x] Domains registered on Cloudflare (19 Oct 2026): **tellyfixtures.co.uk** (the main one, which the app ID matches) and **tellyfixtures.com**, auto-renewing yearly. tellyfixtures.app deliberately skipped (optional; can be bought later if still free).
  - [x] Rename the app itself (31 Oct 2026): title, heading, manifest and home-screen name. The icon waits for the app icon (see "Icon licence" below); the footer names no app. The web address keeps `football-on-tv` until the site moves to Cloudflare Pages.
- [x] **Pricing (George, 5 Nov 2026):** £3.65 a year. **One month of full access with no card and no email**, then a **free tier** with no strings attached. A **promo code gives 3 months of full access**. How it works is in section 3.
  - **The free tier:** one sport from the top row (all its competitions), today only.
    - When the free month ends, the app asks people to pick their favourite sport.
    - A week later, the next time they open the app, it asks whether to keep that sport or pick another for the new week. Dismissing it keeps the same sport. It's asked inside the app only, not by phone notification.
    - No changing sport mid-week: subscribing is the way to get another sport sooner.
    - Other sports stay visible with a padlock; tapping one offers the subscription.
    - Reminders are for subscribers only.
    - An empty day shows the day and date and the usual message, e.g. "No televised snooker". No sales message is added to it (George, 5 Nov 2026).
  - **Before the month ends:** a gentle reminder inside the app a few days before.
  - **A lapsed subscription** drops to the same free tier.
  - Taken as read until George says otherwise: the code gives 3 months in place of the 1 (not 4 in total).
  - Still to decide in Phase 3: whether codes are single-use or shareable, and who gets them.
- [ ] **"1p a day" wording.** UK advertising rules (the CAP code) allow it if the real price is just as clear: "£3.65 a year – that's 1p a day", with the free month's terms beside it. Final check in the legal review (Phase 5).
- [ ] **UK only at launch** (it's UK TV). This also avoids the EU's extra seller rules: EU stores must show a seller's address and phone number.
- [x] **Your public details (George, 5 Nov 2026): his own address, not a virtual one.** Google shows a personal account's legal name, country and developer email, plus the full address [once the app makes money](https://support.google.com/googleplay/android-developer/answer/13628312?hl=en); the address comes from the payments profile (Phase 3). If the app picks up and moves to a company, the company's business address replaces it. The address itself is in `business/public-details.md`, not in this file, while the repository is public.
- [x] **Support email** on the domain (see Phase 1; done 6 Nov 2026).
- [x] **Sole trader or limited company before opening the store accounts?** Decided 29 Oct 2026: a **personal** Google Play account, as a sole trader (see the decisions log). George is a sole trader (19 Oct 2026). Moving the domains to a company later is easy. A Google Play *personal* account can't become an *organisation* account: the app would have to be transferred to a new account. An organisation account:
  - skips the 12-tester closed test;
  - shows the company's address instead of yours;
  - needs a registered company (£100) and a free D-U-N-S number (can take weeks);
  - means yearly accounts (often a few hundred pounds with an accountant).

  Talk to an accountant before Phase 2.
- [ ] **Accounts and security.** Use one Google account just for the business, with two-step sign-in. Keep everything in a password manager: store accounts, keys, recovery codes.

## Phase 1: product readiness on your own domain

*You'll learn: domains and DNS, hosting, cloud storage, privacy law basics.*

- [x] Buy the domain and have its DNS on Cloudflare: done 19 Oct 2026 (registered on Cloudflare, so its DNS is already there).
- [x] Set up the support email (6 Nov 2026): support@tellyfixtures.co.uk forwards to the app's Gmail through Cloudflare Email Routing (free); George's test message arrived. It only receives: replies come from the Gmail address until we add a sending service. Decide on that before launch.
  - [x] Changed the developer email in Play Console to this address, so the public contact doesn't show the Gmail (George, 6 Nov 2026).
- [x] **Football fixtures from API-Football** (decided 19 Oct 2026; **live since 20 Oct 2026**):
  - [x] Source module `apiFootball.mjs` with offline tests; also reads the Conference League and the WSL for the new app.
  - [x] Compared with the official feeds (Oct 2024 week, and the current week on the Pro plan): all shared games identical once a few name aliases were added. Full club names via `teamNames.mjs`.
  - [x] API key in Google Cloud Secret Manager (`api-football-key`), never in the code.
  - [x] Pro plan since 19 Oct 2026 (George chose to start it early, to test on the current season), about $19 a month.
  - [x] Keep an eye on it for a couple of weeks (moved games, postponements, the 25 Oct clock change). Checked 28 Oct 2026: every game identical across the clock change, but API-Football was still showing a Europa League game UEFA had moved (Rennes v Olympiacos) on its old date two days later.
  - [x] **Daily check against the official feeds (29 Oct 2026), instead of retiring them:** once a day the Premier League, UEFA and EFL feeds are compared with API-Football, and they win where they disagree (moved, postponed or missing games). Reading them once a day keeps our footprint on those sites small (about 10 requests a day in total, fewer than before). Going back to the official feeds completely is still one command (`cloud/SETUP.md`).
- [ ] **Scores every 5 minutes, not live** (decided 19 Oct 2026). After the storage move below:
  - A small scores-only update every 5 minutes, only while a game is on: one request covers all nine competitions.
  - The full update stays every 30 minutes.
  - One switch turns scores off everywhere, in case they have to be removed.
- [ ] Change the update job to **upload `data.json` to storage** (Cloudflare R2 or Google Cloud Storage) on the domain, instead of committing it to GitHub every 30 minutes.
  - [x] Code (30 Oct 2026): the job uploads to **Cloudflare R2** (bucket `tellyfixtures-data`, served at https://data.tellyfixtures.co.uk/data.json), and the web app reads the domain and GitHub together, showing the newer copy.
  - [x] George: created the bucket, the domain and the key (`cloud/SETUP.md` → "Saving data.json to your own domain"); the first upload ran on 31 Oct 2026 at 23:00 and the live app reads both copies.
  - Keep the GitHub commit for a few weeks as a fallback, then stop it.
  - This also removes the GitHub key that expires in Oct 2027.
- [ ] Host the website on **Cloudflare Pages** (free, commercial use allowed; GitHub Pages' terms don't allow a business). The public website becomes a **landing page** ("Get it on Google Play", screenshots, FAQ, contact, privacy, terms). The full web app stays available to you for previews. **Drafted 5 Nov 2026 in `site/` (landing page, privacy policy, terms), not published yet;** the steps to connect it are in `cloud/SETUP.md`.
- [ ] Make the GitHub repository **private**.
- [ ] **Privacy policy** (Google needs its web address before the closed test): **George's own wording is in `site/privacy.html` (6 Nov 2026), short and generic on purpose, with no draft label.** He amends it, and its date, if he's advised to change it. Tick this once it's live on the website.
- [ ] **Terms of use:** George's wording is in `site/terms.html` (6 Nov 2026), with no draft label. He amends it, and its date, if he's advised to change it. Tick this once it's live on the website. The postal address appears only on the live page, never on GitHub: Cloudflare adds it from a setting as it builds the site (`cloud/SETUP.md`). Apple's standard licence terms, if used later.
- **ICO:** moved to the legal review in Phase 5 (George, 5 Nov 2026).
- [x] **Icon licence (4 Nov 2026):** George confirms all the 3D sport icons and the app icon are generic and created from scratch, so they're fine to use commercially (`sport-icons/README.md`; the Tennis and Skiing icons are his own, 29 Oct 2026). The app icon (512×512 for Play, 1024×1024 for Apple; a TV with a gold star) is in since 4 Nov 2026, in `app/store/`. Keep the original icon zip as the record of where they came from.
- [x] **Accessibility** (the code, 31 Oct 2026; checked on George's Pixel, 1 Nov 2026):
  - [x] Text follows the phone's font size and still fits when it's increased (checked up to 200%, at 320–412px wide). Needs Chrome 146 or later.
  - [x] Colour contrast meets WCAG AA in both themes (five colours darkened slightly, including Sky's orange).
  - [x] Every icon button has a label for screen readers; the animations stop when the phone asks for less motion.
  - [x] George tried it on the Pixel (1 Nov 2026): the largest font size, remove animations, TalkBack and no signal all worked.
- [x] **Offline use** (31 Oct 2026): the phone keeps the app and the last listings, opens without a signal and says how old the listings are.
- [ ] **Polish:**
  - Nothing that looks unfinished. "SOON" items are fine if clearly labelled.
  - Clear wording for errors and empty days.

## Phase 2: the app shell (Capacitor, Android first)

*You'll learn: how phone apps are built and signed, Android Studio, app versions.*

**Where we are (6 Nov 2026):** the Android app is on Play's internal testing track and George has installed it from the Play Store on his Pixel. **1.0.3** is the current version (tags `app-v1.0.0` to `app-v1.0.3`): his own app icon, the fixed bar below the status bar, a shorter offline note, Specials only while in scope, a Settings button and fixtures reminders with 15, 30 or 60 minutes' notice. George passed first open, offline, both themes, large font and the back button on 1.0.1, and confirms 1.0.3 works. Everything is merged into `main`. **The next app release, 1.0.4, is prepared but not uploaded yet** (upload it once https://tellyfixtures.co.uk/privacy.html opens, then tag it): links to the Privacy policy and Terms of use in Settings, which open in the phone's browser, plus two small wording changes: "Fixtures reminders" in Settings (1.0.3 says "Match reminders") and the new "couldn't be checked" note. A reminder for a real fixture came through on the Pixel (George, 5 Nov 2026; the phone was on vibrate, so no sound, as expected), and George will raise anything he finds in further use. **Next:** the website live on Cloudflare Pages (Google needs the privacy policy's web address before the closed test), then polish in Phase 1; the store listing; the Google Group and tester recruitment. Worth confirming along the way: an older or small-screen phone.

- [x] Create the **Google Play developer account** (personal, $25; decided 29 Oct 2026). Do this early: identity checks take days, and Phase 4's 14-day test can't start without it.
  - **Done 4 Nov 2026:** account created and the $25 paid on 1 Nov; identity checks passed by 4 Nov. The phone check was done on a spare Android phone: signing in on the Pixel 9 gave "Google couldn't verify that this account belongs to you" (Google's block on a brand-new account signing in on a new device). Play Console now shows only "Create your first app".
  - Use a Google account just for the app, in your legal name, with two-step sign-in.
  - Have ready: passport or driving licence, possibly a bank statement or bill as proof of address, a card for the fee, your mobile number, and the Pixel 9 (new personal accounts verify a real Android phone through the Play Console app).
  - Sign up at play.google.com/console/signup and choose "Yourself". Public developer name: **Telly Fixtures**. Contact email: the new Gmail until the support address on the domain works.
  - Check what each screen says will be shown publicly (see "Your public details" in Phase 0).
- [x] Install the tools on your PC: Node.js (already there) and Android Studio (free; it includes the Android SDK and Java). Done 1 Nov 2026, with the Android SDK and an Android 16 emulator.
  - [ ] Get your Pixel 9 ready for testing (developer options, USB debugging).
- [x] Create the `app/` folder: Capacitor project, app ID, name and icons. The web build step copies `index.html`, the icons and `sport-icons/` into it. (1 Nov 2026: Capacitor 8; the icon and splash screen are the current TV icon on green until the real icon arrives; how to build it: `app/README.md`. Tested on the Pixel9 emulator and merged into `main` the same day.)
- [x] Change the app to **download `data.json` from the domain**, keep the last copy on the phone, and show it offline with "Last updated …". (The web app already does this since 31 Oct 2026; in the app shell it only needs checking. 1 Nov 2026: the app reads it from the domain only.)
- [ ] Create the **platform layer**: small files for billing, reminders and "open subscription settings", each with an Android version and a stand-in for the web preview. Nothing else in the app knows which phone it's on.
  - [x] Started 1 Nov 2026: `platform.js` (web) and `app/platform/android.js` (the back button, the status bar's colours). Billing, reminders and the subscription page are added there as they're built.
- [x] **Match reminders** (Capacitor Local Notifications: scheduled on the phone, no server). A bell on each fixture, with 15, 30 or 60 minutes chosen in Settings (George, 5 Nov 2026; default 30). During the free month and for subscribers, not in the free tier (Phase 3). Android 13+ asks for permission the first time. Store reminders on the phone. Built 5 Nov 2026 and tested on the emulator (permission, app closed, restart); George confirms 1.0.3 works on the Pixel, and a real fixture's reminder came through (5 Nov 2026). In the app it's called "Fixtures reminders".
- [x] **Settings** (George, 5 Nov 2026): a gear button at the top right opens a sheet with the colour theme and the reminder timing. Phase 3's "My account" items (subscription and so on) go in it.
- [x] **Versioning** (4 Nov 2026; `app/README.md` → "Releasing to Google Play"):
  - Version numbers like `1.0.0`, set in `app/package.json` only (Play's version code is worked out from it: 1.2.3 = 10203).
  - `app/CHANGELOG.md` with one section per version, which becomes the store's "What's new" text.
  - Every store upload is tagged in git (`app-v1.0.0`); `npm run release` refuses a version that's already tagged.
- [x] **Signing:** let Google hold the app signing key (Play App Signing). Keep the upload key and its password in the password manager, with a backup.
  - [x] 4 Nov 2026: `npm run release` builds the signed bundle (`app/release/telly-fixtures-<version>.aab`) with the upload key from `TellyFixtures-keys` in your user folder, outside the repo. Tested with a throwaway key.
  - [x] Made the real upload key on 4 Nov 2026 (`app/README.md`, "Once: make the upload key"), and built 1.0.0 with it. Keep a backup of its folder.
  - [x] Google's signing key (Play App Signing) in use since the first upload, 4 Nov 2026.
- [ ] Upload to Play's **internal testing** track (just you) and test on the Pixel 9 (4 Nov 2026: 1.0.0 uploaded, then downloaded from the Play Store and opened on the Pixel; 5 Nov 2026: on 1.0.1, George passed first open, offline, both themes, large font and the back button, and found the fixed bar sliding behind the status bar, fixed in 1.0.2; reminders confirmed 5 Nov 2026; an older phone is still to do):
  - First open.
  - Offline.
  - Both themes.
  - Large font.
  - The back button.
  - Reminders firing.
  - An older or small-screen Android phone if you can borrow one.
- [ ] **iPhone readiness check:** confirm nothing Android-only crept outside the platform layer. Ideally do a test iPhone build with Codemagic's free tier now, to find surprises early.

## Phase 3: subscriptions

*You'll learn: store billing, subscriptions and trials, checking purchases, testing payments safely.*

- [ ] **Payments set-up in Play Console:** payments profile, with the address in `business/public-details.md`; bank account, tax details (UK). Accept the paid apps terms. **The address becomes public at this step.**
- [ ] Create the subscription product: `annual`, **£3.65**, available in the UK only, **with no Google trial** (Google's trial needs a payment method; the free month runs outside it, see section 3).
- [ ] Create the **RevenueCat** account (free).
  - Connect Google Play to it: this needs a Google Cloud service account, and RevenueCat's guide walks through it.
  - Set up one entitlement (e.g. `full_access`) that the `annual` product and promo codes unlock. Apple's product will later unlock the same entitlement.
- [ ] **Promo codes (George, 5 Nov 2026):**
  - The very small server (a Cloudflare Worker) that checks a code, then grants 3 months through RevenueCat against the phone's anonymous ID.
  - Decide single-use or shareable and who gets them; keep the list on the server, where codes can be switched off.
  - Check that Google's billing rules allow codes redeemed outside Google Play for free access; if not, change this before building it.
- [ ] **In the app:**
  - **The free month:** counted on the phone from the first open (section 3), with "Free month: 12 days left" in Settings and a gentle reminder a few days before it ends.
  - **The free tier** (the rules are under "Pricing" in Phase 0):
    - "Your free month has ended": pick your favourite sport, or subscribe.
    - Only that sport, only today. Every other day and sport is locked, with a padlock on the sports.
    - The weekly question: keep this sport, or pick another.
    - An empty day shows the day and date and the usual message ("No televised snooker").
    - Decide what happens to reminders set before the month ended.
  - **Subscription offer**, when the free month ends and on tapping something locked:
    - What you get.
    - The price: "£3.65 a year – 1p a day".
    - That nothing is charged unless they choose to subscribe; cancel any time in Google Play.
    - Buttons: Subscribe and Restore purchase, and a way to carry on with the free tier.
    - Links to Terms and Privacy.
  - **My account** (in Settings):
    - The free month's days left, or subscription status and renewal date.
    - The chosen sport, in the free tier.
    - Enter a promo code.
    - Manage or cancel (opens the store's subscription page).
    - Restore purchase.
    - Feedback, Privacy, Terms, app version.
  - All of this goes through the platform layer, with a web stand-in, so the preview can show each stage. Test builds need a way to jump to any stage, because a 14-day closed test never reaches the end of a 30-day month.
- [ ] **Feedback button:** opens a Google Form with the app version, phone type and current view filled in. Answers go to a Google Sheet, with "email me on new responses" ticked.
- [ ] **Protecting the data file:** at launch the app checks the subscription via RevenueCat and hides content without one. The data file itself is public but unlisted, which is acceptable at £3.65 a year. Later, if needed: a Cloudflare Worker that only serves the data file to apps with a valid RevenueCat subscription.
- [ ] **Test the free stages:** the month's reminder and its end, picking a sport, the weekly question (keep, change, dismiss), an empty day, a locked sport, changing the phone's clock, offline, a promo code (valid, used, wrong), a reinstall.
- [ ] **Test with Play's licence testers** (test purchases are free and renew every few minutes):
  - Subscribe during the free month, and from the free tier.
  - Cancel.
  - Lapse.
  - Restore after reinstalling.
  - Refund.
  - No internet during purchase.
  - Check RevenueCat shows each event.

## Phase 4: closed testing (Google's rule for new personal accounts; Gate G1)

*You'll learn: running a beta, collecting and acting on feedback.*

- [ ] **Recruit testers early (start in Phase 1).** Google requires **at least 12 testers opted in for 14 days in a row** before a new personal account can publish. Recruit 15–20 Android users (friends, family, colleagues, a sports forum); some will drop out.
- [ ] Write a one-page **tester guide**: how to join, what to try (My TV, reminders, subscribing with a test purchase), and how to send feedback.
- [ ] Run the test for at least 14 days. Send a midway reminder. Ask at the end: "Would you pay £3.65 a year? Why or why not?"
- [ ] Keep a **test log**: issues found, what changed, version numbers. Google asks about this when you apply for production.
- [ ] **Gate G1:** decide whether it's ready. Write the answer in the Decisions log.

## Phase 5: Google Play launch

*You'll learn: store listings, store policies, release management.*

- [ ] **Legal review before launch (George, 5 Nov 2026): legal points wait until here, and are added to this list as they come up.** Writing the policies and building the app don't wait for it. Spend the optional hour of legal advice (section 4) on whatever is still open:
  - **New UK subscription rules, expected January 2027** ([Stephenson Harwood](https://www.stephensonharwood.com/insights/subscription-reforms-brought-forward-to-january-2027-is-your-business-ready/); found 5 Nov 2026; the [final regulations weren't out](https://dwfgroup.com/en/news-and-insights/insights/2026/10/dmcca-subscription-contracts-regime-preparing-for-the-new-restrictions)): cooling-off periods, reminders before yearly renewals, ending a subscription easily. Do they apply to us or to Google, as the store selling it? Does a free month that doesn't roll into paying count as a trial under them?
  - The final wording of the privacy policy and terms, including the free month and promo codes.
  - ICO: the self-assessment for the data protection fee.
  - The "1p a day" wording beside the real price (CAP code).
  - The seller's address (Phase 0): where UK rules also need it shown, such as the website and terms, and that it meets them. Check with George before publishing it beyond Google's payments profile.
  - Data rights and scores: still accepted risks (George, 29 Oct and 19 Oct 2026). Any replies or objections received by then.
  - **Points from drafting `site/privacy.html` and `site/terms.html` (5 Nov 2026):**
    - How long data is kept: George's policy says purchase records up to 6 years, and other information no longer than 12 months after it's no longer needed. Check these, and that deleting on time actually happens.
    - What the suppliers really do: what RevenueCat receives beyond purchase history, locale and currency (its docs don't mention IP addresses), and the data agreements and US transfer safeguards for Google, RevenueCat and Cloudflare.
    - The regulator's name and complaints: the ICO is named, so check whether it has become the Information Commission by then, and whether the Data (Use and Access) Act 2025 needs more on handling complaints.
    - Terms: the 14-day cancellation wording for a digital subscription, "including any VAT", the liability wording, and "the law of the part of the UK where you live".
    - The seller's name and address (George, 6 Nov 2026): the policy and terms name "Telly Fixtures", and the postal address appears only in the terms, not on the landing page or in the policy. George is a sole trader, so check whether the website, policy and terms must also show his own name beside the trading name, whether the address in the terms alone is enough, and what Google shows.
    - Statements that must be true on the day: "restricted and protected" accounts (two-step sign-in, Phase 0).
- [ ] **Store listing:**
  - Name.
  - Short description (80 characters).
  - Full description, leading with "No ads. No betting. Just what's on TV.", and showing the price, the free month and what the free tier includes clearly. **Don't advertise scores** (here, in screenshots' captions or on the paywall): they may have to be removed.
  - Icon (512×512).
  - Feature graphic (1024×500).
  - 4–8 phone screenshots (light and dark).
  - Category: Sports.
  - Contact email, privacy policy link.
- [ ] **Data safety form:** what the app collects. Purchases go through Google and RevenueCat, and promo codes use an anonymous ID; there's no personal data otherwise. The feedback form is optional and user-initiated.
- [ ] **Content rating** questionnaire (IARC): no gambling or violence, so expect "Everyone"/PEGI 3.
- [ ] **Target audience:** adults/general, not aimed at children (that avoids extra rules).
- [ ] **App access for reviewers:** add Google's review account as a licence tester, or explain in "App access" how to reach the paid content.
- [ ] Confirm the app targets the Android version Google currently requires (set in the Android project).
- [ ] **Launch-day checklist:**
  - Update job healthy.
  - The domain's data file fresh.
  - Landing page live with the Play link.
  - RevenueCat in production mode.
  - Support email tested.
- [ ] Apply for production access. Once approved, use a **staged rollout**: 20% of users, then 100% after a few days without problems.

## Phase 6: operate and grow (Gate G2)

*You'll learn: running a live service, support, product decisions from data.*

- [ ] **Weekly:**
  - Check the update job's report.
  - Crashes and ratings in Play Console.
  - New feedback.
  - Reply to reviews.
- [ ] **Monthly:**
  - Review the measures of success (section 2) and costs.
  - Note what changed.
- [ ] **Alerting:** an email when a source fails for several updates in a row, or the data file is older than 2 hours.
- [ ] Make the update job **save only when something changed**, plus a heartbeat, before ever running it more often than every 30 minutes.
- [ ] Connect the "SOON" competitions: each is a reason to subscribe and a "What's new" entry. Done: MotoGP and F3 (20 Oct 2026); rugby union, tennis, alpine skiing and the first Special, curling (29 Oct 2026). Still to do: Super League (once its 2027 fixtures are out) and more Specials.
- [ ] **Privacy-friendly growth:**
  - Landing page and FAQ.
  - Posts in sports forums and Facebook groups.
  - A gentle in-app "Enjoying it? Rate us" after a few weeks of use, using Google's in-app review prompt.
- [ ] **Gate G2 (3 months after launch):** keep going, change course, or keep it as a learning project.

## Phase 7: App Store (optional; Gate G3)

*You'll learn: Apple's developer programme, iPhone builds without a Mac, App Store review.*

- [ ] Join the **Apple Developer Program** (≈ £79 a year, as an individual; your legal name is shown as the seller).
- [ ] Set up **cloud iPhone builds** (Codemagic or similar; free monthly allowance, no Mac needed). Set up signing certificates through the service's guide.
- [ ] Add the iPhone versions of the platform layer: Apple in-app purchase through RevenueCat (same entitlement, `annual` at £3.65, with the same free month and free tier on the phone), and reminders.
- [ ] **What Apple checks for:**
  - Screens packaged inside the app (already true).
  - A visible **Restore Purchases** button (already in My account).
  - Price and the free month's terms on the paywall.
  - Links to Terms (or Apple's standard licence) and Privacy.
  - Enough phone features to count as an app, not a website (reminders; consider push notifications or a home-screen widget).
- [ ] **App Store Connect:**
  - Paid apps agreement, banking, tax forms.
  - Apple's **Small Business Program** (15% instead of 30%).
  - Privacy "nutrition label".
  - Age rating.
  - Screenshots for the required iPhone sizes.
  - Reviewer notes explaining the subscription and how to test it.
- [ ] **TestFlight beta** with a few iPhone users (Apple has no 12-tester rule), then submit for review. Plan for one rejection-and-fix round.
- [ ] Update the landing page with the App Store badge.

---

## Indicative timeline

| Weeks | Work |
|---|---|
| 1–2 | Phase 0: data rights emails, name, pricing; open the Google Play account; start recruiting testers |
| 2–4 | Phase 1: domain, hosting, data file move, privacy, terms, icons |
| 4–6 | Phase 2: Capacitor app, offline, reminders, internal testing |
| 6–7 | Phase 3: subscriptions and feedback |
| 7–9 | Phase 4: 14-day closed test |
| 9–10 | Phase 5: listing, review, staged launch |
| Then | Phase 6 ongoing; Phase 7 when Gate G3 says so (≈ 3–4 weeks) |

Waiting time (Google's checks, data-rights replies, the 14-day test, reviews) is a big part of this. Start the long waits first: the Google Play account, data-rights emails and tester recruitment can all begin in week 1.

## Decisions log

Record decisions here as they're made (date, what, why).

- 18 Oct 2026: plan written. Hosting on Cloudflare with the data file on the own domain; no separate login (the store account is the account); one-month free trial, then £3.65 a year; Google Form for feedback.
- 18 Oct 2026: **Capacitor instead of a Trusted Web Activity**, so the same code can go to the App Store (Apple rejects "website in a wrapper" apps). **RevenueCat** for subscriptions on both stores. Android first; the App Store is a separate decision (Gate G3). Reason: mainly a learning project, run with real-business detail, keeping the iPhone option open at little extra cost.
- 19 Oct 2026: **Football fixtures and scores from API-Football** (all six competitions), replacing the PL, UEFA, EFL and FA feeds. Free tier while building and testing; Pro (≈ $19 a month) for the live product. Reason: a documented, paid-for service instead of reading websites' hidden feeds; the focus is getting to market, accepting the risk that the supplier could stop (football-data.org is the fallback).
- 19 Oct 2026: **Rights position on football.** Fixture facts aren't owned by anyone (the 2012 *Football DataCo v Yahoo* ruling), so no Football DataCo licence is sought for fixtures. Scores are an accepted risk while the app is small: refreshed every 5 minutes (not live), not a selling point, and removable with one switch. The Football DataCo email is no longer needed for fixtures.
- 20 Oct 2026: **More football, from API-Football:** the Scottish Premiership (every game), and the Conference League and Women's Super League (televised games only). Reason: wider appeal at no extra data cost (one request each per update, well within the Pro plan).
- 29 Oct 2026: **The official ("golden") football feeds check API-Football once a day and win where they disagree.** Reason: API-Football was two days late with a game UEFA moved (Rennes v Olympiacos, 28 Oct). Once a day, rather than every update, to keep our footprint on those websites small. The old plan to retire them is dropped.
- 19 Oct 2026: **Name: Telly Fixtures; app ID `uk.co.tellyfixtures`; main domain tellyfixtures.co.uk.** Reason: says what the app does, covers every sport, friendly and British, distinctive (no similar app found), and all its domains were free. Considered: Derby Time(s) (exciting, but football or horse racing only, and confusable with Derby and the *Derbyshire Times*); TV Lineup (both words too generic); Front Row (crowded name); On Now (too close to Sky's NOW).
- 29 Oct 2026: **A personal Google Play developer account**, not an organisation one. Reason: George is a sole trader, and an organisation account needs a registered company and a D-U-N-S number first. Accepted in exchange: the 12-tester, 14-day closed test before launch, and a personal account can't become an organisation account later (the app would have to be transferred to a new account if a company is formed).
- 1 Nov 2026: **Every fixture source reads a full season calendar (or a date range), and a calendar event that can't be read shows a warning.** Reason: F1's "current or next weekend" feed hid the São Paulo GP on the evening of the Mexico race; a listing that silently misses an event is worse than one that says something is wrong.
- 1 Nov 2026: **Text a little smaller (main text 15, times 16, pills 12) and the whole navigation bar stays fixed at the top.** Reason: about 20% more listings fit on a screen, still following the phone's font size. Fixing only the icon row (letting the buttons scroll away) would free more room, but George chose to keep the bar as it is.
- 29 Oct 2026: **Gate G0 passed: going ahead without waiting for replies on data rights.** All 12 permission emails were sent and none has been answered. Reason: we asked for consent; objections are unlikely unless the app really takes off, and any that come will be dealt with as they arise (each source is its own module, so it can be switched off or replaced). Sources added since (MotoGP, F3, tennis, skiing, curling, rugby) weren't asked, under the same approach.
- 5 Nov 2026: **A Settings button at the top right, and reminders with a choice of 15, 30 or 60 minutes.** Reason: George's picture of the app: the usual place for personal choices, where Light/Dark moves to and managing the subscription will go. Built on the phone only (no server, no account), so a moved game's reminder updates when the app is next opened.
- 5 Nov 2026: **A Specials table in the back end: an event shows from a week before it starts until its last day.** Reason: a finished event's name shouldn't stay in the app, and each yearly event should come back by itself.
- 5 Nov 2026: **A listed event stays when its source fails; only a source that answers without it removes it.** Reason: George spotted MotoGP's sessions disappearing on a one-off "too many requests" answer. A failed read says nothing about the schedule.
- 5 Nov 2026: **Price: £3.65 a year after one month free, with only an email registration and no card; a promo code gives 3 months free.** This replaces the plan's Google Play trial and "no sign-in". Reason: George wants the free month to have no strings attached. Accepted in exchange: Google's trials and promo codes need a payment method, so the free periods run outside Google's billing, which adds email registration, account deletion, a small server of ours and personal data to look after. Fewer people are likely to go on to pay than with a card-first trial. The closed test will show how many.
- 5 Nov 2026, later the same day: **The email registration above is dropped. One month of full access with no card and no email, then a free tier: one sport (all its competitions), today only, with a new choice each week. A promo code gives 3 months of full access.** Reason: George wants as many people as possible to try it, and a new email would have reset the month anyway, so registering added a step and most of the extra build without limiting anything. Compared with a plain free and paid split, people see everything first. The free tier is deliberately strict so the loss is felt; it's easier to loosen later than to tighten. An empty day just shows the usual message, with no sales message added. "No sign-in", the store account as the account, and almost no personal data all stay as they were first planned.
- 5 Nov 2026: **The seller's address on Google Play is George's own, not a virtual address.** Reason: it costs nothing and needs no checking with Google, whereas it's unclear whether Google accepts a virtual address on a personal account. Accepted in exchange: his name and address are public once payments are set up (Phase 3). If the app picks up and moves to a company, the company's business address replaces it. The address itself is kept out of the repository while it's public.
- 5 Nov 2026: **Legal points wait for one review just before launch (Phase 5), with open points collected there as they come up.** Reason: George wants them dealt with together at the end. The privacy policy and terms are still drafted early, because Google needs the policy's address before the closed test. The ICO check moves there too.
