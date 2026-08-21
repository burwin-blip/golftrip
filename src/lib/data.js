// Central data loader. Every page and every stat reads from here — the JSON in
// /data is the single source of truth. Nothing downstream should hardcode a fact.
import players from '../../data/players.json';
import tournaments from '../../data/tournaments.json';
import matches from '../../data/matches.json';
import drafts from '../../data/drafts.json';
import moments from '../../data/moments.json';
import awards from '../../data/awards.json';
import holeScores from '../../data/hole_scores.json';
import photos from '../../data/photos.json';
import rawHandicapSnapshots from '../../data/handicap_snapshots.json';
import rawTrip2027 from '../../data/trip-2027.json';

// ---------------------------------------------------------------------------
// GHIN handicap check-ins (data/handicap_snapshots.json) are HAND-EDITED, often
// from a phone via the GitHub web editor. So we validate them at build time and,
// on any problem, throw a CLEAR error that names the offending record — the
// build FAILS loudly rather than deploying a broken Power Rankings page. Only
// `player`, `date` and `index` are required; everything else is optional.
// ---------------------------------------------------------------------------
function validateHandicapSnapshots(rows, validPlayerIds) {
  const where = 'data/handicap_snapshots.json';
  if (!Array.isArray(rows)) {
    throw new Error(`${where}: the file must be a JSON array [ ... ] of check-in records. Got ${typeof rows}.`);
  }
  const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
  rows.forEach((r, i) => {
    const at = `record #${i + 1}` + (r && (r.player || r.date) ? ` (player "${r?.player ?? '?'}", date "${r?.date ?? '?'}")` : '');
    if (r === null || typeof r !== 'object' || Array.isArray(r)) {
      throw new Error(`${where}: ${at} must be an object like { "player": "ben-urwin", "date": "2026-04-01", "index": 7.4 }.`);
    }
    if (!r.player) throw new Error(`${where}: ${at} is missing "player" (a player id, e.g. "ben-urwin").`);
    if (!validPlayerIds.has(r.player)) throw new Error(`${where}: ${at} — unknown player id "${r.player}". Check the spelling against the "id" values in data/players.json.`);
    if (!r.date) throw new Error(`${where}: ${at} is missing "date".`);
    if (!isDate(r.date)) throw new Error(`${where}: ${at} — "date" must be YYYY-MM-DD (e.g. "2026-04-01"), got "${r.date}".`);
    if (r.index === undefined || r.index === null || r.index === '') throw new Error(`${where}: ${at} is missing "index" (the GHIN handicap index, a number like 7.4).`);
    if (typeof r.index !== 'number' || Number.isNaN(r.index)) throw new Error(`${where}: ${at} — "index" must be a number (no quotes), got ${JSON.stringify(r.index)}.`);
    if (r.rounds !== undefined && r.rounds !== null && (typeof r.rounds !== 'number' || r.rounds < 0)) throw new Error(`${where}: ${at} — optional "rounds" must be a non-negative number, got ${JSON.stringify(r.rounds)}.`);
    if (r.avgDifferential !== undefined && r.avgDifferential !== null && typeof r.avgDifferential !== 'number') throw new Error(`${where}: ${at} — optional "avgDifferential" must be a number, got ${JSON.stringify(r.avgDifferential)}.`);
    if (r.low !== undefined && r.low !== null && typeof r.low !== 'number') throw new Error(`${where}: ${at} — optional "low" (recent low index) must be a number, got ${JSON.stringify(r.low)}.`);
    if (r.system !== undefined && r.system !== null && r.system !== 'ghin' && r.system !== 'ga') throw new Error(`${where}: ${at} — optional "system" must be "ghin" or "ga", got ${JSON.stringify(r.system)}.`);
    if (r.homeClub !== undefined && r.homeClub !== null && typeof r.homeClub !== 'string') throw new Error(`${where}: ${at} — optional "homeClub" must be text in quotes, got ${JSON.stringify(r.homeClub)}.`);
    if (r.note !== undefined && r.note !== null && typeof r.note !== 'string') throw new Error(`${where}: ${at} — optional "note" must be text in quotes, got ${JSON.stringify(r.note)}.`);
  });
  return rows;
}

const handicapSnapshots = validateHandicapSnapshots(
  rawHandicapSnapshots,
  new Set(players.map((p) => p.id)),
);

// ---------------------------------------------------------------------------
// TRIP PLANNERS (data/trip-<year>.json) — the lead-up detail for an upcoming
// event: itinerary, courses, travel, costs, key dates. Hand-edited the same way
// as the handicap check-ins (often from a phone), so it gets the same defensive
// treatment: validate at build time and FAIL LOUDLY naming the offending field
// rather than shipping a broken Trip tab.
//
// Everything is optional. A missing section simply doesn't render; a null value
// renders as "TBA". That's the point — the page is meant to look deliberate on
// day one, with nothing booked.
// ---------------------------------------------------------------------------
const ITINERARY_KINDS = ['golf', 'draft', 'awards', 'travel', 'social'];

