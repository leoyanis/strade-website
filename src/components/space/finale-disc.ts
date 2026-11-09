// The finale's night circle as a disc scaled on the compositor (index.astro .fin-disc, home.css).
//
// The circle used to be three clips rewritten on every scroll update: circle() on the lifted sky canvas and on the
// finale's tint layer, and a path() on the west act's cards (#about, 1686 px tall on a phone) with the circle cut
// out. Each is a mask pass over a large layer per frame, written from the main thread, and on a phone, where the page
// scrolls on the compositor ahead of the script, the cards' cut edge trailed the sky's (audit B03, B04, sys-06).
//
// Now the night is a disc as large as the circle gets (centred on the theme stack's bottom middle, its radius the top
// corners' distance), scaled from a point to whole; its inner box is scaled back by the inverse, so what it holds
// stays put on the screen at 1:1 and never re-rasters. It holds only canvases: the sky's WebGL canvas, moved in from
// .themes while the night shows and back when it is gone (a WebGL canvas keeps its context through a move; it sizes
// itself from its client box, which is the same in both places), and .fin-tint, the faint nebula that sat over the
// sky as a CSS layer, drawn here once per resize. The disc lies in the finale's section, which stacks above the west
// act, so it covers the cards by its place in the order, with no clip on them at all. The radius is a straight line
// in the scroll (finale-flight.ts radius()), so with scroll-driven animations both scales run on the scroll itself
// (home.css, .is-timeline: ranges written here in px of the page's scroll on every refresh), in the same frame as the
// scroll; without them paint() writes the same two scales. The flight canvas has a disc of its own (.fin-disc--flight)
// after the stage, driven the same way, so the star and its spray are cut by the very same circle.
//
// Costs: no layout reads per frame; per scroll update only the fallback's two scale writes (when they change) and,
// twice per pass, the sky's move.

import { setScrollRanges } from './scroll-ranges';

/** The smallest scale the disc animates from (1.2^-36: the inverse's keyframes are 36 segments of ratio 1.2, home.css). */
export const DISC_X0 = Math.pow(1.2, -36);

export type FinaleDisc = {
  /** Every ScrollTrigger refresh, once the wipe's trigger has its start: where the circle's centre is, how large the
   * disc is, and the stretch of the page's scroll over which it grows (the radius is rk * s / sWipe, s px since the
   * wipe's start, as finale-flight.ts draws it). */
  layout: (o: { start: number; rk: number; sWipe: number }) => void;
  /** One scroll update, with the circle's radius now (px). */
  paint: (R: number) => void;
  /** The circle's centre on the screen and the disc's full radius (the top corners' distance), from the last layout. */
  geo: { cx: number; cy: number; rd: number };
};

