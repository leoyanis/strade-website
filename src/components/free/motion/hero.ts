// Hero: the title rises letter by letter, the eyebrow types itself, the rest follows.
// Scrolling away drifts the copy up and the background bloom down. The download button
// leans towards the pointer.
import { splitChars, splitWords, typer, type Motion } from './core';

export function hero(el: HTMLElement, m: Motion) {
  const { gsap } = m;
  const q = (s: string) => el.querySelector<HTMLElement>(s);
  const root = document.documentElement;
  const intro = root.classList.contains('sk-intro');

  const title = q('.sk-title');
  const sub = q('.sk-sub');
  const eyebrow = q('.sk-eyebrow__t');
  const preview = q('.sk-hero__preview');
  const chars = title ? splitChars(title) : [];
  const words = sub ? splitWords(sub) : [];
  // Same tick as the from-states below, so nothing flashes.
  root.classList.remove('sk-intro');

  let ready = !intro;
  if (intro) {
    const type = eyebrow ? typer(eyebrow) : null;
    type?.(0);
    const p = { v: 0 };
    const tl = gsap.timeline({ defaults: { ease: 'expo.out' }, delay: 0.05, onComplete: () => { ready = true; } });
    tl.from(q('.free-from'), { y: 22, opacity: 0, duration: 0.9 }, 0)
      .from(q('.sk-eyebrow'), { opacity: 0, duration: 0.3 }, 0.12)
      .to(p, { v: 1, duration: 0.75, ease: 'none', onUpdate: () => type?.(p.v) }, 0.15)
      .from(chars, { yPercent: 118, rotate: 7, duration: 1.25, stagger: 0.028 }, 0.18)
      .from(words, { yPercent: 70, opacity: 0, duration: 0.9, stagger: 0.012 }, 0.5)
      .from(el.querySelectorAll('.sk-get > *'), { y: 24, opacity: 0, duration: 0.9, stagger: 0.08 }, 0.7);
    const kw = q('.free-keyword');
    if (kw) tl.from(kw, { y: 12, opacity: 0, duration: 0.7 }, 0.1);
    if (preview) tl.from(preview, { x: 100, y: 30, rotation: 5, opacity: 0, duration: 1.6 }, 0.3);
  }

  // drift on the way out
  const st = { trigger: el, start: 'top top', end: 'bottom top', scrub: true };
  gsap.to(q('.sk-hero__text'), { y: -90, opacity: 0.2, ease: 'none', scrollTrigger: st });
  gsap.to(q('.sk-hero__bg'), { yPercent: 22, scale: 1.12, ease: 'none', scrollTrigger: st });
  // (the intro moves the preview wrapper, the drift moves what's inside it)
  const inner = preview?.firstElementChild;
  if (inner) gsap.to(inner, { y: -70, rotation: -2, ease: 'none', scrollTrigger: st });

  // magnetic download button
  const btn = q('.sk-get .btn-primary');
  if (btn && window.matchMedia('(pointer: fine)').matches) {
    // created lazily, so they never fight the intro over the button's position
    let xTo: ((v: number) => void) | null = null;
    let yTo: ((v: number) => void) | null = null;
    btn.addEventListener('pointermove', (e) => {
      if (!ready) return;
      xTo ??= gsap.quickTo(btn, 'x', { duration: 0.5, ease: 'power3' });
      yTo ??= gsap.quickTo(btn, 'y', { duration: 0.5, ease: 'power3' });
      const r = btn.getBoundingClientRect();
      xTo((e.clientX - r.left - r.width / 2) * 0.22);
      yTo((e.clientY - r.top - r.height / 2) * 0.32);
    });
    btn.addEventListener('pointerleave', () => {
      xTo?.(0);
      yTo?.(0);
    });
  }
}
