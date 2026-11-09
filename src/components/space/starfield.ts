// The night sky behind /vision/ssi: a dark-site sky (Tenerife, looking south), not a screensaver.
//
// How it works
// - One static vertex buffer of tiny stars in "sky space": CSS px around a celestial pole far below
//   the screen, so turning the sky pans the stars sideways along gentle arcs, like a real night.
//   Brightness follows a power law (N(>F) ∝ F^-1.2): a handful of bright stars, a few hundred clear
//   ones, thousands at the limit. Colour is white with at most a ±3% warm/cool tint.
// - The Milky Way is one density field (band profile × fbm star clouds × a dark rift × dust) built
//   on the CPU in small slices after first paint. It places the extra faint stars in the band AND
//   becomes the soft glow texture, so the glow and the star clouds always agree.
// - Every frame the vertex shader lifts the sky (parallax from the page; the turn is held at 0) and
//   runs each star through a gravitational lens (point-lens primary image,
//   r' = (r + √(r² + 4θE²)) / 2, tapered so it stays local), stretches stars near the Einstein ring
//   into short arcs (surface brightness conserved) and adds a gentle per-star scintillation.
// - The glow pass inverts the same lens per pixel, so the Milky Way bends too and the hole reads as
//   a dark disc ringed by piled-up stars.
// - The lens follows the pointer through damped springs: position critically damped, mass a little
//   under-damped, so the hole opens with a small overshoot and the stars rebound when it closes.
//   Touch: tap or drag. With nobody on the sky, a weaker lens wanders slowly through it.
// - Meteors every few seconds (all from one radiant, like a shower) and a satellite now and then. The meteors
//   burn up in our own atmosphere, so the lens doesn't bend them.
// - Cost: DPR ≤ 2, nothing is drawn in hidden tabs or while an opaque element covers the screen, and
//   quality steps down if frames run long. Reduced motion gets one static frame. No WebGL: a static
//   2D canvas of the same stars.

export type SkyState = {
  /** Brightness outside the iris, 0..1. Acts dim or lift the sky. */
  gain: number;
  /** Sky rotation in radians around the pole below the screen; negative pans the stars left. */
  pan: number;
  /** Vertical parallax in CSS px: the whole sky lifts by this much. */
  shift: number;
  /** Iris: a circle (viewport CSS px) inside which the sky has `irisGain` instead of `gain`. r ≤ 0 = off. */
  irisX: number;
  irisY: number;
  irisR: number;
  irisGain: number;
};

export type Sky = {
  state: SkyState;
  mode: 'webgl' | '2d';
  canvas: HTMLCanvasElement;
  /** Limits the page may drive the sky to (the star field is generated to cover them). */
  limits: { panMin: number; panMax: number; shiftMax: number };
  /** An opaque element that can hide the whole sky; drawing stops while it covers the viewport. */
  cover: (el: HTMLElement) => void;
  /** Something the page knows hides the whole sky (a fixed layer, not an element in the flow): stops drawing. */
  hide: (on: boolean) => void;
  destroy: () => void;
};

type V2 = { x: number; y: number };
type Geo = {
  W: number;
  H: number;
  pole: V2;
  a0: number;
  a1: number;
  r0: number;
  r1: number;
  box: { x0: number; y0: number; x1: number; y1: number };
  band: { b0: V2; d: V2; n: V2; L: number; sigma: number };
};
type Lens = { x: number; y: number; vx: number; vy: number; m: number; vm: number; tm: number };
type Meteor = { t0: number; dur: number; sx: number; sy: number; dx: number; dy: number; len: number; amp: number };
type Sat = { t0: number; dur: number; sx: number; sy: number; vx: number; vy: number; amp: number; fadeAt: number };
type Field = { data: Float32Array; count: number };

const TAU = Math.PI * 2;
const DRIFT = 0; // no slow turn of its own: the sky holds still (it read as odd); twinkle, lens and meteors stay
/** Seconds of "dark adaptation" when the page opens: the brightest stars first, then fainter and fainter
 * ones, the Milky Way last. motion.ts times the logo against this. */
export const ADAPT = 4.2;
const LIVE = '[data-sky-live]';

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/* ------------------------------------------------------------------ seeded randomness and noise */

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

function hash(ix: number, iy: number, s: number) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(s, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function vnoise(x: number, y: number, s: number) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy, s);
  const b = hash(ix + 1, iy, s);
  const c = hash(ix, iy + 1, s);
  const d = hash(ix + 1, iy + 1, s);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function fbm(x: number, y: number, oct: number, s: number) {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let f = 1;
  for (let i = 0; i < oct; i++) {
    sum += amp * vnoise(x * f, y * f, s + i * 101);
    norm += amp;
    amp *= 0.5;
    f *= 2.07;
  }
  return sum / norm;
}

/* ------------------------------------------------------------------ geometry: where the sky lives */

function geometry(W: number, H: number, lim: Sky['limits']): Geo {
  const pole = { x: 0.42 * W, y: 2.6 * H };
  const m = 90; // margin for big sprites and the lens
  let a0 = Infinity;
  let a1 = -Infinity;
  let r0 = Infinity;
  let r1 = 0;
  // the pole lifts with the parallax shift; cover both ends of that range
  for (const py of [pole.y, pole.y - lim.shiftMax]) {
    const pts = [
      [-m, -m],
      [W + m, -m],
      [W + m, H + m],
      [-m, H + m],
    ].map(([x, y]) => ({ x: x - pole.x, y: y - py }));
    for (const p of pts) {
      const a = Math.atan2(p.y, p.x);
      a0 = Math.min(a0, a);
      a1 = Math.max(a1, a);
      r1 = Math.max(r1, Math.hypot(p.x, p.y));
    }
    const nx = clamp(pole.x, -m, W + m) - pole.x;
    const ny = clamp(py, -m, H + m) - py;
    r0 = Math.min(r0, Math.hypot(nx, ny));
  }
  // screen angle = sky angle + rotation, so the sky sector is the screen sector minus every rotation allowed
  a0 -= lim.panMax + DRIFT;
  a1 -= lim.panMin - DRIFT;
  r0 = Math.max(0, r0 - 8);
  const box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (let i = 0; i <= 64; i++) {
    const a = a0 + ((a1 - a0) * i) / 64;
    for (const r of [r0, r1]) {
      box.x0 = Math.min(box.x0, Math.cos(a) * r);
      box.y0 = Math.min(box.y0, Math.sin(a) * r);
      box.x1 = Math.max(box.x1, Math.cos(a) * r);
      box.y1 = Math.max(box.y1, Math.sin(a) * r);
    }
  }
  // The Milky Way: a band from just under the bottom-left of the first screen up to the top right,
  // its bright core (the galactic centre) low over the horizon, like a summer night on Teide.
  const toQ = (x: number, y: number) => ({ x: x - pole.x, y: y - pole.y });
  const b0 = toQ(0.04 * W, 1.18 * H);
  const b1 = toQ(1.15 * W, -0.25 * H);
  const L = Math.hypot(b1.x - b0.x, b1.y - b0.y);
  const d = { x: (b1.x - b0.x) / L, y: (b1.y - b0.y) / L };
  const n = { x: -d.y, y: d.x };
  const sigma = 0.075 * Math.hypot(W, H);
  return { W, H, pole, a0, a1, r0, r1, box, band: { b0, d, n, L, sigma } };
}

