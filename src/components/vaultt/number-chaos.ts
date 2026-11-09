/*
 * The homepage's chaos landing for a VaulttNumber in mode="chaos" (one span per glyph, see VaulttNumber.astro).
 *
 * One value drives it, v from 0 to 2: 0 waiting below (scattered, invisible), 1 formed, 2 gone off the top
 * (scattered upward, invisible). vaultt-home.ts feeds v from the scroll alone: 0 to 1 across the switch that brings
 * the number in, 1 to 2 across the one that takes it away (a page stopped part-way leaves it part-way).
 *
 * - Arriving (0 to 1): every letter starts out in a cloud spread out from the number's centre (pushed outward in
 *   proportion to its distance from the centre, plus a seeded jitter), a little below its slot, turned, small,
 *   blurred and transparent, and settles into place. The centre letters lead and the settling spreads outward.
 * - Leaving (1 to 2): the mirror, toward the top: the outer letters go first, upward and outward.
 * - The label does the same at its own size, a beat after the number arriving and a beat before it leaving.
 *
 * Cost: transform, opacity and (Chromium on a wide screen only) filter on about 20 small spans, written only when
 * v moved, nothing laid out. A per-letter blur in WebKit re-rasterizes every frame and could leave text soft after
 * settling (README, rules 1 and 8), and a phone has the least GPU to spare, so those get the fallback: no blur,
 * the letters start 1.3x large and transparent, which reads as out of focus. The spans only hold `will-change`
 * while they move: at v = 1 every inline style is cleared, so the finished number is the plain server text.
 * Nothing clips them: the spread is capped so the outermost letter stays on the screen.
 */

