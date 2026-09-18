// ---------------------------------------------------------------------------
// RSVP STORE — where RSVP submissions live. Server-side only (the API routes
// and scripts/pull-rsvp.mjs); never imported by a page.
//
// Production: Upstash Redis (free tier, added via Vercel → Storage). Vercel
// injects KV_REST_API_URL / KV_REST_API_TOKEN when the database is connected
// (older integrations used UPSTASH_REDIS_REST_URL / _TOKEN — both work).
// Local dev: no Redis configured → a JSON file at .rsvp-local/store.json
// (gitignored), so the whole flow can be run and tested on a laptop.
//
// Three Redis hashes, one field per player id — so a re-submission can only
// ever overwrite that player's entry, never add a second one:
//   rsvp:players             new players created via "I'm not listed"
//   rsvp:profiles            PERMANENT player data (game profile, DOB, hcp history)
//   rsvp:event:<tid>         that edition's EVENT data (status, votes, Q8/Q9)
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';

const KEYS = {
  players: 'rsvp:players',
  profiles: 'rsvp:profiles',
  event: (tid) => `rsvp:event:${tid}`,
};

function redisEnv(env = process.env) {
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}

export class RsvpNotConfigured extends Error {}

// ---- backends ---------------------------------------------------------------
async function redisBackend({ url, token }) {
  const { Redis } = await import('@upstash/redis');
  // We store JSON strings ourselves, so turn off the client's own (de)serialising.
  const r = new Redis({ url, token, automaticDeserialization: false });
  const parseAll = (h) => Object.fromEntries(Object.entries(h || {}).map(([k, v]) => [k, JSON.parse(v)]));
  return {
    kind: 'redis',
    async all(key) { return parseAll(await r.hgetall(key)); },
    async get(key, id) { const v = await r.hget(key, id); return v == null ? null : JSON.parse(v); },
    async put(key, id, value) { await r.hset(key, { [id]: JSON.stringify(value) }); },
  };
}

function fileBackend(file) {
  const read = () => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; } };
  const write = (db) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(db, null, 2)); };
  return {
    kind: 'file',
    async all(key) { return read()[key] || {}; },
    async get(key, id) { return read()[key]?.[id] ?? null; },
    async put(key, id, value) { const db = read(); (db[key] ||= {})[id] = value; write(db); },
  };
}

let cached = null;
async function backend(env = process.env) {
  if (cached) return cached;
  const redis = redisEnv(env);
  if (redis) return (cached = await redisBackend(redis));
  // On Vercel with no database connected yet: refuse rather than silently
  // writing to a throwaway serverless filesystem.
  if (env.VERCEL) throw new RsvpNotConfigured('RSVP storage is not set up yet (no Upstash Redis connected).');
  const file = env.RSVP_LOCAL_STORE || path.join(process.cwd(), '.rsvp-local', 'store.json');
  return (cached = fileBackend(file));
}

export const isConfigured = (env = process.env) => Boolean(redisEnv(env)) || !env.VERCEL;

// ---- API --------------------------------------------------------------------
export async function loadAll(tid, env) {
  const b = await backend(env);
  const [players, profiles, event] = await Promise.all([
    b.all(KEYS.players), b.all(KEYS.profiles), b.all(KEYS.event(tid)),
  ]);
  return { players, profiles, event, backend: b.kind };
}

export async function loadOne(tid, playerId, env) {
  const b = await backend(env);
  const [profile, event] = await Promise.all([b.get(KEYS.profiles, playerId), b.get(KEYS.event(tid), playerId)]);
  return { profile, event };
}

export async function listNewPlayers(env) {
  const b = await backend(env);
  return b.all(KEYS.players);
}

export async function putPlayer(player, env) { return (await backend(env)).put(KEYS.players, player.id, player); }
export async function putProfile(id, profile, env) { return (await backend(env)).put(KEYS.profiles, id, profile); }
export async function putEvent(tid, id, record, env) { return (await backend(env)).put(KEYS.event(tid), id, record); }
