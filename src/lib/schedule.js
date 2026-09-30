// ---------------------------------------------------------------------------
// 2027 MATCH SCHEDULE — data/schedule_2027.json joined to the course data in
// data/trip-2027.json (our tees, rating, slope, par, hole-by-hole par / stroke
// index). Validated at build time: a bad edit fails the build with a message
// naming the field, the same way the trip planner and GHIN check-ins do.
// Totals (matches, points, "to win") are computed here — never typed.
// ---------------------------------------------------------------------------
import raw from '../../data/schedule_2027.json';
import { tripFor } from './data.js';

const FORMAT_KEYS = new Set(['scramble', 'best-ball', 'combined-stableford', 'singles']);
const HANDICAP_RULES = new Set(['gross', 'full-course', 'full-difference']);

function build(s) {
  const bad = (msg) => { throw new Error(`data/schedule_2027.json: ${msg}`); };
  const trip = tripFor(s.tournamentId);
  if (!trip) bad(`no trip planner for "${s.tournamentId}".`);
  const courseBySlug = Object.fromEntries((trip.courses || []).filter((c) => c.slug).map((c) => [c.slug, c]));
  const rounds = (s.rounds || []).map((r, i) => {
    const at = `rounds[${i}] (Round ${r.number ?? '?'})`;
    if (r.number !== i + 1) bad(`${at}: rounds must be numbered 1, 2, 3… in order.`);
    if (!FORMAT_KEYS.has(r.formatKey)) bad(`${at}: "formatKey" must be one of ${[...FORMAT_KEYS].join(', ')}.`);
    if (!HANDICAP_RULES.has(r.handicap)) bad(`${at}: "handicap" must be one of ${[...HANDICAP_RULES].join(', ')}.`);
    for (const k of ['sideSize', 'holes', 'matchCount', 'pointsPerMatch']) if (!(Number(r[k]) > 0)) bad(`${at}: "${k}" must be a positive number.`);
    const course = courseBySlug[r.courseSlug];
    if (!course) bad(`${at}: courseSlug "${r.courseSlug}" is not a course in data/trip-2027.json.`);
    if (course.date && course.date !== r.date) bad(`${at}: date ${r.date} disagrees with the rota's ${course.date} for ${course.name}.`);
    const tee = course.tee || {};
    if (r.handicap !== 'gross' && !(tee.holes?.length === 18)) bad(`${at}: ${course.name} needs its 18 holes (par + stroke index) on "tee.holes" for handicap strokes.`);
    if (r.championshipMatch != null && !(r.championshipMatch >= 1 && r.championshipMatch <= r.matchCount)) bad(`${at}: "championshipMatch" must be a match number in this round.`);
    const matches = Array.from({ length: r.matchCount }, (_, k) => ({
      number: k + 1,
      id: `${r.id}-m${k + 1}`,
      championship: r.championshipMatch === k + 1,
    }));
    return {
      ...r,
      course: {
        slug: course.slug, name: course.name, location: course.location ?? null,
        tee: { name: tee.name, yardage: tee.yardage ?? null, rating: tee.rating ?? null, slope: tee.slope ?? null,
          par: tee.par ?? course.par ?? null, holes: tee.holes ?? [] },
      },
      points: r.matchCount * r.pointsPerMatch,
      players: r.matchCount * r.sideSize * 2,
      matches,
    };
  });
  const sizes = new Set(rounds.map((r) => r.players));
  if (sizes.size > 1) bad(`every round should field the same number of players (got ${[...sizes].join(' / ')}).`);
  const pointsAvailable = rounds.reduce((n, r) => n + r.points, 0);
  return {
    tournamentId: s.tournamentId,
    teams: { A: { ...s.teams?.A }, B: { ...s.teams?.B } },
    handicapRules: s.handicapRules || {},
    rounds,
    fieldSize: rounds[0]?.players ?? 0,
    matchCount: rounds.reduce((n, r) => n + r.matchCount, 0),
    pointsAvailable,
    toWin: pointsAvailable / 2 + 0.5,
  };
}

const SCHEDULE_2027 = build(raw);

/** The schedule for a tournament id, or null (only 2027 has one so far). */
export const scheduleFor = (tid) => (tid === SCHEDULE_2027.tournamentId ? SCHEDULE_2027 : null);
