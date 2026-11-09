/*
 * "How it works" (#vt-how): the Network map grows from one person while the stage sticks (VtHow.astro).
 *
 * One scroll clock T runs from -1 (the section's top at the bottom of the screen) through 0 (the stage
 * sticks) to 4 (it lets go); each step owns one unit of it:
 *   arriving   You pops in, the sea of builders fades up, your four project stills fly out and orbit you
 *   step 1     Post what you're making       24.9k project views lands
 *   step 2     the stills fold into you, people bloom in strongest first (ties draw out of you before their
 *              dots), feedback pulses run along the ties and three bits of feedback land
 *                                             3,000+ feedback messages
 *   step 3     "Find people" types a need, then suggestions are tied in one by one, nearest first
 *                                             1,500+ connection requests
 *   step 4     the crowd joins in waves from the middle out    100+ nationalities
 * Every value is eased toward its scroll target each frame, so a fast scroll still glides, and everything
 * runs backwards when you scroll up. The engine (../../vaultt/network.ts, 'world') draws the map; You, the
 * stills and the search bubble are DOM over it (transforms and opacity only).
 * Runs only while the section is near the screen and the tab is visible. Reduced motion / ?still: no
 * sticking (the steps are listed), one finished frame with the bubbles and the search showing.
 */
import { createNetwork, type Network, type Rect } from '../../vaultt/network';
import { makeLander, type Lander } from './case-reels';

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (v: number) => {
  const t = clamp01(v);
  return t * t * (3 - 2 * t);
};

