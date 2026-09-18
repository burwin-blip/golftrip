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

export const LIMITS = { name: 60, sentence: 280, teamName: 60, hcpMin: -10, hcpMax: 54 };

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
