// The measurement passes. Each pass opens a fresh browser context (empty cache, first visit) unless noted.
//   load     bytes by type before any scroll and after a full scroll, requests, FCP, LCP, TBT, CLS, audio
//   scroll   steady trackpad-speed scroll top to bottom, then a fast fling pass; frames per section
//   trace    the steady scroll again with a Chromium trace: style, layout, paint, raster, GPU per section
//   lag      scrub smoothing: how far each scrubbed animation trails the scroll (deliberate, not jank)
//   layers   composited layers, layer area and JS heap at each section (Chromium LayerTree)
//   idle     10 s at rest at each section: main-thread busy %, rAF calls/s, running animations, media
//   interact hero wheel drag and flick, card hover, "See our work", pointer through EP and Vaultt
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { summarize, shareOver } from './stats.mjs';
import { scrollDown, jumpTo, waitScrollIdle, pointerFigure8, mouseDrag, touchDrag } from './drive.mjs';
import { startTrace, aggregate, TRACE_CATEGORIES, IDLE_CATEGORIES, INVAL_CATEGORIES } from './trace.mjs';
import { lagModel, scrubSites } from './lag.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const INPAGE = readFileSync(join(HERE, 'inpage.js'), 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- opening a page
export async function openPage(browser, prof, url, { reduced = false, settleMs = 4000, initScripts = [], inject = null } = {}) {
  const ctx = await browser.newContext({ ...prof.context, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  await ctx.addInitScript({ content: INPAGE });
  for (const s of initScripts) await ctx.addInitScript({ content: s });
  // experiments (--inject-css / --inject-js): measurement-only changes, nothing in src/ is touched
  if (inject?.css) await ctx.addInitScript({ content: `document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.dataset.perfInject = ''; s.textContent = ${JSON.stringify(inject.css)}; document.head.appendChild(s); });` });
  if (inject?.js) await ctx.addInitScript({ content: inject.js });
  const page = await ctx.newPage();
  // script errors are regressions too: kept with every pass result
  const errors = [];
  page.on('pageerror', (e) => errors.length < 20 && errors.push(`pageerror: ${String(e && e.message ? e.message : e).slice(0, 300)}`));
  page.on('console', (m) => m.type() === 'error' && errors.length < 20 && errors.push(`console: ${m.text().slice(0, 300)}`));
  const reqs = trackRequests(page);
  let cdp = null;
  if (prof.engine === 'chromium') {
    cdp = await ctx.newCDPSession(page);
    await cdp.send('Performance.enable', { timeDomain: 'timeTicks' });
    if (prof.cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: prof.cpu });
  }
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  const loadMs = Date.now() - t0;
  await settle(page, reqs, settleMs);
  return { ctx, page, cdp, reqs, loadMs, t0, errors };
}

// Network bookkeeping from Playwright events (works in both engines)
function trackRequests(page) {
  const list = [];
  const inflight = new Set();
  const t0 = Date.now();
  page.on('request', (r) => {
    inflight.add(r);
    list.push({ r, url: r.url(), type: r.resourceType(), t: Date.now() - t0, done: false });
  });
  const fin = async (r, failed) => {
    inflight.delete(r);
    const it = list.find((x) => x.r === r);
    if (!it) return;
    it.done = true;
    it.failed = failed;
    it.tEnd = Date.now() - t0;
    try {
      const resp = await r.response();
      it.status = resp ? resp.status() : 0;
      it.mime = resp ? (resp.headers()['content-type'] || '').split(';')[0] : '';
      const s = await r.sizes();
      it.bytes = (s.responseBodySize || 0) + (s.responseHeadersSize || 0);
      it.body = s.responseBodySize || 0;
    } catch {
      it.bytes = it.bytes || 0;
    }
  };
  page.on('requestfinished', (r) => fin(r, false));
  page.on('requestfailed', (r) => fin(r, true));
  return {
    list,
    inflight,
    mark() {
      return list.length;
    },
    async idle(quietMs = 600, maxMs = 10000) {
      const s = Date.now();
      let since = Date.now();
      while (Date.now() - s < maxMs) {
        await sleep(100);
        // media streams keep a range request open; they do not count against "idle"
        const busy = [...inflight].filter((r) => r.resourceType() !== 'media').length;
        if (busy) since = Date.now();
        else if (Date.now() - since > quietMs) return true;
      }
      return false;
    },
  };
}

async function settle(page, reqs, ms) {
  await reqs.idle(600, 10000);
  await page.evaluate(() => document.fonts && document.fonts.ready.then(() => true)).catch(() => {});
  await sleep(ms);
}

async function getSections(page, sel) {
  return page.evaluate((sel) => window.__perf.sections(sel), sel || null);
}

// which section a document y (viewport centre) is in
function sectionFinder(secInfo) {
  const { sections, vh } = secInfo;
  return (y) => {
    const c = y + vh / 2;
    for (const s of sections) if (c >= s.top && c < s.bottom) return s.name;
    if (sections.length && c >= sections[sections.length - 1].bottom) return sections[sections.length - 1].name;
    return sections.length ? sections[0].name : 'page';
  };
}

// ---------------------------------------------------------------- frames -> per-section stats
function yAtFactory(dump) {
  const f = dump.frames;
  const n = f.length / 3;
  return (t) => {
    let lo = 0;
    let hi = n - 1;
    let best = 0;
    while (lo <= hi) {
      const m = (lo + hi) >> 1;
      if (f[m * 3] <= t) {
        best = m;
        lo = m + 1;
      } else hi = m - 1;
    }
    return n ? f[best * 3 + 2] : 0;
  };
}

export function frameStats(dump, secInfo, nominal, resolver = null) {
  const secOf = sectionFinder(secInfo);
  const f = dump.frames;
  const n = f.length / 3;
  const by = new Map();
  const get = (k) => {
    if (!by.has(k)) by.set(k, { interval: [], work: [], ms: 0 });
    return by.get(k);
  };
  const all = { interval: [], work: [], ms: 0 };
  for (let i = 1; i < n; i++) {
    const ts = f[i * 3];
    const end = f[i * 3 + 1];
    const y = f[i * 3 + 2];
    const iv = ts - f[(i - 1) * 3];
    const wk = end - ts;
    const s = get(secOf(y));
    s.interval.push(iv);
    s.work.push(wk);
    s.ms += iv;
    all.interval.push(iv);
    all.work.push(wk);
    all.ms += iv;
  }
  const yAt = yAtFactory(dump);
  const lt = new Map();
  for (const t of dump.longtasks || []) {
    const k = secOf(yAt(t.start));
    const v = lt.get(k) || { n: 0, ms: 0, max: 0 };
    v.n++;
    v.ms += t.duration;
    v.max = Math.max(v.max, t.duration);
    lt.set(k, v);
  }
  const lf = new Map();
  for (const l of dump.loaf || []) {
    const k = secOf(yAt(l.start));
    const v = lf.get(k) || { n: 0, ms: 0, blocking: 0, max: 0, forcedMs: 0, scripts: {} };
    v.n++;
    v.ms += l.duration;
    v.blocking += l.blocking || 0;
    v.max = Math.max(v.max, l.duration);
    for (const s of l.scripts || []) {
      const src = resolver && s.url ? resolver.char(s.url, s.pos) : null;
      const key = `${s.type || ''} ${s.invoker || ''} @ ${src || `${String(s.url || '').replace(/^https?:\/\/[^/]+/, '')}:${s.pos ?? ''}`} ${s.fn || ''}`.trim();
      const e = v.scripts[key] || { n: 0, ms: 0, forced: 0 };
      e.n++;
      e.ms += s.duration || 0;
      e.forced += s.forced || 0;
      v.forcedMs += s.forced || 0;
      v.scripts[key] = e;
    }
    lf.set(k, v);
  }
  const ev = new Map();
  for (const e of dump.events || []) {
    const k = secOf(yAt(e.start));
    const v = ev.get(k) || [];
    v.push(e);
    ev.set(k, v);
  }
  const drop = nominal * 1.5;
  const pack = (s, k) => {
    const iv = summarize(s.interval);
    const wk = summarize(s.work);
    const l = k ? lt.get(k) : [...lt.values()].reduce((a, b) => ({ n: a.n + b.n, ms: a.ms + b.ms, max: Math.max(a.max, b.max) }), { n: 0, ms: 0, max: 0 });
    const lo = k
      ? lf.get(k)
      : [...lf.values()].reduce(
          (a, b) => {
            a.n += b.n;
            a.ms += b.ms;
            a.blocking += b.blocking;
            a.max = Math.max(a.max, b.max);
            a.forcedMs += b.forcedMs;
            for (const [key, v] of Object.entries(b.scripts)) {
              const e = a.scripts[key] || (a.scripts[key] = { n: 0, ms: 0, forced: 0 });
              e.n += v.n;
              e.ms += v.ms;
              e.forced += v.forced;
            }
            return a;
          },
          { n: 0, ms: 0, blocking: 0, max: 0, forcedMs: 0, scripts: {} },
        );
    const events = k ? ev.get(k) || [] : dump.events || [];
    return {
      frames: iv.n || 0,
      seconds: s.ms / 1000,
      fps: s.ms ? (iv.n / s.ms) * 1000 : null,
      intP50: iv.p50,
      intP95: iv.p95,
      intP99: iv.p99,
      intMax: iv.max,
      workP50: wk.p50,
      workP95: wk.p95,
      workP99: wk.p99,
      workMax: wk.max,
      over8: shareOver(s.work, 8.33),
      over16: shareOver(s.work, 16.67),
      over33: shareOver(s.work, 33.3),
      // frame time = interval, the brief's targets: over 9.5 ms is a dropped 120 Hz frame, over 17.5 ms is more
      // than one 60 Hz frame (the "under 16.7 ms" bar, with vsync jitter), over 34 ms is three 120 Hz frames
      intOver8: shareOver(s.interval, 9.5),
      intOver16: shareOver(s.interval, 17.5),
      intOver33: shareOver(s.interval, 34),
      dropped: shareOver(s.interval, drop),
      gaps50: s.interval.filter((x) => x > 50).length,
      longN: l ? l.n : 0,
      longMs: l ? l.ms : 0,
      longMax: l ? l.max : 0,
      loafN: lo ? lo.n : 0,
      loafMs: lo ? lo.ms : 0,
      loafBlocking: lo ? lo.blocking : 0,
      loafForcedMs: lo ? lo.forcedMs : 0,
      loafTop: lo
        ? Object.entries(lo.scripts)
            .sort((a, b) => b[1].ms - a[1].ms)
            .slice(0, 5)
            .map(([key, v]) => ({ key, n: v.n, ms: Math.round(v.ms), forced: Math.round(v.forced) }))
        : [],
      eventsSlow: events.length,
      eventMax: events.reduce((m, e) => Math.max(m, e.duration), 0),
    };
  };
  const sections = {};
  for (const s of secInfo.sections) if (by.has(s.name)) sections[s.name] = pack(by.get(s.name), s.name);
  for (const [k, v] of by) if (!sections[k]) sections[k] = pack(v, k);
  return { all: pack(all, null), sections };
}

// raw frames kept in the result (0.1 ms resolution) so new statistics can be computed from old runs
const packFrames = (dump) => dump.frames.map((x) => Math.round(x * 10) / 10);

async function nominalInterval(page) {
  await page.evaluate(() => window.__perf.start());
  await sleep(700);
  await page.evaluate(() => window.__perf.stop());
  const d = await page.evaluate(() => window.__perf.dump());
  const f = d.frames;
  const iv = [];
  for (let i = 3; i < f.length; i += 3) iv.push(f[i] - f[i - 3]);
  iv.sort((a, b) => a - b);
  return iv.length ? iv[iv.length >> 1] : 16.67;
}

// Chromium Performance.getMetrics, as a map
async function metrics(cdp) {
  if (!cdp) return null;
  const { metrics: m } = await cdp.send('Performance.getMetrics');
  return Object.fromEntries(m.map((x) => [x.name, x.value]));
}
const METRIC_KEYS = ['RecalcStyleCount', 'RecalcStyleDuration', 'LayoutCount', 'LayoutDuration', 'ScriptDuration', 'TaskDuration', 'TaskOtherDuration', 'V8CompileDuration'];
function metricDelta(a, b) {
  if (!a || !b) return null;
  const o = {};
  for (const k of METRIC_KEYS) o[k] = (b[k] ?? 0) - (a[k] ?? 0);
  for (const k of ['RecalcStyleDuration', 'LayoutDuration', 'ScriptDuration', 'TaskDuration', 'TaskOtherDuration', 'V8CompileDuration']) o[k] *= 1000; // s to ms
  o.JSHeapUsedMB = (b.JSHeapUsedSize ?? 0) / 1048576;
  o.Nodes = b.Nodes;
  o.LayoutObjects = b.LayoutObjects;
  return o;
}

// sample getMetrics while a pass runs, so style/layout/script deltas and the heap land on a section
function metricSampler(cdp, page) {
  if (!cdp) return { stop: async () => [] };
  const samples = [];
  let on = true;
  const run = (async () => {
    while (on) {
      try {
        const m = await metrics(cdp);
        const y = await page.evaluate(() => window.scrollY);
        samples.push({ m, y });
      } catch {}
      await sleep(300);
    }
  })();
  return {
    async stop() {
      on = false;
      await run;
      return samples;
    },
  };
}
function metricsBySection(samples, secInfo) {
  const secOf = sectionFinder(secInfo);
  const out = {};
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1];
    const b = samples[i];
    const k = secOf(b.y);
    const d = metricDelta(a.m, b.m);
    if (!d) continue;
    const o = out[k] || (out[k] = { RecalcStyleCount: 0, RecalcStyleDuration: 0, LayoutCount: 0, LayoutDuration: 0, ScriptDuration: 0, TaskDuration: 0, heapMaxMB: 0, nodesMax: 0, layoutObjectsMax: 0 });
    for (const key of ['RecalcStyleCount', 'RecalcStyleDuration', 'LayoutCount', 'LayoutDuration', 'ScriptDuration', 'TaskDuration']) o[key] += d[key];
    o.heapMaxMB = Math.max(o.heapMaxMB, d.JSHeapUsedMB);
    o.nodesMax = Math.max(o.nodesMax, d.Nodes || 0);
    o.layoutObjectsMax = Math.max(o.layoutObjectsMax, d.LayoutObjects || 0);
  }
  return out;
}

