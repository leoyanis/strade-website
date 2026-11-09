#!/usr/bin/env node
// Strade performance harness. See the Performance section of README.md.
//
//   node scripts/perf/run.mjs measure --name baseline --target prod
//   node scripts/perf/run.mjs measure --name dev-once --target dev --pages home --profiles desktop --repeat 1
//   node scripts/perf/run.mjs report  --name baseline            (rebuild summary.md from raw files)
//   node scripts/perf/run.mjs brief   baseline                   (one compact cross-profile table per page)
//   node scripts/perf/run.mjs compare baseline after-fixes       (writes .scratch/perf/after-fixes/compare-baseline.md)
//   node scripts/perf/run.mjs shots   --name shots-before        (screenshots + contact sheets for parity)
//   node scripts/perf/run.mjs diff    shots-before shots-after   (pixel diff of two screenshot runs)
//   node scripts/perf/run.mjs probe                              (GPU renderer strings and rAF cadence)
//
// Options (measure, shots):
//   --target prod|dev|<url>   prod serves --build-dir on --port (default .scratch/build-perf on 4397); dev is :4321
//   --pages home,vaultt,...   default: home + every case study (see lib/pages.mjs); "all" adds /work and /free
//   --profiles desktop,desktop-4x,phone-4x,safari,iphone   default: all five
//   --passes load,scroll,trace,lag,layers,idle,interact    default: all
//   --repeat N                repeats of the load and scroll passes (default 3; medians are reported)
//   --case-passes ...         passes for case studies (default: load,scroll,trace)
//   --reduced                 emulate prefers-reduced-motion;  --query still  appends ?still to every URL
//   --save-trace              keep the raw Chromium traces (.json.gz, open in DevTools)
//   --inject-css f / --inject-js f   measurement-only experiments (scripts/perf/experiments/*.css): switch one
//                             suspected cost off and measure the difference; they change the look, never ship them
// Never run plain `npm run build` for this: other builds run at the same time. Build with
//   node scripts/perf/run.mjs build      (both builds, each with its own Vite cache, see astro.perf.config.mjs)
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import os from 'node:os';
import { launch, chromiumExecutable } from './lib/pw.mjs';
import { profiles as allProfiles } from './lib/profiles.mjs';
import { PAGES, CASE_STUDIES } from './lib/pages.mjs';
import { startServer } from './lib/server.mjs';
import { loadPass, scrollPass, tracePass, invalPass, lagPass, layersPass, idlePass, interactPass } from './lib/measure.mjs';
import { buildSummary, compare, brief, briefVs } from './lib/report.mjs';
import { shots, diffShots } from './lib/shots.mjs';
import { makeResolver } from './lib/sourcemap.mjs';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const OUT = join(ROOT, '.scratch/perf');

function args(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
      o[k] = v;
    } else o._.push(a);
  }
  return o;
}
const list = (v, d) => (v && v !== true ? String(v).split(',').map((s) => s.trim()).filter(Boolean) : d);