export interface Chaos {
  /** Reads where every glyph sits (call after layout changes: resize, fonts). */
  measure(vw: number): void;
  /** Places every glyph for v (0 waiting, 1 formed, 2 gone). */
  set(v: number): void;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const outQuart = (t: number) => 1 - Math.pow(1 - t, 4);
const inCubic = (t: number) => t * t * t;

/** Seeded random numbers (mulberry32), so a number scatters the same way on every visit. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Chromium only (the per-letter blur stays on the compositor there). The userAgentData check LiquidGlassBar uses. */
const chromium = (() => {
  const ua = (navigator as Navigator & { userAgentData?: { brands?: { brand: string }[] } }).userAgentData;
  return !!ua?.brands?.some((b) => b.brand === 'Chromium');
})();

/** How one line (the number or its label) scatters, in units of its own font size. */
interface LineLook {
  spread: number; // outward push, as a share of a glyph's distance from the line's centre
  jitterX: number; // em
  rise: number; // em, the vertical reach of the scatter
  turn: number; // deg, the largest rotation
  blur: number; // em, the blur at the start (Chromium, wide screens)
}
const NUMBER: LineLook = { spread: 0.62, jitterX: 0.18, rise: 0.62, turn: 34, blur: 0.11 };
const LABEL: LineLook = { spread: 0.7, jitterX: 0.5, rise: 1.7, turn: 48, blur: 0.32 };
// the share of the range spent waiting for a glyph's turn (centre first arriving, outer first leaving)
const STAGGER = 0.42;

interface Glyph {
  el: HTMLElement;
  c: number; // px from the line's centre
  r: number; // 0 at the centre, 1 at the outermost glyph
  // arriving
  inDelay: number;
  inX: number; // px
  inY: number; // px (below)
  inRot: number;
  inScale: number;
  // leaving
  outDelay: number;
  outX: number;
  outY: number; // px (above)
  outRot: number;
  outScale: number;
  last: string; // the last style written, so an unchanged glyph costs nothing
}

interface Line {
  root: HTMLElement;
  look: LineLook;
  glyphs: Glyph[];
  fs: number; // font size, px
  state: 'formed' | 'moving' | 'hidden';
}

/**
 * Collects the number's and the label's glyphs under `el` (a `.vn--chaos` block). `seed` makes each number
 * scatter its own way.
 */
export function makeChaos(el: HTMLElement, seed: number): Chaos {
  const lines: Line[] = [];
  const numLine = el.querySelector<HTMLElement>('.vn__num .vn__line');
  const labLine = el.querySelector<HTMLElement>('.vn__label .vn__line');
  const rand = rng(seed);
  for (const [root, look] of [[numLine, NUMBER], [labLine, LABEL]] as const) {
    if (!root) continue;
    const glyphs: Glyph[] = Array.from(root.querySelectorAll<HTMLElement>('.vn__g')).map((g) => ({
      el: g, c: 0, r: 0, inDelay: 0, inX: 0, inY: 0, inRot: 0, inScale: 1, outDelay: 0, outX: 0, outY: 0, outRot: 0, outScale: 1, last: '',
    }));
    // the seeded draws, fixed for the life of the page (positions come from measure())
    for (const g of glyphs) {
      g.inRot = (rand() * 2 - 1) * look.turn;
      g.outRot = (rand() * 2 - 1) * look.turn;
      g.inScale = rand();
      g.outScale = rand();
      g.inDelay = rand();
      g.outDelay = rand();
      g.inX = rand() * 2 - 1;
      g.outX = rand() * 2 - 1;
      g.inY = rand();
      g.outY = rand();
    }
    lines.push({ root, look, glyphs, fs: 16, state: 'formed' });
  }
  // the seeded unit draws, kept so measure() can turn them into pixels again after a resize
  const draws = lines.map((l) => l.glyphs.map((g) => ({ inX: g.inX, outX: g.outX, inY: g.inY, outY: g.outY, inScale: g.inScale, outScale: g.outScale, inDelay: g.inDelay, outDelay: g.outDelay })));
  let blur = false;
  let lastV = -1;
  // the v last placed, so measure() can put the glyphs straight back (it clears them to read their slots, and a
  // remeasure from a resize or a ResizeObserver lands mid-frame: without this one frame painted them formed)
  let placed = 1;

  return {
    measure(vw: number) {
      blur = chromium && vw > 900;
      lines.forEach((line, li) => {
        for (const g of line.glyphs) {
          g.el.style.transform = '';
          g.last = '';
        }
        const lr = line.root.getBoundingClientRect();
        line.fs = parseFloat(getComputedStyle(line.root).fontSize) || 16;
        const mid = lr.left + lr.width / 2;
        let half = 1;
        const rects = line.glyphs.map((g) => g.el.getBoundingClientRect());
        line.glyphs.forEach((g, i) => {
          g.c = rects[i].left + rects[i].width / 2 - mid;
          half = Math.max(half, Math.abs(g.c));
        });
        // the spread that keeps the outermost glyph on the screen (12px clear of each edge): a phone's number sits
        // 20px from the left edge, where the full spread threw the first digit off the screen
        const look = line.look;
        const jx = look.jitterX * line.fs;
        let spread = look.spread;
        for (let i = 0; i < line.glyphs.length; i++) {
          const g = line.glyphs[i];
          const r = rects[i];
          const room = g.c < 0 ? r.left - 12 - jx : vw - 12 - r.right - jx;
          if (Math.abs(g.c) > 1) spread = Math.min(spread, Math.max(0, room) / Math.abs(g.c));
        }
        const d = draws[li];
        line.glyphs.forEach((g, i) => {
          const u = d[i];
          g.r = Math.abs(g.c) / half;
          g.inDelay = STAGGER * (0.74 * g.r + 0.26 * u.inDelay);
          g.outDelay = STAGGER * (0.74 * (1 - g.r) + 0.26 * u.outDelay);
          g.inX = g.c * spread + u.inX * jx;
          g.outX = g.c * spread + u.outX * jx;
          g.inY = (0.3 + 0.7 * u.inY) * look.rise * line.fs;
          g.outY = -(0.45 + 0.55 * u.outY) * look.rise * line.fs;
          // blurred letters start small; without the blur they start large and soft (out of focus)
          g.inScale = blur ? 0.45 + 0.4 * u.inScale : 1.22 + 0.2 * u.inScale;
          g.outScale = blur ? 0.5 + 0.4 * u.outScale : 1.2 + 0.25 * u.outScale;
        });
      });
      lastV = -1;
      if (placed !== 1) this.set(placed);
    },

    set(v: number) {
      // A change too small to see is skipped, but never the step onto an end (formed, waiting, gone): a switch that
      // creeps the last few thousandths into place then lands on exactly 1 left the letters a hair off their slots,
      // each still holding its layer (found by vxstate.mjs after quick back and forth over a switch).
      if (v === lastV || (Math.abs(v - lastV) < 0.0008 && v !== 0 && v !== 1 && v !== 2)) return;
      lastV = v;
      placed = v;
      lines.forEach((line, li) => {
        // the label arrives a beat after the number and leaves a beat before it
        const lv = li === 0 ? v : v <= 1 ? clamp01((v - 0.14) / 0.86) : 1 + clamp01((v - 1) / 0.86);
        if (lv === 1) {
          if (line.state !== 'formed') {
            line.state = 'formed';
            line.root.style.visibility = '';
            for (const g of line.glyphs) {
              const s = g.el.style;
              s.transform = s.opacity = s.filter = s.willChange = '';
              g.last = '';
            }
          }
          return;
        }
        if (lv <= 0 || lv >= 2) {
          // waiting or gone: hidden as a whole, nothing per glyph (and no layers held)
          if (line.state !== 'hidden') {
            line.state = 'hidden';
            line.root.style.visibility = 'hidden';
            for (const g of line.glyphs) {
              g.el.style.willChange = '';
              g.last = '';
            }
          }
          return;
        }
        if (line.state !== 'moving') {
          line.state = 'moving';
          const wc = blur ? 'transform, opacity, filter' : 'transform, opacity';
          for (const g of line.glyphs) g.el.style.willChange = wc;
          line.root.style.visibility = '';
        }
        const arriving = lv < 1;
        const p = arriving ? lv : lv - 1;
        const blurMax = line.look.blur * line.fs;
        for (const g of line.glyphs) {
          let x: number;
          let y: number;
          let rot: number;
          let sc: number;
          let op: number;
          let k: number; // 1 = fully scattered
          if (arriving) {
            const u = clamp01((p - g.inDelay) / (1 - STAGGER));
            const w = outQuart(u);
            k = 1 - w;
            x = g.inX * k;
            y = g.inY * k;
            rot = g.inRot * k;
            sc = g.inScale + (1 - g.inScale) * w;
            op = smooth(0, 0.62, u);
          } else {
            const u = clamp01((p - g.outDelay) / (1 - STAGGER));
            const w = inCubic(u);
            k = w;
            x = g.outX * w;
            y = g.outY * w;
            rot = g.outRot * w;
            sc = 1 + (g.outScale - 1) * w;
            op = 1 - smooth(0.2, 0.9, u);
          }
          let css = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) rotate(${rot.toFixed(1)}deg) scale(${sc.toFixed(3)})`;
          const b = blur ? Math.round(blurMax * Math.pow(k, 1.25) * 10) / 10 : 0;
          const key = `${css}|${op.toFixed(3)}|${b}`;
          if (key === g.last) continue;
          g.last = key;
          const s = g.el.style;
          if (k < 0.0015) css = 'none';
          s.transform = css;
          s.opacity = op >= 0.999 ? '' : op.toFixed(3);
          if (blur) s.filter = b >= 0.15 ? `blur(${b}px)` : '';
        }
      });
    },
  };
}
