// /api/rsvp — the RSVP endpoint behind /rsvp. One of only two server routes on
// the site (everything else is prerendered static). Logic: src/lib/rsvp-api.js.
//   GET  /api/rsvp               → live confirmed count + players created since the last build
//   GET  /api/rsvp?player=<id>   → that player's PUBLIC answers, for pre-filling
//   POST /api/rsvp  { ... }      → save (create or update) a response
import { submitRsvp, readRsvp, isAdminKey, RsvpError } from '../../lib/rsvp-api.js';
import { RsvpNotConfigured } from '../../lib/rsvp-store.js';

export const prerender = false;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

// Unexpected errors are logged (Vercel → Logs) and shown to players only as a
// generic message. A request carrying the admin key (x-admin-key) also gets the
// real error text, so production can be diagnosed from outside.
function fail(e, request) {
  if (e instanceof RsvpError) return json({ ok: false, error: e.message, field: e.field }, e.status);
  if (e instanceof RsvpNotConfigured) return json({ ok: false, error: 'RSVPs aren’t open yet — try again soon.' }, 503);
  console.error('RSVP error', e);
  const detail = isAdminKey(request.headers.get('x-admin-key') || '') ? { detail: String(e?.stack || e) } : {};
  return json({ ok: false, error: 'Something went wrong saving that. Please try again.', ...detail }, 500);
}

export async function GET({ url, request }) {
  try { return json(await readRsvp(url.searchParams.get('player'))); } catch (e) { return fail(e, request); }
}

export async function POST({ request }) {
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: 'Bad request.' }, 400); }
  try { return json(await submitRsvp(body)); } catch (e) { return fail(e, request); }
}
