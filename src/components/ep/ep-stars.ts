// The app's opening, on the web: stars flowing round an ∞ the way a swarm follows a line
// (lib/ui/components/star_infinity.dart and AppIntro in the app repo, tuned by Yanis on his phone).
// Fine points, mostly dust, a few brighter with a soft glow, a fifth of them gold, over a faint gold
// wash along the curve. The ones on the curve run fastest; the further one strays, the slower it goes.
// `gather` (0 to 1) brings them in from scattered: they come out where they are, then pull in faster
// and faster. On the web the swarm also parts round the pointer and heals behind it.
//
// On the homepage the swarm starts as a star field (`field`): spread over the screen and fully bright before the
// gather, so the sky is there the moment the world turns black, and the gather pulls it into the ∞ as the page
// scrolls. The gold wash along the curve (the ∞'s outline glow) can be handed to the caller (`bloom`), which shows
// it only once everything is centred.
//
// One simulation, two renderers. The GPU draws the frame where it can (ep-stars-gl.ts: three draw calls);
// the 2D renderer below (one drawImage per stamp, about 2,770 a frame on desktop) is the fallback for a
// browser without WebGL and for a lost context. Both draw the same sprites at the same rects from the same
// typed arrays, so switching between them does not change the look.

import { clamp, easeOut } from './ep-motion';
import { createGlStars, type GlStars } from './ep-stars-gl';

// AppIntro, verbatim, except four values lifted a tad on the web (Yanis, 2026-11-07: "a tad brighter"): size
// 0.97 -> 1.08, glowAlpha 0.21 -> 0.25, trace 0.1 -> 0.12, twinkle 0.63 -> 0.55. `brightness` stays: about half
// the stars already sit at full alpha, so it barely moves anything; size, glow, wash and fewer dim troughs do.
const A = {
  span: 0.84, boxHeight: 0.46, loopFill: 1.2,
  spread: 0.026, strays: 0.18,
  dustRadius: [0.25, 0.5], midRadius: [0.5, 0.9], brightRadius: [0.9, 1.4],
  dustAlpha: [0.32, 0.75], midAlpha: [0.6, 0.95], brightAlpha: [0.9, 1.0],
  midShare: 0.17, brightShare: 0.15, glowReach: 6.2, glowAlpha: 0.25, midGlow: 0.35, goldShare: 0.2,
  brightness: 2.57, size: 1.08, speed: 0.45, twinkle: 0.55, twinkleSeconds: [1.8, 5.0],
  trace: 0.12, traceBlur: 9,
  lapFast: 48, lapSlow: 120, lapVary: 0.1, sway: 0.012, swaySeconds: [6, 14],
  scatter: 2.4, gatherFade: 0.45, gatherPull: 3.2, gatherStagger: 0.12, seed: 8,
} as const;
const COLOURS = ['#E9ECF2', '#E3C588', '#F0DCAF']; // starWhite, gold, goldHi
const TAU = Math.PI * 2;
// the step along the curve its tangent is taken over, as a rotation: sin(t + h) and cos(t + h) from sin t and
// cos t by the angle-sum formulas (multiplies instead of two more trig calls per star; in a test over 4.2
// million star frames the float32 positions came out bit for bit the same as with Math.sin and Math.cos)
const STEP = 0.001, SIN_STEP = Math.sin(STEP), COS_STEP = Math.cos(STEP);
// the custom properties ep-section.ts sets on the canvas to place the headline's dimming ellipse
const MASK_VARS = ['--tx', '--ty', '--tw', '--th'];
// A star field's pull into the ∞, an ease out: 1 - (1 - gather)^FIELD_EASE of the way. The scattered swarm's
// gather^3.2 left the first third of the gather all but still (0.3^3.2 = 2% of the way), which was fine while that
// third was the stars fading in; a field that is already on screen has to answer the scroll at once. Since the gather
// begins as Vaultt's jobs leave (2026-11-09), the stars visibly head for the ∞ within a tenth of a screen of them, the
// loose ∞ is there before this section's words come up into it, and the rest of the way it settles (and HUG tightens
// it) while the words and phone come into place. Tried gather^1.7, ^1.15, ^0.85, then an ease out of 3 with the
// app's 0.12 stagger: each still read as the field roaming for a fifth to half a screen past the jobs (the ease out
// of 3: a band only 200px past them on a desktop, density round the curve 1.35 times the field's). The curve runs a
// screen wide, close to most of the field, so a field part of the way there still looks like a field.
const FIELD_EASE = 6;
// A star field's start stagger, a share of the gather (the app's swarm spreads its starts over 0.12 of it, which
// held half the stars still for the gather's first 60px on a desktop): just enough that they don't set off as one.
const FIELD_STAGGER = 0.03;
// How much closer to the curve the swarm runs once it has gathered (over the last quarter of the gather, so with the
// scroll): half the app's spread, so the finished ∞ reads as a line of stars, denser and brighter along its path. At
// the app's spread, on a curve a screen wide, it read as a sparse ring of dust (2026-11-08 site check).
const HUG = 0.5;
// The finished ∞'s outline (the wash, which the caller brings in as `bloom` once everything is centred): a crisp gold
// line along the curve inside a close glow and a wide soft halo, so it reads as a drawn ∞. The first wash, one stroke
// at 0.12 a thirty-third of the width wide and blurred 9px, read as a faint haze over the dust.
const OUTLINE = { line: 0.7, glow: 0.3, halo: 0.13 };
// the wash canvas's margin round the curve: room for the halo's blur
const PAD = 56;
// A star field's own slow drift while it waits (Yanis, 2026-11-08: "it's just the stars for a moment, just slowly
// drifting"): each star wanders round a small loop, WANDER of the field's longer side across (about 30px on a desktop,
// 18 on a phone), once every 1.6 of its sway periods (20 to 50 s), a clock's motion like the twinkle, not the
// scroll's. The gather pulls each star in from wherever its wander has taken it, so nothing jumps.
const WANDER = 0.02;

