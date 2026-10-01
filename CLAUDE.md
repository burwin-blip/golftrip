# The Annual — project guide

The official historical website for **The Annual**, an annual Ryder Cup–style golf
trip. A private site for ~20 participants. Built with **Astro**: every PAGE is
static, generated from JSON data in `/data`, plus one minimal RSVP API (core
principle 5 below, and **RSVP** further down).

> Naming: the event/site is **The Annual**. It was previously called "The Duel" /
> "The Duel Archive" — that name must not appear anywhere in the site. (The only
> remaining "Duel" string is the path to the owner's untouched source spreadsheet
> `The_Duel_Database_v1_0_Website_Ready.xlsx` in `scripts/gen_data.py`; rename the
> source file and update `SRC` if you want it gone entirely.)

## Where things live (the one true local copy)

The project lives in **`~/GolfTrip/`**, which is outside iCloud. In September 2026
the old copy under `~/Desktop/Golf Trip/` kept being offloaded by iCloud "Optimise
Mac Storage": builds hung, git broke, and new photos couldn't be read. That copy
has been renamed **"Golf Trip - OLD, do not use"** and must not be built or pushed
from. Never move the project back under Desktop or Documents.

```
~/GolfTrip/
  the-annual/        this repo (git → github.com/burwin-blip/golftrip; push main = deploy)
  inbox/             the OWNER'S DROP FOLDER: players/, courses/<slug>/, other/
  source/
    workbooks/       The_Duel_Database_v1_0_Website_Ready.xlsx (gen_data.py's SRC),
                     the V4 Scorecards workbook, match-summaries PDF, written-record
                     DOCX, The_Duel_2026_Claude_Code_Data_Pack/
    art/             flyer, banners, Redcoats, ChatGPT art, Airbnb shots
    scorecard-screenshots/
    photos/          player-originals/, course-originals/<slug>/, st-george-2026-album/
```

**Photo intake:** the owner drops files into `~/GolfTrip/inbox/` (not into
`public/`). Process them into `public/players/<id>.jpg` or
`public/photos/<year>/courses/<slug>/NN-name.webp` by the rules below, move each
original into the matching `source/photos/…` folder, and leave the inbox empty.
Already-optimised files are copied, never re-encoded.

