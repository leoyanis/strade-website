// Mobility on /vision/ssi: the glass card's cinematic and its lines.
// This file is the light part (no three.js): it makes the section a sticky runway, turns the scroll into
// the approach (pre, 0..1, until the stage pins) and one progress value P (0..1) over the runway, swaps the
// beat lines, steps the glass card away on a clock past TL.cardOff (a CSS transition, so its fade never
// depends on scroll speed), draws only when the scroll moved, and loads the WebGL engine (mob-engine.ts, three.js)
// only when the section comes near. The engine is freed again once the section has been far away for a while.
// Reduced motion: the same runway, but each beat is one still frame (rendered once, the lights fully lit)
// and the lines swap without animation. No JS: the card is an empty pane and the lines a plain list (ssi.astro).
import type { Engine } from './mob-engine';
import { TL, beatOf, KEYFRAMES, clamp, smooth } from './mob-timeline';

type Opts = { reduced: boolean };

export function mountMobility(section: HTMLElement, { reduced }: Opts) {
  const stage = section.querySelector<HTMLElement>('.mob-stage');
  const card = section.querySelector<HTMLElement>('.mob-card');
  const canvas = section.querySelector<HTMLCanvasElement>('.mob-gl');
  const beats = Array.from(section.querySelectorAll<HTMLElement>('.mob-beat'));
  const copy = section.querySelector<HTMLElement>('.mob-copy');
  if (!stage || !card || !canvas || !beats.length) return;

  section.classList.add('is-live');

  /* ------------------------------------------------------------ progress */
  let target = 0; // from the scroll
  let P = 0; // smoothed (a light scrub)
  let preT = 0; // the approach: the section's top from the bottom of the screen to the top (pinned)
  let pre = 0;
  const measure = () => {
    const r = section.getBoundingClientRect();
    const run = r.height - innerHeight;
    target = run > 0 ? clamp(-r.top / run) : 0;
    preT = clamp(1 - r.top / innerHeight);
  };

  /* ------------------------------------------------------------ the lines */
  let lastText = -1;
  const setText = (p: number) => {
    const key = Math.round(p * 2000);
    if (key === lastText) return;
    lastText = key;
    beats.forEach((el, i) => {
      const [a, b] = TL.text[i];
      // in: a short rise out of a blur, with its picture; out: up and away
      const fin = smooth(a - 0.012, a + 0.006, p);
      const fout = 1 - smooth(b - 0.008, b + 0.01, p);
      const k = Math.min(fin, fout);
      if (reduced) {
        // still frames: the first picture is already lit, so its line is there from the start
        el.style.opacity = (i === 0 || p >= a) && p < b ? '1' : '0';
        return;
      }
      const y = fin < 1 ? (1 - fin) * 16 : (1 - fout) * -14;
      el.style.opacity = k.toFixed(3);
      el.style.transform = k < 0.999 ? `translate3d(0, ${y.toFixed(1)}px, 0)` : '';
      el.style.filter = k < 0.995 ? `blur(${((1 - k) * 7).toFixed(2)}px)` : '';
    });
    // the whole column leaves with the card
    const out = smooth(TL.exit[0], TL.exit[0] + 0.05, p);
    if (copy) {
      copy.style.opacity = (1 - out).toFixed(3);
      copy.style.filter = out > 0.002 && !reduced ? `blur(${(out * 10).toFixed(2)}px)` : '';
    }
  };

  /* ------------------------------------------------------------ the card's glass */
  // it steps away for the Moon (just the Moon over the stars) and stays away to the end: a class past a
  // threshold, the fade itself a CSS transition (1.4 s), reversed when scrolling back up
  let lastCard = -1;
  const setCard = (p: number) => {
    const off = p >= TL.cardOff ? 1 : 0;
    if (off === lastCard) return;
    lastCard = off;
    section.classList.toggle('is-moon', !!off);
  };
  let lastCover = false;
  const setCover = (on: boolean) => {
    if (on === lastCover) return;
    lastCover = on;
    section.classList.toggle('gl-cover', on);
  };

  /* ------------------------------------------------------------ the engine */
  let engine: Engine | null = null;
  let loading: Promise<void> | null = null;
  let failed = false;
  const layout = () => {
    if (!engine) return;
    const s = stage.getBoundingClientRect();
    const c = card.getBoundingClientRect();
    const radius = parseFloat(getComputedStyle(card).borderTopLeftRadius) || 0;
    engine.setSize({
      w: s.width,
      h: s.height,
      card: { x: c.left - s.left, y: c.top - s.top, w: c.width, h: c.height, r: radius },
    });
  };
  const load = () => {
    if (engine || loading || failed) return loading;
    loading = import('./mob-engine')
      .then(async ({ createEngine }) => {
        engine = await createEngine(canvas, { reduced, phone: innerWidth < 901, wake: () => frameOnce() });
        layout();
        drawn = -1;
        frameOnce();
      })
      .catch((err) => {
        failed = true;
        if (import.meta.env.DEV) console.error('[ssi] mobility engine', err);
      })
      .finally(() => (loading = null));
    return loading;
  };
  const free = () => {
    engine?.dispose();
    engine = null;
    setCover(false);
  };

  /* ------------------------------------------------------------ the loop */
  let raf = 0;
  let last = performance.now();
  const t0 = last;
  let visible = false;
  let stillKey = -1;
  // what the canvas last showed: draw again only when the scroll moved (or the engine asks)
  let drawn = -1;
  let drawnPre = -1;
  const paint = (now: number, dt: number) => {
    if (!engine) return false;
    if (Math.abs(P - drawn) < 1e-5 && Math.abs(pre - drawnPre) < 1e-5 && !engine.dirty()) return false;
    engine.render(P, (now - t0) / 1000, dt, pre);
    drawn = P;
    drawnPre = pre;
    setCover(engine.covers());
    return true;
  };

  const draw = (now: number) => {
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    measure();
    if (reduced) {
      // a still frame per beat: snap to the beat's key moment
      const b = beatOf(target);
      P = target;
      setText(P);
      setCard(P);
      if (engine && (b !== stillKey || engine.dirty())) {
        stillKey = b;
        engine.render(KEYFRAMES[b], 4, 0, 1);
        setCover(engine.covers());
      }
      return;
    }
    // a light scrub: quick enough to feel direct, soft enough to hide wheel steps
    const k = 1 - Math.exp(-dt * 9);
    P += (target - P) * k;
    pre += (preT - pre) * k;
    if (Math.abs(target - P) < 1e-5) P = target;
    if (Math.abs(preT - pre) < 1e-5) pre = preT;
    setText(P);
    setCard(P);
    paint(now, dt);
  };
  // the loop runs while the scrub is still settling (or an asset is due), then sleeps until the next scroll
  const frame = (now: number) => {
    raf = 0;
    draw(now);
    const busy = P !== target || pre !== preT || !!loading || !!engine?.dirty();
    if (busy && visible && !reduced && !document.hidden) raf = requestAnimationFrame(frame);
  };
  const wake = () => {
    if (raf || reduced) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  };
  const frameOnce = () => {
    if (reduced) {
      stillKey = -1;
      draw(performance.now());
    } else if (visible) wake();
  };

  // near: load the engine; on screen: draw; far for a while: free the GPU
  let freeTimer: number | undefined;
  const near = new IntersectionObserver(
    ([e]) => {
      if (e.isIntersecting) {
        clearTimeout(freeTimer);
        load();
      } else freeTimer = window.setTimeout(free, 2500);
    },
    { rootMargin: '120% 0px' },
  );
  near.observe(section);
  const onScreen = new IntersectionObserver(
    ([e]) => {
      visible = e.isIntersecting;
      if (visible) frameOnce();
    },
    { rootMargin: '0px' },
  );
  onScreen.observe(section);

  if (reduced) addEventListener('scroll', () => visible && draw(performance.now()), { passive: true });
  else addEventListener('scroll', () => visible && wake(), { passive: true });
  document.addEventListener('visibilitychange', () => !document.hidden && frameOnce());
  let rt: number | undefined;
  addEventListener('resize', () => {
    clearTimeout(rt);
    rt = window.setTimeout(() => {
      layout();
      lastText = lastCard = -1;
      drawn = -1;
      frameOnce();
    }, 120);
  });
  document.fonts?.ready.then(() => layout());

  // first paint of the lines (before any engine)
  measure();
  P = target;
  pre = preT;
  setText(P);
  setCard(P);

  if (import.meta.env.DEV)
    Object.assign(window, {
      __mob: {
        get P() {
          return P;
        },
        get pre() {
          return pre;
        },
        /** jump to a raw scroll position relative to the section's top (px; negative = before it) */
        at: (dy: number) => {
          const r = section.getBoundingClientRect();
          scrollTo(0, scrollY + r.top + dy);
          measure();
          P = target;
          pre = preT;
          lastText = lastCard = -1;
          drawn = -1;
          draw(performance.now());
          return { P, pre };
        },
        engine: () => engine,
        state: () => ({ engine: !!engine, loading: !!loading, failed, visible }),
        load,
        /** testing without rAF (a hidden preview): jump to p and draw `frames` frames synchronously */
        shot: async (p: number, frames = 30, lead = 0) => {
          const t = (performance.now() - t0) / 1000 - frames / 60 + lead;
          await load();
          const r = section.getBoundingClientRect();
          scrollTo(0, scrollY + r.top + (r.height - innerHeight) * p);
          layout();
          measure();
          P = target;
          pre = preT;
          lastText = lastCard = -1;
          setText(P);
          setCard(P);
          for (let i = 0; i < frames; i++) engine?.render(P, t + i / 60, 1 / 60, pre);
          const sky = (window as unknown as { __sky?: { snap: (x: number, y: number, w: number, h: number) => string } }).__sky;
          sky?.snap(0, 0, 2, 2);
          return { P, engine: !!engine };
        },
        /** jump the page to progress p (0..1) of the runway */
        go: (p: number) => {
          const r = section.getBoundingClientRect();
          const run = r.height - innerHeight;
          scrollTo(0, scrollY + r.top + run * p);
          measure();
          P = target;
          pre = preT;
          lastText = lastCard = -1;
          drawn = -1;
          draw(performance.now());
        },
      },
    });
}
