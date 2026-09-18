// Minimal Upstash REST stand-in for local testing of the REAL Redis code path
// (the file store can't catch client-shape bugs — the September 2026 outage was
// one). HGETALL / HGET / HSET / HDEL, single + /pipeline, replying in Redis's
// raw shapes (HGETALL = a flat [field, value, ...] array). In-memory; restart it
// for an empty store. See CLAUDE.md → RSVP → Testing.
import http from 'node:http';
const db = new Map();
const h = (k) => db.get(k) || db.set(k, new Map()).get(k);
function run([cmd, key, ...args]) {
  switch (cmd.toLowerCase()) {
    case 'hgetall': { const m = db.get(key); return m ? [...m].flat() : []; }
    case 'hget': return db.get(key)?.get(args[0]) ?? null;
    case 'hset': { let n = 0; for (let i = 0; i < args.length; i += 2) { if (!h(key).has(args[i])) n++; h(key).set(args[i], args[i + 1]); } return n; }
    case 'hdel': { let n = 0; for (const f of args) if (db.get(key)?.delete(f)) n++; return n; }
    default: throw new Error('unsupported ' + cmd);
  }
}
http.createServer((req, res) => {
  let body = ''; req.on('data', (c) => (body += c)).on('end', () => {
    const cmds = JSON.parse(body || '[]');
    const out = req.url.startsWith('/pipeline') || req.url.startsWith('/multi-exec') ? cmds.map((c) => ({ result: run(c) })) : { result: run(cmds) };
    res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(out));
  });
}).listen(4600, () => console.log('fake upstash on 4600'));
