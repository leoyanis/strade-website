// The Strade emblem as stardust: the same star and ring as the SSI emblem (vision/ssi/Emblem.astro),
// drawn as a few thousand stars on one 2D canvas.
//
// How it works
// - The star positions are precomputed (scripts/stardust-points.py → stardust-points.ts): the star's
//   outline with the slash cut out, the ring's outline, and a thin scatter inside. Nothing is rasterised
//   in the browser, so the first frame is cheap.
// - Intro: every star flies in from a wide cloud and settles on its spot (the star first, the ring
//   sweeping round after it, the dust last), then the four tips, the ring's ends and the core flare up.
// - Idle: each star twinkles, a slow shimmer runs round the ring, and the pointer pushes stars aside
//   like dust. They spring back.
// - Cost: one canvas, DPR ≤ 2 (1.5 on phones), fewer stars on phones and small CPUs, 30 fps once the
//   intro is done and nobody is touching it, half the stars if frames run long, nothing drawn off screen
//   or in a hidden tab. Reduced motion gets the finished emblem as one still frame.
// - Flight (opt-in, the homepage finale: opts.flight, driven by finale-flight.ts): instead of the intro, the
//   emblem is made from the remains of a shooting star. The page hands in a frame per scroll update (fly()), a
//   clock (px of scroll) and the plan it runs on: the star flies through on a path the page gives, and as it goes
//   it drops the emblem's stars, each kicked out to its side as a hot spark that cools and drifts; once the star
//   has gone the spray hangs in the sky, then every spark is drawn down into the emblem on its own stretch of the
//   suck-in, eased in and out, its path bowing round the emblem's centre (all the same way, a gentle whirl): the
//   outline first, from the top tip down both sides, the ring sweeping round, the fill, the dust last; the flares
//   light as it closes. The star itself never becomes the emblem. Pure functions of that frame, so the scroll
//   scrubs it both ways. It draws on a second canvas, fixed to the screen like the night it is in (the page places
//   it), so the star and the spray hold still against the sky whatever the scroll speed; once every star is home
//   and the emblem's canvas holds still on the screen the page calls fly(null) and the emblem's own canvas takes
//   over, drawn by the same code from the same stars. fly() draws in the same task, so the stars always match the
//   circle wipe the page draws from the same scroll.

import { STAR_EDGE, RING_EDGE, FILL } from './stardust-points';

/** The emblem's box in path units (Emblem.astro's viewBox). */
const BY = -246;
const BW = 380;
const BH = 484;
/** How much of the canvas the emblem fills; the rest is room for dust and flares. */
const FIT_W = 1 / 1.6;
const FIT_H = 1 / 1.3;
/** The ring is an ellipse tilted by this much (lower left to upper right). */
const TILT = Math.atan2(-139, 307);
const TAU = Math.PI * 2;
/** Seconds until every star has landed and the flares are lit. */
export const STARDUST_INTRO = 2.9;
/** Where the clock of an instance without its intro starts: the last dust lands at 4.3 s (delay up to 1.9 s,
 * flight up to 2.4 s), the shimmer is fully on from 3.4 s, so from here every frame is the finished emblem. */
const FORMED = 4.6;
/** The top tip's flare in path units (flares[0] below; the finale's shooting star is drawn as a larger copy of it). */
export const STARDUST_TIP_Y = -241.88;
/** The bottom tip's flare in path units (the star's full height is from the top tip to here). */
export const STARDUST_BOTTOM_Y = 233.5;
/** In the flight's suck-in, how far (radians) each star's path bows round the emblem's centre at its middle, every
 * star the same way: the spray seems drawn down into the middle, not slid along straight lines. */
const SWIRL = 0.55;

type Star = {
  hx: number; hy: number; // home, path units
  sx: number; sy: number; // where the intro starts it
  ox: number; oy: number; // push from the pointer, path units
  vx: number; vy: number;
  r: number; // radius in CSS px at full size
  a: number; // brightness 0..1
  ph: number; sp: number; amp: number; // twinkle phase, speed, depth
  ring: number; // angle round the ring, or NaN for a star off the ring
  d0: number; dur: number; // intro delay and flight time, seconds
  kd: number; // 0 edge, 1 ring, 2 fill, 3 dust
  hc: number; // its colour at home (the index into COLORS)
  // flight only (opts.flight): where on the shooting star's flight it is dropped (sh: 0..1 of the shedding; t0, px,
  // py: the clock and the place on the flight canvas, worked out whenever the page plans), its kick out of the star
  // (em: how far, a share of the spray's reach; ea along the star's path, negative = back; el across it), its slow
  // drift afterwards (dvx, dvy: a direction and a speed), its stretch of the suck-in (c0, c1: shares of it) and its
  // colour in the spray once it has cooled (tc)
  sh: number; t0: number; px: number; py: number;
  em: number; ea: number; el: number; dvx: number; dvy: number;
  c0: number; c1: number; tc: number;
};
type Flare = { x: number; y: number; len: number; core: number; d0: number; a: number };

