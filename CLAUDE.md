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

## Design language

**Light, clean, official golf-tournament coverage** — bright like the Masters /
PGA Tour sites, played completely straight. Mobile-first (that's where everyone
views it).
- **Team colours do the heavy lifting.** Woodpeckers **green** (`--wp` #2E6B43),
  Silver Spoons **navy** (`--ss` #2E4B70). Scoreboards, match results, rosters and
  player profiles are always colour-coded by team. **Gold** (`--gold`) is a
  restrained metallic for championship prestige only.
- **Logos feature throughout.** The two official crests live in `public/logos/`
  (transparent PNGs, extracted from the source art). Render them with
  `src/components/TeamLogo.astro` — next to every team name on scoreboards, match
  rows, rosters, drafts, leaderboards; both appear in the header and on the home
  hero; the favicon (`public/favicon.png`) is a combined mark of the two.
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
  (the `net` field on `scores`) is a net score, even though the source workbook's
  columns were labelled "Gross". The site must say **net** everywhere (round-scores
  tables, player profiles, records, match summaries). When importing new score data,
  treat scores as net unless a source explicitly states gross, and correct the word
  "gross" → "net" in any note/summary text pulled from a workbook or document.
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

- **Home** — four sections: title + tagline; **Results** (most recent *completed*
  tournament, dynamic "YEAR RESULTS · CITY" heading); Awards (Team Champions +
  Champion Golfer); Next Trip (the flyer + link to the upcoming event).
- **Tournament pages** (`tournaments/[id]`) branch on `status`:
  - **completed** → `TournamentCompleted.astro`: **tabbed** (client-side, hash-linked,
    degrades to all-visible with no JS): Overview, Teams, Draft (board + Composite
    Draft Value), Matches (all 18 with summaries), Stats (leaderboard, format-records
    matrix, partnerships, round scores, handicap analysis), Awards (trophy cabinet),
    Moments.
  - **upcoming** → `TournamentUpcoming.astro`: only **Overview** (flyer + dates +
    "Teams/Captains to be announced"), **Draft Pool** (eligible players → profiles),
    **Draft Guide** (placeholder). No Matches/Stats/Awards until results exist.
  `[id].astro` is a thin wrapper that picks the component so the completed
  frontmatter never runs for an upcoming event.
- **Players** (`players/index`) — sortable all-players comparison table.
- **Player profile** (`players/[slug]`) — a **scouting report**: career totals,
  format record, best partners, head-to-head vs everyone, handicap + draft-value
  history with labels, honours, moments, full match log.
- **Matches / Records / Lore** as before.

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
data/                 JSON source of truth (6 files)
scripts/gen_data.py   regenerates /data from the source workbook
src/lib/data.js       loads JSON, builds id lookups
src/lib/stats.js      ALL derived statistics (build-time)
src/lib/format.js     display-only formatting helpers
src/layouts/Base.astro   <head>, noindex, nav, footer
src/components/        Scorebug, MatchRow, TeamLogo, Nav, Footer
src/pages/            index, tournaments/[id] (tabbed), players/index (comparison),
                      players/[slug] (scouting report), matches, records, lore
public/logos/         woodpeckers.png, silver-spoons.png (transparent)
public/               robots.txt, favicon.png, apple-touch-icon.png
```

## Not done yet

- Not pushed to GitHub. The owner has an empty repo ready and will ask to connect
  it once happy with the site.
