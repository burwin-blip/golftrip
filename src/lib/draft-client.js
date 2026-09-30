// ---------------------------------------------------------------------------
// DRAFT ROOM — browser helpers shared by the board and both consoles: polling
// with automatic recovery (a wifi drop just means a few missed polls; the next
// one resumes exactly where the server says things stand), the server-clock
// offset (so every screen shows the same countdown whatever its own clock says),
// secret keys from the URL hash, and the player-card markup.
// ---------------------------------------------------------------------------

export const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** A key from `#<key>` (kept in this tab's sessionStorage so a refresh keeps it; stripped from the address bar). */
export function keyFromHash(storeName) {
  let key = null;
  const h = decodeURIComponent(location.hash.replace(/^#/, ''));
  if (h) {
    key = h;
    try { sessionStorage.setItem(storeName, key); } catch {}
    history.replaceState(null, '', location.pathname + location.search);
  } else {
    try { key = sessionStorage.getItem(storeName); } catch {}
  }
  return key;
}

/**
 * Poll `url` every `every` ms. `onData(body)` gets each good reply; `onStatus`
 * ('live' | 'reconnecting' | 'error:<msg>') drives a small connection light.
 * Returns { refresh(body?) } — call with a POST reply to apply it at once.
 */
export function startPolling(url, { headers = {}, every = 1500, onData, onStatus }) {
  let offset = 0, timer = null, failures = 0;
  const now = () => Date.now() + offset;
  const apply = (body, sentAt) => {
    if (body?.serverNow) { const rtt = Date.now() - (sentAt ?? Date.now()); offset = body.serverNow + rtt / 2 - Date.now(); }
    onData(body, now);
  };
  async function tick() {
    const sentAt = Date.now();
    try {
      const res = await fetch(url, { cache: 'no-store', headers });
      const body = await res.json();
      if (!res.ok || !body.ok) { onStatus?.(`error:${body.error || res.status}`); }
      else { failures = 0; onStatus?.('live'); apply(body, sentAt); }
    } catch { failures++; onStatus?.(failures > 1 ? 'reconnecting' : 'live'); }
    timer = setTimeout(tick, failures > 3 ? Math.min(5000, every * 2) : every);
  }
  tick();
  return { now, refresh(body) { apply(body); }, stop() { clearTimeout(timer); } };
}

/** The big player card (board rosters, the reveal, the captain's pool). */
export function cardHtml(p, { size = 'md', badge = '', extra = '' } = {}) {
  if (!p) return `<div class="dc dc--${size} dc--empty"><div class="dc__photo"></div><div class="dc__body"><span class="dc__name">—</span></div></div>`;
  const photo = p.portrait ? `<img src="${esc(p.portrait)}" alt="" decoding="async">` : `<span class="dc__init">${esc(p.initials)}</span>`;
  const meta = [p.index != null ? `Index ${p.index}` : 'No index', p.rank ? `#${p.rank} Power` : null].filter(Boolean).join(' · ');
  return `<div class="dc dc--${size}">${badge}<div class="dc__photo">${photo}${p.rookie ? '<span class="dc__rookie">Rookie</span>' : ''}</div>
    <div class="dc__body"><span class="dc__name">${esc(p.name)}</span><span class="dc__meta">${esc(meta)}</span>${extra}</div></div>`;
}

/** Shared card styles (injected once per page). */
export const CARD_CSS = `
.dc { position: relative; display: flex; flex-direction: column; border-radius: 14px; overflow: hidden; background: #fff; color: #17293F; box-shadow: 0 10px 28px -14px rgba(0,0,0,.55); min-width: 0; }
.dc__photo { position: relative; aspect-ratio: 4 / 5; background: linear-gradient(180deg, #DE9660 0%, #EFC095 55%, #F9E4C6 100%); }
.dc__photo img { width: 100%; height: 100%; object-fit: cover; object-position: center 28%; display: block; }
.dc__init { position: absolute; inset: 0; display: grid; place-items: center; font-family: var(--serif); font-weight: 600; font-size: 2.4rem; color: #17293F; }
.dc__rookie { position: absolute; top: 8px; left: 8px; padding: .15rem .5rem; border-radius: 99px; background: #C9A227; color: #fff; font-size: .62rem; font-weight: 900; letter-spacing: .1em; text-transform: uppercase; }
.dc__body { display: grid; gap: .1rem; padding: .5rem .65rem .6rem; border-top: 4px solid var(--dc-c, #17293F); }
.dc__name { font-family: var(--serif); font-weight: 700; font-size: 1.05rem; line-height: 1.1; overflow-wrap: anywhere; }
.dc__meta { font-size: .72rem; font-weight: 700; color: #6b7a86; font-variant-numeric: tabular-nums; }
.dc--empty { background: rgba(255,255,255,.06); box-shadow: inset 0 0 0 2px rgba(255,255,255,.14); color: rgba(255,255,255,.35); }
.dc--empty .dc__photo { background: transparent; }
.dc--empty .dc__body { border-top-color: rgba(255,255,255,.12); }
.dc__cap { position: absolute; top: 8px; right: 8px; z-index: 2; width: 26px; height: 26px; display: grid; place-items: center; border-radius: 50%; background: var(--dc-c, #17293F); color: #fff; font-weight: 900; font-size: .75rem; box-shadow: 0 0 0 2px #fff; }
`;
