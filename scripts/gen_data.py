#!/usr/bin/env python3
"""Generate The Annual JSON data files from the verified workbook.
Applies kebab-case ids and the three confirmed editorial decisions:
  - Year is 2026 inaugural.
  - No family relationships asserted (Herring 'Family Rivalry' -> neutral 'Championship').
  - 'The Wind Round' Sunday weather moment is included.
"""
import json, os
import openpyxl

SRC = "/Users/benurwin/Desktop/Golf Trip/The_Duel_Database_v1_0_Website_Ready.xlsx"
OUT = "/Users/benurwin/Desktop/Golf Trip/the-annual/data"
os.makedirs(OUT, exist_ok=True)
wb = openpyxl.load_workbook(SRC, data_only=True)

def rows(sheet):
    ws = wb[sheet]
    data = list(ws.iter_rows(values_only=True))
    header = [str(h).strip() if h is not None else "" for h in data[0]]
    out = []
    for r in data[1:]:
        if all(c is None for c in r):
            continue
        out.append({header[i]: r[i] for i in range(len(header))})
    return out

# ---- id maps ----
PLY = {}  # PLY-00x -> slug
for r in rows("DB Players"):
    PLY[r["Player ID"]] = r["Profile Slug"]

TEAM = {"TEAM-2026-WP": "woodpeckers", "TEAM-2026-SS": "silver-spoons"}
TOUR = {"STG-2026": "st-george-2026"}
ROUND = {f"RND-2026-0{i}": f"st-george-2026-r{i}" for i in range(1, 6)}
COURSE = {
    "CRS-001": "sunbrook-blackrock",
    "CRS-002": "the-ledges",
    "CRS-003": "sand-hollow-links",
    "CRS-004": "sand-hollow-championship",
    "CRS-005": "falcon-ridge",
}
def mid(x):  # match id 2026-R1-M1 -> st-george-2026-m1
    return "st-george-2026-m" + x.split("-M")[1]

def dump(name, obj):
    with open(os.path.join(OUT, name), "w") as f:
        json.dump(obj, f, indent=2, ensure_ascii=False)
    print(f"wrote {name}: {len(obj) if isinstance(obj, list) else 'obj'} records")

# ---------- players.json ----------
# `confirmedFor` lists the ids of any UPCOMING tournaments a player has committed
# to. Existing players (who have played a completed event) are auto-eligible for
# the next draft pool; new blokes with no record appear once they're added here
# with the upcoming tournament id in `confirmedFor`.
players = []
for r in rows("DB Players"):
    players.append({
        "id": r["Profile Slug"],
        "name": r["Player Name"],
        "slug": r["Profile Slug"],
        "active": bool(r["Active"]),
        "country": r["Country"] or None,
        "nickname": r["Nickname"] or None,
        "notes": r["Notes"] or None,
        "confirmedFor": [],
    })
dump("players.json", players)

# ---------- tournaments.json ----------
tr = rows("DB Tournaments")[0]
teams_rows = rows("DB Teams")
courses_rows = rows("DB Courses")
rounds_rows = rows("DB Rounds")
hcp_rows = rows("DB Handicaps")
score_rows = rows("DB Round Scores")

def isodate(v):
    return v.date().isoformat() if hasattr(v, "date") else str(v)

# Display colours tuned to the official team logos (light-theme palette).
TEAM_COLOR = {"woodpeckers": "#2E6B43", "silver-spoons": "#2E4B70"}
teams = []
for t in teams_rows:
    tid = TEAM[t["Team ID"]]
    teams.append({
        "id": tid,
        "name": t["Team Name"],
        "captainId": PLY[t["Captain Player ID"]],
        "color": TEAM_COLOR[tid],
        "finalPoints": float(t["Final Points"]),
        "champion": bool(t["Champion"]),
    })

courses = [{
    "id": COURSE[c["Course ID"]],
    "name": c["Course Name"],
    "nine": c["Course / Nine"] or None,
    "location": c["Location"],
} for c in courses_rows]

rounds = [{
    "id": ROUND[r["Round ID"]],
    "number": int(r["Round Number"]),
    "day": r["Day"],
    "date": isodate(r["Date"]),
    "courseId": COURSE[r["Course ID"]],
    "format": r["Format"],
    "holes": int(r["Holes"]),
    "pointsPerMatch": float(r["Points Per Match"]),
    "matchCount": int(r["Match Count"]),
} for r in rounds_rows]

