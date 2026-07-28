// Presentation helpers. No stats here — display formatting only.
import { playerById } from './data.js';

export const firstName = (id) => (playerById[id]?.name || id).split(' ')[0];
export const fullName = (id) => playerById[id]?.name || id;

// Last name, but keep short single-token names ("Scott B") intact.
export const lastName = (id) => {
  const parts = (playerById[id]?.name || id).split(' ');
  return parts.length > 1 ? parts.slice(1).join(' ') : parts[0];
};

export const initials = (name) =>
  name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();

export const recordLine = (w, l, h) => `${w}–${l}–${h}`;

export const outcomeLabel = (o) => (o === 'win' ? 'W' : o === 'loss' ? 'L' : 'H');

export const pctText = (n) => `${Number.isInteger(n) ? n : n.toFixed(1)}%`;

export const dateRange = (start, end) => {
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end + 'T00:00:00');
  const mon = (d) => d.toLocaleDateString('en-US', { month: 'long' });
  const y = e.getFullYear();
  if (s.getMonth() === e.getMonth())
    return `${mon(s)} ${s.getDate()}–${e.getDate()}, ${y}`;
  return `${mon(s)} ${s.getDate()} – ${mon(e)} ${e.getDate()}, ${y}`;
};

export const num = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
