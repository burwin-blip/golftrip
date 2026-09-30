// ---------------------------------------------------------------------------
// MATCH CENTRE — build-time data for the 2027 lineup board and Tale of the Tape.
// Lineups are set live (Redis, via /api/lineups), so any pairing can appear at
// any time: this module precomputes everything per PLAYER (and per player pair
// for head-to-head) from the existing stats, and the page assembles a match's
// tape in the browser with the shared rules in matchcentre-shared.js. Nothing
// here is typed in: it all comes from the match archive, the power rankings
// (GHIN check-ins) and the course data.
// ---------------------------------------------------------------------------
import { playerById, tournamentById, teamById, matches, holeScores } from './data.js';
import { draftPoolFor, careerStats, formatRecords, headToHead, powerRankings } from './stats.js';
import { playerAvatar, playerInitials, playerPortrait } from './portraits.js';
import { scheduleFor } from './schedule.js';
import { courseHandicap, ARCHIVE_FORMATS } from './matchcentre-shared.js';

const r1 = (n) => (n == null ? null : Math.round(n * 10) / 10);

/**
 * Everything the Match Centre tab needs, as plain JSON: the schedule, the
 * player pool (confirmed first), each player's tape data, and head-to-head
 * records between every pair of pool players who have met.
 */
export function matchCentreData(tid) {
  const schedule = scheduleFor(tid);
  if (!schedule) return null;
  const pool = draftPoolFor(tid);
  const pr = powerRankings();
  const prBy = Object.fromEntries(pr.rows.map((r) => [r.player.id, r]));

  const players = pool.map((p) => {
    const id = p.player.id;
    const car = careerStats(id);
    const row = prBy[id] || null;
    const rookie = car.played === 0;
    const recs = rookie ? [] : formatRecords(id);
    const byFormat = {};
    for (const [key, { labels, note }] of Object.entries(ARCHIVE_FORMATS)) {
      const hit = recs.filter((f) => labels.includes(f.format));
      const sum = hit.reduce((a, f) => ({ played: a.played + f.played, w: a.w + f.w, h: a.h + f.h, l: a.l + f.l,
        earned: a.earned + f.earned, available: a.available + f.available }), { played: 0, w: 0, h: 0, l: 0, earned: 0, available: 0 });
      byFormat[key] = { ...sum, earned: r1(sum.earned), note };
    }
    const index = row?.index ?? p.handicap ?? null;
    const av = playerAvatar(id);
    return {
      id,
      name: p.player.name,
      first: p.player.name.split(' ')[0],
      initials: playerInitials(p.player.name),
      avatar: av?.src ?? null,
      avatarSquare: av?.square ?? false,
      portrait: playerPortrait(id),             // the 4:5 card photo (the fight-poster cards)
      group: p.group,                          // confirmed | maybe | waiting
      rookie,
      career: rookie ? null : { played: car.played, w: car.w, h: car.h, l: car.l },
      lastTeamId: p.teamId ?? null,            // 2026 side, a hint only — 2027 teams are drafted
      index,
      rank: row?.rank ?? null,
      ranked: row?.hasData ?? false,
      indexDir: row?.indexDir ?? null,          // falling (improving) | rising | flat
      sinceLast: row?.sinceLast ?? null,        // + = index down since the last check-in
      form: row?.form ?? null,                  // index − recent avg differential (+ = sharp)
      headline: row?.headline ?? null,
      byFormat,
      courseHandicap: Object.fromEntries(schedule.rounds.map((r) => [r.number, courseHandicap(index, r.course.tee)])),
    };
  });

  // Head-to-head between every pair of pool players who have met (either order
  // is looked up by the page; stored once, keyed "a|b" with a < b).
  const h2h = {};
  const ids = players.map((p) => p.id).sort();
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const h = headToHead(ids[i], ids[j]);
      if (h.played) h2h[`${ids[i]}|${ids[j]}`] = { played: h.played, aWins: h.aWins, bWins: h.bWins, halved: h.halved };
    }
  }

  return {
    mode: 'live',                              // lineups come from /api/lineups
    tournamentId: tid,
    schedule: {
      teams: schedule.teams,
      handicapRules: schedule.handicapRules,
      pointsAvailable: schedule.pointsAvailable,
      toWin: schedule.toWin,
      fieldSize: schedule.fieldSize,
      rounds: schedule.rounds,
    },
    players,
    h2h,
    rankedAsOf: pr.checkInAsOf ?? null,
    // every player's name, so a saved lineup can still show someone who has since
    // left the pool (e.g. changed their RSVP to no)
    names: Object.fromEntries(Object.values(playerById).map((p) => [p.id, p.name])),
  };
}

// ---------------------------------------------------------------------------
// ARCHIVE — a completed edition's Match Centre (St George 2026), a READ-ONLY view
// over the existing data: tournaments.json rounds + teams, matches.json pairings
// and results, and the playing handicaps / stroke indexes transcribed from the
// scorecards (hole_scores.json). Nothing is written. Same document shapes as the
// live board, so the same component renders it.
//
// The Tale of the Tape only uses what was known BEFORE the trip: the handicap
// index each player took to St George (the roster) and the playing handicaps set
// on the tee (they come off the cards, but they were fixed before a ball was
// struck). No form lines, no records, no head-to-heads — it was the first Annual,
// so there was no history to show, and nothing from 2026's own results leaks in.
// ---------------------------------------------------------------------------
const HANDICAP_2026 = (fmt) => /scramble/i.test(fmt) ? 'gross' : /singles|championship/i.test(fmt) ? 'full-difference' : 'full-course';
const FORMAT_KEY = (fmt) => /scramble/i.test(fmt) ? 'scramble' : /best ball/i.test(fmt) ? 'best-ball'
  : /stableford/i.test(fmt) ? 'combined-stableford' : /singles|championship/i.test(fmt) ? 'singles' : 'other';

