// ---------------------------------------------------------------------------
// COURSE PHOTOS — the folder name is the wiring.
//
// Drop images into `public/photos/<year>/courses/<course-slug>/` and they appear
// on that course's profile on the next build: the first one as the hero, the
// rest as a lightbox gallery. Nothing to register, no JSON to edit.
//
//   public/photos/2027/courses/terra-lago-south/01-first-tee.jpg
//   public/photos/2027/courses/classic-club/clubhouse.jpg
//
// The slug is the course's `slug` in data/trip-<year>.json. Files sort by
// filename, so a `01-`/`02-` prefix is how you choose the hero and the order.
// Until a course has a folder, its profile and rota card show a designed
// placeholder — see CoursePhoto.astro.
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PHOTOS_ROOT = fileURLToPath(new URL('../../public/photos/', import.meta.url));
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif']);

// Thumbs generated alongside a full (`name-thumb.jpg`) are used for the grid but
// never listed as photos in their own right.
const isThumb = (f) => /-thumb\.[a-z]+$/i.test(f);

function scan(year, slug) {
  const dir = path.join(PHOTOS_ROOT, String(year), 'courses', slug);
  let files;
  try {
    files = fs.readdirSync(dir);
  } catch {
    return []; // no folder yet — the placeholder covers it
  }
  const present = new Set(files);
  return files
    .filter((f) => IMAGE_EXT.has(path.extname(f).toLowerCase()) && !isThumb(f))
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
    .map((f) => {
      const ext = path.extname(f);
      const thumb = `${path.basename(f, ext)}-thumb${ext}`;
      const base = `/photos/${year}/courses/${slug}`;
      return {
        id: `${slug}-${path.basename(f, ext)}`,
        full: `${base}/${f}`,
        thumb: present.has(thumb) ? `${base}/${thumb}` : `${base}/${f}`,
      };
    });
}

/**
 * Photos for one course, in filename order. Each is { id, full, thumb, alt }.
 * `alt` is generated from the course name — these are scenery, and inventing a
 * per-photo description would be guessing at what's in the frame.
 */
export function coursePhotos(year, slug, courseName) {
  return scan(year, slug).map((p, i) => ({
    ...p,
    alt: `${courseName}${i === 0 ? '' : ` — photo ${i + 1}`}`,
  }));
}

/** Slugs with no photo folder yet — the "still needs photos" list. */
export function coursesMissingPhotos(year, courses) {
  return courses.filter((c) => c.slug && scan(year, c.slug).length === 0);
}