/** Across-band profile only (cheap): thickens the plain field towards the galactic plane. */
function bandProfile(g: Geo, qx: number, qy: number) {
  const { b0, d, n, L, sigma } = g.band;
  const rx = qx - b0.x;
  const ry = qy - b0.y;
  const tn = (rx * d.x + ry * d.y) / L;
  const p = rx * n.x + ry * n.y;
  const w = sigma * (1 + 0.9 * Math.exp(-(tn * tn) / 0.05));
  return Math.exp(-0.5 * (p / w) * (p / w));
}

/** The full Milky Way density: band × star clouds × the dark rift × dust, plus the bright core. */
function bandDensity(g: Geo, qx: number, qy: number) {
  const { b0, d, n, L, sigma } = g.band;
  const rx = qx - b0.x;
  const ry = qy - b0.y;
  const tn = (rx * d.x + ry * d.y) / L;
  const p = rx * n.x + ry * n.y;
  const w = sigma * (1 + 0.9 * Math.exp(-(tn * tn) / 0.05));
  const prof = Math.exp(-0.5 * (p / w) * (p / w));
  const core = Math.exp(-(tn * tn) / 0.012) * Math.exp(-0.5 * (p / (1.3 * w)) * (p / (1.3 * w)));
  if (prof + core < 0.004) return 0;
  const s = 1 / sigma;
  const along = 0.42 + 0.58 * Math.exp(-((tn - 0.08) * (tn - 0.08)) / 0.3);
  const clouds = fbm(qx * s * 1.1, qy * s * 1.1, 5, 11);
  const cl = 0.18 + 1.45 * smooth(0.34, 0.74, clouds);
  // the Great Rift: a wandering dark lane, strongest through the middle of the band
  const lane = w * (0.14 * Math.sin(tn * 7.3 + 0.6) + 0.1);
  const laneW = w * 0.2 * (0.75 + 0.7 * fbm(qx * s * 0.7 + 7.1, qy * s * 0.7, 3, 23));
  const riftAlong = smooth(-0.2, 0.1, tn) * (1 - smooth(0.6, 0.98, tn));
  const rift = 1 - 0.84 * riftAlong * Math.exp(-0.5 * ((p - lane) / laneW) * ((p - lane) / laneW));
  const dust = 1 - 0.62 * smooth(0.5, 0.68, fbm(qx * s * 2.1 + 31, qy * s * 2.1 - 13, 4, 37));
  return (prof * along * cl + core * 1.25 * (0.55 + 0.45 * cl)) * rift * dust;
}

/* ------------------------------------------------------------------ stars */

const sectorArea = (g: Geo) => 0.5 * (g.a1 - g.a0) * (g.r1 * g.r1 - g.r0 * g.r0);

/** Plain field stars (sync, cheap). Layout per star: sky x, sky y, peak brightness, seed. */
function fieldStars(g: Geo, seed: number, density: number): Field {
  const R = rng(seed);
  const tries = Math.round(sectorArea(g) * density * 1.55);
  const out = new Float32Array(tries * 4 + 64);
  let k = 0;
  const push = (x: number, y: number, peak: number, s: number) => {
    out[k++] = x;
    out[k++] = y;
    out[k++] = peak;
    out[k++] = s;
  };
  for (let i = 0; i < tries; i++) {
    const a = g.a0 + R() * (g.a1 - g.a0);
    const r = Math.sqrt(g.r0 * g.r0 + R() * (g.r1 * g.r1 - g.r0 * g.r0));
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    // a little denser towards the galactic plane, like the real sky
    if (R() * 1.55 > 1 + 0.55 * bandProfile(g, x, y)) continue;
    // flux from a power law, F_min = 1/1000 of a bright star; peak = 1.12·F^0.26 fits that range on a screen
    const F = Math.min(14, 0.001 * Math.pow(1 - R(), -1 / 1.2));
    push(x, y, 1.12 * Math.pow(F, 0.26), R());
  }
  // a few deliberate bright ones, clear of the title: a triangle up and to the right, two strays
  const toQ = (fx: number, fy: number) => [fx * g.W - g.pole.x, fy * g.H - g.pole.y];
  const named: [number, number, number][] = [
    [0.8, 0.16, 1.85],
    [0.92, 0.36, 1.45],
    [0.68, 0.32, 1.3],
    [0.12, 0.26, 1.25],
    [0.26, 0.63, 1.05],
  ];
  for (const [fx, fy, p] of named) {
    const [x, y] = toQ(fx, fy);
    push(x, y, p, R());
  }
  // one small open cluster, like the Pleiades, near the top left
  const [cx, cy] = toQ(0.2, 0.12);
  const cr = Math.min(g.W, g.H) * 0.022;
  for (let i = 0; i < 9; i++) {
    const a = R() * TAU;
    const r = cr * Math.sqrt(R());
    push(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 0.42 + R() * 0.38, R());
  }
  return { data: out, count: k / 4 };
}