export type StarFrame = { cx: number; cy: number; w: number };
/** Where a star field waits before the gather, in the canvas's CSS pixels. */
export type StarField = { x: number; y: number; w: number; h: number };
export type Stars = {
  setGather(g: number): void;
  /** The ∞'s outline glow (the gold wash), 0 to 1, set by the caller; null hands it back to the gather. */
  bloom(b: number | null): void;
  pointer(x: number, y: number, on: boolean): void;
  /** A ring that runs out through the swarm from (x, y), for a tap on the sky. */
  ripple(x: number, y: number): void;
  layout(): void;
  run(on: boolean): void;
};

/** Whatever draws a frame from the simulation's arrays: the GPU, or the 2D fallback. */
type Painter = {
  /** The wash canvas was just redrawn. */
  wash(): void;
  /** One frame, the wash at `formed`. */
  frame(formed: number): void;
};

/** The same stars every time (mulberry32, seeded as AppIntro.seed). */
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

/**
 * Builds the swarm on `canvas`. `frame` says where the ∞ sits (its centre and width, in the canvas's
 * CSS pixels); it is read again on every layout. With `still`, one finished frame is drawn and nothing ticks.
 * With `field`, the stars wait spread over that rect (read on every layout) at full strength instead of hidden
 * round the ∞; the caller fades the canvas in and out. No context is made until the swarm has something to show
 * or the canvas comes within a screen of view.
 */
