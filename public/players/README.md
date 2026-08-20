# Player portraits

Drop a photo in this folder named after the player and it appears on the Players
wall and at the top of their profile on the next build. Nothing else to edit.

```
public/players/ben-urwin.jpg      ->  Ben Urwin
public/players/colton-mckivitz.jpg -> Colton McKivitz
```

**The filename is the player's id** — the `id`/`slug` from `data/players.json`
(lower case, words joined by hyphens), then `.jpg`. `.jpeg`, `.png`, `.webp` and
`.avif` work too; if a player somehow has more than one, `.jpg` wins.

Until a photo arrives, that player shows a sunset placeholder with their
initials. That's a designed state, not a gap — no rush.

## What makes a good one

- **Portrait orientation.** Every frame on the site is 4:5, and the photo is
  centre-cropped to fit. A landscape shot works if the player is near the middle.
- **Head and torso**, not full-length — faces go small on the wall tiles.
- **Around 800 × 1000**, saved at JPEG quality ~82 (roughly 100–200 KB). Bigger
  files just make the page slower; they don't look better at this size.

Straight from a phone is fine. To resize one first:

```
sips -Z 1000 --setProperty formatOptions 82 ~/Desktop/photo.jpg \
     --out public/players/ben-urwin.jpg
```

## The two already here

`tom-brunskill.jpg` and `michael-herring.jpg` are cropped out of the 2026 St
George album by `scripts/gen_portraits.py`. Replace either with a better photo
any time — just overwrite the file (and drop its entry from that script so a
re-run doesn't put the old crop back).
