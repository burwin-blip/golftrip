// ---------------------------------------------------------------------------
// PLAYER PORTRAITS — the filename is the wiring.
//
// Drop a photo at `public/players/<player-id>.jpg` and that player's initials
// placeholder is replaced by the photo on the next build. Nothing to register,
// no JSON to edit: this module reads the folder at build time and every card,
// wall tile and profile header picks the change up automatically.
//
//   public/players/ben-urwin.jpg      -> Ben Urwin's portrait
//   public/players/colton-mckivitz.jpg -> Colton McKivitz's portrait
//
// The id is the `id`/`slug` from data/players.json. `.jpg` is the house format;
// `.jpeg`, `.png`, `.webp` and `.avif` also work (first match in that order).
// Shoot/crop portrait — the frame everywhere is 4:5 — and keep them web-weight
// (~800×1000, quality 82). `scripts/gen_portraits.py` does exactly that for the
// two portraits cut from the 2026 album.
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { players } from './data.js';

// Resolved off this module's own URL so it holds wherever the build is run from.
const PORTRAIT_DIR = fileURLToPath(new URL('../../public/players/', import.meta.url));

// Preference order — the first extension present wins, so a hand-dropped .jpg
// quietly takes over from anything else without needing the old file removed.
const EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.avif'];

function scan() {
  let files;
  try {
    files = fs.readdirSync(PORTRAIT_DIR);
  } catch {
    return {}; // no folder yet — everyone gets a placeholder
  }
  const present = new Set(files);
  const map = {};
  for (const p of players) {
    const hit = EXTS.map((e) => p.id + e).find((f) => present.has(f));
    if (hit) map[p.id] = `/players/${hit}`;
  }
  return map;
}

const PORTRAITS = scan();

/** Portrait URL for a player, or null when we're still waiting on a photo. */
export const playerPortrait = (playerId) => PORTRAITS[playerId] ?? null;

/** Player ids with no portrait on file — the "still needs a photo" list. */
export const playersMissingPortraits = () => players.filter((p) => !PORTRAITS[p.id]);

/** Up to two initials: "Colton McKivitz" -> "CM". */
export function playerInitials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

// The placeholder is a miniature of the event's own sunset banner, so the
// photo-less tiles read as a matched set rather than as missing images. This
// shifts each player's sun a little (deterministically, off their id) so the
// wall is a series and not fourteen identical stamps.
export function portraitSun(playerId) {
  let h = 0;
  for (const ch of String(playerId)) h = (h * 31 + ch.charCodeAt(0)) % 100000;
  return {
    x: 26 + (h % 49),            // 26–74 % across
    y: 30 + ((h >> 3) % 13),     // 30–42 % down
    dune: (h >> 5) % 3,          // which of the three dune silhouettes
  };
}

// A quiet build-time nudge — the same list the owner needs when they go looking
// for photos. Not an error: a placeholder is a perfectly valid state.
const missing = playersMissingPortraits();
if (missing.length) {
  console.info(
    `[portraits] ${missing.length} player${missing.length === 1 ? '' : 's'} still on the initials placeholder — ` +
    `drop a photo at public/players/<id>.jpg to fill in: ${missing.map((p) => p.id).join(', ')}`
  );
}
