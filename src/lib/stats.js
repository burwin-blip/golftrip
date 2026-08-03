// ============================================================================
// The Annual — derived statistics engine.
//
// EVERY number shown on the site is computed here from /data at build time.
// Pages must never hardcode a record, score, or percentage — call these.
//
// Two distinct point concepts (kept separate on purpose):
//   • TEAM STANDINGS  — each match is worth `pointsAvailable` (1 or 2). The
//     winning team takes it all; a halved match splits it. This produces the
//     official 16.5–13.5.
//   • PLAYER POINTS   — a player's personal `pointsEarned` / `pointsAvailable`
//     across the matches they played (both partners bank the match value).
//   • MATCH RECORD    — W-L-H, scored 1 / 0 / 0.5 per the house convention, for
//     win percentage independent of a match's point weight.
// ============================================================================
import {
  players, tournaments, matches, drafts, awards, moments, holeScores,
  handicapSnapshots,
  playerById, teamById, matchById, roundById, tournamentById,
  matchesForTournament, rosterForTournament,
} from './data.js';

const round1 = (n) => Math.round(n * 10) / 10;
const pct = (num, den) => (den === 0 ? 0 : (num / den) * 100);

// ---------------------------------------------------------------------------
// Match-level: how many standings points each side took from a single match.
// ---------------------------------------------------------------------------
export function matchTeamPoints(match) {
  const p = match.pointsAvailable;
  if (match.halved) return { [match.teamAId]: p / 2, [match.teamBId]: p / 2 };
  const loser = match.winnerTeamId === match.teamAId ? match.teamBId : match.teamAId;
  return { [match.winnerTeamId]: p, [loser]: 0 };
}

// A single player's outcome-derived match-record value (house convention).
const outcomeValue = (o) => (o === 'win' ? 1 : o === 'halve' ? 0.5 : 0);

// ---------------------------------------------------------------------------
// Tournament standings + per-session breakdown.
// ---------------------------------------------------------------------------
export function tournamentStandings(tid) {
  const t = tournaments.find((x) => x.id === tid);
  const ms = matchesForTournament(tid);
  const teams = t.teams.map((team) => {
    let points = 0, w = 0, l = 0, h = 0;
    for (const m of ms) {
      if (m.teamAId !== team.id && m.teamBId !== team.id) continue;
      const tp = matchTeamPoints(m);
      points += tp[team.id];
      if (m.halved) h++;
      else if (m.winnerTeamId === team.id) w++;
      else l++;
    }
    return { team, points: round1(points), matchW: w, matchL: l, matchH: h };
  });
  const winner = teams.slice().sort((a, b) => b.points - a.points)[0];
  const decided = teams[0].points !== teams[1].points;
  return { teams, winnerTeamId: decided ? winner.team.id : null, tied: !decided };
}

export function sessionBreakdown(tid) {
  const t = tournaments.find((x) => x.id === tid);
  const ms = matchesForTournament(tid);
  return t.rounds.map((rnd) => {
    const rMatches = ms.filter((m) => m.roundId === rnd.id);
    const scores = {};
    for (const team of t.teams) scores[team.id] = 0;
    let leader = null;
    for (const m of rMatches) {
      const tp = matchTeamPoints(m);
      for (const k of Object.keys(tp)) scores[k] += tp[k];
    }
    for (const k of Object.keys(scores)) scores[k] = round1(scores[k]);
    const entries = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    if (entries[0][1] !== entries[1][1]) leader = entries[0][0];
    return { round: rnd, scores, matches: rMatches, leaderTeamId: leader };
  });
}

// Cumulative team score after each round (for a running scoreboard / chart).
export function runningScore(tid) {
  const t = tournaments.find((x) => x.id === tid);
  const running = {};
  for (const team of t.teams) running[team.id] = 0;
  return sessionBreakdown(tid).map((s) => {
    for (const k of Object.keys(s.scores)) running[k] = round1(running[k] + s.scores[k]);
    return { round: s.round, cumulative: { ...running } };
  });
}

// ---------------------------------------------------------------------------
// Per-player match log (opponents, partners, result), newest tournament first.
// ---------------------------------------------------------------------------
export function playerMatchLog(playerId) {
  const log = [];
  for (const m of matches) {
    const me = m.players.find((p) => p.playerId === playerId);
    if (!me) continue;
    const partners = m.players
      .filter((p) => p.side === me.side && p.playerId !== playerId)
      .map((p) => p.playerId);
    const opponents = m.players.filter((p) => p.side !== me.side).map((p) => p.playerId);
    log.push({
      match: m,
      round: roundById[m.roundId],
      outcome: me.outcome,
      pointsEarned: me.pointsEarned,
      pointsAvailable: m.pointsAvailable,
      partners,
      opponents,
      teamId: me.teamId,
    });
  }
  return log.sort((a, b) => a.match.number - b.match.number);
}

// ---------------------------------------------------------------------------
// Career stats for one player, aggregated across every tournament.
// ---------------------------------------------------------------------------
export function careerStats(playerId) {
  const log = playerMatchLog(playerId);
  let w = 0, l = 0, h = 0, earned = 0, available = 0;
  const byFormat = {};
  for (const e of log) {
    if (e.outcome === 'win') w++;
    else if (e.outcome === 'loss') l++;
    else h++;
    earned += e.pointsEarned;
    available += e.pointsAvailable;
    const fmt = normalizeFormat(e.round.format);
    const f = (byFormat[fmt] ||= { w: 0, l: 0, h: 0, played: 0 });
    f.played++;
    if (e.outcome === 'win') f.w++;
    else if (e.outcome === 'loss') f.l++;
    else f.h++;
  }
  const played = log.length;
  const matchPoints = w + 0.5 * h;

  // Tournaments this player appeared in, with team + handicap + draft context.
  const appearances = tournaments
    .filter((t) => t.status === 'completed' && rosterForTournament(t.id).some((r) => r.playerId === playerId))
    .map((t) => {
      const rr = rosterForTournament(t.id).find((r) => r.playerId === playerId);
      const pick = drafts.find((d) => d.tournamentId === t.id && d.playerId === playerId);
      const standing = tournamentStandings(t.id);
      const isChampion = t.championPlayerId === playerId;
      const wonTitle = standing.winnerTeamId === rr.teamId;
      return { tournament: t, teamId: rr.teamId, handicapIndex: rr.handicapIndex,
        draftPick: pick?.pick ?? null, draftedBy: pick?.captainId ?? null,
        isChampion, wonTeamTitle: wonTitle };
    });

  const wonAwards = awards.filter(
    (a) => a.winnerType === 'players' && (a.winnerPlayerIds || []).includes(playerId)
  );

  return {
    player: playerById[playerId],
    played, w, l, h,
    matchPoints,
    matchPct: round1(pct(matchPoints, played)),
    pointsEarned: round1(earned),
    pointsAvailable: round1(available),
    pointPct: round1(pct(earned, available)),
    byFormat,
    appearances,
    teamTitles: appearances.filter((a) => a.wonTeamTitle).length,
    individualTitles: appearances.filter((a) => a.isChampion).length,
    wonAwards,
    log,
  };
}

function normalizeFormat(fmt) {
  if (/scramble/i.test(fmt)) return 'Scramble';
  if (/best ?ball/i.test(fmt)) return 'Best Ball';
  if (/shamble/i.test(fmt)) return 'Shamble';
  if (/stableford/i.test(fmt)) return 'Stableford';
  if (/singles|championship/i.test(fmt)) return 'Singles';
  return fmt;
}
export { normalizeFormat };

