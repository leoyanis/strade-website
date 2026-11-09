/*
 * The homepage's Vaultt section (#mq-vaultt): a stage that holds still while the scroll moves four panels through it,
 * in front of its world's network.
 *
 * - The world (.theme--vaultt, VaulttWorld.astro) is a fixed full-screen layer. src/scripts/backdrops.ts fades it in
 *   over Atlas's world at the intro's switch and Endless Pursuit's over it at the end, and tells this module which
 *   phase it is in (phase()): the network runs only while the world is shown ('on') and holds its last frame while it
 *   fades. Its hub stays in one place for the whole act, behind the cards' column (Yanis, 2026-11-08: the background
 *   stays completely still; it used to glide after whichever item showed most, so the rays' centre moved with the
 *   scroll). The beats still change what it shows, in place: the crowd joins with builders, suggestions are tied in as
 *   the numbers pass.
 * - The stage (.vx__stage, fixed to the screen) shows one panel at a time: the intro (copy and phones), builders,
 *   projects, jobs. Everything on it follows the scroll and nothing plays on its own (Yanis, 2026-11-08, after trying
 *   switches that a little scroll started and that then ran by themselves: "remove the guided scrolling from
 *   everywhere. that is terrible, even from vaultt"). The section is the act's length of scroll, and each panel gets a
 *   switch (SWITCH of a screen) and then a hold (HOLD). Across a switch the panel showing slides up and scatters as it
 *   nears the top while the next rises from about 10% above the bottom and gathers in: a page stopped half way leaves
 *   both half way, and scrolling back runs it backwards exactly. Across a hold the panel stays put and its own moments
 *   run with the scroll (builders' fan opens a touch, projects loosen, the last job turns to Applied), done a little
 *   before the hold ends. Then the jobs leave like the rest of the page ("the last part of vaultt should scroll up like
 *   regular instead of having that animation"): their panel moves up 1:1 with the scroll while Endless Pursuit comes up
 *   under it, and Endless Pursuit's world comes in at that same point (marks().done, backdrops.ts).
 * - Each item's look comes from one value, v: 0 waiting below, 1 formed, 2 gone above, a function of the scroll alone.
 *   A number's letters come out of a scattered cloud, blurred to sharp, and leave upward the same way
 *   (number-chaos.ts); its cards are dealt in and flung away (vaultt-cards.ts); the copy and the phones fade and lift.
 * - Nothing here reads layout per frame: boxes and switch points are measured on start, resize, fonts, the body's size
 *   changes and ScrollTrigger refreshes (backdrops.ts asks). The panels are written once per scrolled frame and nothing
 *   runs while the page is still; the network's loop runs only while the world is shown, the iPhone's map only while
 *   the intro shows.
 * Reduced motion and ?still: the same points; each panel comes in at once half way through its switch (the intro at
 * its switch's start, with its world), every item formed and still, and the jobs leave with the page.
 */
import { createNetwork, type Network } from './network';
import { makeChaos, type Chaos } from './number-chaos';
import { makeCards, type Cards } from './vaultt-cards';

type Gsap = typeof import('gsap').gsap;
type ST = typeof import('gsap/ScrollTrigger').ScrollTrigger;

/** What src/scripts/backdrops.ts needs from Vaultt's world. */
export interface VaulttWorld {
  /** 'off' hidden, 'in' fading in, 'on' shown, 'out' fading out: the network runs only while 'on' */
  phase(p: 'off' | 'in' | 'on' | 'out'): void;
  /** paints one network frame now, so a fade in starts on a finished picture */
  prime(): void;
  /** measures again (backdrops.ts calls it on every ScrollTrigger refresh, before it reads marks()) */
  measure(): void;
  /** document scrolls: where the intro starts to come in and how long its switch is, where the jobs' hold ends
   *  (they have turned to Applied and start to leave with the page), and where they have left the screen */
  marks(): { arrive: number; arriveLen: number; done: number; clear: number };
}

interface Item {
  el: HTMLElement; // what fades and lifts (the copy, the phones), or the block holding a number and its cards
  kind: 'copy' | 'phones' | 'num';
  chaos: Chaos | null;
  cards: Cards | null;
  vis: HTMLElement | null;
  v: number;
  dwell: number;
  shown: string;
  // measured at rest, screen px (the stage is fixed): the cards' box's top left, for near()
  cx: number;
  cy: number;
}

