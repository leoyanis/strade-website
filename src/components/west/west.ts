// The west act's motion (index.astro #act-west, its world in WestWorld.astro, styles in west.css).
//
// - The reveal: the world is a fixed layer. Its wrapper (.w-wipe) is moved down to the act's top edge and the
//   world inside it (.w-wipe__inner) moved back up by the same amount, so the edge sweeps up over a world that
//   stays put, glued to the act's top like the blueprint sheet. Transforms only: the blueprint's clip-path
//   repaints every frame, this does not. The blueprint's torn edge (.w-tear) rides the same edge, unclamped, so it
//   leaves through the top of the screen instead of parking under the nav.
// - The scroll: while the act scrolls the camera tilts up. Layers sink faster the nearer they are, the sun sinks
//   behind the mesas, the night layer darkens the sky and the first stars come out, and the windows brighten.
//   The finale's circle then opens on the real night sky (index.astro).
// - Loops (dust, tumbleweeds, the hawk, the sign, the windows, the shimmer, the poster's sway) are CSS animations;
//   index.astro's observer pauses them while the act is off screen. Reduced motion and ?still get the still scene:
//   no scrub, no loops (.w-still), but the reveal still follows the edge (it is scrolling, not animation).
// Layout is read only on refresh and resize (README rule 2): the act's document top is cached, the scroll comes
// from ScrollTrigger, and the screen height from resize events.

import type { gsap as GSAP } from 'gsap';
import type { ScrollTrigger as ST } from 'gsap/ScrollTrigger';

/** The act's top edge in the tear strip's own pixels (WestWorld.astro, EDGE). */
const TEAR_EDGE = 22;

/**
 * Wires the west act: its reveal, its scroll-linked camera and its still mode. Called from index.astro once GSAP
 * has loaded (in reduced motion too), before the reduced-motion early return. Returns nothing; safe to call when the
 * act is missing.
 */
export function initWest({ gsap, ScrollTrigger, reduced }: { gsap: typeof GSAP; ScrollTrigger: typeof ST; reduced: boolean }) {
  const act = document.getElementById('act-west');
  const layer = document.querySelector<HTMLElement>('.theme--west');
  const wipe = layer?.querySelector<HTMLElement>('.w-wipe');
  const inner = layer?.querySelector<HTMLElement>('.w-wipe__inner');
  const tear = layer?.querySelector<HTMLElement>('.w-tear');
  if (!act || !layer || !wipe || !inner || !tear) return;
  if (reduced) {
    layer.classList.add('w-still');
    act.classList.add('w-still');
  }

  /* ---------- the reveal, glued to the act's top edge ---------- */
  // Where the wipe and the tear park while the act is below the screen: past the large screen (the layer's own height,
  // 100lvh, home.css .themes), not innerHeight. Parked at innerHeight, both showed along the bottom of the screen in
  // Mobile Safari as soon as its toolbar collapsed, a cream and brown band in the dark between Atlas and Vaultt
  // (iOS 26.3, 2026-11-08), and nothing repainted them on resize.
  let vh = Math.max(window.innerHeight, layer.offsetHeight);
  let top = act.getBoundingClientRect().top + window.scrollY;
  const measure = () => {
    top = act.getBoundingClientRect().top + window.scrollY;
  };
  // whole CSS pixels, as GSAP's autoRound would (README rule 10); each style written only when it changed
  let lastEdge = NaN;
  let lastTear = NaN;
  const paint = (scroll: number) => {
    const raw = Math.round(top - scroll);
    const edge = Math.min(Math.max(raw, 0), vh);
    if (edge !== lastEdge) {
      lastEdge = edge;
      wipe.style.transform = `translate3d(0, ${edge}px, 0)`;
      inner.style.transform = `translate3d(0, ${-edge}px, 0)`;
    }
    // the tear follows the edge past the top of the screen, then parks out of sight (wholly below the stack: at
    // vh + 20 its top 2px stayed inside it, a thin cream line along the bottom once a phone's toolbar collapsed)
    const t = Math.min(Math.max(raw, -80), vh + TEAR_EDGE + 8) - TEAR_EDGE;
    if (t !== lastTear) {
      lastTear = t;
      tear.style.transform = `translate3d(0, ${t}px, 0)`;
    }
  };
  const fromST = (self: ST) => paint(self.scroll());
  ScrollTrigger.create({
    trigger: act, start: 'top bottom', end: 'top top-=120',
    onUpdate: fromST, onLeave: fromST, onLeaveBack: fromST, onEnter: fromST, onEnterBack: fromST,
    onRefresh: (self) => {
      measure();
      fromST(self);
    },
  });
  addEventListener('resize', () => {
    vh = Math.max(window.innerHeight, layer.offsetHeight);
    paint(window.scrollY);
  }, { passive: true });
  // the act moves when anything above it changes height (fonts, images, the editor): measured, never per frame
  new ResizeObserver(() => {
    measure();
    paint(window.scrollY);
  }).observe(document.body);
  paint(window.scrollY);

  if (reduced) return;

  /* ---------- the camera tilts up as the act scrolls ----------
     From the act's top at the top of the screen (the full scene, as revealed) until its bottom leaves the top, which
     is after the finale's circle has covered it. yPercent is of the screen's height (the layers are full-screen). */
  const q = (s: string) => layer.querySelector<HTMLElement>(s);
  gsap.timeline({
    defaults: { ease: 'none' },
    scrollTrigger: { trigger: act, start: 'top top', end: 'bottom top', scrub: 0.6 },
  })
    .to(q('.w-l--sun'), { yPercent: 11 }, 0)
    .to(q('.w-l--far'), { yPercent: 3 }, 0)
    .to(q('.w-l--mid'), { yPercent: 5 }, 0)
    .to(q('.w-l--town'), { yPercent: 8.5 }, 0)
    .to(q('.w-l--near'), { yPercent: 17 }, 0)
    .to(q('.w-night'), { opacity: 0.8 }, 0)
    .to(q('.w-glows'), { opacity: 1 }, 0);
}