// "at fn (url:line:col) < at ..." -> source positions where the attribution build knows them
function resolveStack(st, resolver) {
  if (!resolver) return st;
  return st.replace(/(https?:\/\/[^\s)]+\/_astro\/[^\s):]+\.js):(\d+):(\d+)/g, (m, url, line, col) => resolver.at(url, Number(line), Number(col) - 1) || m);
}

// ---------------------------------------------------------------- passes
export async function loadPass(browser, prof, url, opts) {
  const o = await openPage(browser, prof, url, { ...opts, settleMs: 5000 });
  const { page, reqs, ctx } = o;
  const before = await page.evaluate(() => ({
    lcp: window.__perf.lcp.slice(),
    paints: window.__perf.paints.slice(),
    longtasks: window.__perf.longtasks.slice(),
    shifts: window.__perf.shifts.slice(),
    audio: window.__perf.audio.slice(),
    support: window.__perf.support,
    nav: (() => {
      const n = performance.getEntriesByType('navigation')[0];
      return n ? { dcl: n.domContentLoadedEventEnd, load: n.loadEventEnd, ttfb: n.responseStart } : null;
    })(),
    now: performance.now(),
  }));
  const nBefore = reqs.list.length;
  await scrollDown(page, { prof, cdp: o.cdp, speed: prof.flingSpeed });
  await sleep(1500);
  await reqs.idle(800, 12000);
  const after = await page.evaluate(() => ({ audio: window.__perf.audio.slice(), shifts: window.__perf.shifts.slice() }));
  await sleep(500);
  const summarizeReqs = (list) => {
    const by = {};
    for (const it of list) {
      const cls = classify(it);
      const b = by[cls] || (by[cls] = { n: 0, bytes: 0 });
      b.n++;
      b.bytes += it.bytes || 0;
    }
    return by;
  };
  const listBefore = reqs.list.slice(0, nBefore);
  const fcp = (before.paints.find((p) => p.name === 'first-contentful-paint') || {}).start ?? null;
  const tbtWindowEnd = before.now;
  const tbt = before.longtasks.filter((t) => fcp != null && t.start >= fcp && t.start <= tbtWindowEnd).reduce((a, t) => a + Math.max(0, t.duration - 50), 0);
  const lcp = before.lcp.length ? before.lcp[before.lcp.length - 1] : null;
  const clsOf = (sh) => sh.filter((s) => !s.input).reduce((a, s) => a + s.value, 0);
  const res = {
    loadMs: o.loadMs,
    nav: before.nav,
    fcp,
    lcp: lcp ? { start: lcp.start, size: lcp.size, el: lcp.el, url: lcp.url.replace(/^https?:\/\/[^/]+/, '') } : null,
    tbt: prof.engine === 'chromium' ? tbt : null,
    longTasksBeforeScroll: prof.engine === 'chromium' ? before.longtasks.length : null,
    clsBeforeScroll: before.support.shift ? clsOf(before.shifts) : null,
    clsTotal: before.support.shift ? clsOf(after.shifts) : null,
    shiftSources: after.shifts.filter((s) => !s.input && s.value > 0.001).slice(0, 10),
    before: summarizeReqs(listBefore),
    after: summarizeReqs(reqs.list),
    requestsBefore: listBefore.length,
    requestsAfter: reqs.list.length,
    // everything fetched before the first scroll, biggest first (what loads before it is needed)
    earlyBig: listBefore
      .filter((x) => (x.bytes || 0) > 15000)
      .sort((a, b) => (b.bytes || 0) - (a.bytes || 0))
      .slice(0, 30)
      .map((x) => ({ url: x.url.replace(/^https?:\/\/[^/]+/, ''), cls: classify(x), kb: Math.round((x.bytes || 0) / 1024), t: x.t })),
    allRequests: reqs.list.map((x) => ({ url: x.url.replace(/^https?:\/\/[^/]+/, ''), cls: classify(x), bytes: x.bytes || 0, t: x.t, beforeScroll: reqs.list.indexOf(x) < nBefore, status: x.status })),
    audioBeforePress: after.audio.filter((a) => a.beforePress),
    audioRequestsBeforePress: reqs.list.filter((x) => classify(x) === 'audio').map((x) => ({ url: x.url.replace(/^https?:\/\/[^/]+/, ''), t: x.t, beforeScroll: reqs.list.indexOf(x) < nBefore })),
    support: before.support,
  };
  await ctx.close();
  return res;
}

