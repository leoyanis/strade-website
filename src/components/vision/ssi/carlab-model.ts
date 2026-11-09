// Car lab: the parametric Star Car used by /vision/ssi/star-car/lab. Units are metres.
// The car faces +X, the ground is y = 0, +Z is the right-hand side.
//
// File structure
//   1. PARAMS      one schema row per slider: key, folder, min/max/step, default. It drives BOTH the GUI (carlab.ts)
//                  and this model. New slider = add one row here, then read `p.yourKey` where the geometry needs it.
//   2. PRESETS     partial parameter sets merged over the defaults.
//   3. section()   the body's rounded cross-section at any station x (superellipse, belt line, nose/tail caps, taper).
//   4. buildBody   lofts section() along x, then carves the wheel arches (vertices pushed into a dark well) + flares.
//   5. buildCabin  a second loft that sits on the body's top surface (windshield ramp, roof, rear window).
//   6. wheels, light seam, star headlights.
//   7. buildCar()  assembles everything into one Group. New part = write a small builder, add it in buildCar, and
//                  add a `showYourPart` boolean row to PARAMS.

import * as THREE from 'three';

/* ================================================================== 1. PARAMS */
export type ParamValue = number | boolean | string;
export interface ParamDef {
  key: string;
  folder: string;
  def: ParamValue;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
}