export function uptimeLoad() {
  try {
    const s = execSync('uptime', { encoding: 'utf8' });
    const m = /load averages?: ([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)/.exec(s);
    return m ? Number(m[1]) : null;
  } catch {
    return null;
  }
}
const uptimeText = () => {
  try {
    return execSync('uptime', { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
};

async function engineInfo(browser, engine) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('data:text/html,<body>probe</body>');
  const webgl = await page.evaluate(() => {
    const c = document.createElement('canvas');
    const g = c.getContext('webgl2') || c.getContext('webgl');
    if (!g) return 'no webgl';
    const e = g.getExtension('WEBGL_debug_renderer_info');
    return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : g.getParameter(g.RENDERER);
  });
  const raf = await page.evaluate(
    () =>
      new Promise((res) => {
        const ts = [];
        const step = (t) => {
          ts.push(t);
          if (ts.length < 61) requestAnimationFrame(step);
          else {
            const d = ts.slice(1).map((t2, i) => t2 - ts[i]).sort((a, b) => a - b);
            res(Math.round(d[d.length >> 1] * 100) / 100);
          }
        };
        requestAnimationFrame(step);
      }),
  );
  await ctx.close();
  const soft = /swiftshader|llvmpipe|software/i.test(webgl);
  return {
    version: browser.version(),
    webgl,
    raf,
    note:
      engine === 'webkit'
        ? 'no CDP: no CPU throttling, LoAF, long tasks, traces or LayerTree; frames are in-page rAF deltas; timer resolution 1 ms'
        : soft
          ? 'SOFTWARE RENDERING: paint and raster numbers are inflated'
          : `GPU (${chromiumExecutable() ? 'Chrome for Testing, headless=new' : 'default'})`,
  };
}

async function measure(o) {
  const name = o.name || `run-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '')}`;
  const runDir = join(OUT, name);
  mkdirSync(join(runDir, 'raw'), { recursive: true });
  const P = allProfiles();
  const profNames = list(o.profiles, ['desktop', 'desktop-4x', 'phone-4x', 'safari', 'iphone']);
  const pageNames = list(o.pages, ['home', ...CASE_STUDIES]);
  if (pageNames.includes('all')) pageNames.splice(pageNames.indexOf('all'), 1, 'home', ...CASE_STUDIES, 'work', 'free');
  const passes = list(o.passes, ['load', 'scroll', 'trace', 'lag', 'layers', 'idle', 'interact']);
  const casePasses = list(o['case-passes'], ['load', 'scroll', 'trace']);
  const repeat = Number(o.repeat || 3);
  const target = o.target || 'prod';
  let server = null;
  let baseUrl;
  let resolver = null;
  if (target === 'prod') {
    const dir = resolve(ROOT, o['build-dir'] || '.scratch/build-perf');
    server = await startServer({ root: dir, port: Number(o.port || 4397) });
    baseUrl = server.url;
    // attribution: the maps build, matched chunk by chunk (see lib/sourcemap.mjs)
    resolver = makeResolver(ROOT, dir, resolve(ROOT, o['maps-dir'] || '.scratch/build-perf-maps'));
  } else if (target === 'dev') baseUrl = 'http://localhost:4321';
  else baseUrl = String(target).replace(/\/$/, '');
  const query = o.query && o.query !== true ? `?${o.query}` : '';
  const inject = o['inject-css'] || o['inject-js'] ? { css: o['inject-css'] ? readFileSync(resolve(ROOT, o['inject-css']), 'utf8') : null, js: o['inject-js'] ? readFileSync(resolve(ROOT, o['inject-js']), 'utf8') : null } : null;
  const loads = [];
  const metaPath = join(runDir, 'meta.json');
  const meta = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, 'utf8')) : {};
  Object.assign(meta, {
    name,
    target,
    baseUrl,
    query,
    reduced: !!o.reduced,
    inject: o['inject-css'] || o['inject-js'] ? { css: o['inject-css'] || null, js: o['inject-js'] || null } : null,
    started: meta.started || new Date().toISOString(),
    cpus: os.cpus().length,
    machine: `${os.cpus()[0]?.model || ''}, ${Math.round(os.totalmem() / 2 ** 30)} GB`,
    git: (() => {
      try {
        const head = execSync('git rev-parse --short HEAD', { cwd: ROOT, encoding: 'utf8' }).trim();
        const dirty = execSync('git status --porcelain', { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean).length;
        return `${head} + ${dirty} uncommitted paths`;
      } catch {
        return '?';
      }
    })(),
    engines: meta.engines || {},
    uptimeStart: uptimeText(),
    build: (() => {
      try {
        return JSON.parse(readFileSync(resolve(ROOT, o['build-dir'] || '.scratch/build-perf', '.perf-build.json'), 'utf8'));
      } catch {
        return null;
      }
    })(),
  });
  // a dev server whose optimized deps are stale serves 504s for gsap: every number from it would be wrong
  if (target === 'dev') {
    try {
      // the homepage script imports GSAP through Vite's optimized deps (with a ?v= hash); probe exactly that URL
      const mod = await (await fetch(`${baseUrl}/src/pages/index.astro?astro&type=script&index=0&lang.ts`)).text();
      const deps = [...new Set(mod.match(/\/node_modules\/\.vite\/deps\/gsap[^"']*/g) || [])];
      const statuses = {};
      for (const d of deps) statuses[d] = (await fetch(baseUrl + d)).status;
      const bad = Object.entries(statuses).filter(([, st]) => st !== 200);
      if (!deps.length) meta.invalid = 'could not find the GSAP dep URL in the dev homepage script';
      else if (bad.length) meta.invalid = `dev server answers ${bad.map(([d, st]) => `${st} for ${d}`).join(', ')} (stale optimized deps, "Outdated Optimize Dep"): the homepage has no GSAP motion, so these numbers are not comparable`;
      else delete meta.invalid;
      meta.devDepCheck = { at: new Date().toISOString(), statuses };
    } catch (e) {
      meta.devDepCheck = { error: String(e) };
    }
  }
  writeFileSync(metaPath, JSON.stringify(meta, null, 1));
  const engines = [...new Set(profNames.map((p) => P[p].engine))];
  const log = (s) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${s}`);
  for (const engine of engines) {
    // one browser at a time, closed before the next engine starts
    const browser = await launch(engine);
    meta.engines[engine] = await engineInfo(browser, engine);
    writeFileSync(metaPath, JSON.stringify(meta, null, 1));
    log(`${engine} ${meta.engines[engine].version} | ${meta.engines[engine].webgl} | rAF ${meta.engines[engine].raf} ms`);
    try {
      for (const pageName of pageNames) {
        const def = PAGES[pageName];
        if (!def) {
          log(`unknown page ${pageName}`);
          continue;
        }
        const url = baseUrl + def.path + query;
        const pagePasses = pageName === 'home' ? passes : passes.filter((p) => casePasses.includes(p));
        for (const profName of profNames.filter((p) => P[p].engine === engine)) {
          const prof = P[profName];
          for (const pass of pagePasses) {
            if (pass === 'interact' && !def.interact) continue;
            if ((pass === 'trace' || pass === 'inval' || pass === 'layers') && engine !== 'chromium') continue;
            if (pass === 'lag' && profName !== 'desktop' && profName !== 'safari') continue;
            const reps = pass === 'load' || pass === 'scroll' || pass === 'interact' ? (pass === 'interact' ? Math.min(repeat, 2) : repeat) : 1;
            for (let r = 1; r <= reps; r++) {
              const file = join(runDir, 'raw', `${pageName}__${profName}__${pass}__r${r}.json`);
              if (existsSync(file) && !o.force) {
                log(`skip ${pageName} ${profName} ${pass} r${r} (exists)`);
                continue;
              }
              const u0 = uptimeLoad();
              const t0 = Date.now();
              log(`${pageName} ${profName} ${pass} r${r}/${reps} (load ${u0})`);
              const raf = meta.engines[engine].raf;
              const opts = { root: ROOT, files: def.files, sections: def.sections, reduced: !!o.reduced, resolver, inject, nominal: raf < 12 ? 1000 / 120 : 1000 / 60, saveTrace: o['save-trace'] ? join(runDir, `${pageName}__${profName}__${pass}.json.gz`) : null };
              let data;
              try {
                const fn = { load: loadPass, scroll: scrollPass, trace: tracePass, inval: invalPass, lag: lagPass, layers: layersPass, idle: idlePass, interact: interactPass }[pass];
                data = await fn(browser, prof, url, opts);
              } catch (e) {
                data = { error: String(e && e.stack ? e.stack : e).slice(0, 2000) };
                log(`  ERROR ${String(e).slice(0, 300)}`);
              }
              const u1 = uptimeLoad();
              loads.push(u0, u1);
              writeFileSync(file, JSON.stringify({ key: { page: pageName, profile: profName, pass, repeat: r }, url, uptime: [u0, u1], ms: Date.now() - t0, data }));
              log(`  done in ${Math.round((Date.now() - t0) / 1000)} s`);
            }
          }
        }
      }
    } finally {
      await browser.close();
    }
  }
  if (server) await server.close();
  const ls = loads.filter((x) => x != null).sort((a, b) => a - b);
  meta.finished = new Date().toISOString();
  meta.uptimeEnd = uptimeText();
  const prev = meta.loadRange;
  meta.loadRange = ls.length ? { min: Math.min(ls[0], prev?.min ?? Infinity), max: Math.max(ls[ls.length - 1], prev?.max ?? -Infinity), median: ls[ls.length >> 1] } : prev;
  writeFileSync(metaPath, JSON.stringify(meta, null, 1));
  buildSummary(runDir);
  log(`wrote ${join(runDir, 'summary.md')}`);
}

// Both builds from one source snapshot, back to back: the measured one and its source-mapped twin.
// Never `npm run build` (other builders write dist/ at the same time), and never a build with the repo config
// (it rewrites node_modules/.vite/deps under the dev server). --verify <dir> builds into --build-dir and checks
// every file against <dir>.
async function build(o) {
  const { createHash } = await import('node:crypto');
  const { readdirSync, statSync } = await import('node:fs');
  const hash = createHash('sha1');
  const walk = (d) => {
    for (const f of readdirSync(d).sort()) {
      const p = join(d, f);
      const st = statSync(p);
      if (st.isDirectory()) walk(p);
      else hash.update(p.slice(ROOT.length)).update(readFileSync(p));
    }
  };
  walk(join(ROOT, 'src'));
  const snapshot = hash.digest('hex').slice(0, 12);
  const out = o['build-dir'] || '.scratch/build-perf';
  const maps = o['maps-dir'] || '.scratch/build-perf-maps';
  const t0 = Date.now();
  // both builds use their own Vite cache (astro.perf.config.mjs / astro.maps.config.mjs): a build with the repo
  // config rewrites node_modules/.vite/deps under the running dev server
  execSync(`npx astro build --config scripts/perf/astro.perf.config.mjs --outDir ${out}`, { cwd: ROOT, stdio: 'inherit' });
  if (o.verify) {
    // compare against another build of the same source (e.g. one made with the repo config): every file equal
    const { createHash: ch } = await import('node:crypto');
    const files = (d, base = d, acc = new Map()) => {
      for (const f of readdirSync(d)) {
        const p = join(d, f);
        if (statSync(p).isDirectory()) files(p, base, acc);
        else if (!p.endsWith('.perf-build.json')) acc.set(p.slice(base.length), ch('sha1').update(readFileSync(p)).digest('hex'));
      }
      return acc;
    };
    const A = files(resolve(ROOT, out));
    const B = files(resolve(ROOT, o.verify));
    const diff = [...new Set([...A.keys(), ...B.keys()])].filter((k) => A.get(k) !== B.get(k));
    console.log(diff.length ? `VERIFY: ${diff.length} files differ: ${diff.slice(0, 20).join(', ')}` : `VERIFY: identical to ${o.verify} (${A.size} files)`);
    return;
  }
  execSync(`npx astro build --config scripts/perf/astro.maps.config.mjs --outDir ${maps}`, { cwd: ROOT, stdio: 'inherit' });
  const info = { built: new Date().toISOString(), srcSnapshot: snapshot, seconds: (Date.now() - t0) / 1000, uptime: uptimeText() };
  writeFileSync(join(ROOT, out, '.perf-build.json'), JSON.stringify(info, null, 1));
  console.log(JSON.stringify(info));
}

const o = args(process.argv.slice(2));
const cmd = o._[0] || 'measure';
if (cmd === 'build') await build(o);
else if (cmd === 'measure') await measure(o);
else if (cmd === 'report') {
  buildSummary(join(OUT, o.name || o._[1]));
  console.log(join(OUT, o.name || o._[1], 'summary.md'));
} else if (cmd === 'brief') {
  // --vs <run>: every cell as "before -> after" (brief-vs-<run>.md)
  if (o.vs && o.vs !== true) console.log(briefVs(join(OUT, o.name || o._[1]), join(OUT, String(o.vs))));
  else console.log(brief(join(OUT, o.name || o._[1])));
} else if (cmd === 'compare') {
  const [a, b] = [o._[1], o._[2]];
  const p = compare(join(OUT, a), join(OUT, b), join(OUT, b, `compare-${a}.md`));
  console.log(p);
} else if (cmd === 'shots') await shots({ ...o, OUT, ROOT });
else if (cmd === 'diff') await diffShots({ a: join(OUT, o._[1]), b: join(OUT, o._[2]), OUT });
else if (cmd === 'probe') await import('./probe.mjs');
else console.log('commands: measure | report | compare <a> <b> | shots | diff <a> <b> | probe');
