// ---------------------------------------------------------------------------
// MATCH CENTRE — build-time data for the 2027 lineup board and Tale of the Tape.
// Lineups are set live (Redis, via /api/lineups), so any pairing can appear at
// any time: this module precomputes everything per PLAYER (and per player pair
// for head-to-head) from the existing stats, and the page assembles a match's
// tape in the browser with the shared rules in matchcentre-shared.js. Nothing
// here is typed in: it all comes from the match archive, the power rankings
// (GHIN check-ins) and the course data.
// ---------------------------------------------------------------------------
import { playerById } from './data.js';
import { draftPoolFor, careerStats, formatRecords, headToHead, powerRankings } from './stats.js';
import { playerAvatar, playerInitials } from './portraits.js';
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