roster = [{
    "playerId": PLY[h["Player ID"]],
    "teamId": TEAM[h["Team ID"]],
    "handicapIndex": float(h["Handicap Index"]),
} for h in hcp_rows]
# keep roster in team draft order for stability
roster.sort(key=lambda x: (x["teamId"], x["playerId"]))

# IMPORTANT: every recorded score is a NET score (the workbook's "Gross" columns
# were mislabeled). We store them as `net` and correct the word in any note text.
def to_net_note(n):
    return n.replace("Gross", "Net").replace("gross", "net") if n else None
scores = [{
    "roundId": ROUND[s["Round ID"]],
    "playerId": PLY[s["Player ID"]],
    "net": s["Gross Score"],
    "stableford": s["Stableford Points"],
    "result": s["Result"] or None,
    "completeRound": bool(s["Complete Round"]),
    "note": to_net_note(s["Notes"] or None),
} for s in score_rows]

tournament = {
    "id": TOUR[tr["Tournament ID"]],
    "name": tr["Tournament Name"],
    "shortName": "St George 2026",
    "year": int(tr["Year"]),
    "edition": 1,
    "startDate": isodate(tr["Start Date"]),
    "endDate": isodate(tr["End Date"]),
    "location": tr["Location"],
    "finalRoundLocation": "Falcon Ridge, Mesquite, Nevada",
    "status": "completed",   # normalized status: "completed" | "upcoming"
    "pointsAvailable": 30,
    "finalScore": tr["Final Score"],
    "winningTeamId": TEAM[tr["Winning Team ID"]],
    "championPlayerId": PLY[tr["Champion Player ID"]],
    "notes": tr["Notes"],
    "teams": teams,
    "courses": courses,
    "rounds": rounds,
    "roster": roster,
    "scores": scores,
}

# ---- UPCOMING tournaments (not in the workbook; added here) ------------------
# An upcoming event has NO teams / rounds / roster / scores / matches, so it can
# never affect any stat. When the trip happens: flip status to "completed" and
# fill in the results data (ideally by extending the workbook + this generator).
upcoming = [{
    "id": "duel-in-the-desert-2027",
    "name": "Duel in the Desert 2027",
    "shortName": "Palm Springs 2027",
    "year": 2027,
    "edition": 2,
    "startDate": "2027-03-25",
    "endDate": "2027-03-28",
    "location": "Palm Springs, California",
    "finalRoundLocation": None,
    "status": "upcoming",
    "pointsAvailable": None,
    "finalScore": None,
    "winningTeamId": None,
    "championPlayerId": None,
    "notes": "The desert calls. Four days of golf under the San Jacinto mountains.",
    "flyer": {"display": "/next-trip-2027.jpg", "full": "/next-trip-2027.png"},
    # Where we're staying. `photos` are site-relative image paths (e.g. under
    # /accommodation/) — drop them in and they render as a gallery.
    "accommodation": {
        "name": "The Compound",
        "type": "Home in Indio · Palm Springs area",
        "rating": 4.8,
        "bedrooms": 16,
        "beds": 25,
        "baths": 10.5,
        "url": "https://www.airbnb.com.au/rooms/1209088157940154534",
        "photos": [],
    },
    "teams": [],
    "courses": [],
    "rounds": [],
    "roster": [],
    "scores": [],
}]

dump("tournaments.json", [tournament, *upcoming])

# ---------- matches.json ----------
mrows = rows("DB Matches")
mprows = rows("DB Match Players")
players_by_match = {}
for mp in mprows:
    m = mid(mp["Match ID"])
    players_by_match.setdefault(m, []).append(mp)

# per-player display margin overrides where DB Matches margin is generic
def outcome_norm(o):
    return {"Win": "win", "Loss": "loss", "Halve": "halve"}[o]

