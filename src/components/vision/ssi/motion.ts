// Motion for /vision/ssi. The page ships its finished state; hidden "from" states only exist once GSAP
// has loaded. Kernel: the site's shared loader (src/components/free/motion/core.ts).
// Blocks (data-fx): hero, company, cat (one per category), end. A "director" turns page scroll into sky
// brightness, parallax and the closing iris (the sky no longer turns).
// Intro order: the brightest stars, then the fainter ones (starfield.ts, ADAPT), then the logo.
// Mobility: the glass card's cinematic (mob-stage.ts) runs on its own scroll maths, so it also works
// without GSAP (reduced motion). Categories: desktop pins each one and scrubs its products (and its
// picture) with the scroll; phones stack them and let the products step through. Pictures: land-scenes.ts.
import { loadMotion, PIN_MEDIA, type Motion } from '../../free/motion/core';
import { createSky, ADAPT, type Sky } from './starfield';
import { mountScenes, type Scenes } from './land-scenes';
import { mountEmblem, ignition, IGNITION_DEFAULTS } from './emblem-motion';
import { mountMobility } from './mob-stage';

type Fx = (el: HTMLElement, m: Motion, sky: Sky | null) => void;

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** When the page started (the sky's dark adaptation counts from here). */
const BOOT = performance.now();
/** The emblem ignites at 3 s, overlapping the end of the star reveal (ADAPT); the wordmark 1.5 s later. */
const LOGO_AT = Math.min(3, ADAPT);
const WORD_AFTER = 1.5;
let scenes: Scenes | null = null;

/* ------------------------------------------------------------------ hero */
const hero: Fx = (el, { gsap }) => {
  const html = document.documentElement;
  const inner = el.querySelector<HTMLElement>('.ssi-hero-in');
  // the emblem slot: animate the wrapper only, so the emblem file inside can be swapped freely
  const mark = el.querySelector<HTMLElement>('[data-emblem-slot]');
  const h1 = el.querySelector<HTMLElement>('.ssi-h1');
  if (!inner || !mark || !h1) return;

  if (html.classList.contains('ssi-intro')) {
    // brightest stars → fainter stars (starfield.ts) → the emblem ignites → only then the wordmark
    const wait = Math.max(0.2, LOGO_AT - (performance.now() - BOOT) / 1000);
    const svg = mark.querySelector<SVGSVGElement>('svg.emb');
    // JS owns these now: drop the CSS failsafe transition so it doesn't smear the tweens
    mark.style.transition = h1.style.transition = 'none';
    gsap.set(h1, { opacity: 0 });
    gsap.set(mark, { opacity: 0 });
    html.classList.remove('ssi-intro');
    const word = () => {
      gsap.fromTo(h1, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 1, ease: 'power2.out' });
    };
    gsap.delayedCall(wait, () => {
      gsap.delayedCall(WORD_AFTER, word);
      if (!svg) {
        gsap.to(mark, { opacity: 1, duration: 1.4, ease: 'power2.inOut' });
        return;
      }
      const em = mountEmblem(svg);
      ignition(gsap, em, IGNITION_DEFAULTS); // sets its own first frame before we show it
      gsap.set(mark, { opacity: 1 });
    });
  }

  // leaving: the title drifts up and away, the star turns a little
  gsap
    .timeline({ scrollTrigger: { trigger: el, start: 'top top', end: 'bottom top', scrub: true } })
    .to(inner, { yPercent: -22, opacity: 0, ease: 'power1.in' }, 0)
    .to(mark, { rotate: 18, scale: 0.82, ease: 'none' }, 0)
    .to(h1, { scale: 1.06, ease: 'none' }, 0);
};