function classify(it) {
  const u = it.url.split('?')[0].toLowerCase();
  const m = it.mime || '';
  if (/\.(mp3|wav|ogg|m4a|aac)$/.test(u) || m.startsWith('audio/')) return 'audio';
  if (/\.(mp4|webm|mov|m4v)$/.test(u) || m.startsWith('video/')) return 'video';
  if (it.type === 'document') return 'html';
  if (it.type === 'script' || /\.m?js$/.test(u)) return 'js';
  if (it.type === 'stylesheet' || /\.css$/.test(u)) return 'css';
  if (it.type === 'font' || /\.(woff2?|ttf|otf)$/.test(u) || m.startsWith('font/')) return 'font';
  if (it.type === 'image' || m.startsWith('image/') || /\.(png|jpe?g|webp|avif|gif|svg|ico)$/.test(u)) return 'image';
  if (it.type === 'fetch' || it.type === 'xhr') return 'fetch';
  return 'other';
}

export async function scrollPass(browser, prof, url, opts) {
  const o = await openPage(browser, prof, url, opts);
  const { page, cdp, ctx } = o;
  const secInfo = await getSections(page, opts.sections);
  const pageCadence = await nominalInterval(page);
  // the display's cadence (blank page, unthrottled), not the page's: a throttled page would set its own bar
  const nominal = opts.nominal || pageCadence;
  const out = { loadMs: o.loadMs, nominal, pageCadence, secInfo, steady: null, fling: null };
  // steady: top to bottom at trackpad speed
  const m0 = await metrics(cdp);
  const sampler = metricSampler(cdp, page);
  await page.evaluate(() => window.__perf.start());
  const drive = await scrollDown(page, { prof, cdp, speed: prof.steadySpeed });
  await sleep(800);
  await page.evaluate(() => window.__perf.stop());
  const samples = await sampler.stop();
  const m1 = await metrics(cdp);
  const dump = await page.evaluate(() => window.__perf.dump());
  out.steady = { drive, totals: metricDelta(m0, m1), stats: frameStats(dump, secInfo, nominal, opts.resolver), bySection: metricsBySection(samples, secInfo), heapEndMB: m1 ? m1.JSHeapUsedSize / 1048576 : null, frames: packFrames(dump) };
  // fling: back to the top, let it settle, then fast
  await jumpTo(page, 0);
  await sleep(2500);
  const f0 = await metrics(cdp);
  await page.evaluate(() => window.__perf.start());
  const drive2 = await scrollDown(page, { prof, cdp, speed: prof.flingSpeed, fling: true });
  await sleep(800);
  await page.evaluate(() => window.__perf.stop());
  const f1 = await metrics(cdp);
  const dump2 = await page.evaluate(() => window.__perf.dump());
  out.fling = { drive: drive2, totals: metricDelta(f0, f1), stats: frameStats(dump2, secInfo, nominal, opts.resolver), frames: packFrames(dump2) };
  out.errors = o.errors.slice();
  await ctx.close();
  return out;
}

