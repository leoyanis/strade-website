// Shared helpers and types for the /vision/ssi category scenes (land-scene-*.ts).
export type SceneOpts = {
  phone: boolean;
  reduced: boolean;
  n: number;
  /** The scene's section (for data-* settings). */
  el: HTMLElement;
  /** Ask for one more frame (e.g. after an async asset arrives while the loop is idle). */
  invalidate: () => void;
};
export type Scene = {
  resize(w: number, h: number): void;
  /** t seconds, p progress 0..1, step active product (float, 0..n-1) */
  draw(t: number, p: number, step: number, dt: number): void;
};
export type SceneFactory = (ctx: CanvasRenderingContext2D, o: SceneOpts) => Scene;

export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const smooth = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
/** How lit product i is when the active step is `step` (1 on it, 0 a full step away). */
export const near = (step: number, i: number) => 1 - clamp(Math.abs(step - i));


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
function hash(ix: number, iy: number, s: number) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(s, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
export function noise(x: number, y: number, s = 0) {
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
export function fbm(x: number, y: number, oct = 4, s = 0) {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let f = 1;
  for (let i = 0; i < oct; i++) {
    sum += amp * noise(x * f, y * f, s + i * 101);
    norm += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return sum / norm;
}
/** Soft round light: a radial gradient blob, drawn additively by the caller. */
export function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, a: number, rgb = '255,255,255') {
  if (a <= 0.002 || r <= 0.2) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${rgb},${a})`);
  g.addColorStop(0.25, `rgba(${rgb},${a * 0.35})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}
export const CYAN = '0,229,255';
