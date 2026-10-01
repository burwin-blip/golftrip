// ---------------------------------------------------------------------------
// Build step: the finalised 2027 draft → data/draft.generated.json (gitignored),
// which src/lib/data.js merges so the 2027 page shows the real teams and the
// Match Centre's Team A / B become the drafted teams. Separate from
// pull-rsvp.mjs on purpose: the RSVP pipeline is untouched.
//
// Reads ONLY the REAL draft (draft:2027:real) and only once it's finalised; a
// mock draft never reaches the site. Same failure rule as the RSVPs: no Redis on
// Vercel yet → empty file; Redis connected but unreachable → FAIL the build, so
// a blip can't publish the site with the teams missing.
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadDraft, draftStoreConfigured } from '../src/lib/draft-store.js';
import { DRAFT_TID, TEAM_COLOURS } from '../src/lib/draft-shared.js';

const OUT = fileURLToPath(new URL('../data/draft.generated.json', import.meta.url));
const empty = { tournamentId: DRAFT_TID, finalisedAt: null, teams: null };

async function main() {
  if (!draftStoreConfigured()) { console.warn('[draft] No draft database connected — building with no draft result.'); return empty; }
  const doc = await loadDraft('real');
  if (!doc || doc.status !== 'finalised' || !doc.teams?.A?.id) return empty;
  const hex = new Map(TEAM_COLOURS.map((c) => [c.id, c.hex]));
  const team = (s) => {
    const t = doc.teams[s];
    return { side: s, id: t.id, name: t.name, color: hex.get(t.colorId) || t.color, colorId: t.colorId, captainId: t.captainId, playerIds: t.playerIds };
  };
  const pickNo = Object.fromEntries(doc.picks.map((p) => [p.playerId, p.n]));
  // The pick-by-pick record for the permanent Draft Night recap (index and power
  // ranking as stamped at each pick; no keys, nothing private).
  const draft = {
    tournamentId: doc.tournamentId, mode: 'real', captains: doc.captains, firstPick: doc.firstPick, order: doc.order, pickMs: doc.pickMs,
    finalisedAt: doc.finalisedAt, teams: { A: team('A'), B: team('B') },
    picks: doc.picks.map(({ n, side, playerId, clockMs, rank, index }) => ({ n, side, playerId, clockMs, rank: rank ?? null, index: index ?? null })),
  };
  return { tournamentId: doc.tournamentId, finalisedAt: new Date(doc.finalisedAt).toISOString(), teams: { A: team('A'), B: team('B') }, pickNo, draft };
}

try {
  const out = await main();
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
  console.log(out.teams ? `[draft] Finalised: ${out.teams.A.name} v ${out.teams.B.name} → data/draft.generated.json` : '[draft] No finalised draft yet → data/draft.generated.json');
} catch (e) {
  console.error('[draft] Could not read the draft — failing the build so no deploy goes out without it.\n', e);
  process.exit(1);
}