export async function invalPass(browser, prof, url, opts) {
  return tracePass(browser, prof, url, { ...opts, invalidations: true });
}

export async function tracePass(browser, prof, url, opts) {
  if (prof.engine !== 'chromium') return { skipped: 'no tracing in WebKit' };
  const o = await openPage(browser, prof, url, opts);
  const { page, cdp, ctx } = o;
  const secInfo = await getSections(page, opts.sections);
  const nominal = opts.nominal || (await nominalInterval(page));
  const tr = await startTrace(browser, { categories: opts.invalidations ? INVAL_CATEGORIES : TRACE_CATEGORIES, savePath: opts.saveTrace || undefined });
  await sleep(300);
  await page.evaluate(() => window.__perf.start());
  const syncPageMs = await page.evaluate(() => performance.mark('__perf_sync_start').startTime);
  await scrollDown(page, { prof, cdp, speed: prof.steadySpeed });
  await sleep(600);
  await page.evaluate(() => window.__perf.stop());
  const kept = await tr.stop();
  const dump = await page.evaluate(() => window.__perf.dump());
  const secOf = sectionFinder(secInfo);
  const yAt = yAtFactory(dump);
  const t0 = dump.t0;
  const t1 = dump.t1;
  const agg = aggregate(kept, { syncPageMs, resolver: opts.resolver, sectionAt: (t) => (t < t0 || t > t1 ? null : secOf(yAt(t))) });
  const res = { nominal, secInfo, trace: agg, stats: frameStats(dump, secInfo, nominal, opts.resolver), events: kept.length };
  await ctx.close();
  return res;
}

