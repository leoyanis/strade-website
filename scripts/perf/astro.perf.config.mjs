// The measured production build, with its own Vite cache. `astro build` writes `<cacheDir>/deps`, and the repo
// config points cacheDir at node_modules/.vite, which the dev server on :4321 also uses: every build there
// replaced the dev server's optimized deps (no gsap) and it answered 504 "Outdated Optimize Dep" (2026-11-07).
// Same config otherwise; the output is byte-identical to a plain build (checked with `run.mjs build --verify`).
//   npx astro build --config scripts/perf/astro.perf.config.mjs --outDir .scratch/build-perf
import base from '../../astro.config.mjs';

export default { ...base, vite: { ...(base.vite || {}), cacheDir: './.scratch/perf/.vite-build' } };
