// The work's backdrops on the homepage (src/pages/index.astro): Atlas's, Vaultt's and Endless Pursuit's worlds. Only
// the backgrounds change as if the page were not scrolling: each world is a fixed full-screen layer, and when the
// scroll passes a switch point the next one fades in over it, in place, in about 0.7 s (timed, not scrubbed). The
// content scrolls over them as usual, and scrolling back fades them back. No section edge ever travels up the screen.
//
// - Atlas: its own world (.h-aw, inside #mq-atlas) rises out of the sky with the act while the picked card lands, as
//   before. Under it, .theme--atlas carries its near-black on: it sits right under the act's opaque part and runs to
//   the bottom of the screen, so below the act's last line the screen stays Atlas's (never the sky, never an edge).
// - Atlas to Vaultt, at Vaultt's first switch (vaultt-home.ts marks()): as Atlas's last line leaves the top, the
//   intro rises onto Vaultt's held-still stage, so the navy comes in with it. Never before Atlas's near-black covers
//   the whole screen, so the sky never shows through the fade. Vaultt's world (.theme--vaultt) fades in over Atlas's
//   near-black while Atlas's own world fades out on top of it.
// - Vaultt to Endless Pursuit, as soon as the jobs have unfolded (their last card turned to Applied, vaultt-home.ts
//   marks()): Endless Pursuit's black world (.theme--ep) fades in over Vaultt's at once, quicker (0.5 s), and the
//   star field fades in right after it (ep-section.ts show()); the stars gather into the ∞ from that same point on,
//   with the scroll (ep-section.ts from()). Scrolling back, the stars fade out first and the black lifts.
// - The incoming world always fades in over an opaque outgoing one, so the sky never shows through a fade. A world
//   fully covered by the one above it is hidden (no compositing for nothing), and shown again before it can be seen.
// - Vaultt's network runs only while its world is shown: it holds its last frame while the world fades in or out.
// - The sky sleeps from the moment Atlas's near-black covers the whole screen (or the switch to Vaultt, if that comes
//   first) until the stripes act does (that act has its own cover, index.astro); it is awake whenever the hero's sky
//   could show.
// Reduced motion and ?still: the same switch points, the worlds change at once instead of fading.
// Positions are measured on start, on ScrollTrigger refreshes and on the acts' size changes (document coordinates);
// every scroll update is arithmetic and a few writes, only when something changed.

import type { VaulttWorld } from '../components/vaultt/vaultt-home';
import type { EpWorld } from '../components/ep/ep-section';

type ST = typeof import('gsap/ScrollTrigger').ScrollTrigger;

interface Sky {
  hide(on: boolean): void;
}

const FADE_MS = 700; // a whole fade, 0 to 1
// Endless Pursuit's black comes in quicker (Yanis, 2026-11-08: "as soon as I'm done with the job applications
// unfold, basically the background should already instantly change, fade over to black"), and the stars follow it
const EP_FADE_MS = 500;
const EASE = 'cubic-bezier(0.45, 0, 0.55, 1)';
const HYST = 10; // px of hysteresis on a switch point, so a page resting on one never flickers
// Atlas's world (home.css .h-aw): a 360px fade out of the sky, opaque from 359px down. The near-black under the act
// starts this far below that (hidden under the act's own opaque part), so a frame's lag of its transform behind a
// fast scroll never shows it through the fade
const ATLAS_SOLID = 359 + 40;
// The switch to Vaultt can come once the screen's top is this far into Atlas's fade out of the sky: what is left of
// the sky up there is at most a few percent (the fade's last stretch), and it fades out with Atlas's world
const ATLAS_SKY_GONE = 300;
// how far into the intro's arrival the switch to Vaultt comes (0: as its first item starts to gather)
const AV_AT = 0;

