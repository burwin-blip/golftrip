// ---------------------------------------------------------------------------
// Build step: pull RSVP submissions from the store and write the PUBLIC slice
// to data/rsvp.generated.json (gitignored), which src/lib/data.js merges into
// players / confirmedFor / handicap snapshots / game profiles.
//
// Runs before every `npm run build` / `npm run dev`. A submission to /api/rsvp
// fires the Vercel deploy hook, which re-runs this — that's the auto-sync.
//
// PRIVATE fields (date of birth, captain vote, team name, Q8, Q9) are never
// written here, so they can't reach the static site or the public repo.
//
// Behaviour when things are missing:
//   - No Redis connected on Vercel yet → writes an empty file (site builds as
//     if nobody has RSVP'd), so deploys keep working before setup is finished.
//   - Redis connected but unreachable → FAILS the build, so a blip can never
//     publish a site with everyone's RSVPs missing (the last good deploy stays).
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadAll, isConfigured } from '../src/lib/rsvp-store.js';
import { RSVP_TOURNAMENT_ID as TID } from '../src/lib/rsvp-shared.js';

const OUT = fileURLToPath(new URL('../data/rsvp.generated.json', import.meta.url));

const empty = { tournamentId: TID, generatedAt: null, source: 'none', players: [], statuses: {}, profiles: {}, snapshots: [] };

async function main() {
  if (!isConfigured()) {
    console.warn('[rsvp] No RSVP database connected — building with no RSVP data.');
    return empty;
  }
  const { players, profiles, event, backend } = await loadAll(TID);

  const out = { ...empty, generatedAt: new Date().toISOString(), source: backend };
  out.players = Object.values(players)
    .map((p) => ({ id: p.id, name: p.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const [id, e] of Object.entries(event)) out.statuses[id] = e.status;
  for (const [id, pr] of Object.entries(profiles)) {
    out.profiles[id] = { strength: pr.strength ?? null, weakness: pr.weakness ?? null, sentence: pr.sentence ?? null };
    // One snapshot per day (the last number submitted that day) — the snapshot
    // file is day-grained; the full timestamped history stays in the store.
    const byDay = new Map();
    for (const h of pr.handicapHistory || []) byDay.set(h.at.slice(0, 10), h.index);
    for (const [date, index] of byDay) out.snapshots.push({ player: id, date, index, source: 'rsvp', note: 'Self-reported on the 2027 RSVP' });
  }
  return out;
}

try {
  const out = await main();
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
  const n = Object.keys(out.statuses).length;
  console.log(`[rsvp] ${n} RSVP${n === 1 ? '' : 's'} (${out.players.length} new player${out.players.length === 1 ? '' : 's'}) from ${out.source} → data/rsvp.generated.json`);
} catch (e) {
  console.error('[rsvp] Could not read RSVP data — failing the build so no deploy goes out without it.\n', e);
  process.exit(1);
}
