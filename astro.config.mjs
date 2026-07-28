import { defineConfig } from 'astro/config';

// The Annual is a fully static, private site (see robots.txt + noindex).
// No server runtime, no external calls — fonts are self-hosted via @fontsource.
export default defineConfig({
  site: 'https://the-annual.local',
  output: 'static',
  trailingSlash: 'ignore',
  build: { format: 'directory' },
  devToolbar: { enabled: false },
});
