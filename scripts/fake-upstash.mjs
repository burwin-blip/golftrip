// Minimal Upstash REST stand-in for local testing of the REAL Redis code path
// (the file store can't catch client-shape bugs — the September 2026 outage was
// one). HGETALL / HGET / HSET / HDEL (+ SET/GET/DEL for the Draft Room lock), single + /pipeline, replying in Redis's
// raw shapes (HGETALL = a flat [field, value, ...] array), base64-encoded when the client asks, as the real service does. In-memory; restart it
// for an empty store. See CLAUDE.md → RSVP → Testing.
import http from 'node:http';
const db = new Map();
const strs = new Map();   // string keys (SET/GET/DEL); PX expiry isn't simulated — the lock is always released
const h = (k) => db.get(k) || db.set(k, new Map()).get(k);
function run([cmd, key, ...args]) {
  switch (cmd.toLowerCase()) {
    case 'hgetall': { const m = db.get(key); return m ? [...m].flat() : []; }
    case 'hget': return db.get(key)?.get(args[0]) ?? null;
    case 'hset': { let n = 0; for (let i = 0; i < args.length; i += 2) { if (!h(key).has(args[i])) n++; h(key).set(args[i], args[i + 1]); } return n; }
    case 'hdel': { let n = 0; for (const f of args) if (db.get(key)?.delete(f)) n++; return n; }
    // plain strings, for the Draft Room's lock: SET key value [NX] [PX ms], GET, DEL
    case 'set': { const flags = args.slice(1).map((a) => String(a).toLowerCase()); if (flags.includes('nx') && strs.has(key)) return null; strs.set(key, args[0]); return 'OK'; }
    case 'get': return strs.get(key) ?? null;
    case 'del': { const n = (strs.delete(key) ? 1 : 0) + (db.delete(key) ? 1 : 0); return n; }
    default: throw new Error('unsupported ' + cmd);
  }
}
http.createServer((req, res) => {
  let body = ''; req.on('data', (c) => (body += c)).on('end', () => {
    const cmds = JSON.parse(body || '[]');
    // Like the real service: with "Upstash-Encoding: base64" (the client's default)
    // every string in a reply is base64-encoded, and the client decodes it.
    const b64 = String(req.headers['upstash-encoding'] || '').toLowerCase() === 'base64';
    const enc = (v) => (!b64 ? v : typeof v === 'string' ? Buffer.from(v).toString('base64') : Array.isArray(v) ? v.map(enc) : v);
    const out = req.url.startsWith('/pipeline') || req.url.startsWith('/multi-exec') ? cmds.map((c) => ({ result: enc(run(c)) })) : { result: enc(run(cmds)) };
    res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(out));
  });
}).listen(4600, () => console.log('fake upstash on 4600'));