export const PARAMS: ParamDef[] = [
  // Body
  { key: 'length', folder: 'Body', def: 5.0, min: 3.5, max: 7, step: 0.01 },
  { key: 'width', folder: 'Body', def: 2.05, min: 1.5, max: 2.8, step: 0.01 },
  { key: 'height', folder: 'Body', def: 1.26, min: 0.7, max: 1.8, step: 0.01, label: 'height (deck)' },
  { key: 'clearance', folder: 'Body', def: 0.36, min: 0.1, max: 0.7, step: 0.01, label: 'ground clearance' },
  { key: 'noseLen', folder: 'Body', def: 0.9, min: 0.2, max: 2, step: 0.01, label: 'nose length' },
  { key: 'noseHeight', folder: 'Body', def: 0.45, min: 0, max: 1, step: 0.01, label: 'nose height' },
  { key: 'noseRound', folder: 'Body', def: 2.6, min: 1.3, max: 8, step: 0.05, label: 'nose roundness' },
  { key: 'hoodDrop', folder: 'Body', def: 0.12, min: -0.2, max: 0.5, step: 0.01, label: 'hood drop' },
  { key: 'tailLen', folder: 'Body', def: 0.6, min: 0.1, max: 2, step: 0.01, label: 'tail length' },
  { key: 'tailHeight', folder: 'Body', def: 0.6, min: 0, max: 1, step: 0.01, label: 'tail height' },
  { key: 'tailRound', folder: 'Body', def: 3.5, min: 1.3, max: 8, step: 0.05, label: 'tail roundness' },
  { key: 'deckDrop', folder: 'Body', def: 0.05, min: -0.2, max: 0.5, step: 0.01, label: 'rear deck drop' },
  { key: 'sideRound', folder: 'Body', def: 3.2, min: 1.6, max: 10, step: 0.05, label: 'side roundness (n)' },
  { key: 'beltLine', folder: 'Body', def: 0.55, min: 0.15, max: 0.9, step: 0.01, label: 'belt line height' },
  { key: 'taperFront', folder: 'Body', def: 0.12, min: 0, max: 0.5, step: 0.01, label: 'plan taper front' },
  { key: 'taperRear', folder: 'Body', def: 0.06, min: 0, max: 0.5, step: 0.01, label: 'plan taper rear' },

  // Cabin
  { key: 'cabinStart', folder: 'Cabin', def: 1.1, min: -1, max: 2.5, step: 0.01, label: 'start (windshield base x)' },
  { key: 'cabinEnd', folder: 'Cabin', def: -1.7, min: -3, max: 0.5, step: 0.01, label: 'end (rear base x)' },
  { key: 'cabinOffset', folder: 'Cabin', def: 0, min: -1.5, max: 1.5, step: 0.01, label: 'offset fore/aft' },
  { key: 'cabinHeight', folder: 'Cabin', def: 0.58, min: 0.2, max: 1.2, step: 0.01, label: 'height' },
  { key: 'cabinWidth', folder: 'Cabin', def: 1.62, min: 0.8, max: 2.6, step: 0.01, label: 'width' },
  { key: 'roofCurve', folder: 'Cabin', def: 3.0, min: 1.5, max: 10, step: 0.05, label: 'roof curvature (n)' },
  { key: 'tumblehome', folder: 'Cabin', def: 0.12, min: 0, max: 0.5, step: 0.01 },
  { key: 'roofCrown', folder: 'Cabin', def: 0.08, min: 0, max: 0.5, step: 0.01, label: 'roof crown (side)' },
  { key: 'rakeFront', folder: 'Cabin', def: 58, min: 10, max: 80, step: 0.5, label: 'windshield rake °' },
  { key: 'rakeRear', folder: 'Cabin', def: 62, min: 5, max: 85, step: 0.5, label: 'rear window rake °' },
  { key: 'cabinSoft', folder: 'Cabin', def: 4, min: 1.5, max: 16, step: 0.1, label: 'corner sharpness' },
  { key: 'glass', folder: 'Cabin', def: true, label: 'tinted glass' },
  { key: 'glassLow', folder: 'Cabin', def: 0.12, min: 0, max: 0.8, step: 0.01, label: 'glass bottom' },
  { key: 'glassRoof', folder: 'Cabin', def: 0.22, min: 0, max: 0.6, step: 0.01, label: 'roof band' },

  // Wheels
  { key: 'wheelRadius', folder: 'Wheels', def: 0.53, min: 0.3, max: 0.8, step: 0.005, label: 'radius' },
  { key: 'wheelWidth', folder: 'Wheels', def: 0.34, min: 0.15, max: 0.6, step: 0.005, label: 'width' },
  { key: 'wheelbase', folder: 'Wheels', def: 3.3, min: 2, max: 5, step: 0.01 },
  { key: 'wheelShift', folder: 'Wheels', def: 0, min: -1, max: 1, step: 0.01, label: 'axles fore/aft' },
  { key: 'track', folder: 'Wheels', def: 1.66, min: 1.0, max: 2.6, step: 0.01, label: 'track' },
  { key: 'archClear', folder: 'Wheels', def: 0.06, min: 0, max: 0.3, step: 0.005, label: 'arch clearance' },
  { key: 'archLip', folder: 'Wheels', def: 0.05, min: 0.005, max: 0.2, step: 0.005, label: 'arch lip roll' },
  { key: 'archFlare', folder: 'Wheels', def: 0.04, min: 0, max: 0.2, step: 0.005, label: 'arch flare' },
  { key: 'fenderAuto', folder: 'Wheels', def: true, label: 'body covers tyres' },
  { key: 'fenderOut', folder: 'Wheels', def: 0.03, min: -0.1, max: 0.3, step: 0.005, label: 'fender past tyre' },
  { key: 'fenderLen', folder: 'Wheels', def: 0.5, min: 0.1, max: 1.5, step: 0.01, label: 'fender blend length' },
  { key: 'flareWidth', folder: 'Wheels', def: 0.16, min: 0.03, max: 0.5, step: 0.005, label: 'flare width' },

  // Lights
  { key: 'seam', folder: 'Lights', def: true, label: 'light seam' },
  { key: 'seamLen', folder: 'Lights', def: 0.85, min: 0.1, max: 1.2, step: 0.01, label: 'seam length' },
  { key: 'seamHeight', folder: 'Lights', def: 0.0, min: -0.1, max: 0.2, step: 0.002, label: 'seam height' },
  { key: 'seamX', folder: 'Lights', def: 0.0, min: -0.6, max: 0.6, step: 0.005, label: 'seam fore/aft' },
  { key: 'seamThick', folder: 'Lights', def: 0.012, min: 0.003, max: 0.05, step: 0.001, label: 'seam thickness' },
  { key: 'headlights', folder: 'Lights', def: true },
  { key: 'starSize', folder: 'Lights', def: 0.11, min: 0.03, max: 0.3, step: 0.002, label: 'headlight size' },
  { key: 'starStretch', folder: 'Lights', def: 1.25, min: 0.6, max: 2.5, step: 0.01, label: 'star up-point length' },
  { key: 'starSpacing', folder: 'Lights', def: 1.3, min: 0.3, max: 2.4, step: 0.01, label: 'headlight spacing' },
  { key: 'starHeight', folder: 'Lights', def: 0.62, min: 0.2, max: 1.4, step: 0.005, label: 'headlight height' },

  // Look
  { key: 'clay', folder: 'Look', def: '#c8c3ba', label: 'clay colour' },
  { key: 'wireframe', folder: 'Look', def: false },
  { key: 'edges', folder: 'Look', def: false, label: 'edge lines' },
  { key: 'showBody', folder: 'Look', def: true, label: 'show body' },
  { key: 'showCabin', folder: 'Look', def: true, label: 'show cabin' },
  { key: 'showWheels', folder: 'Look', def: true, label: 'show wheels' },
  { key: 'showArches', folder: 'Look', def: true, label: 'dark arch wells' },
  { key: 'grid', folder: 'Look', def: true, label: 'floor grid' },
];