// ---------------------------------------------------------------------------
// Head-to-head: matches where A and B were on OPPOSITE sides.
// Record is from A's perspective.
// ---------------------------------------------------------------------------
export function headToHead(aId, bId) {
  const encounters = [];
  let aw = 0, bw = 0, hv = 0, aPts = 0, bPts = 0;
  for (const m of matches) {
    const a = m.players.find((p) => p.playerId === aId);
    const b = m.players.find((p) => p.playerId === bId);
    if (!a || !b || a.side === b.side) continue;
    if (a.outcome === 'win') aw++;
    else if (a.outcome === 'loss') bw++;
    else hv++;
    aPts += a.pointsEarned;
    bPts += b.pointsEarned;
    encounters.push({ match: m, round: roundById[m.roundId], aOutcome: a.outcome });
  }
  return { aId, bId, played: encounters.length, aWins: aw, bWins: bw, halved: hv,
    aPoints: round1(aPts), bPoints: round1(bPts), encounters };
}

// Every opponent a player has faced, with the H2H summary (for profile pages).
export function opponentRecords(playerId) {
  const seen = new Set();
  for (const m of matches) {
    const me = m.players.find((p) => p.playerId === playerId);
    if (!me) continue;
    for (const p of m.players) if (p.side !== me.side) seen.add(p.playerId);
  }
  return [...seen]
    .map((oid) => ({ opponent: playerById[oid], ...headToHead(playerId, oid) }))
    .sort((a, b) => b.played - a.played || b.aWins - a.aWins);
}

// ---------------------------------------------------------------------------
// Partnerships: pairs who played the SAME side together.
// ---------------------------------------------------------------------------
export function allPartnerships() {
  const map = new Map();
  for (const m of matches) {
    const bySide = { A: [], B: [] };
    for (const p of m.players) bySide[p.side].push(p);
    for (const side of ['A', 'B']) {
      const grp = bySide[side];
      for (let i = 0; i < grp.length; i++)
        for (let j = i + 1; j < grp.length; j++) {
          const key = [grp[i].playerId, grp[j].playerId].sort().join('|');
          const rec = map.get(key) || {
            players: key.split('|'), played: 0, w: 0, l: 0, h: 0, earned: 0, available: 0,
          };
          rec.played++;
          rec.earned += grp[i].pointsEarned; // both partners bank the same value
          rec.available += m.pointsAvailable;
          if (grp[i].outcome === 'win') rec.w++;
          else if (grp[i].outcome === 'loss') rec.l++;
          else rec.h++;
          map.set(key, rec);
        }
    }
  }
  return [...map.values()]
    .map((r) => ({
      ...r,
      matchPoints: r.w + 0.5 * r.h,
      pointPct: round1(pct(r.earned, r.available)),
      earned: round1(r.earned),
      available: round1(r.available),
    }))
    .sort((a, b) => b.pointPct - a.pointPct || b.earned - a.earned || b.played - a.played);
}

export function partnershipsFor(playerId) {
  return allPartnerships()
    .filter((p) => p.players.includes(playerId))
    .map((p) => ({ ...p, partnerId: p.players.find((x) => x !== playerId) }));
}

// ---------------------------------------------------------------------------
// All-time franchise series (built to grow as editions are added).
// ---------------------------------------------------------------------------
export function allTimeSeries() {
  const franchises = {};
  for (const team of Object.values(teamById)) {
    (franchises[team.id] ||= {
      teamId: team.id, name: team.name, color: team.color,
      titles: 0, played: 0, totalPoints: 0,
    });
  }
  const completed = completedTournaments();
  for (const t of completed) {
    const st = tournamentStandings(t.id);
    for (const row of st.teams) {
      const f = franchises[row.team.id];
      f.played++;
      f.totalPoints = round1(f.totalPoints + row.points);
      if (st.winnerTeamId === row.team.id) f.titles++;
    }
  }
  const arr = Object.values(franchises).sort((a, b) => b.titles - a.titles);
  return { franchises: arr, editions: completed.length };
}

// Every tournament, newest first (includes upcoming) — for navigation/listing.
export function allTournaments() {
  return tournaments.slice().sort((a, b) => b.year - a.year);
}
// ONLY completed tournaments feed stats/records/careers. Upcoming events never do.
export function completedTournaments() {
  return tournaments.filter((t) => t.status === 'completed').sort((a, b) => b.year - a.year);
}
export function upcomingTournaments() {
  return tournaments.filter((t) => t.status === 'upcoming').sort((a, b) => a.year - b.year);
}
// The most recent COMPLETED tournament (drives home "results", champions, footer).
export function latestTournament() {
  return completedTournaments()[0];
}

// ---------------------------------------------------------------------------
// Leaderboards + records + hall of fame.
// ---------------------------------------------------------------------------
export function playerLeaderboard() {
  return players
    .map((p) => careerStats(p.id))
    .filter((c) => c.played > 0)
    .sort((a, b) =>
      b.pointsEarned - a.pointsEarned ||   // weighted tournament points (1 or 2 per match)
      b.pointPct - a.pointPct ||
      a.l - b.l);
}

// Parse a match-play margin string ("5&3", "2 up", "AS") into holes-up value.
function holesUp(margin) {
  if (!margin) return null;
  const s = String(margin).trim();
  if (/^as$/i.test(s)) return 0;
  const amp = s.match(/^(\d+)\s*&\s*(\d+)/);
  if (amp) return parseInt(amp[1], 10);
  const up = s.match(/^(\d+)\s*up/i);
  if (up) return parseInt(up[1], 10);
  return null; // stableford / point-score margins handled separately
}

// Parse a point-score margin ("30.5–30") into an absolute difference.
function pointDiff(margin) {
  const m = String(margin).match(/([\d.]+)\D+([\d.]+)/);
  if (!m) return null;
  return round1(Math.abs(parseFloat(m[1]) - parseFloat(m[2])));
}

export function records() {
  // Biggest margin of victory (match-play holes).
  let biggest = null;
  for (const m of matches) {
    const hv = holesUp(m.margin);
    if (hv == null || m.halved) continue;
    if (!biggest || hv > biggest.holes) biggest = { match: m, holes: hv };
  }

  // Narrowest decided match (holes-up == 1, or smallest point diff).
  const narrowMatchPlay = matches.filter((m) => !m.halved && holesUp(m.margin) === 1);
  let narrowPoints = null;
  for (const m of matches) {
    const d = pointDiff(m.margin);
    if (d == null || m.halved) continue;
    if (!narrowPoints || d < narrowPoints.diff) narrowPoints = { match: m, diff: d };
  }

  // Largest session swing (biggest team point gap in a single session).
  let swing = null;
  for (const t of completedTournaments()) {
    for (const s of sessionBreakdown(t.id)) {
      const vals = Object.entries(s.scores).sort((a, b) => b[1] - a[1]);
      const gap = round1(vals[0][1] - vals[1][1]);
      if (!swing || gap > swing.gap)
        swing = { round: s.round, gap, leaderTeamId: vals[0][0], scores: s.scores };
    }
  }

  // Best individual point percentage (min 3 matches).
  const board = playerLeaderboard();
  const bestPct = board.filter((c) => c.played >= 3)
    .slice().sort((a, b) => b.pointPct - a.pointPct)[0];
  const mostPoints = board.slice().sort((a, b) => b.pointsEarned - a.pointsEarned)[0];

  // Best partnership (by point %, min 1 match).
  const bestPair = allPartnerships()[0];

  // Lowest net round on record (any complete round with a net score).
  let lowNet = null;
  for (const t of completedTournaments()) {
    for (const sc of t.scores || []) {
      if (sc.net == null || !sc.completeRound) continue;
      const rnd = roundById[sc.roundId];
      if (!lowNet || sc.net < lowNet.net ||
          (sc.net === lowNet.net && rnd.holes > lowNet.round.holes))
        lowNet = { playerId: sc.playerId, net: sc.net, round: rnd };
    }
  }

  // Best Stableford card on record.
  let bestStbl = null;
  for (const t of completedTournaments()) {
    for (const sc of t.scores || []) {
      if (sc.stableford == null) continue;
      if (!bestStbl || sc.stableford > bestStbl.stableford)
        bestStbl = { playerId: sc.playerId, stableford: sc.stableford, round: roundById[sc.roundId] };
    }
  }

  return { biggest, narrowMatchPlay, narrowPoints, swing, bestPct, mostPoints, bestPair, lowNet, bestStbl };
}

