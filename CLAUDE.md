# The Annual — project guide

The official historical website for **The Annual**, an annual Ryder Cup–style golf
trip. A private site for ~20 participants. Built with **Astro** (static output),
generated entirely from JSON data in `/data`.

> Naming: the event/site is **The Annual**. It was previously called "The Duel" /
> "The Duel Archive" — that name must not appear anywhere in the site. (The only
> remaining "Duel" string is the path to the owner's untouched source spreadsheet
> `The_Duel_Database_v1_0_Website_Ready.xlsx` in `scripts/gen_data.py`; rename the
> source file and update `SRC` if you want it gone entirely.)

## Core principles (do not break these)

1. **`/data` is the single source of truth.** Six JSON files hold every fact:
   `players.json`, `tournaments.json`, `matches.json`, `drafts.json`,
   `moments.json`, `awards.json`. Teams, rounds, courses, rosters, handicaps and
   round scores live nested inside `tournaments.json`.
2. **Never hardcode a stat.** Every record, percentage, series score, career
   line and head-to-head is computed **at build time** in `src/lib/stats.js`.
   Pages read from `stats.js`/`data.js` — they never contain a literal number
   that could go stale. If you need a new number, add a function to `stats.js`.
3. **IDs are kebab-case and referenced everywhere.** Players (`ben-urwin`),
   teams (`woodpeckers`, `silver-spoons`), tournaments (`st-george-2026`),
   rounds, courses, matches. Never repeat a name where an id will do.
4. **Match scoring convention:** win = 1, loss = 0, halved = 0.5 each. This drives
   the W-L-H record and win %. Kept separate from a match's *point value* (1 or 2)
   which feeds the team standings and a player's points earned / available.

### Two point concepts — keep them straight
- **Team standings** (the official 16.5–13.5): each match is worth its
  `pointsAvailable`; the winner takes it all, a halved match splits it. Computed
  in `matchTeamPoints()` / `tournamentStandings()`. Do **not** sum player
  `pointsEarned` to get team totals — both partners bank the full match value, so
  that double-counts.
- **Player points**: a player's own `pointsEarned` / `pointsAvailable` over the
  matches they played (e.g. Ben Urwin 7.5 / 8).
- **W-H-L ordering**: the workbook and the site display records as
  **Win–Halve–Loss** (Ben is 4-1-0, i.e. 4 wins, 1 halve, 0 losses).

## Stats & analytics engine (`src/lib/stats.js`)

Everything is computed from the raw match/scorecard data — never copied from the
workbook's precomputed cells. All **career** functions aggregate across every
tournament automatically; the **per-tournament analytics** take a `tid`.

Deeper stats (career-aggregating): `careerStats`, `formatRecords` (per RAW format
label — Individual Championship counts separately from ordinary Singles, matching
the workbook), `allPartnerships` / `partnershipsFor`, `headToHead` /
`opponentRecords` (carry points for each side), `roundSummary`, `playerLeaderboard`,
`playersComparison` (the sortable Players table).

Analytics (per-tournament, proxy models — keep the caveat `ANALYTICS_CAVEAT`
visible wherever they appear):
- **`handicapAnalysis(tid)`** — Expected Point % = `0.50 − 0.008 × (hcp − fieldAvg)`
  clamped to [0.30, 0.70]; Expected Points = Expected % × available; Overperformance
  = actual − expected. Flags Most Over/Underperformed. (Ben = Most Overperformed.)
- **`scorecardIndex(tid)`** — net-scoring index used inside draft value:
  `BestBall-vs-Hcp + Shamble-vs-Hcp + Stableford-vs-Field + Singles(±2)`, where a
  vs-Hcp round = `(fieldMeanGross − playerGross) + alloc × (playerHcp − fieldMeanHcp)`
  with **alloc 0.65** (18-hole Best Ball) and **0.30** (9-hole Shamble); Stableford =
  `playerPts − fieldMean`; Singles = +2 win / −2 loss / 0 halve. Field means over all
  players who posted that round. (These constants are calibrated to the 2026 round
  set; revisit for a different format mix.)
- **`draftValue(tid)`** — Composite = points earned + later-pick bonus (`0.2 × pick`)
  + scorecard index. Labels: **Best Draft Pick** (rank 1 → Chase, pick 10),
  **Draft Steal** (top-3 composite from pick ≥ 6 → Rupert), **Draft Miss** (early
  pick ≤ 4 landing bottom-3 → Alan, Colton).

### Verification (must stay green)
`node --import /tmp/reg.mjs /tmp/verify.mjs` cross-checks the computed stats against
the workbook's own stat sheets — 157 assertions across Player Statistics, Format
Records, Partnerships, Head-to-Head, Round Summary, Handicap Analysis, Scorecard
Index and Draft Value. All pass. (Node needs the JSON-import loader shim in
`/tmp/reg.mjs`; Astro/Vite import JSON natively.) If you change a formula, re-run it
and reconcile before shipping.

## Hole-by-hole scoring layer (`data/hole_scores.json`)

A seventh data file sits **under** the round-level data: one record **per player per
hole**, transcribed from the physical scorecards. It is additive — the round-level
`tournaments.json` scores and every existing stat are untouched; this layer only
adds depth.