/** Sets up the set piece. Call before anything measures the page: it makes the section tall. */
export function initHow(o: { still: boolean }) {
  const sec = document.getElementById('vt-how');
  const stage = sec?.querySelector<HTMLElement>('.vt-how__stage');
  const canvas = sec?.querySelector<HTMLCanvasElement>('.vt-how__net');
  const field = sec?.querySelector<HTMLElement>('.vt-how__field');
  const col = sec?.querySelector<HTMLElement>('.vt-how__col');
  const find = sec?.querySelector<HTMLElement>('.vt-how__find');
  const q = sec?.querySelector<HTMLElement>('.vt-how__q');
  if (!sec || !stage || !canvas || !field || !col || !find || !q) return;
  const still = o.still;
  const steps = Array.from(sec.querySelectorAll<HTMLElement>('.vt-how__step'));
  const segs = Array.from(sec.querySelectorAll<HTMLButtonElement>('.vt-how__seg'));
  const query = q.dataset.text ?? q.textContent ?? '';
  const landers: (Lander | null)[] = steps.map((s) => {
    const el = s.querySelector<HTMLElement>('[data-vn]');
    return el && !still ? makeLander(el, { label: true }) : null;
  });

  if (still) sec.classList.remove('is-live');
  else sec.classList.add('is-live');
  sec.dataset.ready = '1';

  /* ---------- geometry in canvas px (the stage sticks, so only a resize moves things) ---------- */
  const geo = { hx: 0, hy: 0, half: 25, shield: [] as Rect[] };
  const measure = () => {
    const c = canvas.getBoundingClientRect();
    const f = field.getBoundingClientRect();
    geo.hx = f.left - c.left;
    geo.hy = f.top - c.top;
    const you = field.querySelector<HTMLElement>('.vt-you');
    geo.half = you ? you.offsetWidth / 2 : 25;
    // the words themselves (eyebrow, steps, rail), not the column: on phones without JS its bottom padding
    // is the map's own space, and shielding it dimmed the whole map
    let top = Infinity;
    let left = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    for (const el of Array.from(col.children) as HTMLElement[]) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      top = Math.min(top, r.top);
      left = Math.min(left, r.left);
      right = Math.max(right, r.right);
      bottom = Math.max(bottom, r.bottom);
    }
    const pad = 20;
    geo.shield = top < Infinity ? [{ x: left - c.left - pad, y: top - c.top - pad, w: right - left + pad * 2, h: bottom - top + pad * 2 }] : [];
  };

  /* ---------- the scroll clock and the eased values ---------- */
  const v = { you: 0, sea: 0, sat: 0, fold: 0, reveal: 0, feedback: 0, find: 0, typed: 0, connect: 0, builders: 0 };
  const tgt = { ...v };
  // the keys once, so the frame loop allocates nothing
  const KEYS = Object.keys(v) as (keyof typeof v)[];
  let T = -1;
  /** Reads the scroll and sets every target. Still mode: the finished state. */
  const targets = () => {
    if (still) {
      Object.assign(tgt, { you: 1, sea: 1, sat: 1, fold: 1, reveal: 1, feedback: 1, find: 1, typed: 1, connect: 1, builders: 1 });
      T = 4;
      return;
    }
    const r = sec.getBoundingClientRect();
    const H = innerHeight;
    const D = Math.max(1, r.height - H);
    const e = clamp01((H - r.top) / H);
    const p = clamp01(-r.top / D);
    T = e < 1 ? e - 1 : p * steps.length;
    // You and your projects are out by the time the hub is on screen (it comes up from the bottom at about
    // T -0.5): they used to fly out over the last stretch before the stage stuck, so the section arrived as a
    // headline, a small "You" and a knot of tiny stills
    tgt.you = smooth((T + 0.62) / 0.3);
    tgt.sea = smooth((T + 0.85) / 0.8);
    tgt.sat = smooth((T + 0.5) / 0.36);
    tgt.fold = smooth((T - 1.0) / 0.28);
    tgt.reveal = smooth((T - 1.06) / 0.72);
    // feedback eases off just before step 3 starts, so its bubbles are gone when "Find people" arrives
    tgt.feedback = smooth((T - 1.45) / 0.3) * (1 - 0.86 * smooth((T - 1.84) / 0.2));
    tgt.find = smooth((T - 2.0) / 0.14) * (1 - smooth((T - 3.04) / 0.16));
    tgt.typed = clamp01((T - 2.08) / 0.3);
    // the nearest two thirds of the suggestions: the outer rings' ties would run long and cross the words
    tgt.connect = 0.7 * smooth((T - 2.36) / 0.6);
    tgt.builders = smooth((T - 3.06) / 0.76);
  };

  /* ---------- the steps: one at a time, each number landing as its step arrives ---------- */
  let cur = 0;
  const roll: number[] = steps.map(() => (still ? 1 : 0));
  const rolling = steps.map(() => false);
  const resetAt = steps.map(() => 0);
  const stepAt = (t: number) => (t < -0.35 ? -1 : Math.max(0, Math.min(steps.length - 1, Math.floor(t))));
  const setStep = (s: number) => {
    const next = Math.max(0, s);
    if (next !== cur) {
      steps.forEach((el, i) => {
        el.classList.toggle('is-on', i === next);
        el.classList.toggle('is-past', i < next);
      });
      // the step that left lets its number go once it has faded out, so it lands again on the way back
      resetAt[cur] = performance.now() + 650;
      cur = next;
    }
    if (s >= 0 && roll[next] === 0 && !rolling[next]) rolling[next] = true;
  };
  const tickReels = (dt: number) => {
    const now = performance.now();
    for (let i = 0; i < steps.length; i++) {
      const l = landers[i];
      if (!l) continue;
      if (rolling[i]) {
        roll[i] = Math.min(1, roll[i] + dt / 1.25);
        if (roll[i] >= 1) rolling[i] = false;
        l.set(roll[i]);
      } else if (i !== cur && roll[i] > 0 && resetAt[i] && now > resetAt[i]) {
        roll[i] = 0;
        resetAt[i] = 0;
        l.set(0);
      }
    }
  };

  /* ---------- DOM writes (only when a value moved) ---------- */
  const shown = { you: -1, sat: -1, fold: -1, find: -1, chars: -1 };
  const segF = segs.map(() => -1);
  const writeDom = () => {
    if (Math.abs(v.you - shown.you) > 0.002) field.style.setProperty('--you', (shown.you = v.you).toFixed(3));
    if (Math.abs(v.sat - shown.sat) > 0.002) field.style.setProperty('--sat', (shown.sat = v.sat).toFixed(3));
    if (Math.abs(v.fold - shown.fold) > 0.002) field.style.setProperty('--fold', (shown.fold = v.fold).toFixed(3));
    if (Math.abs(v.find - shown.find) > 0.002) {
      shown.find = v.find;
      find.style.opacity = v.find.toFixed(3);
      find.style.transform = `translate3d(0, ${((1 - v.find) * 14).toFixed(1)}px, 0)`;
    }
    const chars = Math.round(v.typed * query.length);
    if (chars !== shown.chars) {
      shown.chars = chars;
      q.textContent = query.slice(0, chars);
    }
    for (let i = 0; i < segs.length; i++) {
      const f = clamp01(T - i);
      if (Math.abs(f - segF[i]) < 0.003) continue;
      segF[i] = f;
      segs[i].style.setProperty('--f', f.toFixed(3));
      segs[i].classList.toggle('is-on', i === cur);
    }
  };

  /* ---------- the map ---------- */
  // the crowd's density follows the phone breakpoint: on a window that crosses it (a phone turned on its side,
  // a desktop window narrowed) the map is made again, since it kept the crowd it was born with
  const lite = () => innerWidth <= 767;
  let netLite = lite();
  const make = () => {
    netLite = lite();
    return createNetwork(canvas, {
      look: 'world',
      seed: 17,
      reduced: still,
      density: netLite ? 'lite' : 'full',
      pointerTarget: stage,
      ignore: (t) => t instanceof Element && !!t.closest('a, button, .vt-how__col, .vt-how__find'),
      onFrame,
    });
  };
  /** Every frame: the scroll targets, the eased values, then the hub, the shield, the beats and the steps. */
  function onFrame(n: Network, dt: number) {
    targets();
    const k = dt > 0 ? 1 - Math.exp(-dt * 7) : 1;
    for (const key of KEYS) {
      v[key] += (tgt[key] - v[key]) * k;
      if (Math.abs(tgt[key] - v[key]) < 0.0005) v[key] = tgt[key];
    }
    n.hub.x = geo.hx;
    n.hub.y = geo.hy;
    // You covers the hub: people keep a ring clear around the avatar, and the engine draws none of its own
    n.hub.keepW = geo.half;
    n.hub.keepH = geo.half;
    n.hub.keep = 1;
    n.shield.length = 0;
    for (const s of geo.shield) n.shield.push(s);
    n.view.top = 0;
    n.view.height = innerHeight;
    n.view.clearTop = 64;
    n.beats.sea = v.sea;
    n.beats.reveal = v.reveal;
    // feedback waits for the people it lands on: the engine picks who gets the three bubbles the moment
    // the beat starts, and a fast scroll (or a rail jump) started it while nobody was visible yet, so no
    // bubble ever showed. Tied to the reveal, the pick always finds people.
    n.beats.feedback = v.feedback * smooth((v.reveal - 0.8) / 0.15);
    n.beats.connect = v.connect;
    n.beats.builders = v.builders;
    n.beats.calm = 0;
    if (!still) {
      setStep(stepAt(T));
      tickReels(dt);
    }
    writeDom();
  }
  let net = make();

  measure();
  if (still) {
    net.paint();
  } else {
    // start from where the scroll is (a reload can open mid-section): no snap when the loop first runs
    targets();
    Object.assign(v, tgt);
    for (const l of landers) l?.set(0);
    setStep(stepAt(T));
    writeDom();
    let near = false;
    const sync = () => (near && !document.hidden ? net.start() : net.stop());
    new IntersectionObserver((entries) => {
      near = entries[entries.length - 1].isIntersecting;
      // the CSS loops (orbit, bob, ping, caret) pause with the map when the section is off screen
      sec.classList.toggle('is-run', near);
      sync();
    }, { rootMargin: '40px 0px' }).observe(sec);
    document.addEventListener('visibilitychange', sync);
    // the rail jumps to a step (a little way into it, so its moment has started)
    segs.forEach((b, i) => b.addEventListener('click', () => {
      const r = sec.getBoundingClientRect();
      const D = Math.max(1, r.height - innerHeight);
      const top = scrollY + r.top + ((i + 0.3) / steps.length) * D;
      window.scrollTo({ top, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    }));
  }

  // dev only: lets the screenshot scripts find a real person to hover and drag
  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__vtHow = net;

  let rt = 0;
  addEventListener('resize', () => {
    clearTimeout(rt);
    rt = window.setTimeout(() => {
      measure();
      if (lite() !== netLite) {
        const was = net.running;
        net.destroy();
        net = make();
        if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__vtHow = net;
        if (still) net.paint();
        else if (was) net.start();
      } else net.resize();
    }, 140);
  });
  document.fonts?.ready.then(() => {
    measure();
    net.resize();
  });
}