export function hallOfFame() {
  const champions = completedTournaments().map((t) => {
    const st = tournamentStandings(t.id);
    return {
      tournament: t,
      teamChampionId: st.winnerTeamId,
      championPlayerId: t.championPlayerId,
      finalScore: t.finalScore,
    };
  });
  return { champions };
}

export function awardsForTournament(tid) {
  return awards.filter((a) => a.tournamentId === tid);
}
export function momentsForTournament(tid) {
  return moments.filter((m) => m.tournamentId === tid);
}
export function draftForTournament(tid) {
  return drafts.filter((d) => d.tournamentId === tid).sort((a, b) => a.pick - b.pick);
}

// Net Stableford leaderboard for a tournament's Stableford round. Higher points =
// more good scoring holes, so it's the closest honest read on birdie-making we
// have (there is no hole-by-hole data). Returns null if the event had no
// Stableford round.
export function stablefordLeaderboard(tid) {
  const t = tournamentById[tid];
  if (!t) return null;
  const round = (t.rounds || []).find((r) => /stableford/i.test(r.format));
  if (!round) return null;
  const teamOf = Object.fromEntries((t.roster || []).map((r) => [r.playerId, r.teamId]));
  const rows = (t.scores || [])
    .filter((s) => s.roundId === round.id && s.stableford != null)
    .map((s) => ({ playerId: s.playerId, teamId: teamOf[s.playerId] || null, points: s.stableford }))
    .sort((a, b) => b.points - a.points);
  return { round, rows };
}

// Eligible-player pool for an UPCOMING tournament: everyone who has played a
// completed event, plus anyone explicitly confirmed for this one. New blokes
// (no record yet) appear once `confirmedFor` includes this tournament's id.
// Sorted by career points so captains see the most productive players first.
export function draftPoolFor(tid) {
  return players
    .map((p) => {
      const c = careerStats(p.id);
      const last = c.appearances[c.appearances.length - 1] || null;
      const confirmed = (p.confirmedFor || []).includes(tid);
      return {
        player: p, confirmed,
        eligible: c.played > 0 || confirmed,
        played: c.played, w: c.w, h: c.h, l: c.l,
        pointsEarned: c.pointsEarned, pointPct: c.pointPct,
        teamId: last ? last.teamId : null,
        handicap: last ? last.handicapIndex : null,
        isChampion: c.individualTitles > 0,
        isNew: c.played === 0,
      };
    })
    .filter((x) => x.eligible)
    .sort((a, b) => b.pointsEarned - a.pointsEarned || a.player.name.localeCompare(b.player.name));
}

// ===========================================================================
// DEEPER STATS — per-format records, round summary, players comparison.
// All career-level functions aggregate across every tournament automatically.
// ===========================================================================

// Per-format record for a player, using the RAW format label (so the
// Individual Championship counts separately from ordinary Singles, matching
// the workbook's Format Records). Aggregates across all tournaments.
export function formatRecords(playerId) {
  const byFmt = new Map();
  for (const m of matches) {
    const me = m.players.find((p) => p.playerId === playerId);
    if (!me) continue;
    const rec = byFmt.get(m.format) || { format: m.format, played: 0, w: 0, h: 0, l: 0, earned: 0, available: 0 };
    rec.played++;
    rec.earned += me.pointsEarned;
    rec.available += m.pointsAvailable;
    if (me.outcome === 'win') rec.w++;
    else if (me.outcome === 'halve') rec.h++;
    else rec.l++;
    byFmt.set(m.format, rec);
  }
  const order = ['Scramble', 'Best Ball Match Play (NET)', '9-hole Shamble',
    'Team Average Stableford', 'Singles Match Play', 'Individual Championship / Singles'];
  return [...byFmt.values()]
    .map((r) => ({ ...r, earned: round1(r.earned), pointPct: round1(pct(r.earned, r.available)) }))
    .sort((a, b) => order.indexOf(a.format) - order.indexOf(b.format));
}

// Round-by-round team scores for a tournament (thin wrapper on sessionBreakdown).
export function roundSummary(tid) {
  return sessionBreakdown(tid).map((s) => ({
    round: s.round,
    scores: s.scores,
    winnerTeamId: s.leaderTeamId,
    pointsAvailable: s.round.matchCount * s.round.pointsPerMatch,
  }));
}

// One row per player for the sortable all-players comparison table.
// Career points/win% aggregate across years; handicap + draft come from the
// player's most recent appearance.
export function playersComparison() {
  return players
    .map((p) => careerStats(p.id))
    .filter((c) => c.played > 0)
    .map((c) => {
      const latest = c.appearances[c.appearances.length - 1];
      return {
        player: c.player,
        teamId: latest.teamId,
        played: c.played, w: c.w, l: c.l, h: c.h,
        matchPoints: c.matchPoints,
        pointsEarned: c.pointsEarned,
        pointPct: c.pointPct,
        matchPct: c.matchPct,
        handicap: latest.handicapIndex,
        draftPick: latest.draftPick,
        isCaptain: latest.draftPick == null,
      };
    })
    .sort((a, b) => b.pointsEarned - a.pointsEarned || b.pointPct - a.pointPct);
}

// ===========================================================================
// ANALYTICS — handicap-adjusted performance + composite draft value.
// Formulas follow the workbook's V3 Methodology / Format Performance sheets.
// These are transparent proxy models, NOT true strokes-gained (caveat below).
// Every analytic is per-tournament (each event has its own field + draft).
// ===========================================================================

export const ANALYTICS_CAVEAT =
  'Transparent proxy models based on tournament handicaps and scorecards — not true strokes-gained or hole-by-hole Squabbit scoring.';

function fieldAverageHandicap(tid) {
  const r = rosterForTournament(tid);
  return r.reduce((s, x) => s + x.handicapIndex, 0) / r.length;
}

// Player's earned/available points within ONE tournament.
function tournamentPointsFor(tid, playerId) {
  let earned = 0, available = 0;
  for (const m of matchesForTournament(tid)) {
    const me = m.players.find((p) => p.playerId === playerId);
    if (!me) continue;
    earned += me.pointsEarned;
    available += m.pointsAvailable;
  }
  return { earned: round1(earned), available };
}