- **Generated** by `scripts/gen_hole_scores.py` (the transcribed hole arrays live in
  that script — it is the source of truth for the raw reads). Re-run it to
  regenerate `data/hole_scores.json`.
- **Verified** by `scripts/verify_holes.mjs` (`node --import /tmp/reg.mjs
  scripts/verify_holes.mjs`) — 54 checks reconciling net round totals to the
  workbook, per-match holes-won to the recorded winner, and the R5 concessions.
  Keep it green alongside the 157-check `/tmp/verify.mjs`.

### The NET convention (critical)
Per the owner (who was there): **every scorecard records NET scores, except the
Round 1 Scramble, which is a team GROSS score.** So each row carries a `score_type`:
- `net` — R2 Best Ball, R3 Shamble, R5 Singles. `net_score` / `net_vs_par` /
  `net_result` are populated. These per-hole numbers are already net; birdies here
  are **net** birdies. True gross is **not** recoverable and is never shown.
- `stableford` — R4 Team Average Stableford. `stableford_points` is populated;
  `net_result` is derived from the points (3 = net birdie, 4+ = net eagle, 2 = par,
  1 = bogey, 0 = double+). Per-hole net stroke isn't on the card, so `net_score` is
  null (excluded from scoring-average maths).
- `team_gross` — R1 Scramble only. `team_gross` is the team's gross; `player` is
  null (`team_players` holds the pair). **Excluded from every individual stat.**
- **Conceded holes** (match already decided) have `conceded: true` and no score.
  R5 concessions: Michael/Anthony holes 17–18, Colton/Ed 16–18, Ben/Scott 16–17.
  Michael/Anthony are recorded through the 16th (net 86 / 92); the workbook's padded
  92 / 98 are deliberately **not** used here.

The sanity check that confirms net (not gross): Anthony Herring's R2 74 off playing
handicap 13 — as gross that's an impossible net 61, so the card must be net.

> **Known cross-dataset flag (unresolved by design):** the older Round-scores table
> and `records()` read the singles net from `tournaments.json`, which still holds the
> workbook's **padded** singles totals (e.g. Michael 92, Anthony 98). The hole layer
> shows the through-16 figures (86 / 92). These disagree for the three conceded R5
> matches. Left as-is per the owner's "flag, don't silently adjust" instruction —
> reconcile `tournaments.json` if the owner wants the table to match the cards.

### Hole stats in `stats.js` (all computed, all optionally `tid`-scoped)
- `playerHoleStats(playerId, tid?)` — net eagle/birdie/par/bogey/double buckets,
  scoring average vs par (stroke rounds only), best net round (ranked by net-vs-par
  so 9- and 18-hole rounds compare fairly), Stableford total, longest net-birdie+
  streak. `teamId` is read off the hole rows (players carry no fixed team).
- `mostNetBirdies(tid?)`, `lowestNetRounds(holeCount, tid?)`,
  `scoringAverageLeaderboard(minHoles, tid?)`, `holeStatsLeaderboard(tid?)`,
  `netRoundTotals()`.