// Scrub smoothing: modelled (see lib/lag.mjs), for every scrub value in the code the page runs
export async function lagPass(browser, prof, url, opts) {
  const sites = scrubSites(opts.root, opts.files || []);
  const frameMs = opts.nominal || 1000 / 60;
  const values = [...new Set(sites.map((s) => s.scrub))].filter((v) => typeof v === 'number').sort((a, b) => a - b);
  const model = Object.fromEntries(values.map((v) => [v, lagModel(v, prof.steadySpeed, frameMs)]));
  return { speed: prof.steadySpeed, frameMs, model, sites };
}

export async function layersPass(browser, prof, url, opts) {
  if (prof.engine !== 'chromium') return { skipped: 'no LayerTree in WebKit' };
  const o = await openPage(browser, prof, url, opts);
  const { page, cdp, ctx } = o;
  const secInfo = await getSections(page, opts.sections);
  let latest = null;
  cdp.on('LayerTree.layerTreeDidChange', (e) => {
    if (e.layers) latest = e.layers;
  });
  await cdp.send('DOM.enable');
  await cdp.send('LayerTree.enable');
  const dpr = prof.context.deviceScaleFactor || 1;
  const vh = secInfo.vh;
  const vw = secInfo.vw;
  const points = [];
  for (const s of secInfo.sections) {
    points.push({ name: s.name, y: s.top });
    if (s.bottom - s.top > vh * 2.2) points.push({ name: `${s.name} (mid)`, y: Math.round((s.top + s.bottom) / 2 - vh / 2) });
  }
  const res = [];
  for (const p of points) {
    await jumpTo(page, p.y);
    await sleep(1400);
    latest = null;
    // nudge so a fresh tree is reported
    await page.evaluate(() => window.scrollBy(0, 1));
    await sleep(500);
    const layers = latest || [];
    const draws = layers.filter((l) => l.drawsContent);
    const area = (l) => l.width * l.height;
    const big = draws.slice().sort((a, b) => area(b) - area(a)).slice(0, 8);
    const top = [];
    for (const l of big) {
      let node = '';
      let reasons = [];
      try {
        if (l.backendNodeId) {
          const d = await cdp.send('DOM.describeNode', { backendNodeId: l.backendNodeId });
          const n = d.node;
          const attrs = {};
          for (let i = 0; i < (n.attributes || []).length; i += 2) attrs[n.attributes[i]] = n.attributes[i + 1];
          node = `${n.nodeName.toLowerCase()}${attrs.id ? '#' + attrs.id : ''}${attrs.class ? '.' + attrs.class.trim().split(/\s+/).slice(0, 2).join('.') : ''}`;
        }
        const r = await cdp.send('LayerTree.compositingReasons', { layerId: l.layerId });
        reasons = r.compositingReasonIds || r.compositingReasons || [];
      } catch {}
      top.push({ node, w: Math.round(l.width), h: Math.round(l.height), mpx: (area(l) * dpr * dpr) / 1e6, paints: l.paintCount, reasons: reasons.slice(0, 4) });
    }
    const m = await metrics(cdp);
    res.push({
      at: p.name,
      y: p.y,
      layers: layers.length,
      drawing: draws.length,
      // device pixels of every content layer, and the same clipped to the viewport size per layer (a rough upper
      // bound on resident tiles; big layers are tiled and only rastered near the viewport)
      areaMPx: draws.reduce((a, l) => a + area(l), 0) * dpr * dpr / 1e6,
      clippedMPx: draws.reduce((a, l) => a + Math.min(l.width, vw) * Math.min(l.height, vh * 2), 0) * dpr * dpr / 1e6,
      estMB: (draws.reduce((a, l) => a + Math.min(l.width, vw) * Math.min(l.height, vh * 2), 0) * dpr * dpr * 4) / 1048576,
      overViewport: draws.filter((l) => l.width * l.height > vw * vh).length,
      heapMB: m ? m.JSHeapUsedSize / 1048576 : null,
      nodes: m ? m.Nodes : null,
      layoutObjects: m ? m.LayoutObjects : null,
      top,
    });
  }
  await cdp.send('LayerTree.disable').catch(() => {});
  await ctx.close();
  return { points: res };
}