// Handicap-adjusted performance (Expected Point %, Overperformance).
//   Expected Point % = 0.50 − 0.008 × (hcp − fieldAvg), capped [0.30, 0.70]
//   Expected Points  = Expected Point % × points available
//   Overperformance  = actual points − expected points
export function handicapAnalysis(tid) {
  const roster = rosterForTournament(tid);
  const fieldAvg = fieldAverageHandicap(tid);
  const tier = (h) => (h < 10 ? 'Low' : h > 14 ? 'High' : 'Mid');
  const rows = roster.map((r) => {
    const { earned, available } = tournamentPointsFor(tid, r.playerId);
    const expectedPct = Math.min(0.70, Math.max(0.30, 0.50 - 0.008 * (r.handicapIndex - fieldAvg)));
    const expectedPoints = expectedPct * available;
    const pointPct = available ? earned / available : 0;
    return {
      playerId: r.playerId, teamId: r.teamId, handicap: r.handicapIndex,
      earned, available,
      pointPct, expectedPct,
      expectedPoints: Math.round(expectedPoints * 1000) / 1000,
      overPoints: Math.round((earned - expectedPoints) * 1000) / 1000,
      overPct: Math.round((pointPct - expectedPct) * 1000) / 1000,
      tier: tier(r.handicapIndex),
      label: null,
    };
  });
  const byOver = rows.slice().sort((a, b) => b.overPoints - a.overPoints);
  if (byOver.length) {
    byOver[0].label = 'Most Overperformed Handicap';
    byOver[byOver.length - 1].label = 'Most Underperformed Handicap';
  }
  return { fieldAvg: Math.round(fieldAvg * 1000) / 1000, rows };
}

// ---- Scorecard Index (the net-scoring term inside Composite Draft Value) ----
// SI = BestBall-vs-Hcp + Shamble-vs-Hcp + Stableford-vs-Field + Singles(±2)
//   vs-Hcp round  = (fieldMeanNet − playerNet) + alloc × (playerHcp − fieldMeanHcp)
//                   alloc = 0.65 for the 18-hole Best Ball, 0.30 for the 9-hole Shamble
//   Stableford    = playerStbl − fieldMeanStbl
//   Singles       = +2 win / −2 loss / 0 halve
// Field means are taken over every player who posted that round.
function roundOfFormat(tid, re) {
  return tournamentById[tid].rounds.find((r) => re.test(r.format));
}
function scoresForRound(tid, roundId, key) {
  const out = {};
  for (const s of tournamentById[tid].scores || []) {
    if (s.roundId === roundId && s[key] != null) out[s.playerId] = s[key];
  }
  return out;
}
const meanOf = (obj) => {
  const v = Object.values(obj);
  return v.reduce((s, x) => s + x, 0) / v.length;
};

export function scorecardIndex(tid) {
  const roster = rosterForTournament(tid);
  const hcp = Object.fromEntries(roster.map((r) => [r.playerId, r.handicapIndex]));
  const fieldHcp = fieldAverageHandicap(tid);

  const bbRound = roundOfFormat(tid, /best ?ball/i);
  const shRound = roundOfFormat(tid, /shamble/i);
  const stRound = roundOfFormat(tid, /stableford/i);
  const bb = bbRound ? scoresForRound(tid, bbRound.id, 'net') : {};
  const sh = shRound ? scoresForRound(tid, shRound.id, 'net') : {};
  const st = stRound ? scoresForRound(tid, stRound.id, 'stableford') : {};
  const meanBB = meanOf(bb), meanSH = meanOf(sh), meanST = meanOf(st);

  // Singles score: +2 win / −2 loss / 0 halve, from the player's singles match.
  const singlesRound = tournamentById[tid].rounds.find((r) => /singles|championship/i.test(r.format));
  const singlesScore = {};
  if (singlesRound) {
    for (const m of matchesForTournament(tid)) {
      if (m.roundId !== singlesRound.id) continue;
      for (const p of m.players)
        singlesScore[p.playerId] = p.outcome === 'win' ? 2 : p.outcome === 'loss' ? -2 : 0;
    }
  }

  const r4 = (n) => Math.round(n * 10000) / 10000;
  const rows = roster.map((r) => {
    const pid = r.playerId;
    const bbv = bb[pid] != null ? (meanBB - bb[pid]) + 0.65 * (hcp[pid] - fieldHcp) : 0;
    const shv = sh[pid] != null ? (meanSH - sh[pid]) + 0.30 * (hcp[pid] - fieldHcp) : 0;
    const stv = st[pid] != null ? (st[pid] - meanST) : 0;
    const sgl = singlesScore[pid] || 0;
    return {
      playerId: pid, teamId: r.teamId,
      bestBallVsHcp: r4(bbv), shambleVsHcp: r4(shv),
      stablefordVsField: r4(stv), singlesScore: sgl,
      total: r4(bbv + shv + stv + sgl),
    };
  });
  return { rows, byId: Object.fromEntries(rows.map((x) => [x.playerId, x])) };
}

// ---- Composite Draft Value ----
// Composite = points earned + later-pick bonus (0.2 × pick) + scorecard index.
// Labels: Best Draft Pick (rank 1); Draft Steal (top-3 composite from pick ≥ 6,
// excluding the best pick); Draft Miss (early pick ≤ 4 landing in the bottom 3).
export function draftValue(tid) {
  const picks = draftForTournament(tid);
  const si = scorecardIndex(tid).byId;
  let rows = picks.map((d) => {
    const { earned } = tournamentPointsFor(tid, d.playerId);
    const laterPickBonus = round1(0.2 * d.pick);
    const index = si[d.playerId]?.total ?? 0;
    return {
      playerId: d.playerId, teamId: d.teamId, pick: d.pick,
      matchPoints: earned, laterPickBonus, scorecardIndex: round1(index),
      composite: Math.round((earned + laterPickBonus + index) * 10000) / 10000,
      label: null,
    };
  });
  rows.sort((a, b) => b.composite - a.composite);
  rows.forEach((r, i) => (r.rank = i + 1));
  const n = rows.length;
  for (const r of rows) {
    if (r.rank === 1) r.label = 'Best Draft Pick';
    else if (r.rank <= 3 && r.pick >= 6) r.label = 'Draft Steal';
    else if (r.pick <= 4 && r.rank >= n - 2) r.label = 'Draft Miss';
  }
  return rows;
}

export { round1, pct };

// ==========================================================================
// HOLE-BY-HOLE (NET) STATS — computed from data/hole_scores.json
// ==========================================================================
// Coverage rule (keep visible wherever these appear):
//   • Individual net scoring uses recorded NET scores — Best Ball, Shamble and
//     Singles net strokes — plus net Stableford points in Round 4.
//   • The Round 1 Scramble is a TEAM GROSS score with no individual
//     attribution, so it is excluded from every individual hole stat.
//   • Conceded holes (the match was already decided) are excluded.
// Everything below is derived at build time from the hole rows; nothing is
// copied from the workbook. New scorecards flow in with zero code changes.
export const HOLE_STATS_COVERAGE =
  'Hole-by-hole figures use recorded NET scores — Best Ball, Shamble and ' +
  'Singles net strokes, plus net Stableford points in Round 4. The Round 1 ' +
  'Scramble is a team score not attributed to individuals, and conceded holes ' +
  'are excluded.';

// Every individual, playable row: has a player, not conceded, has a net_result
// (so Scramble team rows and conceded holes drop out automatically).
// Short team badge for compact match-state labels (WP / SS), derived from name.
function teamShort(teamId) {
  const t = teamById[teamId];
  if (!t) return '';
  return t.name.split(/\s+/).map((w) => w[0]).join('').toUpperCase();
}

// All individual playable rows, optionally scoped to one tournament.
function individualHoleRows(tid) {
  return holeScores.filter(
    (h) => h.player && !h.conceded && h.net_result != null && (!tid || h.tournament === tid),
  );
}