- `matchScorecard(matchId)` — the per-match grid: player rows with net cells + Out/In/
  Tot, per-hole winner, and a **running match state that freezes at the closeout hole**
  (derived from the authoritative margin, e.g. 4&2 → decided at hole 16) so the card
  agrees with the badge. Scramble → two team-gross rows; Stableford → points + team
  totals (no holes-up, since it's decided on team average). Each cell carries a
  `bucket` (`eagle`/`birdie`/`par`/`bogey`/`double`, from the net result vs par — team
  gross vs par for the scramble) that drives **traditional scorecard notation** in
  `HoleScorecard.astro`: birdie = circle, eagle+ = double circle, bogey = square,
  double+ = double square, par = plain, conceded = concede marker. Circles take the
  row's team colour, eagles are gold, squares a neutral over-par ink; a small legend
  sits under every card. The running match state is drawn as **two rows, one per
  team, each from its own perspective** (Squabbit style: `2up` / `1dn` / `AS`) in the
  team's own colour, with "up" cells washed solid so you can read who led after every
  hole; both freeze at the closeout.
- `HOLE_STATS_COVERAGE` — the one-paragraph caveat; render it wherever hole stats show.
- `tournamentHasHoleData(tid)` / `tournamentsWithHoleData()` — the gate.

### Where it surfaces
- **Match pages** (`matches.astro` + St George Matches tab): `HoleScorecard.astro`
  under each match — the generated net grid. Renders nothing if the match has no hole
  data.
- **Scorecard images (archived, not displayed)**: the original card screenshots live
  in `public/scorecards/<year>/` (full PNG + JPG thumb) and are indexed by
  `data/scorecard_images.json` (`match_id → {full, thumb, shared}`), kept as a source
  archive. They were removed from the match pages once every card was transcribed —
  the generated grid is now the canonical view. `HoleScorecard.astro` no longer
  imports the map; re-wire it if you ever want to show the originals again. The
  regenerate step is the PIL block that crops the annotation banner and writes both
  sizes; R5 tee sheets carry two singles, so two matches can share one image.
- **Home**: no hole-by-hole section — the homepage stays title → 2026 results → The
  silverware → Next trip. (The net-birdies leaderboard lives on Stats/Records.)
- **Tournament Stats tab**: "Most net birdies" board + hole-record cards (lowest net
  round / nine, best scoring avg, longest streak) — replaced the old Net Stableford
  leaderboard now that real hole data exists.
- **Records**: career hole-record cards + a "Net birdie-making" leaderboard.
- **Player profile**: a "Net scoring" section (bucket tiles + avg / best round /
  streak / Stableford pts).

### Future-proofing (2027 and beyond — purely additive)
Adding a new year's scorecards changes **no component code**:
1. Transcribe the cards into `scripts/gen_hole_scores.py` (new `MATCHES` entries with
   the new tournament id + course pars/SIs) and re-run it.
2. Copy the card images into `public/scorecards/<year>/` and add their `match_id`
   entries to `data/scorecard_images.json` (the PIL block handles the resizing).
3. Done. Every leaderboard, profile, match grid and record recomputes, because the
   hole functions accept a `tid` and each surface gates on `tournamentHasHoleData`.
   An event with **no** scorecards simply shows none of the hole UI.

## Trip photos (`data/photos.json`)

The per-event photo album. `data/photos.json` is a **flat JSON array**, one object
per photo, **in display order** (curated: highlights first, then scenery). Fields:
`id`, `tournamentId`, `full` + `thumb` (paths under `public/photos/<year>/<event>/`),
`w`/`h` (pixels of the full), `alt` (a **neutral** description — no player-name
guesses), and two optional links: `momentId` (ties the photo to a moment) and
`playerIds` (an array, ties it to players). Helpers in `stats.js`:
`photosForTournament(tid)`, `photosForMoment(momentId)`, `photosForPlayer(playerId)`.

The grid + lightbox are a **reusable component**, `PhotoGallery.astro`
(props: `photos`, `galleryId`) — a responsive grid of square thumbnails opening a
**swipeable lightbox** (prev/next, counter, caption, arrow-keys, touch-swipe,
Esc/backdrop to close). It moves its fixed overlay to `<body>` on init so it works
from any tab. Anything **elsewhere on the page** can open a gallery at a specific
photo by carrying `data-open-gallery="<galleryId>"` + `data-full="<that full url>"`.

Where it surfaces:
- **Tournament Photos tab** (`TournamentCompleted.astro`, `galleryId="sg"`) — only
  shown when the event has photos; with a **"Full album →"** button → `albumUrl`
  in the frontmatter (a `'#'` placeholder until the owner drops in the shared link).
- **Overview tab** leads with the `featured` photo (the whole-field shot) as a
  banner that opens the album (`data-open-gallery="sg"`).
- A photo with a **`momentId`** renders inside that **moment card** and opens the
  album at that image.
- **Player profiles** (`players/[slug].astro`) get a **Photos** section
  (`photosForPlayer`) using the same component — e.g. Michael Herring's champion's
  jacket, Tom Brunskill's portraits.
- **Teams tab**: the Woodpeckers **victory art** (`woodpeckers-victory.jpg`) leads
  the champions' side as a banner (it's illustration, not a gallery photo, so it's
  referenced directly, not in `photos.json`).

Adding a year's photos (purely additive, no component changes): web-optimise them
(sips: full ~1600px q82, thumb ~560px q68 — sips bakes in EXIF rotation and
converts HEIC/PNG) into `public/photos/<year>/<event>/`, then append records to
`photos.json`. Attach to a moment/player only when the match is **unambiguous**
(the scoreboard, trophy shots, clear group shots); leave anything you can't verify
in the main gallery rather than guessing an attribution.

## Player portraits (`public/players/`) — photo-first Players pages

Players are presented photo-first: a **wall of faces** at the top of `/players`
and a **trading-card header** at the top of every profile. Both are fed by one
convention — **the filename is the wiring**.

- Drop a portrait at **`public/players/<player-id>.jpg`** (the `id`/`slug` from
  `players.json`) and it replaces that player's placeholder on the next build.
  No JSON to edit, no component to touch. `.jpeg`/`.png`/`.webp`/`.avif` also
  resolve, in that preference order after `.jpg`.
- **`src/lib/portraits.js`** reads the folder at build time (`fs.readdirSync`,
  path resolved off `import.meta.url` so it holds wherever the build runs) and
  exposes `playerPortrait(id)`, `playersMissingPortraits()`, `playerInitials()`
  and `portraitSun(id)`. It also `console.info`s the still-missing ids on every
  build — that's the "who still needs a photo" list.
- **`PlayerPortrait.astro`** renders the photo *or* the placeholder in the same
  **4:5** frame, so a dropped-in file lands exactly where the placeholder sat.
  The placeholder is a miniature of the sunset banner — orange sky, navy dune,
  initials in Fraunces — with the sun position and one of three dune silhouettes
  chosen deterministically off the player id, so the photo-less tiles read as a
  matched set rather than as broken images. **It is a designed state, not a gap:
  don't replace it with a grey avatar.**
