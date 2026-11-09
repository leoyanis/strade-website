/*
 * Moves one set of drawn app cards (VaulttCards.astro) with its homepage number. The same v as the number
 * (number-chaos.ts): 0 waiting below, 1 in place, 2 gone off the top; plus `dwell`, 0 to 1 while the block
 * holds the middle of the screen, for the small things that happen while you look.
 *
 * - builders: the cards rise as one stack, then fan out from behind the front card (outer cards last); while
 *   the number holds they open a touch further; leaving, they are flung up and outward, the outer ones first.
 * - projects: dealt from a deck below the middle into their spread, one after another; they loosen a little
 *   while the number holds; leaving, each lifts away from the middle and up.
 * - jobs: they slide in one by one; while the number holds, the last one's Apply turns to Applied with the scroll
 *   (the pill fades out as the tick pops in, overshooting a touch, and back again scrolling up); leaving, they lift
 *   off in turn.
 *
 * Every card rests where the CSS puts it (the finished state, for no-JS and reduced motion). Transform and
 * opacity only, written only when v or dwell moved, and the whole set is hidden (no paint, no layers) while it
 * waits or has gone.
 *
 * Layers: a card holds a compositor layer only while it moves in its set's arrival or exit and can be seen (it
 * gets `will-change` and a translate3d then). Holding, and before or after its own part of a transition, it is
 * painted with its block like the rest of the page: a 2D transform, no `will-change`, and a card nobody can see
 * is not painted at all. A translate3d alone (z = 0) still makes Chromium give an element its own layer
 * ("Trivial3DTransform", checked 2026-11-08), so the transform's form is what decides, not only `will-change`.
 * Phones at 4x CPU paid for up to ten card layers at once through a hand-over (two sets, every card from the
 * moment its set showed, see/measure in README's Performance section).
 *
 * near() tells vaultt-home.ts how close the visible cards come to a point (the network's hub, where the drawn
 * "You" sits), from the transforms written this frame and the card boxes measured on resize: no layout reads.
 */