function validateTrip(trip, file, validTournamentIds) {
  const where = `data/${file}`;
  const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
  const bad = (msg) => { throw new Error(`${where}: ${msg}`); };
  // Optional string: absent, null or text — anything else is a mistake worth naming.
  const str = (v, at) => {
    if (v === undefined || v === null) return null;
    if (typeof v !== 'string') bad(`${at} must be text in quotes (or null for "not known yet"), got ${JSON.stringify(v)}.`);
    return v;
  };
  const optDate = (v, at) => {
    if (v === undefined || v === null) return null;
    if (!isDate(v)) bad(`${at} must be a date like "2027-03-25" (or null for "not set yet"), got ${JSON.stringify(v)}.`);
    return v;
  };
  const arr = (v, at) => {
    if (v === undefined || v === null) return [];
    if (!Array.isArray(v)) bad(`${at} must be a JSON array [ ... ], got ${typeof v}.`);
    return v;
  };

  if (trip === null || typeof trip !== 'object' || Array.isArray(trip)) {
    bad('the file must be a JSON object { ... }.');
  }
  if (!trip.tournamentId) bad('missing "tournamentId" (e.g. "duel-in-the-desert-2027").');
  if (!validTournamentIds.has(trip.tournamentId)) {
    bad(`unknown "tournamentId" — "${trip.tournamentId}" is not in data/tournaments.json.`);
  }
  if (trip.utcOffset !== undefined && trip.utcOffset !== null && !/^[+-]\d{2}:\d{2}$/.test(trip.utcOffset)) {
    bad(`"utcOffset" must look like "-07:00" (the venue's offset — it decides when the countdown flips to IT'S ON), got ${JSON.stringify(trip.utcOffset)}.`);
  }

  const courseSlugs = [];
  const num = (v, at) => {
    if (v === undefined || v === null) return null;
    if (typeof v !== 'number' || Number.isNaN(v)) bad(`${at} must be a number with no quotes (7044, not "7,044 yds"), or null if it isn't known — got ${JSON.stringify(v)}.`);
    return v;
  };
  arr(trip.courses, '"courses"').forEach((c, i) => {
    const at = `courses[${i}]` + (c?.round ? ` ("${c.round}")` : '');
    if (c === null || typeof c !== 'object' || Array.isArray(c)) bad(`${at} must be an object { "round": "Round 1", "name": null, ... }.`);
    ['round', 'name', 'location', 'url', 'format', 'note', 'designer', 'signature', 'description', 'source']
      .forEach((k) => str(c[k], `${at} → "${k}"`));
    optDate(c.date, `${at} → "date"`);
    ['opened', 'par', 'yardage'].forEach((k) => num(c[k], `${at} → "${k}"`));
    for (const k of ['url', 'source']) {
      if (c[k] && !/^https?:\/\//.test(c[k])) bad(`${at} → "${k}" must start with http:// or https://, got ${JSON.stringify(c[k])}.`);
    }
    // The slug is the profile's URL AND its photo folder
    // (public/photos/<year>/courses/<slug>/), so it has to stay url-safe.
    if (c.slug !== undefined && c.slug !== null) {
      str(c.slug, `${at} → "slug"`);
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(c.slug)) {
        bad(`${at} → "slug" must be lower-case words joined by hyphens (e.g. "terra-lago-south") — it's the profile URL and the photo folder name. Got ${JSON.stringify(c.slug)}.`);
      }
      if (courseSlugs.includes(c.slug)) bad(`${at} → duplicate "slug" "${c.slug}". Each course needs its own.`);
      courseSlugs.push(c.slug);
      if (!c.name) bad(`${at} has a "slug" but no "name" — a course can't get a profile page without a name.`);
    }
    // The tees this group actually plays off, which is what the rating and slope
    // should describe. Ratings vary by tee, so the set is always named.
    if (c.tee !== undefined && c.tee !== null) {
      if (typeof c.tee !== 'object' || Array.isArray(c.tee)) bad(`${at} → "tee" must be an object { "name": "Blue", "yardage": 6511, "rating": 71.4, "slope": 132 }.`);
      if (!c.tee.name) bad(`${at} → "tee" is missing "name" — a rating and slope mean nothing without the tee they came off.`);
      str(c.tee.name, `${at} → "tee" → "name"`);
      ['yardage', 'rating', 'slope'].forEach((k) => num(c.tee[k], `${at} → "tee" → "${k}"`));
    }
  });

  arr(trip.itinerary, '"itinerary"').forEach((d, i) => {
    const at = `itinerary[${i}]` + (d?.date ? ` ("${d.date}")` : '');
    if (d === null || typeof d !== 'object' || Array.isArray(d)) bad(`${at} must be an object { "date": "2027-03-25", "items": [ ... ] }.`);
    if (!d.date) bad(`${at} is missing "date" (a day needs one, e.g. "2027-03-25").`);
    optDate(d.date, `${at} → "date"`);
    str(d.title, `${at} → "title"`);
    arr(d.items, `${at} → "items"`).forEach((it, j) => {
      const iat = `${at} → items[${j}]` + (it?.title ? ` ("${it.title}")` : '');
      if (it === null || typeof it !== 'object' || Array.isArray(it)) bad(`${iat} must be an object { "title": "Round 1", ... }.`);
      if (!it.title) bad(`${iat} is missing "title".`);
      ['time', 'title', 'detail'].forEach((k) => str(it[k], `${iat} → "${k}"`));
      if (it.kind !== undefined && it.kind !== null && !ITINERARY_KINDS.includes(it.kind)) {
        bad(`${iat} → "kind" must be one of ${ITINERARY_KINDS.map((k) => `"${k}"`).join(', ')}, got ${JSON.stringify(it.kind)}.`);
      }
      if (it.tba !== undefined && it.tba !== null && typeof it.tba !== 'boolean') {
        bad(`${iat} → "tba" must be true or false (no quotes), got ${JSON.stringify(it.tba)}.`);
      }
      // An item can name the course it's played at — the itinerary then links
      // straight to that course's profile.
      if (it.course !== undefined && it.course !== null) {
        str(it.course, `${iat} → "course"`);
        if (!courseSlugs.includes(it.course)) {
          bad(`${iat} → "course" is "${it.course}", which isn't a course slug in this file. Known slugs: ${courseSlugs.map((s) => `"${s}"`).join(', ') || '(none)'}.`);
        }
      }
    });
  });

  if (trip.costs !== undefined && trip.costs !== null) {
    if (typeof trip.costs !== 'object' || Array.isArray(trip.costs)) bad('"costs" must be an object { "note": ..., "items": [ ... ] }.');
    str(trip.costs.note, '"costs" → "note"');
    str(trip.costs.currency, '"costs" → "currency"');
    if (trip.costs.estimate !== undefined && trip.costs.estimate !== null && typeof trip.costs.estimate !== 'boolean') {
      bad(`"costs" → "estimate" must be true or false (no quotes), got ${JSON.stringify(trip.costs.estimate)}.`);
    }
    // Scenarios are the headcounts the trip could land on. Costs per person swing
    // on the final number, so each line carries an amount for each scenario and
    // the page shows them side by side.
    const scenarioIds = [];
    arr(trip.costs.scenarios, '"costs" → "scenarios"').forEach((s, i) => {
      const at = `costs.scenarios[${i}]` + (s?.id ? ` ("${s.id}")` : '');
      if (s === null || typeof s !== 'object' || Array.isArray(s)) bad(`${at} must be an object { "id": "16", "label": "16 players" }.`);
      if (!s.id) bad(`${at} is missing "id" (a short key like "16" — it's what each item's "amounts" are keyed by).`);
      if (!s.label) bad(`${at} is missing "label" (e.g. "16 players").`);
      ['id', 'label'].forEach((k) => str(s[k], `${at} → "${k}"`));
      if (scenarioIds.includes(s.id)) bad(`${at} — duplicate "id" "${s.id}". Each scenario needs its own key.`);
      scenarioIds.push(s.id);
    });
    arr(trip.costs.items, '"costs" → "items"').forEach((c, i) => {
      const at = `costs.items[${i}]` + (c?.label ? ` ("${c.label}")` : '');
      if (c === null || typeof c !== 'object' || Array.isArray(c)) bad(`${at} must be an object { "label": "Golf", "amounts": { ... }, ... }.`);
      if (!c.label) bad(`${at} is missing "label".`);
      // Two ways to price a line. `amounts` are NUMBERS per scenario so the
      // per-person total can be computed rather than typed (and stay right when
      // a figure changes). `amount` is free TEXT for a line that doesn't move
      // with the headcount and isn't worth totalling. null / absent = TBA.
      ['label', 'amount', 'per', 'note'].forEach((k) => str(c[k], `${at} → "${k}"`));
      if (c.approx !== undefined && c.approx !== null && typeof c.approx !== 'boolean') {
        bad(`${at} → "approx" must be true or false (no quotes), got ${JSON.stringify(c.approx)}.`);
      }
      if (c.amounts !== undefined && c.amounts !== null) {
        if (typeof c.amounts !== 'object' || Array.isArray(c.amounts)) {
          bad(`${at} → "amounts" must be an object keyed by scenario id, e.g. { "16": 524, "20": 418 }.`);
        }
        for (const [k, v] of Object.entries(c.amounts)) {
          if (!scenarioIds.includes(k)) {
            bad(`${at} → "amounts" has key "${k}", which isn't a scenario id. Known ids: ${scenarioIds.map((s) => `"${s}"`).join(', ') || '(none defined)'}.`);
          }
          if (v !== null && (typeof v !== 'number' || Number.isNaN(v))) {
            bad(`${at} → "amounts"."${k}" must be a number with no quotes or symbols (524, not "$524"), or null for TBA — got ${JSON.stringify(v)}.`);
          }
        }
      }
      optDate(c.due, `${at} → "due"`);   // the payment deadline for this line
    });
  }

  arr(trip.keyDates, '"keyDates"').forEach((k, i) => {
    const at = `keyDates[${i}]` + (k?.label ? ` ("${k.label}")` : '');
    if (k === null || typeof k !== 'object' || Array.isArray(k)) bad(`${at} must be an object { "label": "Deposits due", "date": null, ... }.`);
    if (!k.label) bad(`${at} is missing "label".`);
    str(k.note, `${at} → "note"`);
    optDate(k.date, `${at} → "date"`);
  });

  if (trip.travel !== undefined && trip.travel !== null) {
    if (typeof trip.travel !== 'object' || Array.isArray(trip.travel)) bad('"travel" must be an object.');
    ['landingWindow', 'note'].forEach((k) => str(trip.travel[k], `"travel" → "${k}"`));
    arr(trip.travel.airports, '"travel" → "airports"').forEach((a, i) => {
      const at = `travel.airports[${i}]` + (a?.code ? ` ("${a.code}")` : '');
      if (a === null || typeof a !== 'object' || Array.isArray(a)) bad(`${at} must be an object { "code": "PSP", "name": ..., "drive": ... }.`);
      if (!a.code) bad(`${at} is missing "code" (e.g. "PSP").`);
      ['code', 'name', 'drive', 'note'].forEach((k) => str(a[k], `${at} → "${k}"`));
    });
    if (trip.travel.address !== undefined && trip.travel.address !== null) {
      ['area', 'line', 'note'].forEach((k) => str(trip.travel.address[k], `"travel" → "address" → "${k}"`));
    }
  }
  return trip;
}

