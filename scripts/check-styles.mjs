// ---------------------------------------------------------------------------
// Does the site actually render STYLED? Checks a deployed (or locally served)
// site from the outside, the way a browser sees it:
//   - every key page links at least one stylesheet
//   - every linked stylesheet returns 200 with a text/css content type
//   - the design system (global.css) is really in there: the :root tokens and
//     the masthead rules — a stylesheet can load fine and still be the wrong one
//
//   node scripts/check-styles.mjs https://golftrip-kappa.vercel.app
//   node scripts/check-styles.mjs http://localhost:4321
//
// Required after ANY build-config change (see CLAUDE.md). Exits 1 on failure.
// ---------------------------------------------------------------------------
const BASE = (process.argv[2] || 'https://golftrip-kappa.vercel.app').replace(/\/$/, '');
const PAGES = ['/', '/players', '/players/ben-urwin', '/tournaments/st-george-2026',
  '/tournaments/duel-in-the-desert-2027', '/power-rankings', '/matches', '/records', '/rsvp'];
const MUST_CONTAIN = [':root{--cream', '.masthead{'];

let failures = 0;
const fail = (m) => { failures++; console.log('  ✗ ' + m); };
const cssCache = new Map();

for (const page of PAGES) {
  const res = await fetch(BASE + page, { redirect: 'manual' });
  if (res.status !== 200) { fail(`${page} → HTTP ${res.status}${res.headers.get('location') ? ' (redirects to ' + res.headers.get('location').slice(0, 60) + '… — a protected deployment URL? use the production domain)' : ''}`); continue; }
  const html = await res.text();
  const links = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]*href="([^"]+)"/g)].map((m) => m[1]);
  if (!links.length) { fail(`${page} links no stylesheet at all`); continue; }
  let css = '';
  for (const href of links) {
    if (!cssCache.has(href)) {
      const r = await fetch(new URL(href, BASE + page), { redirect: 'manual' });
      cssCache.set(href, { status: r.status, type: r.headers.get('content-type') || '', body: r.status === 200 ? await r.text() : '' });
    }
    const c = cssCache.get(href);
    if (c.status !== 200) fail(`${page}: ${href} → HTTP ${c.status}`);
    else if (!c.type.includes('text/css')) fail(`${page}: ${href} served as "${c.type}", not text/css`);
    css += c.body;
  }
  const missing = MUST_CONTAIN.filter((s) => !css.includes(s));
  if (missing.length) fail(`${page}: stylesheets load but lack the design system (${missing.join(', ')})`);
  else console.log(`  ✓ ${page} — ${links.length} stylesheet${links.length === 1 ? '' : 's'}, design system present`);
}
console.log(failures ? `\n${failures} problem(s) — the site will render unstyled for someone.\n` : `\nAll pages render styled at ${BASE}\n`);
process.exit(failures ? 1 : 0);
