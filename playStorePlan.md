# Plan: from personal web app to a paid app on Google Play (and later the App Store)

First written 18 Oct 2026; revised the same day to use Capacitor so the app can go to Apple's App Store later. Tick items off (`[x]`) as they're done, with the date next to big ones. Record every decision in the **Decisions log** at the end.

This is run like a real business project: clear goals, decision gates, a budget, a risk register and measures of success. The aim is mainly learning, so each phase also says what you'll learn.

Google's and Apple's rules, prices and free tiers below were right as of mid-2026. Check each one against the provider's current pages when you reach that step, because they change.

---

## 1. Goals

**Product:** a UK app showing what sport is on TV today and the next 7 days, with UK times and the confirmed channel. It's for a wide audience: **no ads, no betting, no tracking**.

**Business model:** a subscription, advertised as **"1p a day" = £3.65 a year**, paid annually, after a free trial.

**Launch scope:**
- **Google Play first.**
- **Built so the same code can go to Apple's App Store later** without starting again. The App Store is a separate decision (Gate G3).

**In the app at launch:**
- The current features (My TV, sports, competition chips, day picker).
- A **paywall** with the free trial.
- A **My account** screen.
- A **Feedback** button.
- A privacy policy and terms.
- Works offline.
- **Match reminders** ("remind me 30 minutes before"): the first phone feature, useful on its own and needed for Apple later.

**Not in scope for launch:** an iPhone version, sign-in accounts, push notifications sent from a server, rugby/MotoGP/Specials data, countries other than the UK.

## 2. Measures of success

Look at these monthly once launched. The targets are starting guesses; adjust them after the first three months.