interface Panel {
  el: HTMLElement;
  items: Item[];
  v: number; // 0 waiting below, 1 formed, 2 gone above
  y: number; // its offset now, px (a switch's travel, or the jobs leaving with the page)
  dwell: number; // its own moments, 0 to 1
  on: boolean; // .is-shown
  key: string; // the transform last written
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
// one column: the share of a switch the leaving number takes to go, before the arriving one starts (apply())
const SEQ = 0.35;
const smooth = (v: number) => {
  const t = clamp01(v);
  return t * t * (3 - 2 * t);
};
const smoothR = (a: number, b: number, v: number) => smooth((v - a) / (b - a));
const outCubic = (t: number) => 1 - Math.pow(1 - t, 3);
/** Runs fn in an idle moment (Safari has no requestIdleCallback: a short timeout stands in). */
const idle = (fn: () => void): number => {
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
  return w.requestIdleCallback ? w.requestIdleCallback(fn, { timeout: 700 }) : window.setTimeout(fn, 120);
};

// The act's length per panel, as shares of the screen's height (vaultt-home.css --vx-switch and --vx-hold must
// match): its switch, scrubbed by the scroll, then its hold, where it stays put. Short, because Vaultt must never look
// like a long scroll (Yanis's standing note on it): about 2.6 screens from the intro's switch to the jobs leaving on a
// desktop, 2.3 on a phone. At 0.36 and 0.5 (3.4 screens) it read as one.
const SWITCH = 0.3;
const SWITCH_NARROW = 0.28;
const HOLD = 0.36;
const HOLD_NARROW = 0.3;
// The panels' spacing on the belt below, screen heights: the next one starts with its content's top about 10% above
// the bottom of the screen, the one leaving ends gone off the top, and half way through a switch both show, one
// above the other with the same gap all along. Any less and a phone's number block (more than half its screen tall)
// met the one before.
const TRAVEL = 0.6;
// The foreground never stands still (Yanis, 2026-11-08: "have it where it slowly moves and it just moves slightly
// faster as you pass through sections"; it used to hold dead still through each hold). Every panel rides one belt the
// scroll moves: at DRIFT of the scroll's speed through a hold, faster through a switch (so that each switch and hold
// carry it exactly the spacing above, about 1.6x on a desktop, 1.8x on a phone), the speed easing from one to the
// other over RAMP of a switch either side of each boundary (smoothstep, so it never jumps or kinks). The jobs ease
// into the page's own speed instead, and leave 1:1.
const DRIFT = 0.3;
const RAMP = 0.3;
// The share of a switch the panel leaving takes to scatter: it has scattered before it is off the top. Linear, like
// the travel: both are tied to where the page is, so the letters and cards keep their place against the scroll.
const SCATTER_END = 0.9;
// the share of a hold its own moments take: done a little before the hold ends, so the jobs have turned to Applied
// before they leave and Endless Pursuit's world comes in (vaultt-cards.ts places Applied in them)
const DWELL_END = 0.85;
// how far the copy and the phones lift as they come and go, px
const LIFT = 28;
// the suggestions tied in so far while each panel shows (the network's connect beat): the intro, then the numbers
const CONNECT = [0.12, 0.45, 0.75, 1];

/** Chromium only, on a wide screen: the copy's blur stays cheap there (number-chaos.ts makes the same call). */
const chromium = (() => {
  const ua = (navigator as Navigator & { userAgentData?: { brands?: { brand: string }[] } }).userAgentData;
  return !!ua?.brands?.some((b) => b.brand === 'Chromium');
})();

/** Sets up the section. Returns what backdrops.ts drives (null if the section is missing). */
export function initVaulttHome(o: { gsap?: Gsap; ScrollTrigger?: ST; reduced: boolean }): VaulttWorld | null {
  const sec = document.getElementById('mq-vaultt');
  const stage = sec?.querySelector<HTMLElement>('[data-vx-stage]');
  const layer = document.querySelector<HTMLElement>('.theme--vaultt');
  const canvas = layer?.querySelector<HTMLCanvasElement>('canvas');
  const iphone = sec?.querySelector<HTMLElement>('.vx__iphone');
  const phones = sec?.querySelector<HTMLElement>('[data-vx-phones]');
  const device = sec?.querySelector<HTMLElement>('[data-vx-device]');
  const tilt = sec?.querySelector<HTMLElement>('.vx__tilt');
  const introIn = sec?.querySelector<HTMLElement>('[data-vx-intro]');
  const atlas = document.getElementById('mq-atlas');
  if (!sec || !stage || !layer || !canvas || !iphone || !phones || !device || !tilt || !introIn) return null;
  const reduced = o.reduced;
  const root = document.documentElement;
  // the stage is ours: the gate in VaulttHome.astro keeps html.vx-stage (it drops it after 8 s otherwise)
  root.classList.add('vx-stage', 'vx-stage-on');
  // The viewport's width, kept from resize events (on phones every read of innerWidth runs a layout first), and the
  // stage's height (100lvh: what the switch points and travel are measured in; it never changes with a URL bar)
  let vw = innerWidth;
  let vh = stage.offsetHeight || innerHeight;
  addEventListener('resize', () => {
    vw = innerWidth;
  }, { passive: true });
  const narrow = () => vw <= 900;
  const glassBar = iphone.querySelector<HTMLElement>('[data-lg]');
  const iMapCanvas = iphone.querySelector<HTMLCanvasElement>('canvas[data-vx-net]');

  /* ---------- the panels and their items ---------- */
  const mk = (el: HTMLElement, kind: Item['kind'], i: number): Item => {
    const num = kind === 'num' ? el.querySelector<HTMLElement>('[data-vn]') : null;
    const vis = kind === 'num' ? el.querySelector<HTMLElement>('.vxv') : null;
    return {
      el, kind, vis,
      chaos: num && !reduced ? makeChaos(num, 101 + i * 37) : null,
      cards: vis ? makeCards(vis, reduced) : null,
      v: reduced ? 1 : 0, dwell: reduced ? 1 : 0, shown: '', cx: 0, cy: 0,
    };
  };
  const copy = mk(introIn, 'copy', 0);
  const phoneItem = mk(device, 'phones', 0);
  const panelEls = Array.from(stage.querySelectorAll<HTMLElement>('[data-vx-panel]'));
  const nums: Item[] = [];
  const panels: Panel[] = panelEls.map((el, i) => {
    let items: Item[];
    if (i === 0) items = [copy, phoneItem];
    else {
      const beat = el.querySelector<HTMLElement>('[data-vx-beat]')!;
      const it = mk(beat, 'num', i - 1);
      nums.push(it);
      items = [it];
    }
    return { el, items, v: 0, y: 0, dwell: 0, on: false, key: '' };
  });
  const last = panels.length - 1;
  const builders = nums[0];
  let layerH = layer.offsetHeight || vh;
  // The points (document px): T[k] where the switch bringing panel k in starts (T[0] the intro's, as Atlas's last
  // line leaves the top), T[k] + W where it is in place, T[k + 1] where its hold ends; T[4] the end of the jobs' hold,
  // where they leave with the page. W the switch's scroll, H the hold's, D the travel.
  const T = panels.map(() => Infinity).concat(Infinity);
  let W = 1;
  let H = 1;
  let D = 0;
  let clearAt = Infinity;
  // the belt (place()): its speed through a switch, its speed ramps' half width, and how far it has carried a panel
  // from the start of its switch in to the middle of its hold, where the panel sits at its rest place
  let vS = 1;
  let rr = 1;
  let beltMid = 0;
  // the hub (screen px, the same for every panel) and the words the crowd keeps clear of, at rest
  const hub = { x: 0, y: 0, w: 0, h: 0 };
  const shieldRects: { x: number; y: number; w: number; h: number }[] = [];
  // what the network reads from the last render (it never reads the scroll itself): a switch or the jobs' exit under
  // way, and the panel that shows most
  let moving = false;
  let most = 0;

  /* ---------- measuring (layout reads, never per frame) ---------- */
  function measure() {
    const y0 = window.scrollY;
    // (the render at the end takes this scroll: measure() runs outside the scroll path)
    sy = y0;
    vh = stage!.offsetHeight || innerHeight;
    layerH = layer!.offsetHeight || vh;
    // everything at rest for the reads (the render at the end puts the scroll's state back)
    for (const P of panels) {
      P.el.style.transform = '';
      P.key = '';
    }
    for (const it of [copy, phoneItem]) {
      it.el.style.transform = '';
      it.shown = '';
    }
    const cr = introIn!.getBoundingClientRect();
    const dr = device!.getBoundingClientRect();
    W = (narrow() ? SWITCH_NARROW : SWITCH) * vh;
    H = (narrow() ? HOLD_NARROW : HOLD) * vh;
    D = TRAVEL * vh;
    // The intro's switch: as Atlas's last line leaves the top, just clear of where the intro will rest, so the two
    // never overlap (Atlas's own bottom padding is below its last line). From the layout, so a longer Atlas moves it.
    // It starts a whole switch earlier (`lead`), so the intro rises into the screen Atlas's last lines are leaving:
    // started as they reached the top, the screen under the nav sat empty for about 100px of scroll in between
    // (2026-11-08 site checks, phones first, then desktop). They still never overlap: the intro rises faster than the
    // page, so it closes on Atlas's last line only as it lands, 16px under it (plus its drift). vaultt-home.css
    // --vx-lead takes the lead off the act's length, so what follows comes up as before.
    const lead = W;
    if (atlas) {
      const ar = atlas.getBoundingClientRect();
      const pad = parseFloat(getComputedStyle(atlas).paddingBottom) || 0;
      const lastLine = ar.bottom + y0 - pad;
      T[0] = lastLine - Math.max(0, Math.min(cr.top, dr.top) - 16) - lead;
    } else T[0] = sec!.getBoundingClientRect().top + y0;
    for (let k = 1; k < T.length; k++) T[k] = T[0] + k * (W + H);
    vS = (D - DRIFT * H) / W;
    rr = RAMP * W;
    beltMid = adv(W + H / 2);
    // Where the jobs have left the screen: the scroll at which their block's bottom (at rest) reaches its top, from
    // the belt (they ease into the page's speed past their hold; with reduced motion they leave 1:1 from its end).
    // Endless Pursuit adds its own margin.
    const jb = nums[nums.length - 1]?.el.getBoundingClientRect();
    clearAt = !jb ? T[last + 1] + vh : reduced ? T[last + 1] + jb.bottom : beltAt(last * D + beltMid + jb.bottom);
    // The hub sits behind the cards' column, where every number's cards rest, and keeps their box clear; the phones
    // cover it while the intro shows. One place for the whole act: the world never moves.
    const vr = nums[0]?.vis?.getBoundingClientRect();
    if (vr) {
      hub.x = vr.left + vr.width / 2;
      hub.y = vr.top + vr.height / 2;
      hub.w = vr.width / 2;
      hub.h = vr.height / 2;
    }
    for (const it of nums) {
      const v = it.vis?.getBoundingClientRect();
      if (v) {
        it.cx = v.left;
        it.cy = v.top;
      }
      it.chaos?.measure(vw);
      it.cards?.measure();
    }
    // the words on the left (the intro's copy, every number) push the people behind them into the shade
    shieldRects.length = 0;
    const pad = 18;
    const words = [cr, ...nums.map((it) => it.el.querySelector<HTMLElement>('[data-vn]')?.getBoundingClientRect())];
    for (const r of words) {
      if (!r || !r.width) continue;
      shieldRects.push({ x: r.left - pad, y: r.top - pad, w: Math.min(r.width, 520) + pad * 2, h: r.height + pad * 2 });
    }
    render();
  }

  /* ---------- one item's look for its v ---------- */
  const blurCopy = () => chromium && vw > 900;
  function apply(it: Item) {
    if (reduced) return;
    const v = it.v;
    if (it.kind === 'num') {
      // One column (phones): the numbers take turns instead of crossing. On a short screen the leaving number
      // scattered up through the arriving one and over its cards, two numerals at once ("1,200+" over a ghost
      // "10,500"; 2026-11-09 phone audit, V-04). The leaving number and its label are gone by SEQ of the switch, and
      // the arriving one gathers over the rest, so they never show together; the cards keep their own timing, and
      // the holds are as they were.
      it.chaos?.set(!narrow() ? v : v <= 1 ? clamp01((v - SEQ) / (1 - SEQ)) : 1 + clamp01((v - 1) / SEQ));
      it.cards?.set(v, it.dwell);
      return;
    }
    // the copy and the phones: fade in lifting up into place, fade out lifting away (the copy blurred to sharp on a
    // wide Chromium screen); waiting below or gone above, the phones are not painted at all. The copy only goes
    // transparent, never hidden: its links stay in the tab order (see the focus handler below). (One column: they
    // leave by SEQ of the switch as well, before the first number gathers, V-04.)
    if (v > 1 && v < 2 && narrow()) return applyLook(it, 1 + clamp01((v - 1) / SEQ));
    applyLook(it, v);
  }
  /** The copy's or the phones' look for v (apply()). */
  function applyLook(it: Item, v: number) {
    const hidden = v <= 0 || v >= 2;
    let key: string;
    let y = 0;
    let a = 1;
    if (v === 1) key = 'f';
    else if (hidden) key = 'h';
    else {
      y = v < 1 ? (1 - outCubic(v)) * LIFT : -smooth(v - 1) * LIFT;
      // Arriving it is there early, so it is seen rising, and sharpens on the way in; leaving it fades as it goes.
      // (With the alpha of the first scrolled version, 0.05 to 0.8, the panel crossed most of its travel see-through
      // and only appeared once in place.)
      a = v < 1 ? smoothR(0, 0.5, v) : 1 - smoothR(0.12, 0.88, v - 1);
      key = `${y.toFixed(1)}|${a.toFixed(3)}|${v.toFixed(3)}`;
    }
    if (key === it.shown) return;
    const was = it.shown;
    it.shown = key;
    const st = it.el.style;
    if (key === 'f') {
      st.transform = st.opacity = st.filter = st.willChange = st.visibility = st.pointerEvents = '';
      return;
    }
    if (key === 'h') {
      st.transform = st.filter = st.willChange = '';
      st.opacity = '0';
      st.pointerEvents = 'none';
      if (it.kind === 'phones') st.visibility = 'hidden';
      return;
    }
    st.visibility = st.pointerEvents = '';
    const blur = it.kind === 'copy' && blurCopy();
    if (was === 'f' || was === 'h' || was === '') st.willChange = blur ? 'transform, opacity, filter' : 'transform, opacity';
    st.transform = `translate3d(0, ${y.toFixed(1)}px, 0)`;
    st.opacity = a >= 0.999 ? '' : a.toFixed(3);
    if (blur) {
      // arriving it sharpens over most of the gather, leaving it blurs as it fades
      const s = v < 1 ? 1 - smoothR(0, 0.9, v) : 1 - a;
      const b = Math.round(s * 80) / 10;
      st.filter = b >= 0.2 ? `blur(${b}px)` : '';
    }
  }

  /* ---------- the belt (DRIFT, RAMP) ----------
     Its speed through one period, a switch (W) then a hold (H): vS through the switch, DRIFT through the hold, eased
     across each boundary over rr either side by smoothstep, so the speed is continuous and so is its change. A
     period carries the belt exactly D (vS is solved for that), so the panels keep their spacing D and two of them on
     screen together always move together. Integrated in closed form (a few multiplications a frame): adv() is how
     far one period has carried it at phase f, beltX() where it is at a scroll, beltAt() the scroll for a place past
     the jobs' hold, where it runs 1:1. */
  /** ∫ from c - rr to x of a speed easing from v0 to v1 across [c - rr, c + rr] (smoothstep; x is clamped). */
  function ramp(x: number, c: number, v0: number, v1: number) {
    const t = clamp01((x - c + rr) / (2 * rr));
    return 2 * rr * (v0 * t + (v1 - v0) * (t * t * t - (t * t * t * t) / 2));
  }
  /** How far one period has carried the belt at phase f (0 to W + H; 0 at the start of a switch). */
  function adv(f: number) {
    const P = W + H;
    // the second half of the ease into the switch, centred on its start
    let a = ramp(Math.min(f, rr), 0, DRIFT, vS) - ramp(0, 0, DRIFT, vS);
    if (f <= rr) return a;
    a += vS * (Math.min(f, W - rr) - rr);
    if (f <= W - rr) return a;
    a += ramp(Math.min(f, W + rr), W, vS, DRIFT);
    if (f <= W + rr) return a;
    a += DRIFT * (Math.min(f, P - rr) - (W + rr));
    if (f <= P - rr) return a;
    // the first half of the ease into the next switch
    return a + ramp(f, P, DRIFT, vS);
  }
  /** Where the belt is at scroll y (0 where the intro's switch starts): past the jobs' hold it eases into 1:1. */
  function beltX(y: number) {
    const u = y - T[0];
    if (u <= 0) return 0;
    const P = W + H;
    const end = (last + 1) * P; // the end of the jobs' hold
    if (u < end - rr) {
      const k = Math.floor(u / P);
      return k * D + adv(u - k * P);
    }
    return last * D + adv(P - rr) + ramp(Math.min(u, end + rr), end, DRIFT, 1) + Math.max(0, u - end - rr);
  }
  /** The scroll at which the belt has carried the panels x, for a place it reaches past the jobs' hold. */
  function beltAt(x: number) {
    const P = W + H;
    const end = (last + 1) * P;
    const atRamp = last * D + adv(P - rr) + ramp(end + rr, end, DRIFT, 1);
    return T[0] + end + rr + Math.max(0, x - atRamp);
  }

  /* ---------- where everything is for the scroll ----------
     A function of the scroll alone, so a page stopped anywhere stays exactly as it is, a fling lands where it stops
     with nothing to catch up, and scrolling back retraces every frame. Panel k rides the belt at k spacings, at its
     rest place in the middle of its hold: waiting below until T[k]; across its switch in (W) it rises fast and
     gathers, v 0 to 1; across its hold (H) it drifts up slowly while its moments run, dwell 0 to 1; across the next
     switch (the next panel's in) it slides on up and scatters, v 1 to 2, then it is gone above. The jobs, last, have
     no switch out: past their hold they ease into the page's speed and leave 1:1, formed. */
  function place(y: number) {
    moving = false;
    const X = reduced ? 0 : beltX(y);
    for (let k = 0; k <= last; k++) {
      const P = panels[k];
      const inAt = T[k];
      const restAt = inAt + W;
      const outAt = T[k + 1];
      let v = 0;
      let off = 0;
      let dwell = 0;
      if (reduced) {
        // at once, half way through each switch (the intro at its switch's start, together with its world); the
        // jobs still leave with the page
        const from = k === 0 ? inAt : inAt + W / 2;
        const to = k === last ? Infinity : outAt + W / 2;
        v = y < from ? 0 : y < to ? 1 : 2;
        dwell = 1;
        if (k === last && y > outAt) off = outAt - y;
      } else if (y <= inAt) {
        v = 0;
      } else if (y < restAt) {
        v = (y - inAt) / W;
        off = k * D + beltMid - X;
        moving = true;
      } else if (y <= outAt) {
        v = 1;
        dwell = clamp01((y - restAt) / (H * DWELL_END));
        off = k * D + beltMid - X;
      } else if (k === last) {
        // the jobs leave like the rest of the page (the belt has eased into 1:1)
        v = 1;
        dwell = 1;
        off = k * D + beltMid - X;
        moving = true;
      } else if (y < outAt + W) {
        v = 1 + clamp01((y - outAt) / W / SCATTER_END);
        off = k * D + beltMid - X;
        dwell = 1;
        moving = true;
      } else {
        v = 2;
        dwell = 1;
      }
      P.v = v;
      P.y = off;
      P.dwell = dwell;
    }
    // the panel that shows most: from half way through its switch in to half way through its switch out
    most = Math.max(0, Math.min(last, Math.floor((y - T[0] - W / 2) / (W + H))));
  }

  /** Writes every panel's place and every item's look for the scroll (no layout reads: the scroll is the one the
   *  scroll event read, sy, below). */
  function render() {
    place(sy);
    restSide = sideOf(sy);
    let any = false;
    for (let k = 0; k <= last; k++) {
      const P = panels[k];
      const v = P.v;
      // shown while formed or part-way; the jobs leaving with the page until they are past the top of the screen
      const on = v > 0 && v < 2 && P.y > -vh;
      if (on) any = true;
      if (on !== P.on) {
        P.on = on;
        P.el.classList.toggle('is-shown', on);
      }
      const key = Math.abs(P.y) < 0.05 || !on ? '' : `translate3d(0, ${P.y.toFixed(1)}px, 0)`;
      if (key !== P.key) {
        P.key = key;
        // (each panel keeps its compositor layer all along, vaultt-home.css: making one at the start of every switch
        // and dropping it at the end changed the page's layer tree twice per switch)
        P.el.style.transform = key;
      }
      for (const it of P.items) {
        it.v = v;
        it.dwell = P.dwell;
        apply(it);
      }
    }
    stage!.classList.toggle('is-on', any);
    syncMap();
  }

  /* ---------- one render per scrolled frame; nothing runs while the page is still ----------
     The scroll is read in the scroll event (sy), before anything in the frame writes a style, and render() uses it in
     the next animation frame. It used to read window.scrollY there, after the other frame callbacks had written
     theirs: a forced style and layout pass on every scrolled frame (WebKit, 1.6 to 3.7 ms a frame on the iPhone
     profile, 2026-11-09 audit). Outside the act (a switch and a screen above the intro's switch, or a screen past
     where the jobs have left the screen) every panel is in its final state: one render there, then nothing until
     the scroll comes back (it used to render on every scrolled frame of the whole page, the finale included). */
  let sy = window.scrollY;
  let raf = 0;
  // the side of the act the last render was done for: -1 above, 1 below, 0 within it
  let restSide = 0;
  const sideOf = (y: number) => (y < T[0] - W - vh ? -1 : y > clearAt + vh ? 1 : 0);
  const frame = () => {
    raf = 0;
    render();
  };
  const kick = () => {
    sy = window.scrollY;
    const side = sideOf(sy);
    if (side !== 0 && side === restSide) return;
    if (!raf) raf = requestAnimationFrame(frame);
  };
  addEventListener('scroll', kick, { passive: true });

  // A keyboard user tabbing into the intro's links while it is not in place: the page goes to the intro's hold, so
  // the link that has the focus can be seen (the stage is fixed, so the browser's own scroll-into-view does nothing).
  introIn.addEventListener('focusin', () => {
    const from = T[0] + W;
    const to = T[1];
    const y = window.scrollY;
    if (!Number.isFinite(to) || (y >= from && y <= to)) return;
    window.scrollTo(0, Math.round((from + to) / 2));
  });

  /* ---------- the network ---------- */
  let viewer = 0;
  let tiltX = 0;
  let tiltY = 0;
  let tiltTX = 0;
  let tiltTY = 0;
  let tiltShown = '';
  let gx = 32;
  const vals = { reveal: reduced ? 1 : 0, sea: reduced ? 1 : 0, builders: reduced ? 1 : 0, connect: reduced ? 1 : 0 };
  let revealed = reduced;
  let phase: 'off' | 'in' | 'on' | 'out' = 'off';
  const showing = (it: Item) => (it.v > 0 && it.v < 2 ? 1 - Math.abs(it.v - 1) : 0);

  /** Runs at the top of every network frame (and before every single paint): no layout, no scroll. */
  function update(n: Network, dt: number) {
    // the hub never moves (measured at rest, screen px)
    n.hub.x = hub.x;
    n.hub.y = hub.y;
    n.hub.keepW = hub.w;
    n.hub.keepH = hub.h;
    n.hub.keep = 1;
    // The drawn "You" (the app's centre of the map) shows at the hub only where nothing covers it: not while the
    // phones show (they sit over it, with their own "You"), and not within 26px of a card that can be seen
    // (vaultt-cards.ts near(), from this frame's poses and the panel's offset). Eased, so a switch passing over it
    // never flickers it. Tried no "You" at all: every tie met in one bare point, which flared white (additive strokes).
    let covered = 0;
    nums.forEach((it, i) => {
      if (!it.cards || it.v <= 0 || it.v >= 2) return;
      covered = Math.max(covered, it.cards.near(hub.x - it.cx, hub.y - (it.cy + panels[i + 1].y), 26, 26));
    });
    // (none while a switch is under way, stopped part-way included: the cards uncover the hub on their way out, and
    // the "You" flashed up for a moment between panels; with it at 0 network.ts softens the meeting point instead)
    const vt = reduced || moving ? 0 : (1 - smooth(showing(phoneItem) * 1.6)) * (1 - covered);
    viewer += (vt - viewer) * (dt > 0 ? 1 - Math.exp(-dt * 6) : 1);
    n.hub.viewer = viewer;
    n.fadeTop = 1;
    // the canvas is the screen (the world never moves), and the site nav's band at its top is kept clear
    n.view.top = 0;
    n.view.height = layerH;
    n.view.clearTop = 72;
    n.shield.length = 0;
    for (const r of shieldRects) n.shield.push(r);
    // the world comes alive once it has been shown; the crowd joins with builders; suggestions are tied in one after
    // another as the numbers pass; no calm (the whole world fades into Endless Pursuit's). The network's own easing
    // (the background's life, like its drifting people), not the panels'.
    if (phase === 'on') revealed = true;
    if (!reduced) {
      const kr = dt > 0 ? 1 - Math.exp(-dt * 2.4) : 0;
      if (revealed) {
        vals.reveal += (1 - vals.reveal) * kr;
        vals.sea += (1 - vals.sea) * kr * 0.8;
      }
      const kb = dt > 0 ? 1 - Math.exp(-dt * 3) : 1;
      vals.builders += (clamp01(builders ? builders.v : 1) - vals.builders) * kb;
      vals.connect += (CONNECT[Math.min(most, CONNECT.length - 1)] - vals.connect) * (dt > 0 ? 1 - Math.exp(-dt * 1.6) : 1);
    }
    n.beats.reveal = vals.reveal;
    n.beats.sea = vals.sea;
    n.beats.builders = vals.builders;
    n.beats.feedback = reduced ? 0 : 0.16 * vals.reveal;
    n.beats.connect = vals.connect;
    n.beats.calm = 0;
    // the phones lean toward the pointer while they show
    if (!reduced && dt > 0 && showing(phoneItem) > 0) {
      const te = 1 - Math.exp(-dt * 4.5);
      tiltX += (tiltTX - tiltX) * te;
      tiltY += (tiltTY - tiltY) * te;
      const tf = `rotateX(${tiltX.toFixed(3)}deg) rotateY(${tiltY.toFixed(3)}deg)`;
      if (tf !== tiltShown) {
        tiltShown = tf;
        tilt!.style.transform = tf;
      }
      const g = 32 + tiltY * 5;
      if (glassBar && Math.abs(g - gx) > 0.2) {
        gx = g;
        glassBar.style.setProperty('--gx', `${g.toFixed(1)}%`);
      }
    }
  }

  /* ---------- the network and the iPhone's map, made when first needed ----------
     The world's canvas is the whole screen at up to 2x: made in an idle moment once the visitor has scrolled into
     the page (or at once when the world is about to show), and again with the other density when the window crosses
     the phone breakpoint (a rotated phone kept the crowd it was born with). */
  let net: Network | null = null;
  let netFailed = false;
  let netLite = narrow();
  let iMap: Network | null = null;
  const makeNet = () => {
    if (!net && !netFailed) {
      netLite = narrow();
      try {
        net = createNetwork(canvas, {
          look: 'world',
          seed: 23,
          reduced,
          density: netLite ? 'lite' : 'full',
          pointerTarget: sec,
          // links, buttons, the phones and the cards belong to the page, not to the network
          ignore: (t) => t instanceof Element && !!t.closest('a, button, [data-vx-phones], .vxv'),
          onFrame: update,
        });
      } catch (err) {
        // no network (a canvas that would not start): the panels still follow the scroll
        netFailed = true;
        console.error('[vaultt] the network could not start', err);
      }
    }
    // dev only: lets the screenshot scripts read the points and the panels and find a real person to hover and drag
    if (import.meta.env.DEV) {
      (window as unknown as { __vx: unknown }).__vx = {
        net, panels, T,
        get state() {
          return { W, H, D, most, moving, v: panels.map((p) => p.v), y: panels.map((p) => p.y), dwell: panels.map((p) => p.dwell) };
        },
        get phase() {
          return phase;
        },
      };
    }
  };
  /** Reduced motion: the network is one still frame; a new panel changes what it shows (the beats, the "You"). */
  let stillMost = -1;
  function repaintStill() {
    if (net && (phase === 'on' || phase === 'in')) net.paint();
  }

  /** The iPhone's live map plays only while the intro shows and the page can be seen. */
  let mapOn = false;
  // Made at start, as network-mount.ts made it before this page took it over (a small canvas): made together with the
  // world's network, the two cost one long task mid-scroll on a slow phone (168 ms at 4x CPU, scroll 1010)
  if (iMapCanvas) {
    try {
      iMap = createNetwork(iMapCanvas, { look: 'app', seed: Number(iMapCanvas.dataset.seed) || 7, reduced, hubY: 432, topInset: 170 });
      if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => iMap?.resize()).observe(iMapCanvas);
      if (reduced) iMap.paint();
    } catch (err) {
      console.error('[vaultt] the phone map could not start', err);
    }
  }
  function syncMap() {
    // reduced motion: the still network shows the new panel's beats once it changes
    if (reduced && most !== stillMost) {
      stillMost = most;
      repaintStill();
    }
    // (one column: the phones are gone by SEQ of their switch out, apply())
    const on = !reduced && phoneItem.v > 0.02 && phoneItem.v < (narrow() ? 1 + SEQ - 0.02 : 1.98) && !document.hidden;
    if (on === mapOn || !iMap) return;
    mapOn = on;
    if (on) iMap.start();
    else iMap.stop();
  }