export function mountFinaleDisc(o: {
  section: HTMLElement;
  discs: HTMLElement[];
  tint: HTMLCanvasElement;
  sky: HTMLCanvasElement | null;
  themes: HTMLElement;
}): FinaleDisc {
  const { section, discs, tint, sky, themes } = o;
  const inner = (d: HTMLElement) => d.firstElementChild as HTMLElement;
  const night = inner(discs[0]);
  const timeline = typeof CSS !== 'undefined' && CSS.supports('animation-timeline: scroll()');
  section.classList.add('has-disc');
  // (finale-flight.ts toggles the same class for the stage's animations, from the same test)
  section.classList.toggle('is-timeline', timeline);
  // the discs exist (display, layers) only within a screen of the finale (home.css .is-near)
  new IntersectionObserver(([e]) => section.classList.toggle('is-near', e.isIntersecting), { rootMargin: '100% 0px 100% 0px' }).observe(section);
  const geo = { cx: 0, cy: 0, rd: 1 };
  let tw = 0;
  let th = 0;
  let xWas = NaN; // the fallback's last written scale
  let skyIn = false; // the sky canvas is in the disc

  // The nebula, drawn once per size: home.css's two radial gradients (ellipses in % of the screen, a colour fading to
  // nothing at 70% of the ray), the purple first and the cyan over it as CSS stacks them; over an opaque night of its
  // own when there is no sky. Half the screen's CSS resolution: it is only soft gradients, scaled up smoothly.
  const drawTint = (w: number, h: number) => {
    const W = Math.max(1, Math.round(w / 2));
    const H = Math.max(1, Math.round(h / 2));
    if (W === tw && H === th) return;
    tw = W;
    th = H;
    tint.width = W;
    tint.height = H;
    const g = tint.getContext('2d');
    if (!g) return;
    g.clearRect(0, 0, W, H);
    if (!sky) {
      g.fillStyle = '#050505';
      g.fillRect(0, 0, W, H);
    }
    const blob = (rx: number, ry: number, x: number, y: number, rgb: string, a: number) => {
      const cx = x * W;
      const cy = y * H;
      const sx = rx * W;
      const sy = ry * H;
      g.setTransform(sx, 0, 0, sy, cx, cy);
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, 1);
      gr.addColorStop(0, `rgba(${rgb},${a})`);
      gr.addColorStop(0.7, `rgba(${rgb},0)`);
      gr.addColorStop(1, `rgba(${rgb},0)`);
      g.fillStyle = gr;
      g.fillRect(-cx / sx, -cy / sy, W / sx, H / sy);
      g.setTransform(1, 0, 0, 1, 0, 0);
    };
    if (sky) {
      blob(0.5, 0.6, 0.86, 0.26, '123,47,255', 0.1);
      blob(0.6, 0.5, 0.18, 0.74, '0,229,255', 0.07);
    } else {
      blob(0.5, 0.6, 0.85, 0.3, '123,47,255', 0.2);
      blob(0.6, 0.5, 0.2, 0.7, '0,229,255', 0.16);
    }
  };

  const layout = ({ start, rk, sWipe }: { start: number; rk: number; sWipe: number }) => {
    // the theme stack's box: its width without a scrollbar, its height 100lvh (the circle's centre is its bottom)
    const w = themes.clientWidth || innerWidth;
    const h = Math.max(themes.clientHeight, innerHeight);
    geo.cx = w / 2;
    geo.cy = h;
    geo.rd = Math.ceil(Math.hypot(geo.cx, geo.cy)) + 2;
    // where the radius rk * s / sWipe reaches DISC_X0 of the disc and all of it
    const s1 = (sWipe * geo.rd) / Math.max(1, rk);
    const st = section.style;
    st.setProperty('--fd-cx', `${geo.cx}px`);
    st.setProperty('--fd-cy', `${geo.cy}px`);
    st.setProperty('--fd-r', `${geo.rd}px`);
    // (and again a frame later, for Chromium: scroll-ranges.ts)
    setScrollRanges('fin-disc', section, { '--fd-a': start + DISC_X0 * s1, '--fd-b': start + s1 });
    drawTint(w, h);
    xWas = NaN;
  };

  const paint = (R: number) => {
    // the sky into the disc while the night shows, back to the theme stack (first, as starfield.ts mounted it) after
    if (sky && R > 0 !== skyIn) {
      skyIn = R > 0;
      if (skyIn) night.prepend(sky);
      else themes.prepend(sky);
    }
    // The same two scales from the script, written only when they change. Without scroll-driven animations they are
    // the circle; with them the animations win over them and run on the scroll itself, and these are what stays when
    // something cancels the animations (a screenshot taken with animations disabled, as the perf harness's are)
    let x = R / geo.rd;
    x = x < DISC_X0 ? 0 : Math.min(1, Math.round(x * 1e6) / 1e6);
    if (x === xWas) return;
    xWas = x;
    for (const d of discs) {
      d.style.scale = String(x);
      inner(d).style.scale = x > 0 ? String(1 / x) : '';
    }
  };

  return { layout, paint, geo };
}
