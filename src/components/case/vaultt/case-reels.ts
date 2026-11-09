/*
 * Lands a VaulttNumber on the case study: builder 1's reels (../../vaultt/number-reels.ts) roll the digits,
 * fade the fixed symbols in between ('.' and ',') with the first digits and drop the unit; this wrapper only
 * skips repeated values and, for the How steps, brings the label in with the number.
 * (The symbol fade lived here first; it moved into the reels so the homepage gets it too.)
 */
import { makeReels } from '../../vaultt/number-reels';

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (v: number) => {
  const t = clamp01(v);
  return t * t * (3 - 2 * t);
};

export interface Lander {
  /** 0 = waiting out of sight, 1 = landed (the server-rendered finished number). */
  set(t: number): void;
}

/** Wraps one `[data-vn]` element. Writes styles only when t changes. `label` also brings the line under
 *  the number in with it (the How steps; the hero's label has its own entrance). */
export function makeLander(el: HTMLElement, o: { label?: boolean } = {}): Lander {
  const reels = makeReels(el);
  const label = o.label ? el.querySelector<HTMLElement>('.vn__label') : null;
  let last = -1;
  return {
    set(t: number) {
      const v = clamp01(t);
      if (v === last) return;
      last = v;
      reels.set(v);
      if (label) {
        const lp = smooth((v - 0.3) / 0.45);
        label.style.opacity = v >= 1 ? '' : lp.toFixed(3);
        label.style.transform = v >= 1 ? '' : `translate3d(0, ${((1 - lp) * 12).toFixed(1)}px, 0)`;
      }
    },
  };
}
