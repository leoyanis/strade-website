// Shared GSAP loader for the YouCook page. Every section script calls `loadMotion()`;
// all of them share one debounced ScrollTrigger.refresh() so trigger positions are
// measured after the pinned "How it works" section and the web fonts have settled.
import type { gsap as GSAP } from 'gsap';
import type { ScrollTrigger as ST } from 'gsap/ScrollTrigger';

let timer: number | undefined;
let hooked = false;

export function reducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export async function loadMotion(): Promise<{ gsap: typeof GSAP; ScrollTrigger: typeof ST; refresh: () => void } | null> {
  if (reducedMotion()) return null;
  const { gsap } = await import('gsap');
  const { ScrollTrigger } = await import('gsap/ScrollTrigger');
  gsap.registerPlugin(ScrollTrigger);
  const refresh = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => ScrollTrigger.refresh(), 220);
  };
  if (!hooked) {
    hooked = true;
    // Keep timelines on real time. GSAP's default lag smoothing stretches time after a long
    // frame, which leaves loops and reveals half-finished in throttled or headless renders.
    gsap.ticker.lagSmoothing(0);
    window.addEventListener('load', refresh);
    document.fonts?.ready.then(refresh);
  }
  return { gsap, ScrollTrigger, refresh };
}
