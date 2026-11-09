// Turns raw pass files into summary.json + summary.md, and diffs two runs (compare.md).
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { medianOf, median, round } from './stats.mjs';

const r1 = (x) => (x == null ? '' : round(x, 1));
const r0 = (x) => (x == null ? '' : Math.round(x));
const pc = (x) => (x == null ? '' : `${round(x * 100, 1)}%`);
const kb = (b) => (b == null ? '' : `${Math.round(b / 1024)}`);

export function loadRaw(runDir) {
  const raw = join(runDir, 'raw');
  const files = existsSync(raw) ? readdirSync(raw).filter((f) => f.endsWith('.json')) : [];
  const out = {};
  for (const f of files) {
    const j = JSON.parse(readFileSync(join(raw, f), 'utf8'));
    const { page, profile, pass } = j.key;
    ((out[page] ||= {})[profile] ||= {})[pass] ||= [];
    out[page][profile][pass].push(j);
  }
  return out;
}

const statKeys = ['frames', 'seconds', 'fps', 'intP50', 'intP95', 'intP99', 'intMax', 'workP50', 'workP95', 'workP99', 'workMax', 'over8', 'over16', 'over33', 'intOver8', 'intOver16', 'intOver33', 'dropped', 'gaps50', 'longN', 'longMs', 'longMax', 'loafN', 'loafMs', 'loafBlocking', 'loafForcedMs', 'eventsSlow', 'eventMax'];
function medStats(list) {
  // list: array of stats objects (one per repeat); numbers -> median, loafTop from the worst repeat
  const pick = list.filter(Boolean);
  if (!pick.length) return null;
  const o = {};
  for (const k of statKeys) o[k] = median(pick.map((s) => (s[k] == null ? NaN : s[k])));
  const worst = pick.slice().sort((a, b) => (b.loafMs || 0) - (a.loafMs || 0))[0];
  o.loafTop = worst.loafTop || [];
  o.repeats = pick.length;
  return o;
}

export function buildSummary(runDir) {
  const raw = loadRaw(runDir);
  const meta = existsSync(join(runDir, 'meta.json')) ? JSON.parse(readFileSync(join(runDir, 'meta.json'), 'utf8')) : {};
  const sum = { meta, pages: {} };
  for (const [page, profs] of Object.entries(raw)) {
    const P = (sum.pages[page] = {});
    for (const [prof, passes] of Object.entries(profs)) {
      const S = (P[prof] = {});
      const loads = [];
      for (const [pass, runs] of Object.entries(passes)) {
        runs.forEach((r) => loads.push(...(r.uptime || [])));
        if (pass === 'scroll') {
          const secNames = new Set();
          runs.forEach((r) => r.data?.steady && Object.keys(r.data.steady.stats.sections).forEach((k) => secNames.add(k)));
          const order = runs[0]?.data?.secInfo?.sections?.map((s) => s.name) || [];
          const names = [...order.filter((n) => secNames.has(n)), ...[...secNames].filter((n) => !order.includes(n))];
          S.scroll = {
            nominal: median(runs.map((r) => r.data?.nominal)),
            speed: runs[0]?.data?.steady?.drive ? undefined : undefined,
            steady: {
              all: medStats(runs.map((r) => r.data?.steady?.stats?.all)),
              sections: Object.fromEntries(names.map((n) => [n, medStats(runs.map((r) => r.data?.steady?.stats?.sections?.[n]))])),
              metrics: medianOf(runs.map((r) => r.data?.steady?.totals)),
              bySection: Object.fromEntries(names.map((n) => [n, medianOf(runs.map((r) => r.data?.steady?.bySection?.[n]))])),
            },
            fling: {
              all: medStats(runs.map((r) => r.data?.fling?.stats?.all)),
              sections: Object.fromEntries(names.map((n) => [n, medStats(runs.map((r) => r.data?.fling?.stats?.sections?.[n]))])),
            },
            secInfo: runs[0]?.data?.secInfo,
          };
        } else if (pass === 'trace') {
          const r = runs[0]?.data;
          if (r && !r.skipped) S.trace = { sections: r.trace?.sections, stats: r.stats, events: r.events, error: r.trace?.error };
        } else if (pass === 'inval') {
          const r = runs[0]?.data;
          if (r && !r.skipped) S.inval = { sections: r.trace?.sections, error: r.trace?.error };
        } else if (pass === 'lag') S.lag = runs[0]?.data;
        else if (pass === 'layers') S.layers = runs[0]?.data;
        else if (pass === 'idle') S.idle = runs[0]?.data;
        else if (pass === 'interact') {
          const names = new Set();
          runs.forEach((r) => Object.keys(r.data || {}).forEach((k) => names.add(k)));
          S.interact = Object.fromEntries([...names].map((n) => [n, runs[0].data[n]?.error ? runs[0].data[n] : medStats(runs.map((r) => r.data?.[n]))]));
        } else if (pass === 'load') {
          S.load = { median: medianOf(runs.map((r) => strip(r.data))), first: runs[0]?.data };
        }
      }
      S.loadAvg = loads.length ? { min: Math.min(...loads), median: median(loads), max: Math.max(...loads) } : null;
      S.errors = [...new Set(Object.values(passes).flat().flatMap((r) => (r.data && r.data.errors) || []))];
    }
  }
  writeFileSync(join(runDir, 'summary.json'), JSON.stringify(sum, null, 1));
  writeFileSync(join(runDir, 'summary.md'), markdown(sum));
  return sum;
}
const strip = (d) => {
  if (!d) return d;
  const { allRequests, earlyBig, shiftSources, audioBeforePress, audioRequestsBeforePress, lcp, nav, support, ...rest } = d;
  return { ...rest, lcpMs: lcp?.start ?? null, ttfb: nav?.ttfb ?? null, dcl: nav?.dcl ?? null };
};

