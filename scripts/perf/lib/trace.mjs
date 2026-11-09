// Chromium tracing (devtools.timeline and friends) and the per-section aggregation of what each frame cost:
// style recalc (and how many elements it touched), layout, paint, raster, GPU, script, GC, and forced
// (script-triggered) style or layout with the stack that forced it.
// Events stream in through Tracing.dataCollected and only the ones the report uses are kept, so a 20 second
// scroll does not need hundreds of MB of JSON in memory. --save-trace also streams the raw trace to disk
// (open it in the DevTools Performance panel).
import { createWriteStream } from 'node:fs';
import { createGzip } from 'node:zlib';

export const TRACE_CATEGORIES = [
  'devtools.timeline',
  'disabled-by-default-devtools.timeline',
  'disabled-by-default-devtools.timeline.frame',
  'disabled-by-default-devtools.timeline.stack',
  'blink.user_timing',
  'v8.execute',
  'v8',
  'toplevel',
  'gpu',
  'viz',
  'cc',
  '__metadata',
];
// what changed each frame and why: paint, style and layout invalidations with node names (heavy, own pass)
export const INVAL_CATEGORIES = ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.invalidationTracking', 'blink.user_timing', '__metadata'];
// lighter set for the 10 s idle windows
export const IDLE_CATEGORIES = ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.frame', 'blink.user_timing', 'toplevel', 'v8', '__metadata'];

const KEEP = new Set([
  'RunTask',
  'ThreadControllerImpl::RunTask',
  'UpdateLayoutTree',
  'Layout',
  'Paint',
  'PaintImage',
  'PrePaint',
  'Layerize',
  'UpdateLayer',
  'Commit',
  'CompositeLayers',
  'FunctionCall',
  'FireAnimationFrame',
  'EventDispatch',
  'TimerFire',
  'FireIdleCallback',
  'EvaluateScript',
  'v8.compile',
  'MinorGC',
  'MajorGC',
  'V8.GC_SCAVENGER',
  'V8.GC_MARK_COMPACTOR',
  'ImageDecodeTask',
  'Decode Image',
  'Decode LazyPixelRef',
  'RasterTask',
  'DrawFrame',
  'BeginFrame',
  'DroppedFrame',
  'BeginMainThreadFrame',
  'HitTest',
  'ScrollLayer',
  'ParseHTML',
  'ParseAuthorStyleSheet',
  'Animation',
  'AnimationFrame',
  'GPUTask',
  'thread_name',
  'process_name',
  '__perf_sync',
  // the compositor's per-frame report and its stages: which part of the pipeline made a frame late
  'PipelineReporter',
  'SendBeginMainFrameToCommit',
  'EndActivateToSubmitCompositorFrame',
  'SubmitCompositorFrameToPresentationCompositorFrame',
  'ReceiveCompositorFrameToStartDraw',
  'StartDrawToSwapStart',
  'SwapStartToBufferAvailable',
  'BufferAvailableToBufferReady',
  'BufferReadyToLatch',
  'LatchToSwapEnd',
  'SwapEndToPresentationCompositorFrame',
  'PaintInvalidationTracking',
  'StyleRecalcInvalidationTracking',
  'StyleInvalidatorInvalidationTracking',
  'ScheduleStyleInvalidationTracking',
  'LayoutInvalidationTracking',
]);
const STAGES = ['SendBeginMainFrameToCommit', 'EndActivateToSubmitCompositorFrame', 'SubmitCompositorFrameToPresentationCompositorFrame', 'ReceiveCompositorFrameToStartDraw', 'StartDrawToSwapStart', 'BufferAvailableToBufferReady', 'BufferReadyToLatch', 'LatchToSwapEnd', 'SwapEndToPresentationCompositorFrame'];

export async function startTrace(browser, { categories = TRACE_CATEGORIES, savePath } = {}) {
  const cdp = await browser.newBrowserCDPSession();
  const kept = [];
  let out = null;
  let first = true;
  if (savePath) {
    const gz = createGzip();
    out = gz;
    gz.pipe(createWriteStream(savePath));
    gz.write('{"traceEvents":[');
  }
  cdp.on('Tracing.dataCollected', ({ value }) => {
    for (const e of value) {
      if (out) {
        out.write((first ? '' : ',') + JSON.stringify(e));
        first = false;
      }
      const name = e.name;
      if (KEEP.has(name) || (e.cat && e.cat.includes('blink.user_timing') && String(name).startsWith('__perf'))) kept.push(e);
    }
  });
  const done = new Promise((r) => cdp.once('Tracing.tracingComplete', r));
  await cdp.send('Tracing.start', {
    transferMode: 'ReportEvents',
    traceConfig: { recordMode: 'recordContinuously', includedCategories: categories, excludedCategories: ['*'] },
  });
  return {
    async stop() {
      await cdp.send('Tracing.end');
      await done;
      if (out) {
        out.write(']}');
        await new Promise((r) => out.end(r));
      }
      await cdp.detach().catch(() => {});
      return kept;
    },
  };
}

