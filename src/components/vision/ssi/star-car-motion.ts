// Motion for /vision/ssi/star-car. Everything is visible without JS; hidden states are only ever set here.
// The hero is the 3D car (viewer.ts, loaded lazily so three.js never blocks the page).
// Reduced motion: the model still loads, but it doesn't build itself or spin, and nothing slides in.

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

export async function initStarCar() {
  const root = document.getElementById('scp');
  if (!root) return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ------------------------------------------------------------------ 3D draft */
  const stage = document.getElementById('scp-stage');
  if (stage) {
    import('./viewer')
      .then(({ mountViewer }) => mountViewer(stage, { reduced }))
      .catch(() => {
        stage.classList.add('is-nogl');
        const fb = stage.querySelector('.scp-fallback') as HTMLElement | null;
        if (fb) fb.hidden = false;
      });
  }

  if (reduced) return;

  let gsap: Any, ScrollTrigger: Any;
  try {
    ({ gsap } = await import('gsap'));
    ({ ScrollTrigger } = await import('gsap/ScrollTrigger'));
  } catch {
    return;
  }
  gsap.registerPlugin(ScrollTrigger);

  const $$ = (s: string, el: ParentNode = root): Any[] => Array.from(el.querySelectorAll(s));

  /* ------------------------------------------------------------------ intro */
  gsap.from($$('.scp-hero .scp-top > *'), { y: 30, opacity: 0, duration: 1, stagger: 0.08, ease: 'power3.out' });
}