/** A compositor opacity fade that can be turned round from wherever it is. */
class Fade {
  private anim: Animation | null = null;
  private target: number;
  constructor(private el: HTMLElement, initial: number, private ms = FADE_MS) {
    this.target = initial;
    el.style.opacity = String(initial);
  }
  get to() {
    return this.target;
  }
  /** At once (reduced motion, a jump). */
  set(o: number) {
    this.anim?.cancel();
    this.anim = null;
    this.target = o;
    // written out even at 1: Vaultt's layer starts at 0 in its stylesheet
    this.el.style.opacity = String(o);
  }
  go(o: number, done?: () => void) {
    // where it is now (a style read, only when a fade starts or turns round)
    const from = this.anim ? Number(getComputedStyle(this.el).opacity) : this.target;
    this.anim?.cancel();
    this.anim = null;
    this.target = o;
    // the end value sits underneath the animation, so cancelling or finishing it leaves the right opacity
    this.el.style.opacity = String(o);
    const ms = Math.abs(o - from) * this.ms;
    if (ms < 20) {
      done?.();
      return;
    }
    const a = this.el.animate([{ opacity: from }, { opacity: o }], { duration: ms, easing: EASE });
    this.anim = a;
    a.finished
      .then(() => {
        if (this.anim !== a) return;
        this.anim = null;
        done?.();
      })
      .catch(() => {});
  }
}

