// ---------------------------------------------------------------------------
// MATCH CENTRE — the pure rules, shared by the build (src/lib/matchcentre.js),
// the lineups API (src/pages/api/lineups.js) and the browser (MatchCentre.astro).
// No data imports and no Node APIs, so all three run exactly the same maths and
// the same lineup validation. Everything numeric is computed; nothing is typed in.
//
// Handicap allowances for 2027 (owner's decision, Sept 2026 — see
// data/schedule_2027.json → handicapRules):
//   gross           — scrambles: no strokes (as 2026's Round 1)
//   full-course     — Best Ball + Combined Stableford: 100% course handicap each
//   full-difference — Singles: 100% of the difference; the lower man plays off 0
// Course handicap = round(index × slope / 113 + (rating − par)) — the World
// Handicap System formula, from each round's own course, our tees, rating, slope.
// ---------------------------------------------------------------------------

/** Course handicap for an index on a tee ({ rating, slope, par }). null if unknown. */
export function courseHandicap(index, tee) {
  if (index == null || !tee || tee.rating == null || tee.slope == null || tee.par == null) return null;
  return Math.round(index * (tee.slope / 113) + (tee.rating - tee.par));
}

/**
 * Where `strokes` handicap strokes fall on a card: one on each hole whose stroke
 * index is ≤ strokes, a second where SI ≤ strokes − 18, and so on. Negative
 * strokes (a plus handicap) give strokes BACK on the easiest holes (SI 18 up).
 * Returns [{ hole, si, n }] for the holes that carry a stroke, in hole order.
 */
export function strokeHoles(strokes, holes) {
  if (!strokes || !holes?.length) return [];
  // Strokes go to holes in stroke-index order (hardest first), wrapping round for
  // a second stroke; strokes given back (a plus handicap) start from the easiest.
  // Ranking rather than comparing to 1–18 means a 9-hole round whose card carries
  // the 18-hole stroke indexes (2026's Shamble) allocates correctly too.
  const order = [...holes].sort((a, b) => (strokes > 0 ? a.si - b.si : b.si - a.si));
  const n = new Map();
  for (let k = 0; k < Math.abs(strokes); k++) {
    const h = order[k % order.length];
    n.set(h.hole, (n.get(h.hole) || 0) + (strokes > 0 ? 1 : -1));
  }
  return holes.filter((h) => n.has(h.hole)).map((h) => ({ hole: h.hole, si: h.si, n: n.get(h.hole) }));
}

/** "3, 5, 9 (2), 11" — holes that carry strokes, doubles marked. */
export function strokeHolesText(list) {
  return list.map((s) => `${s.hole}${Math.abs(s.n) > 1 ? ` (${Math.abs(s.n)})` : ''}`).join(', ');
}

/**
 * Stroke allocation for one match. `sides` = { A: [player], B: [player] } where a
 * player carries { id, name, courseHandicap }. Returns
 *   { rule, perPlayer: [{ id, side, courseHandicap, strokes, holes }], summary }
 */