- **`PlayerCard.astro`** is the wall tile: portrait, then a **team-colour gutter**
  (crest in a white chip + tournament handicap — the scorebug's centre-gutter
  idea turned on its side), then name, nickname and **two headline numbers: one
  settled, one live**. Win rate (career) sits in ink; the **power ranking**
  (`powerRankings().rows` → `rank`) sits beside it in terracotta, the accent for
  things that move between trips. Rookies swap the career cell for their handicap
  index. A player with no GHIN check-in has `rank: null` — or no ranking row at
  all — and shows **"—"**, never a guessed number.
  **Career points are deliberately NOT on the card**: points available change with
  each edition's format mix, so a raw career total isn't comparable across years
  the way a win rate is. (The full points columns live in the table below, where
  `Pt %` carries its own denominator.) Rookies get the gold **ROOKIE** pill on the photo
  and a navy "Debuts <year>" gutter; the Champion Golfer gets a gold crown.
  Two-up on phones, where the gutter drops the handicap so the team name fits.
- **Profile header** (`.tcard` in `players/[slug].astro`) is the same object at
  reading size: team bar across the top, portrait filling the left column, then
  name / nickname / **team history** (one row per appearance, so it grows by
  itself) / pills, with the headline numbers along the bottom. The old separate
  `.tiles` row was folded into it — every number and sub-line survived, it just
  moved inside the card. Everything else on the profile sits below, unchanged.
- The portrait cell uses an in-flow `.tcard__ratio` spacer for its 4:5 floor and
  an absolutely-positioned image on top. An `aspect-ratio` on the cell itself
  defeats the grid stretch and leaves a gap under the photo — don't "simplify"
  it back. Likewise `.pportrait` needs `height:auto`, or the `<img>`'s `height`
  attribute wins over the aspect ratio.
- **`scripts/gen_portraits.py`** cuts the two portraits that only exist as album
  frames (Tom Brunskill from `sg26-11`, Michael Herring from `sg26-15`) down to
  4:5 head-and-torso. Crop boxes are fractions of the source, so they survive a
  re-export. Everyone else's portrait is expected to be dropped in by hand;
  `public/players/README.md` is the note for the owner on how.

## The Trip hub (`data/trip-2027.json`) — the lead-up page

An upcoming event's page is the one everyone checks *before* the trip, so it
carries a **Trip** tab: the official programme. Tabs are Overview · **Trip** ·
Draft Pool · Draft Guide (the Trip tab only appears when a planner file exists).

### The planner file — this is the one the owner edits
`data/trip-<year>.json` is a **single JSON object**, hand-edited the same way as
the handicap check-ins (often from a phone via the GitHub web editor, which
auto-deploys). Loaded and validated in `src/lib/data.js` → `validateTrip()`;
read with **`tripFor(tournamentId)`**.

**Everything is optional.** A missing section doesn't render; a `null` value
renders as a deliberate **TBA**. That is the whole design goal — the page has to
look finished on day one with nothing booked, and fill in as things get locked.
If anything is malformed the **build fails with a message naming the exact
field** (`costs.items[1] ("Golf") → "amount" must be text in quotes…`).

```jsonc
{
  "tournamentId": "duel-in-the-desert-2027",   // must exist in tournaments.json
  "utcOffset": "-07:00",                       // the VENUE's offset (see countdown)
  "travel": {
    "landingWindow": "Be on the ground by Thursday afternoon…",
    "note": "PSP is closest, but the fares are often worse than LAX…",
    "airports": [ { "code": "PSP", "name": "…", "drive": "35 min", "note": "…" } ],
    "address": { "area": "Indio, California", "line": null, "note": "…" }
  },
  "courses":   [ { "round": "Round 1", "date": "2027-03-26", "name": null,
                   "location": null, "url": null, "format": null, "note": null } ],
  "itinerary": [ { "date": "2027-03-25", "title": "Arrival", "items": [
                   { "time": null, "title": "The Draft", "detail": "…",
                     "kind": "draft", "tba": true } ] } ],
  "costs":     { "note": "…", "items": [ { "label": "Golf", "amount": null,
                   "per": "person", "due": null, "note": "…" } ] },
  "keyDates":  [ { "label": "Deposits due", "date": null, "note": "…" } ]
}
```

Field notes:
- **`courses[].name: null`** → a styled **"Course TBA — being scouted"** card, so
  the rota looks intentional before anything is booked. `url` must be a full
  `https://…` and renders as a "Course website ↗" link.
- **`itinerary[].items[].kind`** is one of `golf` · `draft` · `awards` ·
  `travel` · `social`, and drives the row's treatment. **`draft` gets the gold**
  — it's the pre-trip main event. `"tba": true` adds a small TBA pill.
- **`costs.items[].amount` is TEXT, not a number** (`"US$450"`, `"~$400 pp"`),
  deliberately: the owner writes whatever's true without a currency or rounding
  argument, and `null` means TBA. `due` is that line's payment deadline.
- **`keyDates`**: the timeline renders **dated** entries chronologically; entries
  still on `date: null` fall to the tail as a dimmed **"Not set"** node, so the
  four things everyone asks about are all visible without inventing a date. The
  trip itself is added automatically from `tournaments.json` — never hardcode it.