  /** Starts or stops the network for the world's phase. */
  function syncNet() {
    const on = phase === 'on' && !document.hidden;
    if ((on || phase === 'in') && !net) makeNet();
    if (net) {
      if (on && !reduced) {
        net.setDrawing(true);
        net.start();
      } else {
        net.stop();
        if (reduced && (phase === 'on' || phase === 'in')) net.paint();
      }
    }
    syncMap();
  }
  document.addEventListener('visibilitychange', syncNet);

  /* ---------- sizes ---------- */
  let rt = 0;
  addEventListener('resize', () => {
    clearTimeout(rt);
    rt = window.setTimeout(() => {
      measure();
      if (net && narrow() !== netLite) {
        net.destroy();
        net = null;
        makeNet();
        syncNet();
        // (read again through a cast: TypeScript narrows `net` to null above and cannot see makeNet() set it)
        const fresh = net as Network | null;
        if (fresh && !fresh.running && phase !== 'off') fresh.paint();
      } else if (net) {
        net.resize();
        if (!net.running && phase !== 'off') net.paint();
      }
    }, 140);
  });
  measure();
  document.fonts?.ready.then(() => {
    measure();
    net?.resize();
    if (net && !net.running && phase !== 'off') net.paint();
  });
  // anything above the section that changes height (images, the editor, fonts) moves the points
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => measure()).observe(document.body);

  // the pointer tilts the phones (desktop pointers only)
  if (!reduced && matchMedia('(pointer: fine)').matches) {
    sec.addEventListener('pointermove', (e) => {
      if (narrow()) return;
      tiltTX = -(e.clientY / vh - 0.5) * 6;
      tiltTY = (e.clientX / vw - 0.6) * 9;
    }, { passive: true });
    sec.addEventListener('pointerleave', () => {
      tiltTX = 0;
      tiltTY = 0;
    }, { passive: true });
  }

  // the network is made in an idle moment once the visitor scrolls into the page
  let idleId = 0;
  const early = () => {
    if (idleId || net) return;
    if (window.scrollY > vh * 0.5) {
      removeEventListener('scroll', early);
      idleId = idle(makeNet);
    }
  };
  addEventListener('scroll', early, { passive: true });
  early();

  return {
    phase(p) {
      if (p === phase) return;
      phase = p;
      syncNet();
    },
    prime() {
      if (!net) makeNet();
      net?.paint();
    },
    measure,
    marks: () => ({ arrive: T[0], arriveLen: W, done: T[last + 1], clear: clearAt }),
  };
}