export function archiveMatchCentreData(tid) {
  const t = tournamentById[tid];
  if (!t || t.status !== 'completed') return null;
  const ms = matches.filter((m) => m.tournamentId === tid);
  if (!ms.length) return null;
  const holesFor = (mid) => holeScores.filter((h) => h.match_id === mid);
  // Every 2026 match has the Woodpeckers on side A (checked below), so the board
  // reads Woodpeckers left, Silver Spoons right throughout.
  const aId = ms[0].teamAId, bId = ms[0].teamBId;
  if (ms.some((m) => m.teamAId !== aId || m.teamBId !== bId)) throw new Error(`matchcentre: ${tid} mixes team sides across matches.`);
  const team = (id) => ({ teamId: id, label: teamById[id]?.name ?? id, color: teamById[id]?.color ?? null, logo: `/logos/${id}.png` });
  const courseById = Object.fromEntries((t.courses || []).map((c) => [c.id, c]));

  const rounds = [...t.rounds].sort((a, b) => a.number - b.number).map((r) => {
    const rm = ms.filter((m) => m.roundId === r.id).sort((a, b) => a.number - b.number);
    const first = rm[0];
    const c = courseById[r.courseId] || {};
    // The card's holes (par + stroke index) for this round's course, off any match.
    const holes = [...new Map(holesFor(first.id).map((h) => [h.hole, { hole: h.hole, par: h.par, si: h.stroke_index }])).values()].sort((a, b) => a.hole - b.hole);
    return {
      id: r.id, number: r.number, date: r.date, session: null,
      format: r.format, formatKey: FORMAT_KEY(r.format), handicap: HANDICAP_2026(r.format),
      sideSize: first.players.filter((p) => p.side === 'A').length,
      holes: r.holes, matchCount: rm.length, pointsPerMatch: r.pointsPerMatch,
      points: rm.reduce((n, m) => n + m.pointsAvailable, 0),
      course: { slug: null, name: c.nine ? `${c.name} — ${c.nine}` : (c.name || r.courseId), tee: { name: null, rating: null, slope: null, par: null, holes } },
      matches: rm.map((m, i) => ({ number: i + 1, id: m.id, championship: /championship/i.test(m.format) })),
    };
  });

  // lineups (the pairings) + results, keyed exactly like the live board
  const lineups = { version: 1, tournamentId: tid, rev: 0, updatedAt: null, rosters: { A: [], B: [] }, rounds: {} };
  const results = {};
  for (const r of rounds) {
    for (const mt of r.matches) {
      const m = ms.find((x) => x.id === mt.id);
      const side = (s) => m.players.filter((p) => p.side === s).map((p) => p.playerId);
      (lineups.rounds[String(r.number)] ||= {})[String(mt.number)] = { A: side('A'), B: side('B') };
      const winnerSide = m.halved ? null : m.winnerTeamId === aId ? 'A' : 'B';
      const pts = (s) => (m.halved ? m.pointsAvailable / 2 : winnerSide === s ? m.pointsAvailable : 0);
      results[`${r.number}-${mt.number}`] = { matchId: m.id, halved: m.halved, winnerSide, margin: m.halved ? 'AS' : m.margin,
        points: { A: pts('A'), B: pts('B') }, pointsAvailable: m.pointsAvailable, format: m.format, jumpRound: r.number };
    }
  }

  // players: the roster, with only what was known before the trip
  const hcpAt = Object.fromEntries((t.roster || []).map((x) => [x.playerId, x.handicapIndex]));
  const playing = {};   // round number → player → playing handicap off the card
  for (const h of holeScores.filter((x) => x.tournament === tid && x.player && x.playing_handicap != null)) {
    (playing[h.round] ||= {})[h.player] ??= h.playing_handicap;
  }
  const ids = [...new Set(ms.flatMap((m) => m.players.map((p) => p.playerId)))];
  const players = ids.map((id) => {
    const p = playerById[id];
    const av = playerAvatar(id);
    const byFormat = Object.fromEntries(Object.keys(ARCHIVE_FORMATS).map((k) => [k, { played: 0, w: 0, h: 0, l: 0, earned: 0, available: 0, note: null }]));
    return {
      id, name: p.name, first: p.name.split(' ')[0], initials: playerInitials(p.name),
      avatar: av?.src ?? null, avatarSquare: av?.square ?? false, portrait: playerPortrait(id),
      group: 'confirmed', rookie: true, firstAnnual: true, career: null, lastTeamId: null,
      index: hcpAt[id] ?? null, rank: null, ranked: false, indexDir: null, sinceLast: null, form: null, headline: null,
      byFormat,
      courseHandicap: Object.fromEntries(rounds.map((r) => [r.number, playing[r.number]?.[id] ?? null])),
    };
  });

  return {
    mode: 'archive',
    tournamentId: tid,
    schedule: {
      teams: { A: team(aId), B: team(bId) },
      handicapRules: {
        gross: 'No strokes: team gross score.',
        'full-course': 'Each player off the playing handicap on the card.',
        'full-difference': 'The difference in playing handicaps: the lower man plays off 0.',
      },
      pointsAvailable: rounds.reduce((n, r) => n + r.points, 0),
      toWin: rounds.reduce((n, r) => n + r.points, 0) / 2 + 0.5,
      fieldSize: ids.length,
      rounds,
    },
    players,
    h2h: {},
    lineups,
    results,
    rankedAsOf: null,
    names: Object.fromEntries(Object.values(playerById).map((p) => [p.id, p.name])),
  };
}
