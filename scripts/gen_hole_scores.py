#!/usr/bin/env python3
"""Build data/hole_scores.json for The Annual from the read scorecards.

SCORING BASIS (owner-confirmed, on the ground):
 - Every recorded per-hole number is a NET score. Rounds 2 (Best Ball),
   3 (Shamble) and 5 (Singles) store net scores; results (birdie/par/…) are
   NET results. Round 4 (Team Average Stableford) records net STABLEFORD points.
 - The ONE exception is Round 1 SCRAMBLE, which is a TEAM GROSS score (no
   individual attribution).
 - True gross for the individual rounds is NOT reliably recoverable, so it is
   not stored or displayed. Net is what the scorecards record.

STRICT RULES:
 - Every value was read from the reformatted scorecard PNGs. Nothing estimated.
 - Conceded holes are marked (conceded=True), never scored.
 - Anything not confidently read is left null + verification_status needs-review.

FUTURE-PROOF: add a tournament's matches to MATCHES and re-run.
"""
import json, os

OUT = os.path.join(os.path.dirname(__file__), "..", "data", "hole_scores.json")
TID = "st-george-2026"
WP, SS = "woodpeckers", "silver-spoons"

COURSES = {
  1: ("Sunbrook Golf Club (Blackrock Course)",
      [4,5,3,5,4,4,4,3,4], [17,5,15,7,13,3,1,11,9]),
  2: ("The Ledges Golf Club",
      [4,3,5,4,3,4,5,4,4, 3,5,3,4,4,4,5,4,4], [11,13,7,1,15,5,9,17,3, 16,6,18,14,12,8,2,10,4]),
  3: ("Sand Hollow Golf Resort - Links Course",
      [4,4,5,3,4,3,4,4,5], [17,13,7,11,5,15,1,9,3]),
  4: ("Sand Hollow Championship Course",
      [4,5,3,4,4,4,5,3,4, 5,3,4,4,4,3,4,5,4], [15,7,17,5,13,1,3,11,9, 10,16,2,14,4,8,18,12,6]),
  5: ("Falcon Ridge Golf Club",
      [5,3,4,4,3,4,5,3,4, 5,4,5,4,3,4,5,3,4], [16,6,12,8,14,2,18,4,10, 15,5,13,1,11,9,17,7,3]),
}

def result_label(vs):  # net (or team-gross) result from score-minus-par
    if vs <= -2: return "Eagle or Better"
    if vs == -1: return "Birdie"
    if vs == 0:  return "Par"
    if vs == 1:  return "Bogey"
    if vs == 2:  return "Double Bogey"
    return "Triple Bogey or Worse"

def stbl_result(pts):  # net result from stableford points
    if pts >= 4: return "Eagle or Better"
    if pts == 3: return "Birdie"
    if pts == 2: return "Par"
    if pts == 1: return "Bogey"
    return "Double Bogey or Worse"  # 0 points

C = None  # conceded sentinel

