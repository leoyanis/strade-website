// SSOT preview: pinned and scrubbed on desktop, a self-playing loop on phones.
// The pile gets read, the price clash gets flagged and accepted, then every note flies
// into its doc while the hub and spokes draw themselves, and CLAUDE.md lands on top.
import { PIN_MEDIA, adopt, once, playInView, type Motion } from './core';

export function ssot(el: HTMLElement, m: Motion) {
  const { gsap, ScrollTrigger } = m;
  const q = (s: string) => el.querySelector<HTMLElement>(s)!;
  const qa = <T extends Element = HTMLElement>(s: string) => Array.from(el.querySelectorAll<T>(s));
  const map = q('.ssp__map');
  const items = qa('.ssp-item');
  const clashItems = items.filter((i) => i.classList.contains('is-clash'));
  const calm = items.filter((i) => !i.classList.contains('is-clash'));
  const clash = q('.ssp-clash');
  const beam = q('.ssp-beam');
  const core = q('.ssp-core');
  const glow = q('.ssp-glow');
  const nodes = qa<SVGGElement>('.ssp-node');
  const lines = qa<SVGLineElement>('.ssp-line');
  const up = q('.ssp-up');
  const claude = q('.ssp-claude');
  const log = qa('.ssp-log li');
  const read = q('.ssp-read');
  const flag = q('.ssp-flag');
  const hub = { x: 200, y: 180 };
  // ticks appear in the order the beam passes over the notes
  const byX = [...items].sort((a, b) => parseFloat(a.style.getPropertyValue('--x')) - parseFloat(b.style.getPropertyValue('--x')));

  adopt(m, items, { rotation: (_i: number, it: HTMLElement) => parseFloat(it.style.getPropertyValue('--r')) || 0 });
  adopt(m, [claude], { yPercent: -100 });
  gsap.set([core, ...nodes], { transformOrigin: '50% 50%' });

  gsap.from([map, q('.ssp__side')], { y: 50, opacity: 0, duration: 1.2, stagger: 0.12, ease: 'expo.out', scrollTrigger: once(el, 'top 85%') });

  function build() {
    gsap.set(items, { autoAlpha: 1, scale: 1, '--clash': 0 });
    gsap.set(qa('.ssp-tick'), { '--rd': 0 });
    gsap.set(qa('.ssp-price'), { '--o': 1 });
    gsap.set(beam, { autoAlpha: 0 });
    gsap.set(clash, { autoAlpha: 0 });
    gsap.set([core, ...nodes], { scale: 0 });
    gsap.set(glow, { autoAlpha: 0 });
    lines.forEach((l) => gsap.set(l, { attr: { x2: hub.x, y2: hub.y } }));
    gsap.set(up, { attr: { y2: -14 }, autoAlpha: 0 });
    gsap.set(claude, { autoAlpha: 0, y: -24 });
    gsap.set(log, { autoAlpha: 0, x: -8 });
    gsap.set(flag, { autoAlpha: 0, y: 30 });
    gsap.set(qa('.ssp-flag s'), { '--s': 0 });
    gsap.set(qa('.ssp-flag__rec, .ssp-flag__btns'), { autoAlpha: 0, y: 8 });

    const tl = gsap.timeline({ paused: true, defaults: { ease: 'power2.out' } });
    const say = (i: number, at: number) => tl.to(log[i], { autoAlpha: 1, x: 0, duration: 0.3 }, at);
    const files = { v: 0 };

    // 1. read everything
    say(0, 0.05);
    say(1, 0.3);
    tl.fromTo(beam, { left: '-30%', autoAlpha: 1 }, { left: '108%', duration: 1.1, ease: 'power1.inOut', immediateRender: false }, 0.3)
      .to(beam, { autoAlpha: 0, duration: 0.12 }, 1.4)
      .fromTo(files, { v: 0 }, { v: items.length, duration: 1.0, ease: 'none', onUpdate: () => { read.textContent = String(Math.round(files.v)); } }, 0.35);
    byX.forEach((it, i) => tl.to(it.querySelector('.ssp-tick'), { '--rd': 1, duration: 0.2, ease: 'back.out(3)' }, 0.4 + i * 0.12));
    say(2, 1.45);

    // 2. the prices don't match
    tl.to(clashItems, { '--clash': 1, duration: 0.3 }, 1.6)
      .fromTo(clashItems, { scale: 1 }, { scale: 1.06, duration: 0.15, yoyo: true, repeat: 1 }, 1.6)
      .to(clash, { autoAlpha: 1, duration: 0.3 }, 1.65)
      .to(calm, { opacity: 0.45, duration: 0.3 }, 1.65);
    say(3, 1.7);
    tl.to(flag, { autoAlpha: 1, y: 0, duration: 0.5, ease: 'back.out(1.6)' }, 1.95)
      .to(q('.ssp-s1'), { '--s': 1, duration: 0.25 }, 2.3)
      .to(q('.ssp-s2'), { '--s': 1, duration: 0.25 }, 2.45)
      .to(q('.ssp-flag__rec'), { autoAlpha: 1, y: 0, duration: 0.35 }, 2.6)
      .to(q('.ssp-flag__btns'), { autoAlpha: 1, y: 0, duration: 0.35 }, 2.75)
      .fromTo(q('.ssp-flag__btns .on'), { scale: 1 }, { scale: 0.9, duration: 0.12, yoyo: true, repeat: 1 }, 3.0);

    // 3. accepted: £24 everywhere
    tl.to(qa('.ssp-price'), { '--o': 0, duration: 0.3 }, 3.2)
      .to(clashItems, { '--clash': 0, duration: 0.3 }, 3.2)
      .to(clash, { autoAlpha: 0, duration: 0.3 }, 3.2)
      .to(calm, { opacity: 1, duration: 0.3 }, 3.2);
    say(4, 3.25);

    // 4. everything files itself into the hub and spokes
    tl.to(core, { scale: 1, duration: 0.5, ease: 'back.out(2.2)' }, 3.45).to(glow, { autoAlpha: 1, duration: 0.4 }, 3.55);
    lines.forEach((l, j) => {
      tl.to(l, { attr: { x2: Number(l.dataset.x), y2: Number(l.dataset.y) }, duration: 0.45, ease: 'power2.inOut' }, 3.6 + j * 0.12)
        .to(nodes[j], { scale: 1, duration: 0.45, ease: 'back.out(2.2)' }, 3.9 + j * 0.12);
    });
    items.forEach((it, i) => {
      const v = (name: string) => it.style.getPropertyValue(name);
      tl.fromTo(it, { left: v('--x'), top: v('--y'), rotation: parseFloat(v('--r')) || 0, scale: 1 }, {
        left: v('--tx'), top: v('--ty'), rotation: 0, scale: 0.25, duration: 0.6, ease: 'power2.in',
      }, 3.65 + i * 0.1).to(it, { autoAlpha: 0, duration: 0.15 }, 4.1 + i * 0.1);
    });
    say(5, 3.75);
    say(6, 4.55);

    // 5. CLAUDE.md lands on top and keeps it all in sync
    tl.to(claude, { autoAlpha: 1, y: 0, duration: 0.55, ease: 'back.out(1.8)' }, 4.95)
      .to(up, { autoAlpha: 1, duration: 0.1 }, 5.15)
      .fromTo(up, { attr: { y2: -14 } }, { attr: { y2: hub.y - 46 }, duration: 0.4, ease: 'power2.inOut' }, 5.15)
      .fromTo(core, { scale: 1 }, { scale: 1.12, duration: 0.2, yoyo: true, repeat: 1, immediateRender: false }, 5.55)
      .fromTo(nodes, { '--f': 0 }, { '--f': 1, duration: 0.18, yoyo: true, repeat: 1, stagger: 0.1 }, 5.7);
    say(7, 5.3);
    tl.to({}, { duration: 0.6 }, 6.0);
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
        end: '+=230%',
        pin: q('.ssp__pin'),
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
    playInView(m, map, loop, 'top 80%');
  });
}
