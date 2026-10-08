// /free: the title rises, the cards deal in and tilt towards the pointer.
import { loadMotion, once, splitChars, splitWords } from './core';

export async function initFreeIndex() {
  const m = await loadMotion();
  // same tick as the from-states below, so nothing flashes
  document.documentElement.classList.remove('fi-intro');
  if (!m) return;
  const { gsap } = m;
  const hero = document.querySelector<HTMLElement>('.free-index');
  const title = hero?.querySelector<HTMLElement>('h1');
  if (hero && title) {
    const intro = gsap.timeline({ defaults: { ease: 'expo.out' }, delay: 0.05 });
    intro
      .from(hero.querySelector('.ql-hero__label'), { y: 16, opacity: 0, duration: 0.8 }, 0)
      .from(splitChars(title), { yPercent: 118, rotate: 6, duration: 1.3, stagger: 0.04 }, 0.1)
      .from(splitWords(hero.querySelector<HTMLElement>('p')!), { yPercent: 70, opacity: 0, duration: 0.9, stagger: 0.012 }, 0.45)
      .from(hero.querySelectorAll('.social-row > *'), { y: 18, opacity: 0, duration: 0.8 }, 0.7);
    gsap.to(hero.querySelector('.container'), { y: -70, opacity: 0.3, ease: 'none', scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true } });
  }

  const cards = Array.from(document.querySelectorAll<HTMLElement>('.res-grid .res-card'));
  gsap.from(cards, {
    y: 110, rotationX: -30, rotationZ: (i: number) => [-5, 2, 5][i % 3], opacity: 0, transformOrigin: '50% 100%',
    duration: 1.3, stagger: 0.12, ease: 'expo.out', clearProps: 'transform', delay: 0.35,
    scrollTrigger: once('.res-grid', 'top 92%'),
  });
  if (window.matchMedia('(pointer: fine)').matches) {
    cards.forEach((card) => {
      const rx = gsap.quickTo(card, 'rotationX', { duration: 0.6, ease: 'power3' });
      const ry = gsap.quickTo(card, 'rotationY', { duration: 0.6, ease: 'power3' });
      card.addEventListener('pointermove', (e) => {
        const r = card.getBoundingClientRect();
        ry(((e.clientX - r.left) / r.width - 0.5) * 12);
        rx(-((e.clientY - r.top) / r.height - 0.5) * 10);
      });
      card.addEventListener('pointerleave', () => {
        rx(0);
        ry(0);
      });
    });
  }

  const cta = document.querySelector<HTMLElement>('.ql-cta');
  if (cta) {
    const h2 = cta.querySelector<HTMLElement>('h2');
    const st = once(cta, 'top 80%');
    if (h2) gsap.from(splitChars(h2), { yPercent: 115, duration: 1.1, ease: 'power4.out', stagger: 0.022, scrollTrigger: st });
    gsap.from(cta.querySelectorAll('p, .hero-actions > *'), { y: 22, opacity: 0, duration: 0.9, stagger: 0.08, ease: 'power3.out', delay: 0.3, scrollTrigger: st });
  }
  m.refresh();
}
