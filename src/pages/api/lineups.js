// /api/lineups — the 2027 Match Centre's lineups. The third server route, added
// by the owner for the Match Centre (core principle 5 in CLAUDE.md).
//   GET  /api/lineups   → the last saved lineups (public: who's playing whom is
//                          not private). With a valid x-admin-key header the
//                          reply also says { admin: true } so the page unlocks.
//   POST /api/lineups   → save (admin only). Body: { baseRev, rosters, rounds }.
//                          baseRev must equal the stored rev, or it's a 409 with
//                          the current document — two devices can't silently
//                          overwrite each other.
// Admin = the SAME key mechanism as /rsvp/admin: the x-admin-key header checked
// server-side against RSVP_ADMIN_KEY by the RSVP API's own isAdminKey() (reused,
// not modified).
import { isAdminKey } from '../../lib/rsvp-api.js';
import { loadLineups, saveLineups, LineupsNotConfigured } from '../../lib/lineup-store.js';
import { scheduleFor } from '../../lib/schedule.js';
import { players } from '../../lib/data.js';
import { emptyLineups, validateLineups } from '../../lib/matchcentre-shared.js';

export const prerender = false;

const TID = 'duel-in-the-desert-2027';
const YEAR = 2027;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

function fail(e, request) {
  if (e instanceof LineupsNotConfigured) return json({ ok: false, error: e.message }, 503);
  console.error('Lineups error', e);
  const detail = isAdminKey(request.headers.get('x-admin-key') || '') ? { detail: String(e?.stack || e) } : {};
  return json({ ok: false, error: 'Server error.', ...detail }, 500);
}

export async function GET({ request }) {
  try {
    const { doc } = await loadLineups(YEAR);
    return json({ ok: true, lineups: doc ?? emptyLineups(TID), admin: isAdminKey(request.headers.get('x-admin-key') || '') });
  } catch (e) { return fail(e, request); }
}

export async function POST({ request }) {
  if (!isAdminKey(request.headers.get('x-admin-key') || '')) return json({ ok: false, error: 'Wrong or missing admin key.' }, 401);
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: 'Bad request.' }, 400); }
  try {
    const schedule = scheduleFor(TID);
    let clean;
    try { clean = validateLineups(body, schedule, new Set(players.map((p) => p.id))); }
    catch (e) { return json({ ok: false, error: e.message }, 400); }
    const { doc: current } = await loadLineups(YEAR);
    const rev = current?.rev ?? 0;
    if (Number(body.baseRev ?? -1) !== rev) {
      return json({ ok: false, error: 'Someone saved lineups since you loaded them. Reload to see the latest, then make your change again.', conflict: true, lineups: current ?? emptyLineups(TID) }, 409);
    }
    const doc = { ...clean, rev: rev + 1, updatedAt: new Date().toISOString() };
    await saveLineups(YEAR, doc);
    return json({ ok: true, lineups: doc });
  } catch (e) { return fail(e, request); }
}
