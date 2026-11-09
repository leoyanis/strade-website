// The homepage finale (index.astro #finale), all of it scrubbed by the scroll: every frame is a pure function of it.
//
// - The night: the circle opens from the bottom centre, straight with the scroll as it always did; index.astro draws
//   it from the radius paint() returns.
// - The shooting star: it is in the night from the moment the circle shows (it rises inside the first small dome,
//   halfway up it), crosses the middle of the screen (46% down, the middle across) as the circle's top edge passes
//   30% down, and flies on up and out, faster, fading. It never lands: it passes. (2026-11-09, Yanis, with marked
//   frames: "the shooting star must appear quicker", "the emblem should be formed out of the remains of the shooting
//   star, not the tip".) Its path: a climb that keeps the same share of the circle's height under it, growing from a
//   half to the share that puts it on the mark, then a steady acceleration out (the most that keeps it inside the
//   circle while the circle's top is on screen); it leans a touch to the right.
// - The spray: as it flies it drops the emblem's stars, sparks kicked out to its sides that cool and drift; they
//   hang in the sky a moment after it has gone, then, eased in and out, are drawn down into the middle (their paths
//   bowing round it, as down a drain) and settle as the emblem (stardust.ts flight mode). Everything the flight
//   draws stays inside the night's circle, on a canvas fixed to the screen like the night (so the star and the spray
//   hold still against the sky however fast the scroll).
// - The stop: the finale is pinned (.is-pinned, home.css). Its stage is sticky in a section a screen plus the held
//   stretch tall; it sticks --fin-x from the top and this moves it the rest of the way, slowing it to a stop with no
//   jolt (its speed falls from the page's to nothing on a smooth curve), so the emblem gathering on it eases up into
//   the screen's middle and holds there ("it basically stops, but smoothly"). The suck-in ends as the stage stops,
//   and only then does the emblem's own canvas take over from the flight (both are still on the screen, so the two
//   draw the same stars in the same place).
// - The headline, held still and centred on the emblem: each letter comes up from below and to one side, blurred and
//   transparent, on its own stretch of scroll and its own curve (the approved letters, unchanged); then the buttons
//   and the socials; the emblem fades to its faint rest behind the words as they come. Then a grace of a third of a
//   screen with everything built, and the stage lets go, starting slowly (the mirror of the stop), with the footer
//   coming up under it.
// - The lengths: plan() works out the whole timeline from the screen on every ScrollTrigger refresh, before
//   ScrollTrigger measures, and writes the three it needs in CSS (--fin-x, --fin-pin, --fin-tail on the section);
//   measure() then reads the stage's layout once. Nothing is read per frame. Keyboard focus inside the finale shows
//   the words at once.

import type { ScrollTrigger as ST } from 'gsap/ScrollTrigger';
import type { Stardust, StardustFlight } from './stardust';
import { setScrollRanges } from './scroll-ranges';

/** The shooting star's lean: px across (to the right) per px up. */
const TILT = 0.07;
const DIR_N = Math.hypot(TILT, 1);
const DIR_X = TILT / DIR_N;
const DIR_Y = -1 / DIR_N;

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}

export type FinaleFlight = {
  /** One scroll update: px scrolled since the wipe began (the finale's top at the screen's bottom). The screen's size
   * is the plan's (from the last ScrollTrigger refresh), so a phone's toolbar showing or hiding moves nothing; the
   * arguments are kept for index.astro's call. Returns the radius of the night's circle in px (index.astro clips the
   * sky and the tint to it). */
  paint: (s: number, ww: number, wh: number, hc: number) => number;
  /** The circle as the plan has it (radius rk * s / sWipe up to rk), for the night's disc (finale-disc.ts). */
  circle: () => { rk: number; sWipe: number };
};

