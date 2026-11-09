// Screenshot mode for visual parity: fixed scroll positions, deterministic time, ffmpeg contact sheets, pixel diffs.
// Determinism: Math.random is seeded, Playwright's clock fakes Date / performance.now / timers / rAF, so GSAP,
// the canvases and the scrubs land on the same frame every run; CSS animations are finished or reset by the
// screenshot itself (animations: 'disabled'), and videos are paused on their first frame. Run it twice on the
// same build and `diff` should report no differences (that is the noise floor).
import { mkdirSync, writeFileSync, readdirSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch } from './pw.mjs';
import { profiles as allProfiles } from './profiles.mjs';
import { PAGES, CASE_STUDIES } from './pages.mjs';
import { startServer } from './server.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const INPAGE = readFileSync(join(HERE, 'inpage.js'), 'utf8');
const SEEDED = `(() => { let s = 0x2f6b9a1d; Math.random = function () { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const list = (v, d) => (v && v !== true ? String(v).split(',').map((s) => s.trim()).filter(Boolean) : d);

async function nativeFrames(page, n = 2) {
  await page.evaluate((n) => new Promise((res) => { let k = 0; const f = () => (++k >= n ? res() : window.__perf.nativeRAF(f)); window.__perf.nativeRAF(f); }), n);
}

// IntersectionObserver callbacks (they start the Vaultt app map, the case-study loops, ...) are tasks that run in
// real time. Left alone, one could land in the middle of runFor, at a fake time that depended on how fast the
// machine got through the fake frames: a page made cheaper elsewhere then started such a loop at another fake
// time, and the diff reported a change in code nobody touched (the app map's labels, 2026-11-07). Three rounds of
// a real frame plus a task let every pending callback run before the fake clock moves.
async function settle(page) {
  await page.evaluate(
    () =>
      new Promise((res) => {
        let k = 0;
        const ch = new MessageChannel();
        ch.port1.onmessage = () => (++k >= 3 ? res() : window.__perf.nativeRAF(() => ch.port2.postMessage(0)));
        window.__perf.nativeRAF(() => ch.port2.postMessage(0));
      }),
  );
}

// --step-clock: the fake clock moves one 16 ms frame at a time, with a real frame and a task after each, so an
// observer callback caused by what a fake frame changed (an element sliding into view) always runs at the same
// fake time. Without it the callback lands wherever real time puts it inside runFor, and two builds that differ
// only in how much work a frame costs can start an untouched loop (the Vaultt app map, a video picked by a CSS
// animation's clock) at different fake times. About ten times slower: use it with --only on contested shots.
async function advance(page, ms, step) {
  if (!step) return page.clock.runFor(ms);
  for (let t = 0; t < ms; t += 16) {
    await page.clock.runFor(Math.min(16, ms - t));
    await page.evaluate(
      () =>
        new Promise((res) => {
          window.__perf.nativeRAF(() => {
            const ch = new MessageChannel();
            ch.port1.onmessage = () => res();
            ch.port2.postMessage(0);
          });
        }),
    );
  }
}

async function freezeMedia(page) {
  await page.evaluate(async () => {
    const vids = Array.from(document.querySelectorAll('video'));
    await Promise.all(
      vids.map(
        (v) =>
          new Promise((res) => {
            try {
              v.pause();
              if (v.readyState >= 1 && v.currentTime !== 0) {
                const t = setTimeout(res, 2500);
                v.addEventListener('seeked', () => { clearTimeout(t); res(); }, { once: true });
                v.currentTime = 0;
              } else res();
            } catch {
              res();
            }
          }),
      ),
    );
  });
}

export async function shots(o) {
  const name = o.name || 'shots';
  const dir = join(o.OUT, name);
  mkdirSync(dir, { recursive: true });
  const P = allProfiles();
  const profNames = list(o.profiles, ['desktop', 'phone-4x', 'safari', 'iphone']);
  const pageNames = list(o.pages, ['home', ...CASE_STUDIES]);
  const target = o.target || 'prod';
  let server = null;
  let baseUrl;
  if (target === 'prod') {
    server = await startServer({ root: resolve(o.ROOT, o['build-dir'] || '.scratch/build-perf'), port: Number(o.port || 4397) });
    baseUrl = server.url;
  } else if (target === 'dev') baseUrl = 'http://localhost:4321';
  else baseUrl = String(target).replace(/\/$/, '');
  const query = o.query && o.query !== true ? `?${o.query}` : '';
  const fresh = !!o.fresh;
  const stepClock = !!o['step-clock'];
  const offline = !!o.offline;
  const injectJs = o['inject-js'] && o['inject-js'] !== true ? readFileSync(resolve(o.ROOT, o['inject-js']), 'utf8') : '';
  const injectCss = o['inject-css'] && o['inject-css'] !== true ? readFileSync(resolve(o.ROOT, o['inject-css']), 'utf8') : '';
  const index = { name, baseUrl, query, fresh, injectCss: o['inject-css'] || null, started: new Date().toISOString(), shots: [] };
  const engines = [...new Set(profNames.map((p) => P[p].engine))];
  for (const engine of engines) {
    const browser = await launch(engine);
    try {
      for (const profName of profNames.filter((p) => P[p].engine === engine)) {
        const prof = P[profName];
        for (const pageName of pageNames) {
          const def = PAGES[pageName];
          if (!def) continue;
          const outDir = join(dir, profName, pageName);
          mkdirSync(outDir, { recursive: true });
          // One loaded page at T0 with the intro finished. --fresh opens a new one for every position: in the
          // default sequential mode a loop that runs only near its section (the Vaultt world, say) reaches each
          // shot with a different amount of running time when its start point moves, and the diff reports that
          // history as a difference even when every frame it draws is the same.
          const open = async () => {
            const ctx = await browser.newContext({ ...prof.context, reducedMotion: o.reduced ? 'reduce' : 'no-preference' });
            // --offline: nothing but the local server (the web fonts come from fonts.bunny.net, and when one weight
            // lands decides which font a canvas that painted before it keeps: the Vaultt maps' labels)
            if (offline) await ctx.route('**/*', (r) => (new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort()));
            await ctx.addInitScript({ content: INPAGE });
            await ctx.addInitScript({ content: SEEDED });
            if (injectJs) await ctx.addInitScript({ content: injectJs });
            if (injectCss) await ctx.addInitScript({ content: `document.addEventListener('DOMContentLoaded',()=>{const s=document.createElement('style');s.textContent=${JSON.stringify(injectCss)};document.head.appendChild(s);});` });
            const page = await ctx.newPage();
            // paused from the very start: with the clock flowing during load, the fake time (and the number of fake
            // frames) before the first runFor depended on how long the load took, and the wheel, the sky's lens and
            // the reel landed differently on every run (first check: 3 of 28 shots identical)
            const T0 = new Date('2026-11-07T12:00:00Z');
            await page.clock.install({ time: T0 });
            await page.clock.pauseAt(T0);
            await page.goto(baseUrl + def.path + query, { waitUntil: 'load', timeout: 120000 });
            await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
            await page.evaluate(() => document.fonts && document.fonts.ready.then(() => 1)).catch(() => {});
            // intros, deals and the hero's 4.5 s failsafe all finish; then a few real frames on top
            await settle(page);
            await advance(page, 9000, stepClock);
            await nativeFrames(page, 3);
            return { ctx, page };
          };
          let cur = await open();
          const { vh, max } = await cur.page.evaluate(() => ({ vh: innerHeight, max: document.documentElement.scrollHeight - innerHeight }));
          let ys = [];
          if (pageName === 'home') {
            for (let y = 0; y < max; y += Math.round(vh / 2)) ys.push(y);
            ys.push(max);
          } else ys.push(0, Math.round(vh / 2)); // a case study's hero, and half a screen into it
          const only = list(o.only, null);
          let i = 0;
          for (const y of ys) {
            if (only && !only.includes(String(i))) { i++; continue; }
            if (fresh && i > 0) {
              await cur.ctx.close();
              cur = await open();
            }
            const page = cur.page;
            await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), y);
            await nativeFrames(page, 2);
            await settle(page);
            // the scrubs (0.35 to 0.7 s of smoothing) catch up on the fake clock
            await advance(page, 2500, stepClock);
            await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {});
            await freezeMedia(page);
            await advance(page, 100, stepClock);
            await nativeFrames(page, 2);
            const file = join(outDir, `${String(i).padStart(3, '0')}-y${y}.png`);
            await page.screenshot({ path: file, type: 'png', animations: 'disabled', caret: 'hide' });
            index.shots.push({ profile: profName, page: pageName, i, y, file: file.replace(dir + '/', '') });
            i++;
          }
          const ctx = cur.ctx;
          console.log(`[shots] ${profName} ${pageName}: ${ys.length}`);
          await ctx.close();
        }
      }
    } finally {
      await browser.close();
    }
  }
  if (server) await server.close();
  index.finished = new Date().toISOString();
  writeFileSync(join(dir, 'index.json'), JSON.stringify(index, null, 1));
  await sheets(dir, index);
}

// Labelled thumbnails (labels rendered by Chromium: this ffmpeg build has no drawtext), tiled by ffmpeg
export async function sheets(dir, index) {
  const groups = new Map();
  for (const s of index.shots) {
    const k = `${s.profile}/${s.page}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(s);
  }
  const labelsDir = join(dir, '.labels');
  mkdirSync(labelsDir, { recursive: true });
  const browser = await launch('chromium');
  const ctx = await browser.newContext({ viewport: { width: 480, height: 28 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  for (const [k, shotsOf] of groups) {
    const labels = [];
    for (const s of shotsOf) {
      const f = join(labelsDir, `${k.replace('/', '__')}-${s.i}.png`);
      await page.setContent(`<body style="margin:0;background:#111;color:#eee;font:600 15px/28px ui-monospace,Menlo,monospace;padding:0 8px">${s.page} · ${s.profile} · #${s.i} · y=${s.y}</body>`);
      await page.screenshot({ path: f });
      labels.push(f);
    }
    const cols = s0(shotsOf.length);
    const thumbW = 480;
    const inputs = [];
    shotsOf.forEach((s) => inputs.push('-i', join(dir, s.file)));
    labels.forEach((l) => inputs.push('-i', l));
    const n = shotsOf.length;
    const parts = [];
    for (let j = 0; j < n; j++) parts.push(`[${j}:v]scale=${thumbW}:-2,setsar=1[t${j}];[${n + j}:v]scale=${thumbW}:28,setsar=1[l${j}];[t${j}][l${j}]vstack[c${j}]`);
    const rows = Math.ceil(n / cols);
    // pad the grid with blank frames so tile always flushes
    const pad = rows * cols - n;
    const chain = `${parts.join(';')};${Array.from({ length: n }, (_, j) => `[c${j}]`).join('')}concat=n=${n}:v=1:a=0[all];[all]tpad=stop=${pad}:stop_mode=add:color=black,tile=${cols}x${rows}:padding=6:margin=6:color=0x222222[out]`;
    const out = join(dir, `sheet-${k.replace('/', '__')}.jpg`);
    const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', chain, '-map', '[out]', '-frames:v', '1', '-q:v', '3', out], { encoding: 'utf8' });
    if (r.status !== 0) console.log(`[sheets] ffmpeg failed for ${k}: ${r.stderr.slice(0, 400)}`);
    else console.log(`[sheets] ${out}`);
  }
  await browser.close();
  rmSync(labelsDir, { recursive: true, force: true });
}
const s0 = (n) => (n <= 4 ? n : n <= 12 ? 4 : n <= 30 ? 6 : 8);

// Pixel diff of two shot runs: SSIM per position, triptych (A | B | difference x8) for every position that differs
export async function diffShots({ a, b, OUT }) {
  const A = JSON.parse(readFileSync(join(a, 'index.json'), 'utf8'));
  const B = JSON.parse(readFileSync(join(b, 'index.json'), 'utf8'));
  const outDir = join(b, `diff-vs-${basename(a)}`);
  mkdirSync(outDir, { recursive: true });
  const rows = [];
  for (const s of B.shots) {
    const t = A.shots.find((x) => x.profile === s.profile && x.page === s.page && x.y === s.y) || A.shots.find((x) => x.profile === s.profile && x.page === s.page && x.i === s.i);
    if (!t) continue;
    const fa = join(a, t.file);
    const fb = join(b, s.file);
    const r = spawnSync('ffmpeg', ['-loglevel', 'info', '-i', fa, '-i', fb, '-lavfi', 'ssim;[0:v][1:v]psnr', '-f', 'null', '-'], { encoding: 'utf8' });
    const ssim = /SSIM .*All:([\d.]+)/.exec(r.stderr);
    const psnr = /PSNR .*average:([\d.]+|inf)/.exec(r.stderr);
    const row = { profile: s.profile, page: s.page, i: s.i, y: s.y, ssim: ssim ? Number(ssim[1]) : null, psnr: psnr ? (psnr[1] === 'inf' ? Infinity : Number(psnr[1])) : null };
    if (row.psnr !== Infinity) {
      const out = join(outDir, `${s.profile}__${s.page}__${String(s.i).padStart(3, '0')}.jpg`);
      spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', fa, '-i', fb, '-filter_complex', '[0:v][1:v]blend=all_mode=difference,lutrgb=r=val*8:g=val*8:b=val*8[d];[0:v][1:v][d]hstack=3,scale=1800:-2', '-frames:v', '1', '-q:v', '3', out]);
      row.triptych = out.replace(b + '/', '');
    }
    rows.push(row);
  }
  const md = [`# Screenshot diff: ${basename(a)} -> ${basename(b)}`, '', 'Identical shots (PSNR inf) are not listed. Triptychs: before | after | difference x8.', '', '| profile | page | # | y | SSIM | PSNR dB | triptych |', '|---|---|--:|--:|--:|--:|---|'];
  for (const r of rows.filter((x) => x.psnr !== Infinity).sort((x, y) => (x.ssim ?? 1) - (y.ssim ?? 1))) md.push(`| ${r.profile} | ${r.page} | ${r.i} | ${r.y} | ${r.ssim} | ${r.psnr == null ? '' : r.psnr.toFixed(1)} | ${r.triptych || ''} |`);
  md.push('', `${rows.filter((x) => x.psnr === Infinity).length} of ${rows.length} shots identical.`);
  writeFileSync(join(outDir, 'diff.md'), md.join('\n'));
  writeFileSync(join(outDir, 'diff.json'), JSON.stringify(rows, null, 1));
  console.log(join(outDir, 'diff.md'));
}
