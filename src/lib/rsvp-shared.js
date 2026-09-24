// ---------------------------------------------------------------------------
// RSVP — the constants shared by the /rsvp form, the API and the build.
// One list of answers in one place, so the form, the validator and the admin
// tallies can never disagree about what a valid answer is.
// ---------------------------------------------------------------------------

export const RSVP_TOURNAMENT_ID = 'duel-in-the-desert-2027';

export const RSVP_STATUSES = ['yes', 'no', 'maybe'];

// Q3 / Q4 — strongest and weakest part of your game (single select each).
export const GAME_PARTS = [
  'Driving',
  'Accuracy off the tee',
  'Long Irons',
  'Mid Irons',
  'Chipping',
  'Putting',
  'Match Play',
  'Mental Game',
  'Scrambling',
];

// Q8 — the $250 green fee for one or two rounds.
export const GREEN_FEE_ANSWERS = { yes: 'Yes', no: 'No', dontcare: "Don't care about pricing" };
// Q9 — longest drive / closest to the pin for team points.
export const SIDE_GAME_ANSWERS = { yes: 'Yes', no: 'No' };

// Captains are unlimited (owner's call, Sept 2026): `maxNominations` / `maxWriteIns`
// are only sanity caps against a garbage request, far above any real answer.
export const LIMITS = { name: 60, sentence: 280, teamName: 60, hcpMin: -10, hcpMax: 54, maxNominations: 40, maxWriteIns: 10 };

// ---- format migration -------------------------------------------------------
// The first version of the form stored ONE strongest / weakest part and ONE
// captain (+ one team name). The current form stores lists. These read either
// shape and always return the current one, so responses sent under the old
// form are never lost — they read as single-item lists / a single captain.
const list = (many, one) => (Array.isArray(many) ? many : one ? [one] : []);

export function normalizeProfile(pr) {
  if (!pr) return null;
  const { strength, weakness, ...rest } = pr;
  return { ...rest, strengths: list(pr.strengths, strength), weaknesses: list(pr.weaknesses, weakness) };
}

export function normalizeEvent(e) {
  if (!e) return null;
  const { captainVoteId, teamName, ...rest } = e;
  const captainVoteIds = list(e.captainVoteIds, captainVoteId);
  const teamNames = e.teamNames && typeof e.teamNames === 'object'
    ? e.teamNames
    : (captainVoteId && teamName ? { [captainVoteId]: teamName } : {});
  // write-in nominations ({ name, teamName }) arrived with unlimited captains;
  // every older record simply has none
  const captainWriteIns = Array.isArray(e.captainWriteIns) ? e.captainWriteIns.filter((w) => w && w.name) : [];
  return { ...rest, captainVoteIds, teamNames, captainWriteIns };
}

// ---- write-in captains: match a typed name to a player ----------------------
// Used when a write-in arrives (a clean match is stored as a vote for that
// player's id) AND every time the admin tally is built (so a write-in for
// "Harry" merges into Harry's tally by itself once Harry joins via the RSVP).
//   match     — one clear player: same full name, or a single first name that
//               only one player has ("Tom" → Tom Brunskill)
//   ambiguous — a first name that several players share ("Jack" with two Jacks)
//   possible  — same first name as someone, different surname ("Tom Smith" vs
//               Tom Brunskill), or a lone surname ("Urwin"): might be them, might
//               be a new bloke, so it is flagged and never merged by itself
//   none      — nobody like them yet: stays a text write-in
export const nameKey = (s) =>
  String(s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/['’.]/g, '').replace(/[^a-z]+/g, ' ').trim();

export function matchPlayerName(typed, players) {
  const k = nameKey(typed);
  if (!k) return { kind: 'none', ids: [] };
  const full = players.filter((p) => nameKey(p.name) === k);
  if (full.length === 1) return { kind: 'match', ids: [full[0].id] };
  if (full.length > 1) return { kind: 'ambiguous', ids: full.map((p) => p.id) };
  const words = k.split(' ');
  const first = players.filter((p) => nameKey(p.name).split(' ')[0] === words[0]);
  if (words.length === 1) {
    if (first.length === 1) return { kind: 'match', ids: [first[0].id] };
    if (first.length > 1) return { kind: 'ambiguous', ids: first.map((p) => p.id) };
    // a lone surname ("Urwin") is a lead, not a match — flag it
    const last = players.filter((p) => { const w = nameKey(p.name).split(' '); return w.length > 1 && w[w.length - 1] === words[0]; });
    return last.length ? { kind: 'possible', ids: last.map((p) => p.id) } : { kind: 'none', ids: [] };
  }
  return first.length ? { kind: 'possible', ids: first.map((p) => p.id) } : { kind: 'none', ids: [] };
}

// Same rule as every other id on the site: kebab-case off the name.
export const slugify = (s) =>
  String(s)
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// Tidy a typed name: collapse spaces; all-one-case input ("jack smith" /
// "JACK SMITH") is title-cased, otherwise each word just gets a capital first
// letter so deliberate casing ("McTest", "de Villiers" → "De Villiers") survives.
export function tidyName(raw) {
  let s = String(raw || '').replace(/\s+/g, ' ').trim();
  if (s === s.toUpperCase()) s = s.toLowerCase();
  return s.replace(/(^|[\s'-])(\p{Ll})/gu, (_, a, b) => a + b.toUpperCase());
}