export async function idlePass(browser, prof, url, opts) {
  const o = await openPage(browser, prof, url, opts);
  const { page, cdp, ctx } = o;
  const secInfo = await getSections(page, opts.sections);
  const vh = secInfo.vh;
  const points = secInfo.sections.map((s) => ({ name: s.name, y: Math.max(0, Math.min(secInfo.height - vh, Math.round(s.top + Math.min(vh * 0.3, (s.bottom - s.top - vh) / 2)))) }));
  const res = [];
  const ms = opts.idleMs || 10000;
  for (const p of points) {
    await jumpTo(page, p.y);
    await sleep(2500);
    const m0 = await metrics(cdp);
    const c0 = await page.evaluate(() => {
      window.__perf.rafSites = {};
      window.__perf.rafSample = 5;
      return window.__perf.rafCalls;
    });
    let tr = null;
    if (cdp && opts.idleTrace !== false) tr = await startTrace(browser, { categories: IDLE_CATEGORIES });
    const syncPageMs = await page.evaluate(() => performance.mark('__perf_sync_start').startTime);
    const pt0 = syncPageMs;
    await sleep(ms);
    const pt1 = await page.evaluate(() => performance.now());
    const kept = tr ? await tr.stop() : null;
    const c1 = await page.evaluate(() => {
      window.__perf.rafSample = 0;
      return { calls: window.__perf.rafCalls, sites: window.__perf.rafSites };
    });
    const m1 = await metrics(cdp);
    const rest = await page.evaluate(() => window.__perf.restReport());
    const d = metricDelta(m0, m1);
    let agg = null;
    if (kept) {
      const a = aggregate(kept, { syncPageMs, resolver: opts.resolver, sectionAt: (t) => (t >= pt0 && t <= pt1 ? p.name : null) });
      agg = a.sections ? a.sections[p.name] || null : a;
    }
    const secs = (pt1 - pt0) / 1000;
    res.push({
      at: p.name,
      y: p.y,
      seconds: secs,
      busyPct: d ? (d.TaskDuration / (secs * 1000)) * 100 : null,
      scriptPct: d ? (d.ScriptDuration / (secs * 1000)) * 100 : null,
      styleN: d ? d.RecalcStyleCount : null,
      layoutN: d ? d.LayoutCount : null,
      rafPerSec: (c1.calls - c0) / secs,
      rafSites: Object.entries(c1.sites)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([k, v]) => ({ k: resolveStack(k, opts.resolver), n: v * 5 })),
      anims: rest.anims,
      media: rest.media,
      canvases: rest.canvases,
      trace: agg
        ? {
            mainTaskMs: agg.mainTaskMs,
            styleN: agg.styleN,
            styleMs: agg.styleMs,
            layoutN: agg.layoutN,
            paintN: agg.paintN,
            paintMs: agg.paintMs,
            rasterMs: agg.rasterMs,
            gpuMs: agg.gpuMs,
            compositorMs: agg.compositorMs,
            drawFrames: agg.drawFrames,
            topScript: agg.topScript,
            topPaintNodes: agg.topPaintNodes,
          }
        : null,
    });
  }
  await ctx.close();
  return { ms, points: res };
}

