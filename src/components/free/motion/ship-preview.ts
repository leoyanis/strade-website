// Ship-Safe hero chat: Claude types its questions, you answer, then the report drops in
// and ticks off the fixes. Loops while on screen; the window tilts towards the pointer.
import { playInView, tilt, typer, type Motion } from './core';

export function shipPreview(el: HTMLElement, m: Motion) {
  const { gsap } = m;
  const q = (s: string) => el.querySelector<HTMLElement>(s)!;
  const qa = (s: string) => Array.from(el.querySelectorAll<HTMLElement>(s));
  const m1 = q('.fp-m1');
  const m2 = q('.fp-m2');
  const m3 = q('.fp-m3');
  const [type1, type2] = qa('.fp-type').map(typer);
  const picked = q('.fp-m1 .is-picked');
  const report = q('.fp-report');
  const rows = qa('.fp-report li');
  const count = q('.fp-report em b');
  const p1 = { v: 0 };
  const p2 = { v: 0 };
  const c = { v: 0 };

  const tl = gsap.timeline({ paused: true, repeat: -1, repeatDelay: 0.5, defaults: { ease: 'power3.out' } });
  tl.fromTo(m1, { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.5 }, 0)
    .fromTo(p1, { v: 0 }, { v: 1, duration: 0.75, ease: 'none', onUpdate: () => type1(p1.v) }, 0.15)
    .fromTo(qa('.fp-m1 .fp-opts li'), { autoAlpha: 0, x: -12 }, { autoAlpha: 1, x: 0, duration: 0.35, stagger: 0.09 }, 0.85)
    .fromTo(picked, { '--on': 0 }, { '--on': 1, duration: 0.3 }, 1.5)
    .fromTo(picked, { scale: 1 }, { scale: 1.04, duration: 0.14, yoyo: true, repeat: 1 }, 1.5)
    .fromTo(m2, { autoAlpha: 0, scale: 0.5, y: 10 }, { autoAlpha: 1, scale: 1, y: 0, duration: 0.5, ease: 'back.out(2.4)', transformOrigin: '100% 100%' }, 1.8)
    .fromTo(m3, { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.5 }, 2.35)
    .fromTo(p2, { v: 0 }, { v: 1, duration: 0.6, ease: 'none', onUpdate: () => type2(p2.v) }, 2.5)
    .fromTo(qa('.fp-m3 .fp-opts li'), { autoAlpha: 0, x: -12 }, { autoAlpha: 1, x: 0, duration: 0.35, stagger: 0.09 }, 3.1)
    .fromTo(report, { autoAlpha: 0, y: 70, rotation: 9 }, { autoAlpha: 1, y: 0, rotation: 1.6, duration: 0.9, ease: 'back.out(1.5)' }, 3.8)
    .fromTo(rows, { autoAlpha: 0, x: 16 }, { autoAlpha: 1, x: 0, duration: 0.4, stagger: 0.38 }, 4.4)
    .fromTo(rows.map((r) => r.querySelector('i')), { scale: 0 }, { scale: 1, duration: 0.45, stagger: 0.38, ease: 'back.out(3)' }, 4.5)
    .fromTo(c, { v: 0 }, { v: rows.length, duration: rows.length * 0.38, ease: 'none', onUpdate: () => { count.textContent = String(Math.round(c.v)); } }, 4.5)
    .to([m1, m2, m3, report], { autoAlpha: 0, duration: 0.45, stagger: 0.05, ease: 'power2.in' }, 7.6);

  playInView(m, el, tl, 'top 95%');
  const area = el.closest<HTMLElement>('.sk-hero') ?? el;
  tilt(m, area, q('.fp-ship__tilt'), 6);
}
