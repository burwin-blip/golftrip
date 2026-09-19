# Course photos — drop images in, they appear on the next build

One folder per course (the folder name is the course's slug — don't rename it):

| Folder | Course | Where official imagery lives |
|---|---|---|
| `terra-lago-south/` | Terra Lago — South | https://golfterralago.com/gallery-index-maple (add `?format=2500w` to image URLs for full size), home page |
| `terra-lago-north/` | Terra Lago — North | same gallery as South — the site doesn't split the courses |
| `desert-willow-mountain-view/` | Desert Willow — Mountain View | https://www.desertwillow.com/photo-gallery/ ("Mountain View Course Gallery") and https://www.desertwillow.com/mountainviewcourse/ |
| `desert-willow-firecliff/` | Desert Willow — Firecliff | https://www.desertwillow.com/photo-gallery/ ("Firecliff Course Gallery") and https://www.desertwillow.com/firecliffcourse/ (post-renovation hole photos) |
| `classic-club/` | The Classic Club | https://www.classicclubgolf.com/gallery/ (mostly clubhouse — few course shots) |

- The **first file (by name) is the hero**; the rest become the gallery. Number them: `01-…jpg`, `02-…jpg`.
- Landscape shots work best for the hero (it's shown 16:9). 4–6 photos per course is plenty.
- Web-size them first: `sips -Z 1600 *.jpg`. Optional `name-thumb.jpg` beside `name.jpg` is used for the grid.