// thread roles from metadata: the renderer main thread that did the most work is the page's
function threads(events) {
  const tname = new Map();
  const pname = new Map();
  for (const e of events) {
    if (e.ph !== 'M') continue;
    if (e.name === 'thread_name') tname.set(`${e.pid}:${e.tid}`, e.args?.name || '');
    if (e.name === 'process_name') pname.set(e.pid, e.args?.name || '');
  }
  const counts = new Map();
  for (const e of events) {
    if (e.ph === 'M') continue;
    const k = `${e.pid}:${e.tid}`;
    if (tname.get(k) === 'CrRendererMain') counts.set(k, (counts.get(k) || 0) + 1);
  }
  let main = null;
  let best = -1;
  for (const [k, n] of counts) {
    if (n > best) {
      best = n;
      main = k;
    }
  }
  const role = (e) => {
    const k = `${e.pid}:${e.tid}`;
    if (k === main) return 'main';
    const n = tname.get(k) || '';
    if (/^CompositorTileWorker/.test(n)) return 'raster';
    if (n === 'Compositor' && main && e.pid === Number(main.split(':')[0])) return 'compositor';
    if (n === 'CrGpuMain' || /^CrGpu/.test(n)) return 'gpu';
    if (n === 'VizCompositorThread') return 'viz';
    return 'other';
  };
  return { main, role, tname, pname };
}

const dur = (e) => (e.dur || 0) / 1000; // µs to ms

// Turn B/E pairs into complete events, per thread
function completes(events) {
  const open = new Map();
  const out = [];
  for (const e of events) {
    if (e.ph === 'X') out.push(e);
    else if (e.ph === 'B') {
      const k = `${e.pid}:${e.tid}:${e.name}`;
      if (!open.has(k)) open.set(k, []);
      open.get(k).push(e);
    } else if (e.ph === 'E') {
      const k = `${e.pid}:${e.tid}:${e.name}`;
      const st = open.get(k);
      const b = st && st.pop();
      if (b) out.push({ ...b, ph: 'X', dur: e.ts - b.ts, args: { ...(b.args || {}), endData: e.args?.endData ?? e.args } });
    }
  }
  return out;
}

let resolverRef = null;
const frameKey = (f) => {
  if (!f) return '(no stack)';
  const src = resolverRef && f.url ? resolverRef.at(f.url, f.lineNumber, f.columnNumber) : null;
  return `${f.functionName || '(anon)'} ${src || `${String(f.url || '').replace(/^https?:\/\/[^/]+/, '')}:${f.lineNumber ?? '?'}:${f.columnNumber ?? '?'}`}`;
};