/**
 * One frame of the flight, in the flight canvas's CSS pixels (its top-left is 0, 0) and on the page's clock (px of
 * scroll). The page works these out from the scroll; the stars only draw them.
 */
export type StardustFlight = {
  /** the clock now: everything below that moves is a function of it */
  t: number;
  /** changes whenever the page plans again (a resize): the stars then work out afresh where the star dropped each */
  plan: number;
  /** the shooting star's place on this canvas at clock t, and its brightness there (0..1; 0 before it shows and once
   * it has gone), written into out */
  head: (t: number, out: { x: number; y: number; a: number }) => void;
  /** its direction of travel (a unit vector: it flies straight) and the streak behind it now, in px */
  dirX: number;
  dirY: number;
  streak: number;
  /** the spray: the stretch of clock over which the star drops it, how long a spark's kick takes to spend itself and
   * how long it stays hot (clock px: two thirds spent, two thirds cooled), how far the farthest spark is kicked (px)
   * and how far a spark drifts afterwards per px of clock (px) */
  shed0: number;
  shed1: number;
  burst: number;
  cool: number;
  reach: number;
  drift: number;
  /** the suck-in: from suck0 to suck1 every spark flies home on its own stretch; at suck1 the emblem is exactly what
   * its own canvas draws */
  suck0: number;
  suck1: number;
  /** where the emblem's own canvas has its top-left on this canvas now (it moves while the finale slows into place):
   * the stars' homes are drawn exactly where that canvas draws them */
  ox: number;
  oy: number;
  /** the circle the night is clipped to (the finale's wipe), on this canvas: everything the flight draws stays
   * inside it, so nothing of it shows over the scene the night is opening on */
  clipX: number;
  clipY: number;
  clipR: number;
  /** false: something else cuts the canvas to the circle (the finale's flight disc), so no clip is drawn here */
  clip?: boolean;
};

const COLORS = ['255,255,255', '140,232,255', '255,226,180'];

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const outQuart = (p: number) => 1 - Math.pow(1 - p, 4);
const inOutCubic = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);

function decode(b64: string) {
  const bin = atob(b64);
  const out = new Int16Array(bin.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = ((bin.charCodeAt(i * 2) | (bin.charCodeAt(i * 2 + 1) << 8)) << 16) >> 16;
  return out;
}

function sprite(rgb: string) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, `rgba(${rgb},1)`);
  grad.addColorStop(0.12, `rgba(${rgb},0.95)`);
  grad.addColorStop(0.32, `rgba(${rgb},0.32)`);
  grad.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return c;
}

export type Stardust = {
  destroy: () => void;
  /** Flight mode only (opts.flight). A frame: drawn on the flight canvas at once, the emblem's canvas hidden.
   * 'hidden': nothing shows, nothing runs (before the star). null: the formed emblem on its own canvas. */
  fly: (f: StardustFlight | 'hidden' | null) => void;
  /** The emblem's own canvas: its size and where the emblem sits in it (CSS px, from the last resize). */
  layout: () => { w: number; h: number; cx: number; cy: number; k: number };
};

/**
 * opts.density (0..1, default 1) thins the stars further: the finale's faint copy of the emblem (shown at 0.3
 * opacity behind its headline) draws about half of them, which reads the same there and halves its cost per frame.
 * opts.intro false starts it formed (the finale: its flight replaces the intro). opts.flight is the finale's flight
 * canvas (see the header).
 */
