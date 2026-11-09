// The Star Car's headlight, as a parametric model. Used by the headlight lab (/vision/ssi/headlight,
// hl-lab.ts) and by the landing page's "lights in the dark" beat (mob-light.ts).
// Built like a real lamp, front to back: a clear outer lens; a housing in smoked black that steps down in
// terraces (a chrome hairline on every step) to the signature: a symmetric, concave-sided four-point star
// drawn by light-guide strips in chrome channels (one to three nested layers), fed from LED blocks at its
// waist. Inside the star, stepped chrome reflector cups fall towards the projector(s): stepped chrome
// bezel, glass lens, reflector bowl, cut-off shield, LED, ringed by micro LEDs.
// Light: every lit part also lights what is near it ("spill", added in the shaders below), so the
// housing's layers show up round the light the way they do in a real lamp at night.
// Unit space: x right, y up, z towards the viewer; the housing's rim sits at z = 0. Metres.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/* ------------------------------------------------------------------ parameters */
export type HlParams = {
  // star
  starSize: number;
  concavity: number;
  armLength: number;
  tipBlunt: number;
  stripThickness: number;
  stripLayers: number;
  // projector
  projCount: number;
  projSize: number;
  projX: number;
  projY: number;
  projSpacing: number;
  // housing
  width: number;
  height: number;
  depth: number;
  roundness: number;
  starHousing: number;
  starMargin: number;
  steps: number;
  smoke: number;
  chrome: number;
  // lens
  clarity: number;
  outerLens: boolean;
  // lights
  lights: number;
  drl: number;
  projector: number;
  glare: number;
};
export const HL_DEFAULTS: HlParams = {
  starSize: 0.128,
  concavity: 0.45,
  armLength: 1,
  tipBlunt: 0.05,
  stripThickness: 1,
  stripLayers: 1,
  projCount: 1,
  projSize: 0.0249,
  projX: 0,
  projY: 0,
  projSpacing: 0.07,
  width: 0.155,
  height: 0.155,
  depth: 1,
  roundness: 4.2,
  starHousing: 0,
  starMargin: 1.35,
  steps: 4,
  smoke: 0.3,
  chrome: 1,
  clarity: 0.85,
  outerLens: true,
  lights: 1,
  drl: 1,
  projector: 1,
  glare: 1,
};
/** The lab's sliders. `live`: applied without rebuilding the geometry. */
export const HL_SCHEMA: { folder: string; key: keyof HlParams; label: string; min?: number; max?: number; step?: number; live?: boolean }[] = [
  { folder: 'Lights', key: 'lights', label: 'Off → on', min: 0, max: 1, step: 0.001, live: true },
  { folder: 'Lights', key: 'drl', label: 'Edge light (DRL)', min: 0, max: 3, step: 0.01, live: true },
  { folder: 'Lights', key: 'projector', label: 'Main beam', min: 0, max: 3, step: 0.01, live: true },
  { folder: 'Lights', key: 'glare', label: 'Glare', min: 0, max: 2, step: 0.01, live: true },
  { folder: 'Star', key: 'starSize', label: 'Size (m)', min: 0.07, max: 0.2, step: 0.001 },
  { folder: 'Star', key: 'concavity', label: 'Concavity', min: 0, max: 1, step: 0.01 },
  { folder: 'Star', key: 'armLength', label: 'Arm length', min: 0.7, max: 1.4, step: 0.01 },
  { folder: 'Star', key: 'tipBlunt', label: 'Tip bluntness', min: 0, max: 0.16, step: 0.005 },
  { folder: 'Star', key: 'stripThickness', label: 'Strip thickness', min: 0.4, max: 2.5, step: 0.05 },
  { folder: 'Star', key: 'stripLayers', label: 'Strip layers', min: 1, max: 3, step: 1 },
  { folder: 'Projector', key: 'projCount', label: 'Count', min: 1, max: 3, step: 1 },
  { folder: 'Projector', key: 'projSize', label: 'Lens radius (m)', min: 0.012, max: 0.042, step: 0.0005 },
  { folder: 'Projector', key: 'projX', label: 'Position x', min: -0.08, max: 0.08, step: 0.001 },
  { folder: 'Projector', key: 'projY', label: 'Position y', min: -0.08, max: 0.08, step: 0.001 },
  { folder: 'Projector', key: 'projSpacing', label: 'Spacing', min: 0.03, max: 0.14, step: 0.001 },
  { folder: 'Housing', key: 'width', label: 'Half width (m)', min: 0.1, max: 0.32, step: 0.001 },
  { folder: 'Housing', key: 'height', label: 'Half height (m)', min: 0.1, max: 0.26, step: 0.001 },
  { folder: 'Housing', key: 'depth', label: 'Depth', min: 0.5, max: 2.2, step: 0.01 },
  { folder: 'Housing', key: 'roundness', label: 'Corner shape', min: 2, max: 8, step: 0.1 },
  { folder: 'Housing', key: 'starHousing', label: 'Round → star shape', min: 0, max: 1, step: 0.01 },
  { folder: 'Housing', key: 'starMargin', label: 'Star unit size', min: 1.08, max: 2, step: 0.01 },
  { folder: 'Housing', key: 'steps', label: 'Steps', min: 1, max: 6, step: 1 },
  { folder: 'Housing', key: 'smoke', label: 'Smoke tint', min: 0, max: 1, step: 0.01, live: true },
  { folder: 'Housing', key: 'chrome', label: 'Chrome amount', min: 0, max: 1.6, step: 0.01, live: true },
  { folder: 'Lens', key: 'clarity', label: 'Clarity', min: 0, max: 1, step: 0.01, live: true },
  { folder: 'Lens', key: 'outerLens', label: 'Outer lens', live: true },
];

const NSEG = 8; // strips per layer (half sides: waist → tip)
const NPS = 6; // spill samples along each strip
const GAP = 0.0026; // half the feed block's length along the outline
const LAYER_SCALE = [1, 0.8, 0.62];
const LENS0 = 0.0249; // the projector parts are drawn for this lens radius, then scaled
const RIM = 0.0125; // star housing: its outline runs this far outside the edge light (also its tip radius)