// Coarse bucket shared across stroke rounds (which split Double/Triple) and
// Stableford (which lumps "Double Bogey or Worse").
function netBucket(result) {
  if (!result) return null;
  if (result.startsWith('Eagle')) return 'eagle'; // eagle or better
  if (result === 'Birdie') return 'birdie';
  if (result === 'Par') return 'par';
  if (result === 'Bogey') return 'bogey';
  return 'double'; // double bogey or worse
}

// Same buckets, computed straight from a numeric score-vs-par (used for the
// Round 1 Scramble, which is scored on team gross rather than a net result label).
function vsParBucket(v) {
  if (v == null) return null;
  if (v <= -2) return 'eagle';
  if (v === -1) return 'birdie';
  if (v === 0) return 'par';
  if (v === 1) return 'bogey';
  return 'double';
}

// One row per (player, tournament, round) that posted stroke net scores.
// total = sum of net strokes; complete = every hole in that round was scored
// (no concessions). Front/back are the 1-9 / 10-18 splits for 18-hole rounds.
let _netRoundTotals = null;
export function netRoundTotals() {
  if (_netRoundTotals) return _netRoundTotals;
  const byKey = new Map();
  for (const h of holeScores) {
    if (!h.player || h.score_type !== 'net') continue;
    const key = `${h.player}|${h.tournament}|${h.round}`;
    if (!byKey.has(key))
      byKey.set(key, {
        playerId: h.player, tournament: h.tournament, round: h.round,
        course: h.course, format: h.format, total: 0, parTotal: 0, holes: 0,
        conceded: 0, holesInRound: 0, front: 0, back: 0, frontHoles: 0, backHoles: 0,
      });
    const r = byKey.get(key);
    r.holesInRound++;
    if (h.conceded) { r.conceded++; continue; }
    if (h.net_score == null) continue;
    r.total += h.net_score;
    r.parTotal += h.par;
    r.holes++;
    if (h.hole <= 9) { r.front += h.net_score; r.frontHoles++; }
    else { r.back += h.net_score; r.backHoles++; }
  }
  _netRoundTotals = [...byKey.values()].map((r) => ({
    ...r,
    vsPar: r.total - r.parTotal,
    complete: r.conceded === 0 && r.holes === r.holesInRound,
  }));
  return _netRoundTotals;
}

// Longest run of consecutive holes (within a single round) at net birdie or
// better. Conceded/unscored holes break the streak.
function longestBirdieStreak(playerId, tid) {
  const byRound = new Map();
  for (const h of individualHoleRows(tid)) {
    if (h.player !== playerId) continue;
    const k = `${h.tournament}|${h.round}`;
    if (!byRound.has(k)) byRound.set(k, []);
    byRound.get(k).push(h);
  }
  let best = 0;
  for (const rows of byRound.values()) {
    rows.sort((a, b) => a.hole - b.hole);
    let cur = 0;
    for (const h of rows) {
      const b = netBucket(h.net_result);
      if (b === 'birdie' || b === 'eagle') { cur++; if (cur > best) best = cur; }
      else cur = 0;
    }
  }
  return best;
}

// Full hole-scoring line for one player. Career by default; pass a tid to scope
// to a single tournament.
export function playerHoleStats(playerId, tid) {
  const rows = individualHoleRows(tid).filter((h) => h.player === playerId);
  const buckets = { eagle: 0, birdie: 0, par: 0, bogey: 0, double: 0 };
  for (const h of rows) buckets[netBucket(h.net_result)]++;
  const stroke = rows.filter((h) => h.net_score != null && h.net_vs_par != null);
  const holesScored = stroke.length;
  const netToPar = stroke.reduce((s, h) => s + h.net_vs_par, 0);
  const stbl = holeScores.filter(
    (h) => h.player === playerId && h.score_type === 'stableford' && !h.conceded && (!tid || h.tournament === tid),
  );
  const stablefordPoints = stbl.reduce((s, h) => s + (h.stableford_points || 0), 0);
  const myRounds = netRoundTotals().filter(
    (r) => r.playerId === playerId && r.complete && (!tid || r.tournament === tid),
  );
  // Best round ranked by net-vs-par so 9- and 18-hole rounds compare fairly.
  const bestRound = myRounds.length
    ? myRounds.reduce((a, b) => (b.vsPar < a.vsPar ? b : a))
    : null;
  return {
    playerId,
    teamId: rows[0]?.team ?? null, // team is per-tournament; read it off the hole data
    hasHoleData: rows.length > 0,
    holesPlayed: rows.length,
    holesScored,
    ...buckets,
    birdiesOrBetter: buckets.eagle + buckets.birdie,
    avgVsPar: holesScored ? netToPar / holesScored : null,
    stablefordPoints,
    bestRound,
    longestBirdieStreak: longestBirdieStreak(playerId, tid),
  };
}

// Every player who has any hole data, with their full line (career or scoped).
export function holeStatsLeaderboard(tid) {
  const ids = [...new Set(individualHoleRows(tid).map((h) => h.player))];
  return ids.map((id) => playerHoleStats(id, tid));
}

// Most Net Birdies — the headline board. Birdie = exactly net −1 (eagles are a
// separate, rarer bucket, shown alongside as a tiebreak/decoration).
export function mostNetBirdies(tid) {
  return holeStatsLeaderboard(tid)
    .map((s) => ({
      playerId: s.playerId, teamId: s.teamId, birdies: s.birdie, eagles: s.eagle,
      birdiesOrBetter: s.birdiesOrBetter, pars: s.par,
    }))
    .sort((a, b) => b.birdies - a.birdies || b.eagles - a.eagles);
}

// Lowest complete NET round (18-hole by default; pass 9 for the Shamble).
export function lowestNetRounds(holeCount = 18, tid) {
  return netRoundTotals()
    .filter((r) => !tid || r.tournament === tid)
    .filter((r) => r.complete && r.holes === holeCount)
    .sort((a, b) => a.total - b.total);
}

// Best net scoring average vs par (players with a meaningful sample of scored holes).
export function scoringAverageLeaderboard(minHoles = 18, tid) {
  return holeStatsLeaderboard(tid)
    .filter((s) => s.holesScored >= minHoles)
    .map((s) => ({ playerId: s.playerId, avgVsPar: s.avgVsPar, holesScored: s.holesScored }))
    .sort((a, b) => a.avgVsPar - b.avgVsPar);
}