function framesTable(secs, title) {
  const rows = [];
  rows.push(`| ${title} | frames | fps | frame p50 | p95 | p99 | max | >9.5 | >17.5 | >34 | work p50 | work p95 | work p99 | gaps>50 | long n/ms | LoAF n/ms |`);
  rows.push('|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|');
  for (const [name, s] of Object.entries(secs)) {
    if (!s) continue;
    // older runs have no interval shares: fall back to "dropped" (interval over 1.5x the cadence) for >9.5
    const o8 = s.intOver8 ?? s.dropped;
    rows.push(`| ${name} | ${r0(s.frames)} | ${r0(s.fps)} | ${r1(s.intP50)} | ${r1(s.intP95)} | ${r1(s.intP99)} | ${r0(s.intMax)} | ${pc(o8)} | ${s.intOver16 == null ? '' : pc(s.intOver16)} | ${s.intOver33 == null ? '' : pc(s.intOver33)} | ${r1(s.workP50)} | ${r1(s.workP95)} | ${r1(s.workP99)} | ${r0(s.gaps50)} | ${r0(s.longN)}/${r0(s.longMs)} | ${r0(s.loafN)}/${r0(s.loafMs)} |`);
  }
  return rows.join('\n');
}

function markdown(sum) {
  const m = sum.meta || {};
  const L = [];
  L.push(`# Perf run: ${m.name || ''}`);
  L.push('');
  L.push(`- target: ${m.target} (${m.baseUrl})${m.invalid ? `  **INVALID: ${m.invalid}**` : ''}`);
  L.push(`- started ${m.started}, finished ${m.finished || '?'}; git ${m.git || '?'}`);
  L.push(`- machine: ${m.machine || ''}; load averages during the run: ${m.loadRange ? `${m.loadRange.min} to ${m.loadRange.max} (median ${m.loadRange.median}) on ${m.cpus} cores` : '?'}`);
  for (const [eng, info] of Object.entries(m.engines || {})) L.push(`- ${eng}: ${info.version}; WebGL: ${info.webgl}; rAF cadence ${info.raf} ms${info.note ? `; ${info.note}` : ''}`);
  L.push('- frame columns: `frame` = rAF-to-rAF interval, the frame time the scrubbed effects actually update at (at 120 Hz 8.3 ms is perfect, 16.7 is one dropped frame); `>9.5` = share of frames that dropped at least one 120 Hz vsync (older runs: over 1.5x the cadence), `>17.5` = longer than one 60 Hz frame, `>34` = three or more 120 Hz frames; `work` = vsync to the end of that frame\'s main-thread rendering (a latency: it includes scheduler deferral, so on an idle page it reads up to one frame high; compare with the control page); `gaps>50` = frames slower than 50 ms. ms unless noted.');
  L.push('');
  for (const [page, profs] of Object.entries(sum.pages)) {
    L.push(`## ${page}`);
    for (const [prof, S] of Object.entries(profs)) {
      L.push('');
      L.push(`### ${page} / ${prof}${S.loadAvg ? ` (load avg ${round(S.loadAvg.min, 1)} to ${round(S.loadAvg.max, 1)})` : ''}`);
      if (S.errors?.length) L.push('', `**Script errors on the page:** ${S.errors.map((e) => `\`${e}\``).join('; ')}`);
      if (S.scroll) {
        L.push('');
        L.push(`Steady scroll, display cadence ${r1(S.scroll.nominal)} ms, ${S.scroll.steady.all?.repeats ?? '?'} repeats (medians):`);
        L.push('');
        L.push(framesTable({ ALL: S.scroll.steady.all, ...S.scroll.steady.sections }, 'section'));
        const mt = S.scroll.steady.metrics;
        if (mt) L.push(`\nWhole pass (CDP metrics): style recalcs ${r0(mt.RecalcStyleCount)} (${r0(mt.RecalcStyleDuration)} ms), layouts ${r0(mt.LayoutCount)} (${r0(mt.LayoutDuration)} ms), script ${r0(mt.ScriptDuration)} ms, main-thread tasks ${r0(mt.TaskDuration)} ms, heap ${r1(mt.JSHeapUsedMB)} MB, DOM nodes ${r0(mt.Nodes)}, layout objects ${r0(mt.LayoutObjects)}.`);
        const loafs = Object.entries(S.scroll.steady.sections).filter(([, s]) => s && s.loafTop && s.loafTop.length);
        if (loafs.length) {
          L.push('\nLong animation frames, top scripts (worst repeat):');
          for (const [n, s] of loafs) L.push(`- ${n}: ${s.loafTop.slice(0, 3).map((t) => `\`${t.key}\` ${t.n}x ${t.ms} ms${t.forced ? ` (forced layout ${t.forced} ms)` : ''}`).join('; ')}`);
        }
        L.push('');
        L.push('Fling (fast) pass:');
        L.push('');
        L.push(framesTable({ ALL: S.scroll.fling.all, ...S.scroll.fling.sections }, 'section'));
      }
      if (S.trace?.sections) {
        L.push('');
        L.push('Rendering cost per section (one traced steady pass; ms are totals for the time spent in the section):');
        L.push('');
        L.push('| section | s in view | main ms | script | style n/ms | elems/recalc p50/max | layout n/ms | forced style+layout n/ms | paint n/ms | prepaint+layerize | raster | GPU main | viz | compositor | gc |');
        L.push('|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|');
        const secs = S.trace.stats?.sections || {};
        for (const [n, t] of Object.entries(S.trace.sections)) {
          L.push(`| ${n} | ${r1(secs[n]?.seconds)} | ${r0(t.mainTaskMs)} | ${r0(t.scriptMs)} | ${r0(t.styleN)}/${r0(t.styleMs)} | ${r0(t.styleElemP50)}/${r0(t.styleElemMax)} | ${r0(t.layoutN)}/${r0(t.layoutMs)} | ${r0(t.forcedStyleN + t.forcedLayoutN)}/${r0(t.forcedStyleMs + t.forcedLayoutMs)} | ${r0(t.paintN)}/${r0(t.paintMs)} | ${r0(t.prePaintMs + t.layerizeMs)} | ${r0(t.rasterMs)} | ${r0(t.gpuMs)} | ${r0(t.vizMs)} | ${r0(t.compositorMs)} | ${r0(t.gcMs)} |`);
        }
        L.push('');
        L.push('Compositor frame reports (what reached the screen): frames, presented / partial / dropped (of frames that affect smoothness), frames with missing content (checkerboard), frame latency p50/p95, and p95 of the stages (main = BeginMainFrame to commit, draw = GPU draw to swap):');
        L.push('');
        L.push('| section | frames | smooth-frames | dropped | partial | missing | latency p50/p95 | main p95 | activate-submit p95 | receive-draw p95 | draw p95 | ready-latch p95 |');
        L.push('|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|');
        for (const [n, t] of Object.entries(S.trace.sections)) {
          const p = t.pipeline;
          if (!p) continue;
          const st = (k) => r1(p.stages?.[k]?.p95);
          L.push(`| ${n} | ${p.reports} | ${p.smoothFrames} | ${pc(p.smoothFrames ? p.droppedSmooth / p.smoothFrames : null)} | ${pc(p.smoothFrames ? p.partialSmooth / p.smoothFrames : null)} | ${p.missingContent} | ${r1(p.latencyP50)}/${r1(p.latencyP95)} | ${st('SendBeginMainFrameToCommit')} | ${st('EndActivateToSubmitCompositorFrame')} | ${st('ReceiveCompositorFrameToStartDraw')} | ${st('StartDrawToSwapStart')} | ${st('BufferReadyToLatch')} |`);
        }
        L.push('');
        for (const [n, t] of Object.entries(S.trace.sections)) {
          const bits = [];
          if (t.topForced?.length) bits.push(`forced: ${t.topForced.slice(0, 3).map((f) => `\`${f.k}\` ${f.n}x ${f.ms} ms`).join('; ')}`);
          if (t.topScript?.length) bits.push(`script: ${t.topScript.slice(0, 4).map((f) => `\`${f.k}\` ${f.ms} ms`).join('; ')}`);
          if (t.topPaintNodes?.length) bits.push(`paint: ${t.topPaintNodes.map((f) => `${f.k} ${f.ms} ms`).join(', ')}`);
          if (bits.length) L.push(`- ${n}: ${bits.join(' | ')}`);
        }
      }
      if (S.inval?.sections) {
        L.push('');
        L.push('What changed each frame (invalidation tracking pass; counts while the section was in view):');
        L.push('');
        for (const [n, t] of Object.entries(S.inval.sections)) if (t.topInval?.length) L.push(`- ${n}: ${t.topInval.slice(0, 10).map((x) => `\`${x.k}\` ${x.n}`).join('; ')}`);
      }
      if (S.lag?.model) {
        L.push('');
        L.push(`Scrub smoothing (MODEL of GSAP's scrub at ${S.lag.speed} px/s and a ${r1(S.lag.frameMs)} ms frame; deliberate trailing, not jank; \`scrub: true\` follows the scroll exactly):`);
        L.push('');
        L.push('| scrub (s) | trails the scroll by px | ms | keeps moving after a stop, ms | used at |');
        L.push('|--:|--:|--:|--:|---|');
        for (const [v, m] of Object.entries(S.lag.model)) L.push(`| ${v} | ${r0(m.lagPx)} | ${r0(m.lagMs)} | ${r0(m.settleMs)} | ${S.lag.sites.filter((x) => String(x.scrub) === String(v)).map((x) => x.at).slice(0, 6).join(', ')} |`);
      }
      if (S.layers?.points) {
        L.push('');
        L.push('Layers and heap at each section:');
        L.push('');
        L.push('| at | layers | drawing | content MPx | est. tile MB | > viewport | heap MB | nodes | biggest layers |');
        L.push('|---|--:|--:|--:|--:|--:|--:|--:|---|');
        for (const p of S.layers.points) L.push(`| ${p.at} | ${p.layers} | ${p.drawing} | ${r1(p.areaMPx)} | ${r0(p.estMB)} | ${p.overViewport} | ${r1(p.heapMB)} | ${r0(p.nodes)} | ${p.top.slice(0, 3).map((t) => `${t.node} ${t.w}x${t.h} (${(t.reasons || []).join(',')})`).join('; ')} |`);
      }
      if (S.idle?.points) {
        L.push('');
        L.push(`At rest (${S.idle.ms / 1000} s per position):`);
        L.push('');
        L.push('| at | main busy | script | rAF/s | style/s | draw fps | gpu ms/s | raster ms/s | running anims (off screen) | playing media (off screen) |');
        L.push('|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|');
        for (const p of S.idle.points) {
          const off = p.anims.filter((a) => !a.onScreen).length;
          const mp = p.media.filter((x) => x.playing);
          L.push(`| ${p.at} | ${p.busyPct == null ? 'n/a' : pc(p.busyPct / 100)} | ${p.scriptPct == null ? '' : pc(p.scriptPct / 100)} | ${r0(p.rafPerSec)} | ${p.styleN == null ? '' : r0(p.styleN / p.seconds)} | ${p.trace ? r0(p.trace.drawFrames / p.seconds) : ''} | ${p.trace ? r1(p.trace.gpuMs / p.seconds) : ''} | ${p.trace ? r1(p.trace.rasterMs / p.seconds) : ''} | ${p.anims.length} (${off}) | ${mp.length} (${mp.filter((x) => !x.onScreen).length}) |`);
        }
        const offAnims = new Map();
        for (const p of S.idle.points) for (const a of p.anims) if (!a.onScreen) offAnims.set(`${a.name} on ${a.target}${a.pseudo}`, (offAnims.get(`${a.name} on ${a.target}${a.pseudo}`) || []).concat(p.at));
        if (offAnims.size) L.push(`\nAnimations running off screen: ${[...offAnims.entries()].slice(0, 25).map(([k, v]) => `\`${k}\` (at ${[...new Set(v)].join(', ')})`).join('; ')}`);
        const sites = new Map();
        for (const p of S.idle.points) for (const s of p.rafSites || []) sites.set(s.k, (sites.get(s.k) || 0) + s.n);
        if (sites.size) L.push(`\nrAF requesters at rest (sampled): ${[...sites.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `\`${k.slice(0, 160)}\` ~${v}`).join('; ')}`);
        for (const p of S.idle.points) if (p.trace?.topScript?.length) L.push(`- at ${p.at}: ${p.trace.topScript.slice(0, 3).map((f) => `\`${f.k}\` ${f.ms} ms`).join('; ')}`);
      }
      if (S.interact) {
        L.push('');
        L.push(framesTable(S.interact, 'interaction'));
      }
      if (S.load?.first) {
        const f = S.load.first;
        const md = S.load.median || {};
        L.push('');
        L.push(`Load: FCP ${r0(f.fcp)} ms, LCP ${f.lcp ? `${r0(md.lcpMs)} ms (${f.lcp.el} ${f.lcp.url})` : 'n/a'}, TBT ${md.tbt == null ? 'n/a' : `${r0(md.tbt)} ms`}, CLS before scroll ${f.clsBeforeScroll == null ? 'n/a' : round(f.clsBeforeScroll, 3)}, after full scroll ${f.clsTotal == null ? 'n/a' : round(f.clsTotal, 3)}; requests ${f.requestsBefore} before scroll, ${f.requestsAfter} after.`);
        L.push('');
        L.push('| KB by type | html | js | css | font | image | video | audio | fetch | other | total |');
        L.push('|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|');
        for (const [lbl, by] of [
          ['before scroll', f.before],
          ['after full scroll', f.after],
        ]) {
          const t = Object.values(by).reduce((a, b) => a + b.bytes, 0);
          L.push(`| ${lbl} | ${['html', 'js', 'css', 'font', 'image', 'video', 'audio', 'fetch', 'other'].map((k) => (by[k] ? `${kb(by[k].bytes)} (${by[k].n})` : '')).join(' | ')} | ${kb(t)} |`);
        }
        if (f.earlyBig?.length) L.push(`\nFetched before any scroll (over 15 KB): ${f.earlyBig.map((x) => `${x.url} ${x.kb} KB`).join(', ')}`);
        if (f.audioRequestsBeforePress?.length || f.audioBeforePress?.length) L.push(`\nAudio before any press: ${f.audioRequestsBeforePress.length} audio requests (${f.audioRequestsBeforePress.filter((x) => x.beforeScroll).length} before scrolling), ${f.audioBeforePress.map((a) => a.what).join(', ') || 'no AudioContext'}`);
        if (f.shiftSources?.length) L.push(`\nLayout shifts: ${f.shiftSources.map((s) => `${round(s.value, 4)} at y=${Math.round(s.y)} (${s.sources.join(', ')})`).join('; ')}`);
      }
    }
    L.push('');
  }
  return L.join('\n');
}

// ---------------------------------------------------------------- compare
export function compare(dirA, dirB, outPath) {
  const A = JSON.parse(readFileSync(join(dirA, 'summary.json'), 'utf8'));
  const B = JSON.parse(readFileSync(join(dirB, 'summary.json'), 'utf8'));
  const L = [`# Compare: ${A.meta?.name} -> ${B.meta?.name}`, '', `Load averages: A ${A.meta?.loadRange?.min}-${A.meta?.loadRange?.max}, B ${B.meta?.loadRange?.min}-${B.meta?.loadRange?.max}`, ''];
  const keys = [
    ['intP95', 'frame p95', r1],
    ['intP99', 'frame p99', r1],
    ['intMax', 'frame max', r0],
    ['dropped', 'dropped vsync', pc],
    ['intOver16', '>17.5', pc],
    ['workP95', 'work p95', r1],
    ['gaps50', 'gaps>50', r0],
    ['longN', 'long n', r0],
    ['loafN', 'LoAF n', r0],
  ];
  for (const page of Object.keys(B.pages)) {
    for (const prof of Object.keys(B.pages[page])) {
      const a = A.pages?.[page]?.[prof];
      const b = B.pages[page][prof];
      if (!a || !b) continue;
      L.push(`## ${page} / ${prof}`);
      for (const pass of ['steady', 'fling']) {
        if (!a.scroll || !b.scroll) continue;
        L.push('', `${pass}:`, '', `| section | ${keys.map((k) => k[1]).join(' | ')} |`, `|---|${keys.map(() => '--:').join('|')}|`);
        const secs = ['ALL', ...Object.keys(b.scroll[pass].sections)];
        for (const s of secs) {
          const sa = s === 'ALL' ? a.scroll[pass].all : a.scroll[pass].sections[s];
          const sb = s === 'ALL' ? b.scroll[pass].all : b.scroll[pass].sections[s];
          if (!sa || !sb) continue;
          L.push(`| ${s} | ${keys.map(([k, , f]) => `${f(sa[k])} -> **${f(sb[k])}**`).join(' | ')} |`);
        }
      }
      if (a.trace?.sections && b.trace?.sections) {
        const tk = [
          ['mainTaskMs', 'main'],
          ['scriptMs', 'script'],
          ['styleMs', 'style'],
          ['layoutMs', 'layout'],
          ['paintMs', 'paint'],
          ['gpuMs', 'GPU main'],
          ['vizMs', 'viz'],
          ['compositorMs', 'compositor'],
        ];
        L.push('', 'traced steady pass (ms while the section was in view; frames: work p95 / interval p99 / dropped):', '', `| section | ${tk.map((k) => k[1]).join(' | ')} | frames |`, `|---|${tk.map(() => '--:').join('|')}|---|`);
        for (const [n, tb] of Object.entries(b.trace.sections)) {
          const ta = a.trace.sections[n];
          if (!ta) continue;
          const fa = a.trace.stats?.sections?.[n];
          const fb = b.trace.stats?.sections?.[n];
          const fr = fa && fb ? `${r1(fa.workP95)}/${r1(fa.intP99)}/${pc(fa.dropped)} -> **${r1(fb.workP95)}/${r1(fb.intP99)}/${pc(fb.dropped)}**` : '';
          L.push(`| ${n} | ${tk.map(([k]) => `${r0(ta[k])} -> **${r0(tb[k])}**`).join(' | ')} | ${fr} |`);
        }
      }
      if (a.idle?.points && b.idle?.points) {
        L.push('', 'idle main busy / rAF per s:', '');
        for (const p of b.idle.points) {
          const q = a.idle.points.find((x) => x.at === p.at);
          if (q) L.push(`- ${p.at}: ${q.busyPct == null ? 'n/a' : pc(q.busyPct / 100)} -> **${p.busyPct == null ? 'n/a' : pc(p.busyPct / 100)}**, rAF ${r0(q.rafPerSec)} -> **${r0(p.rafPerSec)}**${q.trace && p.trace ? `, GPU ${r0(q.trace.gpuMs / q.seconds)} -> **${r0(p.trace.gpuMs / p.seconds)}** ms/s, frames ${r0(q.trace.drawFrames / q.seconds)} -> **${r0(p.trace.drawFrames / p.seconds)}**/s, paints ${r0(q.trace.paintN / q.seconds)} -> **${r0(p.trace.paintN / p.seconds)}**/s` : ''}`);
        }
      }
      if (a.load?.first && b.load?.first) {
        const tot = (by) => Object.values(by).reduce((x, y) => x + y.bytes, 0);
        L.push('', `load: before scroll ${kb(tot(a.load.first.before))} KB -> **${kb(tot(b.load.first.before))} KB**, after scroll ${kb(tot(a.load.first.after))} KB -> **${kb(tot(b.load.first.after))} KB**, LCP ${r0(a.load.median?.lcpMs)} -> **${r0(b.load.median?.lcpMs)}** ms, TBT ${r0(a.load.median?.tbt)} -> **${r0(b.load.median?.tbt)}** ms`);
      }
      if (a.interact && b.interact) {
        L.push('', 'interactions (work p95 / dropped):', '');
        for (const [n, s] of Object.entries(b.interact)) {
          const q = a.interact[n];
          if (q && s && !s.error && !q.error) L.push(`- ${n}: ${r1(q.workP95)} / ${pc(q.dropped)} -> **${r1(s.workP95)} / ${pc(s.dropped)}**`);
        }
      }
      L.push('');
    }
  }
  writeFileSync(outPath, L.join('\n'));
  return outPath;
}

// ---------------------------------------------------------------- brief: one compact cross-profile table per page
// cell = work p95 / interval p99 / dropped share (steady scroll medians); plus idle busy and load bytes per profile
export function brief(runDir) {
  const S = JSON.parse(readFileSync(join(runDir, 'summary.json'), 'utf8'));
  const L = [`# Brief: ${S.meta?.name} (${S.meta?.target}${S.meta?.invalid ? ', INVALID' : ''}), load avg ${S.meta?.loadRange?.min}-${S.meta?.loadRange?.max}`, ''];
  for (const [page, profs] of Object.entries(S.pages)) {
    const names = Object.keys(profs);
    const secs = [];
    for (const p of names) for (const k of Object.keys(profs[p].scroll?.steady?.sections || {})) if (!secs.includes(k)) secs.push(k);
    L.push(`## ${page}`, '', 'Steady scroll, cell = frame p95 / p99 / max (ms) / share of frames that missed at least one vsync (Chromium 120 Hz, WebKit 60 Hz):', '');
    L.push(`| section | ${names.join(' | ')} |`, `|---|${names.map(() => '---').join('|')}|`);
    for (const sec of ['ALL', ...secs]) {
      const cells = names.map((p) => {
        const st = sec === 'ALL' ? profs[p].scroll?.steady?.all : profs[p].scroll?.steady?.sections?.[sec];
        // dropped = interval over 1.5x the engine's cadence (120 Hz Chromium, 60 Hz WebKit), so it is fair to both
        return st ? `${r1(st.intP95)} / ${r1(st.intP99)} / ${r0(st.intMax)} / ${pc(st.dropped)}` : '';
      });
      L.push(`| ${sec} | ${cells.join(' | ')} |`);
    }
    const fl = names.map((p) => {
      const st = profs[p].scroll?.fling?.all;
      return st ? `${r1(st.intP95)} / ${r1(st.intP99)} / ${r0(st.intMax)} / ${pc(st.dropped)}` : '';
    });
    L.push(`| fling (all) | ${fl.join(' | ')} |`);
    const idle = names.map((p) => {
      const pts = profs[p].idle?.points;
      if (!pts) return '';
      const b = pts.map((x) => x.busyPct).filter((x) => x != null);
      const r = pts.map((x) => x.rafPerSec);
      return b.length ? `busy ${r0(Math.min(...b))}-${r0(Math.max(...b))}%, rAF ${r0(Math.min(...r))}-${r0(Math.max(...r))}/s` : `rAF ${r0(Math.min(...r))}-${r0(Math.max(...r))}/s`;
    });
    if (idle.some(Boolean)) L.push(`| at rest | ${idle.join(' | ')} |`);
    const ld = names.map((p) => {
      const f = profs[p].load?.first;
      if (!f) return '';
      const tot = (by) => Object.values(by).reduce((a, b) => a + b.bytes, 0);
      return `${kb(tot(f.before))} KB before scroll, ${kb(tot(f.after))} after; LCP ${r0(profs[p].load.median?.lcpMs)} ms`;
    });
    if (ld.some(Boolean)) L.push(`| load | ${ld.join(' | ')} |`);
    L.push('');
  }
  const out = join(runDir, 'brief.md');
  writeFileSync(out, L.join('\n'));
  return out;
}

// The brief with two runs in every cell, "before -> after", for reports: same cells and columns as brief().
export function briefVs(runDir, beforeDir) {
  const A = JSON.parse(readFileSync(join(beforeDir, 'summary.json'), 'utf8'));
  const B = JSON.parse(readFileSync(join(runDir, 'summary.json'), 'utf8'));
  const L = [`# Brief: ${A.meta?.name} -> ${B.meta?.name} (load avg ${A.meta?.loadRange?.min}-${A.meta?.loadRange?.max} -> ${B.meta?.loadRange?.min}-${B.meta?.loadRange?.max})`, ''];
  const cellOf = (st) => (st ? `${r1(st.intP95)} / ${r1(st.intP99)} / ${r0(st.intMax)} / ${pc(st.dropped)}` : '');
  const both = (a, b) => (a || b ? `${a || '-'} -> **${b || '-'}**` : '');
  for (const [page, profsB] of Object.entries(B.pages)) {
    const profsA = A.pages[page] || {};
    const names = Object.keys(profsB);
    for (const p of names) {
      const a = profsA[p] || {};
      const b = profsB[p];
      const secs = [];
      for (const k of Object.keys(b.scroll?.steady?.sections || {})) if (!secs.includes(k)) secs.push(k);
      L.push(`## ${page} / ${p}`, '', 'Steady scroll, cell = frame p95 / p99 / max (ms) / share of frames that missed at least one vsync (Chromium 120 Hz, WebKit 60 Hz):', '');
      L.push('| section | before -> after |', '|---|---|');
      for (const sec of ['ALL', ...secs]) {
        const sa = sec === 'ALL' ? a.scroll?.steady?.all : a.scroll?.steady?.sections?.[sec];
        const sb = sec === 'ALL' ? b.scroll?.steady?.all : b.scroll?.steady?.sections?.[sec];
        L.push(`| ${sec} | ${both(cellOf(sa), cellOf(sb))} |`);
      }
      L.push(`| fling (all) | ${both(cellOf(a.scroll?.fling?.all), cellOf(b.scroll?.fling?.all))} |`);
      const rest = (x) => {
        const pts = x?.idle?.points;
        if (!pts) return '';
        return pts.map((q) => `${q.at} ${q.busyPct != null ? r0(q.busyPct) + '%' : r0(q.rafPerSec) + ' rAF/s'}`).join(', ');
      };
      if (a.idle || b.idle) L.push(`| at rest (main busy) | ${both(rest(a), rest(b))} |`);
      const ld = (x) => {
        const f = x?.load?.first;
        if (!f) return '';
        const tot = (by) => Object.values(by).reduce((s, v) => s + v.bytes, 0);
        return `${kb(tot(f.before))} KB / ${kb(tot(f.after))} KB, LCP ${r0(x.load.median?.lcpMs)} ms, TBT ${r0(x.load.median?.tbt)} ms`;
      };
      if (a.load || b.load) L.push(`| load (before scroll / after, LCP, TBT) | ${both(ld(a), ld(b))} |`);
      L.push('');
    }
  }
  const out = join(runDir, `brief-vs-${basename(beforeDir)}.md`);
  writeFileSync(out, L.join('\n'));
  return out;
}
