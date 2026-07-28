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
  players, tournaments, matches, drafts, awards, moments,
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
