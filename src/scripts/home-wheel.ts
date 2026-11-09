// The hero's wheel of project cards.
//
// The cards sit on a ring that is mostly below the screen: each one hangs from the same far-away pivot
// (CSS transform-origin), so turning it by its offset × --step puts it on the arc. `pos` is the ring's
// position in cards; card i sits at offset wrap(i - pos), so the ring has no ends.
// - It turns slowly by itself, and eases to a stop while the pointer rests on it, so a card is easy to click.
// - Drag it, swipe it, or scroll sideways on a trackpad; a flick carries on and slows back into the drift.
// - Clicking a card opens its case study (a drag never counts as a click).
// - Videos play only on the cards at the front, and only while the wheel is on screen. Cards whose art is
//   drawn in code (the Atlas reel) get the same rule through opts.onPlayable(slug, on).
// - hold(true) stops the drift, goTo(slug) turns that card to the front, and setSelection(0..1) lowers and
//   dims every card but one (the hand dropping back while the picked card is lifted out).
// Cost: ten transforms per frame while the hero is on screen, and nothing at all once it scrolls away.

export type Wheel = {
  goTo: (slug: string, duration?: number) => void;
  hold: (on: boolean) => void;
  setSelection: (s: number, keep: string) => void;
  card: (slug: string) => HTMLElement | null;
  angleOf: (slug: string) => number;
  /** Where a card's face is on the screen for the wheel as it is now: its centre and scale, from the layout read on
   *  resize and remeasure() and the scroll the caller already has, so no layout is read (index.astro's Atlas flight
   *  reads it every frame of the lift; it read the face's getBoundingClientRect there, a forced layout per frame). */
  faceOf: (slug: string, scrollX: number, scrollY: number) => { x: number; y: number; s: number; w: number; h: number };
  /** Reads the layout faceOf() works from again (index.astro, on every ScrollTrigger refresh). */
  remeasure: () => void;
  destroy: () => void;
};

const wrap = (v: number, n: number) => ((((v + n / 2) % n) + n) % n) - n / 2;
const DRIFT = 0.11; // cards per second, about 27px a second at the front

