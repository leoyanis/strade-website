/*
 * Landing a VaulttNumber: each digit rolls the last two steps into place (the left ones first), fading in
 * as it rolls, then the unit (k or +) drops in. Every frame shows whole digits sliding through clean
 * windows, and the finished state is the server-rendered number, so no-JS and reduced motion read right.
 *
 * Tried two things first (on the homepage): scrubbing a real odometer with the scroll (a page that stops
 * anywhere left digits frozen half-way between two values, which reads as broken), then slot reels with
 * full turns (random four-digit numbers flashed past, which reads as wrong data).
 */

export interface Reels {
  /** Positions every reel for landing progress t (0 = waiting out of sight, 1 = landed). */
  set(t: number): void;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (v: number) => {
  const t = clamp01(v);
  return t * t * (3 - 2 * t);
};
const expoOut = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
const backOut = (t: number) => 1 + 2.5 * Math.pow(t - 1, 3) + 1.5 * Math.pow(t - 1, 2);

/** Collects a number's reels (`.vn__col`) and its unit (`.vn__sym--unit`) under `el`. */
export function makeReels(el: HTMLElement): Reels {
  const boxes = Array.from(el.querySelectorAll<HTMLElement>('.vn__col'));
  const n = boxes.length;
  const cols = boxes.map((box, i) => ({
    box,
    strip: box.querySelector<HTMLElement>('.vn__strip')!,
    digit: Number(box.style.getPropertyValue('--d')) || 0,
    from: n > 1 ? 0.3 * (i / (n - 1)) : 0,
    // NaN, not -1: a leading 1 waits at 1 - 2 = -1, so a -1 start skipped its first write and the digit
    // stayed visible before the number landed ("1," alone on 1,200+ and 1,500+)
    pos: NaN,
  }));
  const unit = el.querySelector<HTMLElement>('.vn__sym--unit');
  // the fixed symbols between digits (the '.' of 23.7k, the ',' of 1,500+) fade in with the first digits.
  // Left alone they showed at full strength before any digit did: a lone "," over the label on a fast scroll
  const syms = Array.from(el.querySelectorAll<HTMLElement>('.vn__sym:not(.vn__sym--unit)'));
  let symOp = '';
  return {
    set(t: number) {
      const so = t >= 1 ? '' : smooth((t - 0.1) / 0.35).toFixed(3);
      if (so !== symOp) {
        symOp = so;
        for (const s of syms) s.style.opacity = so;
      }
      for (const c of cols) {
        const k = clamp01((t - c.from) / 0.7);
        const pos = t >= 1 ? c.digit : c.digit - 2 * (1 - expoOut(k));
        if (Math.abs(pos - c.pos) < 0.0005) continue;
        c.pos = pos;
        // the strip holds 0-9 and a second 0, so position mod 10 wraps without a jump
        const m = ((pos % 10) + 10) % 10;
        c.strip.style.transform = `translate3d(0, ${(-m * 1.06).toFixed(4)}em, 0)`;
        // a reel fades in as it rolls, so the digits it passes on the way are never read as the number
        c.box.style.opacity = t >= 1 ? '' : smooth(k * 2.2).toFixed(3);
      }
      if (unit) {
        const u = clamp01((t - 0.55) / 0.45);
        const e = u >= 1 ? 1 : backOut(u);
        unit.style.opacity = u >= 1 ? '' : smooth(u * 1.6).toFixed(3);
        unit.style.transform = u >= 1 ? '' : `translate3d(0, ${((1 - e) * -0.35).toFixed(3)}em, 0) scale(${(0.7 + 0.3 * e).toFixed(3)})`;
      }
    },
  };
}

/** Lands every `[data-vn-auto]` number once it is well into view (VaulttNumber's `animate` prop). */
export function mountAutoReels(root: ParentNode = document) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || new URLSearchParams(location.search).has('still')) return;
  const els = Array.from(root.querySelectorAll<HTMLElement>('[data-vn-auto]:not([data-vn-on])'));
  if (!els.length) return;
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (!en.isIntersecting) continue;
      io.unobserve(en.target);
      const reels = (en.target as HTMLElement & { __reels?: Reels }).__reels;
      if (!reels) continue;
      const t0 = performance.now();
      const run = (now: number) => {
        const t = Math.min(1, (now - t0) / 1250);
        reels.set(t);
        if (t < 1) requestAnimationFrame(run);
      };
      requestAnimationFrame(run);
    }
  }, { threshold: 0.6 });
  for (const el of els) {
    el.dataset.vnOn = '1';
    const reels = makeReels(el);
    reels.set(0); // waiting out of sight until it lands
    (el as HTMLElement & { __reels?: Reels }).__reels = reels;
    io.observe(el);
  }
}
