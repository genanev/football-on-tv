# Google Play listing: Telly Fixtures

Drafted 7 Nov 2026 for the closed test. It describes the app as it is now: **no price, free month or
free tier yet** (subscriptions aren't built), and **no scores**, in words or pictures (George's rule: they
may have to be removed). Before launch, add the pricing (Phase 5 of `playStorePlan.md`) and remake the
pictures (`npm run store-images` in `app/`).

The pictures are in `app/store/listing/`; the icon is `app/store/telly-fixtures-play-store-512.png`.

---

## 1. Main store listing

Play Console: **Grow users → Store presence → Store listings** (the default listing, English (United
Kingdom)).

**App name** (30 characters at most):

```
Telly Fixtures
```

**Short description** (80 characters at most):

```
What sport is on UK TV, with UK times and channels. No ads. No betting.
```

**Full description** (4,000 characters at most):

```
No ads. No betting. Just what's on TV.

Telly Fixtures shows what sport is on UK TV today and for the next seven days, with UK times and the channel it's on.

WHAT'S COVERED
• Football: Premier League, Champions League, Europa League, Championship and Scottish Premiership, plus televised Conference League, Women's Super League, FA Cup and EFL Cup games
• Motorsport: Formula 1, Formula 2, Formula 3 and MotoGP qualifying, sprints and races
• Rugby union: Premiership, Champions Cup, Nations Championship and Six Nations
• Golf: PGA Tour and DP World Tour rounds on UK TV
• Cricket: men's internationals, with every England match
• Tennis: the four Grand Slams, the ATP Finals and the WTA Finals
• Darts, snooker and alpine skiing
• Specials: big one-off events, such as the European Curling Championships

CHANNELS YOU CAN TRUST
A channel is shown only when the broadcaster's own TV listings confirm it. Until then, the app says "TV channel to be confirmed", and it tells you when a game isn't shown live on UK TV, so you're never left guessing.

MY TV
Tick the sports and competitions you follow, and My TV shows just those, every time you open the app. Pick a day to see only that day's sport.

REMINDERS
Tap a fixture and choose 15 minutes, 30 minutes or an hour before it starts. Your phone reminds you, even with the app closed. A small bell shows the ones you've set.

MADE FOR YOUR PHONE
• All times in UK time
• Light and dark themes
• Follows your phone's text size
• Works offline with the last listings it loaded
• No account or sign-in

Telly Fixtures is independent and isn't connected to any broadcaster, league or competition.
```

**App icon:** `app/store/telly-fixtures-play-store-512.png` (512×512).

**Feature graphic:** `app/store/listing/feature-graphic.png` (1024×500).

**Phone screenshots**, in this order:

1. `1-my-tv.png`: My TV, today's sport, with a reminder set (light)
2. `2-football.png`: the Football view and its competitions (dark)
3. `3-reminder.png`: setting a reminder (light)
4. `4-customise.png`: Customise My TV (dark)
5. `5-pick-a-day.png`: one day picked (light)
6. `6-motorsport.png`: the Motorsport view (dark)

Leave the tablet, Chromebook and video sections empty.

---

## 2. Store settings

Play Console: **Grow users → Store presence → Store settings**.

| Question | Answer |
|---|---|
| App or game | App |
| Category | Sports |
| Tags | Up to 5 from Google's list: pick sports-related ones, e.g. "Sports news" or "Sports schedules", if offered |
| Email address | support@tellyfixtures.co.uk |
| Phone number | Leave empty |
| Website | https://tellyfixtures.co.uk |
| External marketing | Up to you (it lets Google show the app in its ads outside Play) |

---

## 3. App content (the policy forms)

Play Console: **Policy and programs → App content** (or **Monitor and improve → Policy and programs**).
Each section has a **Start** or **Manage** button.

| Section | Answer |
|---|---|
| **Privacy policy** | https://tellyfixtures.co.uk/privacy |
| **App access** | All functionality is available without any access restrictions |
| **Ads** | No, my app does not contain ads |
| **Content rating** | See below |
| **Target audience and content** | Ages 18 and over only. Not designed to appeal to children |
| **News apps** | No, it isn't a news app |
| **Data safety** | See below |
| **Government apps** | No |
| **Financial features** | My app doesn't provide any financial features |
| **Health apps** | None of these (no health features) |
| **Advertising ID** | No. The app doesn't use it (its permissions are internet, notifications, and starting after a restart for reminders) |

### Content rating (IARC questionnaire)

- **Email address:** support@tellyfixtures.co.uk
- **Category:** All other app types (it isn't a game, social or communication app, or a reference,
  news or educational app)
- **Violence, sexual content, bad language, drugs, alcohol or tobacco:** No to all
- **Gambling:** No. There's no real or simulated gambling, and no betting odds or links to betting
- **Users can interact or exchange content with each other:** No
- **Shares the user's current physical location with other users:** No
- **Lets users buy digital goods:** No, for now. **Change this to Yes when subscriptions are added.**
- **Unrestricted internet access (a web browser or search engine):** No
- **Is it a web browser or search engine:** No

Expected result: the lowest rating (PEGI 3, "Everyone").

### Data safety

**Does your app collect or share any of the required user data types?** No.

Why that's true today:
- No account or sign-in.
- No analytics and no crash reporting.
- My TV choices, the theme and reminders stay on the phone.
- The listings are downloaded from data.tellyfixtures.co.uk, and nothing about the user is sent with
  the request.

Google then skips the remaining data questions. **This changes when subscriptions arrive**, because
RevenueCat and Google Play Billing handle purchase history and an app user ID: update the form then
(Phase 3 of `playStorePlan.md`).

---

## Before launch

- Add the price, the free month, the free tier and promo codes to the full description (without scores).
- Content rating: answer Yes to digital purchases.
- Data safety: declare purchase history and the app user ID.
- Remake the screenshots with `npm run store-images` in `app/`, so they show current fixtures.