/** Sets up the backdrops. */
export function createBackdrops(o: { ScrollTrigger: ST; sky: Sky | null; reduced: boolean; vaultt: VaulttWorld | null; ep: EpWorld | null }) {
  const atlas = document.getElementById('mq-atlas');
  const atlasWorld = atlas?.querySelector<HTMLElement>('.h-aw') ?? null;
  const atlasBase = document.querySelector<HTMLElement>('.theme--atlas');
  const vLayer = document.querySelector<HTMLElement>('.theme--vaultt');
  const eLayer = document.querySelector<HTMLElement>('.theme--ep');
  const stripes = document.getElementById('act-stripes');
  if (!atlas || !atlasBase || !vLayer || !eLayer) {
    // no worlds to switch: Endless Pursuit's stars just show, gathering from their own default start
    o.ep?.show(true, true);
    return;
  }
  const { ScrollTrigger, vaultt, ep } = o;
  const instant = o.reduced;

  // the screen's height, kept from resize events (on phones every read of innerHeight runs a layout first)
  let vh = innerHeight;
  // where Atlas's near-black parks when it is below the screen: past the large screen (its own height, 100lvh), not
  // innerHeight, or a phone's toolbar collapsing showed its top along the bottom of the screen (home.css .themes)
  let park = Math.max(vh, atlasBase.offsetHeight);
  addEventListener('resize', () => {
    vh = innerHeight;
    park = Math.max(vh, atlasBase!.offsetHeight);
  }, { passive: true });
  const M = { aTop: 0, av: Infinity, ve: Infinity, stripes: Infinity };
  /** Layout reads: on start, refreshes and the acts' size changes. */
  function measure() {
    const y0 = window.scrollY;
    M.aTop = atlas!.getBoundingClientRect().top + y0;
    vaultt?.measure();
    const mk = vaultt?.marks();
    // never while more than a trace of the sky still shows at the top of Atlas's world
    M.av = Math.max(M.aTop + ATLAS_SKY_GONE, mk ? mk.arrive + AV_AT * mk.arriveLen : M.aTop + ATLAS_SOLID);
    M.ve = mk ? Math.max(M.av + vh * 0.5, mk.done) : Infinity;
    M.stripes = stripes ? stripes.getBoundingClientRect().top + y0 : Infinity;
    // Endless Pursuit's stars hold still from a little above this switch and gather from it
    // (and where Vaultt's jobs have left the screen: with reduced motion its finished ∞ waits for that)
    if (Number.isFinite(M.ve)) ep?.from(M.ve, mk?.clear);
  }

  /* ---------- the layers ---------- */
  const fadeA = atlasWorld ? new Fade(atlasWorld, 1) : null;
  const fadeV = new Fade(vLayer, 0);
  const fadeE = new Fade(eLayer, 0, EP_FADE_MS);
  // Endless Pursuit's world sits over the whole screen, its soft top edge above it, and only fades (it used to follow
  // its section's top edge up the screen)
  eLayer.style.transform = 'translate3d(0, -200px, 0)';
  let baseY = '';
  let world = -1; // 0 Atlas, 1 Vaultt, 2 Endless Pursuit
  let skyHidden = false;
  const show = (el: HTMLElement, on: boolean) => {
    el.style.visibility = on ? '' : 'hidden';
  };

  /** Shows world `to`: a fade from its neighbour, at once after a jump or under reduced motion. */
  function go(to: number) {
    const from = world;
    world = to;
    if (instant || from < 0 || Math.abs(to - from) > 1) {
      fadeA?.set(to === 0 ? 1 : 0);
      fadeV.set(to === 1 ? 1 : 0);
      fadeE.set(to === 2 ? 1 : 0);
      show(atlasBase!, to === 0);
      show(vLayer!, to === 1);
      vaultt?.phase(to === 1 ? 'on' : 'off');
      ep?.show(to === 2, true);
      return;
    }
    if (from === 0 && to === 1) {
      // Atlas to Vaultt: the navy fades in over Atlas's near-black while Atlas's own world fades out on top
      show(vLayer!, true);
      vaultt?.prime();
      vaultt?.phase('in');
      fadeA?.go(0);
      fadeV.go(1, () => {
        show(atlasBase!, false);
        vaultt?.phase('on');
      });
    } else if (from === 1 && to === 0) {
      show(atlasBase!, true);
      vaultt?.phase('out');
      fadeA?.go(1);
      fadeV.go(0, () => {
        show(vLayer!, false);
        vaultt?.phase('off');
      });
    } else if (from === 1 && to === 2) {
      // Vaultt to Endless Pursuit: black over the navy, at once; the network holds its last frame under it, and the
      // stars fade in over the black right after it (their own short delay)
      vaultt?.phase('out');
      fadeE.go(1, () => {
        show(vLayer!, false);
        vaultt?.phase('off');
      });
      ep?.show(true, false);
    } else if (from === 2 && to === 1) {
      // the stars go first (0.3 s), the black lifts with them
      ep?.show(false, false);
      show(vLayer!, true);
      vaultt?.prime();
      vaultt?.phase('in');
      fadeE.go(0, () => vaultt?.phase('on'));
    }
  }

  /** The world for scroll y (with a little hysteresis around the current one), Atlas's near-black and the sky. */
  function update(y: number) {
    // under the act's opaque part and down to the bottom of the screen (whole CSS px, like GSAP's autoRound)
    const b = Math.round(Math.min(park, Math.max(0, M.aTop + ATLAS_SOLID - y)));
    const bt = `translate3d(0, ${b}px, 0)`;
    if (bt !== baseY) {
      baseY = bt;
      atlasBase!.style.transform = bt;
    }
    let to = y < M.av ? 0 : y < M.ve ? 1 : 2;
    if (world >= 0 && Math.abs(to - world) === 1) {
      const th = Math.max(to, world) === 1 ? M.av : M.ve;
      if (to > world ? y < th + HYST : y > th - HYST) to = world;
    }
    if (to !== world) go(to);
    // (also from the switch to Vaultt on: what little of the sky was left at the top freezes as the navy fades in
    // over it, like any outgoing world, instead of drawing on under an opaque layer)
    const hide = (y >= M.aTop + ATLAS_SOLID || world >= 1) && y < M.stripes;
    if (hide !== skyHidden) {
      skyHidden = hide;
      o.sky?.hide(hide);
    }
  }

  measure();
  let first = true;
  const st = ScrollTrigger.create({
    start: 0,
    end: 'max',
    onUpdate: (self) => update(self.scroll()),
    onRefresh: (self) => {
      measure();
      // the first sync takes the state of where the page is at once (a page opened further down)
      if (first) world = -1;
      first = false;
      update(self.scroll());
    },
  });
  update(st.scroll());
  // the acts change size after load (fonts, images, the editor's bar): measure again
  if (typeof ResizeObserver !== 'undefined') {
    let q = 0;
    new ResizeObserver(() => {
      if (q) return;
      q = requestAnimationFrame(() => {
        q = 0;
        measure();
        update(window.scrollY);
      });
    }).observe(document.body);
  }

  // dev only: the screenshot scripts read the switch points and the world
  if (import.meta.env.DEV) {
    (window as unknown as { __bg: unknown }).__bg = {
      M,
      ST: ScrollTrigger,
      get world() {
        return world;
      },
    };
  }
}
