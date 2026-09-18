// /api/rsvp-admin — every RSVP answer, including the PRIVATE ones (DOB, captain
// votes, team names, Q8/Q9). Requires the `x-admin-key` header to match the
// RSVP_ADMIN_KEY environment variable (set in Vercel, never in this public repo).
// Read by the unlinked /rsvp/admin page.
import { readAdmin, RsvpError } from '../../lib/rsvp-api.js';
import { RsvpNotConfigured } from '../../lib/rsvp-store.js';

export const prerender = false;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export async function GET({ request }) {
  try {
    return json(await readAdmin(request.headers.get('x-admin-key') || ''));
  } catch (e) {
    if (e instanceof RsvpError) return json({ ok: false, error: e.message }, e.status);
    if (e instanceof RsvpNotConfigured) return json({ ok: false, error: e.message }, 503);
    console.error('RSVP admin error', e);
    return json({ ok: false, error: 'Server error.' }, 500);
  }
}