# Match summaries from the hole-by-hole scorecard PDF, keyed by OUR match number
# (the PDF orders matches differently within each round; these are matched by the
# players + round). Any "gross" in the source text is corrected to "net".
# The Tom-vs-Alan singles (match 17) is kept at 4&2 per the owner's decision.
SUMMARY = {
 1: {"summary": "Ben Urwin and Michael Herring produced the Woodpeckers' only win of the opening session and were ahead from the start. They won the 1st and 2nd to move 2 Up, then protected that advantage through the next three holes. Another win at the 6th stretched the lead to 3 Up. Alan Lozer and Miles Honens did manage to win the 8th and reduce the deficit to two, but the Woodpeckers responded on the 9th to restore the three-hole margin and finish 3&2. The key was that Ben and Michael never allowed the Silver Spoons to get the match back to one hole after taking the early lead.",
     "standout": "Michael Herring — his steady scramble play helped establish the early lead and prevented a late comeback."},
 2: {"summary": "The opening match stayed level through the first hole before Steve Urwin and Anthony Herring moved 1 Up at the 2nd. Tom Brunskill and Rupert Pedler immediately clawed it back, and the match was still all square through four. The Silver Spoons then found the decisive stretch: they won the 5th and 6th to move 2 Up. The Woodpeckers briefly reduced the deficit at the 7th, but Steve and Anthony answered at the 8th and carried a two-hole advantage to the final tee, closing the match 2&1. It was not a runaway; the difference was the Silver Spoons responding every time the Woodpeckers threatened to level the match.",
     "standout": "Steve Urwin — his pairing controlled the middle of the nine and repeatedly answered the Woodpeckers' attempts to recover."},
 3: {"summary": "Ed Nelson and Scott B took control from the opening hole and never allowed the Woodpeckers into the match. They were 1 Up after the 1st, 2 Up through two and 3 Up after the 3rd. After a halved 4th, the Silver Spoons won the 5th and 6th to reach 5 Up. Colton McKivitz and Chase Hellmers managed to win the 7th and briefly reduce the margin, but the response was short-lived. Ed and Scott restored the five-hole advantage at the 9th to complete the most one-sided result of the opening session. The match was effectively decided by the Silver Spoons' five-hole winning burst across the first six holes.",
     "standout": "Scott B — he helped set the pace from the first hole and anchored the dominant 5&3 victory."},
 4: {"summary": "This match was still close at the turn, with Colton McKivitz and Tom Brunskill only 1 Up through nine. The Woodpeckers then made their move on the back nine. Wins at the 10th and 12th pushed the advantage to 2 Up, before further gains at the 13th and 14th stretched it to 4 Up. Ed Nelson and Miles Honens briefly stopped the run by winning the 15th, but the Woodpeckers answered immediately at the 16th to restore the four-hole lead and close the match 4&2. The final margin came from a decisive five-hole stretch after the turn rather than early dominance.",
     "standout": "Tom Brunskill — his 80 was the best net score in the group and he supplied the consistency behind the back-nine surge."},
 5: {"summary": "This was one of the most even matches of the tournament. The sides were all square through the 8th before Michael Herring and Rupert Pedler edged 1 Up at the 9th and carried that lead to the 10th. Steve Urwin and Scott B pulled the match level at the 11th and moved 1 Up at the 12th. The Woodpeckers answered at the 13th, but the Silver Spoons again moved ahead at the 14th and remained 1 Up through the 15th. Michael and Rupert squared it at the 16th, and neither team could win either of the final two holes. The lead changed hands repeatedly, with both teams producing an answer whenever the other appeared ready to take control.",
     "standout": "Michael Herring — he posted the lowest net score in the group at 75 and was central to the Woodpeckers' late recovery."},
 6: {"summary": "Ben Urwin and Chase Hellmers held a 2 Up advantage through the 8th, but Alan Lozer and Anthony Herring mounted the strongest comeback of the afternoon. The Silver Spoons won the 9th and 10th to bring the match completely back to all square. Rather than allowing the momentum to turn, the Woodpeckers immediately regained the lead at the 11th and stretched it to 2 Up by the 13th. Alan and Anthony reduced the margin at the 14th and kept the contest alive through the 17th, but Ben and Chase won the final hole to finish 2 Up. The defining moment was the Woodpeckers' response immediately after surrendering their early lead.",
     "standout": "Ben Urwin — he helped steady the pairing after the match was pulled back to all square and drove the decisive closing stretch."},
 7: {"summary": "The opening shamble match changed direction several times. Ben Urwin and Tom Brunskill won the 1st, but Scott B and Miles Honens squared it at the 2nd and moved 1 Up at the 3rd. The Woodpeckers immediately answered at the 4th, after which four consecutive holes were halved. The Silver Spoons then won the 8th to take a one-hole lead to the final tee. Ben and Tom needed the 9th and delivered, winning the last hole to rescue half a point. Neither pairing led by more than one hole at any stage, making this a genuine back-and-forth contest.",
     "standout": "Ben Urwin — he recorded the lowest score for the Woodpeckers and helped win the final hole to secure the halve."},
 8: {"summary": "Chase Hellmers and Michael Herring started quickly, winning the first two holes to move 2 Up. Ed Nelson and Anthony Herring fought back by winning the 3rd and then the 5th, wiping out the early deficit and bringing the match back to all square. The Woodpeckers responded immediately at the 6th, protected the one-hole lead through the 7th and then won the 8th to move 2 Up with one to play. That final swing closed the match 2&1. The key feature was the Woodpeckers rebuilding their advantage after the Silver Spoons had completely erased the early lead.",
     "standout": "Chase Hellmers — his 31 was the lowest nine-hole score in the match and underpinned both the fast start and the decisive finish."},
 9: {"summary": "Alan Lozer and Steve Urwin struck first, taking a one-hole lead after the opener. Colton McKivitz and Rupert Pedler squared the match at the 2nd and moved ahead at the 3rd. The Silver Spoons pulled it back to all square at the 4th, but the Woodpeckers regained the lead at the 5th. Holes 6 and 7 were halved, leaving the match finely balanced before Colton and Rupert won the 8th and then protected the advantage on the 9th. The final 1 Up margin reflected a match in which the lead changed hands early before the Woodpeckers gradually gained control over the closing holes.",
     "standout": "Colton McKivitz — his 37 was the better Woodpeckers score and he helped deliver the late holes that separated the teams."},
 10: {"summary": "Ben Urwin and Colton McKivitz dominated the early scoring, moving two points ahead after the 2nd and three points ahead through three. Their advantage grew steadily and peaked at six points after the 12th and again after the 14th. Steve Urwin and Ed Nelson then mounted a major late comeback. The Silver Spoons cut the gap to 3.5 points at the 15th, three points at the 16th and only 1.5 points at the 17th. They gained another half point on the final hole, but the Woodpeckers had built just enough of a cushion to survive 26.5-25.5.",
     "standout": "Ben Urwin — his 27 points were the highest Woodpeckers total, and his early scoring created the margin that survived the late charge."},
 11: {"summary": "The Stableford match was close throughout the front nine. Anthony Herring and Miles Honens built an early 1.5-point advantage through two holes, but Tom Brunskill and Michael Herring gradually pulled it back and briefly moved half a point ahead after the 8th. The teams were level again after nine. The Silver Spoons edged in front on the 10th and maintained a narrow lead through the middle of the back nine before making the decisive move late. Strong scoring on the 16th and especially the 17th opened a 3.5-point gap. The Woodpeckers recovered 1.5 points at the last, but the Silver Spoons still held on 28-26.",
     "standout": "Anthony Herring — his 30 Stableford points were the highest individual total in the match and powered the late separation."},
 12: {"summary": "Chase Hellmers and Rupert Pedler made the better start and led by two points after the 3rd. Alan Lozer and Scott B erased the advantage by the 4th and moved half a point ahead at the 5th. The Silver Spoons remained narrowly in front through the 9th, but the Woodpeckers pulled the match level again after the 10th and kept it tied through the 13th. Chase and Rupert then moved ahead at the 14th and stretched the lead to 1.5 points after the 15th. Scott's steady back-nine scoring brought the Silver Spoons back: they reduced the gap at the 16th, squared the match at the 17th and gained the decisive half point on the 18th to win 30.5-30.",
     "standout": "Scott B — his match-high 35 points carried the Silver Spoons through the back nine and completed the final-hole comeback."},
 13: {"summary": "Chase Hellmers made the faster start, winning the opening two holes to move 2 Up. Steve Urwin responded by winning the 3rd and 4th, and the match was back to all square after the 5th. The players traded momentum through the rest of the front nine, with Chase briefly regaining the lead before Steve reached the turn 1 Up. Steve then won the 10th and 11th to move 3 Up. Chase reduced the deficit on the 12th, but Steve restored the three-hole advantage at the 13th. Chase fought back again and was only 1 Down after the 16th, before Steve closed the match on the 17th for a hard-earned 2&1 victory.",
     "standout": None},
 14: {"summary": "Rupert Pedler took the opening hole, but Miles Honens answered at the 2nd. The match remained close throughout the front nine, with Rupert moving ahead at the 4th and reaching the turn 1 Up. Miles continued to apply pressure and squared the match again at the 11th. Rupert responded by winning the 12th, and although Miles pulled level once more at the 13th, Rupert won the 14th and then the 16th to build a two-hole advantage. He protected that margin at the 17th to complete a tightly contested 2&1 victory.",
     "standout": None},
 15: {"summary": "Scott B won the opening hole, but Ben Urwin answered immediately at the 2nd and then took control. Ben moved 1 Up at the 3rd, and after the match briefly returned to all square, he won the 6th and carried a one-hole advantage to the turn. The decisive run came on the back nine: Ben won the 10th, 11th and 13th to move 3 Up, then extended the lead to 4 Up by the 15th. Scott could not generate the sustained response needed, and Ben closed the match 4&3.",
     "standout": None},
 16: {"summary": "Colton McKivitz began well and moved 2 Up through the opening five holes. Ed Nelson then changed the match completely. He won the 6th and 7th to erase the deficit, and by the turn the contest had swung in his favor. Ed continued the run after the turn, moving 1 Up at the 11th, 2 Up through the 13th and 3 Up after the 14th. Another win at the 15th completed a remarkable reversal and closed the match 4&3. Colton controlled the opening stretch, but Ed dominated everything from the 6th onward.",
     "standout": None},
 17: {"summary": "Tom Brunskill won the opening hole, but Alan Lozer quickly turned the match around. Alan won the 2nd and 3rd to move ahead, and although Tom briefly reduced the margin, Alan rebuilt the lead through the middle of the front nine. He reached the turn 1 Up and then began to pull away on the back. Wins at the 10th and 12th moved him 3 Up, and another at the 13th stretched the margin further. Tom could not produce the run required to recover, and Alan completed a controlled 4&2 victory.",
     "standout": None},
 18: {"summary": "Michael Herring started strongly, winning the first two holes to go 2 Up. Anthony Herring reduced the deficit at the 3rd, but Michael immediately responded at the 4th and retained control through the next several holes. By the 6th he was 3 Up. Anthony fought back by winning the 7th and 8th, reducing the gap to a single hole, but Michael stopped the comeback at the 9th and then won the 10th and 11th to surge 4 Up. Anthony won the 13th to stay alive, but Michael protected the advantage and closed the match 4&2, securing the Individual Championship.",
     "standout": None},
}

