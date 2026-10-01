// ---------------------------------------------------------------------------
// DRAFT NIGHT RECAP — one renderer for both places it appears, so the mock
// preview is exactly what the real archive will look like:
//   - the permanent "Draft Night" tab on the 2027 page (rendered at build time
//     from data/draft.generated.json, after a REAL finalise)
//   - /draft/recap (rendered in the browser from the live draft, so a MOCK
//     finalise can be seen at once, watermarked and never published)
// Pure string-building: no data imports, no Node or DOM APIs.
// ---------------------------------------------------------------------------
import { draftRecap, clockText } from './draft-shared.js';

const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const GRADE = { steal: 'Steal', fair: 'Fair', reach: 'Reach', unranked: '—' };

/** "Thursday 25 March 2027", on the venue's clock (utcOffset like "-07:00"). */
function venueDate(ms, utcOffset = '+00:00') {
  if (!ms) return null;
  const m = /^([+-])(\d\d):(\d\d)$/.exec(utcOffset) || ['', '+', '00', '00'];
  const off = (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) * 60000;
  const d = new Date(ms + off);
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/**
 * HTML for the recap. `doc` is a finalised draft document (live) or the
 * generated slice (build); `P` maps player id → { name, avatar|portrait,
 * initials, slug }; `mock` adds the watermark and the rehearsal banner.
 */
export function recapHtml(doc, P, { mock = false, utcOffset = '+00:00', scout = {} } = {}) {
  const r = draftRecap(doc, scout);
  const team = (s) => doc.teams?.[s] || {};
  const tname = (s) => team(s).name || `Team ${s}`;
  const col = (s) => team(s).color || (s === 'A' ? '#E06A2E' : '#4A8FD1');
  const mono = (s) => (String(tname(s)).replace(/^(team|the)\s+/i, '').trim()[0] || '?').toUpperCase();
  const name = (id) => P[id]?.name || id;
  const face = (id, size = 36) => {
    const p = P[id] || {};
    const src = p.avatar || p.portrait;
    return `<span class="dr-face" style="width:${size}px;height:${size}px">${src ? `<img src="${esc(src)}" alt="" loading="lazy">` : esc(p.initials || '?')}</span>`;
  };
  const link = (id, inner) => (P[id]?.slug ? `<a href="/players/${esc(P[id].slug)}">${inner}</a>` : inner);
  const first = doc.order?.[0] || doc.firstPick || 'A';
  const date = venueDate(doc.finalisedAt, utcOffset);
  const overtime = r.rows.filter((x) => x.clockMs != null && x.clockMs > (doc.pickMs || 120000));

  const highlight = (label, row, cls) => (row ? `<div class="dr-hl dr-hl--${cls}" style="--c:${col(row.side)}">
      <p class="dr-hl__k">${label}</p>${face(row.playerId, 52)}<div><p class="dr-hl__name">${link(row.playerId, esc(name(row.playerId)))}</p>
      <p class="dr-hl__sub">Pick ${row.n} · ${esc(tname(row.side))}</p><p class="dr-hl__note">${esc(row.note)}</p></div></div>` : '');

  const roster = (s) => {
    const ids = [doc.captains[s], ...r.rows.filter((x) => x.side === s).map((x) => x.playerId)];
    return `<div class="dr-team" style="--c:${col(s)}"><div class="dr-team__head"><span class="dr-mono">${esc(mono(s))}</span><div><h3>${esc(tname(s))}</h3><p>Captain ${esc(name(doc.captains[s]))}</p></div></div>
      <ol>${ids.map((id, i) => `<li>${face(id, 30)}<span>${link(id, esc(name(id)))}</span><small>${i === 0 ? 'Captain' : `Pick ${r.rows.find((x) => x.playerId === id)?.n}`}</small></li>`).join('')}</ol></div>`;
  };

  const rows = r.rows.map((x) => `<li class="dr-row" style="--c:${col(x.side)}">
      <span class="dr-row__n">${x.n}</span>
      <span class="dr-row__team"><span class="dr-chip">${esc(mono(x.side))}</span><span class="dr-row__tname">${esc(tname(x.side))}</span></span>
      <span class="dr-row__player">${face(x.playerId, 34)}<span>${link(x.playerId, esc(name(x.playerId)))}${x.clockMs != null && x.clockMs > (doc.pickMs || 120000) ? ` <em class="dr-ot">overtime +${clockText(x.clockMs - doc.pickMs)}</em>` : ''}</span></span>
      <span class="dr-row__num" data-k="Index">${x.index != null ? esc(x.index) : '—'}</span>
      <span class="dr-row__num" data-k="Power">${x.rank != null ? `#${x.rank}` : '—'}</span>
      <span class="dr-row__val"><span class="dr-grade dr-grade--${x.grade}">${GRADE[x.grade]}</span><span class="dr-row__note">${esc(x.note)}</span></span>
    </li>`).join('');

  return `<section class="dr${mock ? ' dr--mock' : ''}">
    ${mock ? '<div class="dr-mockbar">MOCK DRAFT · a rehearsal. This is exactly how the recap will look; it is not on the site.</div><div class="dr-wm" aria-hidden="true">MOCK</div>' : ''}
    <header class="dr-head">
      <p class="eyebrow gold">Draft Night${date ? ` · ${esc(date)}` : ''}</p>
      <h2>The ${esc(doc.tournamentId?.match(/\d{4}/)?.[0] || '')} Draft</h2>
      <p class="muted">${r.rows.length} picks, snake order, ${esc(tname(first))} on the clock first. ${overtime.length ? `${overtime.length} pick${overtime.length === 1 ? '' : 's'} went to overtime.` : 'Nobody went to overtime.'}</p>
    </header>
    ${r.steal || r.reach ? `<div class="dr-hls">${highlight('Steal of the draft', r.steal, 'steal')}${highlight('Biggest reach', r.reach, 'reach')}</div>` : ''}
    <div class="dr-teams">${roster('A')}${roster('B')}</div>
    <h3 class="dr-sub">Pick by pick</h3>
    <ol class="dr-rows"><li class="dr-row dr-row--head" aria-hidden="true"><span>#</span><span>Team</span><span>Player</span><span>Index</span><span>Power</span><span>Draft value</span></li>${rows}</ol>
    <p class="dr-foot">Index and power ranking are as they stood when each pick was made. <b>Draft value</b> compares where a player went with their place among the ranked players in this pool (captains aren't picks; unranked players aren't graded): ${r.band} or more places later than ranked is a <b>steal</b>, ${r.band} or more earlier is a <b>reach</b>, anything closer is <b>fair</b>. A proxy, like the 2026 Draft Value analysis: the rankings measure current form, not what the captain knew.</p>
  </section>`;
}

/** The recap's styles (injected once on each page that shows it). */
export const RECAP_CSS = `
.dr { position: relative; }
.dr-mockbar { margin-bottom: 1.2rem; padding: .55rem 1rem; border-radius: 10px; text-align: center; color: #fff; font-weight: 800; font-size: .8rem; letter-spacing: .06em; background: repeating-linear-gradient(-45deg, #E06A2E 0 14px, #C95A22 14px 28px); }
.dr-wm { position: absolute; inset: 0; display: grid; place-items: center; pointer-events: none; font-weight: 900; font-size: clamp(6rem, 22vw, 18rem); letter-spacing: .1em; color: rgba(224,106,46,.07); transform: rotate(-18deg); z-index: 0; overflow: hidden; }
.dr > *:not(.dr-wm) { position: relative; z-index: 1; }
.dr-head h2 { font-size: clamp(1.8rem, 1.3rem + 2vw, 2.6rem); margin: .3rem 0 .4rem; }
.dr-head .muted { max-width: 64ch; }
.dr-hls { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 1rem; margin: 1.4rem 0; }
.dr-hl { display: grid; grid-template-columns: auto 1fr; gap: .4rem .9rem; align-items: start; padding: 1rem 1.1rem; border-radius: var(--r, 14px); background: var(--panel, #fff); border-left: 5px solid var(--c); box-shadow: var(--shadow, 0 6px 20px -14px rgba(0,0,0,.4)); }
.dr-hl__k { grid-column: 1 / -1; margin: 0; font-size: .7rem; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; color: var(--terra-ink, #A73820); }
.dr-hl--steal .dr-hl__k { color: #1F7A4D; }
.dr-hl__name { margin: 0; font-family: var(--serif); font-weight: 700; font-size: 1.2rem; }
.dr-hl__name a, .dr-team a, .dr-row a { color: inherit; text-decoration: none; }
.dr-hl__name a:hover, .dr-team a:hover, .dr-row a:hover { color: var(--terra-ink, #A73820); }
.dr-hl__sub { margin: .1rem 0 .3rem; font-size: .8rem; font-weight: 700; color: var(--c); }
.dr-hl__note { margin: 0; font-size: .85rem; color: var(--muted, #5b6770); }
.dr-face { display: inline-grid; place-items: center; flex: none; border-radius: 50%; overflow: hidden; background: linear-gradient(180deg, #DE9660, #F9E4C6); font-family: var(--serif); font-weight: 700; font-size: .7rem; color: #17293F; box-shadow: 0 0 0 2px var(--c, #17293F); }
.dr-face img { width: 100%; height: 100%; object-fit: cover; object-position: center 26%; }
.dr-teams { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 1rem; margin: 1.4rem 0 2rem; }
.dr-team { padding: 1rem 1.1rem; border-radius: var(--r, 14px); background: var(--panel, #fff); border-top: 5px solid var(--c); box-shadow: var(--shadow, 0 6px 20px -14px rgba(0,0,0,.4)); }
.dr-team__head { display: flex; gap: .7rem; align-items: center; margin-bottom: .7rem; }
.dr-team__head h3 { margin: 0; font-size: 1.25rem; }
.dr-team__head p { margin: 0; font-size: .8rem; color: var(--muted, #5b6770); }
.dr-mono, .dr-chip { display: grid; place-items: center; border-radius: 50%; background: var(--c); color: #fff; font-family: var(--serif); font-weight: 700; flex: none; }
.dr-mono { width: 38px; height: 38px; font-size: 1.1rem; }
.dr-chip { width: 22px; height: 22px; font-size: .7rem; }
.dr-team ol { list-style: none; margin: 0; padding: 0; display: grid; gap: .35rem; }
.dr-team li { display: flex; align-items: center; gap: .55rem; font-weight: 600; font-size: .92rem; }
.dr-team li small { margin-left: auto; font-size: .72rem; font-weight: 700; color: var(--faint, #8a949b); }
.dr-sub { font-size: 1.3rem; margin: 0 0 .6rem; }
.dr-rows { list-style: none; margin: 0; padding: 0; display: grid; gap: .4rem; }
.dr-row { display: grid; grid-template-columns: 2.2rem minmax(0, 1.1fr) minmax(0, 1.5fr) 4rem 4rem minmax(0, 2.4fr); gap: .8rem; align-items: center; padding: .6rem .8rem; border-radius: 12px; background: var(--panel, #fff); border-left: 4px solid var(--c); }
.dr-row--head { background: none; border-left-color: transparent; padding-block: 0; font-size: .68rem; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; color: var(--faint, #8a949b); }
.dr-row__n { font-weight: 900; font-size: 1.1rem; font-variant-numeric: tabular-nums; color: var(--c); }
.dr-row__team { display: flex; align-items: center; gap: .45rem; font-weight: 700; font-size: .85rem; min-width: 0; }
.dr-row__tname { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dr-row__player { display: flex; align-items: center; gap: .55rem; font-weight: 700; min-width: 0; }
.dr-row__num { font-variant-numeric: tabular-nums; font-weight: 700; }
.dr-row__val { display: grid; gap: .15rem; justify-items: start; }
.dr-row__note { font-size: .78rem; color: var(--muted, #5b6770); }
.dr-ot { font-style: normal; font-size: .72rem; font-weight: 700; color: #C0392B; }
.dr-grade { display: inline-block; padding: .12rem .6rem; border-radius: 999px; font-size: .72rem; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; background: #EEF1F4; color: #5b6770; }
.dr-grade--steal { background: #E3F3EA; color: #1F7A4D; }
.dr-grade--reach { background: #FBE6DE; color: #A73820; }
.dr-foot { margin-top: 1.2rem; font-size: .82rem; color: var(--muted, #5b6770); max-width: 80ch; }
@media (max-width: 760px) {
  .dr-row--head { display: none; }
  .dr-row { grid-template-columns: 2rem minmax(0, 1fr) auto auto; grid-template-areas: "n player idx pow" "n team team team" "n val val val"; gap: .3rem .7rem; }
  .dr-row__n { grid-area: n; align-self: start; }
  .dr-row__player { grid-area: player; }
  .dr-row__team { grid-area: team; font-size: .78rem; }
  .dr-row__num:nth-of-type(4) { grid-area: idx; }
  .dr-row__num:nth-of-type(5) { grid-area: pow; }
  .dr-row__num::before { content: attr(data-k) ' '; font-size: .62rem; font-weight: 700; color: var(--faint, #8a949b); text-transform: uppercase; letter-spacing: .06em; }
  .dr-row__val { grid-area: val; }
}
`;