| Measure | Where it comes from | First target |
|---|---|---|
| Installs | Play Console | 500 in the first 3 months |
| Trial → paid conversion | RevenueCat | 30% or more |
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
- **No sign-in at launch.** The store account (Google, later Apple) is the person's account, and RevenueCat remembers the subscription against it.
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
| A data source objects to commercial use, or the store removes the app after a rights complaint | Medium | High | Phase 0: permission or licences before launch; one module per source, so any one can be swapped |
| Football DataCo objects to scores (live match data; its 2013 win against Sportradar) | Low while small | Medium | **Accepted risk (George, 19 Oct 2026).** Fixtures are facts. Scores are refreshed only every 5 minutes (never live), are **not a selling point** (not in the store listing or paywall), and sit behind one switch so they can be removed quickly. Review if the app grows or DataCo makes contact |
| API-Football stops operating, changes terms or raises prices | Low–Medium | High (all football) | Accepted for now: focus on getting to market. Its own source module, so a swap is like-for-like; football-data.org is the known fallback (PL, Championship, UCL free; the rest paid) |
| A source changes its website and stops answering | High (happens often) | Medium | Already handled: each source fails on its own, with yellow banners and the keep rule. Add an email alert (Phase 6) |
| Google rejects the app or delays production access | Low–Medium | Medium | Follow the store checklist (Phase 5); complete the 14-day closed test properly; keep notes for Google's questions |
| Apple rejects the app as "just a website" (rule 4.2) | Medium if done thinly | Medium | Screens packaged inside the app, offline mode, reminders, and later push notifications or a widget |
| Too few people pay | Medium | Medium | Free trial; measure conversion; consider a free tier at Gate G2 |
| The name clashes with an existing app or trademark | Medium | Medium | Check before the first upload (the Android package name can't change afterwards) |
| Losing the app's upload key or account access | Low | High | Play App Signing; keys and passwords in a password manager with a backup; two-step sign-in on every account |
| A key or token expires unnoticed (e.g. the GitHub key, Oct 2027) | Medium | Medium | Expiry dates in a calendar; moving the data file off GitHub (Phase 1) removes the GitHub key |
| Icon licence unclear | Medium | Medium | Confirm the pack's licence or replace the icons before launch (Phase 1) |
| Costs grow with users | Low | Low | `data.json` is ≈ 10 KB compressed; free tiers cover many thousands of users |
| Personal workload (support, fixes) | Medium | Medium | Feedback via a form and sheet, a FAQ, a 3-day reply target, store refunds handled by the stores |

---

## Phase 0: decisions and groundwork

*You'll learn: what makes an app legal to sell, naming and branding, pricing.*

- [ ] **Data rights (Gate G0).** Today's sources are the unofficial feeds and pages behind each website. That's fine for personal use, but most of these sites' terms forbid commercial reuse. For each source, decide **keep with permission / replace / licence**, and record it below.
  - **Ask:** governing bodies (FA, WST, PDC, the golf tours, ICC) may be happy to be listed and linked. Get written permission.
  - **Football fixtures:** fixture lists themselves have weak UK legal protection (the 2012 *Football DataCo v Yahoo* ruling), but Football DataCo still sells licences for Premier League/EFL fixtures. Worth an hour with a solicitor or the IPO's free advice service, rather than guessing.
  - **TV listings:** a commercial TV guide (EPG) feed, or the broadcasters' partner/affiliate schemes. Some pay you for links to their sign-up pages, which could become a second income without breaking the no-ads principle.
  - **Licensed sports data APIs:** some sell fixtures (some with TV channels) at small-business prices. Compare a few.

| Source | Decision | Cost | Evidence (email/licence) |
|---|---|---|---|
| Premier League fixtures and scores | **Replace** with API-Football (19 Oct 2026) | Free while building; Pro ≈ $19/month live | Fixtures treated as facts; scores an accepted risk (see risk register) |
| Premier League broadcaster feed | | | |
| UEFA (UCL, UEL) | **Replace** with API-Football | (same subscription) | as above |
| EFL (Championship, League Cup) | **Replace** with API-Football | (same subscription) | as above |
| FA (FA Cup fixtures) | **Replace** with API-Football | (same subscription) | The FA's "Live on" TV pick: still ask the FA, or rely on the TV guide |
| F1 / F2 | | | |
| PDC | | | |
| PGA Tour / DP World Tour | | | |
| WST | | | |
| ICC | | | |
| Sky TV guide / Sky Sports pages | | | |
| TNT Sports | | | |
| Prime Video | | | |

- [x] **Name and brand (19 Oct 2026): Telly Fixtures.**
  - [x] Name chosen: **Telly Fixtures**. Store title along the lines of "Telly Fixtures: Sport on UK TV".
  - [x] No clashing app found in the stores; trademark register checked by George (no conflict).
  - [x] App ID: **`uk.co.tellyfixtures`** (Android and, later, Apple). **It can't change after the first upload.**
  - [x] Domains registered on Cloudflare (19 Oct 2026): **tellyfixtures.co.uk** (the main one, which the app ID matches) and **tellyfixtures.com**, auto-renewing yearly. tellyfixtures.app deliberately skipped (optional; can be bought later if still free).
  - [ ] Rename the app itself (title, manifest, icons, footer) in Phase 1.
- [ ] **Pricing.** Recommended: **one-month free trial, then £3.65 a year**. The alternative, a free tier with the full week and My TV paid, gets more installs but is more to build. Decide before Phase 3.
- [ ] **"1p a day" wording.** UK advertising rules (the CAP code) allow it if the real price is just as clear: "£3.65 a year – that's 1p a day", with the trial terms beside it.
- [ ] **UK only at launch** (it's UK TV). This also avoids the EU's extra seller rules: EU stores must show a seller's address and phone number.
- [ ] **Your public details.** Paid apps show the seller's contact details. Decide whether to use your home address or a virtual business address (≈ £5–15 a month), and set up a support email on the domain.
- [ ] **Sole trader or limited company before opening the store accounts?** George is a sole trader (19 Oct 2026). Moving the domains to a company later is easy. A Google Play *personal* account can't become an *organisation* account: the app would have to be transferred to a new account. An organisation account:
  - skips the 12-tester closed test;
  - shows the company's address instead of yours;
  - needs a registered company (£100) and a free D-U-N-S number (can take weeks);
  - means yearly accounts (often a few hundred pounds with an accountant).

  Talk to an accountant before Phase 2.
- [ ] **Accounts and security.** Use one Google account just for the business, with two-step sign-in. Keep everything in a password manager: store accounts, keys, recovery codes.

## Phase 1: product readiness on your own domain

*You'll learn: domains and DNS, hosting, cloud storage, privacy law basics.*

- [x] Buy the domain and have its DNS on Cloudflare: done 19 Oct 2026 (registered on Cloudflare, so its DNS is already there).
- [ ] Set up the support email (Cloudflare Email Routing, forwarding to Gmail; free).
- [ ] **Football fixtures from API-Football** (decided 19 Oct 2026):
  - A new source module (`apiFootball.mjs`) for the six competitions, built and tested on the free tier (100 requests a day).
  - Run it **side by side with the current official feeds for about two weeks**, comparing kick-off times, moved games, postponements and team names. Then switch the app over and retire the PL, UEFA, EFL and FA fixture readers.
  - Store the API key in Google Cloud Secret Manager, never in the code.
  - Move to the Pro plan just before launch (Phase 5).
- [ ] **Scores every 5 minutes, not live** (decided 19 Oct 2026). After the storage move below:
  - A small scores-only update every 5 minutes, only while a game is on: one request covers all six competitions.
  - The full update stays every 30 minutes.
  - One switch turns scores off everywhere, in case they have to be removed.
- [ ] Change the update job to **upload `data.json` to storage** (Cloudflare R2 or Google Cloud Storage) on the domain, instead of committing it to GitHub every 30 minutes.
  - Keep the GitHub commit for a few weeks as a fallback, then stop it.
  - This also removes the GitHub key that expires in Oct 2027.
- [ ] Host the website on **Cloudflare Pages** (free, commercial use allowed; GitHub Pages' terms don't allow a business). The public website becomes a **landing page** ("Get it on Google Play", screenshots, FAQ, contact, privacy, terms). The full web app stays available to you for previews.
- [ ] Make the GitHub repository **private**.
- [ ] **Privacy policy** in plain English. Cover:
  - What's stored on the phone: picks, theme, reminders.
  - That there's no tracking and no ads.
  - What the stores and RevenueCat process for purchases.
  - That feedback form answers are stored.
  - How to contact you, and who you are.
- [ ] **Terms of use:**
  - The subscription and the trial.
  - Cancelling and refunds, which go through the store.
  - "Listings can change: check with the broadcaster."
  - Apple's standard licence terms, if used later.
- [ ] **ICO:** do the ICO's self-assessment for the data protection fee and record the answer.
- [ ] **Icon licence:** confirm the 3D sport icons' licence and ownership (`sport-icons/README.md`), or replace them. Commission or design the app icon (512×512 for Play, 1024×1024 for Apple).
- [ ] **Accessibility:**
  - Text still fits when the phone's font size is increased.
  - Colour contrast meets WCAG AA in both themes.
  - Every icon button has a label for screen readers (TalkBack on Android, VoiceOver on iPhone).
- [ ] **Polish:**
  - Nothing that looks unfinished. "SOON" items are fine if clearly labelled.
  - Clear wording for errors and empty days.

## Phase 2: the app shell (Capacitor, Android first)

*You'll learn: how phone apps are built and signed, Android Studio, app versions.*

- [ ] Create the **Google Play developer account** (personal, $25). Do this early: identity checks take days, and Phase 4's 14-day test can't start without it.
- [ ] Install the tools on your PC: Node.js (already there) and Android Studio (free; it includes the Android SDK and Java). Get your Pixel 9 ready for testing (developer options, USB debugging).
- [ ] Create the `app/` folder: Capacitor project, app ID, name and icons. The web build step copies `index.html`, the icons and `sport-icons/` into it.
- [ ] Change the app to **download `data.json` from the domain**, keep the last copy on the phone, and show it offline with "Last updated …".
- [ ] Create the **platform layer**: small files for billing, reminders and "open subscription settings", each with an Android version and a stand-in for the web preview. Nothing else in the app knows which phone it's on.
- [ ] **Match reminders** (Capacitor Local Notifications: scheduled on the phone, no server). A bell on each fixture: "Remind me 30 min before". Android 13+ asks for permission the first time. Store reminders on the phone.
- [ ] **Versioning:**
  - Version numbers like `1.0.0`.
  - A `CHANGELOG.md` with one line per change, which becomes the store's "What's new" text.
  - Every store upload is tagged in git.
- [ ] **Signing:** let Google hold the app signing key (Play App Signing). Keep the upload key and its password in the password manager, with a backup.
- [ ] Upload to Play's **internal testing** track (just you) and test on the Pixel 9:
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

- [ ] **Payments set-up in Play Console:** payments profile, bank account, tax details (UK). Accept the paid apps terms.
- [ ] Create the subscription product: `annual`, **£3.65**, with the **one-month free trial**, available in the UK only.
- [ ] Create the **RevenueCat** account (free).
  - Connect Google Play to it: this needs a Google Cloud service account, and RevenueCat's guide walks through it.
  - Set up one entitlement (e.g. `full_access`) that the `annual` product unlocks. Apple's product will later unlock the same entitlement.
- [ ] **In the app:**
  - **Paywall:**
    - What you get.
    - The price: "£3.65 a year – 1p a day".
    - The trial terms: "free for 1 month, then £3.65 a year, cancel any time in Google Play".
    - Buttons: Subscribe and Restore purchase.
    - Links to Terms and Privacy.
  - **My account:**
    - Subscription status and renewal date.
    - Manage or cancel (opens the store's subscription page).
    - Restore purchase.
    - Feedback, Privacy, Terms, app version.
  - **Without a subscription:** decide what shows, from the Phase 0 pricing decision (e.g. the paywall over a blurred preview).
- [ ] **Feedback button:** opens a Google Form with the app version, phone type and current view filled in. Answers go to a Google Sheet, with "email me on new responses" ticked.
- [ ] **Protecting the data file:** at launch the app checks the subscription via RevenueCat and hides content without one. The data file itself is public but unlisted, which is acceptable at £3.65 a year. Later, if needed: a Cloudflare Worker that only serves the data file to apps with a valid RevenueCat subscription.
- [ ] **Test with Play's licence testers** (test purchases are free and renew every few minutes):
  - Start a trial.
  - Convert to paid.
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

- [ ] **Store listing:**
  - Name.
  - Short description (80 characters).
  - Full description, leading with "No ads. No betting. Just what's on TV.", and showing price and trial clearly. **Don't advertise scores** (here, in screenshots' captions or on the paywall): they may have to be removed.
  - Icon (512×512).
  - Feature graphic (1024×500).
  - 4–8 phone screenshots (light and dark).
  - Category: Sports.
  - Contact email, privacy policy link.
- [ ] **Data safety form:** what the app collects. Purchases go through Google and RevenueCat; there's no personal data otherwise. The feedback form is optional and user-initiated.
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
- [ ] Connect the "SOON" competitions (rugby, MotoGP, Specials): each is a reason to subscribe and a "What's new" entry.
- [ ] **Privacy-friendly growth:**
  - Landing page and FAQ.
  - Posts in sports forums and Facebook groups.
  - A gentle in-app "Enjoying it? Rate us" after a few weeks of use, using Google's in-app review prompt.
- [ ] **Gate G2 (3 months after launch):** keep going, change course, or keep it as a learning project.

## Phase 7: App Store (optional; Gate G3)

*You'll learn: Apple's developer programme, iPhone builds without a Mac, App Store review.*

- [ ] Join the **Apple Developer Program** (≈ £79 a year, as an individual; your legal name is shown as the seller).
- [ ] Set up **cloud iPhone builds** (Codemagic or similar; free monthly allowance, no Mac needed). Set up signing certificates through the service's guide.
- [ ] Add the iPhone versions of the platform layer: Apple in-app purchase through RevenueCat (same entitlement, `annual` at £3.65 with the same trial), and reminders.
- [ ] **What Apple checks for:**
  - Screens packaged inside the app (already true).
  - A visible **Restore Purchases** button (already in My account).
  - Price and trial terms on the paywall.
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
- 19 Oct 2026: **Name: Telly Fixtures; app ID `uk.co.tellyfixtures`; main domain tellyfixtures.co.uk.** Reason: says what the app does, covers every sport, friendly and British, distinctive (no similar app found), and all its domains were free. Considered: Derby Time(s) (exciting, but football or horse racing only, and confusable with Derby and the *Derbyshire Times*); TV Lineup (both words too generic); Front Row (crowded name); On Now (too close to Sky's NOW).
