// Motion for /work/vaultt (revamped 2026-11-07). Everything is visible without JS; hidden states are only ever set here
// or in the modules this file starts. Reduced motion and ?still: no loops, no hidden states, finished frames.
//
//   case-how.ts   "How it works": the sticky stage, the map growing step by step (runs first: it makes its section tall)
//   kinds.ts      every project as a square, stacked by kind
//   case-apps.ts  the phones' lean, the big glass bar
//   case-hero.ts  the hero's network and the type's entrance (needs GSAP for the type)
//   below         the rebrand (pinned on desktop), the journey rail, the stack diagram, the quote, the link rows
//
// The old page's sections (Numbers, Story, BriefDemo, Tour, Compare, Working) are no longer rendered; their motion
// went with them. The rebrand's morph and pin are kept as they were.

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

import { initHow } from './case-how';
import { initKinds } from './kinds';
import { initApps } from './case-apps';
import { initHero } from './case-hero';

export async function initVaultt() {
  const root = document.getElementById('vt');
  if (!root) return;

  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches || new URLSearchParams(location.search).has('still');

  // the canvas sections first: How sets its tall sticky layout, Kinds sizes its canvas, before anything measures
  if (!still) root.classList.add('is-play');
  initHow({ still });
  initKinds({ still });
  initApps({ still });
  if (still) {
    initHero({ still: true });
    return;
  }

  let gsap: Any, ScrollTrigger: Any;
  try {
    ({ gsap } = await import('gsap'));
    ({ ScrollTrigger } = await import('gsap/ScrollTrigger'));
  } catch {
    initHero({ still: false });
    return;
  }
  gsap.registerPlugin(ScrollTrigger);
  initHero({ still: false, gsap });

  const $ = (s: string, el: ParentNode = root): Any => el.querySelector(s);
  const $$ = (s: string, el: ParentNode = root): Any[] => Array.from(el.querySelectorAll(s));

  /* ------------------------------------------------------------------ helpers */
  // layout offset of el inside ancestor (ignores transforms, unlike getBoundingClientRect)
  function offsetWithin(el: HTMLElement, ancestor: HTMLElement) {
    let y = 0; let n: Any = el;
    while (n && n !== ancestor) { y += n.offsetTop; n = n.offsetParent; }
    return y;
  }

  /* ------------------------------------------------------------------ rebrand: the name morph */
  function buildMorph(el: HTMLElement) {
    el.classList.add('is-morph');
    const from = $$('.vt-morph__from .ch', el);
    const to = $$('.vt-morph__to .ch', el);
    const icon = $('.vt-morph__icon', el);
    // StudentVenture → Vaultt: keep V, u, t, t (glide into place), drop the rest, grow a + l.
    const keep: Record<number, number> = { 7: 0, 11: 2, 6: 4, 10: 5 };
    const arc: Record<number, number> = { 7: -0.2, 11: -0.34, 6: 0.18, 10: -0.08 };
    const fs = () => parseFloat(getComputedStyle(el).fontSize) || 100;
    gsap.set(to, { opacity: 0 });
    gsap.set(icon, { opacity: 0, scale: 0.4, rotate: -30 });

    const tl = gsap.timeline({ defaults: { ease: 'power3.inOut' } });
    const dropped = from.filter((_, i) => !(i in keep));
    tl.to(dropped, {
      yPercent: 75, rotate: (i: number) => (i % 2 ? 16 : -14), opacity: 0, filter: 'blur(6px)',
      duration: 0.38, ease: 'power2.in', stagger: { each: 0.02, from: 'center' },
    }, 0);
    Object.entries(keep).forEach(([k, ti]) => {
      const fi = +k; const f = from[fi]; const t = to[ti];
      tl.to(f, { x: () => t.offsetLeft - f.offsetLeft, duration: 0.56 }, 0.22);
      tl.to(f, { y: () => arc[fi] * fs(), duration: 0.28, ease: 'sine.out' }, 0.22);
      tl.to(f, { y: 0, duration: 0.28, ease: 'sine.in' }, 0.5);
    });
    [1, 3].forEach((ti, k) => {
      tl.fromTo(to[ti], { opacity: 0, yPercent: -60 }, { opacity: 1, yPercent: 0, duration: 0.3, ease: 'power3.out' }, 0.6 + k * 0.08);
    });
    tl.set(Object.values(keep).map((i) => to[i]), { opacity: 1 }, 0.8);
    tl.set(Object.keys(keep).map((i) => from[+i]), { opacity: 0 }, 0.8);
    tl.to(icon, { opacity: 1, scale: 1, rotate: 0, duration: 0.26, ease: 'back.out(2)' }, 0.78);
    return tl;
  }

  function rebrandPinned() {
    const sec = $('#vt-rebrand');
    if (!sec) return;
    sec.classList.add('is-pinned');
    const stage = $('.vt-rb__stage', sec);
    const mid = $('.vt-rb__mid', sec);
    const ba = $('.vt-ba', sec);
    const yFrom = $('.vt-rb__y.is-from', sec);
    const yTo = $('.vt-rb__y.is-to', sec);
    const tag = $('.vt-rb__tag', sec);
    const after = $('.vt-ba__frame.is-after', sec);
    const handle = $('.vt-ba__handle', sec);
    const morph = buildMorph($('#vt-morph'));

    gsap.set(yTo, { opacity: 0, y: 10 });
    gsap.set(tag, { color: '#19D83A' });

    const centreY = () => stage.clientHeight / 2 - (offsetWithin(mid, stage) + mid.offsetHeight / 2);

    const tl = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: {
        trigger: sec, start: 'top top', end: '+=2600', pin: true, scrub: 0.7,
        anticipatePin: 1, invalidateOnRefresh: true, refreshPriority: 3,
      },
    });
    tl.fromTo(mid, { y: centreY }, { y: centreY, duration: 0.15 }, 0);
    tl.add(morph, 0.15);
    tl.to(sec, { backgroundColor: '#0C2748', duration: 0.9, ease: 'power1.inOut' }, 0.2);
    tl.to(tag, { color: '#6FA8FF', duration: 0.5 }, 0.5);
    tl.to(yFrom, { opacity: 0, y: -10, duration: 0.2 }, 0.55);
    tl.to(yTo, { opacity: 1, y: 0, duration: 0.2 }, 0.65);
    // phase 2: the screens rise in under the new name
    tl.to(mid, { y: 0, duration: 0.55, ease: 'power2.inOut' }, 1.25);
    tl.fromTo(ba, { y: () => window.innerHeight * 0.7, opacity: 0 }, { y: 0, opacity: 1, duration: 0.55, ease: 'power2.out' }, 1.3);
    // phase 3: wipe v1 into today
    tl.fromTo(handle, { opacity: 0 }, { opacity: 1, duration: 0.06 }, 1.95);
    tl.fromTo(after, { clipPath: 'inset(0% 0% 0% 100% round 14px)' }, { clipPath: 'inset(0% 0% 0% 0% round 14px)', duration: 0.75, ease: 'power1.inOut' }, 2.0);
    tl.fromTo(handle, { left: '100%' }, { left: '0%', duration: 0.75, ease: 'power1.inOut' }, 2.0);
    // the two title bars' words never meet at the line: paused mid-wipe they read "platform.studentve|roid and
    // web", and the badges "V1 |TODAY". Each old label fades before the line reaches it, each new one shows only
    // once the line has passed it (read from where the line really is, so any frame size works)
    const frames = $('.vt-ba__frames', sec);
    const pairs: [HTMLElement, HTMLElement][] = [
      [$('.vt-ba__frame.is-before .vt-ba__url-t', sec), $('.vt-ba__frame.is-after .vt-ba__url-t', sec)],
      [$('.vt-ba__frame.is-before .vt-ba__badge', sec), $('.vt-ba__frame.is-after .vt-ba__badge', sec)],
    ].filter(([a, b]) => a && b) as [HTMLElement, HTMLElement][];
    if (frames && pairs.length) {
      const wipe = { p: 0 };
      const ease = (v: number) => {
        const t = v < 0 ? 0 : v > 1 ? 1 : v;
        return t * t * (3 - 2 * t);
      };
      const labels = () => {
        const f = frames.getBoundingClientRect();
        if (!f.width) return;
        // before the line moves the old labels stand (the v1 badge sits right by the frame's edge, where the line starts)
        const x = wipe.p > 0 ? f.left + f.width * (1 - wipe.p) : Infinity;
        for (const [oldEl, newEl] of pairs) {
          const o = oldEl.getBoundingClientRect();
          const n = newEl.getBoundingClientRect();
          oldEl.style.opacity = ease((x - o.right - 6) / 40).toFixed(3);
          newEl.style.opacity = x === Infinity ? '0' : ease((n.left - 6 - x) / 40).toFixed(3);
        }
      };
      for (const [, newEl] of pairs) newEl.style.opacity = '0';
      tl.fromTo(wipe, { p: 0 }, { p: 1, duration: 0.75, ease: 'power1.inOut', onUpdate: labels }, 2.0);
    }
    tl.to(handle, { opacity: 0, duration: 0.08 }, 2.75);
    tl.to({}, { duration: 0.3 }, 2.83);
  }

  function rebrandSimple() {
    const sec = $('#vt-rebrand');
    if (!sec) return;
    const el = $('#vt-morph');
    const morph = buildMorph(el);
    const tl = gsap.timeline({ scrollTrigger: { trigger: el, start: 'top 72%', once: true } });
    tl.add(morph, 0.1);
    // the short name has room to grow once the long one is gone (drop the old word from layout first)
    tl.set($('.vt-morph__from', el), { display: 'none' }, 0.98);
    tl.to(el, { fontSize: () => parseFloat(getComputedStyle(el).fontSize) * 1.6, duration: 0.45, ease: 'power3.out' }, 1.0);
    tl.timeScale(0.5);
    gsap.from($$('.vt-ba__frame', sec), {
      y: 50, opacity: 0, duration: 1, stagger: 0.15, ease: 'power3.out',
      scrollTrigger: { trigger: $('.vt-ba', sec), start: 'top 85%', once: true },
    });
  }

  /* ------------------------------------------------------------------ journey */
  function journey() {
    const track = $('.vt-journey__track');
    if (!track) return;
    gsap.fromTo('.vt-journey__fill', { '--p': 0 }, { '--p': 1, ease: 'none', scrollTrigger: { trigger: track, start: 'top 84%', end: 'bottom 60%', scrub: 0.6 } });
    const tl = gsap.timeline({ scrollTrigger: { trigger: track, start: 'top 86%', once: true } });
    tl.from($$('.vt-journey__step'), { y: 30, opacity: 0, duration: 0.9, stagger: 0.1, ease: 'power3.out' })
      .from($$('.vt-journey__node'), { scale: 0, duration: 0.6, stagger: 0.1, ease: 'back.out(3)' }, 0.15);
  }

  /* ------------------------------------------------------------------ under the hood */
  function stack() {
    const shift = $('#vt-shift');
    if (shift) {
      const tl = gsap.timeline({ scrollTrigger: { trigger: shift, start: 'top 75%', once: true } });
      // only FlutterFlow is struck and dimmed: Firebase and its functions are still in use
      tl.fromTo($$('.vt-shift__strike'), { '--s': 0 }, { '--s': 1, duration: 0.4, stagger: 0.12, ease: 'power2.inOut' }, 0.1)
        .to($$('.is-v1 .vt-shift__chip.is-gone'), { opacity: 0.5, duration: 0.3 }, 0.35)
        .from('.vt-shift__arrow', { y: -10, opacity: 0, duration: 0.4 }, 0.4)
        .from($$('.is-now .vt-shift__chip'), { y: 12, opacity: 0, scale: 0.9, duration: 0.5, stagger: 0.07, ease: 'back.out(2)' }, 0.5);
    }
    // the wires' pulses (a CSS loop) only run while the diagram can be seen
    const stackSec = $('#vt-stack');
    if (stackSec) {
      new IntersectionObserver((entries) => {
        stackSec.classList.toggle('is-run', entries[entries.length - 1].isIntersecting);
      }, { rootMargin: '40px 0px' }).observe(stackSec);
    }
    const arch = $('#vt-arch');
    if (arch) {
      const a = gsap.timeline({ scrollTrigger: { trigger: arch, start: 'top 72%', once: true } });
      a.from($$('.vt-arch__row.is-clients .vt-node'), { y: 30, opacity: 0, duration: 0.6, stagger: 0.1, ease: 'power3.out' })
        .from($$('.vt-arch__wires.is-top .vt-wire'), { scaleY: 0, duration: 0.5, stagger: 0.08, ease: 'power2.out' }, 0.35)
        .from('.vt-arch__core', { y: 30, opacity: 0, duration: 0.7, ease: 'power3.out' }, 0.6)
        .from($$('.vt-cell'), { y: 20, opacity: 0, duration: 0.5, stagger: 0.08 }, 0.8)
        .from('.vt-arch__wires.is-bottom .vt-wire', { scaleY: 0, duration: 0.5 }, 1.1)
        .from('.vt-node.is-ai', { y: 30, opacity: 0, duration: 0.7, ease: 'power3.out' }, 1.3);
    }
  }

  /* ------------------------------------------------------------------ quote + rises */
  function quote() {
    const fig = $('.vt-quote__fig');
    if (!fig) return;
    const mark = $('mark', fig);
    if (mark) gsap.set(mark, { '--m': 0 });
    const tl = gsap.timeline({ scrollTrigger: { trigger: fig, start: 'top 78%', once: true } });
    tl.from('.vt-quote__mark', { scale: 0.5, rotate: -12, opacity: 0, duration: 1.2, ease: 'expo.out' }, 0)
      .from('.vt-quote__text p', { y: 40, opacity: 0, duration: 1.1, ease: 'power3.out' }, 0.1)
      .from('.vt-quote__by', { y: 20, opacity: 0, duration: 0.8, ease: 'power3.out' }, 0.5);
    if (mark) tl.to(mark, { '--m': 1, duration: 1.1, ease: 'power2.inOut' }, 0.7);
  }

  // section heads and the link rows rise in as they arrive
  function rises() {
    const els = $$('[data-rise], .vt-kinds__head, .vt-apps__head, .vt-links .vt-head, .vt-stack .vt-head');
    if (!els.length) return;
    gsap.set(els, { y: 40, opacity: 0 });
    ScrollTrigger.batch(els, {
      start: 'top 90%', once: true,
      onEnter: (batch: Any) => gsap.to(batch, { y: 0, opacity: 1, duration: 0.95, stagger: 0.1, ease: 'power3.out', overwrite: true }),
    });
  }

  /* ------------------------------------------------------------------ run */
  journey();

  // Glyph widths drive the name morph and the pinned layout, so wait for the fonts (never for long).
  try {
    await Promise.race([(document as Any).fonts?.ready, new Promise((r) => setTimeout(r, 1800))]);
  } catch { /* ignore */ }

  const mm = gsap.matchMedia();
  mm.add(
    {
      desk: '(min-width: 1024px) and (min-height: 620px) and (max-height: 1400px)',
      small: '(max-width: 1023px), (max-height: 619px), (min-height: 1401px)',
    },
    (ctx: Any) => {
      if (ctx.conditions.desk) rebrandPinned();
      else rebrandSimple();
      ScrollTrigger.sort();
      return () => {
        document.getElementById('vt-rebrand')?.classList.remove('is-pinned');
        $('#vt-morph')?.classList.remove('is-morph');
        // the labels' crossfade (titles and badges) belongs to the pinned wipe only
        $$('.vt-ba__url-t, .vt-ba__badge').forEach((el) => (el.style.opacity = ''));
      };
    },
  );

  stack();
  quote();
  rises();

  ScrollTrigger.sort();
  ScrollTrigger.refresh();
  window.addEventListener('load', () => ScrollTrigger.refresh());
}