// ---- Per-match scorecard (the hole-by-hole grid + running match state) -----
// Builds one row per player (net cells, totals) plus, for match-play formats,
// the per-hole winner and running match state. Stableford rounds show points
// and a running points differential instead of holes-up.
export function matchScorecard(matchId) {
  const match = matchById[matchId];
  if (!match) return null;
  const rows = holeScores.filter((h) => h.match_id === matchId);
  if (!rows.length) return null;
  const isScramble = match.format === 'Scramble';
  const isStableford = rows.some((h) => h.score_type === 'stableford');
  const category = isStableford ? 'stableford' : 'matchplay';

  const holeNums = [...new Set(rows.map((h) => h.hole))].sort((a, b) => a - b);
  const meta = holeNums.map((n) => {
    const any = rows.find((h) => h.hole === n);
    return { hole: n, par: any.par, si: any.stroke_index };
  });

  // Side membership + display order
  const sideOf = {};
  for (const p of match.players) sideOf[p.playerId] = p.side;

  // Build player rows (skip scramble — no individual attribution there)
  let players = [];
  if (!isScramble) {
    const ids = [...new Set(rows.filter((h) => h.player).map((h) => h.player))];
    players = ids.map((pid) => {
      const pr = rows.filter((h) => h.player === pid).sort((a, b) => a.hole - b.hole);
      const cells = meta.map(({ hole }) => {
        const h = pr.find((x) => x.hole === hole);
        if (!h) return { hole, empty: true };
        const bucket = h.conceded ? null : netBucket(h.net_result);
        return {
          hole,
          conceded: !!h.conceded,
          net: h.net_score,
          points: h.stableford_points,
          result: h.net_result,
          bucket, // 'eagle' | 'birdie' | 'par' | 'bogey' | 'double' | null → scorecard notation
          isBirdie: bucket === 'birdie',
          isEagle: bucket === 'eagle',
          isBogeyPlus: bucket === 'bogey' || bucket === 'double',
        };
      });
      const netTotal = pr.reduce((s, h) => s + (h.net_score || 0), 0);
      const stblTotal = pr.reduce((s, h) => s + (h.stableford_points || 0), 0);
      const playedThru = pr.filter((h) => !h.conceded && (h.net_score != null || h.stableford_points != null)).length;
      const complete = playedThru === pr.length;
      return {
        playerId: pid, name: playerById[pid]?.name, teamId: pr[0]?.team ?? null,
        side: sideOf[pid], hcp: pr.find((h) => h.playing_handicap != null)?.playing_handicap ?? null,
        cells,
        total: isStableford ? stblTotal : netTotal,
        totalLabel: isStableford ? 'pts' : 'net',
        playedThru, complete,
      };
    });
    // Side A first, then B; within a side keep data order
    players.sort((a, b) => (a.side === b.side ? 0 : a.side === 'A' ? -1 : 1));
  }

  // Per-hole comparison + running state
  const aTeam = match.teamAId, bTeam = match.teamBId;
  const compareVal = (h, side, hole) => {
    if (isScramble) {
      const row = rows.find((r) => r.hole === hole && r.team === (side === 'A' ? aTeam : bTeam));
      return row && row.team_gross != null ? { v: row.team_gross, lowWins: true } : null;
    }
    if (isStableford) {
      const ps = rows.filter((r) => r.hole === hole && sideOf[r.player] === side && r.stableford_points != null);
      if (!ps.length) return null;
      return { v: ps.reduce((s, r) => s + r.stableford_points, 0), lowWins: false };
    }
    // best ball / shamble / singles: side's best (min) net that hole
    const ns = rows
      .filter((r) => r.hole === hole && sideOf[r.player] === side && !r.conceded && r.net_score != null)
      .map((r) => r.net_score);
    return ns.length ? { v: Math.min(...ns), lowWins: true } : null;
  };

  // A match-play match ends when a side leads by more holes than remain. The
  // authoritative margin ("4&2") tells us the closeout hole: any holes past it
  // (best ball records all 18; singles concede the rest) are dead — freeze the
  // running state there so the card agrees with the badge.
  const N = meta.length;
  const mm = /^(\d+)\s*&\s*(\d+)$/.exec(match.margin || '');
  const closeoutHole = mm ? N - parseInt(mm[2], 10) : N;

  let running = 0; // + = side A ahead (holes, or stableford points)
  let holesWonA = 0, holesWonB = 0, holesHalved = 0;
  const state = meta.map(({ hole, par, si }) => {
    const closed = !isStableford && hole > closeoutHole;
    const a = compareVal(rows, 'A', hole);
    const b = compareVal(rows, 'B', hole);
    let winner = null;
    if (!closed && a && b) {
      if (a.v === b.v) winner = 'halved';
      else if (a.lowWins) winner = a.v < b.v ? 'A' : 'B';
      else winner = a.v > b.v ? 'A' : 'B';
    }
    if (isStableford && a && b) running += a.v - b.v;
    else if (winner === 'A') { running += 1; holesWonA++; }
    else if (winner === 'B') { running -= 1; holesWonB++; }
    else if (winner === 'halved') holesHalved++;
    const leader = running === 0 ? null : running > 0 ? aTeam : bTeam;
    const mag = Math.abs(running);
    const runningLabel = closed
      ? ''
      : isStableford
        ? running === 0 ? 'AS' : `${teamShort(leader)} +${mag}`
        : running === 0 ? 'AS' : `${mag} ${teamShort(leader)}`;
    return { hole, par, si, winner, running, leader, runningLabel, closed, closeout: hole === closeoutHole && closeoutHole < N };
  });

  return {
    matchId, format: match.format, category, isNet: !isScramble,
    meta, players, state,
    sideA: { teamId: aTeam, name: teamById[aTeam]?.name },
    sideB: { teamId: bTeam, name: teamById[bTeam]?.name },
    holesWon: { A: holesWonA, B: holesWonB, halved: holesHalved },
    scramble: isScramble
      ? {
          teams: [aTeam, bTeam].map((t) => ({
            teamId: t,
            cells: meta.map(({ hole }) => {
              const r = rows.find((x) => x.hole === hole && x.team === t);
              // Scramble notation is keyed off the TEAM gross vs par.
              return r ? { hole, gross: r.team_gross, result: r.team_gross_result, bucket: vsParBucket(r.team_gross_vs_par) } : { hole, empty: true };
            }),
            total: rows.filter((x) => x.team === t).reduce((s, x) => s + (x.team_gross || 0), 0),
          })),
        }
      : null,
  };
}

// Which completed tournaments actually have hole data (drives "show it or not").
export function tournamentsWithHoleData() {
  return [...new Set(holeScores.map((h) => h.tournament))];
}
export function tournamentHasHoleData(tid) {
  return holeScores.some((h) => h.tournament === tid);
}

// ===========================================================================
// POWER RANKINGS — driven by GHIN handicap check-ins
// (data/handicap_snapshots.json). Transparent, weighted formula. Handles
// missing data gracefully: a player ranks on whatever components they have,
// and the board flags "stale" data. Output is structured so the 2027 Draft
// Guide can consume it directly (see `powerRankings().rows`).
// ===========================================================================

// >>> THE ONE PLACE TO TUNE THE FORMULA <<<  (weights should sum to 1.0)
export const POWER_RANKING_WEIGHTS = {
  recentForm:     0.40,  // recent scoring differentials vs the player's index (sharp = playing under their number)
  indexTrend:     0.30,  // movement of their index over the trend window (dropping = improving)
  activity:       0.20,  // rounds posted recently — reward the grinders
  lastTournament: 0.10,  // points % at their most recent Annual
};
export const POWER_RANKING_TREND_DAYS = 90;  // window for the index-trend component
export const POWER_RANKING_STALE_DAYS = 35;  // a check-in older than this (vs the newest) is "stale"

const DAY_MS = 86400000;
const dparse = (s) => Date.parse(s);
const snapsForPlayer = (pid, asOf) =>
  handicapSnapshots
    .filter((s) => s.player === pid && (!asOf || dparse(s.date) <= dparse(asOf)))
    .sort((a, b) => dparse(a.date) - dparse(b.date));