/* ------------------------------------------------------------------ the company */
const company: Fx = (el, { gsap }) => {
  const h = el.querySelector<HTMLElement>('.ssi-co-h');
  if (!h) return;
  // units: each plain word, and the marked span ("the stars.") as one
  const label = (h.textContent ?? '').replace(/\s+/g, ' ').trim();
  const units: string[] = [];
  h.childNodes.forEach((n) => {
    if (n.nodeType === Node.TEXT_NODE) units.push(...(n.textContent ?? '').split(/\s+/).filter(Boolean));
    else if (n instanceof HTMLElement) units.push(n.textContent ?? '');
  });
  h.setAttribute('aria-label', label);
  h.innerHTML = units.map((p) => `<span class="w" aria-hidden="true">${p.replace(/ /g, '&nbsp;')}</span>`).join(' ');
  const words = Array.from(h.querySelectorAll<HTMLElement>('.w'));

  // one unit at a time, tied to the scroll. Starts as soon as the statement's top is on screen (92% down), done
  // when the block sits just above the middle. It used to start two thirds down: the wordmark had drifted off the
  // top by then and the screen held only stars for about 180px of scroll (scrollY 380 to 560 at 1440x900).
  const block = el.querySelector<HTMLElement>('.ssi-co-in') ?? el;
  gsap
    .timeline({ scrollTrigger: { trigger: h, endTrigger: block, start: 'top 92%', end: 'center 44%', scrub: 0.35 } })
    .fromTo(words, { opacity: 0, yPercent: 30, filter: 'blur(10px)' }, { opacity: 1, yPercent: 0, filter: 'blur(0px)', stagger: 1, duration: 1, ease: 'power2.out' }, 0);
  // and leaves as the divisions row under it rises to the top: blurs up and away, scrubbed
  const row = document.querySelector<HTMLElement>('.ssi-div');
  gsap.fromTo(
    block,
    { y: 0, opacity: 1, filter: 'blur(0px)' },
    {
      y: () => -Math.round(innerHeight * 0.14),
      opacity: 0,
      filter: 'blur(18px)',
      ease: 'power1.in',
      immediateRender: false,
      scrollTrigger: row
        ? { trigger: row, start: 'top 34%', end: 'top 1%', scrub: true, invalidateOnRefresh: true }
        : { trigger: block, start: 'center 34%', end: 'bottom top', scrub: true, invalidateOnRefresh: true },
    },
  );
};

/* ------------------------------------------------------------------ the divisions */
const divisions: Fx = (el, { gsap, ScrollTrigger }) => {
  const names = Array.from(el.querySelectorAll<HTMLElement>('.div-it > a, .div-it > span'));
  // the names rise in one after another, out of a blur, right after the title above them
  const title = document.querySelector<HTMLElement>('.ssi-co-h');
  gsap.fromTo(
    names,
    { opacity: 0, yPercent: 40, filter: 'blur(12px)' },
    { opacity: 1, yPercent: 0, filter: 'blur(0px)', stagger: 0.18, ease: 'power2.out', scrollTrigger: { trigger: title ?? el, start: title ? 'bottom 72%' : 'top 92%', end: title ? 'bottom 46%' : 'top 60%', scrub: 0.4 } },
  );
  // the row is the range's tab bar: the division on screen is the lit one
  const tabs = Array.from(el.querySelectorAll<HTMLElement>('.div-it[data-div]'));
  const light = (id: string) =>
    tabs.forEach((t) => {
      const on = t.dataset.div === id;
      t.classList.toggle('is-on', on);
      const a = t.querySelector('a');
      if (on) a?.setAttribute('aria-current', 'true');
      else a?.removeAttribute('aria-current');
    });
  const ids = tabs.map((t) => t.dataset.div ?? '');
  ids.forEach((id, i) => {
    const sec = document.getElementById(id);
    if (!sec || i === 0) return;
    ScrollTrigger.create({ trigger: sec, start: 'top 50%', onToggle: (self) => light(self.isActive || self.progress >= 1 ? id : ids[i - 1]) });
  });
};