export function allocateStrokes(round, sides) {
  const everyone = [...sides.A.map((p) => ({ ...p, side: 'A' })), ...sides.B.map((p) => ({ ...p, side: 'B' }))];
  const holes = round.course?.tee?.holes ?? [];
  if (round.handicap === 'gross') {
    return { rule: 'gross', perPlayer: everyone.map((p) => ({ ...p, strokes: 0, holes: [] })),
      summary: 'Gross — no handicap strokes in a scramble.' };
  }
  const unknown = everyone.filter((p) => p.courseHandicap == null);
  if (round.handicap === 'full-difference') {
    const [a, b] = [sides.A[0], sides.B[0]];
    if (!a || !b || a.courseHandicap == null || b.courseHandicap == null) {
      return { rule: round.handicap, perPlayer: everyone.map((p) => ({ ...p, strokes: null, holes: [] })),
        summary: 'Strokes appear once both players have a handicap index.' };
    }
    const diff = Math.abs(a.courseHandicap - b.courseHandicap);
    const receiver = a.courseHandicap > b.courseHandicap ? a : b.courseHandicap > a.courseHandicap ? b : null;
    const perPlayer = everyone.map((p) => {
      const strokes = receiver && p.id === receiver.id ? diff : 0;
      return { ...p, strokes, holes: strokeHoles(strokes, holes) };
    });
    const summary = receiver
      ? `${receiver.name} gets ${diff} stroke${diff === 1 ? '' : 's'} (course handicaps ${a.courseHandicap} v ${b.courseHandicap}; the lower man plays off 0).`
      : `Level — both off ${a.courseHandicap}, no strokes.`;
    return { rule: round.handicap, perPlayer, summary };
  }
  // full-course: everyone plays off their full course handicap
  const perPlayer = everyone.map((p) => ({ ...p, strokes: p.courseHandicap,
    holes: p.courseHandicap == null ? [] : strokeHoles(p.courseHandicap, holes) }));
  const tot = (s) => sides[s].reduce((n, p) => n + (p.courseHandicap ?? 0), 0);
  const gap = tot('B') - tot('A');
  const summary = unknown.length
    ? 'Full course handicaps. Some strokes appear once every player has an index.'
    : `Full course handicaps: ${sides.A.map((p) => p.courseHandicap).join(' + ')} v ${sides.B.map((p) => p.courseHandicap).join(' + ')}` +
      (gap ? ` — the ${gap > 0 ? 'second' : 'first'} pair gets ${Math.abs(gap)} more between them.` : ' — dead level.');
  return { rule: 'full-course', perPlayer, summary };
}

/**
 * A simple projected result from the stroke position and form. Proxy, not a
 * prediction: `form` is index − recent average differential (positive = playing
 * better than their number).
 *   gross (scrambles) — the lower-handicap side is expected to go round in fewer
 *                       strokes: the gap in average index, scaled to the holes
 *                       played, plus the form gap
 *   net formats       — 100% allowances level the handicaps, so the edge is form
 * Returns { favoured: 'A' | 'B' | null, margin (strokes), basis, missingForm }.
 */
export function projectMatch(round, sides) {
  const mean = (list, f) => (list.length ? list.reduce((n, p) => n + f(p), 0) / list.length : 0);
  const missingForm = [...sides.A, ...sides.B].filter((p) => p.form == null).map((p) => p.name);
  // Form only counts when BOTH sides have some on file (averaged over whoever
  // does): treating a missing form as 0 would hand an edge to whoever has none.
  const known = (s) => sides[s].filter((p) => p.form != null);
  const formComparable = known('A').length > 0 && known('B').length > 0;
  const formEdge = formComparable ? mean(known('A'), (p) => p.form) - mean(known('B'), (p) => p.form) : 0;
  let edge = formEdge, basis;
  if (round.handicap === 'gross') {
    const idx = (p) => (p.index == null ? 18 : p.index);
    const scale = (round.holes || 18) / 18;
    const paper = (mean(sides.B, idx) - mean(sides.A, idx)) * scale;
    edge = paper + formEdge * scale;
    basis = `gross, so the handicap gap counts: ${Math.abs(paper).toFixed(1)} stroke${Math.abs(paper).toFixed(1) === '1.0' ? '' : 's'} on paper, then form`;
    if (!formComparable) basis = `gross, so the handicap gap counts: ${Math.abs(paper).toFixed(1)} strokes on paper (not enough form on file to weigh)`;
  } else {
    basis = formComparable ? 'full handicaps level the field, so it comes down to form'
      : 'full handicaps level the field, and there isn’t enough recent form on file to split them';
  }
  const margin = Math.round(Math.abs(edge) * 10) / 10;
  return { favoured: margin < 0.5 ? null : edge > 0 ? 'A' : 'B', margin, basis, missingForm };
}