export type Params = Record<string, any>;
export const SCHEMA_DEFAULTS: Params = Object.fromEntries(PARAMS.map((d) => [d.key, d.def]));

/* ================================================================== 2. PRESETS */
export const PRESETS: Record<string, Params> = {
  'Sleek coupé': {
    length: 5.2, width: 2.0, height: 1.16, clearance: 0.32, noseLen: 1.25, noseHeight: 0.35, noseRound: 2.2, hoodDrop: 0.2,
    tailLen: 0.8, tailHeight: 0.55, tailRound: 2.8, sideRound: 2.8, beltLine: 0.5, taperFront: 0.18, taperRear: 0.1,
    cabinStart: 0.75, cabinEnd: -2.0, cabinHeight: 0.5, cabinWidth: 1.5, roofCurve: 2.6, rakeFront: 66, rakeRear: 74,
    tumblehome: 0.18, roofCrown: 0.12, cabinSoft: 3.5, wheelbase: 3.25, track: 1.62, starHeight: 0.55, starSpacing: 1.2,
  },
  'Industrial cab-forward': {
    length: 4.9, width: 2.1, height: 1.2, clearance: 0.38, noseLen: 0.45, noseHeight: 0.55, noseRound: 4.5, hoodDrop: 0.02,
    tailLen: 0.35, tailHeight: 0.6, tailRound: 5.5, sideRound: 5, beltLine: 0.58, taperFront: 0.05, taperRear: 0.02,
    cabinStart: 1.95, cabinEnd: -1.3, cabinHeight: 0.66, cabinWidth: 1.8, roofCurve: 4.5, rakeFront: 42, rakeRear: 48,
    tumblehome: 0.06, roofCrown: 0.03, cabinSoft: 6, wheelbase: 3.4, track: 1.72, starHeight: 0.75,
  },
  'Low and wide': {
    length: 5.4, width: 2.45, height: 1.1, clearance: 0.28, noseLen: 1.0, noseHeight: 0.4, noseRound: 3, hoodDrop: 0.1,
    tailLen: 0.7, tailHeight: 0.6, tailRound: 3.5, sideRound: 3.6, beltLine: 0.5, taperFront: 0.14, taperRear: 0.08,
    cabinStart: 0.9, cabinEnd: -1.8, cabinHeight: 0.52, cabinWidth: 1.75, roofCurve: 3.4, rakeFront: 62, rakeRear: 66,
    wheelRadius: 0.55, wheelWidth: 0.42, wheelbase: 3.5, track: 2.0, archFlare: 0.08, starSpacing: 1.6, starHeight: 0.52,
  },
  'Rounded pod': {
    length: 4.6, width: 2.1, height: 1.15, clearance: 0.34, noseLen: 1.2, noseHeight: 0.5, noseRound: 1.9, hoodDrop: 0.15,
    tailLen: 1.1, tailHeight: 0.55, tailRound: 1.9, sideRound: 2.2, beltLine: 0.5, taperFront: 0.2, taperRear: 0.2,
    cabinStart: 1.0, cabinEnd: -1.4, cabinHeight: 0.6, cabinWidth: 1.6, roofCurve: 2.2, rakeFront: 55, rakeRear: 55,
    cabinSoft: 2.5, roofCrown: 0.2, wheelbase: 3.0, track: 1.66,
  },
};

