// Scene engine for the /vision/ssi range: one lightweight 2D canvas per category section.
// - Only sections on screen are drawn (IntersectionObserver), from one shared rAF loop.
// - DPR capped; reduced motion = one still frame per change.
// - Each section's state is { p: scroll progress 0..1, step: active product as a float }.
//   Desktop: motion.ts pins the section and feeds p (smoothed here). Phones: steps play on their own.
import { clamp, smooth } from './land-util';
import { energy } from './land-scene-energy';

import type { Scene, SceneFactory } from './land-util';

const FACTORIES: Record<string, SceneFactory> = { energy };

type Slot = {
  el: HTMLElement;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  scene: Scene;
  n: number;
  w: number;
  h: number;
  visible: boolean;
  target: number; // p from scroll
  p: number; // smoothed
  auto: boolean; // phones: steps play on their own
  autoT: number;
  step: number;
  onStep?: (step: number) => void;
};

/** Progress → active step, holding on each product and easing between them. */
export const stepOf = (p: number, n: number) => {
  if (n <= 1) return 0;
  const s = clamp(p) * (n - 1);
  const i = Math.floor(s);
  return Math.min(n - 1, i + smooth(0.3, 0.7, s - i));
};

export type Scenes = {
  setProgress(el: HTMLElement, p: number): void;
  setAuto(el: HTMLElement, on: boolean): void;
  onStep(el: HTMLElement, fn: (step: number) => void): void;
};

export function mountScenes(root: HTMLElement, reduced: boolean): Scenes {
  const phone = () => innerWidth < 901;
  const slots: Slot[] = [];
  for (const el of Array.from(root.querySelectorAll<HTMLElement>('[data-scene]'))) {
    const make = FACTORIES[el.dataset.scene ?? ''];
    const canvas = el.querySelector<HTMLCanvasElement>('.ssi-stage canvas');
    const ctx = canvas?.getContext('2d');
    if (!make || !canvas || !ctx) continue;
    const n = el.querySelectorAll('.ssi-p').length || 1;
    try {
      const invalidate = () => {
        const s = slots.find((x) => x.el === el);
        if (s?.visible) (reduced ? still(s) : wake());
      };
      const scene = make(ctx, { phone: phone(), reduced, n, el, invalidate });
      slots.push({ el, canvas, ctx, scene, n, w: 0, h: 0, visible: false, target: 0, p: 0, auto: !reduced, autoT: 0, step: 0 });
    } catch (err) {
      if (import.meta.env.DEV) console.error('[ssi] scene', el.dataset.scene, err);
    }
  }

  const size = (s: Slot) => {
    const r = s.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width));
    const h = Math.max(1, Math.round(r.height));
    const dpr = Math.min(devicePixelRatio || 1, phone() ? 2 : 1.6);
    s.w = w;
    s.h = h;
    s.canvas.width = Math.round(w * dpr);
    s.canvas.height = Math.round(h * dpr);
    s.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    s.scene.resize(w, h);
  };

  const t0 = performance.now();
  let last = t0;
  let raf = 0;
  const STILL_T = 7.5;

  const render = (s: Slot, t: number, dt: number) => {
    if (s.auto) {
      // phones: hold each product ~3.4 s, ease to the next
      s.autoT += dt;
      const per = 3.4;
      const k = (s.autoT / per) % s.n;
      const i = Math.floor(k);
      const f = smooth(0.78, 1, k - i);
      s.step = i === s.n - 1 ? (1 - f) * (s.n - 1) : i + f; // last → first eases back
      s.p = s.n > 1 ? s.step / (s.n - 1) : 0;
    } else {
      s.p += (s.target - s.p) * (reduced ? 1 : 1 - Math.exp(-dt * 7));
      s.step = stepOf(s.p, s.n);
    }
    s.ctx.clearRect(0, 0, s.w, s.h);
    s.scene.draw(t, s.p, s.step, dt);
    s.onStep?.(s.step);
  };

  const frame = (now: number) => {
    raf = 0;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = (now - t0) / 1000;
    let any = false;
    for (const s of slots) {
      if (!s.visible) continue;
      any = true;
      render(s, t, dt);
    }
    if (any && !document.hidden) raf = requestAnimationFrame(frame);
  };
  const wake = () => {
    if (reduced) return;
    if (!raf) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
  };
  const still = (s: Slot) => {
    if (!s.w) size(s);
    render(s, STILL_T, 0);
  };

  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const s = slots.find((x) => x.el === e.target);
        if (!s) continue;
        s.visible = e.isIntersecting;
        if (s.visible) {
          if (!s.w) size(s);
          if (reduced) still(s);
        }
      }
      wake();
    },
    // The root is the screen shrunk by 1px top and bottom: a section only counts while it is really on screen. With
    // '10% 0px' the Energy loop kept drawing at the bottom of the page, the section a whole end screen above the fold
    // (still within 10%, or touching the top edge, which an observer counts as intersecting). The entering edge needs
    // no head start: the stage fades in from transparent there (ssi.astro).
    { rootMargin: '-1px 0px' },
  );
  slots.forEach((s) => io.observe(s.el));

  let rt: number | undefined;
  addEventListener('resize', () => {
    clearTimeout(rt);
    rt = window.setTimeout(() => {
      slots.forEach((s) => {
        size(s);
        if (reduced && s.visible) still(s);
      });
    }, 150);
  });
  document.addEventListener('visibilitychange', () => !document.hidden && wake());

  const find = (el: HTMLElement) => slots.find((s) => s.el === el);
  return {
    setProgress(el, p) {
      const s = find(el);
      if (!s) return;
      s.target = clamp(p);
      if (reduced && s.visible) still(s);
    },
    setAuto(el, on) {
      const s = find(el);
      if (!s) return;
      s.auto = on && !reduced;
      if (!s.auto) s.p = s.target;
    },
    onStep(el, fn) {
      const s = find(el);
      if (s) s.onStep = fn;
    },
  };
}