// Raw (un-normalised) metrics for one player as of a given date.
function powerMetrics(pid, asOf) {
  const snaps = snapsForPlayer(pid, asOf);
  if (!snaps.length) {
    return { hasData: false, snaps: [], index: null, form: null, trend: null,
      activity: null, lastTournamentPct: null, lastCheckIn: null, note: null };
  }
  const latest = snaps[snaps.length - 1];
  const index = latest.index;
  // form: index − recent avg differential (positive ⇒ scoring better than their number)
  const form = latest.avgDifferential != null ? round1(index - latest.avgDifferential) : null;
  // trend: how far the index moved to reach today (positive ⇒ index fell ⇒ improving).
  // Prefer the earliest snapshot inside the 90-day window; but if the only prior
  // check-in predates the window (common on the FIRST real check-in after a long
  // gap — e.g. the St George seed sitting 20 weeks back), fall back to that
  // immediately-previous check-in so the movement still counts.
  const cutoff = dparse(latest.date) - POWER_RANKING_TREND_DAYS * DAY_MS;
  const inWindow = snaps.filter((s) => dparse(s.date) >= cutoff);
  const base = inWindow.length > 1 ? inWindow[0] : (snaps.length > 1 ? snaps[snaps.length - 2] : null);
  const trend = base && base !== latest ? round1(base.index - index) : null;
  // activity: rounds on the latest check-in, else summed across the window
  let activity = latest.rounds != null ? latest.rounds : null;
  if (activity == null && inWindow.some((s) => s.rounds != null)) {
    activity = inWindow.reduce((n, s) => n + (s.rounds || 0), 0);
  }
  // last tournament points %
  const car = careerStats(pid);
  const lastApp = car.appearances[car.appearances.length - 1] || null;
  let lastTournamentPct = null;
  if (lastApp) {
    const { earned, available } = tournamentPointsFor(lastApp.tournament.id, pid);
    lastTournamentPct = available ? round1(pct(earned, available)) : null;
  }
  return { hasData: true, snaps, index, form, trend, activity, lastTournamentPct,
    avgDifferential: latest.avgDifferential ?? null,
    seedIndex: snaps[0].index,                                   // first snapshot = the tournament seed
    prevIndex: snaps.length > 1 ? snaps[snaps.length - 2].index : null,
    lastCheckIn: latest.date, note: latest.note ?? null };
}

// Min–max normalise a set of {id, v} to 0..1 (higher raw ⇒ higher norm). Values
// that are null are left out; if every value is equal, everyone gets 0.5.
function normalise(pairs) {
  const vals = pairs.filter((p) => p.v != null).map((p) => p.v);
  const out = new Map();
  if (!vals.length) return out;
  const min = Math.min(...vals), max = Math.max(...vals);
  for (const p of pairs) {
    if (p.v == null) continue;
    out.set(p.id, max === min ? 0.5 : (p.v - min) / (max - min));
  }
  return out;
}

// Compute a full ranking as of `asOf` (defaults to the newest snapshot date).
// Returns { asOf, rows:[{playerId, score, rank, metrics, weightsUsed}] }.
function rankingAsOf(asOf) {
  const metrics = players.map((p) => ({ playerId: p.id, m: powerMetrics(p.id, asOf) }));
  const W = POWER_RANKING_WEIGHTS;
  const formN     = normalise(metrics.map((x) => ({ id: x.playerId, v: x.m.form })));
  const trendN    = normalise(metrics.map((x) => ({ id: x.playerId, v: x.m.trend })));
  const activityN = normalise(metrics.map((x) => ({ id: x.playerId, v: x.m.activity })));
  const lastN     = normalise(metrics.map((x) => ({ id: x.playerId, v: x.m.lastTournamentPct })));

  const rows = metrics.map(({ playerId, m }) => {
    const comps = [
      { key: 'recentForm', w: W.recentForm, n: formN.get(playerId) },
      { key: 'indexTrend', w: W.indexTrend, n: trendN.get(playerId) },
      { key: 'activity', w: W.activity, n: activityN.get(playerId) },
      { key: 'lastTournament', w: W.lastTournament, n: lastN.get(playerId) },
    ].filter((c) => c.n != null);
    const totalW = comps.reduce((s, c) => s + c.w, 0);
    const score = totalW > 0 ? round1((comps.reduce((s, c) => s + c.w * c.n, 0) / totalW) * 100) : 0;
    return { playerId, score, metrics: m, weightsUsed: comps.map((c) => c.key) };
  });
  // rank: score desc, then lower index (better golfer), then name
  rows.sort((a, b) =>
    b.score - a.score ||
    (a.metrics.index ?? 99) - (b.metrics.index ?? 99) ||
    playerById[a.playerId].name.localeCompare(playerById[b.playerId].name));
  rows.forEach((r, i) => (r.rank = r.metrics.hasData ? i + 1 : null));
  return { asOf, rows };
}

// A one-line, auto-generated read on each player.
function powerVerdict(m, dataAsOf, seededOnly) {
  if (!m.hasData) return 'No GHIN check-in yet';
  const weeks = Math.max(0, Math.round((dparse(dataAsOf) - dparse(m.lastCheckIn)) / (7 * DAY_MS)));
  if (m.lastCheckIn < dataAsOf && weeks * 7 >= POWER_RANKING_STALE_DAYS)
    return `Hasn't posted in ${weeks} week${weeks === 1 ? '' : 's'}`;
  if (m.trend != null && m.trend >= 0.5) return 'Trending sharp — index falling';
  if (m.trend != null && m.trend <= -0.5) return 'Index drifting up';
  if (m.form != null && m.form >= 2) return 'Playing under their number';
  if (m.activity != null && m.activity >= 8) return `Grinding — ${m.activity} rounds posted`;
  if (m.activity === 0) return 'No rounds since last check-in';
  if (seededOnly || (m.form == null && m.trend == null && m.activity == null))
    return 'Seed data — awaiting first GHIN check-in';
  return 'Holding steady';
}

// ---- movement blurbs (the screenshot bit) --------------------------------
// A short punchy headline + a 2–3 sentence, auto-generated read in the site's
// sports-coverage voice, built from a player's own numbers. `b` is the enriched
// per-player object assembled in powerRankings().
const mag = (x) => {
  const v = Math.round(Math.abs(x) * 10) / 10;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
};
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function powerHeadline(b) {
  if (!b.hasData) return 'No data';
  if (b.stale) return 'Gone quiet';
  if (b.seedOnly) return 'Seed data';
  if (b.indexDir === 'falling' && b.sinceSeed >= 0.5) return 'Trending sharp';
  if (b.indexDir === 'rising' && b.sinceSeed <= -0.5) return 'Cooling off';
  if (b.rounds != null && b.rounds >= 8) return 'Grinding';
  if (b.rounds === 0) return 'Not posting';
  if (b.indexDir === 'falling') return 'Edging down';
  if (b.indexDir === 'rising') return 'Slipping';
  return 'Holding steady';
}

