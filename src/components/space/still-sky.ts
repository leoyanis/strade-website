// The homepage's night sky (starfield.ts) as one still frame, built off the critical path, for page-sky.ts.
//
// Why its own module: page-sky.ts first used starfield.ts's createSky in its reduced (still) mode, which builds the sky
// in a few long tasks: the field stars, their sort and the shaders on start, then the band's stars, a sort of every
// star and the upload at the end. On a phone at 4x CPU that took /work's blocking time from 42 to 114 ms (perf harness,
// load pass, 2026-11-08). starfield.ts belongs to the homepage and stays as it is, so the parts of it a still frame
// needs are copied below, unchanged: the seed, the geometry, the density fields, the star generators, the shaders and
// the uniforms of its reduced draw, so it is the same sky. What changed is when the work runs: every loop yields
// often, a driver runs them in slices of at most 8 ms in idle time (requestIdleCallback, a timer where there is none,
// as in Safari), and the shaders compile and the frame draws in tasks of their own.
// Left out, because a still frame has no use for them: the twinkle, the lenses, meteors and satellites (all off or zero
// in the reduced draw), and the bright-first shuffle of the stars (order() in starfield.ts). That shuffle only decides
// which stars a lower quality level drops; blending is additive, so the order stars are drawn in does not change the
// picture.
// Keep in step with starfield.ts: a change to how its sky looks (the densities, the band, the shaders, the uniforms of
// draw()) has to be made here too.

export type StillSky = { canvas: HTMLCanvasElement; destroy: () => void };
type Limits = { panMin: number; panMax: number; shiftMax: number };
type Gen<T> = Generator<void, T, void>;

/* ================================================================== copied from starfield.ts, unchanged
   (the types, the noise, the geometry and density fields, the shaders and compile()) */

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

type Field = { data: Float32Array; count: number };

const TAU = Math.PI * 2;
const DRIFT = 0; // no slow turn of its own: the sky holds still (it read as odd); twinkle, lens and meteors stay

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