/**
 * Wires the flight, the stop and the headline. Called from index.astro once the wipe's ScrollTrigger exists and the
 * section has .is-pinned (not under reduced motion or ?still, which keep their cross-fade, the finished emblem and
 * the plain layout). `st` is the wipe's ScrollTrigger (its start anchors everything), `stage` the sticky stage,
 * `head` the headline's box (the emblem is centred on it), `emblemBox` the element whose opacity is the emblem's
 * brightness (.fin-emblem; its CSS opacity is the resting state), `chars` the headline's letters, `followers` what
 * rises in after them.
 */
export function mountFinaleFlight(o: {
  ScrollTrigger: typeof ST;
  st: ST;
  emblem: Stardust;
  section: HTMLElement;
  stage: HTMLElement;
  head: HTMLElement;
  emblemBox: HTMLElement;
  homeCanvas: HTMLCanvasElement;
  flightCanvas: HTMLCanvasElement;
  h1: HTMLElement;
  chars: HTMLElement[];
  followers: HTMLElement[];
}): FinaleFlight {
  const { ScrollTrigger, st, emblem, section, stage, head, emblemBox, homeCanvas, flightCanvas, h1, chars, followers } = o;
  const themes = document.querySelector<HTMLElement>('.themes');
  // the words' box (.fin-inner): the letting go moves it inside the held stage
  const inner = head.parentElement as HTMLElement;
  // the brake and the letting go run as scroll-driven animations where the browser has them (Chromium, Safari 26):
  // they then move on the compositor with the scroll itself, where the script's moves land a frame late (a stage
  // the script was moving jumped by a frame's scroll, 5 px at 700 px/s, as the page took it, measured 2026-11-09)
  const timeline = typeof CSS !== 'undefined' && CSS.supports('animation-timeline: scroll()');

  /* ---------- the letters and what follows them ---------- */
  // the letters' own randomness (stable: drawn once, in the same order as ever, so each letter keeps its approved
  // move), turned into windows and offsets by measure()
  const rl = rng(20261108);
  const L = chars.map((el) => ({
    el, r: [rl(), rl(), rl(), rl(), rl(), rl(), rl()],
    w0: 0, w1: 1, dx: 0, dy: 0, bl: 0, pw: 2, sc0: 1, at: -1, moving: false,
  }));
  // The blur only where it stays cheap: Chromium on a wide screen (number-chaos.ts makes the same call). In WebKit and
  // on phones each letter's blur re-rasterized every frame, 30 filtered layers alive from the page's load (audit P6),
  // so there each letter starts a little larger instead, settling to its size as it fades in: out of focus, the way
  // number-chaos.ts brings its digits in. Desktop Chromium keeps the approved blur, unchanged
  const chromium = (() => {
    const ua = (navigator as Navigator & { userAgentData?: { brands?: { brand: string }[] } }).userAgentData;
    return !!ua?.brands?.some((b) => b.brand === 'Chromium');
  })();
  let blurOK = chromium && innerWidth > 900;
  const FL = followers.map((el, i) => ({ el, i, w0: 0, w1: 1, at: -1 }));

  /* ---------- the plan: the whole timeline from the screen, and the section's lengths (on refresh) ---------- */
  // All in px of scroll since the wipe began (s), from the screen's width and height, the theme stack's height (the
  // circle's centre is its bottom middle; .themes is 100lvh) and the stage's (100svh):
  // sWipe, Rk: the circle grows straight to Rk over sWipe (index.astro's circle(150% at 50% 100%) of the stack).
  // sH0, sX, yX, kX, vX, acc, sExit: the star shows at sH0 (the circle 5% of the stack high), is on the mark (yX) at
  //   sX (the circle's top 30% down) with the share kX of the circle's height under it, leaving at vX px per px and
  //   speeding up by acc, gone at sExit.
  // Ls, natural: the suck-in's length, and where it would end after a moment of the spray alone.
  // X, P, tail, Lr: the stage sticks X below the top, X before the section's top reaches the top, and the brake takes
  //   2X (the stage covers X at half the page's speed on average); it is held for P in all (the brake, the letters,
  //   the buttons, the grace, the letting go of length Lr: --fin-pin), and the section gives back tail at its bottom
  //   (--fin-tail) so the footer comes up under the stage as under a screen-high section.
  //   (Tried 2026-11-09: keeping the stage sticky past the letting go, moved on by script until off the screen, so
  //   the page never took a moving stage; the section then reached below the footer and the page scrolled on past it
  //   into empty night. The scroll-driven animations below remove the jump that was for.)
  const T = {
    ww: 0, wh: 0, hc: 0, U: 1, sWipe: 1, Rk: 1, sH0: 0, sX: 1, yX: 0, kX: 0.5, vX: 1, acc: 0, sExit: 1,
    Ls: 1, natural: 1, X: 0, P: 0, tail: 0, Lr: 1,
  };
  let dirty = true;
  const plan = () => {
    const ww = window.innerWidth;
    const wh = window.innerHeight;
    const hc = Math.max(wh, themes ? themes.offsetHeight : 0);
    const U = stage.offsetHeight || wh;
    T.ww = ww;
    T.wh = wh;
    T.hc = hc;
    T.U = U;
    T.sWipe = 0.88 * wh;
    T.Rk = (1.5 * Math.hypot(ww, hc)) / Math.SQRT2;
    const rho = T.Rk / T.sWipe; // the circle's top edge climbs this many px per px of scroll
    // In the first dome (Yanis's first frame: the circle's top 88% down) it is already there, halfway up the dome;
    // on his mark (46% down, the middle across) when the circle's top is 30% down (his second)
    T.sH0 = (0.05 * hc) / rho;
    T.sX = (0.7 * hc) / rho;
    T.yX = 0.46 * U;
    T.kX = (hc - T.yX) / (0.7 * hc);
    T.vX = rho * T.kX;
    // then out: the hardest acceleration (from 3.6 screens per screen squared down) that keeps it 3% of a screen
    // inside the circle's top edge while that edge is still on screen (on a phone the circle climbs slowly)
    const gone = -0.03 * U;
    let acc = 3.6 / U;
    for (; acc > 0.15 / U; acc -= 0.1 / U) {
      let ok = true;
      for (let d = 0; ok; d += 4) {
        const y = T.yX - T.vX * d - 0.5 * acc * d * d;
        const edge = hc - T.Rk * clamp((T.sX + d) / T.sWipe);
        if (y < gone || edge < 0) break;
        if (y - edge < 0.03 * U) ok = false;
      }
      if (ok) break;
    }
    T.acc = acc;
    T.sExit = T.sX + (-T.vX + Math.sqrt(T.vX * T.vX + 2 * T.acc * (T.yX - gone))) / T.acc;
    // The spray alone for at least 0.16 of a screen once the star has gone, then the suck-in over 0.42; it ends as
    // the stage stops, so the brake is as long as that needs (and between 0.18 and 0.45 of a screen of travel): on
    // a wide screen the circle is quick and the brake is the shortest, on a phone the star leaves late and the brake
    // is long. The section's top reaches the screen's top at s = wh (the wipe begins at 'top bottom')
    T.Ls = 0.42 * U;
    T.natural = T.sExit + 0.16 * U + T.Ls;
    T.X = Math.round(clamp(T.natural - wh, 0.18 * U, 0.45 * U));
    // Held: from the stage sticking (wh - X) through the letters (0.4), the buttons and socials (0.12 each, 0.05
    // apart, starting 0.08 before the letters end), the grace (a third of a screen) and the letting go (0.3)
    const sC1 = Math.max(wh + T.X, T.natural);
    const S1 = sC1 - 0.03 * U + 0.4 * U;
    const F1 = S1 - 0.08 * U + 0.12 * U + 0.05 * U * Math.max(0, FL.length - 1);
    T.Lr = Math.round(0.3 * U);
    T.P = Math.round(F1 + U / 3 + T.Lr - (wh - T.X));
    T.tail = Math.round(T.X + T.Lr / 2);
    section.style.setProperty('--fin-x', `${T.X}px`);
    section.style.setProperty('--fin-pin', `${T.P}px`);
    section.style.setProperty('--fin-tail', `${T.tail}px`);
    dirty = true;
  };

  /* ---------- measured: the stage's layout (once per refresh, never per frame) ---------- */
  // sTop: s at which the section's top reaches the screen's top (the stage is its first child); sA, sB: the stage
  // sticks, the brake ends; sC0, sC1: the suck-in; S0, S1: the letters; sG, sEnd: the grace ends, the stage lets go.
  // delta: the stage's fixed shift that puts the headline's middle (the emblem's centre) at the stage's middle;
  // offX, offY: the emblem's own canvas from the stage's top-left; W, left: the flight canvas's column (wide enough
  // for the spray and the emblem); reach: how far the spray's farthest spark is kicked; ew: the emblem's width
  const D = {
    sTop: 0, sA: 0, sB: 0, sC0: 0, sC1: 1, S0: 0, S1: 1, sG: 0, sEnd: 1,
    delta: 0, offX: 0, offY: 0, W: 0, left: 0, reach: 1, ew: 300, font: 64,
  };
  const FR: StardustFlight = {
    t: 0, plan: 0, head: () => {}, dirX: DIR_X, dirY: DIR_Y, streak: 0,
    shed0: 0, shed1: 1, burst: 1, cool: 1, reach: 1, drift: 0, suck0: 0, suck1: 1,
    ox: 0, oy: 0, clipX: 0, clipY: 0, clipR: 0,
    // the flight canvas sits in a disc of its own (finale-disc.ts), cut by the circle on the compositor
    clip: false,
  };
  const measure = () => {
    dirty = false;
    const U = T.U;
    D.sTop = section.getBoundingClientRect().top + window.scrollY - st.start;
    D.sA = D.sTop - T.X;
    D.sB = D.sTop + T.X;
    D.sC1 = Math.max(D.sB, T.natural);
    D.sC0 = D.sC1 - T.Ls;
    D.S0 = D.sC1 - 0.03 * U;
    D.S1 = D.S0 + 0.4 * U;
    D.sEnd = D.sA + T.P;
    D.sG = D.sEnd - T.Lr;
    // The stage's parts in its own layout: from rects, whose differences cancel the stage's shift, less the words'
    // own shift (the letting go, which may be under way at a refresh)
    const sr = stage.getBoundingClientRect();
    const fr = inner.getBoundingClientRect();
    const hr = head.getBoundingClientRect();
    const cr = homeCanvas.getBoundingClientRect();
    const innerTop = fr.top - sr.top - (parseFloat(getComputedStyle(inner).translate.split(' ')[1]) || 0);
    D.delta = Math.round(U / 2 - (innerTop + hr.top - fr.top + hr.height / 2));
    D.offX = cr.left;
    D.offY = innerTop + cr.top - fr.top;
    // The brake and the letting go as scroll-driven animations (home.css), where the browser has them: their
    // ranges in px of the page's scroll and their lengths; the script then leaves the two shifts alone
    // (and again a frame later, for Chromium: scroll-ranges.ts)
    const abs = st.start;
    setScrollRanges('fin-stage', section, { '--fin-a': abs + D.sA, '--fin-b': abs + D.sB, '--fin-g': abs + D.sG, '--fin-e': abs + D.sEnd });
    section.style.setProperty('--fin-d', `${D.delta}px`);
    section.style.setProperty('--fin-lr', `${T.Lr}px`);
    section.classList.toggle('is-timeline', timeline);
    D.ew = emblemBox.offsetWidth || 300;
    D.reach = Math.min(0.55 * D.ew, 0.3 * T.ww);
    const half = Math.max(1.3 * D.reach + TILT * T.hc * 0.6, 0.8 * D.ew) + 12;
    D.W = Math.round(Math.min(T.ww, 2 * half));
    D.left = Math.round((T.ww - D.W) / 2);
    flightCanvas.style.left = `${D.left}px`;
    flightCanvas.style.width = `${D.W}px`;
    D.font = parseFloat(getComputedStyle(h1).fontSize) || 64;
    blurOK = chromium && innerWidth > 900;
    // the spray's constants for this plan
    FR.plan++;
    FR.shed0 = T.sH0;
    FR.shed1 = T.sExit - 0.05 * U;
    FR.burst = 0.05 * U;
    FR.cool = 0.07 * U;
    FR.reach = D.reach;
    FR.drift = (0.3 * D.reach) / U;
    FR.suck0 = D.sC0;
    FR.suck1 = D.sC1;
    FR.clipX = T.ww / 2 - D.left;
    FR.clipY = T.hc;
    // The headline: each letter on its own stretch of the letters' scroll (a third to four fifths of it) with its own
    // curve; from 0.8 to 2.4 em below and up to 1.1 em to either side, blurred 0.1 to 0.18 em
    const room = D.S1 - D.S0;
    for (const c of L) {
      const len = (0.34 + 0.46 * c.r[0]) * room;
      c.w0 = D.S0 + c.r[1] * (room - len);
      c.w1 = c.w0 + len;
      c.dx = (c.r[2] * 2 - 1) * 1.1 * D.font;
      c.dy = (0.8 + 1.6 * c.r[3]) * D.font;
      c.bl = (0.1 + 0.08 * c.r[4]) * D.font;
      c.pw = 1.7 + 2.2 * c.r[5];
      // without the blur: from 1.22 to 1.42 of its size (its seventh draw, unused before, so the rest stay as they were)
      c.sc0 = 1.22 + 0.2 * c.r[6];
      c.at = -1;
      c.moving = false;
    }
    // the buttons and the socials: from just before the letters end, one after the other
    for (const f of FL) {
      f.w0 = D.S1 - 0.08 * U + 0.05 * U * f.i;
      f.w1 = f.w0 + 0.12 * U;
      f.at = -1;
    }
    yWas = NaN;
    gWas = NaN;
  };
  let yWas = NaN; // the stage's shift and the words' last written (script fallback)
  let gWas = NaN;
  ScrollTrigger.addEventListener('refreshInit', plan);
  ScrollTrigger.addEventListener('refresh', () => {
    dirty = true;
  });
  // the headline's font can land after the last refresh, and the emblem is centred on the headline's box
  document.fonts?.ready.then(() => {
    dirty = true;
  });

  /* ---------- the circle, the star's path, the stage's stop and start ---------- */
  // The circle's radius at s: straight with the scroll, full at the wipe's end
  const radius = (s: number) => T.Rk * clamp(s / T.sWipe);
  // The star's height on the screen at s: up to the mark, the share of the circle's height under it eases from a half
  // to kX (so it stays inside, and arrives at the mark with no kink); after it, a steady acceleration out
  const headY = (s: number) => {
    if (s <= T.sX) return T.hc - radius(s) * (0.5 + (T.kX - 0.5) * smooth(T.sH0, T.sX, s));
    const d = s - T.sX;
    return T.yX - T.vX * d - 0.5 * T.acc * d * d;
  };
  // on the flight canvas, with its brightness: it fades in in the first dome and out over the top fifth of the screen
  FR.head = (s, out) => {
    const y = headY(s);
    out.x = T.ww / 2 + TILT * (T.yX - y) - D.left;
    out.y = y;
    out.a = smooth(T.sH0, T.sH0 + 0.035 * T.U, s) * smooth(-0.03 * T.U, 0.22 * T.U, y);
  };
  // The stage's shift from its sticky place: nothing until it sticks; then it brakes, covering X while its speed falls
  // from the page's to nothing (speed 1 - smoothstep, so no jolt at either end: B(t) = 2t - 2t³ + t⁴ over 2X); held;
  // then it lets go, its speed rising from nothing to the page's over Lr (the mirror curve, t³ - t⁴/2), and keeps the
  // shift it ended with as the page takes it on. Two parts, as home.css runs them: the brake moves the stage, the
  // letting go moves the words in it (each its own property, so the two animations never fight)
  const brakePart = (s: number) => {
    const X = T.X;
    if (s <= D.sA || X <= 0) return 0;
    if (s >= D.sB) return -X;
    const t = (s - D.sA) / (2 * X);
    return -X * (2 * t - 2 * t * t * t + t * t * t * t);
  };
  const letGo = (s: number) => {
    if (s <= D.sG) return 0;
    if (s >= D.sEnd) return -T.Lr / 2;
    const t = (s - D.sG) / T.Lr;
    return -T.Lr * (t * t * t - (t * t * t * t) / 2);
  };
  const brake = (s: number) => brakePart(s) + letGo(s);

  /* ---------- brightness: the emblem's box (the home canvas) and the flight canvas ---------- */
  // the faint resting brightness is the stylesheet's (home.css .fin-emblem), read before anything sets it
  const b0 = parseFloat(getComputedStyle(emblemBox).opacity) || 0.3;
  let bWas = -1;
  const setBright = (b: number) => {
    const v = Math.round(b * 1000) / 1000;
    if (v === bWas) return;
    bWas = v;
    emblemBox.style.opacity = v <= b0 ? '' : String(v);
    flightCanvas.style.opacity = v >= 1 ? '' : String(v);
  };

  /* ---------- the headline and what follows it ---------- */
  let hold = false; // keyboard focus is inside the finale: everything stays in place
  let lastS = 0;
  const clearChar = (el: HTMLElement) => {
    el.style.visibility = '';
    el.style.opacity = '';
    el.style.transform = '';
    el.style.filter = '';
    el.style.willChange = '';
  };
  // A letter waiting for its stretch is only hidden (no layer, no filter: before, every letter carried its blurred,
  // promoted start from the page's load); it gets will-change for its move alone, and its inline styles are cleared
  // once it lands (home.css drops the base will-change global.css gives every .hero-h1 letter, for the finale's)
  const letters = (s: number) => {
    for (const c of L) {
      const t = clamp((s - c.w0) / (c.w1 - c.w0));
      const q = 1 - Math.pow(1 - t, c.pw);
      if (q === c.at) continue;
      c.at = q;
      const el = c.el;
      if (q >= 1) {
        clearChar(el);
        c.moving = false;
        continue;
      }
      if (q <= 0) {
        el.style.willChange = el.style.transform = el.style.filter = el.style.opacity = '';
        el.style.visibility = 'hidden';
        c.moving = false;
        continue;
      }
      if (!c.moving) {
        c.moving = true;
        el.style.visibility = '';
        el.style.willChange = blurOK ? 'transform, opacity, filter' : 'transform, opacity';
      }
      // fades in over the first part of its move, sharpens (or settles to its size) all the way into place
      el.style.opacity = String(Math.round(Math.min(1, q * 1.8) * 1000) / 1000);
      const tr = `translate3d(${(c.dx * (1 - q)).toFixed(2)}px, ${(c.dy * (1 - q)).toFixed(2)}px, 0)`;
      if (blurOK) {
        el.style.transform = tr;
        const b = c.bl * Math.pow(1 - q, 1.4);
        el.style.filter = b > 0.05 ? `blur(${b.toFixed(2)}px)` : '';
      } else el.style.transform = `${tr} scale(${(c.sc0 + (1 - c.sc0) * q).toFixed(3)})`;
    }
    for (const f of FL) {
      const t = clamp((s - f.w0) / (f.w1 - f.w0));
      const q = 1 - Math.pow(1 - t, 3);
      if (q === f.at) continue;
      f.at = q;
      const el = f.el;
      if (q >= 1) {
        el.style.opacity = '';
        el.style.transform = '';
        continue;
      }
      el.style.opacity = String(Math.round(q * 1000) / 1000);
      el.style.transform = `translate3d(0, ${(36 * (1 - q)).toFixed(2)}px, 0)`;
    }
  };
  const showAll = () => {
    for (const c of L) {
      clearChar(c.el);
      c.at = 1;
      c.moving = false;
    }
    for (const f of FL) {
      f.el.style.opacity = '';
      f.el.style.transform = '';
      f.at = 1;
    }
  };
  // a link that keyboard focus lands on must show at once, wherever the scroll is
  section.addEventListener('focusin', () => {
    hold = true;
    showAll();
    setBright(b0);
  });
  section.addEventListener('focusout', (e) => {
    if (section.contains(e.relatedTarget as Node | null)) return;
    hold = false;
    for (const c of L) {
      c.at = -1;
      c.moving = false;
    }
    for (const f of FL) f.at = -1;
    letters(lastS);
  });

  /* ---------- one scroll update ---------- */
  const paint = (s: number) => {
    if (dirty) measure();
    lastS = s;
    const R = radius(s);
    // the stage: its shift (written only when it changes), and where its top is on the screen now (its sticky place
    // from the layout's own rule, plus the shift)
    const y = Math.round((D.delta + brakePart(s)) * 100) / 100;
    const g = Math.round(letGo(s) * 100) / 100;
    // (written with the scroll-driven animations too: they win over these while they run, and these stay when the
    // animations are cancelled, as in the perf harness's screenshots)
    if (y !== yWas || g !== gWas) {
      yWas = y;
      gWas = g;
      stage.style.translate = `0 ${y}px`;
      inner.style.translate = g ? `0 ${g}px` : '';
    }
    const top = Math.min(Math.max(D.sTop - s, T.X), D.sTop + T.P - s) + y + g;
    // the flight: nothing before the star, the emblem's own canvas once the suck-in is done (the stage has stopped)
    if (s < T.sH0) emblem.fly('hidden');
    else if (s >= D.sC1) emblem.fly(null);
    else {
      FR.t = s;
      FR.ox = D.offX - D.left;
      FR.oy = top + D.offY;
      // the streak behind the star: longer the faster it climbs (its speed in px per px of scroll)
      const v = Math.abs(headY(s - 1) - headY(s + 1)) * 0.5 * DIR_N;
      FR.streak = D.ew * (0.12 + 0.1 * clamp(v - 0.8, 0, 2));
      FR.clipR = R;
      emblem.fly(FR);
    }
    // the emblem's brightness: full as it closes, down to its rest as the letters come in (at rest while keyboard
    // focus holds the words up, so they read)
    setBright(hold ? b0 : 1 - (1 - b0) * smooth(D.sC1 - 0.06 * T.U, D.S1, s));
    if (!hold) letters(s);
    return R;
  };

  plan();
  // the section's new lengths change where the trigger ends ('bottom top'); the others follow on the next refresh
  st.refresh();
  // ?findebug: the plan and the star's place, for the proof sheets (.scratch tools); nothing otherwise
  if (location.search.includes('findebug')) {
    const hp = { x: 0, y: 0, a: 0 };
    (window as unknown as { __fin: unknown }).__fin = {
      T, D,
      at: (s: number) => {
        FR.head(s, hp);
        return { x: hp.x + D.left, y: hp.y, a: hp.a, R: radius(s), shift: D.delta + brake(s) };
      },
    };
  }
  return { paint: (s) => paint(s), circle: () => ({ rk: T.Rk, sWipe: T.sWipe }) };
}
