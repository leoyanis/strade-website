// "Styles it can do": the chips switch the phone's style (with or without motion).
// Desktop: pinned, and scrolling walks through every style while the phone turns.
// Phones: it cycles on its own while on screen; tapping a chip takes over for a while.
import { PIN_MEDIA, once, type Motion } from './core';
import { revealHeading } from './sections';
import { pad } from '../inline';

type Morph = {
  n: number;
  cur: number;
  set: (i: number) => void;
  onPick?: (i: number) => void;
  onChange?: (i: number, prev: number) => void;
};
const morphs = new WeakMap<HTMLElement, Morph>();

/** Plain behaviour: chips change the style, the phone scales to fit. Runs even with reduced motion. */
export function styleMorphBasic(root: HTMLElement) {
  const phone = root.querySelector<HTMLElement>('.sm-phone')!;
  const chips = Array.from(root.querySelectorAll<HTMLButtonElement>('.sm-chip'));
  const name = root.querySelector<HTMLElement>('.sm__name > span');
  const count = root.querySelector<HTMLElement>('.sm__count b');
  const stage = root.querySelector<HTMLElement>('.sm__stage')!;
  const fit = root.querySelector<HTMLElement>('.sm-fit')!;

  const sm: Morph = {
    n: chips.length,
    cur: 0,
    set(i) {
      if (i === sm.cur) return;
      const prev = sm.cur;
      sm.cur = i;
      phone.dataset.style = chips[i].dataset.style;
      chips.forEach((c, k) => {
        c.classList.toggle('is-on', k === i);
        c.setAttribute('aria-pressed', String(k === i));
      });
      if (count) count.textContent = pad(i + 1);
      if (name) name.textContent = chips[i].textContent;
      sm.onChange?.(i, prev);
    },
  };
  chips.forEach((c, i) => c.addEventListener('click', () => (sm.onPick ? sm.onPick(i) : sm.set(i))));

  // The phone is drawn at 280x578; scale it to the stage.
  const resize = () => {
    const k = Math.min(1.15, stage.clientHeight / 600, stage.clientWidth / 300);
    if (k > 0) fit.style.setProperty('--k', k.toFixed(3));
  };
  new ResizeObserver(resize).observe(stage);
  resize();
  morphs.set(root, sm);
}

export function styleMorph(root: HTMLElement, m: Motion) {
  const sm = morphs.get(root);
  if (!sm) return;
  const { gsap, ScrollTrigger } = m;
  const phone = root.querySelector<HTMLElement>('.sm-phone')!;
  const name = root.querySelector<HTMLElement>('.sm__name > span');
  const bar = root.querySelector<HTMLElement>('.sm__bar');
  const stage = root.querySelector<HTMLElement>('.sm__stage')!;
  revealHeading(root.querySelector('.sm__h'), m);

  gsap.from(root.querySelectorAll('.sm__chips li'), {
    y: 24, scale: 0.7, opacity: 0, duration: 0.6, stagger: 0.04, ease: 'back.out(2)', clearProps: 'transform',
    scrollTrigger: once(root, 'top 80%'),
  });
  gsap.from(stage, { y: 80, opacity: 0, duration: 1.3, ease: 'expo.out', scrollTrigger: once(root, 'top 80%') });

  sm.onChange = (i, prev) => {
    if (name) gsap.fromTo(name, { yPercent: i > prev ? 105 : -105 }, { yPercent: 0, duration: 0.55, ease: 'power3.out', overwrite: true });
    phone.classList.remove('is-swap');
    void phone.offsetWidth;
    phone.classList.add('is-swap');
    gsap.fromTo(phone, { scale: 0.955 }, { scale: 1, duration: 0.7, ease: 'back.out(2.6)', overwrite: 'auto' });
  };

  const mm = gsap.matchMedia();
  mm.add(PIN_MEDIA, (ctx) => {
    if (ctx.conditions?.desk) {
      root.classList.add('is-pinned');
      // the phone turns slowly through the whole pinned stretch
      const turn = gsap.fromTo(phone, { rotationY: -18, rotationX: 6 }, { rotationY: 18, rotationX: -4, ease: 'none', paused: true });
      const st = ScrollTrigger.create({
        trigger: root,
        start: 'top top',
        end: () => `+=${Math.round(window.innerHeight * 0.3 * sm.n)}`,
        pin: root.querySelector<HTMLElement>('.sm__pin')!,
        scrub: 0.6,
        animation: turn,
        anticipatePin: 1,
        refreshPriority: 1,
        onUpdate: (self) => {
          sm.set(Math.min(sm.n - 1, Math.floor(self.progress * sm.n)));
          bar?.style.setProperty('--p', self.progress.toFixed(3));
        },
      });
      // a chip scrolls you to its style
      sm.onPick = (i) => window.scrollTo({ top: st.start + ((i + 0.5) / sm.n) * (st.end - st.start), behavior: 'smooth' });
      return () => {
        root.classList.remove('is-pinned');
        sm.onPick = undefined;
      };
    }
    let timer = 0;
    let holdUntil = 0;
    const tick = () => Date.now() > holdUntil && sm.set((sm.cur + 1) % sm.n);
    ScrollTrigger.create({
      trigger: stage,
      start: 'top 85%',
      end: 'bottom 15%',
      onToggle: (self) => {
        window.clearInterval(timer);
        if (self.isActive) timer = window.setInterval(tick, 1900);
      },
    });
    sm.onPick = (i) => {
      holdUntil = Date.now() + 6000;
      sm.set(i);
    };
    return () => {
      window.clearInterval(timer);
      sm.onPick = undefined;
    };
  });
}
