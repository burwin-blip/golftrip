// ---------------------------------------------------------------------------
// RSVP — the server logic behind /api/rsvp and /api/rsvp-admin. Kept free of
// Astro so it can be exercised directly by scripts/test-rsvp.mjs.
//
// Privacy split (the public repo + no-login site make this non-negotiable):
//   PUBLIC  — name, RSVP status, handicap, strongest/weakest part, the sentence.
//             These reach the static site at build time (scripts/pull-rsvp.mjs).
//   PRIVATE — date of birth, captain vote, team-name suggestion, green fee (Q8),
//             side-games (Q9). Only ever returned by the key-protected admin API.
// ---------------------------------------------------------------------------
import staticPlayers from '../../data/players.json';
import * as store from './rsvp-store.js';
import {
  RSVP_TOURNAMENT_ID as TID, RSVP_STATUSES, GAME_PARTS, GREEN_FEE_ANSWERS,
  SIDE_GAME_ANSWERS, LIMITS, slugify, tidyName,
} from './rsvp-shared.js';

export class RsvpError extends Error {
  constructor(message, field = null, status = 400) { super(message); this.field = field; this.status = status; }
}

const isoDate = (d) => d.toISOString().slice(0, 10);

// Every player the RSVP knows about: the hand-maintained players.json roster
// plus anyone created through "I'm not listed".
async function allKnownPlayers(env) {
  const created = await store.listNewPlayers(env);
  const byId = new Map(staticPlayers.map((p) => [p.id, { id: p.id, name: p.name, confirmedFor: p.confirmedFor || [], created: false }]));
  for (const p of Object.values(created)) if (!byId.has(p.id)) byId.set(p.id, { id: p.id, name: p.name, confirmedFor: [], created: true, createdAt: p.createdAt });
  return byId;
}

// A player's effective 2027 status: their RSVP if they've sent one, otherwise
// "yes" when they were confirmed by hand in players.json, otherwise none.
const effectiveStatus = (p, event) => event[p.id]?.status ?? (p.confirmedFor.includes(TID) ? 'yes' : null);

export function countConfirmed(known, event) {
  let n = 0;
  for (const p of known.values()) if (effectiveStatus(p, event) === 'yes') n++;
  return n;
}

// ---- validation -------------------------------------------------------------
function parseHandicap(raw) {
  if (raw === null || raw === undefined || String(raw).trim() === '') throw new RsvpError('Enter your current handicap.', 'handicap');
  let s = String(raw).trim().replace(',', '.');
  // A plus handicap ("+1.2") is stored the GHIN way, as a negative index.
  const plus = s.startsWith('+');
  if (plus) s = s.slice(1);
  if (!/^\d{1,2}(\.\d+)?$/.test(s)) throw new RsvpError('Handicap must be a number like 12.4.', 'handicap');
  const n = Math.round(Number(s) * 10) / 10 * (plus ? -1 : 1);
  if (n < LIMITS.hcpMin || n > LIMITS.hcpMax) throw new RsvpError(`Handicap must be between +${-LIMITS.hcpMin} and ${LIMITS.hcpMax}.`, 'handicap');
  return n;
}

function parseDob(raw, now) {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(Date.parse(raw))) throw new RsvpError('Enter your date of birth.', 'dob');
  const [y] = raw.split('-').map(Number);
  if (y < 1920 || raw > isoDate(new Date(now.getTime() - 12 * 365.25 * 86400000))) throw new RsvpError('That date of birth doesn’t look right.', 'dob');
  return raw;
}

const optText = (raw, max, field, label) => {
  const s = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (s.length > max) throw new RsvpError(`${label} must be ${max} characters or fewer.`, field);
  return s || null;
};

const oneOf = (raw, allowed, field, msg) => {
  if (!allowed.includes(raw)) throw new RsvpError(msg, field);
  return raw;
};

// ---- identity ---------------------------------------------------------------
// Resolve who's answering. Duplicate prevention lives here: a picked id must
// exist, and a typed name that matches anyone already known (same slug, i.e.
// same name give or take case/accents/punctuation) attaches to THAT player
// rather than creating a second record.
async function resolvePlayer(body, known, now) {
  if (body.playerId) {
    const p = known.get(String(body.playerId));
    if (!p) throw new RsvpError('We couldn’t find that player — go back and pick again.', 'playerId');
    return { player: p, isNew: false };
  }
  const name = tidyName(body.newName);
  if (!name) throw new RsvpError('Enter your full name.', 'newName');
  if (name.length > LIMITS.name) throw new RsvpError(`Name must be ${LIMITS.name} characters or fewer.`, 'newName');
  if (name.split(' ').length < 2) throw new RsvpError('Enter your first and last name.', 'newName');
  const id = slugify(name);
  if (!id) throw new RsvpError('Enter your full name using letters.', 'newName');
  const existing = known.get(id);
  if (existing) return { player: existing, isNew: false, matchedExisting: true };
  const player = { id, name, confirmedFor: [], created: true, createdAt: now.toISOString() };
  return { player, isNew: true };
}

