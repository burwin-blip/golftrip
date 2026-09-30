// /api/draft-pick — a captain locks in a pick. Body: { pickNo, playerId }; the
// captain's key in x-captain-key. Final once accepted (only the commissioner can
// undo). A repeat of the same pick (double tap, retry) is a harmless no-op.
import { submitPick, DraftError } from '../../lib/draft-api.js';
import { DraftNotConfigured } from '../../lib/draft-store.js';

export const prerender = false;
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export async function POST({ request }) {
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: 'Bad request.' }, 400); }
  try { return json(await submitPick(request.headers.get('x-captain-key') || '', body)); }
  catch (e) {
    if (e instanceof DraftError) return json({ ok: false, error: e.message }, e.status);
    if (e instanceof DraftNotConfigured) return json({ ok: false, error: e.message }, 503);
    console.error('Draft pick error', e);
    return json({ ok: false, error: 'Couldn’t lock that in. Try again.' }, 500);
  }
}