### Not duplicated in the planner (single source of truth)
- **Dates and location** come from `tournaments.json` (`startDate` / `endDate` /
  `location`), so the countdown, the itinerary headings and the rest of the site
  can't disagree. **Weekday names are always derived** (`weekday()` in
  `format.js`) — never hand-typed. (March 25, 2027 is a **Thursday**.)
- **Accommodation** stays in `tournaments.json` — it's written by
  `scripts/gen_data.py`, so moving it would fight the generator. The Trip tab
  renders it *inside* "Getting there" so a bed and how to reach it read together.
- **The field size** is computed by `draftPoolFor(tid)`.

### The countdown (`TripCountdown.astro`)
Sits at the top of the **Overview**. Three states: the big day count, **"It's on"**
while the trip is running, and it **removes itself** once the trip is over.
Rendered at build time so it's right without JS, then corrected by a script that
ticks each minute. The flip points are anchored to the **venue's** clock via
`utcOffset` — half the field is in Australia and would otherwise see "It's on"
most of a day early. It reuses the clubhouse-green band the home page already
uses for "what's next".

### Adding 2028
Drop in `data/trip-2028.json` with its own `tournamentId`, import it in
`data.js` and add it to the `trips` array. No component changes.

## Power Rankings & GHIN check-ins (`data/handicap_snapshots.json`)

A living form guide between trips, driven by GHIN handicap check-ins the owner
enters **by hand** — often from a phone via the GitHub web editor, which
auto-deploys. So the file is deliberately simple and the build is defensive.

### Editing the file (this is the owner's monthly routine)
`data/handicap_snapshots.json` is a **flat JSON array** — one object per player per
check-in. Each month: open the check-in sheet at the bottom of `/power-rankings`,
look each player up on ghin.com, and append one object per player. Worked example
(adding a May check-in):

```json
[
  { "player": "ben-urwin",    "date": "2026-05-01", "index": 6.4, "rounds": 5, "avgDifferential": 5.1, "note": "been at the range" },
  { "player": "tom-brunskill", "date": "2026-05-01", "index": 14.9, "rounds": 0 },
  { "player": "scott-b",       "date": "2026-05-01", "index": 2.6 }
]
```

Fields — **`player`, `date`, `index` are required; the rest are optional and may be
omitted entirely**:
- `player` — the player id (the `id`/`slug` in players.json, e.g. `"ben-urwin"`).
- `date` — `YYYY-MM-DD`.
- `index` — the GHIN handicap index, a **number** (no quotes).
- `rounds` — scores posted since the last check-in.
- `avgDifferential` — average differential of their recent scores.
- `note` — free text (`"shoulder injury"`, `"been at the range"`).

**Forgiving by design:** order doesn't matter (the engine sorts by date); optional
fields can be absent. If anything is malformed, the **build fails with a clear
message naming the offending record and field** — validated in
`src/lib/data.js` → `validateHandicapSnapshots()`. A broken file never deploys.

**Seed:** ships with one snapshot per 2026 player, dated `2026-03-13`, at their
tournament handicap, so the page works before any real check-in (flagged "seed").

### GHIN numbers & handicap system
`players.json` has a `ghin` field per player (their GHIN number), `null` until
filled in, and a `system` field — `"ghin"` (default) or `"ga"` for the Australian
GA handicap system (indices are comparable numbers, no conversion). `ghin`,
`system` and `confirmedFor` are all **hand-maintained**; `scripts/gen_data.py`
**preserves them by id on regen**. Snapshots may also carry a per-check-in
`system` and an optional `homeClub` (both validated). The UI labels the system
subtly — **"GA index" / "GHIN index"** on the board, **"GA handicap · <club>"** /
**"GHIN #<num> · <club>"** on the profile.

