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
import flat from './flat.json';

/** The act's top edge in the tear strip's own pixels (WestWorld.astro, EDGE). */
const TEAR_EDGE = 22;

/**
 * Phones: the five static layers as images (west.css .w-flat, baked by scripts/west-flat.mjs into public/images/west,
 * their widths and boxes in flat.json). On a screen up to 767 px wide, once #act-west is within two screens (either
 * way), each art box gets a <picture> (AVIF; WebP for browsers without it, but for the sun) at the smallest baked
 * width that is not upscaled there, and each one fetched and decoded gives its art box .is-flat, which shows it in place
 * of the SVG: the frame that reveals the west then draws decoded bitmaps, where it rastered ~900 SVG nodes cold (audit
 * B02). Decoded ahead with img.decode() (and decoding="sync", so a decode the browser dropped in the meantime stalls a
 * frame instead of leaving a hole). A layer whose image fails keeps its SVG, which is what desktop always draws. Not
 * with Save-Data on: the SVG costs no download.
 * WebKit only: Safari and every iOS browser (Arc, Chrome and Firefox on iOS are WebKit too). There the reveal frame went
 * from 74 to 52 ms (iPhone 15 profile); on a Chromium phone the gain was about nil (the images' upload to the GPU only
 * moved a screen earlier) for 20 to 41 MB of decoded images, so Chromium and Gecko keep the live SVG (2026-11-09).
 * WebKit is told by navigator.vendor, which the HTML standard fixes per engine ("Apple Computer, Inc." in WebKit,
 * "Google Inc." in Chromium whatever its user agent string says, "" in Gecko), or by GestureEvent, WebKit's own.
 * The sun is the one layer with a size in CSS px (its disc's box-shadow), so its image is the width whose CSS art box
 * (a third of it, at DPR 3) is the screen's, or just over: its halo comes out the size the live one has there. Past the
 * widest of those (a tablet held upright) the sun stays live.
 */
function initFlat(layer: HTMLElement, act: HTMLElement) {
  if (navigator.vendor !== 'Apple Computer, Inc.' && !('GestureEvent' in window)) return;
  const mq = matchMedia('(max-width: 767px)');
  const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
  const widths = flat.widths;
  const pick = (need: number) => widths.find((w) => w >= need) ?? widths[widths.length - 1];
  let near = false;
  let started = false;
  const start = () => {
    if (started || !near || !mq.matches || saveData) return;
    started = true;
    io.disconnect();
    // the art boxes' width in CSS px: one layout read, once
    const A = layer.querySelector<HTMLElement>('.w-art--sun')?.offsetWidth ?? 0;
    if (!A) return;
    const dpr = window.devicePixelRatio || 1;
    const art = pick(A * dpr);
    const sun = A * 0.98 > widths[widths.length - 1] / 3 ? 0 : pick(Math.max(A * dpr, A * 3 * 0.98));
    for (const [name, { boxes, webp }] of Object.entries(flat.layers)) {
      const w = name === 'sun' ? sun : art;
      const box = layer.querySelector<HTMLElement>(`.w-art--${name}`);
      // where this width's pixels sit in the art box (each width is cut to what it paints)
      const css = (boxes as Record<string, { left: number; top: number; width: number; height: number }>)[w];
      if (!w || !box || !css) continue;
      const pic = document.createElement('picture');
      pic.className = 'w-flat';
      pic.style.cssText = `left:${css.left}%;top:${css.top}%;width:${css.width}%;height:${css.height}%`;
      const avif = document.createElement('source');
      avif.type = 'image/avif';
      avif.srcset = `/images/west/${name}-${w}.avif`;
      const img = document.createElement('img');
      img.className = 'w-flat__img';
      img.alt = '';
      img.decoding = 'sync';
      pic.append(avif, img);
      // under its SVG (the town's lettering stays live on top, west.css) and the box's overlays (the sun has no SVG:
      // after its glow and disc)
      const svg = box.querySelector(':scope > svg');
      if (svg) svg.before(pic);
      else box.append(pic);
      // (no WebP src past the widest WebP, or for the sun: a browser without AVIF then loads nothing, the decode below
      // fails, and the layer keeps its SVG)
      const hasWebp = webp && w <= flat.webpMax;
      if (hasWebp) img.src = `/images/west/${name}-${w}.webp`;
      img
        .decode()
        .catch(() => {
          // a browser that takes the AVIF but cannot decode it gets the WebP
          if (!hasWebp || !img.currentSrc.endsWith('.avif')) throw new Error('west: no image');
          avif.remove();
          return new Promise<void>((ok, fail) => {
            img.onload = () => ok();
            img.onerror = () => fail(new Error('west: no image'));
          }).then(() => img.decode());
        })
        .then(
          () => box.classList.add('is-flat'),
          () => pic.remove(),
        );
    }
  };
  const io = new IntersectionObserver(
    (es) => {
      near = es[es.length - 1].isIntersecting;
      start();
    },
    { rootMargin: '200% 0px 200% 0px' },
  );
  io.observe(act);
  mq.addEventListener?.('change', start);
}

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
  // (with reduced motion too: the reveal is the same)
  initFlat(layer, act);

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
     is after the finale's circle has covered it. Each layer sinks by a share of the screen's height (the layer's own
     box, the theme stack's 100lvh), in px: the layers are only as tall as their art now (west.css), so a yPercent
     would be of that. Worked out again on every refresh */
  const q = (s: string) => layer.querySelector<HTMLElement>(s);
  const sink = (k: number) => () => k * layer.offsetHeight;
  gsap.timeline({
    defaults: { ease: 'none' },
    scrollTrigger: { trigger: act, start: 'top top', end: 'bottom top', scrub: 0.6, invalidateOnRefresh: true },
  })
    .to(q('.w-l--sun'), { y: sink(0.11) }, 0)
    .to(q('.w-l--far'), { y: sink(0.03) }, 0)
    .to(q('.w-l--mid'), { y: sink(0.05) }, 0)
    .to(q('.w-l--town'), { y: sink(0.085) }, 0)
    .to(q('.w-l--near'), { y: sink(0.17) }, 0)
    .to(q('.w-night'), { opacity: 0.8 }, 0)
    .to(q('.w-glows'), { opacity: 1 }, 0);
}
