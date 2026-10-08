// "What it checks": pinned and scrubbed on desktop, a self-playing loop on phones.
// Each phase: a scan beam sweeps the app, its holes light up red, get fixed one by one,
// then fold into their part of the app. Ends on a "Safe to ship" stamp.
import { PIN_MEDIA, adopt, once, playInView, type Motion } from './core';
import { revealHeading } from './sections';

const PHASE = 3.6;

export function shipScan(el: HTMLElement, m: Motion) {
  const { gsap, ScrollTrigger } = m;
  const q = (s: string) => el.querySelector<HTMLElement>(s)!;
  const qa = (s: string) => Array.from(el.querySelectorAll<HTMLElement>(s));
  el.classList.add('is-live');
  revealHeading(q('.ss__h'), m);

  const stage = q('.ss__stage');
  const phases = qa('.ss-ph');
  const nodes = new Map(qa('.ss-node').map((n) => [n.dataset.node!, n]));
  const badges = qa('.ss-badge');
  const key = q('.ss-key');
  const shackle = q('.ss-lock__shackle');
  const meter = q('.ss-meter');
  const beam = q('.ss-beam');
  const stamp = q('.ss-stamp');
  const segs = qa('.ss-segs b');
  const hudPhase = q('.ss-hud__p b');
  const hudFixed = q('.ss-hud__c b');
  const ticks = new Map(qa('.ss-node').map((n) => [n.dataset.node!, n.querySelector<HTMLElement>('.ss-node__tick')!]));
  const nodePos = (id: string) => {
    const n = nodes.get(id)!;
    return { left: n.style.getPropertyValue('--x'), top: n.style.getPropertyValue('--y') };
  };

  gsap.from(stage, { y: 60, opacity: 0, scale: 0.95, duration: 1.2, ease: 'expo.out', scrollTrigger: once(el, 'top 78%') });
  gsap.from(phases, { x: -30, opacity: 0, duration: 0.9, stagger: 0.1, ease: 'power3.out', scrollTrigger: once(el, 'top 75%') });

  adopt(m, [key, ...badges]);
  adopt(m, [stamp], { rotation: -9 });

  function build() {
    const fixedAt: number[] = [];
    const doneAt: { node: string; t: number }[] = [];
    gsap.set([...nodes.values()], { '--bad': 0, '--ok': 0 });
    gsap.set(badges, { autoAlpha: 0, '--ok': 0 });
    gsap.set(key, { top: '22%', '--ok': 0, rotation: 0 });
    gsap.set(shackle, { '--open': 1 });
    gsap.set(meter, { '--m': 0.3, '--hot': 0 });
    gsap.set(segs, { '--s': 0 });
    gsap.set(stamp, { autoAlpha: 0 });
    gsap.set(beam, { autoAlpha: 0 });

    const tl = gsap.timeline({ paused: true, defaults: { ease: 'power2.out' }, onUpdate: () => render(tl.time()) });

    [0, 1, 2].forEach((k) => {
      const base = k * PHASE;
      const hole = badges.filter((b) => Number(b.dataset.phase) === k);
      tl.fromTo(segs[k], { '--s': 0 }, { '--s': 1, duration: PHASE, ease: 'none' }, base);
      tl.fromTo(beam, { top: '-30%', autoAlpha: 1 }, { top: '108%', duration: 1.05, ease: 'power1.inOut', immediateRender: false }, base + 0.05).to(beam, { autoAlpha: 0, duration: 0.12 }, base + 1.05);

      hole.forEach((b, j) => {
        const id = b.dataset.node!;
        const node = nodes.get(id)!;
        const ti = base + 0.45 + j * 0.16;
        const tf = base + 1.5 + j * 0.32;
        const tc = base + 2.75 + j * 0.08;
        const home = { left: b.style.getPropertyValue('--x'), top: b.style.getPropertyValue('--y') };
        // the hole shows up
        tl.fromTo(b, { autoAlpha: 0, scale: 0.4, '--ok': 0, ...home }, { autoAlpha: 1, scale: 1, duration: 0.4, ease: 'back.out(2.4)' }, ti)
          .fromTo(b, { x: 0 }, { x: 3, duration: 0.05, repeat: 5, yoyo: true, ease: 'none' }, ti + 0.4)
          .to(node, { '--bad': 1, duration: 0.25 }, ti);
        // ...gets fixed
        tl.to(b, { '--ok': 1, duration: 0.3 }, tf)
          .fromTo(b, { scale: 1 }, { scale: 1.12, duration: 0.14, yoyo: true, repeat: 1, immediateRender: false }, tf)
          .to(node, { '--bad': 0, '--ok': 1, duration: 0.3 }, tf);
        fixedAt.push(tf + 0.15);
        // ...and folds into its node
        tl.fromTo(b, { ...home }, { ...nodePos(id), scale: 0.25, autoAlpha: 0, duration: 0.45, ease: 'power2.in', immediateRender: false }, tc);
        doneAt.push({ node: id, t: tc + 0.4 });

        // the special effects
        if (k === 0 && id === 'app') {
          tl.fromTo(key, { scale: 1 }, { scale: 1.18, duration: 0.18, yoyo: true, repeat: 3 }, ti)
            .fromTo(key, { top: '22%', '--ok': 0, rotation: 0 }, { top: '56%', '--ok': 1, rotation: 360, duration: 0.85, ease: 'power2.inOut', immediateRender: false }, tf - 0.15);
        }
        if (k === 0 && id === 'db') tl.to(shackle, { '--open': 0, duration: 0.35, ease: 'back.out(3)' }, tf);
        if (k === 1 && id === 'ai') {
          tl.to(meter, { '--m': 0.97, '--hot': 1, duration: 0.6 }, ti).to(meter, { '--m': 0.45, '--hot': 0, duration: 0.55 }, tf);
        }
      });
    });

    const endAt = PHASE * 3;
    tl.fromTo(stamp, { autoAlpha: 0, scale: 2.4, rotation: -23 }, { autoAlpha: 1, scale: 1, rotation: -9, duration: 0.5, ease: 'back.out(1.7)' }, endAt + 0.1)
      .fromTo(stage, { x: 0 }, { x: 4, duration: 0.04, repeat: 5, yoyo: true, ease: 'none' }, endAt + 0.45)
      .to({}, { duration: 0.9 }, endAt + 0.6);

    // Text and classes follow the playhead, so they're right in both scroll directions.
    let lastK = -1;
    const render = (t: number) => {
      const k = Math.max(0, Math.min(2, Math.floor(t / PHASE)));
      if (k !== lastK) {
        lastK = k;
        hudPhase.textContent = String(k + 1);
        phases.forEach((p, i) => p.classList.toggle('is-on', i === k));
      }
      phases.forEach((p, i) => p.style.setProperty('--p', String(Math.max(0, Math.min(1, (t - i * PHASE) / PHASE)))));
      hudFixed.textContent = String(fixedAt.filter((f) => t >= f).length);
      ticks.forEach((tick, id) => {
        const n = doneAt.filter((d) => d.node === id && t >= d.t).length;
        tick.style.opacity = n ? '1' : '0';
        tick.querySelector('b')!.textContent = String(n);
      });
    };
    render(0);
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
        pin: q('.ss__pin'),
        scrub: 0.6,
        animation: tl,
        anticipatePin: 1,
        refreshPriority: 1,
      });
      return () => el.classList.remove('is-pinned');
    }
    const tl = build();
    const loop = gsap.timeline({ paused: true, repeat: -1, repeatDelay: 1 });
    loop.add(tl.tweenFromTo(0, tl.duration(), { ease: 'none' }));
    playInView(m, stage, loop, 'top 80%');
  });
}
