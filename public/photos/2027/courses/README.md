# Course photos — drop images in, they appear on the next build

> **Owner: drop new photos in `~/GolfTrip/inbox/` instead** (players/ or
> courses/<course>/). Claude processes them into this folder. The notes below
> describe the format they end up in.

One folder per course (the folder name is the course's slug — don't rename it):

| Folder | Course | Where official imagery lives |
|---|---|---|
| `indian-palms/` | Indian Palms Country Club | none yet — https://www.indianpalms.com/ (nine TBC) |
| `pga-west-stadium/` | PGA West — Stadium Course | https://www.pgawest.com/ (`/Images/Library/hp-pete-dye-stadium-course.jpg` is the hero; `hp-Overview.jpg`, the 16th, is a tighter crop of the same shot) |
| `desert-willow-mountain-view/` | Desert Willow — Mountain View | https://www.desertwillow.com/photo-gallery/ ("Mountain View Course Gallery") and https://www.desertwillow.com/mountainviewcourse/ |
| `desert-willow-firecliff/` | Desert Willow — Firecliff | https://www.desertwillow.com/photo-gallery/ ("Firecliff Course Gallery") and https://www.desertwillow.com/firecliffcourse/ (post-renovation hole photos) |
| `classic-club/` | The Classic Club | https://www.classicclubgolf.com/gallery/ (mostly clubhouse — few course shots) |

- The **first file (by name) is the hero**; the rest become the gallery. Number them: `01-…jpg`, `02-…jpg`.
- Landscape shots work best for the hero (it's shown 16:9). 4–6 photos per course is plenty.
- Web-size them first: `sips -Z 1600 *.jpg`. Optional `name-thumb.jpg` beside `name.jpg` is used for the grid.