matches = []
for m in mrows:
    mi = mid(m["Match ID"])
    ps = sorted(players_by_match[mi], key=lambda x: (x["Side"], int(x["Slot"])))
    # The per-player rows ARE the structured match log the written record trusts.
    # Use them as authoritative (fixes M17: log says 4&2, match-level cell had a stale 2&1).
    player_margin = ps[0]["Margin"]
    match_margin = m["Margin / Score"]
    margin = player_margin or match_margin
    # normalize dash + casing for display
    margin = str(margin).replace("–", "–").replace("-", "–") if any(ch.isdigit() for ch in str(margin)) and ("&" not in str(margin)) and ("up" not in str(margin).lower()) else str(margin)
    margin = margin.replace(" Up", " up")
    winner = m["Winner Team ID"]
    matches.append({
        "id": mi,
        "tournamentId": TOUR[m["Tournament ID"]],
        "roundId": ROUND[m["Round ID"]],
        "number": int(m["Match Number"]),
        "courseId": COURSE[m["Course ID"]],
        "format": m["Format"],
        "pointsAvailable": float(m["Points Available"]),
        "teamAId": TEAM[m["Team A ID"]],
        "teamBId": TEAM[m["Team B ID"]],
        "halved": winner is None,
        "winnerTeamId": TEAM[winner] if winner else None,
        "margin": margin,
        "summary": SUMMARY.get(int(m["Match Number"]), {}).get("summary"),
        "standout": SUMMARY.get(int(m["Match Number"]), {}).get("standout"),
        "players": [{
            "playerId": PLY[p["Player ID"]],
            "teamId": TEAM[p["Team ID"]],
            "side": p["Side"],
            "outcome": outcome_norm(p["Outcome"]),
            "pointsEarned": float(p["Points Earned"]),
        } for p in ps],
    })
