// ---------------------------------------------------------------------------
// DRAFT STORE — the Draft Room's state. Server-side only (the /api/draft*
// routes and scripts/pull-draft.mjs). Same Upstash Redis database as the RSVPs
// and lineups, its OWN key namespace; the RSVP code is untouched.
//   draft:2027:real    hash  state → the real draft document, keys → captain keys
//   draft:2027:mock    hash  the rehearsal draft (same shape) — never finalises
//   draft:2027:config  hash  mode → "real" | "mock" (which draft the screens follow)
//   draft:2027:lock    SET NX PX — a short lock around every write, so two rapid
//                      submissions can't both land (one waits, then re-checks)
// Local dev: no Redis → .draft-local/store.json (gitignored) + an in-process lock.
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';

const YEAR = 2027;
export const draftKey = (mode) => `draft:${YEAR}:${mode}`;
const CONFIG = `draft:${YEAR}:config`;
const LOCK = `draft:${YEAR}:lock`;

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

export class DraftNotConfigured extends Error {}
export const draftStoreConfigured = (env = process.env) => Boolean(redisEnv(env)) || !env.VERCEL;

let fileChain = Promise.resolve();   // the local lock: one write at a time in this process

async function backend(env = process.env) {
  const redis = redisEnv(env);
  if (redis) {
    const { Redis } = await import('@upstash/redis');
    const r = new Redis({ url: redis.url, token: redis.token, automaticDeserialization: false });
    const parse = (v) => (v == null ? null : typeof v === 'string' ? JSON.parse(v) : v);
    return {
      kind: 'redis',
      async get(key, field) { return parse(await r.hget(key, field)); },
      async put(key, field, value) { await r.hset(key, { [field]: JSON.stringify(value) }); },
      async withLock(fn) {
        const token = Math.random().toString(36).slice(2);
        for (let i = 0; i < 40; i++) {                                   // up to ~4s
          if (await r.set(LOCK, token, { nx: true, px: 4000 })) {
            try { return await fn(); } finally { if ((await r.get(LOCK)) === token) await r.del(LOCK); }   // only release our own lock
          }
          await new Promise((res) => setTimeout(res, 100));
        }
        throw new Error('The draft is busy — try again in a moment.');
      },
    };
  }
  if (env.VERCEL) throw new DraftNotConfigured('Draft storage isn’t connected yet.');
  const file = env.DRAFT_LOCAL_STORE || path.join(process.cwd(), '.draft-local', 'store.json');
  const read = () => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; } };
  const write = (db) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(db, null, 2)); };
  return {
    kind: 'file',
    async get(key, field) { return read()[key]?.[field] ?? null; },
    async put(key, field, value) { const db = read(); (db[key] ||= {})[field] = value; write(db); },
    withLock(fn) { const run = fileChain.then(fn, fn); fileChain = run.catch(() => {}); return run; },
  };
}

export async function loadMode(env) { return (await (await backend(env)).get(CONFIG, 'mode')) || 'real'; }
export async function saveMode(mode, env) { return (await backend(env)).put(CONFIG, 'mode', mode); }
export async function loadDraft(mode, env) { return (await backend(env)).get(draftKey(mode), 'state'); }
export async function saveDraft(mode, doc, env) { return (await backend(env)).put(draftKey(mode), 'state', doc); }
export async function loadKeys(mode, env) { return (await (await backend(env)).get(draftKey(mode), 'keys')) || { A: null, B: null }; }
export async function saveKeys(mode, keys, env) { return (await backend(env)).put(draftKey(mode), 'keys', keys); }
export async function withDraftLock(fn, env) { return (await backend(env)).withLock(fn); }