/* ================================================================== math */
const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth01 = (t: number) => { t = clamp(t); return t * t * (3 - 2 * t); };
const smoothstep = (a: number, b: number, x: number) => smooth01((x - a) / (b - a));
// superellipse quarter: 1 at t = 0, 0 at t = 1; p = 2 is a circle, higher is boxier
const capK = (t: number, p: number) => Math.pow(Math.max(0, 1 - Math.pow(clamp(t), p)), 1 / p);
const spow = (v: number, e: number) => Math.sign(v) * Math.pow(Math.abs(v), e);

/* ================================================================== derived layout */
function layout(p: Params) {
  const xN = p.length / 2, xT = -p.length / 2;
  const xCf = p.cabinStart + p.cabinOffset; // windshield base
  const xCr = Math.min(p.cabinEnd + p.cabinOffset, xCf - 0.3); // rear-window base
  const axF = p.wheelbase / 2 + p.wheelShift, axR = -p.wheelbase / 2 + p.wheelShift;
  return { xN, xT, xCf, xCr, axF, axR };
}

/* ================================================================== 3. section */
export interface Section { hw: number; yb: number; yt: number; yBelt: number }

export function section(p: Params, x: number): Section {
  const { xN, xT, xCf, xCr } = layout(p);
  let yb = p.clearance;
  let yt = p.height;
  if (x > xCf) yt -= p.hoodDrop * smooth01((x - xCf) / Math.max(0.01, xN - xCf));
  if (x < xCr) yt -= p.deckDrop * smooth01((xCr - x) / Math.max(0.01, xCr - xT));
  yt = Math.max(yt, yb + 0.1);
  let hw = p.width / 2;
  if (x > 0) hw *= 1 - p.taperFront * Math.pow(x / xN, 2);
  else hw *= 1 - p.taperRear * Math.pow(x / xT, 2);
  const xNs = xN - p.noseLen;
  if (x > xNs) {
    const k = capK((x - xNs) / p.noseLen, p.noseRound);
    const tip = yb + p.noseHeight * (yt - yb);
    yt = tip + (yt - tip) * k; yb = tip - (tip - yb) * k; hw *= k;
  }
  const xTs = xT + p.tailLen;
  if (x < xTs) {
    const k = capK((xTs - x) / p.tailLen, p.tailRound);
    const tip = yb + p.tailHeight * (yt - yb);
    yt = tip + (yt - tip) * k; yb = tip - (tip - yb) * k; hw *= k;
  }
  // the body is the fender: near each axle, widen the section until it covers the tyre's outer face
  if (p.fenderAuto) {
    const { axF, axR } = layout(p);
    const need = p.track / 2 + p.wheelWidth / 2 + p.fenderOut;
    const archR = p.wheelRadius + p.archClear;
    for (const ax of [axF, axR]) {
      const w = 1 - smoothstep(archR * 0.6, archR + p.fenderLen, Math.abs(x - ax));
      if (need > hw && hw > 1e-3) hw += (need - hw) * w * Math.min(1, hw / 0.25);
    }
  }
  return { hw, yb, yt, yBelt: yb + p.beltLine * (yt - yb) };
}

// height of the body's upper surface at (x, z)
export function bodyTop(p: Params, x: number, z: number) {
  const s = section(p, x);
  const r = clamp(Math.abs(z) / Math.max(1e-4, s.hw));
  return s.yBelt + (s.yt - s.yBelt) * Math.pow(Math.max(0, 1 - Math.pow(r, p.sideRound)), 1 / p.sideRound);
}

function insideBody(p: Params, x: number, y: number, z: number) {
  const s = section(p, x);
  if (s.hw < 1e-4) return false;
  const v = y > s.yBelt ? (y - s.yBelt) / Math.max(1e-4, s.yt - s.yBelt) : (s.yBelt - y) / Math.max(1e-4, s.yBelt - s.yb);
  return Math.pow(Math.abs(z) / s.hw, p.sideRound) + Math.pow(Math.abs(v), p.sideRound) <= 1;
}

// first x (coming from the nose) where the body surface is at (y, z); null if the ray misses
function noseSurfaceX(p: Params, y: number, z: number) {
  const { xN } = layout(p);
  for (let x = xN; x > 0; x -= 0.004) if (insideBody(p, x, y, z)) return x;
  return null;
}