export function createStars(canvas: HTMLCanvasElement, opts: { count: number; still: boolean; frame: () => StarFrame; field?: () => StarField }): Stars {
  const n = opts.count;
  const rand = rng(A.seed);
  const gauss = () => Math.sqrt(-2 * Math.log(Math.max(rand(), 1e-9))) * Math.cos(TAU * rand());
  const within = (r: readonly number[]) => r[0] + (r[1] - r[0]) * rand();

  // Each star's own draws, laid out flat so a frame allocates nothing.
  const start = new Float32Array(n), lap = new Float32Array(n), off = new Float32Array(n);
  const sway = new Float32Array(n), swayS = new Float32Array(n), swayP = new Float32Array(n);
  const radius = new Float32Array(n), base = new Float32Array(n), glowK = new Float32Array(n), reach = new Float32Array(n);
  const colour = new Uint8Array(n), twS = new Float32Array(n), twP = new Float32Array(n);
  const fromX = new Float32Array(n), fromY = new Float32Array(n), delay = new Float32Array(n);
  const dispX = new Float32Array(n), dispY = new Float32Array(n);
  // What both renderers read: per frame x, y (CSS px) and alpha (the GPU uploads this array as it is), and
  // per star the dot radius, glow reach, glow strength and colour (uploaded once).
  const dyn = new Float32Array(n * 3);
  const stat = new Float32Array(n * 4);
  const edge = A.spread * 2.5;
  const lerpR = (r: readonly number[], t: number) => r[0] + (r[1] - r[0]) * t;
  for (let i = 0; i < n; i++) {
    const stray = rand() < A.strays;
    const o = gauss() * A.spread * (stray ? 2.2 : 1);
    const away = clamp(Math.abs(o) / edge, 0, 1);
    const pace = 1 + A.lapVary * (rand() * 2 - 1);
    start[i] = rand();
    lap[i] = (A.lapFast + (A.lapSlow - A.lapFast) * away) * pace;
    off[i] = o;
    sway[i] = (0.3 + rand() * 0.7) * A.sway;
    swayS[i] = within(A.swaySeconds);
    swayP[i] = rand();
    const kind = rand();
    const look = rand();
    const bright = kind < A.brightShare;
    const mid = !bright && kind < A.brightShare + A.midShare;
    radius[i] = lerpR(bright ? A.brightRadius : mid ? A.midRadius : A.dustRadius, look) * A.size;
    base[i] = lerpR(bright ? A.brightAlpha : mid ? A.midAlpha : A.dustAlpha, look);
    glowK[i] = A.glowAlpha * (bright ? 1 : mid ? A.midGlow : 0);
    reach[i] = radius[i] * A.glowReach * (bright ? 1 : 0.6);
    const goldDraw = rand();
    const hi = rand() < 0.5;
    colour[i] = goldDraw < A.goldShare ? (hi ? 2 : 1) : 0;
    twS[i] = within(A.twinkleSeconds);
    twP[i] = rand();
    fromX[i] = (rand() - 0.5) * A.scatter;
    fromY[i] = (rand() - 0.5) * A.scatter * 2;
    delay[i] = rand() * A.gatherStagger;
    stat[i * 4] = radius[i];
    stat[i * 4 + 1] = reach[i];
    stat[i * 4 + 2] = glowK[i];
    stat[i * 4 + 3] = colour[i];
  }

  // A sharp disc and a soft glow per colour, drawn once and stamped per star (and the GPU's atlas, copied 1:1).
  const sprite = (c: string, glow: boolean) => {
    const s = glow ? 64 : 16;
    const cv = document.createElement('canvas');
    cv.width = cv.height = s;
    const g = cv.getContext('2d')!;
    const h = s / 2;
    if (glow) {
      const grad = g.createRadialGradient(h, h, 0, h, h, h);
      grad.addColorStop(0, c);
      grad.addColorStop(0.25, c + '55');
      grad.addColorStop(1, c + '00');
      g.fillStyle = grad;
      g.fillRect(0, 0, s, s);
    } else {
      const grad = g.createRadialGradient(h, h, 0, h, h, h);
      grad.addColorStop(0, c);
      grad.addColorStop(0.72, c);
      grad.addColorStop(1, c + '00');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(h, h, h, 0, TAU);
      g.fill();
    }
    return cv;
  };
  const dots = COLOURS.map((c) => sprite(c, false));
  const glows = COLOURS.map((c) => sprite(c, true));
  const wash = document.createElement('canvas');

  let W = 0, H = 0, dpr = 0, cx = 0, cy = 0, iw = 0, half = 0;
  let washDpr = 0;
  let washDirty = true;
  let gather = opts.still ? 1 : 0;
  // the star field's rect (null: the stars wait hidden round the ∞) and the caller's outline glow (null: the gather's)
  let field: StarField | null = null;
  let bloomV: number | null = null;
  let time = 0;
  let running = false;
  let raf = 0;
  let lastT = 0;
  // the pointer's field, faded in and out so leaving lets the swarm heal
  let ptrX = 0, ptrY = 0, ptrOn = false, ptrK = 0;
  let ripX = 0, ripY = 0, ripT = -1;
  // the renderer, picked lazily (ensure); `blank` says the canvas holds an empty frame, so an empty one is skipped
  let painter: Painter | null = null;
  let gpu: GlStars | null = null;
  let blank = true;
  // the 2D fallback's own canvas once this one holds a WebGL context (a lost one, or one that failed to set up)
  let alt: HTMLCanvasElement | null = null;
  let mirror: MutationObserver | null = null;

  // The ∞ at t round it, in units where it runs -1 to 1 across (its loops filled out a little).
  const curveX = (t: number) => Math.cos(t) / (1 + Math.sin(t) ** 2);
  const curveY = (t: number) => (Math.sin(t) * Math.cos(t)) / (1 + Math.sin(t) ** 2) * A.loopFill;

  function layout() {
    const r = canvas.getBoundingClientRect();
    // Capped at 2. Tried 1.5 on phones with the 2D renderer: with GPU raster it changed nothing measurable
    // (p95 frame 24.9 against 25.2 ms at 4x CPU throttle); its cost was per stamp, not per pixel.
    const d = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(r.width));
    const h = Math.max(1, Math.round(r.height));
    // A new backing store only when the size really changed: assigning width or height reallocates and
    // clears it, and layout runs on every ScrollTrigger refresh on the page, most of them not ours.
    if (w !== W || h !== H || d !== dpr) {
      W = w;
      H = h;
      dpr = d;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      if (alt) {
        alt.width = canvas.width;
        alt.height = canvas.height;
      }
      blank = true;
    }
    const f = opts.frame();
    cx = f.cx;
    cy = f.cy;
    field = opts.field ? opts.field() : null;
    // the wash is a blur over a canvas wider than the ∞: only redrawn when the ∞ changes size
    if (Math.abs(f.w - iw) >= 0.5 || dpr !== washDpr) {
      iw = f.w;
      washDpr = dpr;
      half = (iw / 2) * A.span;
      washDirty = true;
    }
    if (washDirty && painter) drawWash();
    draw(0);
  }

  // The ∞'s outline along the curve (OUTLINE), drawn once into its own canvas and handed to the renderer.
  function drawWash() {
    washDirty = false;
    wash.width = Math.round((iw + PAD * 2) * dpr);
    wash.height = Math.round((iw * A.boxHeight + PAD * 2) * dpr);
    const g = wash.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, wash.width, wash.height);
    const ox = PAD + iw / 2;
    const oy = PAD + (iw * A.boxHeight) / 2;
    g.beginPath();
    for (let i = 0; i <= 240; i++) {
      const t = (TAU * i) / 240;
      const x = ox + curveX(t) * half;
      const y = oy + curveY(t) * half;
      if (i) g.lineTo(x, y);
      else g.moveTo(x, y);
    }
    g.lineJoin = 'round';
    // WebKit has no canvas filter (Safari, and Playwright's WebKit, 2026-11-08): six strokes from wide to narrow at a
    // sixth of the alpha each stand in for the blur, a soft falloff to the same strength at the line. (One wider
    // stroke at half the alpha, the old stand-in, drew the halo as a flat ribbon with hard edges.)
    const fg = g as CanvasRenderingContext2D & { filter?: string };
    const blurs = typeof fg.filter === 'string';
    const soft = (width: number, alpha: number, blur: number) => {
      g.strokeStyle = `rgba(227, 197, 136, ${alpha})`;
      if (blurs) {
        g.lineWidth = width;
        fg.filter = `blur(${blur}px)`;
        g.stroke();
        fg.filter = 'none';
      } else {
        g.globalAlpha = 1 / 6;
        for (let i = 0; i < 6; i++) {
          g.lineWidth = width + blur * 2.4 * (1 - i / 6);
          g.stroke();
        }
        g.globalAlpha = 1;
      }
    };
    soft(iw * 0.026, OUTLINE.halo, 14);
    soft(Math.max(4, iw * 0.006), OUTLINE.glow, 3);
    // the line itself, crisp, in the lighter gold
    g.lineWidth = Math.max(1.3, iw * 0.0012);
    g.strokeStyle = `rgba(240, 220, 175, ${OUTLINE.line})`;
    g.stroke();
    painter?.wash();
  }

  /**
   * The GPU renderer: hands it the arrays. Once the wash is a texture its canvas is freed (about 19 MB at
   * 1440 wide on a 2x screen); the 2D fallback redraws it if it ever takes over.
   */
  function gpuPainter(g: GlStars): Painter {
    return {
      wash() {
        g.setWash(wash);
        wash.width = wash.height = 0;
      },
      frame(formed) {
        g.draw(dyn, dpr, formed, cx - iw / 2 - PAD, cy - (iw * A.boxHeight) / 2 - PAD);
      },
    };
  }

  /** The 2D renderer, as it always drew: the wash, then every glow, then every point, one drawImage each. */
  function canvasPainter(ctx: CanvasRenderingContext2D): Painter {
    return {
      wash() {},
      frame(formed) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, W, H);
        // (a wash freed by the GPU path is always redrawn before this renderer takes over; drawImage would
        // throw on a zero-size canvas, so the width check keeps one missed redraw from stopping the loop)
        if (formed > 0 && wash.width) {
          ctx.globalAlpha = formed;
          ctx.drawImage(wash, cx - iw / 2 - PAD, cy - (iw * A.boxHeight) / 2 - PAD, wash.width / dpr, wash.height / dpr);
        }
        // glows first, then the points over them
        for (let i = 0; i < n; i++) {
          const g = dyn[i * 3 + 2] * glowK[i];
          if (g <= 0.004) continue;
          const r = reach[i];
          const x = dyn[i * 3], y = dyn[i * 3 + 1];
          if (x < -r || y < -r || x > W + r || y > H + r) continue;
          ctx.globalAlpha = g;
          ctx.drawImage(glows[colour[i]], x - r, y - r, r * 2, r * 2);
        }
        for (let i = 0; i < n; i++) {
          const a = dyn[i * 3 + 2];
          if (a <= 0.01) continue;
          const r = radius[i];
          const x = dyn[i * 3], y = dyn[i * 3 + 1];
          if (x < -2 || y < -2 || x > W + 2 || y > H + 2) continue;
          ctx.globalAlpha = a;
          ctx.drawImage(dots[colour[i]], x - r, y - r, r * 2, r * 2);
        }
        ctx.globalAlpha = 1;
      },
    };
  }

  /**
   * Picks the renderer, once: the GPU when it can, else 2D. Called when the swarm first has something to show
   * or, earlier, in an idle moment once the canvas is within a screen of view (below), so a visit that never
   * scrolls this far makes no context, compiles no shader and allocates no backing store.
   */
  function ensure() {
    if (painter) return;
    gpu = createGlStars(canvas, { n, stat, dots, glows, onLost: gpuLost, onRestored: gpuBack });
    if (gpu) {
      painter = gpuPainter(gpu);
      canvas.dataset.renderer = 'webgl';
    } else use2d();
    blank = true;
    washDirty = true;
    if (iw) drawWash();
  }

  /**
   * Switches to the 2D renderer, on this canvas if it never took a WebGL context, else on a second canvas laid
   * over it (a canvas that has held a WebGL context can never give a 2D one).
   */
  function use2d() {
    let target = canvas;
    let ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) {
      target = overlay();
      ctx = target.getContext('2d', { alpha: true });
      // a context that was made and then failed to set up (gpuLost marks a lost one before it gets here)
      if (!canvas.dataset.renderer) canvas.dataset.renderer = 'webgl-failed';
      // Hidden while the overlay draws: WebKit keeps showing a lost context's last frame until that context
      // draws again, which a lost one never does, so with Reduce Motion (one frame, no loop) every star showed
      // twice, the old frame under the new one (about 1.8x the star light, measured 2026-11-08).
      canvas.style.visibility = 'hidden';
    }
    // nothing can draw (never seen): a painter that does nothing, so ensure() is not retried every frame
    painter = ctx ? canvasPainter(ctx) : { wash() {}, frame() {} };
    target.dataset.renderer = ctx ? '2d' : 'none';
    blank = true;
    washDirty = true;
  }

  /**
   * The fallback canvas: same class, so it takes the same box and the same headline mask, with the mask's
   * custom properties mirrored from this canvas, where ep-section.ts keeps writing them.
   */
  function overlay(): HTMLCanvasElement {
    if (alt) return alt;
    const c = document.createElement('canvas');
    c.className = canvas.className;
    c.width = canvas.width;
    c.height = canvas.height;
    const copy = () => {
      for (const v of MASK_VARS) c.style.setProperty(v, canvas.style.getPropertyValue(v));
    };
    copy();
    mirror = new MutationObserver(copy);
    mirror.observe(canvas, { attributes: true, attributeFilter: ['style'] });
    canvas.after(c);
    alt = c;
    return c;
  }

  /**
   * The context is gone (GPU reset, the tab put away on a phone): the swarm carries on in 2D until it is back.
   * The frame is drawn at once, running or not, so the switch never shows a frame with no stars in it (a draw
   * at dt 0 repeats the last frame: no time passes and the pointer's push is left as it was).
   */
  function gpuLost() {
    canvas.dataset.renderer = 'webgl-lost';
    use2d();
    if (iw) drawWash();
    draw(0);
  }

  /** The context is back with its resources rebuilt: hand the wash over again and drop the fallback canvas. */
  function gpuBack() {
    if (!gpu) return;
    painter = gpuPainter(gpu);
    canvas.dataset.renderer = 'webgl';
    mirror?.disconnect();
    mirror = null;
    // shown again only here, with the context back and its first frame drawn below in the same task: Chromium
    // paints a lost canvas that was hidden as solid white if it is shown again while still lost
    canvas.style.removeProperty('visibility');
    if (alt) {
      alt.remove();
      alt.width = alt.height = 0;
      alt = null;
    }
    blank = true;
    if (iw) drawWash();
    draw(0);
  }

  // Warm the renderer up before the swarm is needed: when the canvas comes within a screen of the viewport, in
  // an idle moment, so making the context, compiling the shaders and uploading the wash never lands in a frame
  // that draws. Safari has no requestIdleCallback: a short timeout stands in.
  if (typeof IntersectionObserver !== 'undefined') {
    const near = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      near.disconnect();
      const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
      if (idle) idle(() => ensure(), { timeout: 400 });
      else window.setTimeout(ensure, 60);
    }, { rootMargin: '100% 0px' });
    near.observe(canvas);
  }

  // Where each star is on its lap, how far it drifts, the gather, the pointer's push: x, y and alpha into `dyn`.
  function step(dt: number) {
    // the pointer's field: a soft push away from it with a little swirl, quick to part, slow to heal
    ptrK += ((ptrOn ? 1 : 0) - ptrK) * (1 - Math.exp(-dt * 6));
    const R = Math.max(110, iw * 0.11);
    const push = R * 0.28;
    const kPart = 1 - Math.exp(-dt * 14);
    const kHeal = 1 - Math.exp(-dt * 2.6);
    let rip = -1;
    if (ripT >= 0) {
      ripT += dt;
      rip = ripT / 1.1;
      if (rip >= 1) {
        ripT = -1;
        rip = -1;
      }
    }
    const ripR = rip >= 0 ? easeOut(rip) * iw * 0.55 : 0;
    const ripW = 70;
    // the swarm closes in on the curve over the last quarter of the gather (HUG), the scroll's doing, not a clock's
    const hugT = clamp((gather - 0.75) / 0.25, 0, 1);
    const spreadK = 2 * (1 - HUG * hugT * hugT * (3 - 2 * hugT));
    // each star's start: its draw (0 to the app's stagger) rescaled to a field's shorter one, so the draws stay as made
    const stagger = field ? FIELD_STAGGER : A.gatherStagger;
    const delayK = stagger / A.gatherStagger;
    for (let i = 0; i < n; i++) {
      const j = i * 3;
      const arrive = clamp((gather - delay[i] * delayK) / (1 - stagger), 0, 1);
      if (arrive <= 0 && !field) {
        dyn[j + 2] = 0;
        continue;
      }
      // where it waits: scattered round the ∞, or spread evenly over the field (its draws, -1.2 to 1.2 across and
      // -2.4 to 2.4 down, are uniform, so they map straight onto the rect)
      let sx = field ? field.x + (fromX[i] / A.scatter + 0.5) * field.w : cx + fromX[i] * iw;
      let sy = field ? field.y + (fromY[i] / (A.scatter * 2) + 0.5) * field.h : cy + fromY[i] * iw * A.boxHeight;
      if (field) {
        const wa = TAU * (time / (swayS[i] * 1.6) + swayP[i]);
        const wr = WANDER * Math.max(field.w, field.h);
        sx += Math.cos(wa) * wr;
        sy += Math.sin(wa) * wr;
      }
      // a formed star skips the pow (1 to any power is 1, so nothing changes), a waiting one the curve
      const e = arrive >= 1 ? 1 : arrive <= 0 ? 0 : field ? 1 - Math.pow(1 - arrive, FIELD_EASE) : Math.pow(arrive, A.gatherPull);
      let x = sx;
      let y = sy;
      if (e > 0) {
        const t = TAU * ((start[i] + time / lap[i]) % 1);
        const s = Math.sin(t), c = Math.cos(t), d = 1 + s * s;
        const ux = c / d, uy = ((s * c) / d) * A.loopFill;
        // the curve's normal, from its tangent (STEP ahead; sqrt rather than Math.hypot, whose guard against
        // overflow these values never need)
        const s2 = s * COS_STEP + c * SIN_STEP, c2 = c * COS_STEP - s * SIN_STEP, d2 = 1 + s2 * s2;
        const tx = c2 / d2 - ux, ty = ((s2 * c2) / d2) * A.loopFill - uy;
        const tl = Math.sqrt(tx * tx + ty * ty) || 1;
        const drift = off[i] + sway[i] * Math.sin(TAU * (time / swayS[i] + swayP[i]));
        const gx = cx + (ux + (-ty / tl) * drift * spreadK) * half;
        const gy = cy + (uy + (tx / tl) * drift * spreadK) * half;
        x = sx + (gx - sx) * e;
        y = sy + (gy - sy) * e;
      }
      // the push, only once the star has joined the flow
      if (dt > 0) {
        let fx = 0, fy = 0;
        if (ptrK > 0.002) {
          const dx = x - ptrX, dy = y - ptrY;
          const dd = Math.hypot(dx, dy);
          if (dd < R && dd > 0.01) {
            const k = (1 - dd / R) ** 2 * push * ptrK * e;
            fx = (dx / dd) * k - (dy / dd) * k * 0.35;
            fy = (dy / dd) * k + (dx / dd) * k * 0.35;
          }
        }
        if (rip >= 0) {
          const dx = x - ripX, dy = y - ripY;
          const dd = Math.hypot(dx, dy) || 1;
          const band = 1 - Math.abs(dd - ripR) / ripW;
          if (band > 0) {
            const k = band * band * 26 * (1 - rip) * e;
            fx += (dx / dd) * k;
            fy += (dy / dd) * k;
          }
        }
        const grow = fx * fx + fy * fy > dispX[i] * dispX[i] + dispY[i] * dispY[i];
        const kk = grow ? kPart : kHeal;
        dispX[i] += (fx - dispX[i]) * kk;
        dispY[i] += (fy - dispY[i]) * kk;
      }
      x += dispX[i];
      y += dispY[i];
      dyn[j] = x;
      dyn[j + 1] = y;
      const shimmer = 1 - A.twinkle * 0.5 * (1 + Math.sin(TAU * (time / twS[i] + twP[i])));
      // a field's stars are already out (the canvas fades in), the scattered swarm's come out as they arrive
      const out = field ? 1 : easeOut(clamp(arrive / A.gatherFade, 0, 1));
      dyn[j + 2] = clamp(base[i] * A.brightness * shimmer * out, 0, 1);
    }
  }

  // One frame: the simulation, then whichever renderer is live. Before the first layout there is nothing to
  // place the swarm by, and before the gather starts there is nothing to show (and no renderer is made for it).
  function draw(dt: number) {
    if (!W) return;
    step(dt);
    // a star field has something to show at any gather
    const empty = gather <= 0 && !field;
    if (!painter) {
      if (empty) return;
      ensure();
      if (!painter) return;
    }
    // an empty frame over an empty canvas: skipped (the section sits on screen like this before the gather)
    if (empty && blank) return;
    painter.frame(bloomV ?? easeOut(clamp((gather - 0.35) / 0.65, 0, 1)));
    blank = empty;
  }

  function frame(now: number) {
    raf = 0;
    if (!running) return;
    const dt = lastT ? Math.min(0.05, (now - lastT) / 1000) : 1 / 60;
    lastT = now;
    time += dt * A.speed;
    draw(dt);
    raf = requestAnimationFrame(frame);
  }

  return {
    setGather(g) {
      gather = clamp(g, 0, 1);
      if (!running) draw(0);
    },
    bloom(b) {
      bloomV = b === null ? null : clamp(b, 0, 1);
      if (!running) draw(0);
    },
    pointer(x, y, on) {
      ptrX = x;
      ptrY = y;
      ptrOn = on;
    },
    ripple(x, y) {
      if (opts.still) return;
      ripX = x;
      ripY = y;
      ripT = 0;
    },
    layout,
    run(on) {
      // The flow is the screen, not decoration (Yanis, 2026-11-05): it keeps going while it can be
      // seen, at the display's own rate, and stops dead off screen or with the tab away.
      if (opts.still) on = false;
      if (on === running) return;
      running = on;
      lastT = 0;
      if (on && !raf) raf = requestAnimationFrame(frame);
      if (!on && raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    },
  };
}
