// ---------------------------------------------------------------------------
// DRAFT ROOM — build-time player data for the three draft screens. The live
// state (who's picked, the clock) comes from /api/draft; this is the scouting
// card behind every player: photo, power ranking, index, 2026 points %, career
// and per-format records, rookie flag, and where they sit in the Draft Pool (so
// the commissioner's player list defaults to the RSVP YESes). All computed from
// the existing stats — nothing typed in.
// ---------------------------------------------------------------------------
import { players } from './data.js';
import { draftPoolFor, careerStats, formatRecords, powerRankings } from './stats.js';
import { playerAvatar, playerInitials, playerPortrait } from './portraits.js';
import { ARCHIVE_FORMATS } from './matchcentre-shared.js';
import { DRAFT_TID, TEAM_COLOURS } from './draft-shared.js';

const FORMAT_LABELS = { scramble: 'Scramble', 'best-ball': 'Best Ball', 'combined-stableford': 'Stableford', singles: 'Singles' };

export function draftRoomData(tid = DRAFT_TID) {
  const poolBy = Object.fromEntries(draftPoolFor(tid).map((p) => [p.player.id, p]));
  const pr = powerRankings();
  const prBy = Object.fromEntries(pr.rows.map((r) => [r.player.id, r]));
  const list = players.map((p) => {
    const c = careerStats(p.id);
    const row = prBy[p.id];
    const rookie = c.played === 0;
    const recs = rookie ? [] : formatRecords(p.id);
    const formats = Object.entries(ARCHIVE_FORMATS).map(([key, { labels }]) => {
      const hit = recs.filter((f) => labels.includes(f.format));
      const x = hit.reduce((a, f) => ({ played: a.played + f.played, w: a.w + f.w, h: a.h + f.h, l: a.l + f.l }), { played: 0, w: 0, h: 0, l: 0 });
      return { key, label: FORMAT_LABELS[key], ...x };
    }).filter((f) => f.played);
    const av = playerAvatar(p.id);
    const pool = poolBy[p.id];
    return {
      id: p.id, name: p.name, first: p.name.split(' ')[0], last: p.name.split(' ').slice(1).join(' ') || p.name,
      initials: playerInitials(p.name), portrait: playerPortrait(p.id), avatar: av?.src ?? null, avatarSquare: av?.square ?? false,
      group: pool?.group ?? null,                      // confirmed | maybe | waiting | null (not in the pool)
      rookie,
      index: row?.index ?? pool?.handicap ?? null,
      rank: row?.hasData ? row.rank : null,
      headline: row?.headline ?? null,
      pointsPct: rookie ? null : c.pointPct,           // career points % (all of it is 2026 so far)
      record: rookie ? null : { w: c.w, h: c.h, l: c.l, played: c.played },
      formats,
    };
  });
  const order = { confirmed: 0, maybe: 1, waiting: 2 };
  list.sort((a, b) => (order[a.group] ?? 3) - (order[b.group] ?? 3) || (a.rank ?? 99) - (b.rank ?? 99) || a.name.localeCompare(b.name));
  return { tournamentId: tid, players: list, colours: TEAM_COLOURS, rankedAsOf: pr.checkInAsOf ?? null };
}