### The formula (`stats.js` → `powerRankings()`)
A transparent weighted score (0–100). **Weights live in ONE place** —
`POWER_RANKING_WEIGHTS` at the top of the Power Rankings block in `stats.js`:
**40%** recent form vs index · **30%** index trend · **20%** activity
(rounds) · **10%** last Annual (points %). The **index-trend** component prefers the
earliest snapshot inside the 90-day window (`POWER_RANKING_TREND_DAYS`), but falls
back to the **immediately-previous check-in regardless of age** when no in-window
prior exists — so on the first real check-in after a long gap (e.g. the St George
seed 20 weeks back) the "since last time" movement still counts. Each component is
**percentile (mid-rank) normalised**
across the field — outlier-robust, so one monster month tops its category without
flattening everyone else's spread (min-max did the opposite). A player missing a
component is scored **only on what they have** (never penalised) and flagged
`stale` if they skipped the latest check-in. The two index-based components differ:
**recent form vs index** measures a player against *their own* number (rewards
playing to your own standard, not raw ability — a scratch off his game can rate
below a 20 who's on it), while **index trend** measures movement of that number.
So a low index alone doesn't win; the rank measures "who's playing well now" and
the improvement *story* lives in the blurb + sparkline, not the number.
**Freshness tiers the board**: a *live* check-in (rounds posted or a measurable
index trend) ranks above every `stale` seed-only player (still has a tournament
result to stand on), which ranks above a **ghost** — a check-in with no rounds,
no trend and no Annual behind it (a rookie who hasn't posted; headline "Ghost",
sinks to the bottom until they post) — above no-data. So a stale result-rider
can't sit above someone posting fresh scores (the raw 0–100 score is only a
within-tier tiebreak, and isn't shown in the UI). Movement arrows compare each player's rank now vs the
previous check-in date. Verdicts ("Trending sharp", "Hasn't posted in 6 weeks") are
auto-generated in `powerVerdict()`.

`powerRankings()` returns `{ weights, trendDays, staleDays, dataAsOf, checkInDates,
hasRealData, rows[] }`; each row carries `rank, movement, movementBy, player,
teamId, isRookie, ghin, score, index, seedIndex, trend, sinceSeed, sinceLast,
indexDir ('falling'|'rising'|'flat'), sinceLabel, form, avgDifferential, rounds,
lastTournamentPct, series (sparkline), lastCheckIn, note, stale, verdict` — plus a
short **`headline`** tag and a 2–3 sentence auto-generated **`blurb`** (the
screenshot bit, written in the sports-coverage voice by `powerBlurb()`). **The 2027
Draft Guide is meant to consume `powerRankings().rows` directly** — that's why the
output is structured, not just rendered.

The Power Rankings page renders headline + blurb + the snapshot note (as a quote;
suppressed on stale rows), and a **sparkline that plots the index value literally**
— a falling handicap draws a line going *down* (green = improving, amber = drifting
up) with a "▼/▲ X since St George" annotation. The formula/weights live behind a
"How the rankings work" expander at the bottom.

Page: `/power-rankings` (nav label **Rankings**, also linked from Players). The
check-in helper table is `handicapCheckInList()` (name · GHIN · index · last
check-in). To retune the model, edit only `POWER_RANKING_WEIGHTS` /
`POWER_RANKING_TREND_DAYS` / `POWER_RANKING_STALE_DAYS`.

## Rookies (confirmed, not yet debuted)

A player with `confirmedFor: ["<upcoming-tid>"]` and **zero completed appearances**
is a *rookie*. Helpers: `rookiesFor(tid)` / `allRookies()` in `stats.js`. Rookies
get, automatically: a **"Rookie — debuts <year>"** profile treatment (badge, bio,
handicap/GHIN, live power-ranking once snapshots exist, and a "no tournament record
yet" panel **instead of blank stat tables**); their own **"Confirmed for <year>"**
group under the veterans on the Players page; and a **"Rookie" tag** in the upcoming
Draft Pool. To add one: add a player row to `players.json` with `confirmedFor` set
(and a `ghin` when known) — nothing else required.

## Design language

**Light, clean, official golf-tournament coverage** — bright like the Masters /
PGA Tour sites, played completely straight. Mobile-first (that's where everyone
views it).
- **The event's brand identity is the sunset banner** (`public/hero-banner.jpg`):
  an orange desert-sunset illustration with a deep **navy-ink** foreground. The
  whole palette is pulled from it. **Terracotta** (`--terra` #E06A2E, ink
  `--terra-ink` #A73820) is *the* accent — CTAs, focus, section-label eyebrows
  (`.eyebrow.gold` is a legacy class name that now renders terracotta), the tile
  hover bar, and link hovers. **Navy-ink** (`--navy-ink` #17293F, `--navy-deep`
  #0C1B2C) is the brand chrome — the masthead active pill, the `.btn--navy`
  secondary button, the footer, and the logo. Banner tokens `--sky` / `--sun` are
  available too.
- **Team colours are for team contexts ONLY.** Woodpeckers **green** (`--wp`
  #2E6B43), Silver Spoons **navy** (`--ss` #2E4B70). Scoreboards, match results,
  rosters and player profiles are always colour-coded by team — never use them as
  event branding. The clubhouse **green** (`--green-900/800`) survives as event
  chrome in only a couple of deliberate "where it works" spots: the Next-Trip band
  and the Roll-of-Champions honour board. **Gold** (`--gold`) stays a restrained
  metallic for championship prestige only (champion names, trophy fills,
  `.pill.gold`, `.tile--gold`, crowns — NOT section labels).
- **Logos feature throughout.** The two official crests live in `public/logos/`
  (transparent PNGs, extracted from the source art). Render them with
  `src/components/TeamLogo.astro` — next to every team name on scoreboards, match
  rows, rosters, drafts, leaderboards. The **site mark** is separate: an "A" seal
  (`BrandMark.astro` + `favicon.svg`/`favicon.png`/`apple-touch-icon.png`), now
  drawn in navy-ink with a terracotta flag to match the banner.
- **Signature:** the *scorebug* (`Scorebug.astro` + compact `MatchRow.astro`) —
  two colour-coded team panels with logos meeting at a centre gutter. Winner panel
  is solid team colour with white text; the loser recedes to a soft tint. Reuse
  it; don't reinvent per page.
- **Legibility on colour:** where a team colour is used as a background it always
  carries white text (both greens/navys are dark enough for AA). Logos sit in
  white chips when placed on a colour panel so they stay crisp.
- **Type:** Fraunces (display serif) + Archivo (UI/data, tabular numerals).
  Self-hosted via `@fontsource` — no external font calls.
- All tokens live in `src/styles/global.css` `:root`. Components set `--accent`
  inline to the team's `color` (from data); tints/ink are derived with
  `color-mix()`, so a single `--accent` themes a whole component.

## Privacy (required)

- `public/robots.txt` disallows all crawlers.
- Every page ships `<meta name="robots" content="noindex, nofollow, …">` via
  `src/layouts/Base.astro`. Any new page must go through `Base.astro`.
- No external network calls (fonts and logos are self-hosted). Keep it that way.

## Data integrity rules

- The source data was cross-checked against a written record. Where a recollection
  disagreed with the structured match log, **the match log wins** (e.g. match 17
  is 4&2, not 2&1). The per-player margin rows are treated as authoritative.
- **Do not invent facts.** Unconfirmed details (weather beyond what's recorded,
  hometowns, joke-award backstories, family relationships) are deliberately left
  out. Per the owner's decision, **no family relationships are asserted** between
  players who share a surname (Herring, Urwin) — even though the V4 workbook's
  Stat Insights / Moments sheets label the Herring final "Father vs Son". The site
  keeps it neutral ("Individual Championship"). Flag it if the owner wants it in.
- **All recorded scores are NET.** Every per-round score in `tournaments.json`
  (the `net` field on `scores`) **and** every per-hole score in `hole_scores.json`
  is a net score, even though the source workbook's columns were labelled "Gross".
  The **only** exception is the Round 1 Scramble, which is a team gross score. The
  site must say **net** everywhere (round-scores tables, player profiles, records,
  match summaries, the hole-by-hole cards). When importing new score data, treat
  scores as net unless a source explicitly states gross (or it's a scramble), and
  correct the word "gross" → "net" in any note/summary text pulled from a workbook.
  See **Hole-by-hole scoring layer** above for the full per-hole convention.
- **Match summaries** live on each match as `summary` (the written hole-by-hole
  narrative from the scorecard PDF) and `standout` (a standout-player line, null for
  singles). They are shown via `MatchSummary.astro` (a collapsible block) under each
  match on the Matches page and the St George Matches tab. Summaries were matched to
  matches by **players + round** (the PDF numbers matches in a different order).
  The Tom Brunskill vs Alan Lozer singles is kept at **4&2** (owner's call) even
  though that PDF summary said 4&3 — its closing line was reworded to 4&2 to stay
  consistent with the data.
- **Source workbook**: the data is generated from
  `The_Duel_Database_v1_0_Website_Ready.xlsx` (has the normalized `DB *` tables).
  The `The_Duel_Archive_V4_Scorecards_2026.xlsx` workbook holds the stat/analytics
  sheets used as **verification targets** (Format Records, Partnerships, Head-to-Head,
  Handicap Analysis, Format Performance, Draft Value, V3 Methodology).
- Regenerate data with `scripts/gen_data.py` if the source changes (it pins the team
  display colours and the match story notes). Don't hand-edit JSON in ways that
  diverge from the spreadsheet.

## Layout

- **Home** — the **sunset banner** hero (`public/hero-banner.jpg` — the title and
  tagline are *in the art*, so there is no duplicated HTML heading; the banner's
  baked "YEAR RESULTS · CITY" strip was cropped off and re-added as a real,
  auto-updating terracotta overlay on the navy dune, `.hero__results`); then the
  **Results** scorebug (most recent *completed* tournament); three **section tiles**
  (Scorecards, Stats, Records); Awards (Team Champions + Champion Golfer); Next Trip
  (the flyer + link to the upcoming event). To refresh the banner, drop a new image
  at `public/hero-banner.jpg` (crop any baked results strip so the overlay isn't
  doubled).
- **Tournament pages** (`tournaments/[id]`) branch on `status`:
  - **completed** → `TournamentCompleted.astro`: **tabbed** (client-side, hash-linked,
    degrades to all-visible with no JS): Overview, Teams, Draft (board + Composite
    Draft Value), Matches (all 18 with summaries), Stats (leaderboard, format-records
    matrix, partnerships, round scores, handicap analysis), Awards (trophy cabinet),
    Moments. The **Awards** tab features **Team Champions + Champion Golfer** on a
    top row, then the joke awards; the **"Shot of the Tournament"** card is
    deliberately hidden from this tab (the award stays in `awards.json`, and its
    hole-in-one story lives in the Moments tab) — see the `isShotOfTournament` filter
    in `TournamentCompleted.astro`. A **Photos** tab appears when the event has any
    photos (see **Trip photos** below).
  - **upcoming** → `TournamentUpcoming.astro`: **Overview** (countdown band + flyer
    + dates + "Teams/Captains to be announced"), **Trip** (the programme —
    `TripHub.astro`; see **The Trip hub** above), **Draft Pool** (eligible players
    → profiles), **Draft Guide** (placeholder). No Matches/Stats/Awards until
    results exist.
  `[id].astro` is a thin wrapper that picks the component so the completed
  frontmatter never runs for an upcoming event.
- **Players** (`players/index`) — the **wall of faces** first (a photo card per
  player, veterans by career points then rookies), then the sortable all-players
  comparison table under it. The old separate "Confirmed for <year>" rookie grid
  was removed — rookies are in the wall with their gold ROOKIE pill. See
  **Player portraits** above.
- **Player profile** (`players/[slug]`) — a **trading-card header** (portrait,
  name, nickname, team history, headline numbers) over the **scouting report**:
  format record, best partners, head-to-head vs everyone, handicap + draft-value
  history with labels, honours, moments, photos, full match log.
- **Matches / Records** as before. (There is **no Lore page** — it was removed; the
  moments data and each tournament's **Moments tab** remain. Don't re-add `/lore`.)

## Tournament status: `completed` vs `upcoming`

Every tournament has `status: "completed" | "upcoming"`. **Only completed
tournaments feed any stat** — `completedTournaments()` in `stats.js` is the gate,
and `latestTournament()`, `hallOfFame()`, `allTimeSeries()`, `records()` and
`careerStats` appearances all filter to completed. An **upcoming** tournament has
**empty `teams`/`rounds`/`roster`/`scores`** and no matches, so it can never touch
careers, records, leaderboards, or the home page's "results". `allTournaments()`
(all, for the nav) is the only helper that includes upcoming ones.

### Adding an UPCOMING tournament
1. Append a tournament object (in `scripts/gen_data.py`, the `upcoming` list) with
   `status: "upcoming"`, dates/location, a `flyer: {display, full}` (images in
   `public/`), and empty `teams/rounds/roster/scores`. It shows in the nav and gets
   its Overview / Draft Pool / Draft Guide page automatically.
2. **Draft pool** = everyone who has played a completed event, plus anyone with the
   tournament's id in their `players.json` `confirmedFor` array. To add a **new
   bloke**: add a player row (with `confirmedFor: ["<tournament-id>"]`) — they appear
   in the pool and get a **prospect profile** (guarded in `players/[slug].astro` for
   zero-appearance players) until they play.

### Flipping upcoming → completed (after the trip)
1. Change `status` to `"completed"` and fill in the real results — ideally by
   extending the source workbook + `gen_data.py` (teams, rounds, courses, roster,
   scores, matches, drafts, moments, awards), reusing team ids so franchises accrue.
2. Add a logo to `public/logos/` for any new team and map it in `TeamLogo.astro`.
3. The page automatically switches to the full completed (tabbed) layout, and all
   stats/records/careers/home "results" recompute. Re-run `/tmp/verify.mjs` and add
   the new tournament's anchor checks.

## Commands

```
npm run dev      # local preview at http://localhost:4321
npm run build    # static build to /dist
npm run preview  # serve the built /dist
```

## Structure

```
data/                 JSON source of truth (players, tournaments, matches, drafts,
                      moments, awards) + hole_scores.json + scorecard_images.json
                      + photos.json (trip album) + handicap_snapshots.json
                      + trip-<year>.json (the lead-up programme for an upcoming trip)
scripts/gen_data.py         regenerates the 6 core files from the source workbook
scripts/gen_hole_scores.py  regenerates hole_scores.json (holds the raw hole reads)
scripts/gen_portraits.py    cuts the two album-sourced player portraits to 4:5
scripts/verify_holes.mjs    reconciles the hole layer (54 checks)
src/lib/data.js       loads JSON, builds id lookups (+ holesForMatch)
src/lib/stats.js      ALL derived statistics (build-time), incl. the hole-stat block
src/lib/portraits.js  build-time scan of public/players/ (portrait or placeholder)
src/lib/format.js     display-only formatting helpers
src/layouts/Base.astro   <head>, noindex, nav, footer
src/components/        Scorebug, MatchRow, MatchSummary, HoleScorecard, TeamLogo,
                      PhotoGallery (reusable grid + swipeable lightbox),
                      PlayerCard + PlayerPortrait (the Players wall),
                      TripHub + TripCountdown (the upcoming-trip programme), …
src/pages/            index, tournaments/[id] (tabbed), players/index (wall +
                      comparison), players/[slug] (card header + scouting
                      report), matches, records
public/logos/         woodpeckers.png, silver-spoons.png (transparent)
public/players/       <player-id>.jpg portraits — drop one in, it just appears
public/scorecards/<year>/  original per-match card images (full PNG + thumb JPG)
public/photos/<year>/<event>/  trip album images (full + -thumb.jpg per photo)
public/               robots.txt, hero-banner.jpg (home hero), favicon.svg/png, apple-touch-icon.png
```

## Not done yet

- **12 of the 14 players have no portrait yet** — they're on the initials
  placeholder until a photo lands in `public/players/`. Missing: `ben-urwin`,
  `rupert-pedler`, `chase-hellmers`, `colton-mckivitz`, `anthony-herring`,
  `steve-urwin`, `scott-benesh`, `alan-lozer`, `ed-nelson`, `miles-honens`,
  `james-graham`, `tanner-curley`. The build prints the current list every time.
- **No nicknames on file.** `players.json` has a `nickname` field on every player
  and both the wall card and the profile header render it when it's set — every
  one is currently `null`, so nothing shows. Filling them in is a data edit, not
  a code change. Don't invent them.