const validTournamentIds = new Set(tournaments.map((t) => t.id));
// One planner per upcoming trip. To add 2028: drop in data/trip-2028.json with
// its own tournamentId, import it above and add it to this list — nothing else.
const trips = [validateTrip(rawTrip2027, 'trip-2027.json', validTournamentIds)];

/** The trip planner for a tournament, or null when there isn't one. */
export const tripFor = (tid) => trips.find((t) => t.tournamentId === tid) ?? null;

export { players, tournaments, matches, drafts, moments, awards, holeScores, photos, handicapSnapshots, trips };

// Hole rows for one match (by match id), sorted by hole. Individual-score rows
// only (excludes scramble team rows) unless includeTeam is set.
export const holesForMatch = (matchId, includeTeam = true) =>
  holeScores
    .filter((h) => h.match_id === matchId && (includeTeam || h.player))
    .sort((a, b) => a.hole - b.hole);

// ---- lookups -------------------------------------------------------------
const byId = (arr) => Object.fromEntries(arr.map((x) => [x.id, x]));

export const playerById = byId(players);
export const tournamentById = byId(tournaments);
export const matchById = byId(matches);

// Teams live inside each tournament (a persistent franchise identity with a
// per-tournament roster). Flatten them into a lookup keyed by team id.
export const teamById = {};
for (const t of tournaments) {
  for (const team of t.teams) {
    teamById[team.id] = { ...team, tournamentId: t.id };
  }
}

// Rounds / courses are structural to a tournament — index them too.
export const roundById = {};
export const courseById = {};
for (const t of tournaments) {
  for (const r of t.rounds) roundById[r.id] = { ...r, tournamentId: t.id };
  for (const c of t.courses) courseById[c.id] = { ...c, tournamentId: t.id };
}

export const getPlayer = (id) => playerById[id];
export const getTeam = (id) => teamById[id];
export const getTournament = (id) => tournamentById[id];
export const getRound = (id) => roundById[id];
export const getCourse = (id) => courseById[id];

// Matches for a tournament, in play order.
export const matchesForTournament = (tid) =>
  matches.filter((m) => m.tournamentId === tid).sort((a, b) => a.number - b.number);

// Roster helper: the player-team-handicap rows for a tournament.
export const rosterForTournament = (tid) =>
  (tournamentById[tid]?.roster ?? []);

export const teamRoster = (tid, teamId) =>
  rosterForTournament(tid).filter((r) => r.teamId === teamId);
