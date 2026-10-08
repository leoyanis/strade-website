// Scroll motion for the regular sections of a free resource page.
import { once, splitChars, splitWords, typer, type Motion, type Tl } from './core';
import { pad } from '../inline';

const fine = () => window.matchMedia('(pointer: fine)').matches;
const $ = <T extends Element = HTMLElement>(s: string, root: ParentNode) => root.querySelector<T>(s) as T;
const $$ = <T extends Element = HTMLElement>(s: string, root: ParentNode) => Array.from(root.querySelectorAll<T>(s));

/** Section titles rise letter by letter while their accent line draws out. */
export function revealHeading(h: HTMLElement | null, m: Motion) {
  if (!h) return;
  const { gsap } = m;
  const chars = splitChars(h.querySelector<HTMLElement>('.sk-h__t') ?? h);
  const st = once(h, 'top 88%');
  gsap.from(chars, { yPercent: 115, rotate: 5, duration: 1.05, ease: 'power4.out', stagger: 0.022, scrollTrigger: st });
  gsap.fromTo(h, { '--ln': 0 }, { '--ln': 1, duration: 1.6, ease: 'expo.out', delay: 0.15, scrollTrigger: st });
}

/* ------------------------------------------------------------------ how to use it */

/** One small timeline per step scene; restarted whenever its step becomes active. */
function buildScene(root: HTMLElement | null, m: Motion): Tl | null {
  if (!root) return null;
  const { gsap } = m;
  const q = (s: string) => $(s, root);
  const qa = (s: string) => $$(s, root);
  const acc = getComputedStyle(root).getPropertyValue('--acc').trim() || '#00e5ff';
  const pop = { scale: 0.4, opacity: 0, y: 10, duration: 0.5, ease: 'back.out(2.5)' };
  const tl = gsap.timeline({ paused: true, defaults: { ease: 'power3.out' } });

  if (root.classList.contains('art-zip')) {
    tl.from(q('.az-zip'), { y: 26, rotation: -4, opacity: 0, duration: 0.6, ease: 'back.out(1.7)' }, 0)
      .fromTo(q('.az-ico--zip i'), { scaleY: 1 }, { scaleY: 0, duration: 0.5, ease: 'power2.inOut' }, 0.55)
      .fromTo(q('.az-ico--zip'), { rotation: 0 }, { rotation: 8, duration: 0.12, yoyo: true, repeat: 3, ease: 'none' }, 0.55)
      .from(q('.az-arrow'), { y: -10, opacity: 0, duration: 0.4 }, 0.85)
      .from(q('.az-folder'), { y: -40, scale: 0.7, opacity: 0, duration: 0.7, ease: 'back.out(2)' }, 1.0)
      .from(q('.az-child'), { x: -16, opacity: 0, duration: 0.5 }, 1.4);
  } else if (root.classList.contains('art-cmd')) {
    const type = typer(q('.ac-cmd'));
    const p = { v: 0 };
    tl.from(qa('.ac-row:not(.is-new)'), { x: -14, opacity: 0, duration: 0.4, stagger: 0.1 }, 0)
      .from(qa('.ac-row.is-new'), { x: 70, opacity: 0, duration: 0.65, stagger: 0.12, ease: 'back.out(1.6)' }, 0.45)
      .from(q('.ac-term'), { y: 14, opacity: 0, duration: 0.4 }, 0.95)
      .fromTo(p, { v: 0 }, { v: 1, duration: 0.8, ease: 'none', onUpdate: () => type(p.v) }, 1.2)
      .fromTo(q('.ac-enter'), { scale: 1 }, { scale: 0.82, duration: 0.12, yoyo: true, repeat: 1, ease: 'power2.inOut' }, 2.1)
      .fromTo(q('.ac-term'), { boxShadow: '0 0 0 1px rgba(255,255,255,0.08), 0 0 0px -6px rgba(0,0,0,0)' }, { boxShadow: `0 0 0 1px ${acc}, 0 0 34px -6px ${acc}`, duration: 0.45 }, 2.15);
  } else if (root.classList.contains('art-chips')) {
    const type = typer(q('.ach-q'));
    const p = { v: 0 };
    const picked = q('.ach-opts li.is-picked');
    tl.from(q('.ach-label'), { y: 10, opacity: 0, duration: 0.4 }, 0)
      .fromTo(p, { v: 0 }, { v: 1, duration: 0.7, ease: 'none', onUpdate: () => type(p.v) }, 0.15)
      .from(qa('.ach-opts li'), { x: -14, opacity: 0, duration: 0.4, stagger: 0.08 }, 0.75)
      .fromTo(picked, { '--on': 0 }, { '--on': 1, duration: 0.3 }, 1.45)
      .fromTo(picked, { scale: 1 }, { scale: 1.04, duration: 0.15, yoyo: true, repeat: 1 }, 1.45)
      .from(q('.art-reply'), pop, 1.7);
    const prog = q('.ach-prog');
    if (prog) {
      const dots = qa('.ach-dots i');
      const n = q('.ach-prog b');
      const c = { v: 0 };
      tl.from(prog, { y: 8, opacity: 0, duration: 0.4 }, 2.0).fromTo(c, { v: 0 }, {
        v: dots.length, duration: 1.8, ease: 'none',
        onUpdate: () => {
          n.textContent = String(Math.max(1, Math.ceil(c.v)));
          dots.forEach((d, j) => d.classList.toggle('on', j < Math.floor(c.v)));
        },
      }, 2.1);
    }
  } else if (root.classList.contains('art-review')) {
    const rows = qa('.ar-card li');
    const btn = q('.ar-btn');
    const reply = q('.art-reply');
    let t = 0.3 + rows.length * 0.12 + 0.35;
    tl.from(q('.ar-card'), { y: 20, opacity: 0, duration: 0.5 }, 0).from(rows, { x: -12, opacity: 0, duration: 0.4, stagger: 0.12 }, 0.3);
    if (btn) {
      tl.from(btn, { y: 8, opacity: 0, duration: 0.35 }, t).fromTo(btn, { scale: 1 }, { scale: 0.9, duration: 0.12, yoyo: true, repeat: 1 }, t + 0.55);
      t += 0.8;
    }
    if (reply) {
      tl.from(reply, pop, t);
      t += 0.6;
    }
    const fixes = rows.filter((r) => r.classList.contains('has-fix'));
    tl.fromTo(fixes, { '--ok': 0 }, { '--ok': 1, duration: 0.35, stagger: 0.4 }, t).fromTo(
      fixes.map((r) => $('.ar-ic', r)), { scale: 1 }, { scale: 1.3, duration: 0.15, yoyo: true, repeat: 1, stagger: 0.4 }, t,
    );
  } else if (root.classList.contains('art-files')) {
    tl.from(qa('.af-file'), { y: 70, rotation: 10, opacity: 0, duration: 0.75, stagger: 0.2, ease: 'back.out(1.4)' }, 0).from(
      qa('.af-file li, .af-file code span, .af-sw i'), { x: -10, opacity: 0, duration: 0.35, stagger: 0.05 }, 0.55,
    );
  } else if (root.classList.contains('art-slider')) {
    const seg = q('.as-seg');
    const n = qa('.as-seg span').length;
    tl.from(q('.as-card'), { y: 20, opacity: 0, duration: 0.5 }, 0)
      .fromTo(seg, { '--x': 0 }, { '--x': n - 1, duration: 1.4, ease: 'power2.inOut' }, 0.5)
      .from(q('.as-hint'), { y: 6, opacity: 0, duration: 0.4 }, 1.8)
      .fromTo(q('.as-hint i'), { rotation: 0, scale: 1 }, { rotation: 180, scale: 1.5, duration: 0.5, yoyo: true, repeat: 1 }, 1.9);
    const reply = q('.art-reply');
    if (reply) tl.from(reply, pop, 2.4);
  } else if (root.classList.contains('art-pile')) {
    const chips = qa('.ap-chip');
    const count = q('.ap-count b');
    const c = { v: 0 };
    tl.from(q('.ap-zone'), { scale: 0.96, opacity: 0, duration: 0.4 }, 0)
      .from(chips, { y: -200, rotation: (i: number) => (i % 2 ? 50 : -50), opacity: 0, duration: 0.8, stagger: 0.15, ease: 'bounce.out' }, 0.2)
      .fromTo(c, { v: 0 }, { v: chips.length, duration: chips.length * 0.15 + 0.5, ease: 'none', onUpdate: () => { count.textContent = String(Math.floor(c.v)); } }, 0.3);
  } else if (root.classList.contains('art-phone')) {
    const ph = q('.aph-phone');
    const sw = qa('.aph-sw i');
    const rad = q('.aph-rad > span');
    tl.set(ph, { '--ph': acc, '--rr': '6px' }, 0)
      .set(sw, { '--sel': 0 }, 0)
      .set(sw[0], { '--sel': 1 }, 0)
      .set(rad, { '--r': '20%' }, 0)
      .from(ph, { y: 30, rotation: -6, opacity: 0, duration: 0.7, ease: 'back.out(1.6)' }, 0)
      .from(q('.aph-q'), { x: 20, opacity: 0, duration: 0.5 }, 0.3)
      .from(q('.aph-tools'), { y: 12, opacity: 0, duration: 0.4 }, 0.6)
      .to(sw[0], { '--sel': 0, duration: 0.2 }, 1.1).to(sw[1], { '--sel': 1, duration: 0.2 }, 1.1).to(ph, { '--ph': '#7b6bff', duration: 0.5 }, 1.1)
      .to(sw[1], { '--sel': 0, duration: 0.2 }, 1.8).to(sw[2], { '--sel': 1, duration: 0.2 }, 1.8).to(ph, { '--ph': '#ff8a3d', duration: 0.5 }, 1.8)
      .to(rad, { '--r': '80%', duration: 0.8, ease: 'power2.inOut' }, 2.3).to(ph, { '--rr': '18px', duration: 0.8, ease: 'power2.inOut' }, 2.3)
      .to(sw[2], { '--sel': 0, duration: 0.2 }, 3.2).to(sw[0], { '--sel': 1, duration: 0.2 }, 3.2).to(ph, { '--ph': acc, duration: 0.5 }, 3.2)
      .from(q('.art-reply'), pop, 3.6);
  }
  return tl;
}

