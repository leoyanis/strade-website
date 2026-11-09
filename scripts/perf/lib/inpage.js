// In-page instrumentation, injected before any page script (addInitScript). Engine agnostic: it feature-detects
// LoAF, long tasks, LCP, layout shifts and event timing, so the same file runs in Chromium and WebKit.
// Rules for this file: no layout reads while recording (only scrollY in the first scroll listener, where layout
// is already clean), no allocation per frame (typed arrays), nothing runs unless a pass asked for it.
(() => {
  if (window.__perf) return;
  const now = () => performance.now();
  const nativeRAF = window.requestAnimationFrame.bind(window);
  const P = (window.__perf = {
    nativeRAF,
    recording: false,
    // frames: [rAF timestamp, end of that frame's rendering (post-render message), scrollY] per frame
    frames: new Float64Array(3 * 120000),
    nFrames: 0,
    // every scroll event: [time, scrollY]
    scrolls: new Float64Array(2 * 120000),
    nScrolls: 0,
    loaf: [],
    longtasks: [],
    lcp: [],
    shifts: [],
    events: [],
    paints: [],
    rafCalls: 0,
    rafSample: 0, // sample one rAF request stack in this many (0 = off)
    rafSites: {},
    lastY: 0,
  });

  // The scroll position is read after each frame has rendered (in the frame loop's message, below), never in a
  // scroll listener: a read there forced style and layout whenever an earlier task had dirtied them (seen in the
  // first traces as forced layouts attributed to this file), which moved cost around and blamed the harness.

  // rAF requests per second at rest, and (when sampling) which code asked for them
  window.requestAnimationFrame = function (cb) {
    P.rafCalls++;
    if (P.rafSample && P.rafCalls % P.rafSample === 0) {
      const st = (new Error().stack || '').split('\n').slice(2, 6).map((s) => s.trim()).join(' < ');
      P.rafSites[st] = (P.rafSites[st] || 0) + 1;
    }
    return nativeRAF(cb);
  };

  // audio before the first press: count every AudioContext / OfflineAudioContext made and every decode
  P.audio = [];
  P.firstPress = null;
  addEventListener('pointerdown', () => { if (P.firstPress == null) P.firstPress = now(); }, { capture: true, passive: true });
  addEventListener('keydown', () => { if (P.firstPress == null) P.firstPress = now(); }, { capture: true, passive: true });
  for (const name of ['AudioContext', 'webkitAudioContext', 'OfflineAudioContext', 'webkitOfflineAudioContext']) {
    const C = window[name];
    if (typeof C !== 'function') continue;
    const Wrapped = function (...args) {
      P.audio.push({ what: `new ${name}`, t: now(), beforePress: P.firstPress == null });
      return Reflect.construct(C, args, new.target || Wrapped);
    };
    Wrapped.prototype = C.prototype;
    try {
      const dec = C.prototype.decodeAudioData;
      if (dec && !dec.__perf) {
        const wrappedDec = function (...a) {
          P.audio.push({ what: `${name}.decodeAudioData`, t: now(), beforePress: P.firstPress == null });
          return dec.apply(this, a);
        };
        wrappedDec.__perf = true;
        C.prototype.decodeAudioData = wrappedDec;
      }
    } catch {}
    window[name] = Wrapped;
  }

  // frame loop: rAF timestamp and the end of that frame's rendering (a message posted from rAF runs after the
  // style, layout and paint of the same frame)
  const mc = new MessageChannel();
  const pending = [];
  const onRendered = () => {
    const ts = pending.shift();
    const end = now();
    if (ts === undefined || P.nFrames >= 120000) return;
    // after rendering, layout is clean: reading scrollY here costs nothing
    const y = window.scrollY;
    if (y !== P.lastY && P.nScrolls < 120000) {
      const j = P.nScrolls++ * 2;
      P.scrolls[j] = end;
      P.scrolls[j + 1] = y;
    }
    P.lastY = y;
    const i = P.nFrames++ * 3;
    P.frames[i] = ts;
    P.frames[i + 1] = end;
    P.frames[i + 2] = y;
  };
  mc.port1.onmessage = onRendered;
  // one loop per recording: a stop() and start() inside the same frame would otherwise leave the old chain
  // alive next to the new one (two entries per frame, intervals of 0)
  let gen = 0;
  // A plain MessageChannel message. Tried scheduler.postTask at user-blocking priority to avoid the message
  // occasionally waiting behind the next frame: on the control page it made things worse (work p95 2 -> 10 ms,
  // dropped 2% -> 9%), so the small artefact stays and the control page shows its size.
  const post = () => mc.port2.postMessage(0);
  const makeLoop = (g) => {
    const loop = (ts) => {
      if (!P.recording || g !== gen) return;
      pending.push(ts);
      post();
      nativeRAF(loop);
    };
    return loop;
  };

  P.start = () => {
    gen++;
    P.nFrames = 0;
    P.nScrolls = 0;
    pending.length = 0;
    P.loaf.length = 0;
    P.longtasks.length = 0;
    P.events.length = 0;
    P.lastY = window.scrollY;
    P.t0 = now();
    P.recording = true;
    nativeRAF(makeLoop(gen));
    return P.t0;
  };
  P.stop = () => {
    P.recording = false;
    P.t1 = now();
    return P.t1;
  };
  // plain arrays for the harness (typed arrays do not survive page.evaluate)
  P.dump = () => ({
    t0: P.t0,
    t1: P.t1,
    frames: Array.from(P.frames.subarray(0, P.nFrames * 3)),
    scrolls: Array.from(P.scrolls.subarray(0, P.nScrolls * 2)),
    loaf: P.loaf.slice(),
    longtasks: P.longtasks.slice(),
    events: P.events.slice(),
  });

  const observe = (type, fn, extra) => {
    try {
      if (!PerformanceObserver.supportedEntryTypes || !PerformanceObserver.supportedEntryTypes.includes(type)) return false;
      new PerformanceObserver((list) => list.getEntries().forEach(fn)).observe({ type, buffered: true, ...extra });
      return true;
    } catch {
      return false;
    }
  };
  P.support = {};
  const keep = (arr, max) => (e) => {
    if (arr.length < max) arr.push(e);
  };
  P.support.loaf = observe(
    'long-animation-frame',
    (e) => {
      if (P.loaf.length >= 5000) return;
      P.loaf.push({
        start: e.startTime,
        duration: e.duration,
        blocking: e.blockingDuration,
        renderStart: e.renderStart,
        styleAndLayoutStart: e.styleAndLayoutStart,
        firstUI: e.firstUIEventTimestamp,
        y: P.lastY,
        scripts: (e.scripts || []).map((s) => ({
          invoker: s.invoker,
          type: s.invokerType,
          url: s.sourceURL,
          fn: s.sourceFunctionName,
          pos: s.sourceCharPosition,
          start: s.startTime,
          duration: s.duration,
          forced: s.forcedStyleAndLayoutDuration,
          pause: s.pauseDuration,
        })),
      });
    },
  );
  P.support.longtask = observe('longtask', (e) => keep(P.longtasks, 5000)({ start: e.startTime, duration: e.duration, y: P.lastY, name: e.name }));
  P.support.lcp = observe('largest-contentful-paint', (e) =>
    P.lcp.push({
      start: e.startTime,
      size: e.size,
      url: e.url || '',
      el: e.element ? `${e.element.tagName.toLowerCase()}${e.element.id ? '#' + e.element.id : ''}${e.element.className && typeof e.element.className === 'string' ? '.' + e.element.className.trim().split(/\s+/).join('.') : ''}` : '',
    }),
  );
  P.support.shift = observe('layout-shift', (e) =>
    keep(P.shifts, 2000)({
      start: e.startTime,
      value: e.value,
      input: e.hadRecentInput,
      y: window.scrollY,
      sources: (e.sources || []).slice(0, 3).map((s) => (s.node && s.node.nodeType === 1 ? `${s.node.tagName.toLowerCase()}${s.node.id ? '#' + s.node.id : ''}.${String(s.node.className || '').trim().split(/\s+/).slice(0, 2).join('.')}` : String(s.node && s.node.nodeName))),
    }),
  );
  P.support.event = observe(
    'event',
    (e) => {
      if (!P.recording || P.events.length >= 5000) return;
      P.events.push({ name: e.name, start: e.startTime, duration: e.duration, delay: e.processingStart - e.startTime, processing: e.processingEnd - e.processingStart, y: P.lastY });
    },
    { durationThreshold: 16 },
  );
  P.support.paint = observe('paint', (e) => P.paints.push({ name: e.name, start: e.startTime }));

  // what keeps running at rest: running animations, playing media, and canvases, each with "on screen or not"
  P.restReport = () => {
    const vh = innerHeight;
    const vw = innerWidth;
    const desc = (el) => {
      if (!el || el.nodeType !== 1) return String(el);
      const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
      return `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${cls ? '.' + cls : ''}`;
    };
    const onScreen = (el) => {
      if (!el || !el.getBoundingClientRect) return false;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return false;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      return r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw;
    };
    const anims = (document.getAnimations ? document.getAnimations() : [])
      .filter((a) => a.playState === 'running')
      .map((a) => {
        const t = a.effect && a.effect.target;
        let props = [];
        try {
          props = a.effect.getKeyframes().flatMap((k) => Object.keys(k).filter((p) => !['offset', 'easing', 'composite', 'computedOffset'].includes(p)));
        } catch {}
        return {
          kind: a.constructor.name,
          name: a.animationName || a.transitionProperty || a.id || '',
          target: desc(t),
          pseudo: (a.effect && a.effect.pseudoElement) || '',
          props: [...new Set(props)].slice(0, 6),
          onScreen: onScreen(t),
          infinite: a.effect && a.effect.getTiming ? a.effect.getTiming().iterations === Infinity : false,
        };
      });
    const media = Array.from(document.querySelectorAll('video, audio')).map((m) => ({
      tag: m.tagName.toLowerCase(),
      src: (m.currentSrc || m.getAttribute('src') || (m.querySelector('source') || {}).src || '').replace(location.origin, ''),
      playing: !m.paused && !m.ended,
      onScreen: onScreen(m),
      preload: m.preload,
      readyState: m.readyState,
      width: m.videoWidth || 0,
      height: m.videoHeight || 0,
      box: m.getBoundingClientRect ? Math.round(m.getBoundingClientRect().width) + 'x' + Math.round(m.getBoundingClientRect().height) : '',
    }));
    const canvases = Array.from(document.querySelectorAll('canvas')).map((c) => ({
      el: desc(c),
      size: `${c.width}x${c.height}`,
      css: `${Math.round(c.getBoundingClientRect().width)}x${Math.round(c.getBoundingClientRect().height)}`,
      onScreen: onScreen(c),
    }));
    return { anims, media, canvases, nodes: document.getElementsByTagName('*').length };
  };

  // the page's sections in document coordinates (read once, after the page has settled)
  P.sections = (selectors) => {
    const sy = window.scrollY;
    const seen = new Set();
    const out = [];
    const add = (el, name) => {
      if (!el || seen.has(el)) return;
      seen.add(el);
      const r = el.getBoundingClientRect();
      if (r.height < 40) return;
      out.push({ name, top: Math.round(r.top + sy), bottom: Math.round(r.bottom + sy) });
    };
    if (selectors && selectors.length) {
      selectors.forEach((s) => document.querySelectorAll(s).forEach((el) => add(el, s.replace(/^#/, ''))));
    } else {
      const cands = Array.from(document.querySelectorAll('main > section, main > header, main > div > section, main > article > section, body > section, footer'));
      cands.forEach((el, i) => {
        const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/)[0] : '';
        add(el, el.id || cls || `${el.tagName.toLowerCase()}-${i}`);
      });
    }
    out.sort((a, b) => a.top - b.top);
    // names must be unique for the per-section tables
    const count = {};
    out.forEach((s) => {
      count[s.name] = (count[s.name] || 0) + 1;
      if (count[s.name] > 1) s.name = `${s.name}#${count[s.name]}`;
    });
    return { sections: out, height: document.documentElement.scrollHeight, vh: innerHeight, vw: innerWidth };
  };
})();