type Spec = {
  R: number;
  arm: number;
  SH: number;
  SK: number;
  Hx: number;
  Hy: number;
  n: number;
  hs: number; // 0 = rounded-square housing, 1 = housing follows the star
  hm: number; // star housing size relative to the star
  kD: number; // the edge light (DRL) star's scale: 1 on the round housing, out to the star housing's rim at hs = 1
  zD: number; // the level the DRL channel sits at (shallower on the star housing, so the edge reads)
  PH?: Polar; // the star housing's outline (metres)
  RB: number;
  layers: number;
  steps: number;
  strip: number;
  proj: { x: number; y: number; r: number }[];
};
function spec(p: HlParams): Spec {
  const count = Math.round(Math.min(3, Math.max(1, p.projCount)));
  const r = p.projSize;
  const proj: Spec['proj'] = [];
  if (count === 1) proj.push({ x: p.projX, y: p.projY, r });
  else if (count === 2) for (const s of [-0.5, 0.5]) proj.push({ x: p.projX + s * p.projSpacing, y: p.projY, r: r * 0.85 });
  else {
    proj.push({ x: p.projX, y: p.projY, r });
    for (const s of [-1, 1]) proj.push({ x: p.projX + s * p.projSpacing, y: p.projY, r: r * 0.62 });
  }
  return {
    R: p.starSize,
    arm: p.armLength,
    SH: 0.55 - 0.33 * p.concavity,
    SK: p.tipBlunt,
    Hx: p.width,
    Hy: p.height,
    n: p.roundness,
    hs: Math.min(1, Math.max(0, p.starHousing ?? 0)),
    hm: p.starMargin ?? 1.35,
    kD: 1 + ((p.starMargin ?? 1.35) - 1) * Math.min(1, Math.max(0, p.starHousing ?? 0)),
    zD: -0.03 + 0.017 * Math.min(1, Math.max(0, p.starHousing ?? 0)),
    // the reflector floors start at the centre projector's barrel (or almost at the centre when there is none)
    RB: count === 2 ? 0.004 : (proj[0].r / LENS0) * 0.0352,
    layers: Math.round(Math.min(3, Math.max(1, p.stripLayers))),
    steps: Math.round(Math.min(6, Math.max(1, p.steps))),
    strip: p.stripThickness,
    proj,
  };
}

/* ------------------------------------------------------------------ the star */
const CQ = [1, 0, -1, 0];
const SQ = [0, 1, 0, -1];
/** A point on side q of the star (from tip q to tip q+1; tips at 0°, 90°, 180°, 270°), in star units. */
function starPt(S: Spec, q: number, t: number, out = new THREE.Vector2()) {
  const s = 1 - t;
  const b0 = s * s * s;
  const b1 = 3 * s * s * t;
  const b2 = 3 * s * t * t;
  const b3 = t * t * t;
  const x = b0 * S.arm + b1 * S.SH + b2 * S.SK;
  const y = b1 * S.SK + b2 * S.SH + b3 * S.arm;
  const c = CQ[q & 3];
  const n = SQ[q & 3];
  return out.set(x * c - y * n, x * n + y * c);
}

/** The outline as a polar table (it is star-shaped round its centre): angle → radius (star units). */
function polar(S: Spec) {
  const M = 1400;
  const th: number[] = [];
  const r: number[] = [];
  const p = new THREE.Vector2();
  for (let q = 0; q < 4; q++)
    for (let i = 0; i < M; i++) {
      starPt(S, q, i / M, p);
      let a = Math.atan2(p.y, p.x);
      if (a < 0) a += Math.PI * 2;
      if (q === 0 && i === 0) a = 0;
      // keep it monotonic even for odd settings
      if (th.length && a < th[th.length - 1]) a = th[th.length - 1] + 1e-7;
      th.push(a);
      r.push(p.length());
    }
  th.push(Math.PI * 2);
  r.push(S.arm);
  return { th, r };
}
type Polar = ReturnType<typeof polar>;
function rAt(P: Polar, a: number) {
  const { th, r } = P;
  let lo = 0;
  let hi = th.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (th[m] <= a) lo = m;
    else hi = m;
  }
  const k = (a - th[lo]) / Math.max(1e-12, th[hi] - th[lo]);
  return r[lo] + (r[hi] - r[lo]) * k;
}
const rRound = (S: Spec, a: number) =>
  1 / Math.pow(Math.pow(Math.abs(Math.cos(a)) / S.Hx, S.n) + Math.pow(Math.abs(Math.sin(a)) / S.Hy, S.n), 1 / S.n);
/**
 * The star housing's outline: the star at the unit's size (R·hm), pushed out by RIM along its normals, so
 * the sides stay parallel to the edge light and every tip ends in a round of radius RIM (the rim's lip and
 * bead, which sit up to ~5 mm inside it, never pinch). As a polar table, metres.
 */
function housingPolar(S: Spec): Polar {
  const M = 1400;
  const sc = S.R * S.hm;
  const pts: THREE.Vector2[] = [];
  const nrm: THREE.Vector2[] = [];
  const a = new THREE.Vector2();
  const b = new THREE.Vector2();
  const side = (q: number) => {
    const P: THREE.Vector2[] = [];
    const N: THREE.Vector2[] = [];
    for (let i = 0; i <= M; i++) {
      const t = i / M;
      starPt(S, q, Math.max(0, t - 1e-4), a);
      starPt(S, q, Math.min(1, t + 1e-4), b);
      const tg = b.sub(a);
      // outward normal of the counter-clockwise outline
      N.push(new THREE.Vector2(tg.y, -tg.x).normalize());
      P.push(starPt(S, q, t).multiplyScalar(sc));
    }
    return { P, N };
  };
  const sides = [0, 1, 2, 3].map(side);
  for (let q = 0; q < 4; q++) {
    const { P, N } = sides[q];
    // round the tip this side starts at: an arc from the previous side's end normal to this side's start normal
    const prev = sides[(q + 3) % 4].N[M];
    let a0 = Math.atan2(prev.y, prev.x);
    let a1 = Math.atan2(N[0].y, N[0].x);
    while (a1 < a0) a1 += Math.PI * 2;
    if (a1 - a0 > Math.PI) a1 = a0; // (a blunt tip: nothing to round)
    const K = 24;
    for (let k = 1; k < K; k++) {
      const f = a0 + ((a1 - a0) * k) / K;
      pts.push(P[0].clone());
      nrm.push(new THREE.Vector2(Math.cos(f), Math.sin(f)));
    }
    for (let i = 0; i < M; i++) {
      pts.push(P[i]);
      nrm.push(N[i]);
    }
  }
  const raw = pts.map((p, i) => {
    const x = p.x + nrm[i].x * RIM;
    const y = p.y + nrm[i].y * RIM;
    let an = Math.atan2(y, x);
    if (an < 0) an += Math.PI * 2;
    return { an, r: Math.hypot(x, y) };
  });
  // start the table at angle 0 and keep it monotonic
  let i0 = 0;
  for (let i = 1; i < raw.length; i++) if (raw[i].an < raw[i0].an) i0 = i;
  const th: number[] = [];
  const r: number[] = [];
  for (let k = 0; k < raw.length; k++) {
    const e = raw[(i0 + k) % raw.length];
    let an = e.an;
    if (k > 0 && an < th[th.length - 1] - Math.PI) an += Math.PI * 2;
    if (th.length && an <= th[th.length - 1]) continue;
    th.push(an);
    r.push(e.r);
  }
  // close the table at 0 and 2π
  const rEnd = r[r.length - 1];
  const rStart = r[0];
  const tEnd = th[th.length - 1];
  const tStart = th[0];
  const r0 = rEnd + ((rStart - rEnd) * (Math.PI * 2 - tEnd)) / (Math.PI * 2 - tEnd + tStart);
  if (tStart > 0) {
    th.unshift(0);
    r.unshift(r0);
  }
  th.push(Math.PI * 2);
  r.push(r0);
  return { th, r };
}
/** The housing outline: the rounded square, morphed towards the star housing (`hs`). */
function rHousing(S: Spec, a: number) {
  const round = rRound(S, a);
  if (S.hs <= 0) return round;
  S.PH ??= housingPolar(S);
  let w = a % (Math.PI * 2);
  if (w < 0) w += Math.PI * 2;
  const star = rAt(S.PH, w);
  return round + (star - round) * S.hs;
}