// The public-facing slice of a player's RSVP — used to decide whether the
// static site needs a rebuild after a submission.
const publicFingerprint = (name, profile, event) => JSON.stringify([
  name, event?.status, event?.handicapEntering, profile?.strength, profile?.weakness, profile?.sentence,
  (profile?.handicapHistory || []).length,
]);

async function triggerRebuild(env) {
  const hook = env.RSVP_DEPLOY_HOOK_URL;
  if (!hook) return 'no-hook';
  try {
    const res = await fetch(hook, { method: 'POST', signal: AbortSignal.timeout(4000) });
    return res.ok ? 'triggered' : `hook-http-${res.status}`;
  } catch (e) {
    console.error('RSVP: deploy hook failed', e);
    return 'hook-failed';
  }
}

// ---- POST /api/rsvp ---------------------------------------------------------
export async function submitRsvp(body, { env = process.env, now = new Date() } = {}) {
  if (!body || typeof body !== 'object') throw new RsvpError('Bad request.');
  const known = await allKnownPlayers(env);
  const { player, isNew, matchedExisting } = await resolvePlayer(body, known, now);

  const status = oneOf(body.status, RSVP_STATUSES, 'status', 'Choose Yes, No or Maybe.');
  const dob = parseDob(body.dob, now);
  const handicap = parseHandicap(body.handicap);
  const strength = oneOf(body.strength, GAME_PARTS, 'strength', 'Pick the strongest part of your game.');
  const weakness = oneOf(body.weakness, GAME_PARTS, 'weakness', 'Pick the weakest part of your game.');
  if (strength === weakness) throw new RsvpError('Your strongest and weakest can’t be the same thing.', 'weakness');
  const sentence = optText(body.sentence, LIMITS.sentence, 'sentence', 'Your one-sentence description');

  // Q6–Q9 are only asked of people who might come; a NO skips them.
  let captainVoteId = null, teamName = null, greenFee = null, longestDrive = null;
  if (status !== 'no') {
    const { event: evNow } = await store.loadAll(TID, env);
    const nominee = known.get(String(body.captainVoteId || ''));
    if (!nominee || effectiveStatus(nominee, evNow) === 'no') throw new RsvpError('Pick who you’d nominate as a captain.', 'captainVoteId');
    captainVoteId = nominee.id;
    teamName = optText(body.teamName, LIMITS.teamName, 'teamName', 'Team name');
    greenFee = oneOf(body.greenFee, Object.keys(GREEN_FEE_ANSWERS), 'greenFee', 'Answer the green-fee question.');
    longestDrive = oneOf(body.longestDrive, Object.keys(SIDE_GAME_ANSWERS), 'longestDrive', 'Answer the longest-drive question.');
  }

  const prev = await store.loadOne(TID, player.id, env);
  const prevFp = publicFingerprint(player.name, prev.profile, prev.event);
  const at = now.toISOString();

  // PERMANENT player data. Handicap history is append-only: a new entry each
  // time the submitted number differs from the last one, so nothing is lost.
  const history = [...(prev.profile?.handicapHistory || [])];
  if (!history.length || history[history.length - 1].index !== handicap) history.push({ at, index: handicap, source: 'rsvp' });
  const profile = { ...(prev.profile || {}), dob, strength, weakness, sentence, handicapHistory: history, updatedAt: at };

  // 2027 EVENT data — one record per player, overwritten on re-submission.
  const statusHistory = [...(prev.event?.statusHistory || [])];
  if (!statusHistory.length || statusHistory[statusHistory.length - 1].status !== status) statusHistory.push({ at, status });
  const event = {
    status, handicapEntering: handicap, captainVoteId, teamName, greenFee, longestDrive,
    submittedAt: at, firstSubmittedAt: prev.event?.firstSubmittedAt ?? at,
    submissions: (prev.event?.submissions || 0) + 1, statusHistory,
  };

  if (isNew) await store.putPlayer({ id: player.id, name: player.name, createdAt: player.createdAt }, env);
  await store.putProfile(player.id, profile, env);
  await store.putEvent(TID, player.id, event, env);

  const changedPublic = isNew || prevFp !== publicFingerprint(player.name, profile, event);
  const rebuild = changedPublic ? await triggerRebuild(env) : 'unchanged';

  if (isNew) known.set(player.id, player);
  const { event: evAll } = await store.loadAll(TID, env);
  return {
    ok: true, playerId: player.id, name: player.name, status, isNew, matchedExisting: Boolean(matchedExisting),
    updated: Boolean(prev.event), confirmedCount: countConfirmed(known, evAll), rebuild,
  };
}

