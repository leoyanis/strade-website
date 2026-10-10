// Landing Page Beautifier preview: pinned and scrubbed on desktop, a self-playing loop on phones.
// The plain page gets read, the interview picks a feel, a diagonal wipe reveals the designed
// version, its pieces land one by one, the next section irises in and the stamp lands.
import { PIN_MEDIA, adopt, once, playInView, splitChars, type Motion } from './core';

export function beautifier(el: HTMLElement, m: Motion) {
  const { gsap, ScrollTrigger } = m;
  const q = (s: string) => el.querySelector<HTMLElement>(s)!;
  const qa = (s: string) => Array.from(el.querySelectorAll<HTMLElement>(s));
  const stage = q('.lpb__stage');
  const view = q('.lpb-view');
  const beam = q('.lpb-beam');
  const edge = q('.lpb-edge');
  const stamp = q('.lpb-stamp');
  const log = qa('.lpb-log li');
  const read = q('.lpb-read');
  const ask = q('.lpb-ask');
  const feels = qa('.lpb-ask li');
  const pick = q('.lpb-ask li.is-pick');
  const chars = splitChars(q('.lpb-h'));
  const page = q('.lpb-page');
  const band = q('.lpb-band');
  const act2 = q('.lpb-a2');
  const nums = qa('.lpb-stats b');

  el.classList.add('is-live');
  adopt(m, [stamp], { rotation: -9 });
  gsap.from([stage, q('.lpb__side')], { y: 50, opacity: 0, duration: 1.2, stagger: 0.12, ease: 'expo.out', scrollTrigger: once(el, 'top 85%') });

  function build() {
    gsap.set(view, { '--w': 0 });
    gsap.set([beam, edge, stamp], { autoAlpha: 0 });
    gsap.set(log, { autoAlpha: 0, x: -8 });
    gsap.set(ask, { autoAlpha: 0, y: 24 });
    gsap.set(feels, { autoAlpha: 0, y: 10 });
    gsap.set(pick, { '--on': 0 });
    gsap.set(page, { yPercent: 0 });
    gsap.set(band, { autoAlpha: 0, rotation: -6, yPercent: 70 });
    gsap.set(act2, { '--ir': 0 });

    const tl = gsap.timeline({ paused: true, defaults: { ease: 'power2.out' } });
    const say = (i: number, at: number) => tl.to(log[i], { autoAlpha: 1, x: 0, duration: 0.3 }, at);
    const pages = { v: 0 };

    // 1. read the plain page
    say(0, 0.05);
    say(1, 0.3);
    tl.fromTo(beam, { top: '-30%', autoAlpha: 1 }, { top: '108%', duration: 1.1, ease: 'power1.inOut', immediateRender: false }, 0.3)
      .to(beam, { autoAlpha: 0, duration: 0.12 }, 1.4)
      .fromTo(pages, { v: 0 }, { v: 4, duration: 1, ease: 'none', onUpdate: () => { read.textContent = String(Math.round(pages.v)); } }, 0.35);

    // 2. a quick interview picks the feel
    tl.to(ask, { autoAlpha: 1, y: 0, duration: 0.5, ease: 'back.out(1.6)' }, 1.5)
      .to(feels, { autoAlpha: 1, y: 0, duration: 0.3, stagger: 0.08 }, 1.65)
      .to(pick, { '--on': 1, duration: 0.25 }, 2.15)
      .fromTo(pick, { scale: 1 }, { scale: 1.08, duration: 0.14, yoyo: true, repeat: 1, immediateRender: false }, 2.15);
    say(2, 2.3);

    // 3. the wipe: same words, designed
    tl.to(edge, { autoAlpha: 1, duration: 0.1 }, 2.6)
      .to(view, { '--w': 1, duration: 1.1, ease: 'power2.inOut' }, 2.6)
      .to(edge, { autoAlpha: 0, duration: 0.15 }, 3.6)
      .from(chars, { yPercent: 115, rotate: 6, opacity: 0, duration: 0.9, ease: 'power4.out', stagger: 0.022 }, 3.0)
      .from(qa('.lpb-a-text small, .lpb-a-text p'), { y: 14, opacity: 0, duration: 0.6, stagger: 0.08 }, 3.3)
      .from(q('.lpb-btn'), { scale: 0.6, opacity: 0, duration: 0.5, ease: 'back.out(2.2)' }, 3.6)
      .from(q('.lpb-loaf'), { scale: 0.5, rotation: -30, opacity: 0, duration: 0.8, ease: 'back.out(1.7)' }, 3.2)
      .from(q('.lpb-sticker'), { scale: 0, rotation: -120, duration: 0.6, ease: 'back.out(1.6)' }, 3.75)
      .from(qa('.lpb-tile'), { yPercent: 140, rotation: (i: number) => [-22, 18, -14][i], opacity: 0, duration: 0.8, ease: 'back.out(1.4)', stagger: 0.1 }, 3.6);
    say(3, 3.2);
    say(4, 3.9);

    // 4. the band peeks in tilted and straightens, then the next section irises in
    tl.to(band, { autoAlpha: 1, yPercent: 0, duration: 0.4 }, 4.3)
      .to(band, { rotation: 0, duration: 0.7, ease: 'power2.inOut' }, 4.7)
      .to(page, { yPercent: -50, duration: 1.2, ease: 'power2.inOut' }, 5.3)
      .to(act2, { '--ir': 1, duration: 1.1, ease: 'power1.inOut' }, 5.35)
      .from(qa('.lpb-a2 h5, .lpb-stats'), { y: 30, opacity: 0, duration: 0.6, stagger: 0.12 }, 5.9);
    nums.forEach((b) => {
      const n = Number(b.dataset.n);
      const suffix = b.dataset.suffix ?? '';
      const o = { v: n > 1000 ? n - 40 : 0 };
      tl.to(o, { v: n, duration: 0.8, ease: 'power3.out', onUpdate: () => { b.textContent = Math.round(o.v) + suffix; } }, 6.1);
    });
    say(5, 5.4);

    // 5. not a single word changed
    tl.fromTo(stamp, { scale: 2.4, rotation: -23, autoAlpha: 0 }, { scale: 1, rotation: -9, autoAlpha: 1, duration: 0.5, ease: 'back.out(1.7)', immediateRender: false }, 7.0)
      .fromTo(stage, { x: 0 }, { x: 4, duration: 0.04, repeat: 5, yoyo: true, ease: 'none', immediateRender: false }, 7.45);
    say(6, 7.1);
    tl.to({}, { duration: 0.9 }, 7.6);
    return tl;
  }

  const mm = gsap.matchMedia();
  mm.add(PIN_MEDIA, (ctx) => {
    if (ctx.conditions?.desk) {
      el.classList.add('is-pinned');
      const tl = build();
      ScrollTrigger.create({
        trigger: el,
        start: 'top top',
        end: '+=260%',
        pin: q('.lpb__pin'),
        scrub: 0.6,
        animation: tl,
        anticipatePin: 1,
        refreshPriority: 1,
      });
      return () => el.classList.remove('is-pinned');
    }
    const tl = build();
    const loop = gsap.timeline({ paused: true, repeat: -1, repeatDelay: 1.2 });
    loop.add(tl.tweenFromTo(0, tl.duration(), { ease: 'none' }));
    playInView(m, stage, loop, 'top 80%');
  });
}
