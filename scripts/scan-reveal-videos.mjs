// ---------------------------------------------------------------------------
// Build step: list the Draft Room reveal videos in public/videos/draft-reveals/
// (one file per player, named by player id: ben-dowdell.mp4) with each clip's
// real length, read from the file's own MP4 header (moov → mvhd) — no ffprobe
// needed on Vercel. Writes src/lib/draft-videos.generated.json (gitignored),
// which the draft server (to time the reveal) and the Big Board (to preload and
// play) both read through src/lib/draft-videos.js.
//
// A file whose header can't be read is LEFT OUT (with a warning): that player
// simply gets the normal card reveal. Never fails the build.
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIR = path.join(ROOT, 'public', 'videos', 'draft-reveals');
const OUT = path.join(ROOT, 'src', 'lib', 'draft-videos.generated.json');
const EXT = new Set(['.mp4', '.m4v', '.mov']);
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// Walk ISO-BMFF boxes to moov/mvhd and return the duration in ms (or null).
export function mp4DurationMs(buf) {
  const box = (start, end, want) => {
    let p = start;
    while (p + 8 <= end) {
      let size = buf.readUInt32BE(p);
      const type = buf.toString('latin1', p + 4, p + 8);
      let head = 8;
      if (size === 1) { if (p + 16 > end) return null; size = Number(buf.readBigUInt64BE(p + 8)); head = 16; }
      else if (size === 0) size = end - p;
      if (size < head || p + size > end) return null;
      if (type === want) return { start: p + head, end: p + size };
      p += size;
    }
    return null;
  };
  if (buf.length < 16 || buf.toString('latin1', 4, 8) !== 'ftyp') return null;
  const moov = box(0, buf.length, 'moov');
  if (!moov) return null;
  const mvhd = box(moov.start, moov.end, 'mvhd');
  if (!mvhd) return null;
  const v = buf[mvhd.start];
  const at = mvhd.start + 4;
  const [timescale, duration] = v === 1
    ? [buf.readUInt32BE(at + 16), Number(buf.readBigUInt64BE(at + 20))]
    : [buf.readUInt32BE(at + 8), buf.readUInt32BE(at + 12)];
  if (!timescale || !duration) return null;
  return Math.round((duration / timescale) * 1000);
}

function knownPlayerIds() {
  const ids = new Set();
  try { for (const p of JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'players.json'), 'utf8'))) ids.add(p.id); } catch {}
  try { for (const p of JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'rsvp.generated.json'), 'utf8')).players || []) ids.add(p.id); } catch {}
  return ids;
}

const videos = {};
let files = [];
try { files = fs.readdirSync(DIR); } catch { /* no folder yet → no videos */ }
const known = knownPlayerIds();
for (const f of files.sort()) {
  const ext = path.extname(f).toLowerCase();
  if (!EXT.has(ext)) continue;
  const id = path.basename(f, path.extname(f));
  if (!SLUG.test(id)) { console.warn(`[reveal-videos] skipped "${f}": name it by player id, e.g. ben-dowdell.mp4`); continue; }
  const buf = fs.readFileSync(path.join(DIR, f));
  const ms = mp4DurationMs(buf);
  if (!ms) { console.warn(`[reveal-videos] skipped "${f}": not a readable MP4 (that player gets the normal reveal)`); continue; }
  if (videos[id]) { console.warn(`[reveal-videos] "${f}": ${id} already has ${videos[id].file}; keeping that one`); continue; }
  if (!known.has(id)) console.warn(`[reveal-videos] "${f}": no player with id "${id}" (yet) — kept, but check the spelling`);
  const v = crypto.createHash('sha1').update(buf).digest('hex').slice(0, 10);
  videos[id] = { file: f, url: `/videos/draft-reveals/${encodeURIComponent(f)}?v=${v}`, durationMs: ms, bytes: buf.length };
}
fs.writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), videos }, null, 1) + '\n');
const n = Object.keys(videos).length;
console.log(`[reveal-videos] ${n} reveal video${n === 1 ? '' : 's'}${n ? ': ' + Object.entries(videos).map(([id, x]) => `${id} ${(x.durationMs / 1000).toFixed(1)}s ${(x.bytes / 1e6).toFixed(1)}MB`).join(', ') : ''}`);