export function steps(el: HTMLElement, m: Motion) {
  const { gsap, ScrollTrigger } = m;
  const list = $('.sk-steps', el);
  const items = $$('.sk-steps > li', el);
  if (!list || !items.length) return;
  el.classList.add('is-live');
  revealHeading($('.sk-how__h', el), m);

  const stage = $('.sk-how__stage', el);
  const arts = $$('.sk-how__art', el);
  const byStep = new Map(arts.map((a) => [Number(a.dataset.i), a]));
  const scenes = new Map(arts.map((a) => [a, buildScene($('.art-in', a), m)]));
  const dots = $$('.sk-how__dots i', el);
  const num = $('.sk-how__n b', el);

  // Scale the 360x240 scenes to whatever size the viewer has.
  const fit = () => {
    const k = Math.min(stage.clientWidth / 380, stage.clientHeight / 250);
    if (k > 0) stage.style.setProperty('--k', k.toFixed(3));
  };
  new ResizeObserver(fit).observe(stage);
  fit();
  gsap.set(arts, { autoAlpha: 0 });

  let cur = -1;
  const set = (i: number) => {
    if (i === cur) return;
    const prev = cur;
    cur = i;
    items.forEach((li, k) => li.classList.toggle('is-on', k === i));
    dots.forEach((d, k) => d.classList.toggle('on', k <= i));
    if (num) {
      num.textContent = pad(i + 1);
      gsap.fromTo(num, { yPercent: prev < i ? 100 : -100 }, { yPercent: 0, duration: 0.45, ease: 'power3.out', overwrite: true });
    }
    const out = byStep.get(prev);
    const inn = byStep.get(i);
    if (out && out !== inn) {
      out.classList.remove('is-on');
      gsap.to(out, { autoAlpha: 0, y: prev < i ? -18 : 18, duration: 0.3, ease: 'power2.in', overwrite: true });
      scenes.get(out)?.pause();
    }
    if (inn) {
      inn.classList.add('is-on');
      gsap.fromTo(inn, { autoAlpha: 0, y: prev < i ? 22 : -22 }, { autoAlpha: 1, y: 0, duration: 0.55, delay: prev < 0 ? 0 : 0.1, ease: 'power3.out', overwrite: true });
      scenes.get(inn)?.restart();
    }
  };

  // The active step is the last one whose top has crossed this line, just under the viewer on phones.
  // Worked out from positions, so fast flicks and jumps can't leave it stale.
  const line = () => (window.innerWidth < 1000 ? Math.min(62, Math.max(50, (360 / window.innerHeight) * 100 + 6)) : 55);
  const track = () => {
    const y = (window.innerHeight * line()) / 100;
    let k = 0;
    items.forEach((li, i) => {
      if (li.getBoundingClientRect().top <= y) k = i;
    });
    if (cur >= 0 || items[0].getBoundingClientRect().top <= window.innerHeight * 0.75) set(k);
  };
  ScrollTrigger.create({ trigger: el, start: 'top bottom', end: 'bottom top', onUpdate: track, onToggle: track, onRefresh: track });
  items.forEach((li) => {
    gsap.from(li.children, { x: 36, opacity: 0, duration: 0.9, ease: 'power3.out', stagger: 0.08, clearProps: 'transform', scrollTrigger: once(li, 'top 92%') });
  });
  const fill = { trigger: items[0], start: () => `top ${line()}%`, endTrigger: items[items.length - 1], end: () => `top ${line()}%`, scrub: 0.4 };
  gsap.fromTo(list, { '--p': 0 }, { '--p': 1, ease: 'none', scrollTrigger: fill });
  gsap.fromTo($('.sk-how__prog', el), { '--p': 0 }, { '--p': 1, ease: 'none', scrollTrigger: { ...fill } });
  gsap.from($('.sk-how__view', el), { y: 50, opacity: 0, scale: 0.96, duration: 1.1, ease: 'expo.out', scrollTrigger: once(el, 'top 80%') });

}

