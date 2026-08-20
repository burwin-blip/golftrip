#!/usr/bin/env python3
"""Cut the player portraits used on the Players wall and the profile headers.

Portraits live in `public/players/<player-id>.jpg` — that filename IS the wiring.
`src/lib/portraits.js` scans the folder at build time, so dropping a correctly
named file in there is all it takes to replace a player's initials placeholder.

Most portraits will be dropped in by hand (straight from a phone). This script
exists for the two players whose only portrait is a frame of the 2026 trip album:
it crops the chosen album shot down to a head-and-torso 4:5 so it reads as a
portrait rather than a snapshot. Re-run it any time the album is re-optimised.

    python3 scripts/gen_portraits.py

Crop boxes are FRACTIONS of the source (left, top, width, height) so they survive
a re-export at a different resolution. Each was picked by eye against the source.
"""

from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
ALBUM = ROOT / "public" / "photos" / "2026" / "st-george"
OUT = ROOT / "public" / "players"

# Portrait frame: 4:5, the aspect the card and the profile header are built for.
OUT_W, OUT_H = 800, 1000

# player id -> (source album file, crop as fractions of the source, why this shot)
SOURCES = {
    "tom-brunskill": (
        "sg26-11.jpg",
        (0.180, 0.000, 0.600, 1.000),
        "Golden-hour portrait, head-on and unobstructed — the better of his two "
        "album frames (sg26-12 has a hand across the face).",
    ),
    "michael-herring": (
        "sg26-15.jpg",
        (0.220, 0.060, 0.560, 0.500),
        "The champion's jacket, standing square to camera. Cropped to head and "
        "torso so the jacket reads at card size; the full-length frame is still "
        "in the album as sg26-15.",
    ),
}


def crop_fraction(im: Image.Image, box: tuple[float, float, float, float]) -> Image.Image:
    fl, ft, fw, fh = box
    w, h = im.size
    left, top = round(fl * w), round(ft * h)
    return im.crop((left, top, left + round(fw * w), top + round(fh * h)))


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for pid, (src_name, box, _why) in SOURCES.items():
        src = ALBUM / src_name
        if not src.exists():
            src = OUT / src_name  # a hand-placed source that isn't in the album
        if not src.exists():
            raise SystemExit(f"missing source for {pid}: {src_name}")
        im = ImageOps.exif_transpose(Image.open(src)).convert("RGB")
        im = crop_fraction(im, box)
        # cover-fit into the 4:5 frame, then write a web-weight JPEG
        im = ImageOps.fit(im, (OUT_W, OUT_H), method=Image.LANCZOS, centering=(0.5, 0.5))
        dest = OUT / f"{pid}.jpg"
        im.save(dest, "JPEG", quality=82, optimize=True, progressive=True)
        print(f"{pid:18s} {src_name} -> {dest.relative_to(ROOT)} ({im.size[0]}x{im.size[1]})")


if __name__ == "__main__":
    main()
