// Post-build: pin the RSVP API's Vercel function runtime to Node 22.
//
// @astrojs/vercel v7 (the last version for Astro 4) only knows Node 18 and 20,
// and on anything newer it falls back to "nodejs18.x" — a runtime Vercel has
// retired, which would make the deploy fail. package.json pins the build to
// Node 22 ("engines"), and this rewrites every function's config to match.
// Remove this script when the site moves to Astro 5 + a current adapter.
import fs from 'node:fs';
import path from 'node:path';

const RUNTIME = 'nodejs22.x';
const dir = path.join(process.cwd(), '.vercel', 'output', 'functions');
if (!fs.existsSync(dir)) process.exit(0);
for (const fn of fs.readdirSync(dir)) {
  const file = path.join(dir, fn, '.vc-config.json');
  if (!fs.existsSync(file)) continue;
  const cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (cfg.runtime !== RUNTIME) {
    cfg.runtime = RUNTIME;
    fs.writeFileSync(file, JSON.stringify(cfg, null, 2));
    console.log(`[runtime] ${fn} → ${RUNTIME}`);
  }
}