**`scripts/gen_data.py` warning:** re-running it rewrites `players.json` from the
workbook alone, so it drops players who were added by hand (James Graham and
Tanner Curley aren't in the workbook) and loses their `invitedFor`. Diff
`data/` after any regen and restore those rows before committing.

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

5. **Architecture: static pages + a minimal RSVP API, nothing more.** (Amended by
   the owner for the 2027 RSVP — this replaces the old "static, no backend" rule.)
   Every page is prerendered at build time (`output: 'hybrid'` with
   `@astrojs/vercel`; pages never opt out of prerendering). The ONLY server code is
   the two RSVP routes in `src/pages/api/` (`rsvp.js`, `rsvp-admin.js`) plus
   **`lineups.js`** (the Match Centre, added by the owner, September 2026) and the
   three **Draft Room** routes **`draft.js`, `draft-pick.js`, `draft-admin.js`**
   (added by the owner for the 2027 draft night, September 2026), all backed by
   one free Upstash Redis database. Don't add other API routes,
   server-rendered pages, a CMS, auth, or any other backend without the owner
   amending this rule again.

6. **After ANY build-config change, verify the DEPLOYED site renders styled before
   calling the job done.** (Owner's rule.) "Build-config" = `astro.config.mjs`, the
   adapter / output mode, `package.json` scripts or engines, Vite/CSS settings,
   `Base.astro`'s imports, `vercel.json`, or anything in `scripts/` that runs during
   `npm run build`. A green build is not proof: CSS can build fine and still not
   reach the browser. Once Vercel reports the deploy, run
   `node scripts/check-styles.mjs https://golftrip-kappa.vercel.app` (every key
   page links stylesheets, each returns 200 as text/css, and the design system —
   the `:root` tokens and `.masthead` — is really in them) AND look at the live
   home page in a real browser (phone width). Test the **production domain**: the
   per-deploy URLs (`golftrip-<hash>-benurwin.vercel.app`) are behind Vercel's
   login, so fetched from outside every page and asset redirects there.
   Also worth knowing: CSS filenames are content-hashed and each deploy serves only
   its own, so a page left open from an earlier deploy (a restored phone tab) asks
   for stylesheets that now 404 and shows raw HTML until it's refreshed. Every
   RSVP triggers a rebuild, so this happens more than it used to.
   **If the site ever looks broken after a deploy, rule out the browser first:**
   open it in a fresh incognito/private window AND on a second device before
   assuming the deploy is at fault. (September 2026: the owner's desktop showed
   every page unstyled after a deploy; the live site was fine — that browser was
   holding a cached copy from the deploy window. Clearing its cache fixed it.)
   Then verify the LIVE site, never the local build: curl the production homepage,
   list the stylesheet URLs in its `<head>`, curl each one and confirm **200** +
   `text/css` + real content (`scripts/check-styles.mjs` does exactly this), and
   render the production URL in a real browser. That is the standard for calling
   a deploy healthy — and for calling it broken.

7. **Only an RSVP confirms a player.** (Owner's rule, September 2026.) Nobody is
   marked confirmed for an edition except by answering YES on `/rsvp`. There are
   **no hand-set confirmations**: `confirmedFor` is derived at build time from the
   RSVPs alone (`src/lib/data.js`), and the build **fails** if `players.json` sets
   it. A debutant who's been invited but hasn't replied carries
   `invitedFor: ["<tournament-id>"]` instead. That keeps them a rookie (badge,
   prospect profile, wall card) and puts them in the pool's **"Waiting on"**, and
   their YES moves them to Confirmed like anyone else. (James Graham and Tanner
   Curley were hand-confirmed before the RSVP existed; they were moved to
   `invitedFor` under this rule.)

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
- **Optional face crop for the circles: `public/players/<id>-avatar.jpg`** (square,
  ~400px). `playerAvatar()` in `portraits.js` gives `PlayerAvatar` that file when
  it exists, else the portrait. Only for a portrait that's deliberately a WIDE scene
  and must stay wide on the tall cards. **Anthony Herring** is the case: his card
  is the full-height ice-bath shot (tub rim and ice must stay in frame; owner's
  instruction: "do NOT crop tight"), while his 20–44px circles use the face crop.
  Everyone else's circle still crops their normal portrait centre-high.
- Portrait URLs carry **`?v=<content hash>`** (first 10 hex of the file's SHA-1),
  so replacing a photo under the same filename changes its URL everywhere and no
  phone keeps the old face (September 2026: Tom Brunskill's album crop → a real
  headshot).
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
- **`PlayerAvatar.astro`** is the small ROUND face (same wiring, same file) for
  the places a 4:5 card is too big: the Power Rankings board, Draft Pool cards,
  match rows (`MatchRow.astro`, a face stack per side with a team-colour ring —
  the crest drops out under 540px) and the player rows of `HoleScorecard.astro`
  (the face replaces the crest there). No photo → initials on the sunset
  gradient. It crops the 4:5 file centre-high (`object-position: center 26%`).
- **Headshot framing (September 2026 batch):** head-and-shoulders, 800×1000,
  JPEG q82, cropped around a detected face so the face is ~34% of the frame
  width with its centre 40% down. That keeps the face inside both the 4:5 card
  and the centre-high circle. The owner's raw files (named by first name) are
  kept outside the repo in `../Photos/player-originals/`.
- **`scripts/gen_portraits.py`** cuts the one portrait that only exists as an
  album frame (Michael Herring from `sg26-15`) down to 4:5 head-and-torso. Tom
  Brunskill was removed from it when his real headshot arrived. Crop boxes are fractions of the source, so they survive a
  re-export. Everyone else's portrait is expected to be dropped in by hand;
  `public/players/README.md` is the note for the owner on how.

## The Trip hub (`data/trip-2027.json`) — the lead-up page

An upcoming event's page is the one everyone checks *before* the trip, so the
programme lives right on it. **Upcoming tournaments use a single-Overview
layout** (owner's call, September 2026; there used to be a separate Trip tab).
Tabs are **Overview · Draft Pool · Draft Guide**, and the Overview runs top to
bottom:
1. a row of **jump links** (Courses · Itinerary · Getting there · Costs, only for
   sections that render) — they scroll instantly and re-assert, because the
   global `scroll-behavior: smooth` otherwise cancels the jump mid-layout (same
   fix as the completed view's round jumps);
2. countdown; 3. RSVP banner; 4. Teams-TBA scoreboard + the flyer;
5. When / Where / Status cards (+ the tournament notes);
6. then the programme itself, `TripHub.astro`: the courses rota (`#courses`),
   itinerary (`#itinerary`), getting there + the accommodation
   (`#getting-there`), the damage (`#costs`), key dates (`#key-dates`).
The flyer and the dates each appear **once**. TripHub has no masthead of its
own, so don't add a poster/when/where block back into it. The programme's wrapper
carries **`id="trip"`**, so any old `#trip` link (the retired tab) still lands at
the start of the programme; course pages link back to `#courses`. Section anchors
use `scroll-margin-top: 140px` to clear the sticky masthead + tab bar. When the
edition is played and flips to `completed`, it gets the completed tab structure
(Matches / Stats / …) instead, and none of this applies.

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
  "costs":     { "estimate": true, "currency": "$", "note": "…",
                 "scenarios": [ { "id": "16", "label": "16 players" },
                                { "id": "20", "label": "20 players" } ],
                 "items": [ { "label": "Golf", "per": "person", "approx": true,
                              "amounts": { "16": 910, "20": 910 },
                              "due": null, "note": "All five rounds." } ] },
  "keyDates":  [ { "label": "Deposits due", "date": null, "note": "…" } ]
}
```

Field notes:
- **`courses[]`** is the rota. **`name: null`** → a styled **"Course TBA — being
  scouted"** card, so the rota looks intentional before anything is booked.
  A course with a **`slug`** gets a **profile page at `/courses/<slug>`**
  (`src/pages/courses/[slug].astro`) and its rota card becomes a link to it.
  - Profile fields, all optional, all rendered only when present: `designer`,
    `opened`, `par`, `yardage` (back tees — kept in the data but **never shown as a
    headline**; see below), `signature`, `description`, `url`
    (the club's own site) and **`source`** — the URL the numbers came from, which
    is printed at the foot of the profile. **Leave a field null rather than guess
    it**; the page is built to look right with gaps.
  - **`tee`** is the set *this group* plays — `{ name, yardage, rating, slope }`.
    A rating and slope are meaningless without the tee they came off, so `name`
    is required whenever `tee` exists. The 2027 rota uses each course's ~6,500-yard
    set (Blue on most; Purple at Firecliff), which suits a field running from
    scratch-ish to 21.
  - `slug` must be lower-case-hyphenated: it's both the URL **and** the photo
    folder name, and the build rejects anything else.
  - **The tees are decided (2027)** — `tee` is the set THIS group plays and
    drives every yardage/rating/slope shown: `{ name, yardage, rating, slope,
    par, confirmed, source, note }`. It renders as ONE strip, **"Par 72 · Blue
    (Championship) tees · 6,401 yards · 71.6/133"** (`playingLine()` in
    `format.js`): the navy band under the hero on the profile, and the same line on
    every rota card. **Owner's rule (Sept 2026): the headline numbers are only ever
    the tees we play.** No back-tee / championship length anywhere near the top of
    the page or on the cards (people read 7,000+ yards and thought that's what
    they're playing). The old Par / Length / Design tiles are gone; the designer and
    opening year sit under the description as a small line, and the full tee table
    further down is the only place other sets' yardages appear. Ratings always
    print to one decimal (`rating1()`). These numbers set everyone's handicap strokes, so:
    **`confirmed: true`** only when the figures came from the club's own card
    (Desert Willow — official PDFs, 06/2023); **`confirmed: false`** shows a
    **"To be confirmed on the ground"** flag (Terra Lago — club card c. 2018 +
    GolfPass; Classic Club — its card prints no ratings, so 71.0/129 is
    GolfPass/GolfLink). `note` says exactly where each figure came from.
    Terra Lago's own card names tees Professional / **Championship** / Regular /
    Forward, not colours — hence "Blue (Championship)" / "Yellow (Championship)".
  - **`tees`** is the full table (every set) under the callout; the row whose
    `name` equals `tee.name` is highlighted "We play" (the build rejects a
    mismatch). A null rating renders "—" (combos with no published rating). The
    par column only appears when sets differ.
  - **`flyover`** `{ url, title, by, note }` → a "Course flyover" section
    (`CourseFlyover.astro`). YouTube videos/playlists embed via
    youtube-nocookie **only after a tap** — until then it's a drawn poster and
    the page makes no external request (Privacy rule). Anything else renders as
    a styled external link. Only official/quality videos: 2027 has the club
    playlists for Mountain View (2015) and Classic Club, and a link to
    Desert Willow's post-renovation drone flyovers for Firecliff (its YouTube
    set pre-dates the renovation). **Terra Lago: none found** (only a 2008
    StrackaLine render and a 1-min agency promo — deliberately not linked).

### Course photos (`public/photos/<year>/courses/<slug>/`)
Same idea as the player portraits — **the folder name is the wiring**. Drop
images into the course's folder and they appear on the next build: the **first
file is the hero** (on the profile *and* on its rota card), the rest become a
lightbox gallery. Read by `src/lib/course-photos.js`; no JSON to edit.

```
public/photos/2027/courses/terra-lago-south/01-first-tee.jpg
public/photos/2027/courses/classic-club/02-clubhouse.jpg
```
Status (23 September 2026 — the owner re-sorted the Terra Lago shots between North
and South; the folders are the source of truth). Everything is web-optimised
`.webp` (full ≤1600px q80 + a `-thumb.webp` at 560px q68), renamed `01-…` so the
chosen hero sorts first; files already optimised are copied, never re-encoded.
Firecliff 3 · Mountain View 5 · Terra Lago South 7 (incl. `06-tee-boxes`, the
aerial of the stepped tees through the badlands, placed on South by judgement
because the owner filed it there) · Terra Lago North 4 (hero `01-island-green`,
its signature par 3; the clubhouse; and the shared aerial, which is deliberately
in BOTH Terra Lago galleries) · Classic Club 4 (hero `01-green-mountain`).
Firecliff is the thin one (3 shots, 768px wide). A saved web page
(`Golf-Club-at-Terra-Lago.html`) the owner had in the South folder is
intentionally NOT on the site. The raw downloads live outside the repo in
`../Photos/course-originals/`. `public/photos/2027/courses/README.md` lists each
folder and the official gallery pages to collect from.

- Files sort by filename, so **number them** (`01-`, `02-`) to choose the hero
  and the order. `.jpg` `.jpeg` `.png` `.webp` `.avif` all work.
- Optional: a `name-thumb.jpg` beside `name.jpg` is used for the grid tile and is
  never listed as a photo of its own. Without one the full file is used — fine
  for a private site, but web-optimise big files (`sips -Z 1600`).
- No folder yet → **`CoursePhoto.astro`** draws a placeholder in the site's own
  palette (sunset sky, navy ranges, a strip of fairway and a flag, varied off the
  slug). It's a designed state — don't swap it for a grey box.
- `alt` text is generated from the course name. These are scenery; describing
  what's in a frame nobody has looked at would be guessing.
- **`itinerary[].items[].kind`** is one of `golf` · `draft` · `awards` ·
  `travel` · `social`, and drives the row's treatment. **`draft` gets the gold**
  — it's the pre-trip main event. `"tba": true` adds a small TBA pill.
  An item may carry **`course`** (a course `slug` from the same file); the day
  then names that course under the item and links to its profile. The build
  rejects a slug that isn't in `courses`, so the two can't drift apart.
- **Costs are priced per headcount.** Per-person cost swings on how many turn up,
  so `costs.scenarios` lists the headcounts (`id` + `label`) and each item's
  **`amounts`** gives a figure per scenario id. They render as **side-by-side
  columns**, not a toggle — both numbers matter at once when you're deciding
  whether to chase more players, and columns need no JS.
  - **`amounts` values are plain NUMBERS** (`524`, not `"$524"`) — that's what
    lets the **per-person total be summed rather than typed**, so correcting one
    line corrects the bottom line. `currency` is the prefix; a non-integer prints
    to 2 dp (`62.5` → `$62.50`). `approx: true` prefixes `~`.
  - A scenario missing a figure on any line is flagged **"only the lines costed
    so far"** rather than quietly under-totalling.
  - **`amount` (TEXT)** is still there for a line that doesn't move with the
    headcount and isn't worth totalling (`"US$450"`, `"~$400 pp"`); it's used
    only when there are no `scenarios`. `null`/absent on either → **TBA**.
  - `estimate: true` puts the gold **"Estimates"** banner above the table (and
    drops the "a checklist, not an invoice" aside — the banner says it better).
  - `due` is that line's payment deadline; it renders under the label **only when
    set**, so untouched rows stay clean and the deadlines live in **Key dates**.
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
  `scripts/gen_data.py`, so moving it would fight the generator. The programme
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

## Match Centre (2027) — the lineup board (`data/schedule_2027.json`)

A **Match Centre** tab on the upcoming tournament page (after Draft Guide; it only
appears when the edition has a schedule). The global `/matches` page stays the
all-time archive and is untouched.

**The schedule** (`data/schedule_2027.json`, read by `src/lib/schedule.js`, which
validates it at build time and computes every total): 5 rounds, 22 matches, **38
points, 19.5 to win**. R1 Fri 26 Mar AM, 2v2 Scramble, **9 holes**, Terra Lago South,
4×1pt · R2 Fri PM, 2v2 Best Ball, Terra Lago North, 4×2 · R3 Sat AM, 4v4 Scramble,
18 holes, Mountain View, 2×1 · R4 Sat PM, 2v2 **Combined Stableford** (partners'
points ADDED; new for 2027, 2026 was Team Average Stableford), Firecliff, 4×2 ·
R5 Sun, Singles, Classic Club, 8×2, **Match 8 = the Championship Match**. Round
dates must match the rota; courses come from `trip-2027.json` by `courseSlug`.
Teams are drafted live Thursday night, so both sides are `Team A` / `Team B` with
`teamId: null` until the draft; the Draft Room's FINALISE fills them in (see
**Draft Room**).

**Handicap allowances (owner's decision):** scrambles **gross** (no strokes, as 2026
R1); Best Ball + Combined Stableford **100% course handicap** each; Singles **100%
of the difference**. Course handicap = `round(index × slope/113 + (rating − par))`
from each round's course and our tees. Stroke holes come from **`tee.holes`** in
`trip-2027.json`: `[{hole, par, si, yards}]` for our tees on all five courses, read
from the official scorecards (`tee.holesSource` / `holesNote` name the card), and
checked: 18 holes, SI 1–18 once each, par and yardage totals match.

**Code:** `src/lib/matchcentre-shared.js` holds the pure rules, used by the build,
the API and the browser: `courseHandicap`, `strokeHoles`, `allocateStrokes`,
`projectMatch` (gross: index gap scaled to the holes + form; net: form only, and
only when both sides have form on file) and `validateLineups`.
`src/lib/matchcentre.js` precomputes per-player tape data from the existing stats
(power-ranking rank, index and form; career record per format, where Combined
Stableford uses 2026's Team Average Stableford as its precedent; head-to-head for
every pair; course handicap per round). `MatchCentre.astro` renders the board and
builds each Tale of the Tape in the browser. Rookies show "No history yet — rookie".

**Lineups** live in Redis, **`lineups:2027`** (hash field `doc`), via
`src/lib/lineup-store.js` (own small client, same env vars as the RSVP store;
locally `.lineups-local/store.json`, gitignored) and **`/api/lineups`**: GET is
public (who's playing whom isn't private); POST is admin-only with the **same key
mechanism as `/rsvp/admin`** (`x-admin-key` checked by the RSVP API's own
`isAdminKey()`, reused, not modified). Document shape: `{ version, tournamentId,
rev, updatedAt, rosters: {A:[ids], B:[ids]}, rounds: { "<round>": { "<match>":
{A:[id|null…], B:[…]} } } }`. Every save names the `rev` it was based on; a stale
save gets a **409**, so a phone and a laptop can't overwrite each other. Filling
`rosters` after the draft restricts each side to its own players (server and
page). **Later phases** (Squabbit scorecard uploads, team points, pairing ideas)
should add sibling keys/fields keyed by the same round/match numbers and match ids
(`duel-in-the-desert-2027-r<N>-m<M>`), not change this document.

**Admin link:** `/tournaments/duel-in-the-desert-2027#admin=<RSVP_ADMIN_KEY>`. The
page reads the key, strips it from the address bar, keeps it in that tab's
sessionStorage, and asks the server (`{admin:true}`). It works when pasted into an
already-open page too (a hash change). **Phones:** tap a slot → pick from the
bottom sheet (picking someone already placed that round moves them). **Desktop:**
drag a pool card onto a slot; in admin mode the round's pool sticks to the bottom
of the screen so every slot is in reach. Unfilled slots show "TBD". Unsaved
changes warn before leaving.

### Match Centre v3 — fight cards, a short tape, and the 2026 archive (Sept 2026)
- **One component, two modes** (`MatchCentre.astro`, takes `data`): `live`
  (`matchCentreData(tid)`, 2027, lineups from Redis, admin editing) and `archive`
  (`archiveMatchCentreData(tid)`, a completed edition, read-only). Both builders
  return the same shape (`schedule`, `players`, `h2h`, plus `lineups` + `results`
  for the archive), so the board, cards and tape are the same code for both years.
- **Fight cards:** each match is a poster: a side's players as big 4:5 photo cards
  (the profile portrait; initials on the sunset gradient if no photo), a big **V**
  between the sides. Phones stack 2v2 / 4v4 sides with the V between; singles stay
  face to face (the crest stands in for the team name there). Admin tap-to-pick and
  drag-and-drop work on the big cards; empty slots read "TBD / Tap to pick".
- **Tale of the Tape, summarised:** a short verdict banner ("Team B by ~0.5 · on
  form" / "Toss-up · handicaps level it") + the one or two best **nuggets**
  (Championship stakes, a lopsided head-to-head, a player in form, a big stroke gap,
  an unbeaten format record, a rookie's debut). Everything else sits behind **"Full
  tale of the tape"**.
- **St George 2026 Match Centre tab** (after Matches in `TournamentCompleted.astro`):
  all 18 matches as completed fight cards, Woodpeckers left / Silver Spoons right in
  their real colours and crests (side A is the Woodpeckers in every 2026 match; the
  builder throws if an edition mixes sides). Each shows the result chip ("Woodpeckers
  win 3&2" / "Halved · AS"), points per side, a **W** on the winners and the losing
  side dimmed, and **"Match & scorecard →"**, which reuses the page's existing
  `[data-jump]` round jump into the Matches tab (no per-match anchors were added; the
  Matches tab is untouched). Its tape uses only **pre-trip** facts: the handicap each
  player took to St George (roster), the playing handicaps set on the cards, and
  "No history yet — first Annual". No form, records or head-to-heads, so 2026 results
  never leak into their own preview. Strokes come from the cards' stroke indexes;
  `strokeHoles()` allocates by stroke-index ORDER, so 9-hole rounds carrying 18-hole
  SIs (the 2026 Shamble) are right. Michael v Anthony (the Championship Match) has no
  playing handicaps on the card, so it says so.
- **Verified:** the 2026 Match Centre was cross-checked against the rendered Matches
  tab: 18/18 same pairings, results and points, totals 16.5–13.5.

## Draft Room (2027 draft night) — `/draft/board`, `/draft/captain`, `/draft/commish`

The live snake draft on Thursday 25 March 2027. Three screens, all prerendered
shells that poll the API (every state change is server-side, in Redis):
- **`/draft/board`** — the TV. Public but unlisted (noindex like every page). Dark
  and theatrical: pick-order strip, both rosters as photo cards, and a centre stage
  that shows the clock, **OVERTIME** (counts up in red, the screen turns red), then
  on a lock **"THE PICK IS IN"** + a 5-second countdown, the card reveal and the
  slam onto the roster (3s), then the next clock. Polls every 1s.
- **`/draft/captain#<captain-key>`** — one secret link per captain. The clock, both
  rosters, the pool as scouting cards (power ranking, index, points %, record,
  per-format records, headline, rookie badge), sort (rank / index / pts / name),
  All / ★ Shortlist (this browser's localStorage) / Rookies. Two-step pick: tap a
  card, then **LOCK IT IN**. A lock is final; only the commissioner can undo.
- **`/draft/commish#<RSVP_ADMIN_KEY>`** — the commissioner (same key as `/rsvp/admin`,
  checked by the RSVP API's own `isAdminKey()`). Real / Mock toggle, setup (players
  default to the RSVP YESes; captains; first pick + coin flip), captain links (copy /
  regenerate — regenerating kills the old link), START / PAUSE / RESUME / UNDO (two
  taps) / RESET (type RESET), the picks list with each pick's time, and FINALISE.

**Draft night presentation (added Sept 2026):**
- **Announcer reveals:** "THE PICK IS IN" (5s countdown) and the card slam carry a
  Ryder Cup-style "PICK 3 — TEAM PEDLER" line.
- **The finale:** as the last reveal ends the board clears and the two teams
  assemble like a fight poster: team name + monogram, captain's card first, then
  each roster sweeping in, alternating sides every 0.5s, then a big "vs" and "THE
  ANNUAL 2027 — THE TEAMS ARE SET". That is the board's resting state (complete
  and finalised). Timing is offsets from `finaleAt` (`finaleTimeline()` in
  draft-shared.js), set by the server when the last pick locks; the board renders
  with CSS animation delays relative to now, so a refresh lands in step. The
  console's **REPLAY FINALE** (`action: 'finale'`) just moves `finaleAt`.
- **No sound.** The board is deliberately silent (a sound option was built and then
  removed at the owner's request, Sept 2026). Don't add audio back without asking.
- **Draft Night recap:** every pick is stamped server-side with the player's index
  and power ranking at that moment. `draftRecap()` grades each pick against the
  rankings among the RANKED picks only (unranked players aren't graded, so an
  early rookie pick doesn't skew everyone else): went ≥ band places later than
  ranked = **steal**, ≥ band earlier = **reach**, else **fair** (band = max(2,
  ranked picks / 5), so ±3 for 14). Highlights: steal of the draft, biggest reach.
  `src/lib/draft-recap.js` renders it, and the same function feeds both places:
  the permanent **Draft Night tab** on the 2027 page (build time, from
  `data/draft.generated.json`, real finalise only) and **`/draft/recap`** (live in
  the browser from `/api/draft`, so a mock recap is viewable the moment the mock
  is finalised, watermarked MOCK). Tested: the same picks give identical rows.
- **Mock = full dress rehearsal:** reveals, finale, replay and the recap
  all behave exactly as on the night. The only difference is that a real finalise
  writes the rosters, publishes the recap (pull-draft → rebuild) and updates the
  Match Centre teams. RESET clears the mock completely.

**Rules (owner's decisions, Sept 2026):** captains are on their own teams
automatically; snake order A,B,B,A… from whoever picks first; 2:00 a pick; **no
auto-pick** (overtime just counts up). ~8s between picks (5s reveal + 3s slam).
Designed for 16, but START takes **any even number ≥ 4** (captains included) so a
late drop-out can't block the night; the console warns when it isn't 16 ("14
players — 6 picks per captain") and the pick count follows. **UNDO** pauses, puts
the last pick back in the pool, and that captain gets a fresh 2:00 on RESUME.
**MOCK** mode is a separate document: every screen is watermarked "MOCK DRAFT",
finalise shows the board's final screen and what *would* be written but writes
nothing outside the mock, and RESET clears it (setup kept).

**Code:** `src/lib/draft-shared.js` (pure rules used by the API and all three
pages: `snakeOrder`, `phaseAt(doc, now)`, `rosters`, `available`, the colour
palette), `draft-store.js` (Redis / local file, plus the write lock),
`draft-api.js` (all server logic), `draft-data.js` (build-time scouting cards),
`draft-client.js` (polling, server-clock offset, key-from-hash, card markup).
**Timing is server-side only:** the document stores absolute server timestamps
(`clock.startsAt`, `reveal.revealAt` / `doneAt`, set at lock time) and every GET
carries `serverNow`; each screen derives the phase with `phaseAt()` after
correcting for its own clock. There is no background job; PAUSE/RESUME shift the
timestamps. So a refreshed or reconnected screen lands exactly where things stand,
mid-reveal or mid-overtime included.

**Redis keys (own namespace; RSVP keys untouched):** `draft:2027:real` and
`draft:2027:mock` (hash: `state` = the document, `keys` = the two captain keys,
never returned by the public GET), `draft:2027:config` (`mode`), and
`draft:2027:lock` (SET NX PX 4000 around every write). Every write re-reads inside
the lock, so a double submit can't double-draft: the same captain re-sending the
same pick is a harmless `repeat`, anything else for a made pick is a 409. Locally
(no Redis): `.draft-local/store.json` or `DRAFT_LOCAL_STORE=<path>`. A local run can
shorten the clock with `DRAFT_PICK_SECONDS` (ignored on Vercel).

**Finalise (real):** the commissioner names the teams (default "Team <captain's
surname>", ≤ 40 chars) and picks two different colours from the preset palette
(Canyon Red, Desert Gold, Oasis Teal, Twilight Plum, Sunset Orange, Slate — no
2026 green/navy); teams get a **monogram** (first letter of the name, skipping
"Team"/"The"), not a crest. Team ids are slugs of the names (`-2027` added on a
clash with an existing id). It then: (1) writes `rosters` onto `lineups:2027` and
clears any lineup slot that breaks them (listed back on the console); (2) saves the
draft as finalised; (3) fires `RSVP_DEPLOY_HOOK_URL`. The build runs
**`scripts/pull-draft.mjs`** (after pull-rsvp; same failure rule: Redis connected
but unreachable → the build fails), which writes the finalised REAL draft to
`data/draft.generated.json` (gitignored). `data.js` → `draftResultFor(tid)`;
`schedule.js` turns Team A/B into the drafted teams (`teamId`, `label`, `color`,
`captainId`, `playerIds`, `monogram`); the 2027 Overview scoreboard shows the teams
and captains, the Draft Pool tab leads with both rosters (captain + pick numbers),
and the Match Centre uses the names/colours/monograms and enforces the rosters. A
finalised real draft needs an extra "I understand" tick to RESET (the rosters
already written stay until the next finalise).

**Testing (Sept 2026, before the first commit):** a full mock draft driven through
all four screens in separate browsers (16 players: start → 14 picks with reveals →
an overtime → refreshes mid-overtime and mid-reveal → a parallel double-submit →
UNDO/RESUME → mock finalise), then a 14-player real draft with a real finalise
(lineup conflict cleared, roster enforced, rebuild hook fired), on BOTH the file
store and the fake Upstash server, plus the RSVP suites (67 / 61).
`scripts/fake-upstash.mjs` base64-encodes replies like the real service (the
client asks for it); without that, a lock token that happens to be valid base64
came back garbled and the lock never released.

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
`system` and `invitedFor` are all **hand-maintained**; `scripts/gen_data.py`
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

**Official beats self-reported (from the 28 Sept 2026 check-in):** a player with
an official GHIN / GA check-in beyond their St George seed is rated on the official
numbers only; RSVP handicaps count only for players without one (seed-only players
and new RSVP players). `handicapSnapshots` is that current view; boards dated
before `OFFICIAL_OVER_RSVP_FROM` (data.js) use `allHandicapSnapshots`, so earlier
boards are reproduced exactly as published. **Movement arrows** compare with the
board as it stood just before the latest GHIN check-in. **"Last updated"** shows the
latest GHIN check-in date (`checkInAsOf`), not RSVP days.
**Commissioner's adjustment** (owner's rule, in `rankingAsOf()`): Ben Urwin can
never be #1. If he computes top, he swaps with #2, on every board so the arrows
stay consistent. It's deliberate and deliberately not shown on the site; delete
that commented block to remove it.

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

## Rookies (lined up, not yet debuted)

A player lined up for an upcoming edition, either **confirmed by RSVP**
(`confirmedFor`, derived) or **invited and still to reply** (`invitedFor`, in
`players.json`), with **zero completed appearances** is a *rookie*
(`upcomingFor(p)` in `stats.js` is the union). Helpers: `rookiesFor(tid)` /
`allRookies()`. The profile's team bar reads "Confirmed for <year>" once they've
RSVP'd YES, "<year> · awaiting RSVP" until then. Rookies
get, automatically: a **"Rookie — debuts <year>"** profile treatment (badge, bio,
handicap/GHIN, live power-ranking once snapshots exist, and a "no tournament record
yet" panel **instead of blank stat tables**); their own **"Confirmed for <year>"**
group under the veterans on the Players page; and a **"Rookie" tag** in the upcoming
Draft Pool. To add one: they RSVP YES on `/rsvp` via "I'm not listed", or add a
player row to `players.json` with `invitedFor` set (and a `ghin` when known) so
they appear in "Waiting on" and find themselves in the `/rsvp` picker. Never set
`confirmedFor` by hand (core principle 7).

## RSVP (`/rsvp`) — the 2027 invitation replies

Replaced the Google Form. **`/rsvp` is PERMANENT** — it is printed as a QR code on
the invitations, so the path must never change, whatever happens to the code
behind it. (`src/pages/rsvp/index.astro`.)

### The flow
Opening screen (the Duel in the Desert flyer art, dates from `tournaments.json`)
→ **Who are you?** (the wall of faces, or "I'm not listed" → full name) → **RSVP**
(yes / maybe / no) → **Your game** (Q1 DOB, Q2 handicap, Q3 strongest parts and
Q4 weakest parts — **multi-select**, at least one each, a part can't be in both —
Q5 one sentence) → **2027 questions** (Q6 captain nominees, **as many as they like**,
plus **"Someone else" write-ins** (see below), Q7 an optional team name **per
nominee, write-ins included**, Q8 $250 green fee, Q9 longest drive /
closest to the pin — **skipped for a NO**) →
**Review** → confirmation (YOU'RE IN. with the live confirmed count for YES;
"Pencilled in." for MAYBE; "Next time, then." for NO — **never repeats answers**).
Mobile-first; a sticky Back/Continue bar; the phone's back button steps back. **Responsive (Sept 2026):** the phone layout is the base CSS and
must stay pixel-identical. Every wider-screen rule sits in `min-width` blocks at
the end of the page's styles. **720px (tablet):** a 720px column, 4 faces a row,
review cards two-up, the two short 2027 questions side by side. **1024px
(desktop):** the site's `--maxw` width, 5 faces a row (6 from 1240px), the three
RSVP answers side by side, Your game in two columns (dob | handicap, strongest |
weakest), captains as an even grid, larger headings and progress bar, and the
Continue button capped at 380px. Verify with the scratch puppeteer harness
approach: fingerprint every element's rect per step at 360/390/430px before and
after, and they must match exactly.
`Base.astro` takes `bare` to drop the nav/footer for this flow (head/noindex same).
The question list is fixed by the owner — **no additions**. Answer options live in
ONE place, `src/lib/rsvp-shared.js`.

### Getting people to /rsvp (entry points)
- **Masthead**: an "RSVP" filled terracotta pill (`.nav-rsvp` in `Nav.astro`) —
  outside the collapsible menu, so it's visible next to "Menu" on phones.
- **Home**: a sunset-gradient banner (`.rsvp-cta`) above the hero banner, above
  the fold on a phone; plus an "RSVP for 2027" button in the Next Trip band.
  After this device RSVPs YES, `/rsvp` stores `annual-rsvp:last` in localStorage
  and the banner becomes "You're in — see who else is coming →" (the Draft Pool).
  Best-effort: with no storage it simply stays "RSVP now".
- **2027 page**: an RSVP band on the Overview (under the countdown) and a link in
  the Draft Pool intro.

### Captain nominations: unlimited + "Someone else" write-ins (Sept 2026)
- No cap: tick as many captains as you like; each is one vote. (`LIMITS.maxNominations`
  / `maxWriteIns` are only sanity caps against a junk request.) At least one pick
  or one write-in is required.
- **"+ Someone else"** adds a name box (repeatable) for blokes not on the site yet.
  Each gets its own optional team-name field.
- **One matcher, `matchPlayerName()` in `rsvp-shared.js`**, used at submit AND on
  every admin read. `match` = same full name, or a first name only ONE player has
  → counted as a vote for that id (on submit it's stored as the id). `ambiguous`
  (a first name several players share) and `possible` (same first name but a
  different surname, or a lone surname like "Urwin") are **never merged**. They
  stay as typed and show a gold ⚑ flag on the admin tally naming the candidates.
  `none` → tallied under the typed name ("Write-in · not on the site yet"), same
  name in any case counting together.
- **Automatic merge:** unmatched write-ins are stored as text and re-matched every
  time the admin tally is built, so once "Harry" joins via the RSVP his typed votes
  (and the team names suggested with them) count in his tally, "N typed in as
  Someone else and matched". Nothing in the store is rewritten.
- In the form, a write-in that is clearly someone on the list ticks their chip
  instead ("Michael Herring is on the list — we've ticked him instead").
- Old records (1–2 ids, or the single `captainVoteId`) read unchanged:
  `normalizeEvent()` gives them `captainWriteIns: []`.

### Where the data lives
**Upstash Redis** (free tier, connected via Vercel → Storage; env vars
`KV_REST_API_URL` / `KV_REST_API_TOKEN`). `src/lib/rsvp-store.js`. Three hashes,
one field per player id, so a re-submission can only overwrite — never duplicate:
- `rsvp:players` — players created via "I'm not listed" (`{id, name, createdAt}`).
- `rsvp:profiles` — PERMANENT player data: `strengths[]`, `weaknesses[]`,
  `sentence` (public), `dob` (**private**), `handicapHistory: [{at, index, source}]`
  (append-only — a new entry whenever the number changes).
- `rsvp:event:duel-in-the-desert-2027` — 2027 EVENT data: `status`,
  `handicapEntering`, `captainVoteIds[]` (**player ids**, unlimited),
  `teamNames` (`{ <captainId>: "name" }` — each suggestion is filed against the
  respondent's record AND that specific captain), `captainWriteIns[]`
  (`{ name, teamName? }` — typed names that matched no player cleanly when sent),
  `greenFee`, `longestDrive`,
  `submittedAt`, `firstSubmittedAt`, `submissions`, `statusHistory`
  (**all private except `status`**).
- **Old format (the first version of the form)** stored single values —
  `strength`, `weakness`, `captainVoteId`, `teamName`. Never lost:
  `normalizeProfile()` / `normalizeEvent()` in `rsvp-shared.js` read either shape
  as the current one (one-item lists / one captain with its team name) everywhere
  the data is read (API, admin, build), and the next re-submission rewrites that
  record in the new shape. The form's per-device private pre-fill migrates the
  same way. Always read records through those two helpers.
No Redis locally → a JSON file at `.rsvp-local/store.json` (gitignored), or
`RSVP_LOCAL_STORE=<path>`. On Vercel with no Redis the API answers 503 and the
build treats it as "no RSVPs yet".

### Identity & duplicates (`src/lib/rsvp-api.js` → `resolvePlayer`)
A picked id must exist. A typed name is slugified; if that id already exists
(`players.json` or an earlier RSVP) the response attaches to that player instead
of creating a second one. New ids are kebab-case like every other id.

### How RSVPs reach the site (the auto-sync)
1. `POST /api/rsvp` saves, then — if anything PUBLIC changed — calls the Vercel
   **deploy hook** (`RSVP_DEPLOY_HOOK_URL`). The site rebuilds in ~1–2 minutes.
2. `npm run build` runs `scripts/pull-rsvp.mjs` first, which writes the **public
   slice only** to `data/rsvp.generated.json` (gitignored — **the repo is public**).
   If Redis is connected but unreachable the build FAILS (the last good deploy
   stays up) rather than publishing a site with everyone's RSVPs missing.
3. `src/lib/data.js` merges it (optional file — a bare `astro build` still works):
   new players join `players`; **`confirmedFor` is built from the RSVPs alone** (YES
   → confirmed for 2027, debutants become rookies automatically; anything else →
   not confirmed; a MAYBE adds the edition to `invitedFor` so a debutant stays a
   rookie on the Players wall with a "<year> · a maybe" profile bar; a NO clears
   it); each
   day's RSVP handicap becomes a snapshot with **`source: "rsvp"`** appended to
   `handicapSnapshots` (the JSON file is never modified); Q3–Q5 are read with
   `gameProfileFor(id)`; the status with `rsvpStatusFor(id, tid)`.
- **Draft Pool** (`draftPoolFor`) groups: **confirmed** (RSVP YES, nothing else) ·
  **maybe** · **waiting** (no reply yet: played before, or an `invitedFor` rookie).
  A NO is out of the pool. The pool tab renders Confirmed, then "Waiting on"
  (MAYBE gets a "Maybe — not sure yet" tag). Captain nominees on `/rsvp` = the pool.
- **Power Rankings** with RSVP snapshots: they move a player's index + trend, but
  form / rounds / differential / note keep coming from the latest real GHIN
  check-in, and RSVP dates never count as a check-in date for movement arrows.
- **Player profiles**: `GameProfile.astro` — "In their own words" (sentence,
  strongest, weakest) in the scouting report; renders nothing until they answer.

### Privacy (required)
- **PUBLIC**: name, RSVP status, handicap, strongest / weakest, the sentence.
- **PRIVATE — never on the public site, never in the repo**: date of birth, captain
  votes, team-name suggestions, Q8, Q9. They're stored only in Redis and returned
  only by the key-protected admin API. `GET /api/rsvp?player=<id>` returns public
  fields only. Anyone can tap anyone's name (no login), so the form pre-fills
  private answers **only from that phone's localStorage**, never from the server.
  `scripts/test-rsvp.mjs` checks no private field leaks.

### Admin view — `/rsvp/admin#<key>`
**Unlinked but public by design** — there's no auth on this site, which is
acceptable for this private group. The page is an empty shell; the data loads only
when the key after `#` matches the `RSVP_ADMIN_KEY` env var (set in Vercel; never in
the repo; the `#` part is never sent to servers or logs). Shows everyone incl.
no-reply, timestamps + change history, handicaps (with history), DOB, strengths /
weaknesses (one per line), each person's captain picks with their team names,
captain vote tallies (**each nomination = one vote**, unlimited per person;
write-ins tallied as described below), team names grouped by captain, Q8/Q9 totals, and an **"Export results
(CSV)"** button: one row per player (non-replies included) with every field, including
the RSVP and handicap histories, DOB, every captain pick (write-ins marked) and the
team names by captain, and
Q8/Q9 **as the answer wording**, not the stored key. Lists are joined with "; ". It's a
UTF-8 file with a BOM, and any typed answer that starts with `= + - @` is prefixed with
`'` so a spreadsheet can't run it as a formula (a plain negative number, i.e. a plus
handicap, is left alone). Built in the browser from the key-unlocked admin API
response. Nothing new is served.
To change the URL, change `RSVP_ADMIN_KEY` in Vercel.

### Environment variables (Vercel → Settings → Environment Variables)
- `KV_REST_API_URL`, `KV_REST_API_TOKEN` — added automatically when the Upstash
  database is connected to the project.
- `RSVP_DEPLOY_HOOK_URL` — the project's deploy hook (Settings → Git → Deploy Hooks).
- `RSVP_ADMIN_KEY` — the admin page's key.

### Vercel runtime quirk
`@astrojs/vercel` v7 (the last for Astro 4) only knows Node 18/20 and falls back
to the retired `nodejs18.x` on anything newer. `package.json` pins `engines.node`
to 22.x and `scripts/set-function-runtime.mjs` (runs after `astro build`) rewrites
the function config to `nodejs22.x`. Remove both on a move to Astro 5.
Also: under the adapter, prerendering runs from a bundled chunk, so
`portraits.js` / `course-photos.js` fall back to `process.cwd()/public/...` when
the `import.meta.url`-relative path doesn't exist. Don't remove that fallback —
every portrait silently becomes a placeholder without it.

### Testing — run BOTH stores
```
# 1. file store (includes the old-format migration checks)            → 67 checks
RSVP_LOCAL_STORE=/tmp/rsvp-test.json RSVP_ADMIN_KEY=test-key npx astro dev --port 4400
STORE=/tmp/rsvp-test.json BASE=http://localhost:4400 ADMIN_KEY=test-key npm run test:rsvp

# 2. the REAL Redis code path, via a fake Upstash server (fresh = empty) → 61 checks
node scripts/fake-upstash.mjs &
KV_REST_API_URL=http://localhost:4600 KV_REST_API_TOKEN=x RSVP_ADMIN_KEY=test-key npx astro dev --port 4400
BASE=http://localhost:4400 ADMIN_KEY=test-key npm run test:rsvp
```
The file store alone is NOT enough: it can't see how the `@upstash/redis` client
shapes replies. **September 2026 outage:** with `automaticDeserialization: false`
the client returns HGETALL as a flat `[field, value, …]` array; the code treated
it as an object, so every read failed as soon as the first RSVP was saved (the
saves themselves went through). `parseHash()` in `rsvp-store.js` now accepts both
shapes, and step 2 above exercises exactly that path.

**Diagnosing production:** send the admin key as an `x-admin-key` header to any
`/api/rsvp*` call and a 500 includes the real error (`detail`); players only ever
see the generic message. Errors are also in Vercel → the project → **Logs**.
**Clearing a test entry:** the admin page has a **Remove** button on every row
that has replied (two taps: the first arms it, the second deletes). It calls
`DELETE /api/rsvp-admin?player=<id>` with the `x-admin-key` header, which removes
that player's response, profile answers and (if the RSVP created them) the player
record, then triggers a rebuild.

**New-player ("I'm not listed") flow, hardened Sept 2026 after a live cold test:**
- Tapping the tile focuses the name box *inside the tap* (so iOS raises the
  keyboard) and scrolls it into view. On a phone it otherwise appears below the
  fold, under the sticky bar, and the tap looks like it did nothing.
- All scrolling in the form goes through `reveal()`: smooth first, then an
  instant jump if the element still isn't visible above the sticky bar (smooth
  scrolls can be dropped). Error messages use it too.
- A typed name that matches someone already listed (case, spacing and accents
  ignored) selects that player's card and says "You're already on the list as …"
  instead of silently merging on the server.
- The handicap hint tells newcomers without an official index to give their
  best guess. The 2027-questions copy says "Only the organiser sees them", not
  "only as totals": the admin page shows each person's picks.
**After a save succeeds nothing may fail the request** — the deploy hook and the
live count are best-effort (logged, never surfaced as an error).
Existing/new-player RSVP, changing an RSVP, duplicate prevention, unlimited
captains by id with a team name each, write-ins (matched / kept / flagged / merged
when the player joins later), multi-select strengths/weaknesses, handicap
history, old-format migration (needs `STORE`), privacy of the public API,
validation. Never point it at
production (it writes test players).

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
- No external network calls from pages (fonts and logos are self-hosted). Keep it
  that way. The only outbound calls are server-side, from the RSVP API to its
  Redis database and the Vercel deploy hook.
- RSVP private answers follow the rules in **RSVP → Privacy** above.

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
  - **upcoming** → `TournamentUpcoming.astro`: the **single-Overview layout**:
    **Overview** (jump links, countdown, RSVP, TBA scoreboard + flyer, facts, then
    the whole programme via `TripHub.astro`; see **The Trip hub** above),
    **Draft Pool** (eligible players → profiles), **Draft Guide** (placeholder). No Matches/Stats/Awards until
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
2. **Draft pool** = driven by the RSVPs (see **RSVP**): confirmed (RSVP YES
   only), maybe, and veterans / invited rookies still to reply; a NO is out. (A future
   edition's RSVP needs `RSVP_TOURNAMENT_ID` in `src/lib/rsvp-shared.js` changed.) To add a **new
   bloke**: add a player row (with `invitedFor: ["<tournament-id>"]`), and they appear
   in the pool's "Waiting on" until they RSVP and get a **prospect profile** (guarded in `players/[slug].astro` for
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
npm run dev        # pulls RSVPs + the finalised draft (local stores), then preview at http://localhost:4321
npm run build      # pulls RSVPs + the draft, builds (.vercel/output/), pins the function runtime
npm run test:rsvp  # RSVP API checks — see RSVP → Testing
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
scripts/pull-rsvp.mjs       build step: RSVP store → data/rsvp.generated.json (public slice)
scripts/pull-draft.mjs      build step: finalised real draft → data/draft.generated.json
scripts/set-function-runtime.mjs  post-build: pins the API function to nodejs22.x
scripts/test-rsvp.mjs       RSVP API checks (67 on the file store / 61 on fake Redis)
scripts/fake-upstash.mjs    in-memory Upstash REST stand-in, for testing the Redis path
scripts/check-styles.mjs    does a deployed/served site render styled? (core principle 6)
src/lib/rsvp-*.js     RSVP: shared answer lists, the store, the API logic
src/lib/schedule.js, matchcentre*.js, lineup-store.js  the 2027 Match Centre
src/lib/draft-*.js    the Draft Room: shared rules, store, API logic, scouting data, browser helpers, recap renderer
src/pages/api/        rsvp.js + rsvp-admin.js + lineups.js + draft.js + draft-pick.js +
                      draft-admin.js — the ONLY server routes
src/pages/draft/      board.astro (the TV), captain.astro, commish.astro, recap.astro (live recap)
src/pages/rsvp/       index.astro (the permanent /rsvp) + admin.astro
src/lib/data.js       loads JSON, builds id lookups (+ holesForMatch)
src/lib/stats.js      ALL derived statistics (build-time), incl. the hole-stat block
src/lib/portraits.js  build-time scan of public/players/ (portrait or placeholder)
src/lib/course-photos.js  build-time scan of public/photos/<year>/courses/<slug>/
src/lib/format.js     display-only formatting helpers
src/layouts/Base.astro   <head>, noindex, nav, footer
src/components/        Scorebug, MatchRow, MatchSummary, HoleScorecard, TeamLogo,
                      PhotoGallery (reusable grid + swipeable lightbox),
                      PlayerCard + PlayerPortrait (the Players wall),
                      TripHub + TripCountdown (the upcoming-trip programme),
                      CoursePhoto (course hero or drawn placeholder), …
src/pages/            index, tournaments/[id] (tabbed), players/index (wall +
                      comparison), players/[slug] (card header + scouting
                      report), courses/[slug] (course profile), matches, records
public/logos/         woodpeckers.png, silver-spoons.png (transparent)
public/players/       <player-id>.jpg portraits — drop one in, it just appears
public/photos/<year>/courses/<slug>/  course photos — first file is the hero
public/scorecards/<year>/  original per-match card images (full PNG + thumb JPG)
public/photos/<year>/<event>/  trip album images (full + -thumb.jpg per photo)
public/               robots.txt, hero-banner.jpg (home hero), favicon.svg/png, apple-touch-icon.png
```

## Not done yet

- **2 of the 14 players have no portrait yet** — they're on the initials
  placeholder until a photo lands in `public/players/`. Missing: `james-graham`,
  `tanner-curley` (the two rookies). The build prints the current list every time.
- Alan Lozer's portrait is cut from a scanned 2014 school-newspaper cover: the
  other people's names printed beside his head were whited out, and the crop
  keeps the cover headlines to the edge. His head touches the top of the frame
  because the scan itself cuts it off.
- **No nicknames on file.** `players.json` has a `nickname` field on every player
  and both the wall card and the profile header render it when it's set — every
  one is currently `null`, so nothing shows. Filling them in is a data edit, not
  a code change. Don't invent them.
