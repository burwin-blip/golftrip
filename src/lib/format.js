// Presentation helpers. No stats here — display formatting only.
import { playerById } from './data.js';

export const firstName = (id) => (playerById[id]?.name || id).split(' ')[0];
export const fullName = (id) => playerById[id]?.name || id;

// Last name, but keep single-token names (no surname on file) intact.
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

// Weekday off a date string — always derived, never hand-typed, so an itinerary
// can't drift out of step with its own dates. Parsed as LOCAL midnight (not UTC)
// so the day named is the day written.
// "2027-03-25" -> "Thursday" / "Thu"
export const weekday = (iso, style = 'long') => {
  if (!iso) return '';
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { weekday: style });
};

// "2027-03-25" -> "25 March" (no year — for a day inside a known trip)
export const dayMonth = (iso) => {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return `${d.getDate()} ${d.toLocaleDateString('en-US', { month: 'long' })}`;
};

// "2026-03-13" -> "March 13, 2026"
export const longDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
};
