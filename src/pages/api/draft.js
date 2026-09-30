// /api/draft — the live draft, for the Big Board and both consoles (polled every
// 1–1.5s). Public: the draft is shown on the TV anyway. Never returns captain keys.
// With a captain's key in x-captain-key it also says which side that captain is.
import { readDraft, captainState, DraftError } from '../../lib/draft-api.js';
import { DraftNotConfigured } from '../../lib/draft-store.js';

export const prerender = false;
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export async function GET({ request }) {
  try {
    const ck = request.headers.get('x-captain-key');
    return json(ck ? await captainState(ck) : await readDraft());
  } catch (e) {
    if (e instanceof DraftError) return json({ ok: false, error: e.message }, e.status);
    if (e instanceof DraftNotConfigured) return json({ ok: false, error: e.message }, 503);
    console.error('Draft GET error', e);
    return json({ ok: false, error: 'Server error.' }, 500);
  }
}