/* ================================================================== 4. body */
// ring angles spaced evenly by arc length on the unit superellipse (plain angles bunch up in the corners of boxy
// sections and leave the flat sides coarse, which makes arch and glass edges look stepped)
function evenAngles(n: number, count: number, from = 0, to = Math.PI * 2) {
  const M = count * 8;
  const th: number[] = [], acc: number[] = [0];
  let px = 0, py = 0;
  for (let i = 0; i <= M; i++) {
    const t = lerp(from, to, i / M);
    const x = spow(Math.cos(t), 2 / n), y = spow(Math.sin(t), 2 / n);
    if (i > 0) acc.push(acc[i - 1] + Math.hypot(x - px, y - py));
    th.push(t); px = x; py = y;
  }
  const out: number[] = [];
  const total = acc[M];
  let k = 0;
  const closed = to - from >= Math.PI * 2 - 1e-6;
  const cnt = closed ? count : count + 1;
  for (let j = 0; j < cnt; j++) {
    const target = (j / count) * total;
    while (k < M - 1 && acc[k + 1] < target) k++;
    const f = (target - acc[k]) / Math.max(1e-9, acc[k + 1] - acc[k]);
    out.push(lerp(th[k], th[k + 1], clamp(f)));
  }
  return out;
}

const NS = 380; // stations along the length
const NR = 160; // points around each section

function buildBody(p: Params, clay: THREE.Material) {
  const { xN, xT, axF, axR } = layout(p);
  const n = p.sideRound;
  const archR = p.wheelRadius + p.archClear;
  const zIn = p.track / 2 - p.wheelWidth / 2 - 0.05; // inner wall of the wheel wells
  const pos: number[] = [];
  const col: number[] = [];
  const ring = evenAngles(n, NR);
  for (let i = 0; i <= NS; i++) {
    const u = i / NS;
    const uu = 0.6 * u + 0.4 * (0.5 - 0.5 * Math.cos(Math.PI * u)); // denser at the ends
    const x = lerp(xT, xN, uu);
    const s = section(p, x);
    for (let j = 0; j < NR; j++) {
      const th = ring[j];
      const cx = spow(Math.cos(th), 2 / n), cy = spow(Math.sin(th), 2 / n);
      let z = s.hw * cx;
      const y = cy >= 0 ? s.yBelt + (s.yt - s.yBelt) * cy : s.yBelt + (s.yBelt - s.yb) * cy;
      let dark = 0;
      for (const ax of [axF, axR]) {
        const d = Math.hypot(x - ax, y - p.wheelRadius);
        // flare: a soft lip just outside the arch, only on the sides
        const side = Math.abs(cx);
        const lip = d > archR ? 1 - smoothstep(0, p.flareWidth, d - archR) : smoothstep(archR - 0.02, archR, d);
        z += Math.sign(z) * p.archFlare * lip * side * side;
        // well: pull everything inside the arch radius in to the inner wall
        const f = 1 - smoothstep(archR - p.archLip, archR + 0.004, d); // soft lip hides the vertex steps
        if (f > 0 && Math.abs(z) > zIn) {
          z = Math.sign(z) * lerp(Math.abs(z), zIn, f);
          dark = Math.max(dark, f);
        }
      }
      pos.push(x, y, z);
      const c = p.showArches ? lerp(1, 0.05, dark) : 1;
      col.push(c, c, c);
    }
  }
  const idx: number[] = [];
  for (let i = 0; i < NS; i++) for (let j = 0; j < NR; j++) {
    const a = i * NR + j, b = i * NR + ((j + 1) % NR), c = (i + 1) * NR + j, d = (i + 1) * NR + ((j + 1) % NR);
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, clay);
  m.name = 'body';
  m.castShadow = m.receiveShadow = true;
  return m;
}