/** The angles every ring is sampled at: evenly along the star's outline (dense at the needle tips) plus an even sweep. */
function angles(P: Polar, nArc: number, nEven: number) {
  const { th, r } = P;
  const len = [0];
  for (let i = 1; i < th.length; i++) {
    const ax = Math.cos(th[i - 1]) * r[i - 1];
    const ay = Math.sin(th[i - 1]) * r[i - 1];
    const bx = Math.cos(th[i]) * r[i];
    const by = Math.sin(th[i]) * r[i];
    len.push(len[i - 1] + Math.hypot(bx - ax, by - ay));
  }
  const total = len[len.length - 1];
  const out: number[] = [];
  let j = 0;
  for (let k = 0; k < nArc; k++) {
    const L = (k / nArc) * total;
    while (j < len.length - 2 && len[j + 1] < L) j++;
    const f = (L - len[j]) / Math.max(1e-12, len[j + 1] - len[j]);
    out.push(th[j] + (th[j + 1] - th[j]) * f);
  }
  for (let k = 0; k < nEven; k++) out.push((k / nEven) * Math.PI * 2);
  out.sort((a, b) => a - b);
  const dedup = [out[0]];
  for (const a of out) if (a - dedup[dedup.length - 1] > 2e-5) dedup.push(a);
  if (Math.PI * 2 - dedup[dedup.length - 1] < 2e-5) dedup.pop();
  return dedup;
}

/* ------------------------------------------------------------------ rings between the star and the housing */
type Row = { t: number; dr?: number; z: number; c?: boolean };
type Rings = { th: number[]; rs: number[]; rq: number[]; RB: number; hs: number };
/**
 * A strip swept all the way round, through the profile `rows` (listed from the inside out).
 * 'out': between the star (t = 0) and the housing outline (t = 1); 'in': between the projector barrel
 * (t = 0) and the star (t = 1). dr is a radial offset in metres. Normals face the viewer on flats and the
 * centre on risers. On the star housing ('out', hs > 0) dr runs along the ring's own normal instead of
 * the radius, so offsets stay parallel to the star's concave sides; c: collapse the row to the centre.
 */