dump("matches.json", matches)

# ---------- drafts.json ----------
drafts = []
for d in rows("DB Draft Picks"):
    drafts.append({
        "id": "st-george-2026-pick-" + str(int(d["Pick Number"])),
        "tournamentId": TOUR[d["Tournament ID"]],
        "pick": int(d["Pick Number"]),
        "teamId": TEAM[d["Team ID"]],
        "captainId": PLY[d["Captain Player ID"]],
        "playerId": PLY[d["Selected Player ID"]],
    })
dump("drafts.json", drafts)

# ---------- awards.json ----------
# Built from DB Awards; winner #7 (text) linked to both players.
awards = []
for a in rows("DB Awards"):
    winner_type = a["Winner Type"]
    entry = {
        "id": a["Award ID"].lower().replace("awd-", "st-george-2026-award-"),
        "tournamentId": TOUR[a["Tournament ID"]],
        "name": a["Award Name"],
        "notes": a["Notes"] or None,
        "winnerType": None,
        "winnerPlayerIds": None,
        "winnerTeamId": None,
        "winnerText": None,
    }
    wid = a["Winner ID / Name"]
    if winner_type == "Team":
        entry["winnerType"] = "team"
        entry["winnerTeamId"] = TEAM[wid]
    elif winner_type == "Player":
        entry["winnerType"] = "players"
        entry["winnerPlayerIds"] = [PLY[wid]]
    else:  # Text -> Victory Tour, link both players
        entry["winnerType"] = "players"
        entry["winnerPlayerIds"] = ["steve-urwin", "michael-herring"]
    awards.append(entry)