export interface Cards {
  /** Reads the cards' scale and their boxes (call after layout changes). */
  measure(): void;
  /** Places every card for v (0 waiting, 1 in place, 2 gone) and dwell (0 to 1 while holding). */
  set(v: number, dwell: number): void;
  /**
   * How close the cards that can be seen come to a circle at (x, y) in the set's box (px from its top left) with
   * radius r: 1 when any of them overlaps it, falling to 0 once every one is `feather` px clear of it.
   */
  near(x: number, y: number, r: number, feather: number): number;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const outCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const inCubic = (t: number) => t * t * t;
const outBack = (t: number) => {
  const c = 1.4;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};
const DEG = Math.PI / 180;
// The stretch of the jobs' dwell (0 to 1 over the first 85% of their hold, vaultt-home.ts) over which the live card
// turns to Applied: Apply still reads for the first fifth of the hold (it has shown since the card slid in), the pop
// takes half the hold, and Applied has settled for the last quarter, before Endless Pursuit's world comes in where
// the hold ends. With the short hold (a third of a screen) the earlier stretch, 0.35 to 0.75, would pop in about 90ms
// at a normal scroll (110px of a 1440x900 desktop's hold at 1200px/s); this one takes 165px.
const APPLY_FROM = 0.25;
const APPLY_TO = 0.85;

interface Card {
  el: HTMLElement;
  x: number; // rest centre, points (projects, jobs)
  y: number;
  r: number; // rest turn, deg
  i: number; // order
  rank: number; // builders: 0 the front card, 1 the next pair, 2 the outer pair
  spin: number; // a seeded extra turn for the deal and the fling, deg
  last: string;
  // measured (px inside the set's box, see measure()): the card's own box, untransformed, and its transform origin
  bl: number;
  bt: number;
  bw: number;
  bh: number;
  ox: number;
  oy: number;
  // what it shows now: translate (px), turn (deg), scale, opacity; and whether it holds a layer and can be seen
  tx: number;
  ty: number;
  rot: number;
  sc: number;
  op: number;
  layer: boolean;
  seen: boolean;
}

// one card's pose for this frame, filled by builder() / project() / job(): translate in points, turn, scale,
// opacity, and whether the card is part-way through its own move (a transition), not resting or out of sight
const pose = { tx: 0, ty: 0, rot: 0, sc: 1, op: 1, moving: false };

/** Sets up the cards under `el` (a `.vxv`). With `reduced`, they stay where the CSS puts them. */
export function makeCards(el: HTMLElement, reduced: boolean): Cards {
  const kind = el.dataset.vxv ?? '';
  const cards: Card[] = Array.from(el.querySelectorAll<HTMLElement>('.vxv__card')).map((c, i) => {
    const r = Number(c.dataset.r ?? 0);
    return {
      el: c,
      x: Number(c.dataset.x ?? 230),
      y: Number(c.dataset.y ?? 200),
      r,
      i,
      rank: Math.round(Math.abs(r) / 8),
      // fixed per card (no randomness at run time: every visit looks the same)
      spin: ((i * 37) % 11) - 5,
      last: '',
      bl: 0, bt: 0, bw: 0, bh: 0, ox: 0, oy: 0,
      // the CSS rest pose (rotate(var(--r)) about the card's own origin) until the first set()
      tx: 0, ty: 0, rot: r, sc: 1, op: 1,
      layer: false,
      seen: true,
    };
  });
  let k = 1;
  let shown: 'hidden' | 'active' | 'rest' = 'rest';
  let lastV = -1;
  let lastD = -1;

  // The live job card (the last one) starts on Apply and turns to Applied while its number holds. Its start state
  // is CSS under html.vx-live, which an inline script in VaulttHome.astro sets before the cards are parsed (not on
  // reduced motion or ?still), so the first paint already shows Apply and nothing flips when this runs. Tried
  // taking Applied off here instead: a reload mid-section painted Applied, flipped to Apply when this ran, then
  // back to Applied as the number held. Without that class (no JS, reduced motion, ?still, or the gate's timeout
  // passed before this ran) the card keeps its written, finished state and is never driven.
  const live = el.querySelector<HTMLElement>('.vxv__job--live');
  const root = document.documentElement;
  const pill = live?.querySelector<HTMLElement>('.vxv__apply');
  const tick = live?.querySelector<HTMLElement>('.vxv__applied');
  const drive = !reduced && !!live && !!pill && !!tick && root.classList.contains('vx-live');
  // tells the gate's timeout that a script took the card over (so it leaves html.vx-live in place); under it the two
  // states lose their CSS transitions (vaultt-cards.css), since the scroll places them
  if (drive) root.classList.add('vx-live-on');
  let applied = -1;

  /** The live job from Apply (0) to Applied (1), placed for the scroll: the pill fades and shrinks a little as the
   *  tick fades in and pops, overshooting a touch (the CSS transition it replaces did the same in 0.5 s). */
  function setApplied(a: number) {
    const q = Math.round(a * 1000) / 1000;
    if (q === applied) return;
    applied = q;
    // the fades finish a little before the pop, as the transitions' 0.32 s did against their 0.5 s
    const o = smooth(0, 0.64, q);
    const ps = pill!.style;
    const ts = tick!.style;
    ps.opacity = (1 - o).toFixed(3);
    ps.transform = q <= 0 ? 'none' : `scale(${(1 - 0.15 * q).toFixed(3)})`;
    ts.opacity = o.toFixed(3);
    ts.transform = q >= 1 ? 'none' : `scale(${(0.7 + 0.3 * outBack(q)).toFixed(3)})`;
  }

  /** Builders: rise as a stack, fan out, open a touch while held, flung up and out when leaving. */
  function builder(c: Card, e: number, x: number, d: number) {
    const rise = outCubic(clamp01((e - 0.03 * c.rank) / 0.55));
    const fan = outBack(clamp01((e - 0.32 - 0.1 * c.rank) / 0.5));
    const open = 1 + 0.09 * d;
    pose.tx = 0;
    pose.ty = (1 - rise) * 96;
    pose.rot = c.r * fan * open;
    pose.sc = 0.9 + 0.1 * rise;
    pose.op = smooth(0, 0.3, e - 0.05 * c.rank);
    // arriving: from its first frame on screen until both its rise and its fan have settled
    pose.moving = e < 1 && (rise < 1 || fan !== 1);
    if (x > 0) {
      const u = clamp01((x - 0.13 * (2 - c.rank)) / 0.7);
      const w = inCubic(u);
      const side = Math.sign(c.r) || (c.i % 2 ? 1 : -1);
      pose.tx = side * w * (40 + 46 * c.rank);
      pose.ty = -w * (190 + 34 * c.rank);
      pose.rot = c.r * open * (1 + 0.7 * w) + side * w * (6 + c.spin);
      pose.sc = 1 - 0.07 * w;
      pose.op = 1 - smooth(0.25, 0.92, u);
      pose.moving = u > 0;
    }
  }

  /** Projects: dealt from a deck below the middle, loosen while held, lift away from the middle when leaving. */
  function project(c: Card, e: number, x: number, d: number) {
    const u = clamp01((e - c.i * 0.1) / 0.6);
    const w = outCubic(u);
    const drift = 0.04 * d;
    pose.tx = (230 - c.x) * (1 - w) + (c.x - 230) * drift;
    pose.ty = (350 - c.y) * (1 - w) + (c.y - 200) * drift;
    pose.rot = c.r + (c.spin * 2.4) * (1 - outBack(u));
    pose.sc = 0.84 + 0.16 * w;
    pose.op = smooth(0, 0.35, u);
    pose.moving = u > 0 && u < 1;
    if (x > 0) {
      const q = clamp01((x - c.i * 0.08) / 0.66);
      const v = inCubic(q);
      pose.tx = (c.x - 230) * (drift + 0.5 * v);
      pose.ty = (c.y - 200) * drift - v * (170 + 22 * (c.i % 3));
      pose.rot = c.r + Math.sign(c.x - 230 || 1) * v * (10 + Math.abs(c.spin));
      pose.sc = 1 - 0.05 * v;
      pose.op = 1 - smooth(0.2, 0.9, q);
      pose.moving = q > 0;
    }
  }

  /** Jobs: slide in one by one from the right, lift off in turn when leaving. */
  function job(c: Card, e: number, x: number) {
    const u = clamp01((e - c.i * 0.14) / 0.62);
    const w = outCubic(u);
    pose.tx = (1 - w) * 76;
    pose.ty = (1 - w) * 34;
    pose.rot = c.r + (1 - w) * 5;
    pose.sc = 0.96 + 0.04 * w;
    pose.op = smooth(0, 0.42, u);
    pose.moving = u > 0 && u < 1;
    if (x > 0) {
      const q = clamp01((x - c.i * 0.1) / 0.66);
      const v = inCubic(q);
      pose.tx = -v * (18 + 10 * c.i);
      pose.ty = -v * (160 + 26 * c.i);
      pose.rot = c.r - v * (3 + c.i);
      pose.sc = 1 - 0.04 * v;
      pose.op = 1 - smooth(0.2, 0.9, q);
      pose.moving = q > 0;
    }
  }

  return {
    measure() {
      k = el.offsetWidth / 460 || 1;
      lastV = -1;
      for (const c of cards) {
        c.last = '';
        // the card's box inside the set, before its transform (offsets ignore transforms), and its origin
        c.bl = c.el.offsetLeft;
        c.bt = c.el.offsetTop;
        c.bw = c.el.offsetWidth;
        c.bh = c.el.offsetHeight;
        const o = getComputedStyle(c.el).transformOrigin.split(' ');
        c.ox = parseFloat(o[0]) || c.bw / 2;
        c.oy = parseFloat(o[1]) || c.bh / 2;
      }
    },
    set(v: number, dwell: number) {
      if (reduced) return;
      // the last job applies over the middle of the number's hold (its dwell, from the scroll) and stays applied on
      // the way out; scrolling back up unapplies it the same way
      if (drive) setApplied(v > 1.0001 ? 1 : smooth(APPLY_FROM, APPLY_TO, dwell));
      // (as number-chaos.ts: never skip the step onto an end, or a card can stay a hair off its rest, holding a layer;
      // the same for the dwell's ends, which a slow scroll now creeps up to in steps smaller than the skip)
      const end = v === 0 || v === 1 || v === 2;
      const dwellEnd = (dwell === 0 || dwell === 1) && dwell !== lastD;
      if (!dwellEnd && (v === lastV || (!end && Math.abs(v - lastV) < 0.0008)) && Math.abs(dwell - lastD) < 0.002) return;
      lastV = v;
      lastD = dwell;
      if (v <= 0 || v >= 2) {
        if (shown !== 'hidden') {
          shown = 'hidden';
          el.style.visibility = 'hidden';
          for (const c of cards) {
            c.el.style.willChange = '';
            c.layer = false;
            // c.seen keeps tracking the card's own visibility style, so the next arrival rewrites it where it
            // differs (a card left showing by a jump must not reappear with a stale pose before its turn)
            c.last = '';
          }
        }
        return;
      }
      if (shown !== 'active') {
        shown = 'active';
        el.style.visibility = '';
      }
      const e = clamp01(v);
      const x = clamp01(v - 1);
      for (const c of cards) {
        if (kind === 'builders') builder(c, e, x, dwell);
        else if (kind === 'projects') project(c, e, x, dwell);
        else job(c, e, x);
        c.tx = pose.tx * k;
        c.ty = pose.ty * k;
        c.rot = pose.rot;
        c.sc = pose.sc;
        c.op = pose.op;
        const seen = pose.op > 0.001;
        const layer = seen && pose.moving;
        // the transform keeps GSAP-like rounding (README rule 10); its 3D form only while the card has a layer
        const t = `(${c.tx.toFixed(1)}px, ${c.ty.toFixed(1)}px${layer ? ', 0' : ''}) rotate(${c.rot.toFixed(2)}deg) scale(${c.sc.toFixed(3)})`;
        const tf = (layer ? 'translate3d' : 'translate') + t;
        const key = `${tf}|${seen ? c.op.toFixed(3) : '-'}`;
        if (key === c.last) continue;
        c.last = key;
        const s = c.el.style;
        if (layer !== c.layer) {
          c.layer = layer;
          s.willChange = layer ? 'transform, opacity' : '';
        }
        if (seen !== c.seen) {
          c.seen = seen;
          // out of sight inside a set that shows (waiting for its turn, or already gone): not painted at all
          s.visibility = seen ? '' : 'hidden';
        }
        if (!seen) continue;
        s.transform = tf;
        s.opacity = c.op >= 0.999 ? '' : c.op.toFixed(3);
      }
    },
    near(x: number, y: number, r: number, feather: number): number {
      if (shown === 'hidden') return 0;
      let best = 0;
      for (const c of cards) {
        if (!c.seen || c.op < 0.04 || !c.bw) continue;
        // the point in the card's own untransformed box: undo translate, turn and scale about its origin
        const qx = x - c.bl - c.ox - c.tx;
        const qy = y - c.bt - c.oy - c.ty;
        const a = -c.rot * DEG;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        const px = (qx * ca - qy * sa) / c.sc + c.ox;
        const py = (qx * sa + qy * ca) / c.sc + c.oy;
        // its distance to the box, back in screen px (0 inside it); rounded corners count as square (a margin)
        const dx = Math.max(-px, 0, px - c.bw);
        const dy = Math.max(-py, 0, py - c.bh);
        const dist = Math.sqrt(dx * dx + dy * dy) * c.sc;
        const n = 1 - smooth(0, 1, (dist - r) / feather);
        if (n > best) best = n;
        if (best >= 1) break;
      }
      return best;
    },
  };
}
