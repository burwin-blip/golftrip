// Central data loader. Every page and every stat reads from here — the JSON in
// /data is the single source of truth. Nothing downstream should hardcode a fact.
import players from '../../data/players.json';
import tournaments from '../../data/tournaments.json';
import matches from '../../data/matches.json';
import drafts from '../../data/drafts.json';
import moments from '../../data/moments.json';
import awards from '../../data/awards.json';

export { players, tournaments, matches, drafts, moments, awards };

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
