// Star Car SC-1, Draft 2: a full-body concept car, as a procedural three.js clay model for /vision/ssi/star-car.
// Units are metres. The car faces +X, the ground is y = 0, +Z is the right-hand side (the driver sits left, at -Z).
//
// Built like a design-studio clay: one sculpted body from constant-x sections. Each section is a superellipse side
// (tucking under to the floor, rolling over at the shoulder) under a height-field top: the deck (hood, fender crowns,
// rear haunches) plus the greenhouse, which grows out of the hood at the cowl (the windshield), peaks over the seats
// and runs down the fastback into the Kamm tail. Superellipsoid ends close the nose and the tail; real wheel arches
// trim the sides. Panel lines and graphite paint live in the clay shader, so they sit exactly on the surface.
// No glass on the Moon: the visor is a magnetic dust-shield field, drawn as a faint dark tint.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

type V3 = THREE.Vector3;
const V = THREE.Vector3;
const TAU = Math.PI * 2;
const HPI = Math.PI / 2;

/* ================================================================== dimensions */
export const R = 0.53; // tyre radius: 1.06 m tyres, about 1.5x a road SUV's
export const TW = 0.34; // tyre width
export const AXF = 1.68; // front axle x
export const AXR = -1.66; // rear axle x (wheelbase 3.34 m)
export const TRK = 0.815; // half track (wheel centre z): the tyre's outer face sits just inside the arch
export const XN = 2.56; // nose tip
export const XT = -2.52; // tail tip
const RA = 0.585; // wheel-arch radius (a 5.5 cm gap over the tyre)
const YS = 0.56; // clay / graphite split: just above the axle, so the clay arches stay round
const X_COWL = 1.42; // windshield base
const X_HEAD = 0.3; // windshield top: the light seam
const X_C = -1.3; // rear tip of the side glass
const ZIN = TRK - TW / 2 - 0.05; // inner wall of the wheel wells
const DXE = Math.sqrt(RA * RA - (YS - R) * (YS - R)); // half-width of an arch where it meets the split line

/* ================================================================== math */
export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

// Monotone cubic (Fritsch-Carlson) through [x, y] knots: smooth, never overshoots. Clamped outside the knots.
function curve(knots: [number, number][]) {
  const k = [...knots].sort((a, b) => a[0] - b[0]);
  const n = k.length;
  const xs = k.map((p) => p[0]);
  const ys = k.map((p) => p[1]);
  const d: number[] = [];
  const m: number[] = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  return (x: number) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}
const _q = new V();
const smin = (a: number, b: number, k: number) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};

/* ================================================================== build-in uniforms */
// One sweep runs nose to tail: solids exist where world x >= reveal, construction lines run `lead` metres ahead.
export const FX = {
  reveal: { value: -99 },
  lead: { value: 1.0 },
  glow: { value: 0 },
  iso: { value: 0 },
  time: { value: 0 },
  seam: { value: 1 }, // the light seam, lit from the middle out (0..1)
};

const HEAD = 'uniform float uFxReveal;\nuniform float uFxLead;\nuniform float uFxGlow;\nuniform float uFxIso;\nvarying vec3 vFxW;\n';
function bindFx(s: { uniforms: Record<string, unknown> }) {
  s.uniforms.uFxReveal = FX.reveal;
  s.uniforms.uFxLead = FX.lead;
  s.uniforms.uFxGlow = FX.glow;
  s.uniforms.uFxIso = FX.iso;
}
function fxVertex(vs: string, normal = false) {
  return HEAD + (normal ? 'varying vec3 vFxN;\n' : '') + vs.replace(
    '#include <project_vertex>',
    `#include <project_vertex>
  vec4 fxW4 = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    fxW4 = instanceMatrix * fxW4;
  #endif
  vFxW = (modelMatrix * fxW4).xyz;${normal ? '\n  vFxN = normalize(mat3(modelMatrix) * objectNormal);' : ''}`,
  );
}

type Mat = THREE.Material & { onBeforeCompile: (s: any) => void; customProgramCacheKey: () => string };

// Solids: hidden until the sweep reaches them, with a thin bright scan line at the leading edge.
function fxSolid<T extends THREE.Material>(m: T, key = ''): T {
  const mm = m as unknown as Mat;
  mm.onBeforeCompile = (s) => {
    bindFx(s);
    s.vertexShader = fxVertex(s.vertexShader);
    s.fragmentShader = HEAD + s.fragmentShader
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
  if (vFxW.x < uFxReveal) discard;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  totalEmissiveRadiance += vec3(uFxGlow) * (1.0 - smoothstep(0.0, 0.05, vFxW.x - uFxReveal));`);
  };
  mm.customProgramCacheKey = () => 'fx-solid' + key;
  return m;
}

// Construction lines (CAD isoparms): only exist in the band between the line front and the solid front.
function fxIso<T extends THREE.Material>(m: T): T {
  const mm = m as unknown as Mat;
  mm.onBeforeCompile = (s) => {
    bindFx(s);
    s.vertexShader = fxVertex(s.vertexShader);
    s.fragmentShader = HEAD + s.fragmentShader
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
  if (vFxW.x < uFxReveal - uFxLead) discard;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
  diffuseColor.a *= uFxIso * smoothstep(uFxReveal - uFxLead, uFxReveal - uFxLead + 0.3, vFxW.x)
    * (1.0 - smoothstep(uFxReveal - 0.1, uFxReveal + 0.45, vFxW.x));`);
  };
  mm.customProgramCacheKey = () => 'fx-iso';
  return m;
}