/* ------------------------------------------------------------------ cards */
export function cards(el: HTMLElement, m: Motion) {
  const { gsap } = m;
  revealHeading($('.sk-h', el), m);
  const list = $$('.sk-card', el);
  gsap.from(list, {
    y: 100, rotationX: -34, rotationZ: (i: number) => [-4, 0, 4][i % 3], opacity: 0, transformOrigin: '50% 100%',
    duration: 1.3, stagger: 0.12, ease: 'expo.out', clearProps: 'transform',
    scrollTrigger: once($('.sk-cards', el), 'top 84%'),
  });
  const note = $('.sk-cards__note', el);
  if (note) gsap.from(note, { x: -24, opacity: 0, duration: 0.8, ease: 'power3.out', scrollTrigger: once(note, 'top 94%') });
  if (!fine()) return;
  list.forEach((card) => {
    const rx = gsap.quickTo(card, 'rotationX', { duration: 0.6, ease: 'power3' });
    const ry = gsap.quickTo(card, 'rotationY', { duration: 0.6, ease: 'power3' });
    const lift = gsap.quickTo(card, 'y', { duration: 0.6, ease: 'power3' });
    card.addEventListener('pointerenter', () => gsap.to(card, { '--lit': 1, duration: 0.3 }));
    card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top) / r.height;
      card.style.setProperty('--mx', `${(px * 100).toFixed(1)}%`);
      card.style.setProperty('--my', `${(py * 100).toFixed(1)}%`);
      ry((px - 0.5) * 12);
      rx(-(py - 0.5) * 10);
      lift(-8);
    });
    card.addEventListener('pointerleave', () => {
      rx(0);
      ry(0);
      lift(0);
      gsap.to(card, { '--lit': 0, duration: 0.5 });
    });
  });
}

