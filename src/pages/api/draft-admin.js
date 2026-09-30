// /api/draft-admin — the commissioner console. Your RSVP admin key in
// x-admin-key (checked by the RSVP API's own isAdminKey — the same mechanism as
// /rsvp/admin and the lineups). GET: state + captain keys. POST { action, … }:
// setup · keys · mode · start · pause · resume · undo · reset · finalise.
import { readAdmin, adminAction, DraftError } from '../../lib/draft-api.js';
import { isAdminKey } from '../../lib/rsvp-api.js';
import { DraftNotConfigured } from '../../lib/draft-store.js';

export const prerender = false;
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
function fail(e, request) {
  if (e instanceof DraftError) return json({ ok: false, error: e.message }, e.status);
  if (e instanceof DraftNotConfigured) return json({ ok: false, error: e.message }, 503);
  console.error('Draft admin error', e);
  const detail = isAdminKey(request.headers.get('x-admin-key') || '') ? { detail: String(e?.stack || e) } : {};
  return json({ ok: false, error: 'Server error.', ...detail }, 500);
}

export async function GET({ request }) {
  try { return json(await readAdmin(request.headers.get('x-admin-key') || '')); } catch (e) { return fail(e, request); }
}
export async function POST({ request }) {
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: 'Bad request.' }, 400); }
  try { return json(await adminAction(request.headers.get('x-admin-key') || '', body)); } catch (e) { return fail(e, request); }
}
