// Design System Interviewer preview: the question types out and gets answered, the phone
// assembles itself, then the system files deal in. Loops while on screen.
import { playInView, typer, type Motion } from './core';

export function dsPreview(el: HTMLElement, m: Motion) {
  const { gsap } = m;
  const q = (s: string) => el.querySelector<HTMLElement>(s)!;
  const qa = (s: string) => Array.from(el.querySelectorAll<HTMLElement>(s));
  const win = q('.fp-ds__p1 .fp-win');
  const type = typer(q('.fp-type'));
  const p = { v: 0 };
  const picked = q('.fp-opts .is-picked');
  const phone = q('.fp-ds__phonewrap');
  const files = qa('.fp-file');
  const arrows = [q('.fp-ds__a1'), q('.fp-ds__a2')];

  const tl = gsap.timeline({ paused: true, repeat: -1, repeatDelay: 0.4, defaults: { ease: 'power3.out' } });
  tl.fromTo(win, { autoAlpha: 0, y: 20 }, { autoAlpha: 1, y: 0, duration: 0.55 }, 0)
    .fromTo(p, { v: 0 }, { v: 1, duration: 0.9, ease: 'none', onUpdate: () => type(p.v) }, 0.2)
    .fromTo(qa('.fp-opts li'), { autoAlpha: 0, x: -12 }, { autoAlpha: 1, x: 0, duration: 0.35, stagger: 0.09 }, 1.05)
    .fromTo(picked, { '--on': 0 }, { '--on': 1, duration: 0.3 }, 1.7)
    .fromTo(picked, { scale: 1 }, { scale: 1.05, duration: 0.14, yoyo: true, repeat: 1 }, 1.7)
    .fromTo(arrows[0], { autoAlpha: 0, x: -16 }, { autoAlpha: 1, x: 0, duration: 0.45 }, 2.05)
    .fromTo(phone, { autoAlpha: 0, y: 60, rotation: -7, scale: 0.9 }, { autoAlpha: 1, y: 0, rotation: 0, scale: 1, duration: 0.9, ease: 'back.out(1.5)' }, 2.3)
    .fromTo(qa('.fp-app > *'), { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.4, stagger: 0.08 }, 2.75)
    .fromTo(q('.fp-app__hero em i'), { scaleX: 0 }, { scaleX: 1, duration: 0.7, ease: 'power2.out' }, 3.15)
    .fromTo(arrows[1], { autoAlpha: 0, x: -16 }, { autoAlpha: 1, x: 0, duration: 0.45 }, 3.7)
    .fromTo(files, { autoAlpha: 0, y: 70, rotation: 10 }, { autoAlpha: 1, y: 0, rotation: (i: number) => [-3, 2, -1][i] ?? 0, duration: 0.75, stagger: 0.22, ease: 'back.out(1.4)' }, 3.95)
    .fromTo(qa('.fp-file p i, .fp-file__sw i'), { scaleX: 0 }, { scaleX: 1, duration: 0.4, stagger: 0.05 }, 4.5)
    .to([win, phone, ...files, ...arrows], { autoAlpha: 0, duration: 0.45, stagger: 0.03, ease: 'power2.in' }, 7.8);

  playInView(m, el, tl, 'top 85%');
}