// Aggregate a kept trace by section. sectionAt(pageTimeMs) -> section name; sync = { pageMs } of the
// __perf_sync mark (its trace ts is found here).
export function aggregate(kept, { sectionAt, syncName = '__perf_sync_start', syncPageMs, resolver = null }) {
  resolverRef = resolver;
  const th = threads(kept);
  const syncEv = kept.find((e) => e.name === syncName || (e.args?.data?.name === syncName));
  const sync = kept.find((e) => e.name === syncName);
  const anchor = sync || syncEv;
  if (!anchor) return { error: 'sync mark missing from trace' };
  const offsetMs = anchor.ts / 1000 - syncPageMs;
  const toPage = (ts) => ts / 1000 - offsetMs;
  const evs = completes(kept.filter((e) => e.ph === 'X' || e.ph === 'B' || e.ph === 'E')).sort((a, b) => a.ts - b.ts);
  const instants = kept.filter((e) => e.ph === 'I' || e.ph === 'i' || e.ph === 'n');

  const per = new Map();
  const S = (name) => {
    if (!per.has(name))
      per.set(name, {
        mainTaskMs: 0,
        styleN: 0,
        styleMs: 0,
        styleElements: [],
        layoutN: 0,
        layoutMs: 0,
        layoutObjects: [],
        paintN: 0,
        paintMs: 0,
        paintImageN: 0,
        paintImageMs: 0,
        prePaintMs: 0,
        layerizeMs: 0,
        commitMs: 0,
        scriptMs: 0,
        rafMs: 0,
        gcMs: 0,
        decodeMs: 0,
        rasterMs: 0,
        gpuMs: 0,
        vizMs: 0,
        inval: {},
        compositorMs: 0,
        reports: [],
        drawFrames: 0,
        droppedFrames: 0,
        forcedStyleN: 0,
        forcedStyleMs: 0,
        forcedLayoutN: 0,
        forcedLayoutMs: 0,
        forced: {},
        fn: {},
        events: {},
        paintNodes: {},
      });
    return per.get(name);
  };

  // script intervals on the main thread, for "is this style/layout forced by script?"
  const jsNames = new Set(['FunctionCall', 'EventDispatch', 'FireAnimationFrame', 'TimerFire', 'FireIdleCallback', 'EvaluateScript']);
  const js = evs.filter((e) => th.role(e) === 'main' && jsNames.has(e.name));
  const inJs = (e) => {
    // binary search the last js interval starting at or before e.ts, then walk back for an enclosing one
    let lo = 0;
    let hi = js.length - 1;
    let idx = -1;
    while (lo <= hi) {
      const m = (lo + hi) >> 1;
      if (js[m].ts <= e.ts) {
        idx = m;
        lo = m + 1;
      } else hi = m - 1;
    }
    for (let i = idx; i >= 0 && i > idx - 40; i--) {
      const j = js[i];
      if (j.ts <= e.ts && j.ts + (j.dur || 0) >= e.ts + (e.dur || 0)) return j;
    }
    return null;
  };

  // one task event per task: threads report both 'RunTask' and 'ThreadControllerImpl::RunTask' for the same work
  const hasRunTask = new Set(evs.filter((e) => e.name === 'RunTask').map((e) => `${e.pid}:${e.tid}`));
  const isTask = (e) => (e.name === 'RunTask' ? true : e.name === 'ThreadControllerImpl::RunTask' && !hasRunTask.has(`${e.pid}:${e.tid}`));
  // top-level script only (a FunctionCall inside another one is already counted by its parent)
  let lastTopEnd = -1;
  for (const e of evs) {
    const r = th.role(e);
    const sec = sectionAt(toPage(e.ts));
    if (!sec) continue;
    const s = S(sec);
    const d = dur(e);
    if (r === 'main') {
      switch (e.name) {
        case 'RunTask':
        case 'ThreadControllerImpl::RunTask':
          if (isTask(e)) s.mainTaskMs += d;
          break;
        case 'UpdateLayoutTree': {
          s.styleN++;
          s.styleMs += d;
          const n = e.args?.elementCount ?? e.args?.endData?.elementCount ?? e.args?.beginData?.elementCount;
          if (Number.isFinite(n)) s.styleElements.push(n);
          const j = inJs(e);
          if (j) {
            s.forcedStyleN++;
            s.forcedStyleMs += d;
            const st = e.args?.beginData?.stackTrace?.[0] || (j.args?.data && { functionName: j.args.data.functionName, url: j.args.data.url, lineNumber: j.args.data.lineNumber, columnNumber: j.args.data.columnNumber });
            const k = `style ${frameKey(st)}`;
            s.forced[k] = s.forced[k] || { n: 0, ms: 0 };
            s.forced[k].n++;
            s.forced[k].ms += d;
          }
          break;
        }
        case 'Layout': {
          s.layoutN++;
          s.layoutMs += d;
          const n = e.args?.beginData?.dirtyObjects;
          if (Number.isFinite(n)) s.layoutObjects.push(n);
          const j = inJs(e);
          if (j) {
            s.forcedLayoutN++;
            s.forcedLayoutMs += d;
            const st = e.args?.beginData?.stackTrace?.[0] || (j.args?.data && { functionName: j.args.data.functionName, url: j.args.data.url, lineNumber: j.args.data.lineNumber, columnNumber: j.args.data.columnNumber });
            const k = `layout ${frameKey(st)}`;
            s.forced[k] = s.forced[k] || { n: 0, ms: 0 };
            s.forced[k].n++;
            s.forced[k].ms += d;
          }
          break;
        }
        case 'Paint': {
          s.paintN++;
          s.paintMs += d;
          const nn = e.args?.data?.nodeName;
          if (nn) s.paintNodes[nn] = (s.paintNodes[nn] || 0) + d;
          break;
        }
        case 'PaintImage':
          s.paintImageN++;
          s.paintImageMs += d;
          break;
        case 'PrePaint':
          s.prePaintMs += d;
          break;
        case 'Layerize':
        case 'UpdateLayer':
        case 'CompositeLayers':
          s.layerizeMs += d;
          break;
        case 'Commit':
          s.commitMs += d;
          break;
        case 'FireAnimationFrame':
          s.rafMs += d;
          if (e.ts >= lastTopEnd) s.scriptMs += d;
          break;
        case 'MinorGC':
        case 'MajorGC':
        case 'V8.GC_SCAVENGER':
        case 'V8.GC_MARK_COMPACTOR':
          s.gcMs += d;
          break;
        case 'ImageDecodeTask':
        case 'Decode Image':
        case 'Decode LazyPixelRef':
          s.decodeMs += d;
          break;
        case 'FunctionCall':
        case 'EventDispatch':
        case 'TimerFire':
        case 'FireIdleCallback':
        case 'EvaluateScript': {
          if (e.ts < lastTopEnd) break; // nested in a counted script interval
          lastTopEnd = e.ts + (e.dur || 0);
          s.scriptMs += d;
          const data = e.args?.data || {};
          const k =
            e.name === 'EventDispatch'
              ? `event:${data.type}`
              : e.name === 'FunctionCall'
                ? frameKey({ functionName: data.functionName, url: data.url, lineNumber: data.lineNumber, columnNumber: data.columnNumber })
                : e.name;
          s.fn[k] = s.fn[k] || { n: 0, ms: 0 };
          s.fn[k].n++;
          s.fn[k].ms += d;
          break;
        }
        default:
          break;
      }
      s.events[e.name] = (s.events[e.name] || 0) + 1;
    } else if (r === 'raster') {
      if (e.name === 'RasterTask') s.rasterMs += d;
      if (e.name === 'ImageDecodeTask') s.decodeMs += d;
    } else if (r === 'gpu') {
      if (isTask(e)) s.gpuMs += d;
    } else if (r === 'viz') {
      if (isTask(e)) s.vizMs += d;
    } else if (r === 'compositor') {
      if (isTask(e)) s.compositorMs += d;
    }
  }
  // frame reports: async b/e pairs keyed by id; the stages share their reporter's id
  const open = new Map();
  const reports = new Map();
  for (const e of kept) {
    if (e.ph !== 'b' && e.ph !== 'e') continue;
    if (e.name !== 'PipelineReporter' && !STAGES.includes(e.name)) continue;
    const id = (e.id2 && (e.id2.local || e.id2.global)) || e.id || '';
    const k = `${e.pid}:${id}:${e.name}`;
    if (e.ph === 'b') open.set(k, e);
    else {
      const b = open.get(k);
      if (!b) continue;
      open.delete(k);
      const rk = `${e.pid}:${id}`;
      if (e.name === 'PipelineReporter') {
        const fr = b.args?.frame_reporter || e.args?.frame_reporter || {};
        const list = reports.get(rk) || [];
        list.push({ ts: b.ts, dur: (e.ts - b.ts) / 1000, state: fr.state, smooth: fr.affects_smoothness, missing: fr.has_missing_content || fr.checkerboarded_needs_raster || fr.checkerboarded_needs_record, type: fr.frame_type, stages: {} });
        reports.set(rk, list);
      } else {
        const list = reports.get(rk);
        // stages close before their reporter, so they attach to the next reporter with this id
        const pend = open.get(`${e.pid}:${id}:__stages`) || {};
        pend[e.name] = (e.ts - b.ts) / 1000;
        open.set(`${e.pid}:${id}:__stages`, pend);
        void list;
      }
    }
    if (e.ph === 'e' && e.name === 'PipelineReporter') {
      const id2 = (e.id2 && (e.id2.local || e.id2.global)) || e.id || '';
      const pend = open.get(`${e.pid}:${id2}:__stages`);
      const list = reports.get(`${e.pid}:${id2}`);
      if (pend && list && list.length) list[list.length - 1].stages = pend;
      open.delete(`${e.pid}:${id2}:__stages`);
    }
  }
  for (const list of reports.values()) {
    for (const f of list) {
      const sec = sectionAt(toPage(f.ts));
      if (!sec) continue;
      const s = S(sec);
      s.reports.push(f);
    }
  }
  for (const e of instants) {
    const sec = sectionAt(toPage(e.ts));
    if (!sec) continue;
    if (e.name === 'DrawFrame') S(sec).drawFrames++;
    if (e.name === 'DroppedFrame') S(sec).droppedFrames++;
  }
  // invalidations (instant events with the node and the reason)
  for (const e of kept) {
    if (!/InvalidationTracking$/.test(e.name)) continue;
    const sec = sectionAt(toPage(e.ts));
    if (!sec) continue;
    const d = e.args?.data || {};
    const kind = e.name.replace('InvalidationTracking', '').replace('StyleRecalc', 'style').replace('StyleInvalidator', 'style-set').replace('ScheduleStyle', 'style-sched').replace('Paint', 'paint').replace('Layout', 'layout');
    const why = d.reason || d.changedAttribute || d.changedClass || d.changedId || d.changedPseudo || (d.invalidationSet && 'invalidation set') || (d.invalidationList && 'invalidation list') || '';
    const k = `${kind}: ${d.nodeName || '?'}${why ? ` (${why})` : ''}`;
    const s = S(sec);
    s.inval[k] = (s.inval[k] || 0) + 1;
  }
  // DrawFrame can also be an async/complete event
  for (const e of evs) {
    if (e.name === 'DrawFrame') {
      const sec = sectionAt(toPage(e.ts));
      if (sec) S(sec).drawFrames++;
    }
  }
  const out = {};
  for (const [name, s] of per) {
    const el = s.styleElements.sort((a, b) => a - b);
    const lo = s.layoutObjects.sort((a, b) => a - b);
    const top = (o, n = 6) =>
      Object.entries(o)
        .sort((a, b) => b[1].ms - a[1].ms)
        .slice(0, n)
        .map(([k, v]) => ({ k, n: v.n, ms: Math.round(v.ms * 10) / 10 }));
    out[name] = {
      mainTaskMs: s.mainTaskMs,
      styleN: s.styleN,
      styleMs: s.styleMs,
      styleElemP50: el.length ? el[el.length >> 1] : null,
      styleElemMax: el.length ? el[el.length - 1] : null,
      styleElemSum: el.reduce((a, b) => a + b, 0),
      layoutN: s.layoutN,
      layoutMs: s.layoutMs,
      layoutDirtyP50: lo.length ? lo[lo.length >> 1] : null,
      paintN: s.paintN,
      paintMs: s.paintMs,
      paintImageN: s.paintImageN,
      paintImageMs: s.paintImageMs,
      prePaintMs: s.prePaintMs,
      layerizeMs: s.layerizeMs,
      commitMs: s.commitMs,
      scriptMs: s.scriptMs,
      rafMs: s.rafMs,
      gcMs: s.gcMs,
      decodeMs: s.decodeMs,
      rasterMs: s.rasterMs,
      gpuMs: s.gpuMs,
      vizMs: s.vizMs,
      compositorMs: s.compositorMs,
      pipeline: pipelineStats(s.reports),
      topInval: Object.entries(s.inval)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 14)
        .map(([k, n]) => ({ k, n })),
      drawFrames: s.drawFrames,
      droppedFrames: s.droppedFrames,
      forcedStyleN: s.forcedStyleN,
      forcedStyleMs: s.forcedStyleMs,
      forcedLayoutN: s.forcedLayoutN,
      forcedLayoutMs: s.forcedLayoutMs,
      topForced: top(s.forced),
      topScript: top(s.fn, 8),
      topPaintNodes: Object.entries(s.paintNodes)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([k, v]) => ({ k, ms: Math.round(v * 10) / 10 })),
    };
  }
  return { offsetMs, sections: out, threads: { main: th.main } };
}

