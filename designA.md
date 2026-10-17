# Design A – "Sport icons"

A trial redesign of the app for when it covers many sports. It lives in its own page,
**`design-a.html`**, next to the existing app (`index.html`). Both pages read the same `data.json`,
so they can be developed side by side until George decides which one to keep. `index.html`
is not changed by this design.

- Live app: `https://genanev.github.io/football-on-tv/` (unchanged)
- Design A: `https://genanev.github.io/football-on-tv/design-a.html` (once it's on `main`)
- Design A with sample events: `…/design-a.html?demo=3`
- Locally: `http://localhost:8123/design-a.html` (the `app` config in `.claude/launch.json`)

Design B ("follow & swipe": a first-visit sport picker and swipeable tabs) was also built and
then dropped on 17 Oct 2026.

## The idea in one screen

```
 Football on TV                        [☀ Light]
 UK times · updated 12 min ago
 ┌──────────────────────────────────────────────┐  ← sticky
 │ (★)    (⚽)     (🏁)       (⛳)   (🏏)    (◎ ›  │  sport icons, scroll sideways
 │ My TV Football Motorsport  Golf Cricket Oth… │
 │ Showing Football, Golf, Darts  [⚙ Customise] │  ← on My TV
 │ [All football] [Premier League] [Champions…  │  ← on a sport: competition chips
 └──────────────────────────────────────────────┘
 TODAY · SATURDAY 17 OCT
 ┌──────────────────────────────────────────────┐
 │ 12:30  Middlesbrough v Cardiff City          │
 │        [Champ] (Sky Sports+)                 │
 └──────────────────────────────────────────────┘
```

1. **My TV** (star icon) is the default view. The app always opens on it, and it shows only the
   competitions you ticked in **Customise**.
2. The **sport icons** open a whole sport, for example all football.
3. The **competition chips** under a sport narrow it to one competition, for example only the
   Europa League.

## Section grouping

The sports and their competitions are defined once, in `SPORTS` in `design-a.html`. Each
competition has an `id`, a full `name` (used on chips and in Customise), a short `tag` (the outlined
label on each listing), a colour, and its empty-day message (`none`).

| Sport (icon) | Competition | id | Tag | Data today |
|---|---|---|---|---|
| **Football** (ball, PL purple) | Premier League | `PL` | PL | ✅ |
| | Champions League | `UCL` | UCL | ✅ |
| | Europa League | `UEL` | UEL | ✅ |
| | Championship | `CHAMP` | Champ | ✅ |
| | FA Cup | `FAC` | FA Cup | ✅ (data `comp: CUPS`, `label: "FA Cup"`) |
| | EFL Cup | `EFL` | EFL Cup | ✅ (data `comp: CUPS`, `label: "EFL Cup"`) |
| **Motorsport** (chequered flag, F1 red) | Formula 1 | `F1` | F1 | ✅ |
| | Formula 2 | `F2` | F2 | ✅ |
| | Formula 3 | `F3` | F3 | soon |
| | MotoGP | `MOTOGP` | MotoGP | soon |
| **Golf** (flag on the green, green) | PGA Tour | `PGA` | PGA Tour | ✅ (data `comp: GOLF`, `source: pgatour.com`) |
| | DP World Tour | `DPWT` | DP World | ✅ (data `comp: GOLF`, `source: europeantour.com`) |
| **Cricket** (bat and ball, indigo) | Tests | `TEST` | Test | ✅ (data `comp: CRICKET`, "Test" in `session`) |
| | ODIs | `ODI` | ODI | ✅ (the rest) |
| | T20 internationals | `T20I` | T20I | ✅ ("T20" in `session`) |
| **Others** (dartboard, darts gold) | Darts | `DARTS` | Darts | ✅ |
| | Snooker | `SNOOKER` | Snooker | ✅ |
| **Specials** (trophy, pink) | Wimbledon & tennis | `SPECIAL_TENNIS` | Tennis | soon |
| | Tour de France | `SPECIAL_CYCLING` | Cycling | soon |
| | Athletics championships | `SPECIAL_ATHLETICS` | Athletics | soon |
| | Other big events | `SPECIAL_OTHER` | Special (or the event's own `label`, e.g. "NFL") | soon |

**Splitting data comps in the app (`compOf`).** The build writes one `comp` for both cups
(`CUPS`), for all golf (`GOLF`) and for all cricket (`CRICKET`). The page splits them as shown in
the table. Known gap: a golf major on both tours (merged by `sameEvent` in `golf.mjs`) counts
under whichever tour listed it first. If Design A is kept, the build should write the tour (and the
cricket format) itself.

**Adding a competition later:** add it to `SPORTS` (with `soon: true` until its source exists), give
it a colour token in all three colour blocks (light, dark media query, `[data-theme="dark"]`), and
make the build write that `comp` id. When the source is ready, remove `soon`.

## "Soon" states (competitions with no data yet)

A competition marked `soon: true` is shown everywhere, so people can see what's coming and pick it
in advance:

- **Chips and Customise:** its name has a small, faded uppercase **SOON** after it
  ("MotoGP SOON").
- **When its chip is selected:** a dashed, neutral (not yellow) note above the days says
  "*MotoGP isn't connected yet. Its listings will appear here once it is.*" Every day is still
  listed with the competition's own empty message ("No MotoGP sessions").
- **Customise:** it can be ticked like any other competition and is ticked by default, so it
  appears on My TV by itself as soon as it's connected.
- **Whole sport / My TV:** no note. A sport with no data at all (Specials today) just shows its
  empty message on every day ("No big events on TV").
- **`?demo=3`** hides the note, because `preview-data.json` has made-up events for MotoGP and
  Specials. They carry `sample: true` and show a dashed grey **SAMPLE** tag next to the
  competition tag. The yellow demo banner says the week is real plus made-up events.

## My TV view

- **Default:** the app opens on My TV every time. It doesn't remember the last sport you looked
  at, because My TV *is* your default view.
- **What it shows:** every listing whose competition is in your picks, merged into one list
  grouped by day.
- **Summary line** (under the icons): "Showing **everything**" when everything is ticked, otherwise
  whole sports by name and single competitions by tag, for example "Showing **Football, Golf, ODI,
  T20I, Darts**". Long summaries end in "…".
- **Customise button** opens a sheet that slides up from the bottom (`<dialog>`), titled
  *Customise My TV*:
  - one card per sport: its icon, its name, a count ("All", "2 of 3", "None") and a **switch**
    for the whole sport. The switch is on when all competitions are ticked, off when none are,
    and in a half-way position when some are. Tapping it turns the whole sport on (or, if
    everything was on, off);
  - a toggle chip per competition ("✓ Premier League" when on, "+ Champions League" when off,
    tinted in the sport's colour);
  - "Select everything" and "Clear all" at the bottom; **Done** (or tapping outside the sheet)
    closes it.
  - Changes apply straight away. Done returns to My TV.
- **Saved on the phone:** `localStorage` key `myComps` (a list of competition ids). The first
  visit has everything ticked. It doesn't touch the main app's saved `filter` or `theme`
  (`theme` is shared on purpose, so both pages use the same Light/Dark choice).
- **Empty states:** a day with nothing says "Nothing on TV from your picks". If nothing is
  ticked at all, a note says "My TV is empty. **Pick your sports** to fill it." (the link opens
  Customise).
- Known gap: a competition added to `SPORTS` later isn't ticked for someone who has already saved
  picks. Fix if needed by also saving the list of competitions that existed when they saved.

## Navigation details

- **Sport icon row** (`.rail`): 48 px round icons with the sport's name under them, 66 px apart,
  scrolling sideways (about 5½ fit on a 390 px phone, so the cut-off one hints at more). The
  edge fades when more icons are hidden that way. The selected icon fills with the sport's colour
  and the icon turns white. Icons are inline line-drawn SVGs that follow the text colour (`ICON`).
- **Competition chips** (`.chips`): "All football", then one per competition, scrolling
  sideways. The selected chip is filled dark (light in dark mode) and scrolled into view.
- The icons and chips/summary stay **sticky** at the top; a hairline appears under them once the
  list scrolls beneath. Switching view jumps back to the top of the list.

## Listings

Same cards as the main app, with these changes:
- The outlined tag shows the competition's own tag and colour from `SPORTS` (cup ties show their
  cup, specials can bring their own `label`).
- Sample events get the extra **SAMPLE** tag.
- All of `main`'s rules are kept: LIVE NOW, FT/P–P, scores, a channel pill and a note never
  together, "…to be confirmed" hidden once started, "Also on…", the conflict warning.
- **Banners:** one per failed source, shown only when the view includes a competition that
  source feeds (same wording as `index.html`; mapped to competition ids in `render()`).
- Every day of the 8-day window is listed. Empty-day messages: My TV "Nothing on TV from your
  picks"; whole sport "No televised football" / "No motorsport sessions" / "No televised golf" /
  "No international cricket on TV" / "No televised darts or snooker" / "No big events on TV";
  single competition: its own message (e.g. "No scheduled PL games", "No televised FA Cup ties",
  "No F1 sessions").

## Files

| File | What |
|---|---|
| `design-a.html` | The whole Design A page (copy of `index.html`'s card/data code plus the new navigation). No manifest link, so "Add to Home Screen" saves `design-a.html` itself, named "Design A". |
| `preview-data.json` | For `?demo=3`: the real `data.json` of 17 Oct 2026 plus four made-up events (`sample: true`): MotoGP Australian GP race and Malaysian GP sprint, NFL London Game, World Gymnastics Championships. |
| `designA.md` | This file. |

**Keeping the two pages in step:** `design-a.html` duplicates `index.html`'s data loading,
`matchHtml` and banner code. A change to how listings look or which sources exist must be made in
both until one design is chosen. If Design A wins, its navigation replaces the tabs in
`index.html`, and `design-a.html` and `preview-data.json` can be deleted.

## Open questions for George

- Section names: "Others" vs "More"; "Specials" vs "Big events".
- Should the icon row hide sports you never pick, or always show all six?
- App name: with Specials and six sports, "Football on TV" may no longer fit (already an open item).