// Homepage interactions (selectors are the homepage's own)
export async function interactPass(browser, prof, url, opts) {
  const o = await openPage(browser, prof, url, opts);
  const { page, cdp, ctx } = o;
  const secInfo = await getSections(page, opts.sections);
  const nominal = opts.nominal || (await nominalInterval(page));
  const vp = page.viewportSize();
  const mouse = prof.input === 'cdp-mouse' || prof.input === 'wheel';
  const out = {};
  const record = async (name, fn) => {
    await page.evaluate(() => window.__perf.start());
    try {
      await fn();
    } catch (e) {
      out[name] = { error: String(e).slice(0, 200) };
      await page.evaluate(() => window.__perf.stop());
      return;
    }
    await page.evaluate(() => window.__perf.stop());
    const d = await page.evaluate(() => window.__perf.dump());
    out[name] = frameStats(d, secInfo, nominal, opts.resolver).all;
  };
  const rectOf = (sel) =>
    page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left, y: r.top, width: r.width, height: r.height };
    }, sel);
  // the wheel: drag, flick, sideways trackpad scroll (desktop) or a thumb drag (phone)
  await jumpTo(page, 0);
  await sleep(1200);
  const front = await rectOf('.wc.is-front .wc__face, .wc.is-front');
  const wy = front ? Math.min(vp.height - 30, Math.max(front.y + 40, vp.height * 0.82)) : vp.height * 0.85;
  if (mouse) {
    await record('wheel-drag', async () => {
      await mouseDrag(page, vp.width * 0.62, wy, -480, 700);
      await sleep(1600);
    });
    await record('wheel-flick', async () => {
      await mouseDrag(page, vp.width * 0.4, wy, 420, 110, 6);
      await sleep(2600);
    });
    await record('wheel-sideways', async () => {
      await page.mouse.move(vp.width * 0.5, wy);
      for (let i = 0; i < 40; i++) {
        await page.mouse.wheel(30, 0);
        await sleep(14);
      }
      await sleep(1200);
    });
    await record('cards-hover', async () => {
      for (let x = 40; x < vp.width - 40; x += 12) {
        await page.mouse.move(x, wy);
        await sleep(14);
      }
      for (let x = vp.width - 40; x > 40; x -= 12) {
        await page.mouse.move(x, wy);
        await sleep(14);
      }
      await page.mouse.move(vp.width - 10, 80);
      await sleep(800);
    });
  } else if (cdp) {
    await record('wheel-drag', async () => {
      await touchDrag(cdp, vp.width * 0.7, wy, -220, 450);
      await sleep(1600);
    });
    await record('wheel-flick', async () => {
      await touchDrag(cdp, vp.width * 0.3, wy, 200, 100);
      await sleep(2600);
    });
  }
  // "See our work": the scripted 1.6 s scroll that plays the whole Atlas flight
  await jumpTo(page, 0);
  await sleep(1500);
  await record('see-our-work', async () => {
    const r = await rectOf('[data-scroll-to="#mq-atlas"]');
    if (!r) throw new Error('no See our work button');
    if (prof.context.hasTouch && prof.engine === 'webkit') await page.touchscreen.tap(r.x + r.width / 2, r.y + r.height / 2);
    else if (prof.context.hasTouch && cdp) await page.touchscreen.tap(r.x + r.width / 2, r.y + r.height / 2);
    else await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
    await sleep(3200);
  });
  // pointer through Vaultt's network and EP's sky and phone (mouse only: these react to hover)
  if (mouse) {
    for (const [name, sel] of [
      ['vaultt-pointer', '#mq-vaultt'],
      ['ep-pointer', '#mq-endless-pursuit'],
    ]) {
      const s = secInfo.sections.find((x) => x.name === sel.slice(1));
      if (!s) continue;
      await jumpTo(page, Math.max(0, s.top + Math.min(vp.height * 0.4, (s.bottom - s.top - vp.height) / 2)));
      await sleep(2200);
      await record(name, async () => {
        await pointerFigure8(page, { x: 0, y: 70, width: vp.width, height: vp.height - 90 }, 6000);
        await page.mouse.move(vp.width - 4, vp.height - 4);
        await sleep(600);
      });
    }
  }
  await ctx.close();
  return out;
}