function geometry(W: number, H: number, lim: Limits): Geo {
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

const sectorArea = (g: Geo) => 0.5 * (g.a1 - g.a0) * (g.r1 * g.r1 - g.r0 * g.r0);

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

/* ------------------------------------------------------------------ the stars, in slices
   fieldStars and buildBand from starfield.ts as generators: the same arithmetic and the same order of random draws
   (a yield never sits between two draws of one star), so the same stars, built a slice at a time. */

function* fieldStars(g: Geo, seed: number, density: number): Gen<Field> {
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
    if ((i & 511) === 511) yield;
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

/** The Milky Way's grid, its glow texture and its stars (buildBand in starfield.ts, without the setTimeout slicing). */
function* buildBand(g: Geo, seed: number, size: number, density: number): Gen<{ stars: Field; tex: Uint8Array }> {
  const grid = new Float32Array(size * size);
  const sx = (g.box.x1 - g.box.x0) / (size - 1);
  const sy = (g.box.y1 - g.box.y0) / (size - 1);
  for (let row = 0; row < size; row++) {
    const y = g.box.y0 + row * sy;
    for (let c = 0; c < size; c++) grid[row * size + c] = bandDensity(g, g.box.x0 + c * sx, y);
    yield;
  }
  let max = 0;
  for (let i = 0; i < grid.length; i++) max = Math.max(max, grid[i]);
  max = max || 1;
  // sqrt-encoded for precision in the faint end; zero border because the texture clamps to its edge
  const tex = new Uint8Array(size * size);
  for (let r = 1; r < size - 1; r++) {
    for (let c = 1; c < size - 1; c++) tex[r * size + c] = Math.round(255 * Math.sqrt(clamp(grid[r * size + c] / max)));
    if ((r & 15) === 15) yield;
  }
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
    if ((i & 1023) === 1023) yield;
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
  return { stars: { data: out, count: k / 4 }, tex };
}

/* ------------------------------------------------------------------ running it in slices */

/** Runs `fn` in idle time, or on a timer after the next frame where there is no requestIdleCallback (Safari). It gets
 *  its slice's end on performance.now()'s clock: at most 8 ms, and at least 4 ms when idle time is short or the idle
 *  callback fired on its timeout, so the work always moves on. */
function whenIdle(fn: (end: number) => void) {
  const ric = (window as Window & { requestIdleCallback?: (cb: (d: { timeRemaining(): number }) => void, o?: { timeout: number }) => number }).requestIdleCallback;
  if (ric) ric((d) => fn(performance.now() + Math.max(4, Math.min(8, d.timeRemaining()))), { timeout: 500 });
  else requestAnimationFrame(() => setTimeout(() => fn(performance.now() + 8), 0));
}

/** Steps a generator in idle slices until it returns; cancel() stops it for good. A throw (a shader that does not
 *  compile) ends the run and goes to onError. */
function runSliced<T>(it: Gen<T>, done: (value: T) => void, onError?: (err: unknown) => void) {
  let cancelled = false;
  const slice = (end: number) => {
    if (cancelled) return;
    try {
      for (;;) {
        const r = it.next();
        if (r.done) return done(r.value);
        if (performance.now() >= end) break;
      }
    } catch (err) {
      onError?.(err);
      return;
    }
    whenIdle(slice);
  };
  whenIdle(slice);
  return () => {
    cancelled = true;
  };
}

/** One sky's worth of data: the field and band stars in one buffer (field first), and the glow texture. */
type SkyData = { geo: Geo; stars: Float32Array; count: number; tex: Uint8Array; texSize: number; W: number; H: number; small: boolean };

function* buildSky(W: number, H: number, small: boolean, seed: number): Gen<SkyData> {
  // createSky's measure(): the pan range a phone can turn through is shorter; the lift reaches three quarters down
  const limits: Limits = { panMin: small ? -0.22 : -0.5, panMax: 0.06, shiftMax: Math.round(H * 0.75) };
  const geo = geometry(W, H, limits);
  const field = yield* fieldStars(geo, seed, small ? 0.0068 : 0.0052);
  const texSize = small ? 224 : 320;
  const band = yield* buildBand(geo, seed, texSize, small ? 0.026 : 0.022);
  const count = field.count + band.stars.count;
  const stars = new Float32Array(count * 4);
  stars.set(field.data.subarray(0, field.count * 4), 0);
  stars.set(band.stars.data.subarray(0, band.stars.count * 4), field.count * 4);
  return { geo, stars, count, tex: band.tex, texSize, W, H, small };
}

/* ------------------------------------------------------------------ the still sky */

/**
 * Puts a canvas at the start of `mount` and, in idle slices, draws the homepage's sky on it as one still frame (the
 * frame starfield.ts's createSky draws with reduced: true). `onFrame` runs once the first whole frame is on the
 * canvas: page-sky.ts fades the canvas in then. Without WebGL it draws the same stars on a 2D canvas, as createSky does
 * (no glow). Returns null when there is no canvas context at all; `onFail` runs if the sky fails later (its shaders).
 */
export function createStillSky(mount: HTMLElement, opts: { seed?: number; onFrame?: () => void; onFail?: () => void } = {}): StillSky | null {
  const seed = opts.seed ?? 20261027;
  const canvas = document.createElement('canvas');
  canvas.className = 'ssi-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  mount.prepend(canvas);
  const phone = () => Math.min(innerWidth, innerHeight) < 600;
  const measure = () => ({ W: Math.max(1, canvas.clientWidth || innerWidth), H: Math.max(1, canvas.clientHeight || innerHeight) });
  const dprFor = () => Math.min(devicePixelRatio || 1, phone() ? 1.5 : 2);

  let gl: WebGLRenderingContext | null = null;
  try {
    gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, powerPreference: 'default' });
  } catch {
    gl = null;
  }
  let data: SkyData | null = null;
  let cancel: (() => void) | null = null;
  let framed = false;
  const firstFrame = () => {
    if (framed) return;
    framed = true;
    opts.onFrame?.();
  };

  /* --------------------------------------------------------------- 2D: createSky's fallback, painted in slices */
  if (!gl) {
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      canvas.remove();
      return null;
    }
    // painted on a canvas off the page, a slice at a time, and copied over in one go: a repaint after a resize never
    // shows half a sky
    function* paint2d(d: SkyData, dpr: number): Gen<HTMLCanvasElement> {
      const off = document.createElement('canvas');
      off.width = Math.round(d.W * dpr);
      off.height = Math.round(d.H * dpr);
      const c2 = off.getContext('2d')!;
      c2.setTransform(dpr, 0, 0, dpr, 0, 0);
      c2.fillStyle = '#000';
      c2.fillRect(0, 0, d.W, d.H);
      c2.fillStyle = '#fff';
      for (let i = 0; i < d.count; i++) {
        if ((i & 1023) === 1023) yield;
        const x = d.stars[i * 4] + d.geo.pole.x;
        const y = d.stars[i * 4 + 1] + d.geo.pole.y;
        if (x < -4 || y < -4 || x > d.W + 4 || y > d.H + 4) continue;
        const p = d.stars[i * 4 + 2];
        c2.globalAlpha = Math.min(1, p);
        c2.beginPath();
        c2.arc(x, y, p > 1 ? 1.1 + (p - 1) * 0.6 : 0.55 + p * 0.45, 0, TAU);
        c2.fill();
      }
      return off;
    }
    const start2d = () => {
      cancel?.();
      const { W, H } = measure();
      const small = phone();
      const dpr = dprFor();
      cancel = runSliced(buildSky(W, H, small, seed), (d) => {
        data = d;
        cancel = runSliced(paint2d(d, dpr), (off) => {
          canvas.width = off.width;
          canvas.height = off.height;
          ctx.drawImage(off, 0, 0);
          firstFrame();
        });
      });
    };
    start2d();
    let t2: number | undefined;
    const onResize2d = () => {
      clearTimeout(t2);
      t2 = window.setTimeout(start2d, 200);
    };
    addEventListener('resize', onResize2d);
    return {
      canvas,
      destroy: () => {
        cancel?.();
        removeEventListener('resize', onResize2d);
        canvas.remove();
      },
    };
  }

  /* --------------------------------------------------------------- WebGL: the reduced draw of createSky */
  const g = gl;
  let star: ReturnType<typeof compile> | null = null;
  let glow: ReturnType<typeof compile> | null = null;
  let starBuf: WebGLBuffer | null = null;
  let quadBuf: WebGLBuffer | null = null;
  let tex: WebGLTexture | null = null;
  let uploaded = false;

  // the two programs, each in a task of its own (compiling is the one step that cannot be sliced)
  function* initGL(): Gen<void> {
    star = compile(g, STAR_VS, STAR_FS);
    yield;
    glow = compile(g, QUAD_VS, GLOW_FS);
    starBuf = g.createBuffer();
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
    uploaded = false;
  }

  const upload = (d: SkyData) => {
    g.bindBuffer(g.ARRAY_BUFFER, starBuf);
    g.bufferData(g.ARRAY_BUFFER, d.stars, g.STATIC_DRAW);
    g.bindTexture(g.TEXTURE_2D, tex);
    g.texImage2D(g.TEXTURE_2D, 0, g.LUMINANCE, d.texSize, d.texSize, 0, g.LUMINANCE, g.UNSIGNED_BYTE, d.tex);
    uploaded = true;
  };

  /** createSky's draw(0) under reduced: true, minus what is off there (lenses at zero strength, no iris, no twinkle,
   *  no satellite or meteor). The canvas is sized here, in the same task, so a resize never shows an empty buffer. */
  const draw = (d: SkyData) => {
    if (g.isContextLost() || !star || !glow) return;
    if (!uploaded) upload(d);
    const { W, H } = measure();
    const dpr = dprFor();
    const bw = Math.round(W * dpr);
    const bh = Math.round(H * dpr);
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    g.viewport(0, 0, bw, bh);
    g.clearColor(0, 0, 0, 1);
    g.clear(g.COLOR_BUFFER_BIT);
    const geo = d.geo;
    const off = [0, 0, 0, 0];
    const iris = [0, 0, 0, 1];
    // glow: the Milky Way and the faint airglow, which fades as the page scrolls (read live, as the reduced draw does)
    g.disable(g.BLEND);
    g.useProgram(glow.p);
    g.bindBuffer(g.ARRAY_BUFFER, quadBuf);
    const loc = g.getAttribLocation(glow.p, 'a_xy');
    g.enableVertexAttribArray(loc);
    g.vertexAttribPointer(loc, 2, g.FLOAT, false, 0, 0);
    g.activeTexture(g.TEXTURE0);
    g.bindTexture(g.TEXTURE_2D, tex);
    let u = glow.u;
    const bx = geo.box;
    g.uniform1i(u.u_tex, 0);
    g.uniform2f(u.u_view, W, H);
    g.uniform2f(u.u_buf, bw, bh);
    g.uniform2f(u.u_pole, geo.pole.x, geo.pole.y);
    g.uniform2f(u.u_rot, 1, 0);
    g.uniform4f(u.u_box, bx.x0, bx.y0, 1 / (bx.x1 - bx.x0), 1 / (bx.y1 - bx.y0));
    g.uniform4fv(u.u_lensA, off);
    g.uniform4fv(u.u_lensB, off);
    g.uniform1f(u.u_glow, 0.135);
    g.uniform1f(u.u_gain, 1);
    g.uniform1f(u.u_air, 0.03 * Math.max(0, 1 - window.scrollY / (H * 0.8)));
    g.uniform4fv(u.u_iris, iris);
    g.drawArrays(g.TRIANGLES, 0, 3);
    g.disableVertexAttribArray(loc);
    // stars, added on top
    g.enable(g.BLEND);
    g.blendFunc(g.ONE, g.ONE);
    g.useProgram(star.p);
    u = star.u;
    g.uniform2f(u.u_view, W, H);
    g.uniform1f(u.u_dpr, bw / W);
    g.uniform2f(u.u_pole, geo.pole.x, geo.pole.y);
    g.uniform2f(u.u_rot, 1, 0);
    g.uniform1f(u.u_time, 0);
    g.uniform4fv(u.u_lensA, off);
    g.uniform4fv(u.u_lensB, off);
    g.uniform1f(u.u_limit, -0.25);
    g.uniform1f(u.u_gain, 1);
    g.uniform1f(u.u_twinkle, 0);
    g.uniform4fv(u.u_iris, iris);
    g.uniform1f(u.u_sigma, Math.max(0.5 * (bw / W), 0.75));
    const aStar = g.getAttribLocation(star.p, 'a_star');
    g.enableVertexAttribArray(aStar);
    g.bindBuffer(g.ARRAY_BUFFER, starBuf);
    g.vertexAttribPointer(aStar, 4, g.FLOAT, false, 0, 0);
    g.drawArrays(g.POINTS, 0, d.count);
    g.disableVertexAttribArray(aStar);
  };

  // the stars for the current size, then the frame in a task of its own
  let genW = 0;
  let genH = 0;
  const generate = () => {
    cancel?.();
    const { W, H } = measure();
    genW = W;
    genH = H;
    cancel = runSliced(buildSky(W, H, phone(), seed), (d) => {
      data = d;
      uploaded = false;
      whenIdle(() => {
        draw(d);
        firstFrame();
      });
    });
  };

  // the shaders first, in their own slices: if they fail, the canvas goes and the page keeps its plain background
  const fail = (err: unknown) => {
    if (import.meta.env?.DEV) console.error('[still sky]', err);
    cancel?.();
    canvas.remove();
    opts.onFail?.();
  };
  cancel = runSliced(initGL(), generate, fail);

  // a resize redraws, as the reduced sky does; only a real change of layout (not a phone's toolbar) makes new stars
  let rt: number | undefined;
  const onResize = () => {
    clearTimeout(rt);
    rt = window.setTimeout(() => {
      if (!data || !star) return;
      const { W, H } = measure();
      if (W !== genW || Math.abs(H - genH) > genH * 0.2) generate();
      else draw(data);
    }, 160);
  };
  const onLost = (e: Event) => e.preventDefault();
  const onRestored = () => {
    cancel = runSliced(
      initGL(),
      () => {
        if (data) draw(data);
      },
      fail,
    );
  };
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);
  addEventListener('resize', onResize);

  return {
    canvas,
    destroy: () => {
      cancel?.();
      clearTimeout(rt);
      removeEventListener('resize', onResize);
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      canvas.remove();
    },
  };
}
