// ---------------------------------------------------------------------------
// End-to-end checks for the RSVP API. Run against a local dev server that uses
// a throwaway file store (never production):
//
//   RSVP_LOCAL_STORE=/tmp/rsvp-test.json RSVP_ADMIN_KEY=test-key npx astro dev --port 4400
//   STORE=/tmp/rsvp-test.json BASE=http://localhost:4400 ADMIN_KEY=test-key npm run test:rsvp
//
// Covers: existing-player RSVP, new-player RSVP, changing an RSVP, duplicate
// prevention (by id and by typed name), one-or-two captains stored by id with a
// team name each, multi-select strengths/weaknesses, handicap history, the
// migration of responses saved in the old single-select format, private fields
// kept out of the public GET, validation.
// ---------------------------------------------------------------------------
import fs from 'node:fs';

const BASE = process.env.BASE || 'http://localhost:4400';
const ADMIN_KEY = process.env.ADMIN_KEY || 'test-key';
const STORE = process.env.STORE || null;   // the dev server's RSVP_LOCAL_STORE, for the migration test

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log('  ✓', msg); } else { fail++; console.log('  ✗', msg); } };

const post = async (body) => {
  const r = await fetch(`${BASE}/api/rsvp`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
};
const get = async (q = '') => (await fetch(`${BASE}/api/rsvp${q}`)).json();
const admin = async (key = ADMIN_KEY) => {
  const r = await fetch(`${BASE}/api/rsvp-admin`, { headers: { 'x-admin-key': key } });
  return { status: r.status, body: await r.json() };
};
const row = (a, id) => a.body.rows.find((x) => x.id === id);

const base = {
  status: 'yes', dob: '1990-05-17', handicap: '7.2',
  strengths: ['Putting', 'Scrambling'], weaknesses: ['Long Irons'], sentence: 'Grinds it round.',
  captainVoteIds: ['tom-brunskill'], teamNames: { 'tom-brunskill': 'The Sand Wedgies' }, greenFee: 'yes', longestDrive: 'yes',
};

console.log('\n1. Existing player RSVP');
let r = await post({ ...base, playerId: 'ben-urwin' });
ok(r.status === 200 && r.body.ok, 'Ben Urwin submits YES');
ok(r.body.playerId === 'ben-urwin' && r.body.isNew === false, 'attached to the existing ben-urwin record');
ok(typeof r.body.confirmedCount === 'number' && r.body.confirmedCount >= 1, `live confirmed count returned (${r.body.confirmedCount})`);

console.log('\n2. New player RSVP');
r = await post({ ...base, newName: 'jack  mcTest', status: 'maybe', handicap: '18', captainVoteIds: ['ben-urwin'], teamNames: {} });
ok(r.status === 200 && r.body.isNew === true, 'new player created');
ok(r.body.playerId === 'jack-mctest' && r.body.name === 'Jack McTest', `kebab-case id, tidied name (${r.body.playerId}, "${r.body.name}")`);
let g = await get();
ok(g.createdPlayers.some((p) => p.id === 'jack-mctest'), 'new player is immediately pickable from the API');

console.log('\n3. Duplicate prevention');
r = await post({ ...base, newName: 'Jack McTest', handicap: '17.5', captainVoteIds: ['ben-urwin'], teamNames: {} });
ok(r.body.playerId === 'jack-mctest' && r.body.isNew === false, 'typing the same name again attaches to the same player');
r = await post({ ...base, newName: 'ben urwin' });
ok(r.body.playerId === 'ben-urwin' && r.body.isNew === false, 'typing an existing player’s name attaches to them (no duplicate Ben)');
let a = await admin();
ok(a.body.rows.filter((x) => x.id === 'jack-mctest').length === 1, 'exactly one Jack McTest record');
ok(a.body.rows.filter((x) => x.id === 'ben-urwin').length === 1, 'exactly one Ben Urwin record');
ok(row(a, 'jack-mctest').submissions === 2, 'second submission updated the response (submissions = 2), no new row');

console.log('\n4. Changing an RSVP');
const before = a.body.counts.yes;
r = await post({ ...base, playerId: 'ben-urwin', status: 'no' });
ok(r.body.updated === true && r.body.status === 'no', 'Ben changes YES → NO');
a = await admin();
ok(row(a, 'ben-urwin').status === 'no' && a.body.counts.yes === before - 1, 'status updated and confirmed count dropped by one');
ok(row(a, 'ben-urwin').captainVotes.length === 0 && row(a, 'ben-urwin').greenFee === null, 'a NO carries no captain votes / Q8 / Q9');
ok(row(a, 'ben-urwin').statusHistory.map((s) => s.status).join('>') === 'yes>no', 'status history kept (yes > no)');
r = await post({ ...base, playerId: 'ben-urwin', status: 'yes', handicap: '6.8' });
a = await admin();
ok(row(a, 'ben-urwin').status === 'yes', 'Ben changes back to YES');

console.log('\n5. Captains — one or two, stored by id, a team name each');
ok(JSON.stringify(row(a, 'jack-mctest').captainVotes.map((v) => v.id)) === '["ben-urwin"]', 'single captain stored as a player id');
r = await post({ ...base, playerId: 'tom-brunskill', captainVoteIds: ['ben-urwin', 'michael-herring'],
  teamNames: { 'ben-urwin': 'Urwin’s Irons', 'michael-herring': 'Herring Bone', 'alan-lozer': 'not a pick' } });
ok(r.status === 200, 'Tom nominates two captains');
a = await admin();
const tom = row(a, 'tom-brunskill');
ok(JSON.stringify(tom.captainVotes) === JSON.stringify([
  { id: 'ben-urwin', name: 'Ben Urwin', teamName: 'Urwin’s Irons' },
  { id: 'michael-herring', name: 'Michael Herring', teamName: 'Herring Bone' },
]), 'both stored by id, each with its own team name (a name for a non-pick is dropped)');
const benCap = a.body.captains.find((c) => c.id === 'ben-urwin');
ok(benCap.votes === 2 && benCap.voters.includes('Tom Brunskill') && benCap.voters.includes('Jack McTest'), 'each nomination is one vote (Ben: Jack + Tom = 2)');
ok(a.body.captains.find((c) => c.id === 'michael-herring')?.teamNames.some((t) => t.name === 'Herring Bone' && t.by === 'Tom Brunskill'), 'team name filed under that specific captain, with who suggested it');
r = await post({ ...base, playerId: 'tom-brunskill', captainVoteIds: ['ben-urwin', 'ben-urwin'] });
a = await admin();
ok(r.status === 200 && row(a, 'tom-brunskill').captainVotes.length === 1, 'the same captain twice counts once');
ok((await post({ ...base, playerId: 'tom-brunskill', captainVoteIds: ['ben-urwin', 'michael-herring', 'alan-lozer'] })).status === 400, 'three captains rejected');
ok((await post({ ...base, playerId: 'tom-brunskill', captainVoteIds: [] })).status === 400, 'no captain rejected');
r = await post({ ...base, playerId: 'tom-brunskill', captainVoteIds: ['Ben Urwin'] });
ok(r.status === 400 && r.body.field === 'captainVoteIds', 'free-text captain name rejected');

console.log('\n6. Strengths & weaknesses — multi-select lists');
ok(JSON.stringify(row(a, 'ben-urwin').strengths) === '["Putting","Scrambling"]', 'two strengths stored as a list');
ok((await post({ ...base, playerId: 'ben-urwin', strengths: [] })).status === 400, 'no strengths rejected');
ok((await post({ ...base, playerId: 'ben-urwin', strengths: ['Putting'], weaknesses: ['Putting', 'Driving'] })).status === 400, 'a part in both lists rejected');
ok((await post({ ...base, playerId: 'ben-urwin', strengths: ['Bowling'] })).status === 400, 'unknown game part rejected');

console.log('\n7. Handicap history preserved');
const hist = row(a, 'ben-urwin').handicapHistory.map((h) => h.index);
ok(JSON.stringify(hist) === JSON.stringify([7.2, 6.8]), `every distinct handicap kept in order (${hist.join(' → ')})`);
ok(row(a, 'ben-urwin').handicapEntering === 6.8, 'handicap entering 2027 = latest (6.8)');
await post({ ...base, playerId: 'scott-benesh', handicap: '+1.4' });
a = await admin();
ok(row(a, 'scott-benesh').handicapEntering === -1.4, 'plus handicap "+1.4" stored as -1.4');

console.log('\n8. Migration — responses saved by the old single-select form');
if (!STORE) {
  console.log('  (skipped — set STORE to the dev server’s RSVP_LOCAL_STORE)');
} else {
  const db = JSON.parse(fs.readFileSync(STORE, 'utf8'));
  db['rsvp:profiles']['miles-honens'] = { dob: '1985-01-01', strength: 'Driving', weakness: 'Putting', sentence: 'Old form.',
    handicapHistory: [{ at: '2026-09-18T20:00:00.000Z', index: 14, source: 'rsvp' }], updatedAt: '2026-09-18T20:00:00.000Z' };
  db['rsvp:event:duel-in-the-desert-2027']['miles-honens'] = { status: 'yes', handicapEntering: 14, captainVoteId: 'alan-lozer',
    teamName: 'Lozer’s Losers', greenFee: 'no', longestDrive: 'yes', submittedAt: '2026-09-18T20:00:00.000Z',
    firstSubmittedAt: '2026-09-18T20:00:00.000Z', submissions: 1, statusHistory: [{ at: '2026-09-18T20:00:00.000Z', status: 'yes' }] };
  fs.writeFileSync(STORE, JSON.stringify(db));
  a = await admin();
  const miles = row(a, 'miles-honens');
  ok(JSON.stringify(miles.strengths) === '["Driving"]' && JSON.stringify(miles.weaknesses) === '["Putting"]', 'old single strength / weakness read as one-item lists');
  ok(JSON.stringify(miles.captainVotes) === JSON.stringify([{ id: 'alan-lozer', name: 'Alan Lozer', teamName: 'Lozer’s Losers' }]), 'old single captain + team name read as one captain with its name');
  ok(a.body.captains.find((c) => c.id === 'alan-lozer')?.votes === 1, 'old vote still counted in the tallies');
  g = await get('?player=miles-honens');
  ok(JSON.stringify(g.player.strengths) === '["Driving"]', 'pre-fill returns the old answer as a list');
  await post({ ...base, playerId: 'miles-honens', handicap: '14', captainVoteIds: ['alan-lozer', 'ben-urwin'], teamNames: { 'alan-lozer': 'Lozer’s Losers' } });
  const saved = JSON.parse(fs.readFileSync(STORE, 'utf8'));
  const [p2, e2] = [saved['rsvp:profiles']['miles-honens'], saved['rsvp:event:duel-in-the-desert-2027']['miles-honens']];
  ok(!('strength' in p2) && !('captainVoteId' in e2) && !('teamName' in e2), 're-submitting rewrites the record in the new format (old fields gone)');
  ok(p2.handicapHistory.length === 1 && e2.firstSubmittedAt === '2026-09-18T20:00:00.000Z' && e2.submissions === 2, 'history and first-reply time carried over');
}

console.log('\n9. Privacy');
g = await get('?player=ben-urwin');
ok(g.player && g.player.handicap === 6.8 && g.player.strengths.includes('Putting'), 'public GET pre-fills handicap / strengths');
const leaked = ['dob', 'captainVoteIds', 'captainVoteId', 'teamNames', 'teamName', 'greenFee', 'longestDrive'].filter((k) => k in g.player);
ok(leaked.length === 0, `public GET exposes no private fields${leaked.length ? ' (leaked: ' + leaked + ')' : ''}`);
ok(!JSON.stringify(g).includes('1990-05-17') && !JSON.stringify(await get()).includes('Sand Wedgies'), 'no DOB or team names anywhere in the public responses');
ok((await admin('wrong')).status === 401, 'admin API refuses a wrong key');
ok((await admin('')).status === 401, 'admin API refuses no key');

console.log('\n10. Validation');
ok((await post({ ...base, playerId: 'ben-urwin', status: 'perhaps' })).status === 400, 'bad status rejected');
ok((await post({ ...base, playerId: 'ben-urwin', handicap: 'ten' })).status === 400, 'non-numeric handicap rejected');
ok((await post({ ...base, newName: 'Cher' })).status === 400, 'single-word name rejected');
ok((await post({ ...base, playerId: 'ben-urwin', dob: '2030-01-01' })).status === 400, 'future date of birth rejected');

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
