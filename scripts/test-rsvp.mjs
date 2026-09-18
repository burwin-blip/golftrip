// ---------------------------------------------------------------------------
// End-to-end checks for the RSVP API. Run against a local dev server that uses
// a throwaway file store (never production):
//
//   RSVP_LOCAL_STORE=/tmp/rsvp-test.json RSVP_ADMIN_KEY=test-key npx astro dev --port 4400
//   BASE=http://localhost:4400 ADMIN_KEY=test-key node scripts/test-rsvp.mjs
//
// Covers: existing-player RSVP, new-player RSVP, changing an RSVP, duplicate
// prevention (by id and by typed name), captain vote stored by id, handicap
// history preserved, private fields kept out of the public GET, validation.
// ---------------------------------------------------------------------------
const BASE = process.env.BASE || 'http://localhost:4400';
const ADMIN_KEY = process.env.ADMIN_KEY || 'test-key';

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

const base = {
  status: 'yes', dob: '1990-05-17', handicap: '7.2',
  strength: 'Putting', weakness: 'Long Irons', sentence: 'Grinds it round.',
  captainVoteId: 'tom-brunskill', teamName: 'The Sand Wedgies', greenFee: 'yes', longestDrive: 'yes',
};

console.log('\n1. Existing player RSVP');
let r = await post({ ...base, playerId: 'ben-urwin' });
ok(r.status === 200 && r.body.ok, 'Ben Urwin submits YES');
ok(r.body.playerId === 'ben-urwin' && r.body.isNew === false, 'attached to the existing ben-urwin record');
const count1 = r.body.confirmedCount;
ok(typeof count1 === 'number' && count1 >= 1, `live confirmed count returned (${count1})`);

console.log('\n2. New player RSVP');
r = await post({ ...base, newName: 'jack  mcTest', status: 'maybe', handicap: '18', captainVoteId: 'ben-urwin' });
ok(r.status === 200 && r.body.isNew === true, 'new player created');
ok(r.body.playerId === 'jack-mctest', `kebab-case id (${r.body.playerId})`);
let g = await get();
ok(g.createdPlayers.some((p) => p.id === 'jack-mctest'), 'new player is immediately pickable from the API');

console.log('\n3. Duplicate prevention');
r = await post({ ...base, newName: 'Jack McTest', status: 'yes', handicap: '17.5', captainVoteId: 'ben-urwin' });
ok(r.body.playerId === 'jack-mctest' && r.body.isNew === false, 'typing the same name again attaches to the same player');
r = await post({ ...base, newName: 'ben urwin' });
ok(r.body.playerId === 'ben-urwin' && r.body.isNew === false, 'typing an existing player’s name attaches to them (no duplicate Ben)');
let a = await admin();
ok(a.body.rows.filter((x) => x.name.toLowerCase().replace(/\s+/g, ' ') === 'jack mctest').length === 1, 'exactly one Jack McTest record');
ok(a.body.rows.filter((x) => x.id === 'ben-urwin').length === 1, 'exactly one Ben Urwin record');
ok(a.body.rows.find((x) => x.id === 'jack-mctest').submissions === 2, 'second submission updated the response (submissions = 2), no new row');

console.log('\n4. Changing an RSVP');
const before = a.body.counts.yes;
r = await post({ ...base, playerId: 'ben-urwin', status: 'no' });
ok(r.body.updated === true && r.body.status === 'no', 'Ben changes YES → NO');
a = await admin();
const ben = a.body.rows.find((x) => x.id === 'ben-urwin');
ok(ben.status === 'no' && a.body.counts.yes === before - 1, 'status updated and confirmed count dropped by one');
ok(ben.captainVoteId === null && ben.greenFee === null, 'a NO carries no captain vote / Q8 / Q9');
ok(ben.statusHistory.map((s) => s.status).join('>') === 'yes>no', 'status history kept (yes > no)');
r = await post({ ...base, playerId: 'ben-urwin', status: 'yes', handicap: '6.8' });
a = await admin();
ok(a.body.rows.find((x) => x.id === 'ben-urwin').status === 'yes', 'Ben changes back to YES');

console.log('\n5. Captain vote stored by id');
const jack = a.body.rows.find((x) => x.id === 'jack-mctest');
ok(jack.captainVoteId === 'ben-urwin', 'vote stored as a player id ("ben-urwin")');
r = await post({ ...base, playerId: 'tom-brunskill', captainVoteId: 'Ben Urwin' });
ok(r.status === 400 && r.body.field === 'captainVoteId', 'free-text captain name is rejected');
r = await post({ ...base, playerId: 'tom-brunskill', captainVoteId: 'not-a-player' });
ok(r.status === 400, 'unknown captain id is rejected');
const benCap = a.body.captains.find((c) => c.id === 'ben-urwin');
ok(benCap && benCap.teamNames.some((t) => t.name === 'The Sand Wedgies'), 'team-name suggestion filed under the nominated captain');

console.log('\n6. Handicap history preserved');
const hist = a.body.rows.find((x) => x.id === 'ben-urwin').handicapHistory.map((h) => h.index);
ok(JSON.stringify(hist) === JSON.stringify([7.2, 6.8]), `every distinct handicap kept in order (${hist.join(' → ')})`);
ok(a.body.rows.find((x) => x.id === 'ben-urwin').handicapEntering === 6.8, 'handicap entering 2027 = latest (6.8)');
r = await post({ ...base, playerId: 'scott-benesh', handicap: '+1.4' });
a = await admin();
ok(a.body.rows.find((x) => x.id === 'scott-benesh').handicapEntering === -1.4, 'plus handicap "+1.4" stored as -1.4');

console.log('\n7. Privacy');
g = await get('?player=ben-urwin');
ok(g.player && g.player.handicap === 6.8 && g.player.strength === 'Putting', 'public GET pre-fills handicap / strengths');
const leaked = ['dob', 'captainVoteId', 'teamName', 'greenFee', 'longestDrive'].filter((k) => k in g.player);
ok(leaked.length === 0, `public GET exposes no private fields${leaked.length ? ' (leaked: ' + leaked + ')' : ''}`);
ok(!JSON.stringify(g).includes('1990-05-17'), 'date of birth appears nowhere in the public response');
ok((await admin('wrong')).status === 401, 'admin API refuses a wrong key');
ok((await admin('')).status === 401, 'admin API refuses no key');

console.log('\n8. Validation');
ok((await post({ ...base, playerId: 'ben-urwin', status: 'perhaps' })).status === 400, 'bad status rejected');
ok((await post({ ...base, playerId: 'ben-urwin', handicap: 'ten' })).status === 400, 'non-numeric handicap rejected');
ok((await post({ ...base, playerId: 'ben-urwin', strength: 'Putting', weakness: 'Putting' })).status === 400, 'same strongest/weakest rejected');
ok((await post({ ...base, playerId: 'ben-urwin', strength: 'Bowling' })).status === 400, 'unknown game part rejected');
ok((await post({ ...base, newName: 'Cher' })).status === 400, 'single-word name rejected');
ok((await post({ ...base, playerId: 'ben-urwin', dob: '2030-01-01' })).status === 400, 'future date of birth rejected');

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