/* ================================================================== 5. cabin */
// cabin height profile along x: rises over the windshield, holds over the roof, falls over the rear window
function cabinH(p: Params, x: number) {
  const { xCf, xCr } = layout(p);
  const H = p.cabinHeight;
  const runF = Math.max(0.05, H * Math.tan((p.rakeFront * Math.PI) / 180));
  const runR = Math.max(0.05, H * Math.tan((p.rakeRear * Math.PI) / 180));
  const a = clamp((xCf - x) / runF, 0, 50), b = clamp((x - xCr) / runR, 0, 50);
  if (a <= 0 || b <= 0) return 0;
  const k = p.cabinSoft;
  const prof = Math.pow(Math.pow(a, -k) + Math.pow(b, -k) + 1, -1 / k); // soft min(a, b, 1)
  const u = (x - xCr) / Math.max(0.01, xCf - xCr);
  return H * prof * (1 - p.roofCrown * Math.pow(2 * u - 1, 2));
}

const SINK = 0.08; // the cabin's foot is buried this far into the body

// one cabin cross-section at station x, as points from +z over the roof to -z
function cabinCross(p: Params, x: number, nr: number, angles = evenAngles(p.roofCurve, nr, 0, Math.PI)) {
  const s = section(p, x);
  const h = cabinH(p, x);
  const cw = Math.min(p.cabinWidth / 2, s.hw * 0.97);
  const out: (THREE.Vector3 & { base?: number })[] = [];
  for (let j = 0; j <= nr; j++) {
    const th = angles[j];
    const cx = spow(Math.cos(th), 2 / p.roofCurve), cy = Math.pow(Math.max(0, Math.sin(th)), 2 / p.roofCurve);
    const z = cw * cx * (1 - p.tumblehome * cy);
    const base = bodyTop(p, x, z) - SINK;
    const v: THREE.Vector3 & { base?: number } = new THREE.Vector3(x, base + (h + SINK) * cy, z);
    v.base = base;
    out.push(v);
  }
  return out;
}

function buildCabin(p: Params, clay: THREE.Material) {
  const { xCf, xCr } = layout(p);
  const NSC = 180, NRC = 96;
  const pos: number[] = [], col: number[] = [];
  const angs = evenAngles(p.roofCurve, NRC, 0, Math.PI);
  const g0 = p.glassLow * p.cabinHeight, g1 = p.cabinHeight * (1 - p.glassRoof);
  for (let i = 0; i <= NSC; i++) {
    const x = lerp(xCr, xCf, i / NSC);
    for (const v of cabinCross(p, x, NRC, angs)) {
      pos.push(v.x, v.y, v.z);
      // glass: a band between the waist and the roof, the whole windshield/rear-window ramps included
      const local = v.y - v.base! - SINK;
      let c = 1;
      if (p.glass) c = lerp(1, 0.2, smoothstep(g0 - 0.01, g0 + 0.01, local) * (1 - smoothstep(g1 - 0.01, g1 + 0.01, local)));
      col.push(c, c * 1.05, c * (c < 0.6 ? 1.3 : 1));
    }
  }
  const idx: number[] = [];
  const W = NRC + 1;
  for (let i = 0; i < NSC; i++) for (let j = 0; j < NRC; j++) {
    const a = i * W + j, b = a + 1, c = a + W, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, clay);
  m.name = 'cabin';
  m.castShadow = m.receiveShadow = true;
  return m;
}

/* ================================================================== 6. wheels, lights */
function buildWheel(p: Params, mats: CarMaterials) {
  const R = p.wheelRadius, W = p.wheelWidth, rs = Math.min(0.09, W * 0.3, R * 0.2), rin = R * 0.64;
  const prof: THREE.Vector2[] = [new THREE.Vector2(rin, -W / 2)];
  for (let i = 0; i <= 8; i++) { const a = -Math.PI / 2 + (i / 8) * (Math.PI / 2); prof.push(new THREE.Vector2(R - rs + rs * Math.cos(a), -W / 2 + rs + rs * Math.sin(a))); }
  for (let i = 0; i <= 8; i++) { const a = (i / 8) * (Math.PI / 2); prof.push(new THREE.Vector2(R - rs + rs * Math.cos(a), W / 2 - rs + rs * Math.sin(a))); }
  prof.push(new THREE.Vector2(rin, W / 2));
  const tyreG = new THREE.LatheGeometry(prof, 64);
  tyreG.rotateX(Math.PI / 2); // axis along Z
  const wheel = new THREE.Group();
  const tyre = new THREE.Mesh(tyreG, mats.tyre);
  tyre.castShadow = true;
  const rimG = new THREE.CylinderGeometry(rin, rin, W * 0.82, 48);
  rimG.rotateX(Math.PI / 2);
  const rim = new THREE.Mesh(rimG, mats.rim);
  const capG = new THREE.CylinderGeometry(rin * 0.5, rin * 0.56, 0.03, 48);
  capG.rotateX(Math.PI / 2);
  const cap = new THREE.Mesh(capG, mats.hub);
  cap.position.z = W * 0.41;
  wheel.add(tyre, rim, cap);
  return wheel;
}