export function createWheel(
  root: HTMLElement,
  opts: { reduced: boolean; onPlayable?: (slug: string, on: boolean) => void },
): Wheel {
  const cards = Array.from(root.querySelectorAll<HTMLElement>('.wc'));
  const N = cards.length;
  const vids = cards.map((c) => c.querySelector('video'));
  // cards with a reel drawn in code instead of a video: told when they may play (called only on a change)
  const reels = cards.map((c) => !!c.querySelector('[data-reel]'));
  const reelOn = cards.map(() => false);
  let step = 8.4;
  let pxPerCard = 220;
  let pivotD = 1700; // from a card's centre down to the shared pivot
  // for faceOf(): the ring's top left on the page, the pivot's distance below a card's bottom, each card's layout box
  let rootX = 0;
  let rootY = 0;
  let pivotR = 1500;
  let boxes = cards.map(() => ({ l: 0, t: 0, w: 1, h: 1, fw: 1, fh: 1 }));
  const measure = () => {
    const cs = getComputedStyle(root);
    step = parseFloat(cs.getPropertyValue('--step')) || 8.4;
    const R = parseFloat(cs.getPropertyValue('--R')) || 1500;
    const h = cards[0]?.offsetHeight || 400;
    pivotD = R + h / 2;
    pxPerCard = (pivotD * step * Math.PI) / 180;
    pivotR = R;
    const rr = root.getBoundingClientRect();
    rootX = rr.left + window.scrollX;
    rootY = rr.top + window.scrollY;
    // (fw, fh: the layout size unrounded, as a getBoundingClientRect would see it; offsets round it to whole pixels)
    boxes = cards.map((c) => {
      const cs = getComputedStyle(c);
      return { l: c.offsetLeft, t: c.offsetTop, w: c.offsetWidth || 1, h: c.offsetHeight || 1, fw: parseFloat(cs.width) || c.offsetWidth || 1, fh: parseFloat(cs.height) || c.offsetHeight || 1 };
    });
  };
  measure();

  let pos = 0;
  let vel = 0; // cards per second
  let tween: { from: number; to: number; t0: number; dur: number } | null = null;
  let dragging = false;
  let held = false;
  let hovering = false;
  let focused = false;
  let wheelUntil = 0; // while trackpad input is arriving, it drives the ring directly
  let driftFrom = performance.now() + 2600; // let the cards be dealt before the ring starts to turn
  let visible = true;
  let sel = 0;
  let keep = '';

  /* ---------- draw (each style is written only when it changed) ---------- */
  const was = cards.map(() => ({ t: '', o: '', z: '', v: '', f: false }));
  const render = () => {
    for (let i = 0; i < N; i++) {
      const off = wrap(i - pos, N);
      const ad = Math.abs(off);
      const card = cards[i];
      let op = ad < 3.3 ? 1 : Math.max(0, 1 - (ad - 3.3) / 0.7);
      const s = 1 - 0.12 * Math.min(1, ad);
      let lift = -16 * Math.max(0, 1 - ad);
      if (sel > 0 && card.dataset.slug !== keep) {
        // the rest of the hand drops back and fades out, so the picked card (and its names, when it comes
        // apart in mid-air) reads clean against it. 0.84 left the other cards' names readable next to the
        // layer names (two sets of text); 0.96 still left them as dim rectangles behind the flight, read as
        // leftovers (full-site check, 2026-11-08), so they go all the way (and are hidden at 0, render below).
        // sel follows the flight's scroll, so they come back the same way
        lift += sel * (64 + ad * 26);
        op *= 1 - sel;
      }
      // the scale happens about the far pivot, so lift the card back up by what it costs (keeps it on the arc)
      const back = (1 - s) * pivotD;
      const t = `rotate(${(off * step).toFixed(3)}deg) translate3d(0, ${(lift - back).toFixed(1)}px, 0) scale(${s.toFixed(4)})`;
      const w = was[i];
      if (t !== w.t) card.style.transform = w.t = t;
      const o = op.toFixed(3);
      if (o !== w.o) card.style.opacity = w.o = o;
      const z = String(100 - Math.round(ad * 10));
      if (z !== w.z) card.style.zIndex = w.z = z;
      const v = op < 0.01 ? 'hidden' : 'visible';
      if (v !== w.v) card.style.visibility = w.v = v;
      const f = ad < 0.5;
      if (f !== w.f) card.classList.toggle('is-front', (w.f = f));
    }
  };

  /* ---------- videos: only the cards at the front play ---------- */
  const syncVideos = () => {
    vids.forEach((v, i) => {
      const want = visible && !opts.reduced && sel < 0.02 && Math.abs(wrap(i - pos, N)) < 1.1;
      if (reels[i] && want !== reelOn[i]) {
        reelOn[i] = want;
        opts.onPlayable?.(cards[i].dataset.slug ?? '', want);
      }
      if (!v) return;
      if (want && v.paused) v.play().catch(() => {});
      else if (!want && !v.paused) v.pause();
    });
  };

  /* ---------- motion ---------- */
  let raf = 0;
  let last = 0;
  const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const resting = () => held || hovering || focused || opts.reduced || performance.now() < driftFrom;
  const tick = (now: number) => {
    raf = 0;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    if (tween) {
      const k = Math.min(1, (now - tween.t0) / (tween.dur * 1000));
      pos = tween.from + (tween.to - tween.from) * easeInOut(k);
      if (k >= 1) {
        pos = tween.to;
        tween = null;
        vel = 0;
      }
    } else if (!dragging && now > wheelUntil) {
      // a flick slows back into the drift; on hover, focus or hold it comes to rest instead
      const goal = resting() ? 0 : DRIFT;
      vel += (goal - vel) * (1 - Math.exp(-2.6 * dt));
      if (goal === 0 && Math.abs(vel) < 0.002) vel = 0;
      pos += vel * dt;
    }
    render();
    syncVideos();
    schedule();
  };
  const needsFrames = () => visible && (dragging || tween !== null || vel !== 0 || performance.now() < wheelUntil || !resting());
  function schedule() {
    if (raf) return;
    if (!needsFrames()) {
      last = 0;
      return;
    }
    raf = requestAnimationFrame(tick);
  }

  const toward = (to: number, duration: number) => {
    vel = 0;
    tween = { from: pos, to, t0: performance.now(), dur: duration };
    schedule();
  };

  /* ---------- drag, swipe ---------- */
  let x0 = 0;
  let pos0 = 0;
  let moved = false;
  let samples: { x: number; t: number }[] = [];
  let pid = -1;
  const onDown = (e: PointerEvent) => {
    if (e.button !== 0 || sel > 0.02) return;
    dragging = true;
    moved = false;
    x0 = e.clientX;
    pos0 = pos;
    vel = 0;
    tween = null;
    samples = [{ x: e.clientX, t: performance.now() }];
    pid = e.pointerId;
    schedule();
  };
  const onMove = (e: PointerEvent) => {
    if (!dragging || e.pointerId !== pid) return;
    const dx = e.clientX - x0;
    if (!moved && Math.abs(dx) > 6) {
      moved = true;
      root.setPointerCapture?.(e.pointerId);
      root.classList.add('is-dragging');
    }
    if (!moved) return;
    pos = pos0 - dx / pxPerCard;
    samples.push({ x: e.clientX, t: performance.now() });
    if (samples.length > 6) samples.shift();
    schedule();
  };
  const onUp = (e: PointerEvent) => {
    if (!dragging || e.pointerId !== pid) return;
    dragging = false;
    root.classList.remove('is-dragging');
    if (moved) {
      const a = samples[0];
      const b = samples[samples.length - 1];
      const dt = Math.max(16, b.t - a.t) / 1000;
      // a flick keeps going; a slow release just lets go
      vel = performance.now() - b.t > 90 ? 0 : Math.max(-14, Math.min(14, -((b.x - a.x) / pxPerCard) / dt));
      // a drag is not a click (the click that follows this release, if any, is swallowed)
      const swallow = (ev: Event) => {
        ev.preventDefault();
        ev.stopPropagation();
      };
      root.addEventListener('click', swallow, { capture: true });
      window.setTimeout(() => root.removeEventListener('click', swallow, { capture: true }), 250);
    }
    schedule();
  };

  /* ---------- trackpads and sideways wheels (plain vertical scrolling is left to the page) ---------- */
  const onWheel = (e: WheelEvent) => {
    if (sel > 0.02) return;
    const dx = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.shiftKey ? e.deltaY : 0;
    if (!dx) return;
    e.preventDefault();
    tween = null;
    vel = 0;
    pos += (dx * (e.deltaMode === 1 ? 16 : 1)) / pxPerCard;
    wheelUntil = performance.now() + 140;
    schedule();
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    toward(Math.round(pos) + (e.key === 'ArrowRight' ? 1 : -1), 0.55);
  };

  root.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  root.addEventListener('wheel', onWheel, { passive: false });
  root.addEventListener('keydown', onKey);
  // stop under a resting mouse (not under a finger: a touch ends with the finger lifted anyway)
  root.addEventListener('pointerover', (e) => {
    if (e.pointerType === 'mouse' && (e.target as HTMLElement).closest('.wc')) hovering = true;
  });
  root.addEventListener('pointerout', (e) => {
    if (e.pointerType !== 'mouse') return;
    const to = e.relatedTarget as HTMLElement | null;
    if (!to || !to.closest || !to.closest('.wc')) {
      hovering = false;
      schedule();
    }
  });
  // keyboard focus stops it too (a mouse press focuses a card as well, which should not)
  root.addEventListener('focusin', (e) => { focused = !!(e.target as HTMLElement).matches?.(':focus-visible'); });
  root.addEventListener('focusout', () => { focused = false; schedule(); });
  // a hidden tab gets no frames; pick up again cleanly when it comes back
  document.addEventListener('visibilitychange', () => { last = 0; schedule(); });

  const io = new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    syncVideos();
    schedule();
  });
  io.observe(root);
  let rt = 0;
  const onResize = () => {
    clearTimeout(rt);
    rt = window.setTimeout(() => {
      measure();
      render();
    }, 120);
  };
  window.addEventListener('resize', onResize);
  // the drift begins after the deal; make sure a frame is asked for then
  window.setTimeout(schedule, driftFrom - performance.now() + 20);

  render();
  syncVideos();
  schedule();

  return {
    goTo(slug, duration = 0.9) {
      const i = cards.findIndex((c) => c.dataset.slug === slug);
      if (i < 0) return;
      const off = wrap(i - pos, N);
      if (Math.abs(off) < 0.002 && !tween) return;
      toward(pos + off, Math.max(0.35, duration * Math.min(1, Math.abs(off) / 1.5 + 0.35)));
    },
    hold(on) {
      held = on;
      if (!on) driftFrom = Math.max(driftFrom, performance.now() + 900);
      schedule();
      if (!on) window.setTimeout(schedule, 920);
    },
    setSelection(s, k) {
      const prev = sel;
      sel = Math.max(0, Math.min(1, s));
      keep = k;
      if (sel !== prev) {
        render();
        syncVideos();
      }
    },
    card: (slug) => cards.find((c) => c.dataset.slug === slug) ?? null,
    angleOf(slug) {
      const i = cards.findIndex((c) => c.dataset.slug === slug);
      return i < 0 ? 0 : wrap(i - pos, N) * step;
    },
    faceOf(slug, sx, sy) {
      const i = cards.findIndex((c) => c.dataset.slug === slug);
      if (i < 0) return { x: 0, y: 0, s: 1, w: 1, h: 1 };
      // render()'s transform for the card, rotate(a) translate(0, lift - back) scale(s) about its pivot (the
      // transform origin, R below its bottom centre), applied to its centre: the centre ends up at the pivot plus
      // (pivotD - lift) along the turned card's axis (the sel lift and fade are not the kept card's)
      const off = wrap(i - pos, N);
      const ad = Math.abs(off);
      const s = 1 - 0.12 * Math.min(1, ad);
      let lift = -16 * Math.max(0, 1 - ad);
      if (sel > 0 && cards[i].dataset.slug !== keep) lift += sel * (64 + ad * 26);
      const a = (off * step * Math.PI) / 180;
      const b = boxes[i];
      const d = pivotD - lift;
      return { x: rootX - sx + b.l + b.w / 2 + d * Math.sin(a), y: rootY - sy + b.t + b.h + pivotR - d * Math.cos(a), s, w: b.fw * s, h: b.fh * s };
    },
    remeasure() {
      measure();
    },
    destroy() {
      cancelAnimationFrame(raf);
      io.disconnect();
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      window.removeEventListener('resize', onResize);
    },
  };
}
