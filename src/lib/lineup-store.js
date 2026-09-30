// ---------------------------------------------------------------------------
// LINEUP STORE — the Match Centre's saved lineups. Server-side only (the
// /api/lineups route). Same Upstash Redis database as the RSVPs, SEPARATE key
// namespace; the RSVP store's code is untouched (this is its own small client,
// following the same pattern):
//   lineups:<year>   hash, field "doc" → the lineups document (JSON; shape in
//                    matchcentre-shared.js). Later phases add sibling fields /
//                    keys (e.g. results) without touching this one.
// Local dev: no Redis configured → .lineups-local/store.json (gitignored), or
// LINEUPS_LOCAL_STORE=<path>.
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';

export const lineupKey = (year) => `lineups:${year}`;

// Same env detection as the RSVP store (any *KV_REST_API_URL / *UPSTASH_REDIS_REST_URL
// with its matching token, so a prefixed Vercel integration works too).
function redisEnv(env = process.env) {
  for (const [urlSuffix, tokenSuffix] of [['KV_REST_API_URL', 'KV_REST_API_TOKEN'], ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN']]) {
    for (const k of Object.keys(env)) {
      if (!k.endsWith(urlSuffix) || !env[k]) continue;
      const token = env[k.slice(0, -urlSuffix.length) + tokenSuffix];
      if (token) return { url: env[k], token };
    }
  }
  return null;
}

export class LineupsNotConfigured extends Error {}

async function backend(env = process.env) {
  const redis = redisEnv(env);
  if (redis) {
    const { Redis } = await import('@upstash/redis');
    const r = new Redis({ url: redis.url, token: redis.token, automaticDeserialization: false });
    return {
      kind: 'redis',
      async get(key) { const v = await r.hget(key, 'doc'); return v == null ? null : typeof v === 'string' ? JSON.parse(v) : v; },
      async put(key, doc) { await r.hset(key, { doc: JSON.stringify(doc) }); },
    };
  }
  if (env.VERCEL) throw new LineupsNotConfigured('Lineups storage isn’t connected yet.');
  const file = env.LINEUPS_LOCAL_STORE || path.join(process.cwd(), '.lineups-local', 'store.json');
  const read = () => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; } };
  return {
    kind: 'file',
    async get(key) { return read()[key]?.doc ?? null; },
    async put(key, doc) { const db = read(); db[key] = { doc }; fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(db, null, 2)); },
  };
}

export async function loadLineups(year, env) {
  const b = await backend(env);
  return { doc: await b.get(lineupKey(year)), backend: b.kind };
}

export async function saveLineups(year, doc, env) {
  const b = await backend(env);
  await b.put(lineupKey(year), doc);
  return b.kind;
}
