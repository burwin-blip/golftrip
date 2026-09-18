import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel/serverless';

// The Annual's PAGES are fully static and private (see robots.txt + noindex).
// The one exception is the RSVP API: `hybrid` output keeps every page
// prerendered at build time, and only the routes that opt out with
// `export const prerender = false` (src/pages/api/rsvp*.js) run as Vercel
// serverless functions. No other server runtime, no external calls from pages.
export default defineConfig({
  site: 'https://the-annual.local',
  output: 'hybrid',
  adapter: vercel(),
  trailingSlash: 'ignore',
  build: { format: 'directory' },
  devToolbar: { enabled: false },
});
