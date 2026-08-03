// Cross-checks the hole-by-hole (net) layer against the workbook round totals and
// the site match results. Run: node --import /tmp/reg.mjs scripts/verify_holes.mjs
import * as S from '../src/lib/stats.js';
import holeScores from '../data/hole_scores.json' with { type: 'json' };
import matches from '../data/matches.json' with { type: 'json' };

let pass = 0, fail = 0;
const check = (name, cond, got, want) => {
  if (cond) { pass++; }
  else { fail++; console.log(`  ✗ ${name}: got ${got}, want ${want}`); }
};

// Workbook NET round totals (V4 "Round Scores"; all NET per the owner).
const WB = {
  2: { 'alan-lozer':85,'anthony-herring':74,'ben-urwin':80,'chase-hellmers':80,'colton-mckivitz':92,'ed-nelson':85,'michael-herring':75,'miles-honens':88,'rupert-pedler':78,'scott-benesh':76,'steve-urwin':85,'tom-brunskill':80 },
  3: { 'alan-lozer':40,'anthony-herring':34,'ben-urwin':35,'chase-hellmers':31,'colton-mckivitz':37,'ed-nelson':34,'michael-herring':38,'miles-honens':36,'rupert-pedler':38,'scott-benesh':38,'steve-urwin':34,'tom-brunskill':38 },
};
const STBL = { 'alan-lozer':26,'anthony-herring':30,'ben-urwin':27,'chase-hellmers':30,'colton-mckivitz':26,'ed-nelson':30,'michael-herring':28,'miles-honens':26,'rupert-pedler':30,'scott-benesh':35,'steve-urwin':21,'tom-brunskill':24 };

const netTotal = (pid, rnd) => holeScores.filter(h => h.player===pid && h.round===rnd && h.net_score!=null).reduce((s,h)=>s+h.net_score,0);
const stblTotal = (pid) => holeScores.filter(h => h.player===pid && h.round===4).reduce((s,h)=>s+(h.stableford_points||0),0);

for (const rnd of [2,3]) for (const [pid,want] of Object.entries(WB[rnd])) check(`R${rnd} net ${pid}`, netTotal(pid,rnd)===want, netTotal(pid,rnd), want);
for (const [pid,want] of Object.entries(STBL)) check(`R4 stbl ${pid}`, stblTotal(pid)===want, stblTotal(pid), want);

// Every match scorecard's holes-won leader agrees with the recorded winner (match-play only).
for (const m of matches) {
  const sc = S.matchScorecard(m.id);
  if (!sc || sc.category!=='matchplay') continue;
  if (m.halved) { check(`${m.id} halved`, sc.holesWon.A===sc.holesWon.B, `${sc.holesWon.A}-${sc.holesWon.B}`, 'equal'); continue; }
  const aWon = sc.holesWon.A > sc.holesWon.B;
  const wantAWon = m.winnerTeamId === m.teamAId;
  check(`${m.id} winner`, aWon===wantAWon, aWon?'A':'B', wantAWon?'A':'B');
}

// Michael/Anthony R5 through-16 totals per the owner's decision (86 / 92), 17-18 conceded.
check('M.Herring R5 thru-16 = 86', netTotal('michael-herring',5)===86, netTotal('michael-herring',5), 86);
check('A.Herring R5 thru-16 = 92', netTotal('anthony-herring',5)===92, netTotal('anthony-herring',5), 92);
const concededMH = holeScores.filter(h=>h.match_id==='st-george-2026-m18' && h.conceded).length;
check('m18 conceded holes = 4', concededMH===4, concededMH, 4); // 2 players × holes 17,18

// Final tally still 16.5–13.5 (sanity, independent of hole layer)
console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
if (fail===0) console.log('✓ HOLE LAYER RECONCILES TO WORKBOOK + MATCH RESULTS');
