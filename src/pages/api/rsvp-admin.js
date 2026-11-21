// /api/rsvp-admin — every RSVP answer, including the PRIVATE ones (DOB, captain
// votes, team names, Q8/Q9). Requires the `x-admin-key` header to match the
// RSVP_ADMIN_KEY environment variable (set in Vercel, never in this public repo).
// Read by the unlinked /rsvp/admin page.
import { readAdmin, deleteRsvp, backfillEmails, isAdminKey, RsvpError } from '../../lib/rsvp-api.js';
import { RsvpNotConfigured } from '../../lib/rsvp-store.js';

export const prerender = false;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

function fail(e, request) {
  if (e instanceof RsvpError) return json({ ok: false, error: e.message }, e.status);
  if (e instanceof RsvpNotConfigured) return json({ ok: false, error: e.message }, 503);
  console.error('RSVP admin error', e);
  const detail = isAdminKey(request.headers.get('x-admin-key') || '') ? { detail: String(e?.stack || e) } : {};
  return json({ ok: false, error: 'Server error.', ...detail }, 500);
}

export async function GET({ request }) {
  try { return json(await readAdmin(request.headers.get('x-admin-key') || '')); } catch (e) { return fail(e, request); }
}

// DELETE /api/rsvp-admin?player=<id> — remove one player's RSVP (e.g. a test entry).
export async function DELETE({ request, url }) {
  try { return json(await deleteRsvp(request.headers.get('x-admin-key') || '', url.searchParams.get('player'))); } catch (e) { return fail(e, request); }
}

// POST /api/rsvp-admin { action: 'emails', entries, apply } — backfill emails onto
// existing RSVP records (preview unless apply: true). Admin key required.
export async function POST({ request }) {
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: 'Bad request.' }, 400); }
  try { return json(await backfillEmails(request.headers.get('x-admin-key') || '', body)); } catch (e) { return fail(e, request); }
}