// ---- GET /api/rsvp ----------------------------------------------------------
// No player: the players created since the last build (so a brand-new name can
// find themselves again straight away) + the live confirmed count.
// ?player=<id>: that player's PUBLIC answers, for pre-filling a re-submission.
export async function readRsvp(playerId, { env = process.env } = {}) {
  const known = await allKnownPlayers(env);
  const { event, profiles } = await store.loadAll(TID, env);
  const out = {
    ok: true,
    confirmedCount: countConfirmed(known, event),
    createdPlayers: [...known.values()].filter((p) => p.created).map(({ id, name }) => ({ id, name })),
  };
  if (playerId) {
    const p = known.get(String(playerId));
    if (!p) throw new RsvpError('Unknown player.', 'playerId', 404);
    const pr = profiles[p.id] || {};
    const hist = pr.handicapHistory || [];
    out.player = {
      id: p.id, name: p.name,
      status: event[p.id]?.status ?? null,
      handicap: hist.length ? hist[hist.length - 1].index : null,
      strength: pr.strength ?? null, weakness: pr.weakness ?? null, sentence: pr.sentence ?? null,
    };
  }
  return out;
}

// ---- GET /api/rsvp-admin ----------------------------------------------------
function keyMatches(given, expected) {
  if (!expected || typeof given !== 'string' || given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export async function readAdmin(key, { env = process.env } = {}) {
  if (!env.RSVP_ADMIN_KEY) throw new RsvpError('Admin key not set up yet (RSVP_ADMIN_KEY).', null, 503);
  if (!keyMatches(key, env.RSVP_ADMIN_KEY)) throw new RsvpError('Wrong or missing admin key.', null, 401);
  const known = await allKnownPlayers(env);
  const { event, profiles, backend } = await store.loadAll(TID, env);
  const nameOf = (id) => known.get(id)?.name ?? id;

  const rows = [...known.values()].map((p) => {
    const e = event[p.id] || null;
    const pr = profiles[p.id] || null;
    return {
      id: p.id, name: p.name, created: p.created, createdAt: p.createdAt ?? null,
      handConfirmed: p.confirmedFor.includes(TID),
      status: e?.status ?? null, effectiveStatus: effectiveStatus(p, event),
      submittedAt: e?.submittedAt ?? null, firstSubmittedAt: e?.firstSubmittedAt ?? null,
      submissions: e?.submissions ?? 0, statusHistory: e?.statusHistory ?? [],
      handicapEntering: e?.handicapEntering ?? null, handicapHistory: pr?.handicapHistory ?? [],
      dob: pr?.dob ?? null, strength: pr?.strength ?? null, weakness: pr?.weakness ?? null, sentence: pr?.sentence ?? null,
      captainVoteId: e?.captainVoteId ?? null, captainVoteName: e?.captainVoteId ? nameOf(e.captainVoteId) : null,
      teamName: e?.teamName ?? null, greenFee: e?.greenFee ?? null, longestDrive: e?.longestDrive ?? null,
    };
  });

  // Captain tallies, each with the team names suggested for that captain.
  const captains = new Map();
  for (const r of rows) {
    if (!r.captainVoteId || r.status === 'no') continue;
    const c = captains.get(r.captainVoteId) || { id: r.captainVoteId, name: r.captainVoteName, votes: 0, voters: [], teamNames: [] };
    c.votes++; c.voters.push(r.name);
    if (r.teamName) c.teamNames.push({ name: r.teamName, by: r.name });
    captains.set(r.captainVoteId, c);
  }
  const tally = (field, answers) => {
    const counts = Object.fromEntries(Object.keys(answers).map((k) => [k, 0]));
    for (const r of rows) if (r.status && r.status !== 'no' && r[field] in counts) counts[r[field]]++;
    return Object.entries(answers).map(([k, label]) => ({ key: k, label, count: counts[k] }));
  };

  return {
    ok: true, tournamentId: TID, backend, generatedAt: new Date().toISOString(),
    counts: {
      yes: rows.filter((r) => r.effectiveStatus === 'yes').length,
      maybe: rows.filter((r) => r.effectiveStatus === 'maybe').length,
      no: rows.filter((r) => r.effectiveStatus === 'no').length,
      waiting: rows.filter((r) => !r.status).length,
      total: rows.length,
    },
    rows,
    captains: [...captains.values()].sort((a, b) => b.votes - a.votes || a.name.localeCompare(b.name)),
    greenFee: tally('greenFee', GREEN_FEE_ANSWERS),
    longestDrive: tally('longestDrive', SIDE_GAME_ANSWERS),
  };
}