/* ================================================================== paint: panel lines and graphite, in the clay shader */
// Everything is placed in world space on the right side and mirrored by |z|.
const BAND_Y = 0.78; // the graphite line across the face that carries the star headlights (the emblem's horizon)
const BAND_H = 0.024; // half height
const BAND_Z = 0.86; // half width
const STAR_Z = 0.69; // headlight centres
const TAIL_Y = 0.93; // the same line across the tail, unlit
const PLUG = new V(-1.13, 1.0, 1); // suit plug on the right rear quarter (x, y; z is found on the body)
const DOOR_F = 1.07, DOOR_R = -0.86; // door shut lines at the sill
const f = (n: number) => n.toFixed(4);
const PAINT = `
float fxLineAA(float d, float w) { float fw = max(fwidth(d), 1e-5); return 1.0 - smoothstep(w - fw, w + fw, abs(d)); }
float fxFill(float d) { float fw = max(fwidth(d), 1e-5); return 1.0 - smoothstep(-fw, fw, d); }
float fxBox(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
// x: graphite paint, y: shut line
vec2 fxPaint(vec3 p, vec3 n) {
  float az = abs(p.z), g = 0.0, l = 0.0;
  // face: one slim graphite line across the nose, the star headlights sit on its ends
  float band = fxBox(vec2(az, p.y - ${f(BAND_Y)}), vec2(${f(BAND_Z)}, ${f(BAND_H)}), ${f(BAND_H)});
  g = max(g, fxFill(band) * step(${f(XN - 0.6)}, p.x) * step(0.05, n.x));
  float tail = fxBox(vec2(az, p.y - ${f(TAIL_Y)}), vec2(${f(BAND_Z - 0.04)}, ${f(BAND_H * 0.8)}), ${f(BAND_H * 0.8)});
  g = max(g, fxFill(tail) * step(p.x, ${f(XT + 0.3)}) * step(n.x, -0.05));
  // doors: one long coupe door a side, front shut line behind the front arch, rear one ahead of the rear arch
  float side = step(0.55, az) * step(${f(YS - 0.01)}, p.y);
  l = max(l, side * fxLineAA(p.x - (${f(DOOR_F)} + (p.y - ${f(YS)}) * 0.2), 0.0024));
  l = max(l, side * fxLineAA(p.x - (${f(DOOR_R)} - (p.y - ${f(YS)}) * 0.08), 0.0024));
  // frunk lid: from the cowl over the nose down to the face line
  float lid = fxBox(vec2(p.x - ${f((X_COWL + 0.05 + 3.6) / 2)}, p.z), vec2(${f((3.6 - X_COWL - 0.05) / 2)}, 0.70), 0.14);
  l = max(l, fxLineAA(lid, 0.0024) * step(${f(BAND_Y + BAND_H + 0.025)}, p.y) * step(0.6, p.x));
  // suit plug door, right side only
  float plug = length(p.xy - vec2(${f(PLUG.x)}, ${f(PLUG.y)})) - 0.088;
  l = max(l, fxLineAA(plug, 0.0022) * step(0.5, p.z));
  return vec2(g, l);
}
`;
// The clay: build-in sweep, plus the paint layer.
function fxClay<T extends THREE.MeshStandardMaterial>(m: T): T {
  const mm = m as unknown as Mat;
  mm.onBeforeCompile = (s) => {
    bindFx(s);
    s.vertexShader = fxVertex(s.vertexShader, true);
    s.fragmentShader = HEAD + 'varying vec3 vFxN;\n' + PAINT + s.fragmentShader
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
  if (vFxW.x < uFxReveal) discard;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
  vec2 fxPt = fxPaint(vFxW, normalize(vFxN));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.085, 0.09, 0.098), fxPt.x);
  diffuseColor.rgb *= 1.0 - 0.8 * fxPt.y;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  roughnessFactor = mix(roughnessFactor, 0.4, fxPt.x);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  totalEmissiveRadiance += vec3(uFxGlow) * (1.0 - smoothstep(0.0, 0.05, vFxW.x - uFxReveal));`);
  };
  mm.customProgramCacheKey = () => 'fx-clay';
  return m;
}

/* ================================================================== textures */
function canvasTex(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void, srgb = true) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  draw(cv.getContext('2d')!);
  const t = new THREE.CanvasTexture(cv);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// Four-point star glint for the lamps: a soft core with thin horizontal and vertical rays.
export function flareTexture() {
  return canvasTex(256, 256, (c) => {
    c.globalCompositeOperation = 'lighter';
    const g = c.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.035, 'rgba(255,255,255,0.55)');
    g.addColorStop(0.14, 'rgba(255,255,255,0.1)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.02)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 256, 256);
    const ray = (horizontal: boolean) => {
      const lg = horizontal ? c.createLinearGradient(0, 0, 256, 0) : c.createLinearGradient(0, 0, 0, 256);
      lg.addColorStop(0, 'rgba(255,255,255,0)');
      lg.addColorStop(0.5, 'rgba(255,255,255,0.85)');
      lg.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = lg;
      if (horizontal) c.fillRect(0, 127, 256, 2); else c.fillRect(127, 0, 2, 256);
    };
    ray(true);
    ray(false);
  });
}

/* ================================================================== materials */
export function makeMaterials() {
  const m = {
    clay: fxClay(new THREE.MeshPhysicalMaterial({ color: 0xc4bfb6, roughness: 0.58, metalness: 0, clearcoat: 0.1, clearcoatRoughness: 0.45 })),
    carbon: fxSolid(new THREE.MeshPhysicalMaterial({ color: 0x232528, roughness: 0.46, metalness: 0.12, clearcoat: 0.35, clearcoatRoughness: 0.35 }), '-c'),
    well: fxSolid(new THREE.MeshStandardMaterial({ color: 0x101113, roughness: 0.9, metalness: 0, side: THREE.DoubleSide }), '-w'),
    cabin: fxSolid(new THREE.MeshStandardMaterial({ color: 0x141517, roughness: 0.85, metalness: 0, side: THREE.BackSide }), '-in'),
    field: fxSolid(new THREE.MeshPhysicalMaterial({
      color: 0x07080a, roughness: 0.16, metalness: 0, transparent: true, opacity: 0.74, depthWrite: false, side: THREE.DoubleSide,
      clearcoat: 0.3, clearcoatRoughness: 0.2,
    }), '-f'),
    seat: fxSolid(new THREE.MeshStandardMaterial({ color: 0xe6e3dd, roughness: 0.62, metalness: 0 }), '-s'),
    trim: fxSolid(new THREE.MeshStandardMaterial({ color: 0x2c2e31, roughness: 0.7, metalness: 0.05 }), '-t'),
    tyre: fxSolid(new THREE.MeshStandardMaterial({ color: 0x151516, roughness: 0.9, metalness: 0 }), '-ty'),
    rim: fxSolid(new THREE.MeshPhysicalMaterial({ color: 0x2b2d30, roughness: 0.38, metalness: 0.35, clearcoat: 0.5, clearcoatRoughness: 0.3 }), '-r'),
    ti: fxSolid(new THREE.MeshStandardMaterial({ color: 0xa8adb3, roughness: 0.3, metalness: 1 }), '-ti'),
    dark: fxSolid(new THREE.MeshStandardMaterial({ color: 0x0e0f11, roughness: 0.8, metalness: 0.2 }), '-d'),
    lampHead: fxSolid(new THREE.MeshBasicMaterial({ color: 0xffffff }), '-lh'),
    cyan: fxSolid(new THREE.MeshBasicMaterial({ color: 0x00e5ff, toneMapped: false }), '-cy'),
    iso: fxIso(new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false })),
    depth: fxSolid(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), '-dp'),
  };
  return m;
}
export type Mats = ReturnType<typeof makeMaterials>;

/* ================================================================== the body: profiles */
// Plan view: widest over the wheels (the fenders), a touch narrower at the doors.
const wHalf = curve([[XT, 0.99], [-2.25, 1.01], [AXR, 1.055], [-0.8, 1.032], [0.6, 1.032], [AXF, 1.055], [2.2, 1.01], [XN, 0.97]]);
// Side view: the waist (widest line), the floor, the deck centreline (hood) and the shoulder (fender crowns, haunches).
const yWaist = curve([[XT, 0.86], [AXR, 0.92], [0, 0.88], [AXF, 0.92], [2.25, 0.85], [XN, 0.78]]);
const yFloor = curve([[XT, 0.5], [-2.1, 0.43], [AXR, 0.4], [AXF, 0.4], [2.15, 0.43], [XN, 0.48]]);
const deckC = curve([[XT, 1.2], [-1.9, 1.205], [-0.6, 1.18], [0.6, 1.165], [X_COWL, 1.14], [1.9, 1.08], [2.25, 1.0], [XN, 0.93]]);
const deckS = curve([[XT, 1.2], [-2.2, 1.22], [AXR, 1.24], [-0.9, 1.2], [0.6, 1.195], [AXF, 1.215], [2.2, 1.1], [XN, 0.96]]);
// The greenhouse: roof centreline (absolute) and its half-width at the base. It grows out of the hood at the cowl
// (the windshield) and runs out into the deck at the Kamm tail (the fastback).
const roofY = curve([[XT, 1.2], [-2.3, 1.29], [-1.9, 1.41], [-1.3, 1.55], [-0.6, 1.645], [-0.1, 1.665], [X_HEAD, 1.645], [0.9, 1.43], [X_COWL, 1.14]]);
const ghW = curve([[XT, 0.66], [-2.0, 0.74], [-1.2, 0.86], [-0.3, 0.92], [0.8, 0.92], [X_COWL, 0.9], [XN, 0.9]]);
// Section exponents: upper z / y, lower z / y. Higher = crisper shoulder.
const NU = 6, MU = 5, NL = 4, ML = 3;
const TB = 0.045; // tumblehome: the upper side leans in this much by the shoulder
const UC = 0.045; // undercut: the lower body steps in this much just under the waist, so the side isn't a slab
const KD = 2.4; // deck crown: the hood sits in a shallow valley between the fender crowns
// Greenhouse section: roof crown, side-glass slope (tumblehome), roof-edge radius, glass top (fraction of the base width).
const GC = 0.07, GS = 3.6, GK = 0.14, TE = 0.72;
const ghD = (t: number) => (t >= 1 ? 0 : Math.max(0, smin(1 - GC * t * t, GS * (1 - t), GK)));

// Superellipse end: 1 before x0, falling to 0 at x1 with a vertical tangent (blunt, rounded).
function endF(x: number, x0: number, x1: number, p: number) {
  const s = (x - x0) / (x1 - x0);
  if (s <= 0) return 1;
  if (s >= 1) return 0;
  return Math.pow(1 - Math.pow(s, p), 1 / p);
}

type St = { x: number; w: number; yc: number; yb: number; dc: number; ds: number; hg: number; g: number; eW: number; eT: number; eB: number };
function station(x: number): St {
  return {
    x,
    w: wHalf(x),
    yc: yWaist(x),
    yb: yFloor(x),
    dc: deckC(x),
    ds: deckS(x),
    hg: x >= X_COWL ? 0 : Math.max(0, roofY(x) - deckC(x)),
    g: ghW(x),
    // nose: round in plan, a bull nose in side view; tail: a crisp Kamm cut
    eW: Math.min(endF(x, XN - 0.55, XN, 2.6), endF(x, XT + 0.2, XT, 4.5)),
    eT: Math.min(endF(x, XN - 0.45, XN, 2.3), endF(x, XT + 0.13, XT, 4.5)),
    eB: Math.min(endF(x, XN - 0.32, XN, 2.2), endF(x, XT + 0.2, XT, 3)),
  };
}

// The section: θ runs round the right half: -π/2 under the floor centre, 0 at the waist, +π/2 on the roof centre.
// Beyond ±π/2 it carries on round the left half (mirror), which the iso lines use.
function secP(s: St, th: number, o: V3) {
  const c = Math.cos(th), sn = Math.sin(th);
  const sg = c < 0 ? -1 : 1;
  const ac = Math.abs(c), as = Math.abs(sn);
  if (sn >= 0) {
    const fz = Math.pow(ac, 2 / NU), lift = Math.pow(as, 2 / MU);
    const z = (s.w - TB * lift) * s.eW * fz;
    const deck = s.dc + (s.ds - s.dc) * Math.pow(fz, KD);
    const gh = s.hg > 0 ? s.hg * ghD(z / s.g) : 0;
    o.set(s.x, s.yc + ((deck - s.yc) * lift + gh) * s.eT, sg * z);
  } else {
    const lo = Math.pow(as, 2 / ML);
    const z = (s.w - UC * smooth(0, 0.22, lo)) * s.eW * Math.pow(ac, 2 / NL);
    o.set(s.x, s.yc - (s.yc - s.yb) * lo * s.eB, sg * z);
  }
  return o;
}

// θ on the upper half where the section is z out from the centreline (z falls steadily from the waist to the roof)
function thetaAtZ(s: St, z: number) {
  const zMax = s.w * s.eW;
  z = Math.min(z, zMax * 0.985);
  let a = 0, b = HPI;
  for (let i = 0; i < 44; i++) {
    const mid = (a + b) / 2;
    if (secP(s, mid, _q).z > z) a = mid; else b = mid;
  }
  return (a + b) / 2;
}
const tBelt = (s: St) => thetaAtZ(s, s.g); // the beltline crease: greenhouse base
const tGT = (s: St) => thetaAtZ(s, TE * s.g); // glass top (roof edge)
// glass bottom: on the beltline, kicking up to meet the glass top at the rear tip of the side glass
const tLo = (x: number) => 1 - (1 - TE) * Math.pow(smooth(X_C + 0.6, X_C, x), 1.4);
const tGL = (s: St) => thetaAtZ(s, tLo(s.x) * s.g);
// clay / graphite split on the lower half
function tSill(s: St) {
  const k = (s.yc - YS) / Math.max(1e-6, (s.yc - s.yb) * s.eB);
  return k >= 1 ? -HPI : -Math.asin(Math.pow(k, ML / 2));
}
// the arches
function archY(x: number) {
  let y = -1;
  for (const xa of [AXF, AXR]) {
    const dx = x - xa;
    if (Math.abs(dx) < RA) y = Math.max(y, R + Math.sqrt(RA * RA - dx * dx));
  }
  return y;
}
// lowest θ where the section reaches height y, up the side (monotone there)
function thetaAtY(s: St, y: number) {
  if (secP(s, -HPI, _q).y >= y) return -HPI;
  let a = -HPI, b = 0.5;
  while (b < 1.3 && secP(s, b, _q).y < y) b += 0.1;
  for (let i = 0; i < 46; i++) {
    const mid = (a + b) / 2;
    if (secP(s, mid, _q).y < y) a = mid; else b = mid;
  }
  return (a + b) / 2;
}
const tMin = (s: St) => {
  const ya = archY(s.x);
  return ya > YS ? thetaAtY(s, ya) : tSill(s);
};

/* ================================================================== the body: meshing */
// θ = g(ψ): flattens at 0 and ±π/2 where the superellipse parametrisation bunches up, so arc length is easy to sample.
const gTh = (psi: number) => HPI * (psi - Math.sin(Math.PI * psi) / Math.PI);
function gInv(th: number) {
  let a = -1, b = 1;
  for (let i = 0; i < 40; i++) { const mid = (a + b) / 2; if (gTh(mid) < th) a = mid; else b = mid; }
  return (a + b) / 2;
}
// θ samples spaced evenly by arc length, segment by segment: [θa, θb, count][]
const _a = new V(), _b = new V();
function thetaSamples(s: St, segs: [number, number, number][]) {
  const out: number[] = [];
  const M = 140;
  segs.forEach(([ta, tb, n], si) => {
    const pa = gInv(ta), pb = gInv(tb);
    const th: number[] = [], len: number[] = [0];
    for (let i = 0; i <= M; i++) th.push(i === 0 ? ta : i === M ? tb : gTh(lerp(pa, pb, i / M)));
    secP(s, th[0], _a);
    for (let i = 1; i <= M; i++) { secP(s, th[i], _b); len.push(len[i - 1] + _a.distanceTo(_b)); _a.copy(_b); }
    const L = len[M];
    for (let j = si === 0 ? 0 : 1; j <= n; j++) {
      if (L < 1e-7) { out.push(lerp(ta, tb, j / n)); continue; }
      const target = (L * j) / n;
      let k = 0;
      while (k < M - 1 && len[k + 1] < target) k++;
      const t = (target - len[k]) / Math.max(1e-12, len[k + 1] - len[k]);
      out.push(j === 0 ? ta : j === n ? tb : lerp(th[k], th[k + 1], clamp(t)));
    }
  });
  return out;
}

type Row = { x: number; segs: [number, number, number][] };
type Grid = { pos: Float32Array; nor: Float32Array; nu: number; nv: number };
const _px = new V(), _pt = new V(), _p0 = new V(), _p1 = new V(), _nn = new V();
// A patch over station rows: positions on the section, normals from the surface's own parametrisation (crisp at the edges).
function gridOf(rows: Row[], inset = 0): Grid {
  const nu = rows.length - 1;
  const nv = rows[0].segs.reduce((a, s) => a + s[2], 0);
  const pos = new Float32Array((nu + 1) * (nv + 1) * 3), nor = new Float32Array((nu + 1) * (nv + 1) * 3);
  const xa = rows[0].x, xb = rows[nu].x, e = 1e-4;
  let q = 0;
  rows.forEach((row) => {
    const s = station(row.x);
    const ths = thetaSamples(s, row.segs);
    const t0 = row.segs[0][0], t1 = row.segs[row.segs.length - 1][1];
    const normalAt = (x: number, th: number, out: V3) => {
      const sm = station(Math.max(xa, x - e)), sp = station(Math.min(xb, x + e)), sc = station(x);
      secP(sp, th, _p1); secP(sm, th, _p0); _px.subVectors(_p1, _p0);
      secP(sc, Math.min(t1, th + e), _p1); secP(sc, Math.max(t0, th - e), _p0); _pt.subVectors(_p1, _p0);
      return out.crossVectors(_px, _pt);
    };
    const sm = station(Math.max(xa, row.x - e)), sp = station(Math.min(xb, row.x + e));
    for (const th of ths) {
      secP(s, th, _q);
      if (inset) { _q.z *= 1 - inset; _q.y += inset * 0.5; }
      pos[q * 3] = _q.x; pos[q * 3 + 1] = _q.y; pos[q * 3 + 2] = _q.z;
      secP(sp, th, _p1); secP(sm, th, _p0); _px.subVectors(_p1, _p0);
      secP(s, Math.min(t1, th + e), _p1); secP(s, Math.max(t0, th - e), _p0); _pt.subVectors(_p1, _p0);
      _nn.crossVectors(_px, _pt);
      if (_nn.lengthSq() < 1e-20) {
        // a pole (nose or tail tip) or a collapsed row: look just inside the patch
        const xx = row.x + (row.x < (xa + xb) / 2 ? 0.004 : -0.004);
        normalAt(xx, th, _nn);
        if (_nn.lengthSq() < 1e-20) _nn.set(row.x > 0 ? 1 : -1, 0, 0);
      }
      _nn.normalize();
      nor[q * 3] = _nn.x; nor[q * 3 + 1] = _nn.y; nor[q * 3 + 2] = _nn.z;
      q++;
    }
  });
  return { pos, nor, nu, nv };
}
// Both halves of a grid as one geometry: the right half as built, the left mirrored with its winding flipped.
function mirrored(gr: Grid) {
  const { pos, nor, nu, nv } = gr;
  const n = pos.length / 3;
  const P = new Float32Array(n * 6), N = new Float32Array(n * 6);
  P.set(pos); N.set(nor);
  for (let i = 0; i < n; i++) {
    P[(n + i) * 3] = pos[i * 3]; P[(n + i) * 3 + 1] = pos[i * 3 + 1]; P[(n + i) * 3 + 2] = -pos[i * 3 + 2];
    N[(n + i) * 3] = nor[i * 3]; N[(n + i) * 3 + 1] = nor[i * 3 + 1]; N[(n + i) * 3 + 2] = -nor[i * 3 + 2];
  }
  const idx: number[] = [];
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    const a = i * (nv + 1) + j, b = a + nv + 1, c = b + 1, d = a + 1;
    idx.push(a, b, d, b, c, d);
    idx.push(n + a, n + d, n + b, n + b, n + d, n + c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  g.setIndex(idx);
  return g;
}

// Station x's: even spacing, dense toward the two poles, even in angle round each arch so its edge is a clean circle.
function stationXs() {
  const xs: number[] = [];
  const N = 380;
  for (let i = 0; i <= N; i++) xs.push(lerp(XT, XN, i / N));
  for (let i = 1; i < 44; i++) { const s = Math.pow(i / 44, 2.4); xs.push(XN - 0.5 * s, XT + 0.26 * s); }
  for (const xa of [AXF, AXR]) for (let i = 0; i <= 140; i++) xs.push(xa + DXE * Math.cos((i / 140) * Math.PI));
  const special = [X_COWL, X_HEAD, X_C, AXF - DXE, AXF + DXE, AXR - DXE, AXR + DXE];
  xs.push(...special);
  xs.sort((a, b) => a - b);
  const out: number[] = [];
  for (const x of xs) {
    const last = out[out.length - 1];
    if (last !== undefined && x - last < 0.0007) {
      if (special.includes(x)) out[out.length - 1] = x;
      continue;
    }
    out.push(x);
  }
  return out;
}
const within = (xs: number[], a: number, b: number) => xs.filter((x) => x >= a - 1e-9 && x <= b + 1e-9);

/* ================================================================== build */
export type Corner = { x: number; side: 1 | -1; front: boolean; wheel: THREE.Group; spin: THREE.Group };
export type Flare = { sprite: THREE.Sprite; normal: V3 | null; base: number };

export function buildStarCar() {
  const m = makeMaterials();
  const root = new THREE.Group();
  const body = new THREE.Group(); // sprung: everything but the wheels
  root.add(body);
  const iso: THREE.LineSegments[] = [];
  const mesh = (g: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) => {
    const o = new THREE.Mesh(g, mat);
    o.position.set(x, y, z);
    return o;
  };

  /* ---------------------------------------------------------------- body shell */
  const XS = stationXs();
  const NA1 = 60, NA2 = 14, NB = 20, NC = 30, NLO = 26;
  const rowsOf = (a: number, b: number, segs: (s: St) => [number, number, number][]) =>
    within(XS, a, b).map((x) => ({ x, segs: segs(station(x)) }));
  const upTo = (s: St) => (s.x >= X_C ? tGL(s) : tGT(s));
  const shellParts = {
    // sides and shoulders: from the sill / arch edge up to the beltline
    a1: rowsOf(XT, XN, (s) => [[tMin(s), tBelt(s), NA1]]),
    // between the beltline crease and the glass (the C-pillar kick, then the fastback flank)
    a2: rowsOf(XT, X_COWL, (s) => [[tBelt(s), upTo(s), NA2]]),
    // hood centre, split where the windshield's rows split so the cowl line is watertight
    c1: rowsOf(X_COWL, XN, (s) => [[tBelt(s), tGT(s), NB], [tGT(s), HPI, NC]]),
    // roof and fastback
    c2: rowsOf(XT, X_HEAD, (s) => [[tGT(s), HPI, NC]]),
  };
  const glassParts = {
    b1: rowsOf(X_HEAD, X_COWL, (s) => [[tGL(s), tGT(s), NB], [tGT(s), HPI, NC]]),
    b2: rowsOf(X_C, X_HEAD, (s) => [[tGL(s), tGT(s), NB]]),
  };
  const shellGeos = Object.values(shellParts).map((rows) => mirrored(gridOf(rows)));
  const shellGeo = mergeGeometries(shellGeos);
  shellGeos.forEach((g) => g.dispose());
  const shell = mesh(shellGeo, m.clay);
  const shellIn = mesh(shellGeo, m.cabin); // the cabin side of the panels, seen through the visor
  body.add(shell, shellIn);

  const glassGeo = mergeGeometries(Object.values(glassParts).map((rows) => mirrored(gridOf(rows))));
  const visor = mesh(glassGeo, m.field);
  visor.renderOrder = 5;
  body.add(visor);

  // graphite lower body: under the split line, a touch inside the clay so the split reads as a shut line
  const lowRows = (a: number, b: number) => rowsOf(a, b, (s) => [[-HPI, Math.max(-HPI, tSill(s)), NLO]]);
  const lowerGeo = mergeGeometries([
    mirrored(gridOf(lowRows(AXF + DXE, XN), 0.008)),
    mirrored(gridOf(lowRows(AXR + DXE, AXF - DXE), 0.008)),
    mirrored(gridOf(lowRows(XT, AXR - DXE), 0.008)),
  ]);
  const lower = mesh(lowerGeo, m.carbon);
  const lowerIn = mesh(lowerGeo, m.cabin);
  body.add(lower, lowerIn);

  /* ---------------------------------------------------------------- wheel wells */
  {
    const clayRet: number[] = [], liner: number[] = [], walls: THREE.BufferGeometry[] = [];
    const q = new V();
    const strip = (arr: number[], a: V3[], b: V3[]) => {
      for (let i = 0; i < a.length - 1; i++) {
        arr.push(a[i].x, a[i].y, a[i].z, b[i].x, b[i].y, b[i].z, a[i + 1].x, a[i + 1].y, a[i + 1].z);
        arr.push(b[i].x, b[i].y, b[i].z, b[i + 1].x, b[i + 1].y, b[i + 1].z, a[i + 1].x, a[i + 1].y, a[i + 1].z);
      }
    };
    for (const xa of [AXF, AXR]) {
      const xs = within(XS, xa - DXE, xa + DXE);
      const edge: V3[] = [], ret: V3[] = [], inner: V3[] = [];
      for (const x of xs) {
        const s = station(x);
        secP(s, tMin(s), q);
        edge.push(q.clone());
        ret.push(new V(q.x, q.y, q.z - 0.02));
        inner.push(new V(q.x, q.y, ZIN));
      }
      for (const sg of [1, -1]) {
        const mz = (a: V3[]) => a.map((p) => new V(p.x, p.y, p.z * sg));
        if (sg > 0) { strip(clayRet, mz(edge), mz(ret)); strip(liner, mz(ret), mz(inner)); }
        else { strip(clayRet, mz(ret), mz(edge)); strip(liner, mz(inner), mz(ret)); }
      }
      // inner wall: the arch outline down to the floor, at z = ±ZIN
      const sh = new THREE.Shape();
      const yb = yFloor(xa) + 0.02;
      sh.moveTo(xa - DXE, yb);
      sh.lineTo(xa + DXE, yb);
      for (let i = 0; i <= 48; i++) {
        const a = Math.atan2(YS - R, DXE) + (i / 48) * (Math.PI - 2 * Math.atan2(YS - R, DXE));
        sh.lineTo(xa + RA * Math.cos(a), R + RA * Math.sin(a));
      }
      sh.lineTo(xa - DXE, yb);
      for (const sg of [1, -1]) {
        const g = new THREE.ShapeGeometry(sh, 24);
        g.translate(0, 0, sg * ZIN);
        walls.push(g);
      }
      // floor plate under the well, between the inner walls
      const fl = new THREE.PlaneGeometry(2 * DXE, 2 * ZIN);
      fl.rotateX(Math.PI / 2);
      fl.translate(xa, yb, 0);
      walls.push(fl);
    }
    const toGeo = (arr: number[]) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
      g.computeVertexNormals();
      return g;
    };
    body.add(mesh(toGeo(clayRet), m.clay), mesh(toGeo(liner), m.well), mesh(mergeGeometries(walls), m.well));
  }

  /* ---------------------------------------------------------------- construction lines for the build-in */
  {
    const pts: number[] = [];
    const p = new V(), q = new V();
    const inArch = (v: V3) => Math.abs(v.z) > ZIN && archY(v.x) > v.y;
    for (let x = XT + 0.12; x < XN - 0.05; x += 0.26) {
      const s = station(x);
      for (let j = 0; j < 160; j++) {
        secP(s, -HPI + (j / 160) * TAU, p); secP(s, -HPI + ((j + 1) / 160) * TAU, q);
        if (inArch(p) || inArch(q)) continue;
        pts.push(p.x, p.y, p.z, q.x, q.y, q.z);
      }
    }
    for (const th0 of [-1.1, -0.45, 0.12, 0.55, 0.95, 1.25, 1.5]) for (const th of [th0, Math.PI - th0]) {
      for (let i = 0; i < 200; i++) {
        secP(station(lerp(XT, XN, i / 200)), th, p); secP(station(lerp(XT, XN, (i + 1) / 200)), th, q);
        if (inArch(p) || inArch(q)) continue;
        pts.push(p.x, p.y, p.z, q.x, q.y, q.z);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const l = new THREE.LineSegments(g, m.iso);
    l.renderOrder = 3;
    body.add(l);
    iso.push(l);
  }

  /* ---------------------------------------------------------------- the light seam */
  // One thin, straight, continuous line of light across the roof's leading edge, just above the windshield.
  const seamMat = new THREE.ShaderMaterial({
    uniforms: { uFxReveal: FX.reveal, uOn: FX.seam, uHalf: { value: 0.6 } },
    vertexShader: 'varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `uniform float uFxReveal; uniform float uOn; uniform float uHalf; varying vec3 vW;
      void main() {
        if (vW.x < uFxReveal) discard;
        float d = abs(vW.z) / uHalf;
        float k = smoothstep(d * 0.8, d * 0.8 + 0.2, uOn);
        gl_FragColor = vec4(mix(vec3(0.05), vec3(1.0), k), 1.0);
      }`,
  });
  const seamGlow = new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
    alphaMap: canvasTex(4, 64, (c) => {
      const g = c.createLinearGradient(0, 0, 0, 64);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.fillRect(0, 0, 4, 64);
    }, false),
  });
  {
    // The seam runs along the top edge of the visor, right under the roof's leading edge, from roof edge to roof edge.
    const s0 = station(X_HEAD);
    const half = TE * s0.g * 0.94;
    const thEnd = thetaAtZ(s0, half);
    const nz = 64;
    // points along the header, both halves, with the surface normal there
    const line: { p: V3; n: V3 }[] = [];
    for (let i = 0; i <= 2 * nz; i++) {
      const t = i / (2 * nz);
      const th = t <= 0.5 ? lerp(thEnd, HPI, t * 2) : lerp(HPI, Math.PI - thEnd, t * 2 - 1);
      const p = secP(station(X_HEAD + 0.009), th, new V());
      const a = secP(station(X_HEAD + 0.004), th, new V()), b = secP(station(X_HEAD + 0.014), th, new V());
      const c0 = secP(station(X_HEAD + 0.009), th - 1e-4, new V()), c1 = secP(station(X_HEAD + 0.009), th + 1e-4, new V());
      const n = new V().subVectors(b, a).cross(new V().subVectors(c1, c0)).normalize();
      if (n.y < 0) n.negate();
      line.push({ p, n });
    }
    // a ribbon along the line: `across` gives each side of it (in the surface, or straight up for the glow)
    const ribbon = (w: number, lift: number, up: boolean) => {
      const pos: number[] = [], uv: number[] = [], idx: number[] = [];
      const t = new V(), side = new V();
      line.forEach(({ p, n }, i) => {
        const q = line[Math.min(line.length - 1, i + 1)].p, r = line[Math.max(0, i - 1)].p;
        t.subVectors(q, r).normalize();
        if (up) side.set(0, 1, 0); else side.crossVectors(n, t).normalize();
        const c = p.clone().addScaledVector(n, lift);
        const a = c.clone().addScaledVector(side, -w), b = c.clone().addScaledVector(side, w);
        pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
        uv.push(i / (line.length - 1), 0, i / (line.length - 1), 1);
        if (i > 0) { const k = (i - 1) * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
      });
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      return g;
    };
    const light = mesh(ribbon(0.0055, 0.003, false), seamMat);
    const glow = mesh(ribbon(0.05, 0.006, true), seamGlow);
    seamGlow.side = THREE.DoubleSide;
    glow.renderOrder = 6;
    body.add(light, glow);
    seamMat.uniforms.uHalf.value = half;
  }

  /* ---------------------------------------------------------------- headlights: symmetric four-point stars */
  const flares: Flare[] = [];
  const flareTex = flareTexture();
  const flareMat = () => new THREE.SpriteMaterial({ map: flareTex, color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  body.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  const hitBody = (from: V3, dir: V3) => {
    ray.set(from, dir.clone().normalize());
    const h = ray.intersectObject(shell, false)[0];
    return h ? { p: h.point.clone(), n: h.face!.normal.clone() } : null;
  };
  const starShape = (r: number, inner = 0.15) => {
    const i = r * inner, s = new THREE.Shape();
    s.moveTo(0, r);
    s.quadraticCurveTo(i, i, r, 0);
    s.quadraticCurveTo(i, -i, 0, -r);
    s.quadraticCurveTo(-i, -i, -r, 0);
    s.quadraticCurveTo(-i, i, 0, r);
    return s;
  };
  const starGeo = new THREE.ExtrudeGeometry(starShape(0.088, 0.13), { depth: 0.008, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 2, curveSegments: 16 });
  const head: THREE.Mesh[] = [];
  const basis = (n: V3) => {
    const zA = n.clone().normalize(), xA = new V(0, 1, 0).cross(zA).normalize(), yA = zA.clone().cross(xA);
    return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(xA, yA, zA));
  };
  for (const sg of [1, -1]) {
    const h = hitBody(new V(XN + 1, BAND_Y, sg * STAR_Z), new V(-1, 0, 0));
    if (!h) continue;
    // upright, like the emblem: facing out of the face but squared to the vertical
    const nrm = new V(h.n.x, 0, h.n.z).normalize();
    const g = new THREE.Group();
    g.position.copy(h.p).addScaledVector(nrm, 0.002);
    g.quaternion.copy(basis(nrm));
    const st = mesh(starGeo, m.lampHead);
    g.add(st);
    body.add(g);
    head.push(st);
    const fl = new THREE.Sprite(flareMat());
    fl.scale.setScalar(0.5);
    fl.position.copy(h.p).addScaledVector(nrm, 0.05);
    fl.renderOrder = 6;
    body.add(fl);
    flares.push({ sprite: fl, normal: nrm.clone(), base: 0.55 });
  }

  /* ---------------------------------------------------------------- suit plug (right rear quarter) */
  {
    const h = hitBody(new V(PLUG.x, PLUG.y, 3), new V(0, 0, -1));
    if (h) {
      const g = new THREE.Group();
      g.position.copy(h.p);
      g.quaternion.setFromUnitVectors(new V(0, 0, 1), h.n);
      const ring = mesh(new THREE.TorusGeometry(0.052, 0.008, 12, 48), m.ti, 0, 0, 0.002);
      const sock = mesh(new THREE.CylinderGeometry(0.046, 0.046, 0.02, 40), m.dark, 0, 0, -0.006);
      sock.rotation.x = Math.PI / 2;
      g.add(ring, sock);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * TAU + Math.PI / 2;
        const pin = mesh(new THREE.CylinderGeometry(0.0075, 0.0075, 0.02, 10), m.ti, Math.cos(a) * 0.022, Math.sin(a) * 0.022, 0.0);
        pin.rotation.x = Math.PI / 2;
        g.add(pin);
      }
      g.add(mesh(new THREE.SphereGeometry(0.0045, 10, 8), m.cyan, 0.068, 0.0, 0.003));
      body.add(g);
    }
  }

  /* ---------------------------------------------------------------- interior blockout: seats, dash, yoke, pedals */
  {
    const seat = (z: number) => {
      const g = new THREE.Group();
      const cushion = mesh(new RoundedBoxGeometry(0.52, 0.12, 0.5, 4, 0.05), m.seat, 0.02, 0, 0);
      const back = mesh(new RoundedBoxGeometry(0.13, 0.8, 0.52, 4, 0.06), m.seat);
      back.position.set(-0.25, 0.37, 0);
      back.rotation.z = 0.36;
      g.add(cushion, back);
      for (const s of [1, -1]) {
        const bol = mesh(new RoundedBoxGeometry(0.16, 0.62, 0.08, 3, 0.035), m.seat);
        bol.position.set(-0.2, 0.33, s * 0.25);
        bol.rotation.z = 0.36;
        g.add(bol);
      }
      g.position.set(-0.2, 0.66, z);
      g.rotation.z = 0.06;
      return g;
    };
    body.add(seat(-0.4), seat(0.4));
    // console between the seats
    body.add(mesh(new RoundedBoxGeometry(1.0, 0.24, 0.24, 3, 0.05), m.trim, 0.12, 0.6, 0));
    // dash: one slim floating beam under the visor, a thin screen
    body.add(mesh(new RoundedBoxGeometry(0.26, 0.07, 1.46, 3, 0.03), m.trim, 0.98, 1.06, 0));
    const screen = mesh(new RoundedBoxGeometry(0.018, 0.17, 0.34, 2, 0.008), m.dark, 0.86, 1.15, -0.02);
    screen.rotation.z = 0.35;
    body.add(screen);
    // yoke on a sculpted column (Roadster-like): thick tapered column out of the dash, open-top grips
    const yz = -0.4;
    const col = mesh(new THREE.CylinderGeometry(0.055, 0.07, 1, 32), m.trim);
    const ca = new V(0.96, 1.02, yz), cb = new V(0.6, 1.04, yz);
    col.position.copy(ca).add(cb).multiplyScalar(0.5);
    col.scale.set(1, ca.distanceTo(cb), 1);
    col.quaternion.setFromUnitVectors(new V(0, 1, 0), cb.clone().sub(ca).normalize());
    body.add(col);
    const yoke = new THREE.Group();
    const path = new THREE.CatmullRomCurve3([
      new V(0, 0.1, -0.17), new V(0, -0.01, -0.175), new V(0, -0.075, -0.13), new V(0, -0.09, 0),
      new V(0, -0.075, 0.13), new V(0, -0.01, 0.175), new V(0, 0.1, 0.17),
    ], false, 'centripetal');
    yoke.add(mesh(new THREE.TubeGeometry(path, 64, 0.022, 12, false), m.seat));
    const hub = mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 32), m.trim);
    hub.rotation.z = Math.PI / 2;
    yoke.add(hub);
    yoke.position.set(0.58, 1.06, yz);
    yoke.rotation.z = -0.32;
    body.add(yoke);
    for (const dz of [-0.07, 0.08]) {
      const ped = mesh(new RoundedBoxGeometry(0.03, 0.14, 0.07, 2, 0.01), m.trim, 1.08, 0.56, yz + dz);
      ped.rotation.z = 0.4;
      body.add(ped);
    }
  }

  /* ---------------------------------------------------------------- wheels: big, simple, black */
  const corners: Corner[] = [];
  const RIM = 0.37;
  // tyre carcass half-section (r, y), y along the axle: a squarish balloon with soft shoulders
  const prof: THREE.Vector2[] = [];
  for (let i = 0; i <= 32; i++) {
    const a = -HPI + (i / 32) * Math.PI;
    const c = Math.cos(a), s = Math.sin(a);
    prof.push(new THREE.Vector2(RIM + (R - RIM) * Math.pow(c, 2 / 3.2), (TW / 2) * Math.sign(s) * Math.pow(Math.abs(s), 2 / 4)));
  }
  const tyreGeo = new THREE.LatheGeometry(prof, 96);
  tyreGeo.rotateX(Math.PI / 2);
  // the wheel: a recessed graphite disc, a soft dish to a small hub, a fine titanium lip
  const discProf = [new THREE.Vector2(0.0001, 0.0), new THREE.Vector2(0.08, 0.0), new THREE.Vector2(0.09, -0.012), new THREE.Vector2(RIM - 0.02, -0.03), new THREE.Vector2(RIM + 0.004, -0.02)];
  const discGeo = new THREE.LatheGeometry(discProf, 72);
  discGeo.rotateX(Math.PI / 2);
  const barrelGeo = new THREE.CylinderGeometry(RIM, RIM, TW - 0.04, 48, 1, true);
  barrelGeo.rotateX(Math.PI / 2);
  const lipGeo = new THREE.TorusGeometry(RIM - 0.004, 0.006, 8, 96);
  for (const front of [true, false]) for (const side of [1, -1] as const) {
    const x = front ? AXF : AXR;
    const wheel = new THREE.Group();
    const spin = new THREE.Group();
    wheel.add(spin);
    spin.add(mesh(tyreGeo, m.tyre), mesh(barrelGeo, m.dark));
    const disc = mesh(discGeo, m.rim, 0, 0, side * (TW / 2 - 0.012));
    if (side < 0) disc.rotation.y = Math.PI;
    const lip = mesh(lipGeo, m.ti, 0, 0, side * (TW / 2 - 0.03));
    spin.add(disc, lip);
    const inner = mesh(new THREE.CircleGeometry(RIM, 48), m.dark, 0, 0, -side * (TW / 2 - 0.03));
    if (side > 0) inner.rotation.y = Math.PI;
    spin.add(inner);
    root.add(wheel);
    corners.push({ x, side, front, wheel, spin });
  }

  /* ---------------------------------------------------------------- shadows */
  root.traverse((o) => {
    const me = o as THREE.Mesh;
    if (!me.isMesh) return;
    me.castShadow = true;
    me.receiveShadow = true;
    if (!me.customDepthMaterial) me.customDepthMaterial = m.depth;
  });
  for (const o of [visor, shellIn, lowerIn]) o.castShadow = false;
  for (const l of head) l.castShadow = false;
  body.traverse((o) => {
    const me = o as THREE.Mesh;
    if (me.material === seamMat || me.material === seamGlow) { me.castShadow = false; me.receiveShadow = false; }
  });

  /* ---------------------------------------------------------------- pose */
  const state = { lift: 0, out: 0 };
  function pose(st: Partial<typeof state> = {}) {
    Object.assign(state, st);
    body.position.y = state.lift;
    for (const c of corners) c.wheel.position.set(c.x, R, c.side * (TRK + state.out));
  }
  pose();

  function dispose() {
    const mats = new Set<THREE.Material>();
    const geos = new Set<THREE.BufferGeometry>();
    root.traverse((o) => {
      const me = o as THREE.Mesh;
      if (me.geometry) geos.add(me.geometry);
      const mt = me.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mt)) mt.forEach((x) => mats.add(x)); else if (mt) mats.add(mt);
    });
    Object.values(m).forEach((x) => { if ((x as THREE.Material).isMaterial) mats.add(x as THREE.Material); });
    geos.forEach((g) => g.dispose());
    mats.forEach((x) => x.dispose());
    flareTex.dispose();
    seamGlow.alphaMap?.dispose();
  }

  return {
    root, body, corners, flares, iso, pose, dispose,
    lamps: { head, seamGlow },
    mats: m,
  };
}
export type StarCar = ReturnType<typeof buildStarCar>;