export function createStardust(
  canvas: HTMLCanvasElement,
  opts: { reduced: boolean; seed?: number; density?: number; intro?: boolean; flight?: HTMLCanvasElement | null; restFps?: number },
): Stardust | null {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const seed = opts.seed ?? 20261106;
  const rand = rng(seed);
  const phone = Math.min(innerWidth, innerHeight) < 600;
  const weak = phone || (navigator.hardwareConcurrency || 8) <= 4;
  const share = (weak ? 0.55 : 1) * Math.min(1, Math.max(0.1, opts.density ?? 1));

  const ringAngle = (x: number, y: number) => {
    const c = Math.cos(-TILT);
    const s = Math.sin(-TILT);
    return Math.atan2((x * s + y * c) / 0.32, x * c - y * s);
  };

  /* ------------------------------------------------------------ the stars */
  const stars: Star[] = [];
  // the instance's stars take `rand` in the same order as always, so a seed always draws the same stars
  const make = (hx: number, hy: number, kind: 'edge' | 'ring' | 'fill' | 'dust', R: () => number = rand): Star => {
    // brightness and size follow a steep power law: a few bright stars, many faint ones
    const p = Math.pow(R(), kind === 'dust' ? 3.2 : 2.2);
    const big = kind !== 'dust' && R() < 0.035;
    const r = big ? 1.7 + R() * 1.4 : 0.45 + p * (kind === 'dust' ? 0.7 : 1.15);
    const a = kind === 'dust' ? 0.12 + p * 0.35 : kind === 'fill' ? 0.18 + p * 0.45 : 0.42 + p * 0.58;
    const far = 380 + R() * 720;
    const th = R() * TAU;
    const dist = Math.hypot(hx, hy);
    const ring = kind === 'ring' ? ringAngle(hx, hy) : NaN;
    const d0 =
      kind === 'edge' ? 0.05 + R() * 0.45 + (dist / 250) * 0.3
      : kind === 'ring' ? 0.5 + (((ring + Math.PI) / TAU + 0.25) % 1) * 0.7 + R() * 0.12
      : kind === 'fill' ? 0.75 + R() * 0.7
      : 1.0 + R() * 0.9;
    return {
      hx, hy,
      sx: Math.cos(th) * far, sy: Math.sin(th) * far * 0.8,
      ox: 0, oy: 0, vx: 0, vy: 0,
      r: weak ? r * 1.15 : r, a: big ? Math.max(a, 0.85) : Math.min(1, weak ? a * 1.15 : a),
      ph: R() * TAU, sp: 0.6 + R() * 2.2, amp: 0.12 + R() * 0.38,
      ring, d0, dur: kind === 'dust' ? 1.8 + R() * 0.6 : 1.05 + R() * 0.8,
      kd: kind === 'edge' ? 0 : kind === 'ring' ? 1 : kind === 'fill' ? 2 : 3,
      hc: 0,
      sh: 0, t0: 0, px: 0, py: 0, em: 0, ea: 0, el: 0, dvx: 0, dvy: 0, c0: 0, c1: 1, tc: 0,
    };
  };
  const PTS = { edge: decode(STAR_EDGE), ring: decode(RING_EDGE), fill: decode(FILL) };
  const add = (kind: 'edge' | 'ring' | 'fill') => {
    const pts = PTS[kind];
    const n = Math.round((pts.length / 2) * share);
    for (let i = 0; i < n; i++) stars.push(make(pts[i * 2] / 4, pts[i * 2 + 1] / 4, kind));
  };
  add('edge');
  add('ring');
  add('fill');
  const dustAt = (R: () => number) => {
    const g = Math.abs(Math.sqrt(-2 * Math.log(R() || 1e-6)) * Math.cos(TAU * R()));
    const rr = 60 + g * 150;
    const th = R() * TAU;
    return make(Math.cos(th) * rr * 0.9, Math.sin(th) * rr * 1.1, 'dust', R);
  };
  const N_DUST = Math.round(240 * share);
  for (let i = 0; i < N_DUST; i++) stars.push(dustAt(rand));
  // colour: mostly white, a little cyan and a little warm, like a real sky
  const byColor: Star[][] = [[], [], []];
  for (const s of stars) {
    const c = rand();
    s.hc = c < 0.035 ? 1 : c < 0.06 ? 2 : 0;
    byColor[s.hc].push(s);
  }

  const flares: Flare[] = [
    { x: 0, y: STARDUST_TIP_Y, len: 40, core: 9, d0: 1.75, a: 0.95 },
    { x: 0, y: STARDUST_BOTTOM_Y, len: 40, core: 9, d0: 1.85, a: 0.95 },
    { x: -185.5, y: 2, len: 34, core: 8, d0: 1.8, a: 0.9 },
    { x: 184.75, y: -1.25, len: 34, core: 8, d0: 1.9, a: 0.9 },
    { x: 154, y: -78, len: 16, core: 7, d0: 2.2, a: 0.75 },
    { x: -148, y: 70, len: 16, core: 7, d0: 2.25, a: 0.75 },
    { x: 0, y: 0, len: 118, core: 30, d0: 2.05, a: 1 },
  ];
  const SPR = COLORS.map(sprite);

  /* ------------------------------------------------------------ the flight (opts.flight) */
  const fcanvas = !opts.reduced && opts.flight ? opts.flight : null;
  const fctx = fcanvas ? fcanvas.getContext('2d') : null;
  // how far round from the top tip a point is: 0 at the top tip, 0.5 at the side tips, 1 at the bottom tip
  const fromTop = (x: number, y: number) => Math.abs(Math.atan2(x, -y)) / Math.PI;
  // the ring's sweep (the intro's order): 0..1 round from its start
  const sweep = (ring: number) => ((ring + Math.PI) / TAU + 0.25) % 1;
  // the order the flares light in as the emblem closes at the end of the suck-in (0 first, 1 last): the tips from the
  // top down, the ring's ends as it sweeps round, the core last
  const FLARE_AT = flares.map((fl, i) => (i === 6 ? 1 : i >= 4 ? 0.6 + 0.3 * sweep(ringAngle(fl.x, fl.y)) : 0.5 * fromTop(fl.x, fl.y)));
  if (fcanvas && fctx) {
    // The spray, drawn once per star from its own generator (the home stars keep `rand`'s order, so the emblem is the
    // same stars at the same places as ever). Where the shooting star drops it: over half in a bell round the middle
    // of the shedding (where it crosses the screen's middle), the rest anywhere along its flight. Its kick: mostly
    // across the path, to either side, a little back or a little on; most short, a few long, so the spray is dense
    // along the path and frays out. Its drift afterwards: a slow random way. Its stretch of the suck-in: the order
    // the intro forms in (the outline from the top tip down both sides, the ring sweeping round, the fill, the dust
    // last), long and overlapping (62% of the suck-in each), so the whole spray moves as one, the outline closing
    // first. Its colour once cooled: about a third of the sparks are cyan in the sky, white or warm at home.
    const rf = rng(seed ^ 0x27d4eb2f);
    const gauss = () => Math.max(-2.5, Math.min(2.5, Math.sqrt(-2 * Math.log(rf() || 1e-6)) * Math.cos(TAU * rf())));
    for (const s of stars) {
      s.sh = rf() < 0.55 ? clamp(0.5 + 0.2 * gauss()) : rf();
      s.el = (rf() < 0.5 ? -1 : 1) * (0.3 + 0.7 * rf());
      s.ea = -0.6 + 0.8 * rf();
      s.em = 0.04 + 0.96 * Math.pow(rf(), 2.2);
      // the drift: mostly on out to the side it was kicked to (the train widens), partly any way; as a share of the
      // path's frame (along, across), turned into the screen's when the page plans
      const dth = rf() * TAU;
      const dm = 0.25 + 0.75 * rf();
      s.dvx = 0.35 * Math.cos(dth) * dm;
      s.dvy = 0.35 * Math.sin(dth) * dm + 0.65 * Math.sign(s.el) * dm;
      const order =
        s.kd === 0 ? 0.3 * fromTop(s.hx, s.hy)
        : s.kd === 1 ? 0.2 + 0.35 * sweep(s.ring)
        : s.kd === 2 ? 0.25 + 0.45 * rf()
        : 0.45 + 0.55 * rf();
      s.c0 = order * 0.36 + rf() * 0.02;
      s.c1 = Math.min(1, s.c0 + 0.62);
      s.tc = rf() < 0.3 ? 1 : s.hc;
    }
  }

  /* ------------------------------------------------------------ layout */
  let dpr = 1;
  let cw = 1;
  let ch = 1;
  let k = 1; // CSS px per path unit
  let cx = 0;
  let cy = 0;
  let sz = 1;
  const size = () => {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(phone ? 1.5 : 2, window.devicePixelRatio || 1);
    cw = Math.max(1, r.width);
    ch = Math.max(1, r.height);
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
    k = Math.min((cw * FIT_W) / BW, (ch * FIT_H) / BH);
    cx = cw / 2;
    cy = ch / 2 - (BY + BH / 2) * k;
    sz = clamp(k / 0.72, 0.55, 1.45);
  };
  // the flight canvas: its box from its own ResizeObserver (no layout read), its pixels only while it flies
  let fw = 1;
  let fh = 1;
  let fdpr = 1;
  let fAlloc = false;
  const allocFlight = () => {
    if (!fcanvas) return;
    fdpr = Math.min(phone ? 1.5 : 2, window.devicePixelRatio || 1);
    fcanvas.width = Math.round(fw * fdpr);
    fcanvas.height = Math.round(fh * fdpr);
    fAlloc = true;
  };
  const freeFlight = () => {
    if (!fcanvas || !fAlloc) return;
    fcanvas.width = 0;
    fcanvas.height = 0;
    fAlloc = false;
  };

  /* ------------------------------------------------------------ pointer: stars move like dust */
  const ptr = { x: -1e5, y: -1e5, on: false, last: -1e9 };
  let clock = opts.reduced ? 99 : opts.intro === false ? FORMED : 0;
  // what shows: the emblem on its own canvas, the flight on the flight canvas, or nothing (flight mode only)
  let mode: 'home' | 'flight' | 'hidden' = 'home';
  const onMove = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse' && e.buttons === 0 && e.type !== 'pointerdown') return;
    // off screen nothing is drawn, so skip the rect read: the page runs two emblems (hero and finale) and each read
    // every pointer move anywhere on the page, a layout whenever styles had changed since the last frame. The same
    // while the finale's emblem is flying or hidden: its stars are not at home to be pushed
    if (!onScreen || mode !== 'home') return;
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    // only wake the physics when the pointer is near the emblem
    if (x < -40 || y < -40 || x > r.width + 40 || y > r.height + 40) {
      ptr.on = false;
      return;
    }
    ptr.x = (x - cx) / k;
    ptr.y = (y - cy) / k;
    ptr.on = true;
    ptr.last = clock;
  };
  const onOut = () => {
    ptr.on = false;
  };

  /* ------------------------------------------------------------ draw */
  let stride = 1; // 2 = draw every other star (frames running long)
  // a flare: a soft core and two thin rays (the gradients are built per draw, as the emblem always did: the finale's
  // star lands on this exact look, so its flight draws the same way)
  const flare = (g: CanvasRenderingContext2D, X: number, Y: number, L: number, C: number, a: number) => {
    g.globalAlpha = a > 1 ? 1 : a;
    g.drawImage(SPR[0], X - C, Y - C, C * 2, C * 2);
    const th = Math.max(0.8, 1.1 * sz);
    for (const horiz of [true, false]) {
      const gr = horiz ? g.createLinearGradient(X - L, Y, X + L, Y) : g.createLinearGradient(X, Y - L, X, Y + L);
      gr.addColorStop(0, 'rgba(255,255,255,0)');
      gr.addColorStop(0.5, 'rgba(255,255,255,1)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      if (horiz) g.fillRect(X - L, Y - th / 2, L * 2, th);
      else g.fillRect(X - th / 2, Y - L, th, L * 2);
    }
  };
  const draw = (t: number, dt: number) => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, cw, ch);
    ctx.globalCompositeOperation = 'lighter';
    const live = !opts.reduced;
    const head = t * 0.62; // the shimmer's position round the ring
    const breathe = 1 + (live ? Math.sin(t * 0.55) * 0.006 : 0);
    const kk = k * breathe;
    const reach = 64 / k; // pointer radius in path units
    const f = Math.min(dt, 0.07) * 60; // physics steps in 60 fps frames
    const shimmerOn = t > 2.4;
    const shimmerK = smooth(2.4, 3.4, t);
    const alphaBoost = stride === 2 ? 1.35 : 1;
    let spr = SPR[0];
    // one star at home (or flying in, during the intro)
    const one = (s: Star) => {
      const p = clamp((t - s.d0) / s.dur);
      if (p <= 0) return;
      let x: number;
      let y: number;
      if (p < 1) {
        const e = outQuart(p);
        x = s.sx + (s.hx - s.sx) * e;
        y = s.sy + (s.hy - s.sy) * e;
      } else {
        x = s.hx;
        y = s.hy;
        if (live && (ptr.on || s.ox !== 0 || s.oy !== 0)) {
          if (ptr.on) {
            const dx = s.hx + s.ox - ptr.x;
            const dy = s.hy + s.oy - ptr.y;
            const d2 = dx * dx + dy * dy;
            if (d2 < reach * reach && d2 > 0.01) {
              const d = Math.sqrt(d2);
              const push = (1 - d / reach) ** 2 * 1.9 * f;
              s.vx += (dx / d) * push;
              s.vy += (dy / d) * push;
            }
          }
          s.vx += -s.ox * 0.05 * f;
          s.vy += -s.oy * 0.05 * f;
          const damp = Math.pow(0.86, f);
          s.vx *= damp;
          s.vy *= damp;
          s.ox += s.vx * f;
          s.oy += s.vy * f;
          if (Math.abs(s.ox) < 0.01 && Math.abs(s.oy) < 0.01 && Math.abs(s.vx) < 0.01 && Math.abs(s.vy) < 0.01) s.ox = s.oy = s.vx = s.vy = 0;
          x += s.ox;
          y += s.oy;
        }
      }
      let a = s.a * (p < 0.55 ? smooth(0, 0.55, p) : 1);
      if (live) a *= 1 - s.amp * 0.5 * (1 + Math.sin(t * s.sp + s.ph));
      if (shimmerOn && s.ring === s.ring) {
        let da = s.ring - head;
        da -= Math.round(da / TAU) * TAU;
        if (da > -0.9 && da < 0.9) a += Math.exp(-(da * da) / 0.07) * 0.75 * shimmerK;
      }
      a *= alphaBoost;
      if (a < 0.015) return;
      const X = cx + x * kk;
      const Y = cy + y * kk;
      const R = s.r * sz;
      ctx.globalAlpha = a > 1 ? 1 : a;
      if (R < 1.2) ctx.fillRect(X - R, Y - R, R * 2, R * 2);
      else ctx.drawImage(spr, X - R * 3.2, Y - R * 3.2, R * 6.4, R * 6.4);
    };
    for (let c = 0; c < 3; c++) {
      spr = SPR[c];
      ctx.fillStyle = `rgb(${COLORS[c]})`;
      const list = byColor[c];
      for (let i = 0; i < list.length; i += stride) one(list[i]);
    }
    // flares: a soft core and two thin rays
    for (const fl of flares) {
      const p = clamp((t - fl.d0) / 0.7);
      if (p <= 0) continue;
      const pulse = live ? 0.88 + 0.12 * Math.sin(t * 1.3 + fl.x * 0.05) : 1;
      flare(ctx, cx + fl.x * kk, cy + fl.y * kk, fl.len * kk * (0.6 + 0.4 * outQuart(p)), fl.core * kk, fl.a * outQuart(p) * pulse);
    }
    ctx.globalAlpha = 1;
  };

  /* ------------------------------------------------------------ draw the flight (opts.flight) */
  let F: StardustFlight | null = null;
  let planWas = NaN;
  const hp = { x: 0, y: 0, a: 0 };
  // one frame's stars, worked out in one pass and drawn by colour from here (a star changes colour as it cools and
  // lands, so the colour passes cannot each walk the stars)
  const nS = stars.length;
  const QX = new Float32Array(nS);
  const QY = new Float32Array(nS);
  const QA = new Float32Array(nS);
  const QR = new Float32Array(nS);
  const QC = new Uint8Array(nS);
  const drawFlight = (clock: number) => {
    if (!fctx || !F) return;
    const g = fctx;
    g.setTransform(fdpr, 0, 0, fdpr, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, fw, fh);
    if (F.clipR <= 0) return;
    g.globalCompositeOperation = 'lighter';
    const t = F.t;
    // where the star dropped each spark: its path only changes when the page plans again
    if (F.plan !== planWas) {
      planWas = F.plan;
      for (const s of stars) {
        s.t0 = F.shed0 + s.sh * (F.shed1 - F.shed0);
        F.head(s.t0, hp);
        s.px = hp.x;
        s.py = hp.y;
      }
    }
    const head = clock * 0.62;
    const breathe = 1 + Math.sin(clock * 0.55) * 0.006;
    const kk = k * breathe;
    const shimmerK = smooth(2.4, 3.4, clock);
    const alphaBoost = stride === 2 ? 1.35 : 1;
    const ex = F.ox + cx; // the emblem's centre on this canvas
    const ey = F.oy + cy;
    const nX = -F.dirY; // across the star's path
    const nY = F.dirX;
    const Ls = Math.max(1, F.suck1 - F.suck0);
    let n = 0;
    for (let i = 0; i < nS; i += stride) {
      const s = stars[i];
      if (t < s.t0) continue; // not dropped yet
      const age = t - s.t0;
      // in the spray: kicked out of the star (the kick spends itself), then a slow drift; hot white and a little
      // larger as it leaves the star, cooling to its own colour and size
      const bu = 1 - Math.exp(-age / F.burst);
      const kx = s.em * (s.ea * F.dirX + s.el * nX) * F.reach;
      const ky = s.em * (s.ea * F.dirY + s.el * nY) * F.reach;
      const dr = F.drift * age;
      const Sx = s.px + kx * bu + (s.dvx * F.dirX + s.dvy * nX) * dr;
      const Sy = s.py + ky * bu + (s.dvx * F.dirY + s.dvy * nY) * dr;
      const hot = Math.exp(-age / F.cool);
      const tw = 1 - s.amp * 0.5 * (1 + Math.sin(clock * s.sp + s.ph));
      // in the spray it glitters harder than at home (its twinkle deeper), so the train reads over the sky's own stars
      const tws = 1 - Math.min(0.75, s.amp * 1.6) * 0.5 * (1 + Math.sin(clock * s.sp + s.ph));
      let X = Sx;
      let Y = Sy;
      let a = Math.min(1, 0.5 + 0.5 * s.a + 0.5 * hot) * tws;
      let rk = 0.95 + 0.45 * hot;
      let col = hot > 0.4 ? 0 : s.tc;
      const w = (t - F.suck0 - s.c0 * Ls) / ((s.c1 - s.c0) * Ls);
      if (w > 0) {
        // at home: exactly as the emblem's own canvas draws it (its twinkle and the ring's shimmer)
        let ha = s.a * tw;
        if (s.ring === s.ring) {
          let da = s.ring - head;
          da -= Math.round(da / TAU) * TAU;
          if (da > -0.9 && da < 0.9) ha += Math.exp(-(da * da) / 0.07) * 0.75 * shimmerK;
        }
        const Hx = ex + s.hx * kk;
        const Hy = ey + s.hy * kk;
        if (w >= 1) {
          X = Hx;
          Y = Hy;
          a = ha;
          rk = 1;
          col = s.hc;
        } else {
          // on its way: from where it hangs to its home, eased in and out, the path bowing round the emblem's centre
          // (the offset from the centre turns by up to SWIRL and back), dimming a little in mid-flight so the spray
          // never clouds the emblem that is forming
          const e = inOutCubic(w);
          const vx = (1 - e) * (Sx - ex) + e * (Hx - ex);
          const vy = (1 - e) * (Sy - ey) + e * (Hy - ey);
          const th = SWIRL * 4 * e * (1 - e);
          const c = Math.cos(th);
          const sn = Math.sin(th);
          X = ex + vx * c - vy * sn;
          Y = ey + vx * sn + vy * c;
          a = (a + (ha - a) * e) * (1 - 0.25 * Math.sin(Math.PI * e));
          rk += (1 - rk) * e;
          if (e > 0.5) col = s.hc;
        }
      }
      a *= alphaBoost;
      if (a < 0.015) continue;
      QX[n] = X;
      QY[n] = Y;
      QA[n] = a > 1 ? 1 : a;
      QR[n] = s.r * sz * rk;
      QC[n] = col;
      n++;
    }
    // the night's circle: clip only while it does not cover the whole canvas yet
    const far = Math.hypot(Math.max(F.clipX, fw - F.clipX), Math.max(F.clipY, fh - F.clipY));
    const clip = F.clip !== false && F.clipR < far;
    if (clip) {
      g.save();
      g.beginPath();
      g.arc(F.clipX, F.clipY, F.clipR, 0, TAU);
      g.clip();
    }
    for (let pass = 0; pass < 3; pass++) {
      const spr = SPR[pass];
      g.fillStyle = `rgb(${COLORS[pass]})`;
      for (let j = 0; j < n; j++) {
        if (QC[j] !== pass) continue;
        const R = QR[j];
        g.globalAlpha = QA[j];
        if (R < 1.2) g.fillRect(QX[j] - R, QY[j] - R, R * 2, R * 2);
        else g.drawImage(spr, QX[j] - R * 3.2, QY[j] - R * 3.2, R * 6.4, R * 6.4);
      }
    }
    // the flares light as the emblem closes, over the suck-in's last third (each in a tenth of it, in FLARE_AT's
    // order): at suck1 every one is lit, exactly as the emblem's own canvas draws them
    for (let i = 0; i < flares.length; i++) {
      const p = clamp((t - F.suck0 - (0.66 + 0.24 * FLARE_AT[i]) * Ls) / (0.1 * Ls));
      if (p <= 0) continue;
      const fl = flares[i];
      const pulse = 0.88 + 0.12 * Math.sin(clock * 1.3 + fl.x * 0.05);
      flare(g, ex + fl.x * kk, ey + fl.y * kk, fl.len * kk * (0.6 + 0.4 * outQuart(p)), fl.core * kk, fl.a * outQuart(p) * pulse);
    }
    // the shooting star, while it shows: the top tip's flare, larger and brighter, with a streak behind it
    F.head(t, hp);
    if (hp.a > 0.01) {
      const fl = flares[0];
      const pulse = 0.88 + 0.12 * Math.sin(clock * 1.3);
      const a0 = Math.min(1, fl.a * pulse * 1.3) * hp.a;
      const S = F.streak;
      if (S > 0.5) {
        const w = Math.max(0.9, 1.5 * sz) * 1.6;
        const tx = hp.x - F.dirX * S;
        const ty = hp.y - F.dirY * S;
        const gr = g.createLinearGradient(hp.x, hp.y, tx, ty);
        gr.addColorStop(0, 'rgba(235,246,255,0.75)');
        gr.addColorStop(1, 'rgba(235,246,255,0)');
        g.globalAlpha = a0;
        g.fillStyle = gr;
        g.beginPath();
        g.moveTo(hp.x + nX * w, hp.y + nY * w);
        g.lineTo(hp.x - nX * w, hp.y - nY * w);
        g.lineTo(tx, ty);
        g.closePath();
        g.fill();
      }
      flare(g, hp.x, hp.y, fl.len * kk * 1.55, fl.core * kk * 1.8, a0);
    }
    g.globalAlpha = 1;
    if (clip) g.restore();
  };

  /* ------------------------------------------------------------ loop */
  let raf = 0;
  let last = 0;
  let onScreen = true;
  // the twinkle's rate at rest (opts.restFps, 30 by default: the finale's faint copy asks for 15 on a phone, where it
  // twinkles behind the held headline for as long as the visitor reads), and when the flight last drew for the scroll
  const restDt = 1 / ((opts.restFps ?? 30) + 1);
  let flewAt = -1e9;
  let acc = 0; // time since the last drawn frame (30 fps when idle)
  let slow = 0; // frames in a row that ran long
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const dt = last ? (now - last) / 1000 : 0;
    last = now;
    const step = Math.min(dt, 0.07);
    clock += step;
    acc += step;
    if (mode === 'flight') {
      // the scroll's frames are drawn by fly() itself; here only the twinkle, at 30 fps while the page is still, and
      // at the rest rate once nothing has scrolled for two seconds
      if (acc < (clock - flewAt > 2 ? restDt : 1 / 31)) return;
      if (dt > 0.03) slow++;
      else slow = Math.max(0, slow - 1);
      if (slow > 24 && stride === 1) stride = 2;
      drawFlight(clock);
      acc = 0;
      return;
    }
    const idle = clock > STARDUST_INTRO + 0.6 && clock - ptr.last > 1.5;
    if (idle && acc < (clock - ptr.last > 3 ? restDt : 1 / 31)) return; // twinkle reads the same at 30 fps
    // frames running long (a busy phone): draw half the stars, a touch brighter
    if (dt > 0.03 && clock > 1) slow++;
    else slow = Math.max(0, slow - 1);
    if (slow > 24 && stride === 1) stride = 2;
    draw(clock, acc);
    acc = 0;
  };
  const canRun = () => !opts.reduced && !document.hidden && (mode === 'flight' || (mode === 'home' && onScreen));
  const wake = () => {
    if (raf || !canRun()) return;
    last = 0;
    raf = requestAnimationFrame(frame);
  };
  const sleep = () => {
    cancelAnimationFrame(raf);
    raf = 0;
  };
  const onVis = () => (document.hidden ? sleep() : wake());

  size();
  if (opts.reduced) draw(99, 0);
  const ro = new ResizeObserver(() => {
    size();
    if (opts.reduced) draw(99, 0);
  });
  ro.observe(canvas);
  const fro = fcanvas
    ? new ResizeObserver(([en]) => {
        fw = Math.max(1, en.contentRect.width);
        fh = Math.max(1, en.contentRect.height);
        if (fAlloc) {
          allocFlight();
          drawFlight(clock);
        }
      })
    : null;
  if (fcanvas) fro!.observe(fcanvas);
  const io = new IntersectionObserver(([en]) => {
    onScreen = en.isIntersecting;
    if (onScreen) wake();
    else if (mode !== 'flight') {
      sleep();
      ptr.on = false; // onMove no longer runs off screen, so the push would otherwise wait at its old spot
    }
  });
  io.observe(canvas);
  document.addEventListener('visibilitychange', onVis);
  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('pointerdown', onMove, { passive: true });
  document.addEventListener('pointerleave', onOut);
  window.addEventListener('blur', onOut);
  wake();

  return {
    destroy() {
      sleep();
      ro.disconnect();
      fro?.disconnect();
      io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onMove);
      document.removeEventListener('pointerleave', onOut);
      window.removeEventListener('blur', onOut);
    },
    fly(f) {
      if (!fcanvas || !fctx) return;
      if (f === null) {
        if (mode === 'home') return;
        // the formed emblem on its own canvas: drawn first, then shown, with the flight hidden in the same task
        mode = 'home';
        draw(clock, 0);
        canvas.style.visibility = '';
        fcanvas.style.visibility = '';
        freeFlight();
        sleep();
        wake();
        return;
      }
      if (f === 'hidden') {
        if (mode === 'hidden') return;
        mode = 'hidden';
        canvas.style.visibility = 'hidden';
        fcanvas.style.visibility = '';
        freeFlight();
        sleep();
        return;
      }
      F = f;
      if (mode !== 'flight') {
        mode = 'flight';
        // stars the pointer pushed while the emblem was at home: back on their spots, the flight draws them exact
        for (const s of stars) s.ox = s.oy = s.vx = s.vy = 0;
        ptr.on = false;
        if (!fAlloc) allocFlight();
        fcanvas.style.visibility = 'visible';
        canvas.style.visibility = 'hidden';
        wake();
      }
      // drawn now, in the task that hands the frame in (the page's scroll update), so the stars never fall a frame
      // behind the circle wipe drawn from the same scroll; the loop only keeps the twinkle going when it is still
      drawFlight(clock);
      acc = 0;
      flewAt = clock;
    },
    layout: () => ({ w: cw, h: ch, cx, cy, k }),
  };
}