MATCHES = [
 # ---- ROUND 1: SCRAMBLE (TEAM GROSS — the exception) ----
 {"m":1,"round":1,"format":"Scramble","card":"03_round_1__match_3.png","team_scored":True,
  "sides":[(WP,["ben-urwin","michael-herring"],[3,5,3,4,3,3,4,4,3]),
           (SS,["alan-lozer","miles-honens"],[4,6,3,4,3,4,4,3,4])],"result":"Woodpeckers won 3&2"},
 {"m":2,"round":1,"format":"Scramble","card":"01_round_1__match_1.png","team_scored":True,
  "sides":[(WP,["tom-brunskill","rupert-pedler"],[4,6,3,5,4,4,4,5,4]),
           (SS,["steve-urwin","anthony-herring"],[4,5,4,5,3,3,5,3,4])],"result":"Silver Spoons won 2&1"},
 {"m":3,"round":1,"format":"Scramble","card":"02_round_1__match_2.png","team_scored":True,
  "sides":[(WP,["colton-mckivitz","chase-hellmers"],[5,6,4,5,4,6,4,3,5]),
           (SS,["ed-nelson","scott-benesh"],[3,3,3,5,3,4,5,3,4])],"result":"Silver Spoons won 5&3"},

 # ---- ROUND 2: BEST BALL — per-hole NET ----
 {"m":4,"round":2,"format":"Best Ball Match Play (NET)","card":"04_round_2__match_1.png",
  "players":[(WP,"colton-mckivitz",15,[5,4,5,6,3,5,6,6,6,6,6,6,4,4,4,5,6,5]),
             (WP,"tom-brunskill",16,[4,4,5,5,2,5,5,5,5,3,6,4,4,4,5,4,5,5]),
             (SS,"ed-nelson",15,[5,3,6,6,2,3,6,6,5,4,4,5,5,5,6,6,4,4]),
             (SS,"miles-honens",15,[5,3,7,3,4,4,6,6,6,5,6,6,5,5,3,6,4,4])],"result":"Woodpeckers won 4&2"},
 {"m":5,"round":2,"format":"Best Ball Match Play (NET)","card":"05_round_2__match_2.png",
  "players":[(WP,"michael-herring",13,[4,3,5,6,3,4,4,4,3,3,6,3,4,5,5,5,3,5]),
             (WP,"rupert-pedler",21,[3,4,5,6,4,5,4,3,3,4,8,3,4,7,4,4,3,4]),
             (SS,"steve-urwin",20,[4,2,7,5,4,6,4,4,6,3,6,2,6,7,5,6,3,5]),
             (SS,"scott-benesh",2,[6,3,5,3,3,4,5,4,4,4,5,3,5,4,4,6,4,4])],"result":"Match halved"},
 {"m":6,"round":2,"format":"Best Ball Match Play (NET)","card":"06_round_2__match_3.png",
  "players":[(WP,"ben-urwin",7,[6,3,5,4,4,3,5,6,4,3,3,5,4,6,6,4,5,4]),
             (WP,"chase-hellmers",22,[5,4,5,3,3,5,7,4,3,4,5,3,4,6,4,6,6,3]),
             (SS,"alan-lozer",6,[4,4,5,3,4,5,5,5,5,5,5,5,5,5,5,5,5,5]),
             (SS,"anthony-herring",13,[4,3,4,4,3,3,5,4,4,6,4,3,6,4,4,4,5,4])],"result":"Woodpeckers won 2 Up"},

 # ---- ROUND 3: SHAMBLE — per-hole NET ----
 {"m":7,"round":3,"format":"9-hole Shamble","card":"07_round_3__match_1.png",
  "players":[(WP,"ben-urwin",2,[3,6,5,4,4,3,3,4,3]),(WP,"tom-brunskill",6,[6,6,5,2,4,3,3,4,5]),
             (SS,"scott-benesh",0,[4,4,6,4,5,3,4,3,5]),(SS,"miles-honens",5,[5,5,4,3,4,3,3,4,5])],"result":"Match halved"},
 {"m":8,"round":3,"format":"9-hole Shamble","card":"08_round_3__match_2.png",
  "players":[(WP,"chase-hellmers",9,[4,3,5,3,3,2,3,3,5]),(WP,"michael-herring",4,[7,4,5,3,4,4,3,4,4]),
             (SS,"ed-nelson",5,[5,4,3,3,4,4,3,4,4]),(SS,"anthony-herring",4,[6,4,4,3,2,3,3,5,4])],"result":"Woodpeckers won 2&1"},
 {"m":9,"round":3,"format":"9-hole Shamble","card":"09_round_3__match_3.png",
  "players":[(WP,"colton-mckivitz",5,[5,6,4,4,3,4,3,4,4]),(WP,"rupert-pedler",8,[5,3,3,3,5,2,7,4,6]),
             (SS,"alan-lozer",1,[4,5,5,4,5,2,4,5,6]),(SS,"steve-urwin",8,[3,5,6,2,5,1,3,5,4])],"result":"Woodpeckers won 1 Up"},

 # ---- ROUND 4: TEAM AVERAGE STABLEFORD — net POINTS per hole ----
 {"m":11,"round":4,"format":"Team Average Stableford","card":"10_round_4__match_1.png","stableford":True,
  "players":[(WP,"tom-brunskill",14,[2,1,2,0,3,0,2,1,2,1,0,2,0,0,3,0,3,2]),
             (WP,"michael-herring",11,[0,1,1,2,1,2,3,2,1,2,1,2,1,3,1,2,0,3]),
             (SS,"anthony-herring",11,[1,2,0,1,0,1,3,2,3,3,0,3,1,2,1,2,4,1]),
             (SS,"miles-honens",13,[1,3,1,2,2,2,1,0,1,1,1,1,0,2,2,3,2,1])],"result":"Silver Spoons won 28-26"},
 {"m":10,"round":4,"format":"Team Average Stableford","card":"11_round_4__match_2.png","stableford":True,
  "players":[(WP,"ben-urwin",6,[0,2,2,0,0,2,3,0,3,1,2,3,2,2,0,2,0,3]),
             (WP,"colton-mckivitz",13,[2,2,0,2,2,1,3,3,2,2,1,2,1,1,0,0,2,0]),
             (SS,"steve-urwin",18,[2,0,0,0,1,1,1,2,3,1,1,0,2,0,2,1,2,2]),
             (SS,"ed-nelson",13,[0,0,0,1,2,2,0,3,4,0,1,3,2,2,3,2,3,2])],"result":"Woodpeckers won 26.5-25.5"},
 {"m":12,"round":4,"format":"Team Average Stableford","card":"12_round_4__match_3.png","stableford":True,
  "players":[(WP,"chase-hellmers",21,[1,3,2,2,0,1,1,2,2,2,2,2,3,2,1,0,3,1]),
             (WP,"rupert-pedler",20,[3,1,2,0,1,3,1,2,4,2,1,2,0,3,2,2,0,1]),
             (SS,"alan-lozer",5,[1,0,1,3,0,2,2,1,3,1,2,2,2,1,0,1,3,1]),
             (SS,"scott-benesh",0,[2,3,1,3,2,2,1,3,3,1,1,2,1,2,2,2,2,2])],"result":"Silver Spoons won 30.5-30"},

 # ---- ROUND 5: SINGLES — per-hole NET (concessions marked C) ----
 {"m":13,"round":5,"format":"Singles Match Play","card":"13_round_5__matches_1_and_2.png",
  "players":[(WP,"chase-hellmers",3,[6,4,6,10,4,5,6,6,7,10,7,6,9,5,7,4,5,3]),
             (SS,"steve-urwin",0,[8,5,6,5,3,6,6,4,5,6,4,8,7,5,8,5,3,4])],"result":"Silver Spoons won 2&1"},
 {"m":17,"round":5,"format":"Singles Match Play","card":"13_round_5__matches_1_and_2.png",
  "players":[(WP,"tom-brunskill",None,[7,2,6,5,6,5,5,2,4,8,4,6,4,4,4,6,5,3]),
             (SS,"alan-lozer",None,[5,3,4,5,4,5,7,2,4,6,4,5,5,4,3,3,4,4])],"result":"Silver Spoons won 4&2"},
 {"m":18,"round":5,"format":"Individual Championship / Singles","card":"14_round_5__matches_3_and_4.png",
  "players":[(WP,"michael-herring",None,[6,4,5,7,5,4,6,5,4,6,5,6,8,5,5,5,C,C]),
             (SS,"anthony-herring",None,[7,6,4,8,5,5,5,4,5,8,6,6,6,4,7,6,C,C])],"result":"Woodpeckers won 4&2"},
 {"m":16,"round":5,"format":"Singles Match Play","card":"14_round_5__matches_3_and_4.png",
  "players":[(WP,"colton-mckivitz",0,[6,3,7,5,4,6,7,5,6,8,8,6,7,6,7,C,C,C]),
             (SS,"ed-nelson",0,[6,4,6,6,6,7,5,5,5,6,3,6,5,5,6,C,C,C])],"result":"Silver Spoons won 4&3"},
 {"m":15,"round":5,"format":"Singles Match Play","card":"15_round_5__matches_5_and_6.png",
  "players":[(WP,"ben-urwin",5,[8,1,6,6,4,5,5,3,6,5,5,5,3,4,4,C,C,4]),
             (SS,"scott-benesh",0,[6,4,5,7,4,6,5,3,4,6,6,5,6,4,5,C,C,4])],"result":"Woodpeckers won 4&3"},
 {"m":14,"round":5,"format":"Singles Match Play","card":"15_round_5__matches_5_and_6.png",
  "players":[(WP,"rupert-pedler",None,[6,3,6,7,6,4,7,3,5,6,6,7,5,2,6,5,4,4]),
             (SS,"miles-honens",None,[8,3,5,6,5,5,8,4,5,6,5,6,6,4,5,6,6,5])],"result":"Woodpeckers won 2&1"},
]

