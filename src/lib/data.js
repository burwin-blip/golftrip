// Central data loader. Every page and every stat reads from here — the JSON in
// /data is the single source of truth. Nothing downstream should hardcode a fact.
import players from '../../data/players.json';
import tournaments from '../../data/tournaments.json';
import matches from '../../data/matches.json';
import drafts from '../../data/drafts.json';
import moments from '../../data/moments.json';
import awards from '../../data/awards.json';
import holeScores from '../../data/hole_scores.json';
import rawHandicapSnapshots from '../../data/handicap_snapshots.json';

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

export { players, tournaments, matches, drafts, moments, awards, holeScores, handicapSnapshots };

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