function starShape(size: number, stretch: number) {
  const s = new THREE.Shape();
  const up = size * stretch, side = size, dn = size, pinch = size * 0.14;
  s.moveTo(0, up);
  s.quadraticCurveTo(pinch, pinch, side, 0);
  s.quadraticCurveTo(pinch, -pinch, 0, -dn);
  s.quadraticCurveTo(-pinch, -pinch, -side, 0);
  s.quadraticCurveTo(-pinch, pinch, 0, up);
  return new THREE.ShapeGeometry(s, 12);
}

function buildHeadlights(p: Params, mats: CarMaterials) {
  const grp = new THREE.Group();
  grp.name = 'headlights';
  const geo = starShape(p.starSize, p.starStretch);
  for (const sz of [-1, 1]) {
    const z = (sz * p.starSpacing) / 2, y = p.starHeight;
    const x0 = noseSurfaceX(p, y, z);
    if (x0 === null) continue;
    const e = 0.01;
    const xy = noseSurfaceX(p, y + e, z) ?? x0, xz = noseSurfaceX(p, y, z + e) ?? x0;
    const nrm = new THREE.Vector3(1, -(xy - x0) / e, -(xz - x0) / e).normalize();
    const m = new THREE.Mesh(geo, mats.light);
    m.position.set(x0, y, z).addScaledVector(nrm, 0.006);
    m.lookAt(m.position.clone().add(nrm));
    grp.add(m);
  }
  return grp;
}

function buildSeam(p: Params, mats: CarMaterials) {
  const { xCf } = layout(p);
  const runF = p.cabinHeight * Math.tan((p.rakeFront * Math.PI) / 180);
  const x = xCf - runF + p.seamX;
  // straight in plan: a thin tube lying on the roof's cross-curve at station x
  const pts = cabinCross(p, x, 48).filter((v) => Math.abs(v.z) <= (p.cabinWidth * p.seamLen) / 2);
  if (pts.length < 2) return new THREE.Group();
  pts.forEach((v) => (v.y += p.seamHeight + p.seamThick * 0.4));
  const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 64, p.seamThick, 8, false);
  const m = new THREE.Mesh(g, mats.light);
  m.name = 'seam';
  return m;
}

/* ================================================================== 7. assemble */
export interface CarMaterials {
  clay: THREE.MeshStandardMaterial;
  tyre: THREE.Material;
  rim: THREE.Material;
  hub: THREE.Material;
  light: THREE.Material;
  edge: THREE.LineBasicMaterial;
}

export function buildCar(p: Params, mats: CarMaterials) {
  const car = new THREE.Group();
  const { axF, axR } = layout(p);
  if (p.showBody) {
    const body = buildBody(p, mats.clay);
    car.add(body);
    if (p.edges) car.add(new THREE.LineSegments(new THREE.EdgesGeometry(body.geometry, 28), mats.edge));
  }
  if (p.showCabin) {
    const cab = buildCabin(p, mats.clay);
    car.add(cab);
    if (p.edges) car.add(new THREE.LineSegments(new THREE.EdgesGeometry(cab.geometry, 28), mats.edge));
  }
  if (p.showWheels) {
    for (const ax of [axF, axR]) for (const sz of [-1, 1]) {
      const w = buildWheel(p, mats);
      w.position.set(ax, p.wheelRadius, (sz * p.track) / 2);
      if (sz < 0) w.rotation.y = Math.PI; // hub cap faces out on both sides
      car.add(w);
    }
  }
  if (p.headlights) car.add(buildHeadlights(p, mats));
  if (p.seam && p.showCabin) car.add(buildSeam(p, mats));
  return car;
}
