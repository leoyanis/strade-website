// Shared three.js helpers for the Mobility card (mob-*.ts): the beat contract, a seeded random, camera
// keyframes, glow sprites and clean-up.
import * as THREE from 'three';

export { clamp, smooth, lerp, span } from './mob-timeline';

/** One picture in the card. u: progress over the scene's own window (0..1); P: the whole sequence;
 *  pre: the approach before the stage pins (0..1). Everything is scroll-driven (no clock), so the engine
 *  only draws when the scroll moves. */
export interface Beat {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  update(u: number, P: number, t: number, dt: number, pre: number): void;
  /** draw over the whole stage instead of inside the card (no rounded clip) */
  full?: boolean;
  /** the picture's aspect and size in device pixels; f: the stage and the card in device pixels */
  setAspect(aspect: number, px: { w: number; h: number }, f: Frame): void;
  /** how strongly the brightest pixels glow (the engine's default when left out) */
  bloom?: number;
  /** the level above which pixels bloom (the engine's default when left out) */
  bloomThreshold?: number;
  /** tone-mapping exposure for this picture (1 when left out) */
  exposure?: number;
  dispose(): void;
}
export type Frame = { W: number; H: number; cx: number; cy: number; cw: number; ch: number };
export type BeatCtx = {
  renderer: THREE.WebGLRenderer;
  phone: boolean;
  reduced: boolean;
  /** ask for a frame (an async asset arrived) */
  invalidate: () => void;
};

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Catmull-Rom through keyframes [u, x, y, z], sampled at u (clamped to the ends). */
export function track(keys: number[][], u: number, out = new THREE.Vector3()) {
  const n = keys.length;
  if (u <= keys[0][0]) return out.set(keys[0][1], keys[0][2], keys[0][3]);
  if (u >= keys[n - 1][0]) return out.set(keys[n - 1][1], keys[n - 1][2], keys[n - 1][3]);
  let i = 0;
  while (i < n - 2 && u > keys[i + 1][0]) i++;
  const k0 = keys[Math.max(0, i - 1)];
  const k1 = keys[i];
  const k2 = keys[i + 1];
  const k3 = keys[Math.min(n - 1, i + 2)];
  let t = (u - k1[0]) / (k2[0] - k1[0]);
  t = t * t * (3 - 2 * t); // ease in and out of every key: the camera settles, then moves on
  const cr = (a: number, b: number, c: number, d: number) =>
    0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
  return out.set(cr(k0[1], k1[1], k2[1], k3[1]), cr(k0[2], k1[2], k2[2], k3[2]), cr(k0[3], k1[3], k2[3], k3[3]));
}

/** A soft round glow (canvas texture), for additive sprites. */
let glowTex: THREE.CanvasTexture | null = null;
export function glowTexture() {
  if (glowTex) return glowTex;
  const s = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const g = cv.getContext('2d')!;
  const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.12, 'rgba(255,255,255,0.55)');
  grd.addColorStop(0.4, 'rgba(255,255,255,0.12)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, s, s);
  glowTex = new THREE.CanvasTexture(cv);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}

/** Additive blending that leaves alpha alone (the card composites premultiplied: light adds over the glass). */
export function additive<M extends THREE.Material>(m: M) {
  m.transparent = true;
  m.depthWrite = false;
  m.blending = THREE.CustomBlending;
  m.blendEquation = THREE.AddEquation;
  m.blendSrc = THREE.SrcAlphaFactor;
  m.blendDst = THREE.OneFactor;
  m.blendSrcAlpha = THREE.ZeroFactor;
  m.blendDstAlpha = THREE.OneFactor;
  return m;
}

export function glowSprite(color = 0xffffff, intensity = 1) {
  const m = additive(new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color(color).multiplyScalar(intensity), depthTest: true }));
  return new THREE.Sprite(m);
}

/** Free a scene's GPU resources (geometries, materials, textures). The JS objects stay usable. */
export function disposeScene(root: THREE.Object3D) {
  const seen = new Set<unknown>();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry && !seen.has(m.geometry)) {
      seen.add(m.geometry);
      m.geometry.dispose();
    }
    const mats = (Array.isArray(m.material) ? m.material : m.material ? [m.material] : []) as THREE.Material[];
    for (const mat of mats) {
      if (seen.has(mat)) continue;
      seen.add(mat);
      for (const v of Object.values(mat)) if (v instanceof THREE.Texture && !seen.has(v)) (seen.add(v), v.dispose());
      mat.dispose();
    }
  });
}

/** Yield to the browser between chunks of heavy setup. */
export const breathe = () => new Promise<void>((r) => setTimeout(r, 0));