function strip(g: Rings, rows: Row[], mode: 'out' | 'in') {
  const N = g.th.length;
  const pos = new Float32Array(N * rows.length * 3);
  const hs = mode === 'out' ? g.hs : 0;
  const base = new Float32Array(N);
  for (let j = 0; j < rows.length; j++) {
    const { t, dr = 0, z, c } = rows[j];
    for (let i = 0; i < N; i++) {
      const a = mode === 'out' ? g.rs[i] : g.RB;
      const b = mode === 'out' ? g.rq[i] : g.rs[i];
      base[i] = a + (b - a) * t;
    }
    for (let i = 0; i < N; i++) {
      const k = (j * N + i) * 3;
      pos[k + 2] = z;
      if (c) {
        pos[k] = 0;
        pos[k + 1] = 0;
        continue;
      }
      const cs = Math.cos(g.th[i]);
      const sn = Math.sin(g.th[i]);
      if (hs <= 0) {
        const rad = Math.max(0, base[i] + dr);
        pos[k] = cs * rad;
        pos[k + 1] = sn * rad;
        continue;
      }
      const i0 = (i + N - 1) % N;
      const i1 = (i + 1) % N;
      const tx = Math.cos(g.th[i1]) * base[i1] - Math.cos(g.th[i0]) * base[i0];
      const ty = Math.sin(g.th[i1]) * base[i1] - Math.sin(g.th[i0]) * base[i0];
      const tl = Math.hypot(tx, ty) || 1;
      let dx = cs * (1 - hs) + (ty / tl) * hs;
      let dy = sn * (1 - hs) - (tx / tl) * hs;
      const dl = Math.hypot(dx, dy) || 1;
      dx /= dl;
      dy /= dl;
      pos[k] = cs * base[i] + dx * dr;
      pos[k + 1] = sn * base[i] + dy * dr;
    }
  }
  const idx: number[] = [];
  for (let j = 0; j < rows.length - 1; j++)
    for (let i = 0; i < N; i++) {
      const i2 = (i + 1) % N;
      const a = j * N + i;
      const b = j * N + i2;
      const c = (j + 1) * N + i2;
      const d = (j + 1) * N + i;
      idx.push(a, d, b, b, d, c);
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}
/** A rounded step edge: from a riser's top (at radius t+dr, height z - b) round to the terrace above. */
function bevel(t: number, dr: number, z: number, b: number, n = 5): Row[] {
  const rows: Row[] = [];
  for (let i = 0; i <= n; i++) {
    const f = Math.PI - (i / n) * (Math.PI / 2);
    rows.push({ t, dr: dr + b + Math.cos(f) * b, z: z - b + Math.sin(f) * b });
  }
  return rows;
}

/* ------------------------------------------------------------------ strips along a path (the light guides) */
/** A tube through `pts` with a superellipse section; aG = (strip id, s along it). */
export function tube(pts: THREE.Vector3[], half: (s: number) => [number, number], seg: number, segId: number, n = 3) {
  const M = pts.length;
  const pos: number[] = [];
  const g: number[] = [];
  const Z = new THREE.Vector3(0, 0, 1);
  const T = new THREE.Vector3();
  const A = new THREE.Vector3();
  const B = new THREE.Vector3();
  const e = 2 / n;
  for (let i = 0; i < M; i++) {
    const s = i / (M - 1);
    T.subVectors(pts[Math.min(M - 1, i + 1)], pts[Math.max(0, i - 1)]).normalize();
    A.crossVectors(Z, T).normalize();
    B.crossVectors(T, A).normalize();
    const [ha, hb] = half(s);
    for (let j = 0; j < seg; j++) {
      const f = (j / seg) * Math.PI * 2;
      const c = Math.cos(f);
      const sn = Math.sin(f);
      const x = Math.sign(c) * Math.pow(Math.abs(c), e) * ha;
      const y = Math.sign(sn) * Math.pow(Math.abs(sn), e) * hb;
      pos.push(pts[i].x + A.x * x + B.x * y, pts[i].y + A.y * x + B.y * y, pts[i].z + A.z * x + B.z * y);
      g.push(segId, s);
    }
  }
  const idx: number[] = [];
  for (let i = 0; i < M - 1; i++)
    for (let j = 0; j < seg; j++) {
      const j2 = (j + 1) % seg;
      const a = i * seg + j;
      const b = (i + 1) * seg + j;
      const c = (i + 1) * seg + j2;
      const d = i * seg + j2;
      idx.push(a, d, b, b, d, c);
    }
  for (const [ri, start] of [
    [0, true],
    [M - 1, false],
  ] as [number, boolean][]) {
    const ci = pos.length / 3;
    pos.push(pts[ri].x, pts[ri].y, pts[ri].z);
    g.push(segId, ri === 0 ? 0 : 1);
    for (let j = 0; j < seg; j++) {
      const a = ri * seg + j;
      const b = ri * seg + ((j + 1) % seg);
      if (start) idx.push(ci, b, a);
      else idx.push(ci, a, b);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aG', new THREE.Float32BufferAttribute(g, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/** The eight half sides of the outline at scale k (from the waist out to a tip), evenly spaced points, metres. */
function halfSides(S: Spec, k: number, M: number) {
  const out: { pts: THREE.Vector2[]; tip: number }[] = [];
  const D = 2000;
  const p = new THREE.Vector2();
  const sc = S.R * S.kD * k;
  for (let q = 0; q < 4; q++) {
    const xs: THREE.Vector2[] = [];
    const L = [0];
    for (let i = 0; i <= D; i++) {
      xs.push(starPt(S, q, i / D).multiplyScalar(sc));
      if (i) L.push(L[i - 1] + xs[i].distanceTo(xs[i - 1]));
    }
    const mid = D / 2;
    const at = (len: number) => {
      let lo = 0;
      let hi = D;
      while (hi - lo > 1) {
        const m = (lo + hi) >> 1;
        if (L[m] <= len) lo = m;
        else hi = m;
      }
      const f = (len - L[lo]) / Math.max(1e-12, L[hi] - L[lo]);
      return p.copy(xs[lo]).lerp(xs[hi], f).clone();
    };
    for (const h of [0, 1]) {
      // h = 0 runs from the waist back to tip q, h = 1 on to tip q+1
      const a = L[mid] + (h ? GAP : -GAP);
      const b = h ? L[D] - 0.0004 : 0.0004;
      const pts: THREE.Vector2[] = [];
      for (let j = 0; j < M; j++) pts.push(at(a + (b - a) * (j / (M - 1))));
      out.push({ pts, tip: h ? (q + 1) % 4 : q });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ materials */
const spillPars = (nsl: number, npj: number) => /* glsl */ `
#define NSL ${nsl}
#define NPS ${NPS}
#define NPJ ${npj}
uniform vec4 uP[NSL * NPS + NPJ];
uniform float uSpillK;
uniform float uAmb;
varying vec3 vLp;
varying vec3 vLn;
vec3 lampSpill() {
  vec3 n = normalize(vLn);
  if (!gl_FrontFacing) n = -n;
  float acc = 0.0;
  for (int s = 0; s < NSL; s++) {
    for (int i = 0; i < NPS - 1; i++) {
      vec4 a = uP[s * NPS + i];
      vec4 b = uP[s * NPS + i + 1];
      if (a.w + b.w < 1e-4) continue;
      vec3 ab = b.xyz - a.xyz;
      float h = clamp(dot(vLp - a.xyz, ab) / max(dot(ab, ab), 1e-12), 0.0, 1.0);
      vec3 d = a.xyz + ab * h - vLp;
      float d2 = dot(d, d);
      float ndl = 0.25 + 0.75 * max(dot(n, d) * inversesqrt(d2 + 1e-10), 0.0);
      acc = max(acc, mix(a.w, b.w, h) * ndl * 4.9e-5 / (d2 + 4.9e-5));
    }
  }
  float pl = 0.0;
  for (int j = 0; j < NPJ; j++) {
    vec4 pj = uP[NSL * NPS + j];
    vec3 dp = pj.xyz - vLp;
    float dp2 = dot(dp, dp);
    pl += pj.w * (0.2 + 0.8 * max(dot(n, dp) * inversesqrt(dp2 + 1e-10), 0.0)) * 2.4e-4 / (dp2 + 2.4e-4);
  }
  float amb = uAmb * 0.05 * exp(-dot(vLp.xy, vLp.xy) * 40.0);
  return vec3(0.92, 0.96, 1.0) * (acc + pl + amb) * uSpillK;
}`;

export type Uni = Record<string, THREE.IUniform>;
/** A fresh set of the uniforms the lamp's shaders read (spill samples, strip states). */
export function lampUniforms(layers = 1, npj = 1): Uni {
  return {
    uP: { value: Array.from({ length: layers * NSEG * NPS + npj }, () => new THREE.Vector4()) },
    uAmb: { value: 0 },
    uSeg: { value: Array.from({ length: layers * NSEG }, () => new THREE.Vector4()) },
    uDrl: { value: 1 },
    uNsl: { value: layers * NSEG },
  };
}
/** Physical material + the lamp's light spill (and optional extra emission code). */
export function lampMat(
  p: THREE.MeshPhysicalMaterialParameters,
  u: Uni,
  spillK: number,
  extra?: { pars: string; code: string; vert?: [string, string] },
  own: Uni = {},
) {
  const m = new THREE.MeshPhysicalMaterial(p);
  const nsl = (u.uSeg.value as unknown[]).length;
  const npj = (u.uP.value as unknown[]).length - nsl * NPS;
  const mine = { uSpillK: { value: spillK }, ...own };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u, mine);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vLp;\nvarying vec3 vLn;\n${extra?.vert?.[0] ?? ''}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvLp = transformed;\nvLn = objectNormal;\n${extra?.vert?.[1] ?? ''}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${spillPars(nsl, npj)}\n${extra?.pars ?? ''}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\ntotalEmissiveRadiance += lampSpill();\n${extra?.code ?? ''}`);
  };
  m.customProgramCacheKey = () => `hl-${nsl}-${npj}-${extra ? extra.pars.length + ':' + extra.code.length : 0}`;
  m.userData.mine = mine;
  return m;
}

export const GUIDE_PARS = /* glsl */ `
uniform vec4 uSeg[NSL];
uniform float uDrl;
varying vec2 vG;`;
export const GUIDE_CODE = /* glsl */ `
{
  int si = int(vG.x + 0.5);
  vec4 sg = uSeg[si];
  float s = vG.y;
  float lit = 1.0 - smoothstep(sg.x - 0.05, sg.x, s);
  float hd = (sg.x - 0.035 - s) / 0.06;
  float head = sg.z * exp(-hd * hd);
  float tg = (1.0 - s) / 0.05;
  float tipGlint = 0.55 * exp(-tg * tg);
  vec3 V = normalize(vViewPosition);
  float facing = 0.5 + 0.5 * max(dot(normal, V), 0.0);
  float e = (lit * sg.y * (1.0 + tipGlint) + head) * facing;
  totalEmissiveRadiance += vec3(5.4, 5.75, 6.2) * e * uDrl;
}`;
export const GUIDE_VERT: [string, string] = ['attribute vec2 aG;\nvarying vec2 vG;', 'vG = aG;'];
const LENS_PARS = /* glsl */ `
uniform float uLens;
uniform float uLensR;
uniform vec2 uLensC;`;
const LENS_CODE = /* glsl */ `
{
  vec2 lp = vLp.xy - uLensC;
  float rho = length(lp) / uLensR;
  float core = exp(-rho * rho / 0.07);
  float fill = smoothstep(1.02, 0.55, rho);
  float rg = (rho - 0.9) / 0.055;
  float ring = exp(-rg * rg);
  float fr = (rho - 0.975) / 0.018;
  float fringe = exp(-fr * fr);
  // the cut-off: a touch darker under the shield's edge
  float cut = mix(0.72, 1.0, smoothstep(-0.17, -0.09, lp.y / uLensR));
  totalEmissiveRadiance += uLens * (vec3(0.95, 0.97, 1.0) * (core * 5.0 + (fill * 1.15 + ring * 0.9) * cut) + vec3(0.0, 0.62, 0.75) * fringe * 0.8);
}`;

// the main beam's reflector field: the stepped floors inside the star light up, brightest round the projector
const FIELD_PARS = /* glsl */ `
uniform float uBeam;
uniform float uFieldR;`;
const FIELD_CODE = /* glsl */ `
{
  float rr = length(vLp.xy) / uFieldR;
  float f = 0.22 + 1.1 * exp(-rr * rr * 5.0);
  vec3 V = normalize(vViewPosition);
  float fa = 0.55 + 0.45 * max(dot(normal, V), 0.0);
  totalEmissiveRadiance += uBeam * vec3(0.93, 0.96, 1.0) * f * fa * 0.6;
}`;

/* ------------------------------------------------------------------ the lamp */
export type SegState = { front: number; level: number; head: number };
export type LampState = {
  /** the strips: how far the light has run (0 at the waist, 1 at the tip), its level, the running head */
  seg: SegState[];
  /** the feed blocks spark */
  feed: number;
  /** the projector's LED (the very first light) */
  led: number;
  /** the projectors bloom: the lenses fill with light */
  lens: number;
  /** the micro LEDs light one after another round the bezel (0..1) */
  ring: number;
};
export type Headlight = {
  group: THREE.Group;
  /** the strips' tips (0 right, 1 top, 2 left, 3 bottom), in strip order */
  tips: number[];
  /** the projectors' lens apexes (unit space) */
  lensTips: THREE.Vector3[];
  /** every material that reflects the studio, with its base strength (callers may ramp them) */
  envMats: { m: THREE.MeshPhysicalMaterial; k: number }[];
  newState(): LampState;
  set(s: LampState): void;
  /** live looks: smoke, chrome, clarity, intensities, outer lens */
  setLook(p: HlParams): void;
  setPx(scale: number): void;
  dispose(): void;
};

/** The ignition, as one value g (0 off → 1 lit): feeds spark, the vertical points run, then the horizontal
 *  ones, the projectors bloom, the micro LEDs go round. `level` carries the flicker. */
export function ignite(g: number, level: number, st: LampState, tips: number[], punch = false) {
  const sm = (a: number, b: number, v: number) => {
    const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  st.led = sm(0, 0.06, g);
  st.feed = sm(0.02, 0.09, g) * (1 - 0.6 * sm(0.3, 0.5, g));
  for (let i = 0; i < st.seg.length; i++) {
    const layer = Math.floor(i / NSEG);
    const tip = tips[i];
    const vert = tip === 1 || tip === 3;
    const a = (vert ? 0.07 : 0.25) + layer * 0.06;
    const run = Math.min(1, Math.max(0, (g - a) / 0.22));
    const f = 1 - Math.pow(1 - run, 1.7); // fast off the feed, slowing into the tip
    const sg = st.seg[i];
    sg.front = run <= 0 ? -0.1 : f * 1.12;
    sg.level = level;
    sg.head = run > 0 ? 1.5 * (1 - sm(0.82, 1, run)) : 0;
  }
  st.lens = punch
    ? // the main beam punches on once the edge has run out to the tips
      sm(0.62, 0.67, g) * (1 + 0.7 * Math.exp(-Math.pow((g - 0.68) / 0.035, 2)))
    : sm(0.56, 0.8, g) * (1 + 0.4 * Math.exp(-Math.pow((g - 0.79) / 0.07, 2)));
  st.ring = Math.min(1, Math.max(0, (g - 0.68) / 0.29));
}

export function buildHeadlight(p: HlParams, env: THREE.Texture, opts: { phone?: boolean } = {}): Headlight {
  const phone = !!opts.phone;
  const S = spec(p);
  const P = polar(S);
  const th = angles(P, phone ? 300 : 480, phone ? 140 : 220);
  const g: Rings = { th, rs: th.map((a) => rAt(P, a) * S.R * S.kD), rq: th.map((a) => rHousing(S, a)), RB: S.RB, hs: S.hs };
  const b = 0.0009; // bevel radius: the chrome hairlines

  /* the housing outside the star: terraces stepping up to the rim */
  const gloss: THREE.BufferGeometry[] = [];
  const matte: THREE.BufferGeometry[] = [];
  const chrome: THREE.BufferGeometry[] = [];
  // on the star housing the band outside the edge light is narrow: two terraces (the channel, then the rim)
  const nS = Math.max(1, Math.round(S.steps + (Math.min(S.steps, 2) - S.steps) * S.hs));
  const zLo = S.zD;
  const zHi = -0.0075;
  const lv = Array.from({ length: nS }, (_, k) => (nS === 1 ? zHi : zLo + ((zHi - zLo) * k) / (nS - 1)));
  const tk = Array.from({ length: nS }, (_, k) => (k * 0.96) / nS);
  for (let k = 0; k < nS; k++) {
    const t0 = tk[k];
    const t1 = k < nS - 1 ? tk[k + 1] : 1;
    const d0 = k === 0 ? 0.003 : b;
    const d1 = k < nS - 1 ? -0.0004 : -0.0047;
    gloss.push(strip(g, [{ t: t0, dr: d0, z: lv[k] }, { t: (t0 + t1) / 2, dr: (d0 + d1) / 2, z: lv[k] }, { t: t1, dr: d1, z: lv[k] }], 'out'));
    if (k < nS - 1) {
      matte.push(strip(g, [{ t: t1, dr: d1, z: lv[k] }, { t: t1, dr: d1, z: lv[k + 1] - b }], 'out'));
      chrome.push(strip(g, bevel(t1, d1, lv[k + 1], b), 'out'));
    }
  }
  // the rim: a chrome lip, then a rounded bead in smoked black that the outer lens sits on
  const zr = lv[nS - 1];
  chrome.push(
    strip(
      g,
      [
        { t: 1, dr: -0.0047, z: zr },
        { t: 1, dr: -0.0047, z: Math.max(zr, -0.0062) },
        { t: 1, dr: -0.0043, z: -0.0052 },
        { t: 1, dr: -0.0036, z: -0.0047 },
      ],
      'out',
    ),
  );
  gloss.push(
    strip(
      g,
      [
        { t: 1, dr: -0.0036, z: -0.0047 },
        { t: 1, dr: -0.0026, z: -0.0024 },
        { t: 1, dr: -0.0011, z: -0.0006 },
        { t: 1, dr: 0.001, z: 0.0009 },
        { t: 1, dr: 0.0032, z: 0.0011 },
        { t: 1, dr: 0.0052, z: -0.0004 },
        { t: 1, dr: 0.0064, z: -0.003 },
        { t: 1, dr: 0.0068, z: -0.014 },
      ],
      'out',
    ),
  );
  // the housing's back shell (seen from the side): from the bead back to a flat rear
  matte.push(
    strip(
      g,
      [
        { t: 1, dr: 0.0068, z: -0.014 },
        { t: 1, dr: 0.0058, z: -0.06 },
        { t: 1, dr: 0.0, z: -0.085 },
        { t: 1, dr: -0.02 * (1 - S.hs) - 0.006 * S.hs, z: -0.095 },
        { t: 0, dr: -1, z: -0.098, c: S.hs > 0 },
      ],
      'out',
    ),
  );

  /* inside the star: stepped chrome reflector cups falling towards the projector */
  // (on the star housing: the main beam's reflector field, as many terraces as the housing has steps, rising
  //  towards the edge light)
  const nI = S.hs > 0 ? Math.max(3, S.steps) : 3;
  const zTop = S.zD - 0.0035;
  const iv = S.hs > 0 ? Array.from({ length: nI }, (_, k) => -0.047 + ((zTop + 0.0011 - -0.047) * k) / nI) : [-0.047, -0.0408, -0.0346];
  const it = S.hs > 0 ? Array.from({ length: nI }, (_, k) => (k * 0.9) / nI) : [0, 0.36, 0.68];
  const floors: THREE.BufferGeometry[] = [];
  for (let k = 0; k < nI; k++) {
    const t0 = it[k];
    const t1 = k < nI - 1 ? it[k + 1] : 1;
    const d0 = k === 0 ? 0 : b;
    const d1 = k < nI - 1 ? -0.0004 : -0.0032;
    floors.push(strip(g, [{ t: t0, dr: d0, z: iv[k] }, { t: (t0 + t1) / 2, dr: (d0 + d1) / 2, z: iv[k] + 0.0006 }, { t: t1, dr: d1, z: iv[k] + 0.0011 }], 'in'));
    if (k < nI - 1) {
      chrome.push(strip(g, [{ t: t1, dr: d1, z: iv[k] + 0.0011 }, { t: t1, dr: d1, z: iv[k + 1] - b }], 'in'));
      chrome.push(strip(g, bevel(t1, d1, iv[k + 1], b), 'in'));
    }
  }
  chrome.push(strip(g, [{ t: 1, dr: -0.0032, z: iv[nI - 1] + 0.0011 }, { t: 1, dr: -0.0032, z: S.zD + 0.0004 }], 'in'));
  // the centre of the floor when no projector sits there
  if (S.proj.length === 2) floors.push(new THREE.CircleGeometry(S.RB + 0.0002, 24).translate(0, 0, iv[0]));

  /* the star: light-guide strips in chrome channels (one to three nested layers), feed blocks at the waist */
  const guides: THREE.BufferGeometry[] = [];
  const spillPts: THREE.Vector3[][] = [];
  const tips: number[] = [];
  const feeds: THREE.BufferGeometry[] = [];
  const ZG = S.zD + 0.0032;
  for (let L = 0; L < S.layers; L++) {
    const k = LAYER_SCALE[L];
    const sides = halfSides(S, k, phone ? 52 : 80);
    const w = S.strip * (L === 0 ? 1 : 0.8);
    sides.forEach((sd, i) => {
      const id = L * NSEG + i;
      const z = ZG - L * 0.0035;
      const p3 = sd.pts.map((q) => new THREE.Vector3(q.x, q.y, z));
      guides.push(tube(p3, (s) => [(0.00165 - 0.0011 * Math.pow(s, 1.3)) * w, 0.0021 - 0.001 * s], phone ? 10 : 14, id, 2.6));
      const ch = tube(
        p3.map((q) => new THREE.Vector3(q.x, q.y, z - 0.0023)),
        (s) => [(0.0028 - 0.0016 * Math.pow(s, 1.3)) * Math.max(0.8, w), 0.0013],
        phone ? 8 : 12,
        id,
        4,
      );
      ch.deleteAttribute('aG');
      chrome.push(ch);
      const sp: THREE.Vector3[] = [];
      for (let j = 0; j < NPS; j++) {
        const f = j / (NPS - 1);
        const q = sd.pts[Math.round(f * (sd.pts.length - 1))];
        sp.push(new THREE.Vector3(q.x, q.y, z + 0.0033));
      }
      spillPts.push(sp);
      tips.push(sd.tip);
    });
    for (let q = 0; q < 4; q++) {
      const c = starPt(S, q, 0.5).multiplyScalar(S.R * S.kD * k);
      const t2 = starPt(S, q, 0.52).multiplyScalar(S.R * S.kD * k).sub(c).normalize();
      const fb = new RoundedBoxGeometry(GAP * 2 + 0.0012, 0.0036, 0.0034, 2, 0.0008);
      fb.rotateZ(Math.atan2(t2.y, t2.x));
      fb.translate(c.x, c.y, ZG - L * 0.0035 - 0.0017);
      feeds.push(fb);
    }
  }

  /* the projector(s) */
  const lathe = (pts: [number, number][], sc: number, x: number, y: number, seg = 96) => {
    const geo = new THREE.LatheGeometry(
      pts.map(([r, z]) => new THREE.Vector2(r * sc, z)),
      seg,
    );
    geo.rotateX(Math.PI / 2);
    geo.translate(x, y, 0);
    return geo;
  };
  const barrels: THREE.BufferGeometry[] = [];
  const bezels: THREE.BufferGeometry[] = [];
  const bowls: THREE.BufferGeometry[] = [];
  const shields: THREE.BufferGeometry[] = [];
  const edges: THREE.BufferGeometry[] = [];
  const ledsChip: THREE.BufferGeometry[] = [];
  const lenses: { geo: THREE.BufferGeometry; c: THREE.Vector2; r: number }[] = [];
  const lensTips: THREE.Vector3[] = [];
  const ledPos: number[] = [];
  const ledK: number[] = [];
  const LENS_Z = -0.017;
  for (const pj of S.proj) {
    const sc = pj.r / LENS0;
    const { x, y } = pj;
    barrels.push(
      lathe(
        [
          [0.0352, -0.0475],
          [0.0352, -0.03],
        ],
        sc,
        x,
        y,
      ),
    );
    bezels.push(
      lathe(
        [
          [0.0352, -0.03],
          [0.0352, -0.0262],
          [0.0349, -0.0253],
          [0.0342, -0.0247],
          [0.0332, -0.0245],
          [0.0318, -0.0245],
          [0.0313, -0.0251],
          [0.03, -0.0255],
          [0.029, -0.0255],
          [0.0284, -0.0262],
          [0.027, -0.0265],
          [0.0259, -0.0265],
          [0.0253, -0.0275],
          [0.0251, -0.0292],
        ],
        sc,
        x,
        y,
      ),
    );
    bowls.push(
      lathe(
        [
          [0.025, -0.0293],
          [0.0244, -0.034],
          [0.0226, -0.041],
          [0.019, -0.048],
          [0.0135, -0.0545],
          [0.0068, -0.0588],
          [0.0006, -0.0605],
        ],
        sc,
        x,
        y,
      ),
    );
    const lr = pj.r;
    const lensH = LENS_Z - -0.0291;
    const Rs = (lr * lr + lensH * lensH) / (2 * lensH);
    const lens = new THREE.SphereGeometry(Rs, phone ? 48 : 72, phone ? 16 : 24, 0, Math.PI * 2, 0, Math.asin(Math.min(1, lr / Rs)));
    lens.rotateX(Math.PI / 2);
    lens.translate(x, y, LENS_Z - Rs);
    lenses.push({ geo: lens, c: new THREE.Vector2(x, y), r: lr });
    lensTips.push(new THREE.Vector3(x, y, LENS_Z));
    const sh = new THREE.Shape();
    const yc = -0.0032 * sc;
    const rr = 0.0236 * sc;
    const a0 = Math.asin(yc / rr);
    sh.moveTo(Math.cos(a0) * rr, yc);
    sh.absarc(0, 0, rr, a0, -Math.PI - a0, true);
    sh.lineTo(Math.cos(a0) * rr, yc);
    shields.push(new THREE.ShapeGeometry(sh, 32).translate(x, y, -0.0365));
    edges.push(new THREE.CylinderGeometry(0.00045, 0.00045, Math.cos(a0) * rr * 2, 12).rotateZ(Math.PI / 2).translate(x, y + yc, -0.0362));
    ledsChip.push(new THREE.BoxGeometry(0.0032 * sc, 0.0032 * sc, 0.0006).translate(x, y, -0.0565));
    const NL = 24;
    for (let i = 0; i < NL; i++) {
      const a = Math.PI / 2 - (i / NL) * Math.PI * 2;
      ledPos.push(x + Math.cos(a) * 0.0386 * sc, y + Math.sin(a) * 0.0386 * sc, -0.0462);
      ledK.push(i / NL);
    }
  }
  const leds = new THREE.BufferGeometry();
  leds.setAttribute('position', new THREE.Float32BufferAttribute(ledPos, 3));
  leds.setAttribute('aK', new THREE.Float32BufferAttribute(ledK, 1));

  /* the outer lens: a clear pillow over the housing */
  // (the star housing: sampled at the rings' angles, dense at the tips, so the pillow follows its outline)
  const cth = S.hs > 0 ? th : Array.from({ length: phone ? 160 : 256 }, (_, i) => (i / (phone ? 160 : 256)) * Math.PI * 2);
  const crq = cth.map((a) => rHousing(S, a));
  const NC = cth.length;
  const RC = 20;
  const cpos: number[] = [];
  for (let j = 0; j <= RC; j++) {
    const f = 1 - Math.pow(1 - j / RC, 1.7);
    const z = 0.0012 + 0.021 * Math.sqrt(Math.max(0, 1 - f * f));
    for (let i = 0; i < NC; i++) {
      const a = cth[i];
      const r = f * (crq[i] + 0.0006);
      cpos.push(Math.cos(a) * r, Math.sin(a) * r, z);
    }
  }
  const cidx: number[] = [];
  for (let j = 0; j < RC; j++)
    for (let i = 0; i < NC; i++) {
      const i2 = (i + 1) % NC;
      const a = j * NC + i;
      const bb = j * NC + i2;
      const c = (j + 1) * NC + i2;
      const d = (j + 1) * NC + i;
      cidx.push(a, d, bb, bb, d, c);
    }
  const cover = new THREE.BufferGeometry();
  cover.setAttribute('position', new THREE.Float32BufferAttribute(cpos, 3));
  cover.setIndex(cidx);
  cover.computeVertexNormals();

  const merge = (list: THREE.BufferGeometry[]) => {
    const plain = list.map((x) => {
      // merge needs matching attributes: positions + normals (+ index)
      for (const k of Object.keys(x.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'aG') x.deleteAttribute(k);
      if (!x.index) {
        const n = x.attributes.position.count;
        x.setIndex(Array.from({ length: n }, (_, i) => i));
      }
      return x;
    });
    const m = mergeGeometries(plain);
    if (!m) throw new Error('headlight: parts could not be merged');
    list.forEach((x) => x.dispose());
    return m;
  };

  /* ---------------------------------------------- materials (per lamp: their spill uniforms are its own) */
  const group = new THREE.Group();
  const u = lampUniforms(S.layers, S.proj.length);
  const PU = u.uP.value as THREE.Vector4[];
  const segU = u.uSeg.value as THREE.Vector4[];
  const nsl = S.layers * NSEG;
  spillPts.forEach((pts, s) => pts.forEach((q, k) => PU[s * NPS + k].set(q.x, q.y, q.z, 0)));
  S.proj.forEach((pj, j) => PU[nsl * NPS + j].set(pj.x, pj.y, -0.012, 0));

  const envMats: Headlight['envMats'] = [];
  const mk = (q: THREE.MeshPhysicalMaterialParameters, k: number, spill: number, extra?: Parameters<typeof lampMat>[3], own?: Uni) => {
    const m = lampMat({ envMap: env, envMapIntensity: k, ...q }, u, spill, extra, own);
    envMats.push({ m, k });
    return m;
  };
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, order = 0) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.renderOrder = order;
    mesh.castShadow = true;
    group.add(mesh);
    return mesh;
  };

  const glossMat = mk({ color: 0x060607, roughness: 0.34, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05 }, 1, 0.1);
  add(merge(gloss), glossMat);
  add(merge(matte), mk({ color: 0x040405, roughness: 0.62, metalness: 0 }, 0.6, 0.08));
  const chromeMat = mk({ color: 0xf2f4f7, roughness: 0.075, metalness: 1 }, 1.15, 0.6);
  add(merge(chrome), chromeMat);
  const beamU = { uBeam: { value: 0 }, uFieldR: { value: S.R * S.kD * S.arm } };
  const floorMat = mk({ color: 0xb8bcc4, roughness: 0.2, metalness: 1 }, 0.9, 0.38, S.hs > 0 ? { pars: FIELD_PARS, code: FIELD_CODE } : undefined, beamU);
  add(merge(floors), floorMat);
  add(merge(guides), mk({ color: 0x8e949c, roughness: 0.14, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03 }, 1, 0.25, { pars: GUIDE_PARS, code: GUIDE_CODE, vert: GUIDE_VERT }));
  add(merge(feeds), mk({ color: 0x08080a, roughness: 0.3, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.1 }, 1, 0.5));
  add(merge(barrels), mk({ color: 0x101113, roughness: 0.42, metalness: 0.7, side: THREE.DoubleSide }, 0.8, 0.5));
  const bezelMat = mk({ color: 0xf4f6f8, roughness: 0.06, metalness: 1, side: THREE.DoubleSide }, 1.2, 0.6);
  add(merge(bezels), bezelMat);
  add(merge(bowls), mk({ color: 0xe8ebef, roughness: 0.09, metalness: 1, side: THREE.DoubleSide }, 0.9, 0.8));
  add(merge(shields), mk({ color: 0x1a1b1e, roughness: 0.38, metalness: 0.8, side: THREE.DoubleSide }, 0.8, 0.7));
  add(merge(edges), mk({ color: 0xf0f2f5, roughness: 0.1, metalness: 1 }, 1, 0.9));
  const ledMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
  add(merge(ledsChip), ledMat);
  const lensU = { uLens: { value: 0 } };
  const lensMats = lenses.map((l) => {
    const m = mk(
      { color: 0xffffff, roughness: 0.0, metalness: 0, transmission: 1, thickness: 0.009, ior: 1.52, specularIntensity: 1, attenuationColor: new THREE.Color(0xeef6ff), attenuationDistance: 0.4 },
      1,
      0.0,
      { pars: LENS_PARS, code: LENS_CODE },
      { uLens: lensU.uLens, uLensR: { value: l.r }, uLensC: { value: l.c } },
    );
    const mesh = add(l.geo, m);
    mesh.castShadow = false;
    return m;
  });

  // micro LEDs: points that light one after another round the ring
  const ledsMat = new THREE.ShaderMaterial({
    uniforms: { uRing: { value: 0 }, uScale: { value: 600 }, uI: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute float aK;
      uniform float uRing;
      uniform float uScale;
      varying float vB;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        float on = smoothstep(aK, aK + 0.06, uRing * 1.06);
        float hk = (uRing * 1.06 - aK - 0.03) / 0.05;
        vB = on * (1.0 + 2.2 * exp(-hk * hk));
        gl_PointSize = max(1.6, 0.0026 * uScale / -mv.z);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uI;
      varying float vB;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.18, d);
        gl_FragColor = vec4(vec3(0.93, 0.96, 1.0) * vB * a * 3.2 * uI, 0.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
    blendSrcAlpha: THREE.ZeroFactor,
    blendDstAlpha: THREE.OneFactor,
  });
  const ledPts = new THREE.Points(leds, ledsMat);
  ledPts.frustumCulled = false;
  group.add(ledPts);

  // the outer lens: reflections only (light adds over what is under it), plus a faint haze where it's lit
  const coverMat = mk({ color: 0x000000, roughness: 0.035, metalness: 0, specularIntensity: 1, ior: 1.5 }, 1, 0.035);
  coverMat.transparent = true;
  coverMat.depthWrite = false;
  coverMat.blending = THREE.CustomBlending;
  coverMat.blendEquation = THREE.AddEquation;
  coverMat.blendSrc = THREE.OneFactor;
  coverMat.blendDst = THREE.OneFactor;
  coverMat.blendSrcAlpha = THREE.ZeroFactor;
  coverMat.blendDstAlpha = THREE.OneFactor;
  const coverMesh = add(cover, coverMat, 2);
  coverMesh.castShadow = false;

  let projI = 1;
  const set = (s: LampState) => {
    let lit = 0;
    for (let i = 0; i < nsl; i++) {
      const sg = s.seg[i] ?? { front: -0.1, level: 1, head: 0 };
      segU[i].set(sg.front, sg.level, sg.head, 0);
      for (let k = 0; k < NPS; k++) {
        const f = k / (NPS - 1);
        const t = Math.min(1, Math.max(0, (f - (sg.front - 0.05)) / 0.05));
        const on = 1 - t * t * (3 - 2 * t);
        const hd = (sg.front - 0.035 - f) / 0.06;
        PU[i * NPS + k].w = (on * sg.level + sg.head * Math.exp(-hd * hd)) * (u.uDrl.value as number);
        lit += on * sg.level;
      }
    }
    if (s.feed > 0) for (let i = 0; i < nsl; i++) PU[i * NPS].w = Math.max(PU[i * NPS].w, s.feed * 0.9);
    for (let j = 0; j < S.proj.length; j++) PU[nsl * NPS + j].w = (s.lens * 2.2 + s.led * 0.35) * projI;
    u.uAmb.value = (lit / (nsl * NPS)) * (u.uDrl.value as number);
    lensU.uLens.value = s.lens * projI;
    // the main beam's reflector field (star housing only)
    beamU.uBeam.value = s.lens * projI * S.hs;
    ledMat.color.setScalar((s.led * 40 + s.lens * 60) * projI);
    ledsMat.uniforms.uRing.value = s.ring;
  };
  const setLook = (q: HlParams) => {
    // smoke: from near black to a smoked grey; chrome: how much the polished parts reflect
    const sm = 0.004 + 0.07 * q.smoke * q.smoke;
    glossMat.color.setRGB(sm, sm, sm * 1.08);
    for (const e of envMats) e.m.envMapIntensity = e.k;
    for (const m of [chromeMat, bezelMat, floorMat]) {
      const e = envMats.find((x) => x.m === m);
      if (e) m.envMapIntensity = e.k * q.chrome;
    }
    coverMat.roughness = 0.012 + (1 - q.clarity) * 0.3;
    coverMat.envMapIntensity = 0.3 + q.clarity * 0.55;
    (coverMat.userData.mine as Uni).uSpillK.value = 0.035 + (1 - q.clarity) * 0.25;
    coverMesh.visible = q.outerLens;
    u.uDrl.value = q.drl;
    projI = q.projector;
    ledsMat.uniforms.uI.value = q.projector;
    for (const m of lensMats) m.roughness = (1 - q.clarity) * 0.06;
  };
  setLook(p);
  return {
    group,
    tips,
    lensTips,
    envMats,
    newState: () => ({ seg: Array.from({ length: nsl }, () => ({ front: -0.1, level: 1, head: 0 })), feed: 0, led: 0, lens: 0, ring: 0 }),
    set,
    setLook,
    setPx: (scale) => (ledsMat.uniforms.uScale.value = scale),
    dispose: () => {
      group.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
      });
      for (const m of [...envMats.map((e) => e.m), ledMat, ledsMat]) m.dispose();
    },
  };
}

/** The housing's half extents (x, y), metres: the rounded square's, or the star housing's. */
export function housingExtent(p: HlParams) {
  const S = spec(p);
  let x = 0;
  let y = 0;
  for (let i = 0; i < 720; i++) {
    const a = (i / 720) * Math.PI * 2;
    const r = rHousing(S, a);
    x = Math.max(x, Math.abs(Math.cos(a) * r));
    y = Math.max(y, Math.abs(Math.sin(a) * r));
  }
  return { x: x + 0.0068, y: y + 0.0068 };
}

/** The housing's outline radius at angle a (for cutting the body round it). */
export function housingRadius(p: HlParams, a: number) {
  return rHousing(spec(p), a);
}
