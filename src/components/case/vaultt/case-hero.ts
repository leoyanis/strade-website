/*
 * The case study's hero (#vt-hero): Vaultt's network radiating from the app's icon.
 *
 * Builder 1's engine (../../vaultt/network.ts, 'world' look) does the drawing and the physics; this file
 * only places the hub, shields the copy and plays the beats on a clock:
 *   0.1 s to 2.3 s  the ties draw out of the icon, strongest first, and the people bloom in
 *   0.6 s to 3.5 s  the crowd of builders joins in waves from the middle out, while 23.7k lands on its reels
 *   1.8 s on        a few suggestions are tied in, then a handful of pulses keep it alive
 * The intro plays once and is skipped when the page opens below the hero. As the hero scrolls away the
 * network calms (dims), so the next section starts from a quiet navy.
 * Pointer: hover names a builder, drag throws one, a click on empty space ties a new connection in (all
 * in the engine). The copy and its buttons belong to the page, not the network.
 * Cost: the loop runs only while the hero is on screen and the tab is visible; geometry is read on resize,
 * one getBoundingClientRect per frame for the visible window. Reduced motion / ?still: one finished frame.
 */
import { createNetwork, type Network, type Rect } from '../../vaultt/network';
import { makeLander } from './case-reels';

type Gsap = typeof import('gsap').gsap;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (v: number) => {
  const t = clamp01(v);
  return t * t * (3 - 2 * t);
};
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Sets up the hero. Call once; `gsap` (when loaded) plays the type's entrance. */
export function initHero(o: { still: boolean; gsap?: Gsap }) {
  const sec = document.getElementById('vt-hero');
  const canvas = sec?.querySelector<HTMLCanvasElement>('.vt-hero__net');
  const hub = sec?.querySelector<HTMLElement>('.vt-hub');
  const copy = sec?.querySelector<HTMLElement>('.vt-hero__copy');
  if (!sec || !canvas || !hub || !copy) return;
  const still = o.still;
  const hint = sec.querySelector<HTMLElement>('.vt-hero__hint');
  const numEl = sec.querySelector<HTMLElement>('[data-vn]');
  const reels = numEl && !still ? makeLander(numEl) : null;

  /* ---------- geometry, in canvas px (hub and copy scroll with the canvas, so only a resize moves them) ---------- */
  const geo = { hx: 0, hy: 0, half: 40, shield: [] as Rect[] };
  const measure = () => {
    const c = canvas.getBoundingClientRect();
    const h = hub.getBoundingClientRect();
    geo.hx = h.left + h.width / 2 - c.left;
    geo.hy = h.top + h.height / 2 - c.top;
    geo.half = hub.offsetWidth / 2;
    const r = copy.getBoundingClientRect();
    const pad = 22;
    // a little more room under the copy: on phones the network rises into the space below the credit line
    geo.shield = [{ x: r.left - c.left - pad, y: r.top - c.top - pad, w: r.width + pad * 2, h: r.height + pad * 2 + 36 }];
  };
  measure();

  /* ---------- the beats ---------- */
  // skip the intro when the page opens with the hero mostly scrolled past (a reload further down)
  const r0 = sec.getBoundingClientRect();
  const INTRO = 4.6;
  let introT = still || r0.bottom < innerHeight * 0.4 ? INTRO + 1 : 0;
  let rolled = still ? 1 : -1;
  let calm = 0;
  // set from the start too: a page that opens further down shows no hint when the hero comes back into view
  let away = r0.bottom < innerHeight * 0.62;
  sec.classList.toggle('is-away', away);

  // the crowd's density follows the phone breakpoint: a window that crosses it gets a new network (see resize)
  const lite = () => innerWidth <= 767;
  let netLite = lite();
  const make = () => {
    netLite = lite();
    return createNetwork(canvas, {
      look: 'world',
      seed: 41,
      reduced: still,
      density: netLite ? 'lite' : 'full',
      pointerTarget: sec,
      ignore: (t) => t instanceof Element && !!t.closest('a, button, .vt-hero__copy'),
      onFrame,
    });
  };
  /** Every frame: the intro clock, the hub and shield, the beats, the calm as the hero leaves, the number. */
  const onFrame = (n: Network, dt: number) => {
    if (introT <= INTRO) introT += dt;
    const t = introT;
    n.hub.x = geo.hx;
    n.hub.y = geo.hy;
    // the icon covers the hub: people keep a clear ring around it and the engine draws no "You" there
    n.hub.keepW = geo.half;
    n.hub.keepH = geo.half;
    n.hub.keep = 1;
    n.shield.length = 0;
    for (const s of geo.shield) n.shield.push(s);
    const r = sec.getBoundingClientRect();
    n.view.top = Math.max(0, -r.top);
    n.view.height = innerHeight;
    n.view.clearTop = 64;
    n.beats.sea = smooth(t / 1.3);
    n.beats.reveal = easeInOut(clamp01((t - 0.1) / 2.2));
    n.beats.builders = smooth((t - 0.6) / 2.9);
    // a few suggestions only: the long ties to the outer rings would otherwise cross the copy
    n.beats.connect = 0.08 + 0.2 * smooth((t - 1.8) / 2.4);
    n.beats.feedback = 0.16 * smooth((t - 2.6) / 1.4);
    // leaving: the network calms as the hero scrolls up
    const leave = still ? 0 : smooth(-r.top / (r.height * 0.85));
    calm += (leave - calm) * (dt > 0 ? 1 - Math.exp(-dt * 8) : 1);
    n.beats.calm = calm * 0.85;
    // the "drag a builder" hint goes with the hero: once its bottom edge is above 62% of the screen the next
    // section is arriving under it, and the hint sat at the top of How it works with nothing to drag there
    const isAway = r.bottom < innerHeight * 0.62;
    if (isAway !== away) {
      away = isAway;
      sec.classList.toggle('is-away', away);
    }
    // the number lands with the crowd (once; the reels hold the finished digits afterwards)
    if (reels && rolled < 1) {
      rolled = clamp01((t - 0.75) / 1.25);
      reels.set(rolled);
    }
  };
  let net = make();

  // a page that opens below the hero shows the finished number at once
  if (reels && introT > INTRO) {
    rolled = 1;
    reels.set(1);
  } else if (reels) reels.set(0);

  /* ---------- the loop runs only while it can be seen ---------- */
  let onScreen = false;
  const finishIntro = () => {
    if (introT > INTRO) return;
    introT = INTRO + 1;
    if (reels) {
      rolled = 1;
      reels.set(1);
    }
  };
  const sync = () => {
    if (still) return;
    if (onScreen && !document.hidden) net.start();
    else {
      // leaving mid-intro: come back to the finished state, never a half-played one
      if (net.running && !onScreen) finishIntro();
      net.stop();
    }
  };
  if (still) {
    net.paint();
  } else {
    new IntersectionObserver((entries) => {
      onScreen = entries[entries.length - 1].isIntersecting;
      // the CSS loops (hub rings, the live dot) pause with the network when the hero is off screen
      sec.classList.toggle('is-run', onScreen);
      sync();
    }, { rootMargin: '60px 0px' }).observe(sec);
    document.addEventListener('visibilitychange', sync);
  }

  // dev only: lets the screenshot scripts find a real person to hover and drag
  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__vtHero = net;

  let rt = 0;
  addEventListener('resize', () => {
    clearTimeout(rt);
    rt = window.setTimeout(() => {
      measure();
      if (lite() !== netLite) {
        const was = net.running;
        net.destroy();
        net = make();
        if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__vtHero = net;
        if (still) net.paint();
        else if (was) net.start();
      } else net.resize();
    }, 140);
  });
  // the copy's height changes when the display fonts arrive
  document.fonts?.ready.then(() => {
    measure();
    net.resize();
  });

  // the hint goes once someone has played with the network
  if (hint && !still) {
    sec.addEventListener('pointerdown', (e) => {
      if (e.target instanceof Element && e.target.closest('.vt-hero__copy')) return;
      hint.classList.add('is-gone');
    }, { passive: true });
  }

  /* ---------- the type's entrance (GSAP, once) ---------- */
  sec.classList.remove('is-intro');
  const { gsap } = o;
  if (still || !gsap || introT > INTRO) return;
  const chars = Array.from(sec.querySelectorAll<HTMLElement>('.vt-hero__ch'));
  const ins = Array.from(sec.querySelectorAll<HTMLElement>('[data-vt-in]'));
  const label = numEl?.querySelector<HTMLElement>('.vn__label');
  const tl = gsap.timeline({ defaults: { ease: 'expo.out' } });
  tl.from(chars, { yPercent: 108, duration: 1.15, stagger: 0.05, ease: 'power4.out' }, 0.05)
    .from(hub, { scale: 0.35, rotate: -20, opacity: 0, duration: 1.2, ease: 'back.out(1.7)' }, 0.1)
    .from(ins.slice(0, 2), { y: 22, opacity: 0, duration: 0.9, stagger: 0.12 }, 0.2)
    .from(ins.slice(2), { y: 18, opacity: 0, duration: 0.9, stagger: 0.1 }, 1.05);
  if (label) tl.from(label, { y: 12, opacity: 0, duration: 0.8 }, 1.35);
  // fromTo, not from: the hint's CSS has an opacity transition for its exit, and from() read a mid-transition 0
  if (hint) tl.fromTo(hint, { opacity: 0 }, { opacity: 1, duration: 1.2, ease: 'power2.out', clearProps: 'opacity' }, 3.2);
}