def opponents_of(mt, team):
    out=[]
    if mt.get("team_scored"):
        for (t,pl,_g) in mt["sides"]:
            if t!=team: out+=pl
    else:
        for (t,slug,*_r) in mt["players"]:
            if t!=team: out.append(slug)
    return out

rows=[]
for mt in MATCHES:
    rnd=mt["round"]; course,pars,sis=COURSES[rnd]; mid=f"{TID}-m{mt['m']}"; n=len(pars)
    base={"tournament":TID,"round":rnd,"course":course,"format":mt["format"],
          "match_id":mid,"source_scorecard":mt["card"]}

    if mt.get("team_scored"):  # SCRAMBLE — team gross rows
        for (team,players,gl) in mt["sides"]:
            opps=opponents_of(mt,team)
            for h in range(n):
                g=gl[h]; vs=g-pars[h]
                rows.append({**base,"player":None,"team":team,"team_players":players,
                    "partner":None,"opponents":opps,"hole":h+1,"par":pars[h],"stroke_index":sis[h],
                    "playing_handicap":None,"score_type":"team_gross",
                    "net_score":None,"net_vs_par":None,"net_result":None,
                    "team_gross":g,"team_gross_vs_par":vs,"team_gross_result":result_label(vs),
                    "stableford_points":None,"conceded":False,"verification_status":"verified",
                    "notes":"Scramble — TEAM GROSS (no individual attribution)."})
        continue

    for entry in mt["players"]:
        team,slug,hcp,arr = entry
        opps=opponents_of(mt,team)
        partner=None
        if rnd in (2,3):
            for (t2,s2,*_r) in mt["players"]:
                if t2==team and s2!=slug: partner=s2
        for h in range(n):
            row={**base,"player":slug,"team":team,"team_players":None,"partner":partner,
                 "opponents":opps,"hole":h+1,"par":pars[h],"stroke_index":sis[h],
                 "playing_handicap":hcp,"score_type":"net",
                 "net_score":None,"net_vs_par":None,"net_result":None,
                 "team_gross":None,"team_gross_vs_par":None,"team_gross_result":None,
                 "stableford_points":None,"conceded":False,"verification_status":"verified","notes":""}
            if mt.get("stableford"):
                p=arr[h]; row["score_type"]="stableford"
                row["stableford_points"]=p
                row["net_result"]=stbl_result(p)
                row["net_vs_par"]=(2-p) if p>0 else None  # 0 pts = net double-or-worse (floor)
                row["notes"]="Team Average Stableford — net stableford points (per-hole net stroke not shown)."
                rows.append(row); continue
            g=arr[h]
            if g is C:
                row["conceded"]=True
                row["notes"]="Conceded hole (match already decided) — not scored."
                rows.append(row); continue
            vs=g-pars[h]
            row["net_score"]=g; row["net_vs_par"]=vs; row["net_result"]=result_label(vs)
            rows.append(row)

os.makedirs(os.path.dirname(OUT),exist_ok=True)
with open(OUT,"w") as f: json.dump(rows,f,indent=2,ensure_ascii=False)
print(f"wrote {len(rows)} hole rows to data/hole_scores.json")
