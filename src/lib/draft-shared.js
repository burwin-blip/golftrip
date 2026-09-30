// ---------------------------------------------------------------------------
// DRAFT ROOM — the pure rules, shared by the API (src/lib/draft-api.js) and the
// three screens (board, captain console, commissioner console). No data
// imports, no Node APIs: every screen derives "what's happening right now" from
// the same server document + the server's clock, with the same code.
//
// Timing is SERVER-SIDE ONLY. The document stores absolute timestamps (ms since
// epoch, set by the server); a screen corrects for its own clock drift using the
// server time sent with every poll. A browser timer never decides anything.
// ---------------------------------------------------------------------------

export const DRAFT_TID = 'duel-in-the-desert-2027';
export const PICK_MS = 120_000;   // 2:00 per pick (a local test run may shorten it; see draft-api.js)
export const REVEAL_MS = 5_000;   // "THE PICK IS IN" + 5-second countdown
export const SLAM_MS = 3_000;     // the card slams onto the roster, then the next clock starts
export const MODES = ['real', 'mock'];

// Team colours for the drafted teams — a preset palette that deliberately leaves
// out 2026's Woodpeckers green (#2E6B43) and Silver Spoons navy (#2E4B70).
export const TEAM_COLOURS = [
  { id: 'canyon', name: 'Canyon Red', hex: '#9C2F24' },
  { id: 'gold', name: 'Desert Gold', hex: '#A77A12' },
  { id: 'teal', name: 'Oasis Teal', hex: '#1E6E74' },
  { id: 'plum', name: 'Twilight Plum', hex: '#5B3A7A' },
  { id: 'sunset', name: 'Sunset Orange', hex: '#C4572A' },
  { id: 'slate', name: 'Slate', hex: '#3D4652' },
];

/** Snake order for `picks` picks, first pick to `first` ('A' | 'B'): A, B, B, A, A, B, … */
export function snakeOrder(picks, first = 'A') {
  const other = first === 'A' ? 'B' : 'A';
  return Array.from({ length: picks }, (_, i) => ((Math.floor((i + 1) / 2) % 2 === 0) ? first : other));
}

/** Picks for an N-player field: everyone but the two captains. */
export const picksFor = (participants) => Math.max(0, participants - 2);

export const emptyDraft = (mode) => ({
  version: 1, tournamentId: DRAFT_TID, mode, rev: 0, status: 'setup',
  participants: [], captains: { A: null, B: null }, firstPick: 'A', order: [],
  picks: [], clock: null, reveal: null, pausedAt: null, pickMs: PICK_MS,
  teams: { A: { name: null, color: null }, B: { name: null, color: null } }, finalisedAt: null, startedAt: null,
});

/** Each side's roster, captain first, then picks in order. */
export function rosters(doc) {
  const out = { A: [], B: [] };
  for (const s of ['A', 'B']) if (doc.captains?.[s]) out[s].push(doc.captains[s]);
  for (const p of doc.picks || []) out[p.side].push(p.playerId);
  return out;
}

/** Players still available: participants not captains and not picked. */
export function available(doc) {
  const taken = new Set([doc.captains?.A, doc.captains?.B, ...(doc.picks || []).map((p) => p.playerId)].filter(Boolean));
  return (doc.participants || []).filter((id) => !taken.has(id));
}

/**
 * What is happening at `now` (server ms):
 *   phase: setup | waiting (next clock not started yet) | clock | overtime |
 *          pick-is-in | slam | paused | complete | finalised
 * plus the side on the clock, ms left (clock) or over (overtime), the reveal
 * being shown and the countdown number.
 */
export function phaseAt(doc, now) {
  const total = doc.order?.length || 0;
  const base = { total, made: doc.picks?.length || 0, pickNo: null, side: null, remainingMs: null, overMs: null, reveal: null, countdown: null };
  if (!doc || doc.status === 'setup') return { ...base, phase: 'setup' };
  if (doc.status === 'finalised') return { ...base, phase: 'finalised' };
  if (doc.status === 'paused') {
    const c = doc.clock;
    const elapsed = c ? Math.max(0, (doc.pausedAt ?? now) - c.startsAt) : 0;
    return { ...base, phase: 'paused', pickNo: c?.pickNo ?? null, side: c ? doc.order[c.pickNo - 1] : null,
      remainingMs: c ? Math.max(0, doc.pickMs - elapsed) : null, overMs: c ? Math.max(0, elapsed - doc.pickMs) : null };
  }
  const r = doc.reveal;
  if (r && now < r.doneAt) {
    return { ...base, reveal: r, phase: now < r.revealAt ? 'pick-is-in' : 'slam',
      countdown: now < r.revealAt ? Math.max(1, Math.ceil((r.revealAt - now) / 1000)) : null };
  }
  if (doc.status === 'complete') return { ...base, phase: 'complete' };
  const c = doc.clock;
  if (!c) return { ...base, phase: 'complete' };
  const side = doc.order[c.pickNo - 1];
  if (now < c.startsAt) return { ...base, phase: 'waiting', pickNo: c.pickNo, side, remainingMs: doc.pickMs };
  const elapsed = now - c.startsAt;
  return elapsed <= doc.pickMs
    ? { ...base, phase: 'clock', pickNo: c.pickNo, side, remainingMs: doc.pickMs - elapsed }
    : { ...base, phase: 'overtime', pickNo: c.pickNo, side, overMs: elapsed - doc.pickMs };
}

/** "1:47" (clock) / "+0:12" (overtime) */
export function clockText(ms, over = false) {
  const t = Math.max(0, Math.floor(ms / 1000));
  return `${over ? '+' : ''}${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}
