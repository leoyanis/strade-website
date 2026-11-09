// The app's motion system, ported for the web: Flutter's SpringDescription.withDurationAndBounce
// (mass 1), the step response of each spring as an easing for GSAP, and a small stateful spring for
// things that follow a pointer. Values are AppMotion's (lib/ui/tokens.dart in the app repo).

export type Spring = { k: number; c: number; settle: number };

/**
 * A spring from a duration and a bounce, exactly as Flutter builds one: stiffness 4π²m/d²,
 * damping ratio 1 - bounce (or 1/(1 + bounce) when the bounce is 0 or less).
 * The settle time is measured once, as the app's SpringCurve does, so tweens know how long to run.
 */
export function springOf(durationMs: number, bounce = 0): Spring {
  const d = durationMs / 1000;
  const k = (4 * Math.PI * Math.PI) / (d * d);
  const zeta = bounce > 0 ? 1 - bounce : 1 / (bounce + 1);
  const c = zeta * 2 * Math.sqrt(k);
  const s: Spring = { k, c, settle: 1 };
  // Settled when within 0.1% of the end and slower than 0.01/s (Flutter's tolerance).
  let t = 0;
  let prev = 0;
  while (t < 3) {
    t += 1 / 240;
    const x = springX(s, t);
    const v = (x - prev) * 240;
    prev = x;
    if (Math.abs(1 - x) < 1e-3 && Math.abs(v) < 0.01) break;
  }
  s.settle = t;
  return s;
}

/** Where a spring released from 0 towards 1 (at rest) is after t seconds: the closed form. */
export function springX(s: Spring, t: number): number {
  const w0 = Math.sqrt(s.k);
  const zeta = s.c / (2 * w0);
  if (zeta < 1 - 1e-9) {
    const wd = w0 * Math.sqrt(1 - zeta * zeta);
    return 1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t));
  }
  if (zeta <= 1 + 1e-9) return 1 - Math.exp(-w0 * t) * (1 + w0 * t);
  const r = Math.sqrt(zeta * zeta - 1);
  const r1 = -w0 * (zeta - r);
  const r2 = -w0 * (zeta + r);
  return 1 - (r2 * Math.exp(r1 * t) - r1 * Math.exp(r2 * t)) / (r2 - r1);
}

/** A spring as a GSAP ease over its own settle time: pass `duration: s.settle` with it. */
export const easeOf = (s: Spring) => (p: number) => (p >= 1 ? 1 : springX(s, p * s.settle));

/** AppMotion's springs. */
export const SPRING = {
  snappy: springOf(280, 0.1),
  smooth: springOf(420, 0),
  bouncy: springOf(500, 0.35),
  sheet: springOf(620, 0.18),
  roll: springOf(600, 0.14),
  land: springOf(700, 0.22),
};

/**
 * A value that follows a target on a spring, integrated per frame (semi-implicit Euler in small
 * substeps, so a stiff spring stays stable at 30 fps). Used for the phone's turn and explode,
 * which follow the pointer rather than a fixed tween.
 */
export class Follow {
  x: number;
  v = 0;
  target: number;
  constructor(public spring: Spring, x0: number) {
    this.x = x0;
    this.target = x0;
  }
  /** Advances by dt seconds; true while it is still moving. */
  step(dt: number): boolean {
    const { k, c } = this.spring;
    let left = Math.min(dt, 0.064);
    while (left > 0) {
      const h = Math.min(left, 1 / 240);
      this.v += (k * (this.target - this.x) - c * this.v) * h;
      this.x += this.v * h;
      left -= h;
    }
    const moving = Math.abs(this.target - this.x) > 1e-4 || Math.abs(this.v) > 1e-3;
    if (!moving) {
      this.x = this.target;
      this.v = 0;
    }
    return moving;
  }
}

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
// Flutter's curves, for the moments that use them.
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOut = (t: number) => cubic(0.0, 0.0, 0.58, 1.0, t);
export const easeIn = (t: number) => cubic(0.42, 0.0, 1.0, 1.0, t);
export const easeInOut = (t: number) => cubic(0.42, 0.0, 0.58, 1.0, t);

/** A CSS-style cubic-bezier evaluated at t (Flutter's Curves.easeOut is (0, 0, 0.58, 1)). */
export function cubic(x1: number, y1: number, x2: number, y2: number, t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  // Newton on x(u) = t, then y(u).
  let u = t;
  for (let i = 0; i < 6; i++) {
    const x = 3 * (1 - u) * (1 - u) * u * x1 + 3 * (1 - u) * u * u * x2 + u * u * u - t;
    const dx = 3 * (1 - u) * (1 - u) * x1 + 6 * (1 - u) * u * (x2 - x1) + 3 * u * u * (1 - x2);
    if (Math.abs(dx) < 1e-6) break;
    u = clamp(u - x / dx, 0, 1);
  }
  return 3 * (1 - u) * (1 - u) * u * y1 + 3 * (1 - u) * u * u * y2 + u * u * u;
}