/* ------------------------------------------------------------------ a category */
const cat: Fx = (el, { gsap, ScrollTrigger }) => {
  const list = el.querySelector<HTMLElement>('.ssi-list');
  const items = Array.from(el.querySelectorAll<HTMLElement>('.ssi-p'));
  const title = el.querySelector<HTMLElement>('.ssi-cat-h');
  if (!list || !items.length || !title) return;
  const n = items.length;
  let pinned = false;

  // light the active product; when pinned, scroll the list so it sits on the first line
  let lastStep = -1;
  scenes?.onStep(el, (step) => {
    if (Math.abs(step - lastStep) < 0.001) return;
    lastStep = step;
    items.forEach((it, i) => it.style.setProperty('--k', (1 - clamp(Math.abs(step - i))).toFixed(3)));
    if (pinned) {
      const i = Math.min(n - 1, Math.floor(step));
      const f = step - i;
      const o = items[0].offsetTop;
      const a = items[i].offsetTop - o;
      const b = items[Math.min(n - 1, i + 1)].offsetTop - o;
      list.style.transform = `translate3d(0, ${-(a + (b - a) * f)}px, 0)`;
    }
  });

  // Leaving, the name and the products run up under the divisions row, which sticks over the whole range; the row's
  // shade hides what passes behind its names, but a big name half under it still showed through the shade's soft lower
  // edge ("Energy" over "Mining"). So the text fades out on its way up, done before it reaches the row.
  const row = document.querySelector<HTMLElement>('.ssi-div');
  const rowH = () => row?.offsetHeight ?? 64;
  const block = el.querySelector<HTMLElement>('.ssi-cat-text');
  const fadeOut = (target: HTMLElement, vars: object) =>
    gsap.fromTo(target, { opacity: 1 }, { opacity: 0, ease: 'none', immediateRender: false, scrollTrigger: { scrub: true, invalidateOnRefresh: true, ...vars } });

  gsap.matchMedia().add(PIN_MEDIA, (ctx) => {
    if (ctx.conditions?.desk) {
      pinned = true;
      el.classList.add('is-pinned');
      scenes?.setAuto(el, false);
      const pinLen = () => Math.round(innerHeight * (0.5 + 0.62 * n));
      const st = ScrollTrigger.create({
        trigger: el,
        start: 'top top',
        end: () => '+=' + pinLen(),
        pin: true,
        anticipatePin: 1,
        invalidateOnRefresh: true,
        onUpdate: (self) => scenes?.setProgress(el, smooth(0.04, 0.92, self.progress)),
        onRefresh: (self) => scenes?.setProgress(el, smooth(0.04, 0.92, self.progress)),
      });
      // the name arrives as the scene slides in
      const tw = gsap.fromTo(title, { opacity: 0, y: 30 }, { opacity: 1, y: 0, ease: 'power2.out', scrollTrigger: { trigger: el, start: 'top 75%', end: 'top 15%', scrub: 0.4 } });
      // ... and the whole text leaves over the first stretch after the pin lets go: the name sits about a fifth of the
      // way down, so it is gone before its top reaches the row's shade. The last product has had its full share of the
      // pin by then (the scrub reaches it at 92% of the pin). Positions are the pin's own end, read at each refresh (this
      // trigger is created after the pin, so it refreshes after it). Tried `top top-=<pin length>` on the section: the
      // pin's spacing was added on top and the fade sat past the end of the page, the text never faded.
      const fadeLen = () => Math.round(innerHeight * 0.12);
      const out = block ? fadeOut(block, { start: () => st.end, end: () => st.end + fadeLen() }) : null;
      return () => {
        pinned = false;
        el.classList.remove('is-pinned');
        list.style.transform = '';
        st.kill();
        tw.scrollTrigger?.kill();
        tw.kill();
        out?.scrollTrigger?.kill();
        out?.kill();
        if (block) block.style.opacity = '';
      };
    }
    // phones: the products step through on their own; the name and each product fade as they come up to the row (no
    // pin here, plain scrolling, so each one's own position says when)
    scenes?.setAuto(el, true);
    const outs = [title, ...items].map((it) => fadeOut(it, { trigger: it, start: () => `top ${rowH() + 72}px`, end: () => `top ${rowH()}px` }));
    return () => {
      outs.forEach((t) => {
        t.scrollTrigger?.kill();
        t.kill();
      });
      [title, ...items].forEach((it) => (it.style.opacity = ''));
    };
  });
};

/* ------------------------------------------------------------------ end */
const end: Fx = (el, { gsap }) => {
  const img = el.querySelector('.ssi-end-star img');
  if (!img) return;
  gsap.fromTo(img, { scale: 0.3, rotate: -50, opacity: 0 }, { scale: 1, rotate: 0, opacity: 1, ease: 'power2.out', scrollTrigger: { trigger: el, start: 'top 75%', end: 'center 52%', scrub: 0.6 } });
};

