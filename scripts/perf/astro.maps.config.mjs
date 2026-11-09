// The production build with source maps, for attribution only (LoAF scripts, forced-layout stacks and CPU
// profiles map back to src/ file:line). Same config as astro.config.mjs plus client source maps; the bundles
// are otherwise the same code. Measure frame rates on the plain build, attribute on this one:
//   npx astro build --config scripts/perf/astro.maps.config.mjs --outDir .scratch/build-perf-maps
// Astro 6 reads the client build's sourcemap from vite.environments.client.build (static-build.js), not from
// vite.build: tried vite.build.sourcemap first, it produced no maps.
import base from '../../astro.config.mjs';

const vite = base.vite || {};
export default {
  ...base,
  vite: {
    ...vite,
    // its own Vite cache: never share node_modules/.vite with the dev server (a second writer there broke its
    // optimized deps on 2026-11-07)
    cacheDir: './.scratch/perf/.vite-maps',
    environments: { ...(vite.environments || {}), client: { ...((vite.environments && vite.environments.client) || {}), build: { sourcemap: true } } },
  },
};