// The 2026 archive labels for each 2027 format, for "career record in this
// format". Combined Stableford is new for 2027; its closest precedent is 2026's
// Team Average Stableford (same pairs, same net points), so that record is used
// and labelled as such.
export const ARCHIVE_FORMATS = {
  scramble: { labels: ['Scramble'], note: null },
  'best-ball': { labels: ['Best Ball Match Play (NET)'], note: null },
  'combined-stableford': { labels: ['Team Average Stableford'], note: 'from 2026’s Team Average Stableford, the closest precedent' },
  singles: { labels: ['Singles Match Play', 'Individual Championship / Singles'], note: null },
};

// ---- lineups ----------------------------------------------------------------
// Stored in Redis as ONE document (lineups:2027 → field "doc"):
//   { version: 1, tournamentId, rev, updatedAt,
//     rosters: { A: [playerId…], B: [playerId…] },     // empty until the draft
//     rounds:  { "1": { "1": { A: [id|null…], B: [id|null…] }, … }, … } }
// Rounds and matches are keyed by NUMBER (as strings); a slot is a player id or
// null (TBD). `rev` goes up by one on every save, and a save must name the rev
// it was based on, so a phone and a laptop can't silently overwrite each other.
// Later phases hang results off the same match keys (see CLAUDE.md, Match Centre).

export const emptyLineups = (tournamentId) => ({ version: 1, tournamentId, rev: 0, updatedAt: null, rosters: { A: [], B: [] }, rounds: {} });

/** The slots for a match, always padded to the round's side size. */
export function slotsFor(doc, round, matchNo) {
  const m = doc?.rounds?.[String(round.number)]?.[String(matchNo)] || {};
  const pad = (arr) => Array.from({ length: round.sideSize }, (_, i) => (Array.isArray(arr) ? arr[i] ?? null : null));
  return { A: pad(m.A), B: pad(m.B) };
}

/**
 * Validate and normalise a lineups document against the schedule. Throws an
 * Error with a readable message; returns a clean copy (only known rounds /
 * matches / sides, padded slots, no stray keys).
 *   validIds — Set of player ids allowed anywhere (the site's players)
 */
export function validateLineups(input, schedule, validIds) {
  if (!input || typeof input !== 'object') throw new Error('Lineups must be an object.');
  const rosters = { A: [], B: [] };
  for (const s of ['A', 'B']) {
    const list = Array.isArray(input.rosters?.[s]) ? input.rosters[s] : [];
    for (const id of list) {
      if (!validIds.has(id)) throw new Error(`Roster ${s}: unknown player "${id}".`);
      if (rosters.A.includes(id) || rosters.B.includes(id)) throw new Error(`"${id}" is on both rosters.`);
      rosters[s].push(id);
    }
  }
  const drafted = rosters.A.length > 0 || rosters.B.length > 0;
  const rounds = {};
  for (const round of schedule.rounds) {
    const src = input.rounds?.[String(round.number)] || {};
    const seen = new Set();
    const out = {};
    for (let n = 1; n <= round.matchCount; n++) {
      const { A, B } = slotsFor({ rounds: { [round.number]: src } }, round, n);
      for (const [side, ids] of [['A', A], ['B', B]]) {
        for (const id of ids) {
          if (id == null) continue;
          if (!validIds.has(id)) throw new Error(`Round ${round.number}, match ${n}: unknown player "${id}".`);
          if (seen.has(id)) throw new Error(`Round ${round.number}: a player can only be in one slot per round.`);
          seen.add(id);
          if (drafted && !rosters[side].includes(id)) throw new Error(`Round ${round.number}, match ${n}: that player isn't on Team ${side}'s roster.`);
        }
      }
      if (A.some(Boolean) || B.some(Boolean)) out[String(n)] = { A, B };
    }
    if (Object.keys(out).length) rounds[String(round.number)] = out;
  }
  return { version: 1, tournamentId: schedule.tournamentId, rev: Number(input.rev) || 0, updatedAt: input.updatedAt ?? null, rosters, rounds };
}