/* ------------------------------------------------------------------ the sky director */
function director({ ScrollTrigger }: Motion, root: HTMLElement, sky: Sky) {
  const s = sky.state;

  const mobEl = root.querySelector<HTMLElement>('.ssi-mob');
  const catEl = root.querySelector<HTMLElement>('.ssi-cat');
  const endEl = root.querySelector<HTMLElement>('.ssi-end');
  const star = root.querySelector<HTMLElement>('.ssi-end-star');
  if (!endEl) return;
  // the sky stays at full strength behind the statement; behind the glass card it only dims a little
  // (the blurred stars are part of the glass), and a little more behind the range scenes
  const mobIn = mobEl ? ScrollTrigger.create({ trigger: mobEl, start: 'top 55%', end: 'top top' }) : null;
  const catIn = catEl ? ScrollTrigger.create({ trigger: catEl, start: 'top 55%', end: 'top top' }) : null;
  const endIn = ScrollTrigger.create({ trigger: endEl, start: 'top bottom', end: 'top top' });
  const k = (st: { start: number; end: number } | null, y: number) =>
    !st ? 0 : st.end > st.start ? clamp((y - st.start) / (st.end - st.start)) : y >= st.end ? 1 : 0;

  const update = () => {
    const y = scrollY;
    // full sky in the hero and behind the company statement, a touch dimmer behind the card and the range
    let gain = 1 - 0.14 * smooth(0, 1, k(mobIn, y)) - 0.24 * smooth(0, 1, k(catIn, y));
    // no turning: the sky holds still (it read as odd); only the gentle parallax below
    s.pan = 0;
    // the end: the sky opens back up in a widening circle around the star
    const e = k(endIn, y);
    if (e > 0 && e < 1 && star) {
      const r = star.getBoundingClientRect();
      s.irisX = r.left + r.width / 2;
      s.irisY = r.top + r.height / 2;
      s.irisR = smooth(0, 1, e) * (Math.hypot(innerWidth, innerHeight) + 220);
      s.irisGain = 1;
    } else s.irisR = 0;
    if (e >= 1) gain = 1;
    s.gain = gain;
    // gentle parallax
    s.shift = clamp(y * 0.02, 0, sky.limits.shiftMax);
  };
  ScrollTrigger.create({ start: 0, end: 'max', onUpdate: update, onRefresh: update });
  update();
}

/* ------------------------------------------------------------------ the divisions row's shade */
// The row sticks over the range, and once it has, content runs under it (the Moon on phones, a range heading as its
// section leaves). ssi.astro draws a shade behind the names while the row carries .is-stuck. An IntersectionObserver on
// the 1px marker at the top of .ssi-run says when: the marker leaving over the top of the screen is the row sticking.
// No GSAP and no scroll handler, so it also works under reduced motion and costs nothing while scrolling.
function shadeRow(root: HTMLElement) {
  const row = root.querySelector<HTMLElement>('.ssi-div');
  const top = root.querySelector<HTMLElement>('.ssi-run-top');
  if (!row || !top) return;
  new IntersectionObserver(([e]) => {
    row.classList.toggle('is-stuck', !e.isIntersecting && e.boundingClientRect.top < 0);
  }).observe(top);
}

/* ------------------------------------------------------------------ boot */
export async function initSSI() {
  const root = document.getElementById('ssi');
  if (!root) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  try {
    shadeRow(root);
  } catch (err) {
    if (import.meta.env.DEV) console.error('[ssi] row', err);
  }
  try {
    scenes = mountScenes(root, reduced);
  } catch (err) {
    if (import.meta.env.DEV) console.error('[ssi] scenes', err);
  }
  try {
    const mob = root.querySelector<HTMLElement>('.ssi-mob');
    if (mob) mountMobility(mob, { reduced });
  } catch (err) {
    if (import.meta.env.DEV) console.error('[ssi] mobility', err);
  }
  let sky: Sky | null = null;
  try {
    sky = createSky(root, { reduced });
  } catch (err) {
    if (import.meta.env.DEV) console.error('[ssi] sky', err);
  }

  const m = await loadMotion();
  if (!m) {
    document.documentElement.classList.remove('ssi-intro');
    return;
  }
  const FX: Record<string, Fx> = { hero, company, divisions, cat, end };
  for (const el of Array.from(root.querySelectorAll<HTMLElement>('[data-fx]'))) {
    try {
      FX[el.dataset.fx ?? '']?.(el, m, sky);
    } catch (err) {
      if (import.meta.env.DEV) console.error(`[ssi] ${el.dataset.fx}`, err);
    }
  }
  if (sky) director(m, root, sky);
  m.ScrollTrigger.sort();
  m.refresh();
}