/** Milky Way grid, band stars and glow texture, built in ~7 ms slices so the page never stalls. */
function buildBand(g: Geo, seed: number, size: number, density: number, done: (stars: Field, tex: Uint8Array, size: number) => void) {
  const grid = new Float32Array(size * size);
  const sx = (g.box.x1 - g.box.x0) / (size - 1);
  const sy = (g.box.y1 - g.box.y0) / (size - 1);
  let row = 0;
  let cancelled = false;
  const slice = () => {
    if (cancelled) return;
    const until = performance.now() + 7;
    while (row < size && performance.now() < until) {
      const y = g.box.y0 + row * sy;
      for (let c = 0; c < size; c++) grid[row * size + c] = bandDensity(g, g.box.x0 + c * sx, y);
      row++;
    }
    if (row < size) return void setTimeout(slice, 0);
    let max = 0;
    for (let i = 0; i < grid.length; i++) max = Math.max(max, grid[i]);
    max = max || 1;
    // sqrt-encoded for precision in the faint end; zero border because the texture clamps to its edge
    const tex = new Uint8Array(size * size);
    for (let r = 1; r < size - 1; r++)
      for (let c = 1; c < size - 1; c++) tex[r * size + c] = Math.round(255 * Math.sqrt(clamp(grid[r * size + c] / max)));
    // band stars by rejection sampling against the same field
    const R = rng(seed + 7);
    const tries = Math.round(sectorArea(g) * density);
    const out = new Float32Array(Math.round(tries * 0.45) * 4 + 16);
    let k = 0;
    const sample = (x: number, y: number) => {
      const fx = clamp((x - g.box.x0) / sx, 0, size - 1.001);
      const fy = clamp((y - g.box.y0) / sy, 0, size - 1.001);
      const ix = Math.floor(fx);
      const iy = Math.floor(fy);
      const tx = fx - ix;
      const ty = fy - iy;
      const i = iy * size + ix;
      const a = grid[i] + (grid[i + 1] - grid[i]) * tx;
      const b = grid[i + size] + (grid[i + size + 1] - grid[i + size]) * tx;
      return (a + (b - a) * ty) / max;
    };
    for (let i = 0; i < tries && k < out.length - 4; i++) {
      const a = g.a0 + R() * (g.a1 - g.a0);
      const r = Math.sqrt(g.r0 * g.r0 + R() * (g.r1 * g.r1 - g.r0 * g.r0));
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (R() > sample(x, y) * 1.15) continue;
      // fainter on average than the field: the unresolved crowd that makes the band grainy
      const F = Math.min(0.35, 0.00042 * Math.pow(1 - R(), -1 / 1.55));
      out[k++] = x;
      out[k++] = y;
      out[k++] = 1.12 * Math.pow(F, 0.26);
      out[k++] = R();
    }
    done({ data: out, count: k / 4 }, tex, size);
  };
  setTimeout(slice, 0);
  return () => (cancelled = true);
}