dump("awards.json", awards)

# ---------- moments.json ----------
# Curated from the Moments sheet with confirmed decisions applied.
moments = [
    {"id": "st-george-2026-moment-1", "tournamentId": "st-george-2026", "roundNumber": 1,
     "category": "Session Result", "subjectPlayerIds": None, "subjectTeamId": "silver-spoons",
     "title": "Silver Spoons draw first blood",
     "description": "The Silver Spoons won two of the three opening Scramble matches to take a 2–1 lead on Friday morning."},
    {"id": "st-george-2026-moment-2", "tournamentId": "st-george-2026", "roundNumber": 2,
     "category": "Session Swing", "subjectPlayerIds": None, "subjectTeamId": "woodpeckers",
     "title": "The Best Ball onslaught",
     "description": "The Woodpeckers answered by taking five of six Best Ball points and closed Friday in front, 6–3."},
    {"id": "st-george-2026-moment-3", "tournamentId": "st-george-2026", "roundNumber": 3,
     "category": "Clutch", "subjectPlayerIds": ["ben-urwin"], "subjectTeamId": "woodpeckers",
     "title": "Birdie to steal a half",
     "description": "Ben Urwin birdied the final hole to halve the opening Shamble match and deny the Silver Spoons a full point."},
    {"id": "st-george-2026-moment-4", "tournamentId": "st-george-2026", "roundNumber": 4,
     "category": "Captaincy", "subjectPlayerIds": ["tom-brunskill"], "subjectTeamId": "woodpeckers",
     "title": "The strokes gambit",
     "description": "Tom Brunskill paired Chase Hellmers and Rupert Pedler against Alan Lozer and Scott B to squeeze every handicap stroke out of the Stableford round."},
    {"id": "st-george-2026-moment-5", "tournamentId": "st-george-2026", "roundNumber": 4,
     "category": "Deciding Finish", "subjectPlayerIds": ["chase-hellmers"], "subjectTeamId": "woodpeckers",
     "title": "Half a point of daylight",
     "description": "Chase Hellmers needed three chips on the final hole as the Silver Spoons escaped by half a Stableford point, 30.5–30."},
    {"id": "st-george-2026-moment-6", "tournamentId": "st-george-2026", "roundNumber": 5,
     "category": "Hole-in-One", "subjectPlayerIds": ["ben-urwin"], "subjectTeamId": "woodpeckers",
     "title": "The rock-bounce ace",
     "description": "Ben Urwin's tee shot at Falcon Ridge hit the rocks, returned to the green, rolled across it and dropped — a hole-in-one, and the Shot of the Tournament."},
    {"id": "st-george-2026-moment-7", "tournamentId": "st-george-2026", "roundNumber": 5,
     "category": "Weather", "subjectPlayerIds": None, "subjectTeamId": None,
     "title": "The Wind Round",
     "description": "Falcon Ridge was played in 30–40 mph wind gusts on Sunday — forever after 'The Wind Round'."},
    {"id": "st-george-2026-moment-8", "tournamentId": "st-george-2026", "roundNumber": 5,
     "category": "Championship", "subjectPlayerIds": ["michael-herring"], "subjectTeamId": "woodpeckers",
     "title": "The first Champion Golfer",
     "description": "Michael Herring defeated Anthony Herring 4&2 in the Individual Championship match to become the first Champion Golfer in the history of The Annual."},
]
dump("moments.json", moments)
print("\nDONE")
