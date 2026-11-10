# Closed test: Telly Fixtures

Drafted 8 Nov 2026 (Phase 4 of `playStorePlan.md`). Google's rule for a new personal account: **at least
12 testers opted in for 14 days in a row**, then apply for production. The test starts with 1.0.8, before
subscriptions; new versions, the subscriptions one included, reach the same testers during it (George,
8 Nov 2026).

What testers commit to: an Android phone, opting in and staying in for 14 days in a row, using the app
a few times a week, and a few lines of feedback. No test logs.

---

## 1. Recruiting (send first)

Aim for 15–20 people, so a few drop-outs don't matter. Good testers: Android users who watch sport on
UK TV and will answer a message; a mix of sports; a few different phones, ideally one older or smaller.
Not iPhone users.

**Message 1, to ask** (WhatsApp, text or email):

```
Hi! I've built an app called Telly Fixtures: it shows what sport is on UK TV over the next week, with UK times and the channel. Before Google lets me publish it, 12+ people need to test it for two weeks.

Would you help? You'd need an Android phone (not iPhone). It's free, there are no ads, and it's about two weeks of using it now and then, plus a few lines of feedback at the end.

If you're in, send me the Gmail address you use for the Play Store on your phone.
```

Add each address to the testers' email list in Play Console (section 2, step 3).

---

## 2. Setting up the closed test in Play Console (George)

1. **Test and release → Testing → Closed testing.** Use the track Google made ("Closed testing" or
   "Alpha"), or **Create track**.
2. **Countries / regions:** add **United Kingdom** (testers elsewhere can't install it).
3. **Testers tab:** tick the email list (**TF Test**, the one internal testing uses, or a new one), and
   set the **feedback** address to support@tellyfixtures.co.uk. Save. **Copy link**: that's the joining
   link for message 2.
4. **Releases:** the simplest way is **Internal testing → Releases → Promote release → Closed testing**,
   which sends 1.0.8 there unchanged. Add the same release notes.
5. **Publishing overview → Send changes for review.** This is Google's first review of the app and its
   listing: it can take from a few hours to several days. The app's temporary name
   ("uk.co.tellyfixtures (unreviewed)") changes to Telly Fixtures once it passes.
6. When the review is through, send message 2.

From then on, a new version goes to closed testing as well as internal testing (or straight to closed
testing): testers get it as an ordinary Play Store update, and their 14 days carry on.

Later, before the subscriptions version: **Setup → License testing**, add the testers' addresses, so
their purchases are test purchases and nobody is charged.

---

## 3. Joining (send once Google's review is through)

**Message 2, the testers' guide:**

```
Thanks for helping test Telly Fixtures! Here's what to do:

1. On your Android phone, open this link, signed in with the Gmail address you gave me:
   [JOINING LINK]
2. Tap "Become a tester", then the link to download it from the Play Store.
3. Please stay in the test for at least 14 days, and keep the app installed. If you leave and rejoin, Google's 14 days start again.

Things to try:
- My TV Choice: tick the sports and competitions you follow.
- Pick a day, or the channels you have (e.g. Tuesday on TNT Sports).
- Tap a fixture to set a reminder (Android will ask whether the app may send notifications).
- Settings (the gear, top right): light or dark.

What I'd love to hear: anything wrong or confusing, a game or channel that's missing, and whether you'd keep using it.

To send feedback: the Play Store's Telly Fixtures page has a private feedback box only I can see, or email support@tellyfixtures.co.uk, or just message me.

Coming during the test: a free month and then a small yearly subscription will be added. You won't be charged anything.
```

---

## 4. During the test

- **Day 7, the midway reminder:**

```
Thanks for testing Telly Fixtures! We're halfway there. Please keep the app installed and stay in the test for another week. Any feedback so far, good or bad, is very welcome.
```

- **Day 14, the last message:**

```
That's the two weeks! Thank you. Two last questions, if you have a minute:
1. Anything you'd change or add?
2. Would you pay £3.65 a year (about 1p a day) for it? Why or why not?
```

- Check Play Console's **Testers** count now and then: it needs to stay at 12 or more for 14 days in a
  row. Someone who leaves can rejoin, but their 14 days start again.

---

## 5. Test log

Google asks about this when applying for production: how recruiting went, whether testers used every
feature, a summary of the feedback and how it was collected, what changed because of it, and how you
decided it was ready. Note things here as they happen.

| Date | What happened (testers joined, feedback, fixes, versions) |
|---|---|
| 8 Nov 2026 | Closed testing (Alpha) with 1.0.8, the store listing and App content sent for Google's first review at 13:02; status Published (seen 10 Nov). Recruiting starts. |
| | |
