// ---------------------------------------------------------------------------
// Draft Room reveal videos — the list written at build time by
// scripts/scan-reveal-videos.mjs from public/videos/draft-reveals/<player-id>.mp4.
// Read with a Vite glob so a missing generated file just means "no videos"
// (a bare `astro build` still works). Used by the draft server (to reserve the
// video's time in the reveal) and the Big Board (to preload and play).
// ---------------------------------------------------------------------------
import { VIDEO_CAP_MS } from './draft-shared.js';

const gen = import.meta.glob('./draft-videos.generated.json', { eager: true, import: 'default' });
/** { [playerId]: { file, url, durationMs, bytes } } */
export const REVEAL_VIDEOS = Object.values(gen)[0]?.videos ?? {};

/** The reveal video for a player as the board plays it ({ url, ms } capped at 30s), or null. */
export function revealVideoFor(playerId) {
  const v = REVEAL_VIDEOS[playerId];
  return v ? { url: v.url, ms: Math.min(v.durationMs, VIDEO_CAP_MS) } : null;
}

/** A captain's intro video (captain-<player-id>.mp4) as the board plays it, or null. */
export function captainVideoFor(playerId) {
  return revealVideoFor(`captain-${playerId}`);
}