/** Bright stars first (always drawn), the rest shuffled, so drawing a prefix is a fair subset. */
function order(f: Field) {
  const n = f.count;
  const idx = Array.from({ length: n }, (_, i) => i);
  const R = rng(99);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(R() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  const bright = (i: number) => (f.data[i * 4 + 2] > 0.55 ? 1 : 0);
  idx.sort((a, b) => bright(b) - bright(a));
  const out = new Float32Array(n * 4);
  idx.forEach((s, i) => out.set(f.data.subarray(s * 4, s * 4 + 4), i * 4));
  return out;
}

/* ------------------------------------------------------------------ shaders */

const LENS_FWD = `
void lensMap(inout vec2 s, vec4 L, inout float st, inout float sr, inout vec2 tg) {
  if (abs(L.w) < 0.002) return;
  vec2 d = s - L.xy;
  float r = max(length(d), 0.01);
  float taper = 1.0 - smoothstep(2.2 * L.z, 5.0 * L.z, r);
  if (taper <= 0.0) return;
  float te2 = L.z * L.z * L.w * taper;
  vec2 n = d / r;
  float rp = te2 >= 0.0 ? 0.5 * (r + sqrt(r * r + 4.0 * te2)) : max(r + te2 / max(r, L.z), 0.5 * r);
  s = L.xy + n * rp;
  float t = rp / r;
  if (t > st) { st = t; sr = rp * rp / (rp * rp + abs(te2)); tg = vec2(-n.y, n.x); }
}`;

const IRIS = `
float irisGain(vec2 s, float gain, vec4 iris) {
  if (iris.z <= 0.0) return gain;
  float m = 1.0 - smoothstep(iris.z - 110.0, iris.z + 10.0, length(s - iris.xy));
  return mix(gain, iris.w, m);
}`;

const STAR_VS = `
precision highp float;
attribute vec4 a_star;
uniform vec2 u_view;
uniform float u_dpr;
uniform vec2 u_pole;
uniform vec2 u_rot;
uniform float u_time;
uniform vec4 u_lensA;
uniform vec4 u_lensB;
uniform float u_limit;
uniform float u_gain;
uniform float u_twinkle;
uniform vec4 u_iris;
uniform float u_sigma;
varying vec4 v_col;
varying vec4 v_shape;
varying vec2 v_tan;
varying float v_size;
${LENS_FWD}
${IRIS}
void main() {
  vec2 q = a_star.xy;
  vec2 s = u_pole + vec2(u_rot.x * q.x - u_rot.y * q.y, u_rot.y * q.x + u_rot.x * q.y);
  float st = 1.0;
  float sr = 1.0;
  vec2 tg = vec2(1.0, 0.0);
  lensMap(s, u_lensA, st, sr, tg);
  lensMap(s, u_lensB, st, sr, tg);
  st = min(st, 3.2);
  sr = max(sr, 0.8);

  float seed = a_star.w;
  float peak = a_star.z;
  float vis = smoothstep(u_limit, u_limit + 0.14, peak);
  float hz = clamp(s.y / u_view.y, 0.0, 1.0);
  float amp = u_twinkle * mix(0.07, 0.26, smoothstep(0.14, 0.85, peak)) * (0.7 + 0.6 * hz);
  float f1 = 1.2 + 2.4 * fract(seed * 13.17);
  float f2 = 3.1 + 3.9 * fract(seed * 71.31);
  float tw = 1.0 + amp * (0.62 * sin(u_time * f1 + seed * 43.0) + 0.38 * sin(u_time * f2 + seed * 97.0));
  peak *= vis * tw * irisGain(s, u_gain, u_iris);

  float sig = u_sigma;
  float halo = 0.05 * max(peak - 0.62, 0.0);
  float rc = sig * sqrt(2.0 * log(max(peak * 420.0, 1.0)));
  float rh = halo > 0.0 ? 5.0 * sig * sqrt(2.0 * log(max(halo * 420.0, 1.0))) : 0.0;
  float size = min(2.0 * max(rc, rh) * st + 2.0, 64.0);

  vec2 clip = vec2(s.x / u_view.x * 2.0 - 1.0, 1.0 - s.y / u_view.y * 2.0);
  vec2 pad = vec2(size / (u_dpr * u_view.x), size / (u_dpr * u_view.y));
  float tint = (fract(seed * 7.77) - 0.5) * 0.06;
  v_col = vec4(1.0 + tint, 1.0 + tint * 0.3, 1.0 - tint, peak);
  v_shape = vec4(1.0 / (2.0 * sig * sig), halo, st, sr);
  v_tan = tg;
  v_size = size;
  if (peak < 0.006 || abs(clip.x) > 1.0 + pad.x || abs(clip.y) > 1.0 + pad.y) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    return;
  }
  gl_Position = vec4(clip, 0.0, 1.0);
  gl_PointSize = size;
}`;

const STAR_FS = `
precision mediump float;
varying vec4 v_col;
varying vec4 v_shape;
varying vec2 v_tan;
varying float v_size;
void main() {
  vec2 d = (gl_PointCoord - 0.5) * v_size;
  float dt = dot(d, v_tan) / v_shape.z;
  float dr = dot(d, vec2(-v_tan.y, v_tan.x)) / v_shape.w;
  float q = (dt * dt + dr * dr) * v_shape.x;
  float v = v_col.a * exp(-q) + v_shape.y * exp(-q * 0.04);
  gl_FragColor = vec4(v_col.rgb * v, 1.0);
}`;

const QUAD_VS = `
attribute vec2 a_xy;
void main() { gl_Position = vec4(a_xy, 0.0, 1.0); }`;

const GLOW_FS = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D u_tex;
uniform vec2 u_view;
uniform vec2 u_buf;
uniform vec2 u_pole;
uniform vec2 u_rot;
uniform vec4 u_box;
uniform vec4 u_lensA;
uniform vec4 u_lensB;
uniform float u_glow;
uniform float u_gain;
uniform float u_air;
uniform vec4 u_iris;
${IRIS}
vec2 lensInv(vec2 p, vec4 L, inout float shade) {
  if (abs(L.w) < 0.002) return p;
  vec2 d = p - L.xy;
  float r = max(length(d), 0.01);
  float te2 = L.z * L.z * L.w * (1.0 - smoothstep(2.2 * L.z, 5.0 * L.z, r));
  if (te2 > 0.0) {
    float te = sqrt(te2);
    shade *= smoothstep(0.78 * te, 1.04 * te, r);
    return p - d / r * (te2 / max(r, te));
  }
  return p - d / r * (te2 / max(r, L.z));
}
void main() {
  vec2 s = vec2(gl_FragCoord.x, u_buf.y - gl_FragCoord.y) * (u_view.x / u_buf.x);
  float shade = 1.0;
  vec2 p = lensInv(s, u_lensB, shade);
  p = lensInv(p, u_lensA, shade);
  vec2 d = p - u_pole;
  vec2 q = vec2(u_rot.x * d.x + u_rot.y * d.y, -u_rot.y * d.x + u_rot.x * d.y);
  float g = texture2D(u_tex, (q - u_box.xy) * u_box.zw).r;
  float hz = clamp(s.y / u_view.y, 0.0, 1.0);
  float v = (g * g * u_glow + u_air * hz * hz * hz) * shade * irisGain(s, u_gain, u_iris);
  float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  v = max(v + (n - 0.5) / 255.0, 0.0);
  gl_FragColor = vec4(v * 0.965, v * 0.985, v, 1.0);
}`;

const STREAK_VS = `
attribute vec4 a_p;
attribute float a_i;
uniform vec2 u_view;
varying vec2 v_uv;
varying float v_i;
void main() {
  gl_Position = vec4(a_p.x / u_view.x * 2.0 - 1.0, 1.0 - a_p.y / u_view.y * 2.0, 0.0, 1.0);
  v_uv = a_p.zw;
  v_i = a_i;
}`;

const STREAK_FS = `
precision mediump float;
varying vec2 v_uv;
varying float v_i;
void main() {
  float across = exp(-v_uv.y * v_uv.y * 4.5);
  float along = v_uv.x * v_uv.x;
  float head = smoothstep(0.82, 1.0, v_uv.x) * (1.0 - smoothstep(0.98, 1.06, v_uv.x));
  float v = v_i * across * (0.65 * along + 0.7 * head);
  gl_FragColor = vec4(v * 0.97, v * 0.99, v, 1.0);
}`;

/* ------------------------------------------------------------------ WebGL plumbing */

function compile(gl: WebGLRenderingContext, vs: string, fs: string) {
  const sh = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
    return s;
  };
  const p = gl.createProgram()!;
  gl.attachShader(p, sh(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'link');
  const u: Record<string, WebGLUniformLocation | null> = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS) as number;
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(p, i);
    if (info) u[info.name] = gl.getUniformLocation(p, info.name);
  }
  return { p, u };
}

/* ------------------------------------------------------------------ the sky */

export function createSky(mount: HTMLElement, opts: { reduced: boolean; seed?: number }): Sky | null {
  const seed = opts.seed ?? 20261027;
  const canvas = document.createElement('canvas');
  canvas.className = 'ssi-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  mount.prepend(canvas);

  const state: SkyState = { gain: 1, pan: 0, shift: 0, irisX: 0, irisY: 0, irisR: 0, irisGain: 1 };
  const covers: HTMLElement[] = [];
  const coarse = matchMedia('(pointer: coarse)').matches;
  const phone = () => Math.min(innerWidth, innerHeight) < 600;
  const limits = { panMin: -0.5, panMax: 0.06, shiftMax: 600 };

  let gl: WebGLRenderingContext | null = null;
  try {
    gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, powerPreference: 'default' });
  } catch {
    gl = null;
  }

  let W = 0;
  let H = 0;
  let geo: Geo;
  let field: Field;
  let band: Field | null = null;
  let glowTex: Uint8Array | null = null;
  let glowSize = 0;
  let cancelBand: (() => void) | null = null;

  const measure = () => {
    W = Math.max(1, canvas.clientWidth || innerWidth);
    H = Math.max(1, canvas.clientHeight || innerHeight);
    limits.panMin = phone() ? -0.22 : -0.5;
    limits.shiftMax = Math.round(H * 0.75);
  };

  const generate = (onBand: () => void) => {
    geo = geometry(W, H, limits);
    const small = phone();
    field = fieldStars(geo, seed, small ? 0.0068 : 0.0052);
    band = null;
    glowTex = null;
    cancelBand?.();
    cancelBand = buildBand(geo, seed, small ? 224 : 320, small ? 0.026 : 0.022, (stars, tex, size) => {
      band = stars;
      glowTex = tex;
      glowSize = size;
      onBand();
    });
  };

  /* --------------------------------------------------------------- 2D fallback: one static frame */
  if (!gl) {
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      canvas.remove();
      return null;
    }
    const draw2d = () => {
      measure();
      const dpr = Math.min(devicePixelRatio || 1, phone() ? 1.5 : 2);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      const paint = (f: Field) => {
        ctx.fillStyle = '#fff';
        for (let i = 0; i < f.count; i++) {
          const x = f.data[i * 4] + geo.pole.x;
          const y = f.data[i * 4 + 1] + geo.pole.y;
          if (x < -4 || y < -4 || x > W + 4 || y > H + 4) continue;
          const p = f.data[i * 4 + 2];
          ctx.globalAlpha = Math.min(1, p);
          ctx.beginPath();
          ctx.arc(x, y, p > 1 ? 1.1 + (p - 1) * 0.6 : 0.55 + p * 0.45, 0, TAU);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      };
      generate(() => band && paint(band));
      paint(field);
    };
    draw2d();
    let t2: number | undefined;
    const onResize2d = () => {
      clearTimeout(t2);
      t2 = window.setTimeout(draw2d, 200);
    };
    addEventListener('resize', onResize2d);
    mount.classList.add('has-sky');
    return {
      state,
      mode: '2d',
      canvas,
      limits,
      cover: () => {},
      hide: () => {},
      destroy: () => {
        removeEventListener('resize', onResize2d);
        cancelBand?.();
        canvas.remove();
      },
    };
  }

  /* --------------------------------------------------------------- WebGL */
  const g = gl;
  let star: ReturnType<typeof compile>;
  let glow: ReturnType<typeof compile>;
  let streak: ReturnType<typeof compile>;
  let starBuf: WebGLBuffer | null = null;
  let satBuf: WebGLBuffer | null = null;
  let quadBuf: WebGLBuffer | null = null;
  let streakBuf: WebGLBuffer | null = null;
  let tex: WebGLTexture | null = null;
  let starCount = 0;
  let drawCount = 0;
  let glowReady = false;
  let quality = 1;

  const initGL = () => {
    star = compile(g, STAR_VS, STAR_FS);
    glow = compile(g, QUAD_VS, GLOW_FS);
    streak = compile(g, STREAK_VS, STREAK_FS);
    starBuf = g.createBuffer();
    satBuf = g.createBuffer();
    streakBuf = g.createBuffer();
    quadBuf = g.createBuffer();
    g.bindBuffer(g.ARRAY_BUFFER, quadBuf);
    g.bufferData(g.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), g.STATIC_DRAW);
    tex = g.createTexture();
    g.bindTexture(g.TEXTURE_2D, tex);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE);
    g.pixelStorei(g.UNPACK_ALIGNMENT, 1);
    g.texImage2D(g.TEXTURE_2D, 0, g.LUMINANCE, 1, 1, 0, g.LUMINANCE, g.UNSIGNED_BYTE, new Uint8Array([0]));
    glowReady = false;
  };

  const upload = () => {
    const parts = band ? [field, band] : [field];
    const total = parts.reduce((s, f) => s + f.count, 0);
    const merged = new Float32Array(total * 4);
    let o = 0;
    for (const f of parts) {
      merged.set(f.data.subarray(0, f.count * 4), o);
      o += f.count * 4;
    }
    g.bindBuffer(g.ARRAY_BUFFER, starBuf);
    g.bufferData(g.ARRAY_BUFFER, order({ data: merged, count: total }), g.STATIC_DRAW);
    starCount = total;
    drawCount = Math.round(total * quality);
    if (glowTex) {
      g.bindTexture(g.TEXTURE_2D, tex);
      g.texImage2D(g.TEXTURE_2D, 0, g.LUMINANCE, glowSize, glowSize, 0, g.LUMINANCE, g.UNSIGNED_BYTE, glowTex);
      glowReady = true;
    }
  };

  /* --------------------------------------------------------------- sizing */
  let genW = 0;
  let genH = 0;
  const size = (force = false) => {
    measure();
    const dpr = Math.min(devicePixelRatio || 1, phone() ? 1.5 : 2) * (quality < 1 ? 0.75 : 1);
    const bw = Math.round(W * dpr);
    const bh = Math.round(H * dpr);
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    // regenerate only for real layout changes, not the phone toolbar sliding in and out
    if (force || W !== genW || Math.abs(H - genH) > genH * 0.2) {
      genW = W;
      genH = H;
      generate(() => {
        upload();
        if (opts.reduced) draw(0);
      });
      upload();
    }
  };

  /* --------------------------------------------------------------- lens physics */
  let now = 0;
  const pointer = { x: -1e4, y: -1e4, live: false, down: false, lastMove: -1e9, lastTouch: -1e9, moved: false };
  const lensP: Lens = { x: 0, y: 0, vx: 0, vy: 0, m: 0, vm: 0, tm: 0 };
  const lensI: Lens = { x: 0, y: 0, vx: 0, vy: 0, m: 0, vm: 0, tm: 0 };
  const thetaE = () => clamp(0.05 * Math.min(W, H) + 20, 40, 82);
  const liveAt = (t: EventTarget | null) => !!(t as Element | null)?.closest?.(LIVE);

  const onMove = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse' && !pointer.down) return;
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.live = liveAt(e.target);
    pointer.lastMove = now;
    pointer.moved = true;
  };
  const onDown = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') return;
    pointer.down = true;
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.live = liveAt(e.target);
    pointer.lastTouch = now;
    wake();
  };
  const onUp = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') return;
    pointer.down = false;
    pointer.live = false;
    pointer.lastTouch = now;
  };
  const onLeave = (e: MouseEvent) => {
    if (!e.relatedTarget) pointer.live = false;
  };
  let scrollCheck = 0;
  const onScroll = () => {
    scrollYNow = window.scrollY;
    checkCover();
    // the page moved under a still mouse: is it still over the sky?
    if (!coarse && pointer.moved && !scrollCheck)
      scrollCheck = requestAnimationFrame(() => {
        scrollCheck = 0;
        pointer.live = liveAt(document.elementFromPoint(pointer.x, pointer.y));
      });
  };

  // semi-implicit damped spring
  const spring = (x: number, v: number, target: number, w: number, z: number, dt: number) => {
    v += (-2 * z * w * v - w * w * (x - target)) * dt;
    return [x + v * dt, v];
  };

  /* Where the live sections and the covers sit in the document, measured on resize and when the page's height
     changes, never per frame: liveBox() ran twice a frame and checkCover() on every scroll event, and each rect
     read after the frame's writes forced a style recalc and a layout (139 of them per pass in the finale).
     The scroll position comes from the scroll event, where layout is already clean. */
  let scrollYNow = window.scrollY;
  const lives: { el: HTMLElement; top: number; bottom: number }[] = [];
  const coverBoxes: { top: number; bottom: number }[] = [];
  const measureBoxes = () => {
    scrollYNow = window.scrollY;
    lives.length = 0;
    for (const el of document.querySelectorAll<HTMLElement>(LIVE)) {
      const r = el.getBoundingClientRect();
      lives.push({ el, top: r.top + scrollYNow, bottom: r.bottom + scrollYNow });
    }
    coverBoxes.length = 0;
    for (const el of covers) {
      const r = el.getBoundingClientRect();
      coverBoxes.push({ top: r.top + scrollYNow, bottom: r.bottom + scrollYNow });
    }
  };
  /** The live section (hero or end) that fills most of the screen, if any fills a good part of it. */
  const liveBox = () => {
    let best: { top: number; bottom: number } | null = null;
    for (const l of lives) {
      const top = Math.max(0, l.top - scrollYNow);
      const bottom = Math.min(H, l.bottom - scrollYNow);
      if (bottom - top > H * 0.45 && (!best || bottom - top > best.bottom - best.top)) best = { top, bottom };
    }
    return best;
  };

  const stepLenses = (dt: number, t: number) => {
    // pointer lens: a mouse over the sky, or a finger down on it
    const want = pointer.live && (coarse ? pointer.down : true);
    if (want && lensP.m < 0.04) {
      lensP.x = pointer.x;
      lensP.y = pointer.y;
      lensP.vx = lensP.vy = 0;
    }
    lensP.tm = want ? 1 : 0;
    [lensP.x, lensP.vx] = spring(lensP.x, lensP.vx, pointer.x, 13, 1, dt);
    [lensP.y, lensP.vy] = spring(lensP.y, lensP.vy, pointer.y, 13, 1, dt);
    [lensP.m, lensP.vm] = spring(lensP.m, lensP.vm, lensP.tm, 7.5, 0.5, dt);

    // idle lens: a weaker one that wanders the sky while nobody is touching it
    const box = liveBox();
    const quiet = coarse ? now - pointer.lastTouch > 3600 : !pointer.live && now - pointer.lastMove > 2600;
    lensI.tm = box && quiet && !pointer.down ? 0.62 : 0;
    if (box) {
      const span = box.bottom - box.top;
      const ix = W * (0.5 + 0.38 * Math.sin(t * 0.057 + 0.9) + 0.06 * Math.sin(t * 0.19));
      const iy = box.top + span * (0.46 + 0.3 * Math.sin(t * 0.043 + 2.2));
      if (lensI.m < 0.02) {
        lensI.x = ix;
        lensI.y = iy;
      }
      [lensI.x, lensI.vx] = spring(lensI.x, lensI.vx, ix, 3, 1, dt);
      [lensI.y, lensI.vy] = spring(lensI.y, lensI.vy, iy, 3, 1, dt);
    }
    [lensI.m, lensI.vm] = spring(lensI.m, lensI.vm, lensI.tm, 2.2, 0.9, dt);
  };

  /* --------------------------------------------------------------- meteors and satellites */
  const R = rng(seed + 3);
  let meteor: Meteor | null = null;
  let sat: Sat | null = null;
  let nextMeteor = 2.5 + R() * 3;
  let nextSat = 14 + R() * 18;
  const events = (t: number) => {
    const open = state.gain > 0.8 && !!liveBox();
    if (!meteor && t > nextMeteor) {
      // one every few seconds, irregular: mostly 2.5-6 s apart, now and then a longer lull
      nextMeteor = t + 2.5 + R() * 3.5 + (R() < 0.18 ? 3 + R() * 5 : 0);
      if (open) {
        // every meteor comes from one radiant above the top right: a quiet shower
        const sx = W * (0.15 + R() * 0.75);
        const sy = H * (0.06 + R() * 0.45);
        const rx = W * 1.25;
        const ry = -H * 0.45;
        const l = Math.hypot(sx - rx, sy - ry);
        meteor = { t0: t, dur: 0.5 + R() * 0.45, sx, sy, dx: (sx - rx) / l, dy: (sy - ry) / l, len: Math.min(W, H) * (0.16 + R() * 0.16), amp: 0.55 + R() * 0.45 };
      }
    }
    if (!sat && t > nextSat) {
      nextSat = t + 38 + R() * 40;
      if (open) {
        const fromLeft = R() > 0.5;
        const sy = H * (0.08 + R() * 0.5);
        const sp = Math.max(W, 600) * (0.017 + R() * 0.012);
        sat = {
          t0: t,
          dur: (W + 40) / sp,
          sx: fromLeft ? -20 : W + 20,
          sy,
          vx: fromLeft ? sp : -sp,
          vy: (R() - 0.5) * sp * 0.5,
          amp: 0.3 + R() * 0.1,
          // some satellites slide into the Earth's shadow and vanish mid-sky
          fadeAt: R() > 0.5 ? 0.45 + R() * 0.4 : 2,
        };
      }
    }
  };

  /* --------------------------------------------------------------- render */
  let raf = 0;
  let last = 0;
  let t0 = performance.now();
  let slow = 0;

  const draw = (t: number) => {
    if (g.isContextLost()) return;
    const bw = canvas.width;
    const bh = canvas.height;
    g.viewport(0, 0, bw, bh);
    g.clearColor(0, 0, 0, 1);
    g.clear(g.COLOR_BUFFER_BIT);
    const drift = opts.reduced ? 0 : DRIFT * Math.sin((t * TAU) / 900);
    const phi = clamp(state.pan, limits.panMin, limits.panMax) + drift;
    const c = Math.cos(phi);
    const s = Math.sin(phi);
    const poleX = geo.pole.x;
    const poleY = geo.pole.y - clamp(state.shift, 0, limits.shiftMax);
    const te = thetaE();
    const lA = [lensP.x, lensP.y, te, opts.reduced ? 0 : lensP.m];
    const lB = [lensI.x, lensI.y, te * 0.85, opts.reduced ? 0 : lensI.m];
    const adapt = opts.reduced ? 1 : clamp(t / ADAPT);
    // the visibility limit sweeps down through the magnitudes: a gentle start lets the few bright
    // stars stand alone for a moment, then the field fills in (power law: most stars are faint)
    const ae = adapt * adapt * (3 - 2 * adapt);
    const iris = [state.irisX, state.irisY, state.irisR, state.irisGain];

    // glow: the Milky Way and a faint airglow over the hero's horizon
    if (glowReady) {
      g.disable(g.BLEND);
      g.useProgram(glow.p);
      g.bindBuffer(g.ARRAY_BUFFER, quadBuf);
      const loc = g.getAttribLocation(glow.p, 'a_xy');
      g.enableVertexAttribArray(loc);
      g.vertexAttribPointer(loc, 2, g.FLOAT, false, 0, 0);
      g.activeTexture(g.TEXTURE0);
      g.bindTexture(g.TEXTURE_2D, tex);
      const u = glow.u;
      const bx = geo.box;
      const glowIn = opts.reduced ? 1 : smooth(0.55, 1, adapt);
      g.uniform1i(u.u_tex, 0);
      g.uniform2f(u.u_view, W, H);
      g.uniform2f(u.u_buf, bw, bh);
      g.uniform2f(u.u_pole, poleX, poleY);
      g.uniform2f(u.u_rot, c, s);
      g.uniform4f(u.u_box, bx.x0, bx.y0, 1 / (bx.x1 - bx.x0), 1 / (bx.y1 - bx.y0));
      g.uniform4fv(u.u_lensA, lA);
      g.uniform4fv(u.u_lensB, lB);
      g.uniform1f(u.u_glow, 0.135 * glowIn);
      g.uniform1f(u.u_gain, state.gain);
      // the scroll from the scroll event (scrollYNow): the global scrollY read here, inside the frame after other
      // rAF callbacks had written styles, forced a style recalc and a layout every frame (57 per pass in stripes).
      // Reduced motion has no scroll listener and draws only now and then, so it still reads it live.
      g.uniform1f(u.u_air, 0.03 * glowIn * Math.max(0, 1 - (opts.reduced ? window.scrollY : scrollYNow) / (H * 0.8)));
      g.uniform4fv(u.u_iris, iris);
      g.drawArrays(g.TRIANGLES, 0, 3);
      g.disableVertexAttribArray(loc);
    }

    // stars
    g.enable(g.BLEND);
    g.blendFunc(g.ONE, g.ONE);
    g.useProgram(star.p);
    const u = star.u;
    g.uniform2f(u.u_view, W, H);
    g.uniform1f(u.u_dpr, bw / W);
    g.uniform2f(u.u_pole, poleX, poleY);
    g.uniform2f(u.u_rot, c, s);
    g.uniform1f(u.u_time, t);
    g.uniform4fv(u.u_lensA, lA);
    g.uniform4fv(u.u_lensB, lB);
    g.uniform1f(u.u_limit, 1.75 - 2.0 * ae);
    g.uniform1f(u.u_gain, state.gain);
    g.uniform1f(u.u_twinkle, opts.reduced ? 0 : 1);
    g.uniform4fv(u.u_iris, iris);
    g.uniform1f(u.u_sigma, Math.max(0.5 * (bw / W), 0.75));
    const aStar = g.getAttribLocation(star.p, 'a_star');
    g.enableVertexAttribArray(aStar);
    g.bindBuffer(g.ARRAY_BUFFER, starBuf);
    g.vertexAttribPointer(aStar, 4, g.FLOAT, false, 0, 0);
    g.drawArrays(g.POINTS, 0, drawCount);

    // satellite: one more "star", placed in sky coordinates from its screen position
    if (sat && !opts.reduced) {
      const k = (t - sat.t0) / sat.dur;
      if (k >= 1) sat = null;
      else {
        const x = sat.sx + sat.vx * (t - sat.t0) - poleX;
        const y = sat.sy + sat.vy * (t - sat.t0) - poleY;
        const fade = smooth(0, 0.06, k) * (1 - smooth(sat.fadeAt, sat.fadeAt + 0.05, k)) * (1 - smooth(0.94, 1, k));
        g.bindBuffer(g.ARRAY_BUFFER, satBuf);
        g.bufferData(g.ARRAY_BUFFER, new Float32Array([c * x + s * y, -s * x + c * y, sat.amp * fade + 0.0001, 0.5]), g.DYNAMIC_DRAW);
        g.vertexAttribPointer(aStar, 4, g.FLOAT, false, 0, 0);
        g.uniform1f(u.u_twinkle, 0.15);
        g.drawArrays(g.POINTS, 0, 1);
      }
    }
    g.disableVertexAttribArray(aStar);

    // meteor: a short streak, not lensed (it burns up in our own atmosphere)
    if (meteor && !opts.reduced) {
      const k = (t - meteor.t0) / meteor.dur;
      if (k >= 1) meteor = null;
      else {
        const e = 1 - Math.pow(1 - k, 1.6);
        const head = meteor.len * e;
        const tail = Math.max(0, head - meteor.len * 0.42);
        const hx = meteor.sx + meteor.dx * head;
        const hy = meteor.sy + meteor.dy * head;
        const tx = meteor.sx + meteor.dx * tail;
        const ty = meteor.sy + meteor.dy * tail;
        const px = -meteor.dy * 1.7;
        const py = meteor.dx * 1.7;
        const a = meteor.amp * smooth(0, 0.12, k) * (1 - smooth(0.55, 1, k)) * state.gain;
        // prettier-ignore
        const v = new Float32Array([
          tx - px, ty - py, 0, -1, a,
          tx + px, ty + py, 0, 1, a,
          hx - px, hy - py, 1, -1, a,
          hx - px, hy - py, 1, -1, a,
          tx + px, ty + py, 0, 1, a,
          hx + px, hy + py, 1, 1, a,
        ]);
        g.useProgram(streak.p);
        g.uniform2f(streak.u.u_view, W, H);
        g.bindBuffer(g.ARRAY_BUFFER, streakBuf);
        g.bufferData(g.ARRAY_BUFFER, v, g.DYNAMIC_DRAW);
        const ap = g.getAttribLocation(streak.p, 'a_p');
        const ai = g.getAttribLocation(streak.p, 'a_i');
        g.enableVertexAttribArray(ap);
        g.enableVertexAttribArray(ai);
        g.vertexAttribPointer(ap, 4, g.FLOAT, false, 20, 0);
        g.vertexAttribPointer(ai, 1, g.FLOAT, false, 20, 16);
        g.drawArrays(g.TRIANGLES, 0, 6);
        g.disableVertexAttribArray(ap);
        g.disableVertexAttribArray(ai);
      }
    }
  };

  const frame = (ms: number) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min((ms - last) / 1000, 1 / 24);
    last = ms;
    now = ms;
    const t = (ms - t0) / 1000;
    stepLenses(Math.max(dt, 0.001), t);
    events(t);
    draw(t);
    // long frames for a few seconds: draw fewer stars at a lower resolution
    if (dt > 0.026 && t > ADAPT + 1) slow++;
    else slow = Math.max(0, slow - 0.25);
    if (slow > 90 && quality === 1) {
      quality = 0.6;
      drawCount = Math.round(starCount * quality);
      size();
      if (import.meta.env?.DEV) console.info('[sky] long frames: drawing fewer stars');
    }
  };

  /* --------------------------------------------------------------- running, pausing */
  let covered = false;
  let hidden = false;
  const shouldRun = () => !opts.reduced && !document.hidden && !covered && !hidden && !g.isContextLost();
  function wake() {
    if (raf || !shouldRun()) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }
  const sleep = () => {
    cancelAnimationFrame(raf);
    raf = 0;
  };
  function checkCover() {
    const was = covered;
    covered = coverBoxes.some((b) => b.top - scrollYNow <= 0 && b.bottom - scrollYNow >= H);
    if (covered !== was) {
      if (covered) sleep();
      else wake();
    }
  }
  const onVis = () => (document.hidden ? sleep() : wake());

  let rt: number | undefined;
  const onResize = () => {
    clearTimeout(rt);
    rt = window.setTimeout(() => {
      size();
      if (opts.reduced) draw(0);
      measureBoxes();
      checkCover();
    }, 160);
  };
  const onLost = (e: Event) => {
    e.preventDefault();
    sleep();
  };
  const onRestored = () => {
    initGL();
    upload();
    if (opts.reduced) draw(0);
    else wake();
  };

  try {
    initGL();
    size(true);
  } catch (err) {
    if (import.meta.env?.DEV) console.error('[sky]', err);
    canvas.remove();
    return null;
  }

  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);
  addEventListener('resize', onResize);
  document.addEventListener('visibilitychange', onVis);
  if (!opts.reduced) {
    addEventListener('pointermove', onMove, { passive: true });
    addEventListener('pointerdown', onDown, { passive: true });
    addEventListener('pointerup', onUp, { passive: true });
    addEventListener('pointercancel', onUp, { passive: true });
    document.addEventListener('mouseout', onLeave);
    addEventListener('scroll', onScroll, { passive: true });
  }
  // the covers and live sections move when anything above them changes height (fonts, images, the editor)
  measureBoxes();
  const boxesRO = new ResizeObserver(() => {
    measureBoxes();
    checkCover();
  });
  boxesRO.observe(document.body);
  mount.classList.add('has-sky');
  t0 = performance.now();
  if (opts.reduced) draw(0);
  else wake();

  if (import.meta.env?.DEV)
    Object.assign(window, {
      __sky: {
        state,
        lensP,
        lensI,
        pointer,
        limits,
        count: () => starCount,
        glow: () => glowReady,
        // copy a CSS-px region of the sky at device resolution (draws a frame first, same task)
        snap: (x: number, y: number, w: number, h: number) => {
          draw((performance.now() - t0) / 1000);
          const k = canvas.width / W;
          const c2 = document.createElement('canvas');
          c2.width = Math.round(w * k);
          c2.height = Math.round(h * k);
          c2.getContext('2d')!.drawImage(canvas, x * k, y * k, w * k, h * k, 0, 0, c2.width, c2.height);
          return c2.toDataURL();
        },
      },
    });

  return {
    state,
    mode: 'webgl',
    canvas,
    limits,
    cover: (el) => {
      covers.push(el);
      measureBoxes();
      checkCover();
    },
    hide: (on) => {
      if (on === hidden) return;
      hidden = on;
      if (on) sleep();
      else wake();
    },
    destroy: () => {
      sleep();
      boxesRO.disconnect();
      cancelBand?.();
      removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVis);
      removeEventListener('pointermove', onMove);
      removeEventListener('pointerdown', onDown);
      removeEventListener('pointerup', onUp);
      removeEventListener('pointercancel', onUp);
      document.removeEventListener('mouseout', onLeave);
      removeEventListener('scroll', onScroll);
      canvas.remove();
    },
  };
}