// Frames as the compositor reports them: presented, dropped, partial; and per stage how long the slow ones took
function pipelineStats(reports) {
  if (!reports.length) return null;
  const q = (arr, p) => {
    const v = arr.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
    return v.length ? v[Math.min(v.length - 1, Math.max(0, Math.ceil(p * v.length) - 1))] : null;
  };
  const smooth = reports.filter((r) => r.smooth);
  const by = (st) => reports.filter((r) => r.state === st).length;
  const stage = (name) => reports.map((r) => r.stages[name]).filter((x) => x != null);
  const out = {
    reports: reports.length,
    smoothFrames: smooth.length,
    presentedAll: by('STATE_PRESENTED_ALL'),
    presentedPartial: by('STATE_PRESENTED_PARTIAL'),
    dropped: by('STATE_DROPPED'),
    droppedSmooth: smooth.filter((r) => r.state === 'STATE_DROPPED').length,
    partialSmooth: smooth.filter((r) => r.state === 'STATE_PRESENTED_PARTIAL').length,
    missingContent: reports.filter((r) => r.missing).length,
    latencyP50: q(reports.map((r) => r.dur), 0.5),
    latencyP95: q(reports.map((r) => r.dur), 0.95),
    stages: {},
  };
  for (const n of STAGES) {
    const v = stage(n);
    if (v.length) out.stages[n] = { p50: q(v, 0.5), p95: q(v, 0.95), max: q(v, 1) };
  }
  return out;
}