function powerBlurb(b) {
  const F = b.first, He = 'He', he = 'he', his = 'his';
  if (!b.hasData) return `${b.name} has no GHIN check-in on record yet.`;

  if (b.stale) {
    const wk = b.weeksSince;
    const tail = b.lastTournamentPct != null
      ? `, with ${his} ${b.lastTournamentPct}% return from the trip doing the ranking work for now`
      : '';
    return `${F} hasn't logged a GHIN check-in since St George — ${wk} week${wk === 1 ? '' : 's'} and counting. ${He}'s parked on ${his} tournament handicap of ${b.seedIndex}${tail}. Fresh scores will move ${him(b)}.`;
  }
  if (b.seedOnly) {
    return `Seeded from St George — ${F} is ranked on ${his} ${b.index} tournament handicap. Log a GHIN check-in and ${his} form comes to life.`;
  }

  const s = [];
  // 1) index trajectory
  const d = b.sinceSeed, lbl = b.sinceLabel;
  if (d != null && d >= 0.05) s.push(`${F} has shaved ${mag(d)} off ${his} index ${lbl}, down from ${b.seedIndex} to ${b.index}.`);
  else if (d != null && d <= -0.05) s.push(`${F}'s index has crept up ${mag(d)} ${lbl}, from ${b.seedIndex} to ${b.index}.`);
  else s.push(`${F}'s index has barely budged ${lbl}, holding at ${b.index}.`);
  // a distinct recent move (only when there are 3+ check-ins and it differs)
  if (b.sinceLast != null && d != null && Math.abs(b.sinceLast - d) > 0.05) {
    if (b.sinceLast >= 0.05) s.push(`${He}'s down another ${mag(b.sinceLast)} just since the last check-in.`);
    else if (b.sinceLast <= -0.05) s.push(`${He}'s ticked up ${mag(b.sinceLast)} since the last check-in, though.`);
  }
  // 2) activity + differential vs baseline
  let act = null;
  if (b.rounds === 0) act = `no rounds posted since the last check-in`;
  else if (b.rounds != null && b.rounds <= 2) act = `just ${b.rounds} round${b.rounds === 1 ? '' : 's'} in the last 90 days keeps the sample thin`;
  else if (b.rounds != null && b.rounds >= 8) act = `${he}'s putting in the work with ${b.rounds} rounds in the last 90 days`;
  else if (b.rounds != null) act = `${b.rounds} rounds on the card over the last 90 days`;
  let diff = null;
  if (b.avgDifferential != null) {
    const gap = b.avgDifferential - b.index;
    if (gap <= 2) diff = `${his} differentials are averaging ${b.avgDifferential}, right around ${his} number`;
    else if (gap <= 4) diff = `${his} differentials are averaging ${b.avgDifferential}, a touch above ${his} ${b.index} baseline`;
    else diff = `${his} differentials are averaging ${b.avgDifferential}, still well north of ${his} ${b.index} baseline`;
  }
  if (act && diff) s.push(cap(`${act}, and ${diff}.`));
  else if (act) s.push(cap(`${act}.`));
  else if (diff) s.push(cap(`${diff}.`));
  return s.join(' ');
}
// tiny helper for object pronoun ("move him")
function him(_b) { return 'him'; }

// THE PUBLIC ENTRY POINT. Returns everything the Power Rankings page (and the
// future Draft Guide) needs.
export function powerRankings() {
  if (!handicapSnapshots.length) {
    return { weights: POWER_RANKING_WEIGHTS, trendDays: POWER_RANKING_TREND_DAYS,
      dataAsOf: null, hasRealData: false, checkInDates: [], rows: [] };
  }
  const dates = [...new Set(handicapSnapshots.map((s) => s.date))].sort();
  const dataAsOf = dates[dates.length - 1];
  const prevDate = dates.length > 1 ? dates[dates.length - 2] : null;
  // "Real" data = anything beyond the single seed check-in (a later date, or any
  // posted rounds / differentials).
  const hasRealData = dates.length > 1 ||
    handicapSnapshots.some((s) => s.rounds != null || s.avgDifferential != null);

  const current = rankingAsOf(dataAsOf);
  const previous = prevDate ? rankingAsOf(prevDate) : null;
  const prevRank = new Map((previous?.rows || []).map((r) => [r.playerId, r.rank]));

  const rows = current.rows.map((r) => {
    const m = r.metrics;
    const car = careerStats(r.playerId);
    const lastApp = car.appearances[car.appearances.length - 1] || null;
    const pr = prevRank.get(r.playerId);
    let movement = 'steady', movementBy = 0;
    if (!previous || !m.hasData) movement = m.hasData ? 'steady' : 'none';
    else if (pr == null && r.rank != null) movement = 'new';
    else if (pr != null && r.rank != null) {
      movementBy = pr - r.rank;
      movement = movementBy > 0 ? 'up' : movementBy < 0 ? 'down' : 'steady';
    }
    const stale = m.hasData ? (m.lastCheckIn < dataAsOf) : true;
    const isRookie = car.played === 0;
    // index deltas (positive ⇒ index fell ⇒ improving)
    const sinceSeed = m.hasData ? round1(m.seedIndex - m.index) : null;
    const sinceLast = m.hasData && m.prevIndex != null ? round1(m.prevIndex - m.index) : null;
    const indexDir = sinceSeed == null || Math.abs(sinceSeed) < 0.05 ? 'flat'
      : sinceSeed > 0 ? 'falling' : 'rising';
    const weeksSince = m.hasData
      ? Math.max(0, Math.round((dparse(dataAsOf) - dparse(m.lastCheckIn)) / (7 * DAY_MS))) : null;
    const seedOnly = !hasRealData && !stale;

    // Enriched object for the headline + blurb writers.
    const b = {
      hasData: m.hasData, stale, seedOnly, isRookie,
      first: playerById[r.playerId].name.split(' ')[0],
      name: playerById[r.playerId].name,
      index: m.index, seedIndex: m.seedIndex,
      sinceSeed, sinceLast, indexDir,
      sinceLabel: isRookie ? `since ${playerById[r.playerId].name.split(' ')[0]}'s first check-in` : 'since St George',
      rounds: m.activity, avgDifferential: m.avgDifferential,
      lastTournamentPct: m.lastTournamentPct, weeksSince,
    };

    return {
      rank: r.rank,
      player: playerById[r.playerId],
      teamId: lastApp ? lastApp.teamId : null,   // most recent team (null for a rookie)
      isRookie,
      ghin: playerById[r.playerId].ghin ?? null,
      score: r.score,
      index: m.index,
      seedIndex: m.seedIndex,
      trend: m.trend,               // index change over window (− = improving)
      sinceSeed, sinceLast,         // deltas for the blurb / annotation
      indexDir,                     // 'falling' (improving) | 'rising' | 'flat'
      sinceLabel: b.sinceLabel,
      form: m.form,                 // index − avg differential (+ = sharp)
      avgDifferential: m.avgDifferential,
      rounds: m.activity,
      lastTournamentPct: m.lastTournamentPct,
      series: m.snaps.map((s) => ({ date: s.date, index: s.index })),
      lastCheckIn: m.lastCheckIn,
      note: m.note,
      movement, movementBy,
      stale,
      weightsUsed: r.weightsUsed,
      hasData: m.hasData,
      verdict: powerVerdict(m, dataAsOf, !hasRealData),   // kept for compatibility
      headline: powerHeadline(b),
      blurb: powerBlurb(b),
    };
  });

  return {
    weights: POWER_RANKING_WEIGHTS,
    trendDays: POWER_RANKING_TREND_DAYS,
    staleDays: POWER_RANKING_STALE_DAYS,
    dataAsOf,
    checkInDates: dates,
    hasRealData,
    rows,
  };
}

// The manual check-in helper: name · GHIN · current index · last check-in.
// (Sorted by name for an easy monthly lookup routine on ghin.com.)
export function handicapCheckInList() {
  const latest = new Map();
  for (const s of handicapSnapshots) {
    const cur = latest.get(s.player);
    if (!cur || s.date > cur.date) latest.set(s.player, s);
  }
  return players
    .map((p) => {
      const s = latest.get(p.id) || null;
      return { player: p, ghin: p.ghin ?? null, index: s ? s.index : null, lastCheckIn: s ? s.date : null };
    })
    .sort((a, b) => a.player.name.localeCompare(b.player.name));
}

// Players confirmed for an upcoming event who have never played an Annual —
// "rookies". Ordered by name. Used by the Players page and profile treatment.
export function rookiesFor(tid) {
  return players
    .filter((p) => (p.confirmedFor || []).includes(tid) && careerStats(p.id).played === 0)
    .sort((a, b) => a.name.localeCompare(b.name));
}
export function allRookies() {
  return players
    .filter((p) => (p.confirmedFor || []).length > 0 && careerStats(p.id).played === 0)
    .sort((a, b) => a.name.localeCompare(b.name));
}
