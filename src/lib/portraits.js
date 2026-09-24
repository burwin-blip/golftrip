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
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { players } from './data.js';

// Resolved off this module's own URL when running from source (astro dev). Under
// the Vercel adapter the prerender runs from a bundled chunk, where that relative
// path points nowhere — so fall back to the project root (the build's cwd).
const fromModule = fileURLToPath(new URL('../../public/players/', import.meta.url));
const PORTRAIT_DIR = fs.existsSync(fromModule) ? fromModule : path.join(process.cwd(), 'public', 'players');

// Preference order — the first extension present wins, so a hand-dropped .jpg
// quietly takes over from anything else without needing the old file removed.
const EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.avif'];

// content-hashed URL so a replaced file never lingers in a phone's cache
const versioned = (file) =>
  `/players/${file}?v=${crypto.createHash('sha1').update(fs.readFileSync(path.join(PORTRAIT_DIR, file))).digest('hex').slice(0, 10)}`;

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
    // ?v=<content hash>: a replaced photo keeps its filename, so the URL has to
    // change with the bytes or a phone can keep showing the old face.
    if (hit) map[p.id] = versioned(hit);
  }
  return map;
}

const PORTRAITS = scan();

// Optional square face crop for the small round avatars: `<id>-avatar.jpg`.
// Only needed when the portrait is deliberately wide (a scene that has to read
// on the tall card, e.g. Anthony Herring in the ice bath), so the 20–44px circles
// would otherwise show a tiny face. Everyone else's circle crops the portrait.
const AVATARS = (() => {
  let present;
  try { present = new Set(fs.readdirSync(PORTRAIT_DIR)); } catch { return {}; }
  const map = {};
  for (const p of players) {
    const hit = EXTS.map((e) => `${p.id}-avatar${e}`).find((f) => present.has(f));
    if (hit) map[p.id] = versioned(hit);
  }
  return map;
})();

/** Source for the small round avatar: { src, square } — the face crop when one
 *  exists (square: true), else the portrait, else null. */
export const playerAvatar = (playerId) =>
  AVATARS[playerId] ? { src: AVATARS[playerId], square: true }
  : PORTRAITS[playerId] ? { src: PORTRAITS[playerId], square: false } : null;

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