/* ------------------------------------------------------------------ chips (plain list) */
export function chips(el: HTMLElement, m: Motion) {
  revealHeading($('.sk-h', el), m);
  m.gsap.from($$('.sk-chips li', el), {
    y: 30, scale: 0.6, opacity: 0, rotation: (i: number) => (i % 2 ? 8 : -8), duration: 0.7, stagger: 0.05, ease: 'back.out(2)',
    clearProps: 'transform', scrollTrigger: once(el, 'top 85%'),
  });
}

/* ------------------------------------------------------------------ works with */
export function works(el: HTMLElement, m: Motion) {
  const { gsap } = m;
  const st = once(el, 'top 88%');
  gsap.from($('.sk-h', el), { y: 14, opacity: 0, duration: 0.7, ease: 'power3.out', scrollTrigger: st });
  gsap.from($$('.sk-works p > span', el), { y: 18, opacity: 0, duration: 0.55, stagger: 0.025, ease: 'power3.out', delay: 0.1, scrollTrigger: st });
}

/* ------------------------------------------------------------------ callouts */
export function callout(el: HTMLElement, m: Motion) {
  const { gsap } = m;
  const box = $('.sk-callout', el);
  const p = box && $('p', box);
  if (!box || !p) return;
  if (box.classList.contains('is-promise')) {
    // the line lights up word by word as you scroll through it
    const words = splitWords(p);
    gsap.set(words, { opacity: 0.13 });
    const tl = gsap.timeline({ scrollTrigger: { trigger: box, start: 'top 82%', end: 'bottom 50%', scrub: 0.5 } });
    tl.to(words, { opacity: 1, duration: 0.3, stagger: 0.1, ease: 'none' }, 0).fromTo(box, { '--bar': 0 }, { '--bar': 1, duration: words.length * 0.1 + 0.2, ease: 'none' }, 0);
    const label = $('.sk-callout__h', box);
    if (label) gsap.from(label, { y: 12, opacity: 0, duration: 0.7, ease: 'power3.out', scrollTrigger: once(box, 'top 88%') });
  } else {
    gsap.from(box, { y: 24, opacity: 0, duration: 0.9, ease: 'power3.out', scrollTrigger: once(box, 'top 94%') });
  }
}

/* ------------------------------------------------------------------ the end + more */
export function end(el: HTMLElement, m: Motion) {
  const { gsap } = m;
  const credit = $('.sk-credit', el);
  if (credit) gsap.from(credit, { y: 16, opacity: 0, duration: 0.8, ease: 'power3.out', scrollTrigger: once(credit, 'top 94%') });
  const follow = $('.free-follow', el);
  if (!follow) return;
  gsap.timeline({ scrollTrigger: once(follow, 'top 88%') })
    .from(follow, { y: 60, scale: 0.95, opacity: 0, duration: 1.1, ease: 'expo.out' })
    .from($('img', follow), { scale: 0, rotation: -40, duration: 0.8, ease: 'back.out(2)' }, 0.2)
    .from($$('h2, p, .social-btn', follow), { y: 16, opacity: 0, duration: 0.6, stagger: 0.07, ease: 'power3.out' }, 0.3);
}

export function more(el: HTMLElement, m: Motion) {
  const { gsap } = m;
  const title = $('.ql-title h2', el);
  if (title) gsap.from(splitChars(title), { yPercent: 115, duration: 1, ease: 'power4.out', stagger: 0.02, scrollTrigger: once(title, 'top 88%') });
  const line = $('.ql-title__line', el);
  if (line) gsap.from(line, { scaleX: 0, transformOrigin: 'left', duration: 1.4, ease: 'expo.out', scrollTrigger: once(el, 'top 85%') });
  const cardsEls = $$('.res-card, .qp', el);
  gsap.from(cardsEls, {
    y: 80, rotationX: -22, opacity: 0, transformOrigin: '50% 100%', duration: 1.2, stagger: 0.1, ease: 'expo.out', clearProps: 'transform',
    scrollTrigger: once(el, 'top 80%'),
  });
}
