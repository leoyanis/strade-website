// Intro animations for the inline SSI emblem (Emblem.astro).
// Every moving part is driven from one plain state object, so a timeline only tweens numbers
// and render() turns them into SVG attributes. The defaults ARE the finished emblem.

/* eslint-disable @typescript-eslint/no-explicit-any */
import SETTINGS from './ignition-settings.json';
type Any = any;
const NS = 'http://www.w3.org/2000/svg';

// the ring's orbit, fitted to the swooshes: centre, semi-axes, tilt
const C = { x: 5, y: -9 };
const RA = 162;
const RB = 30;
const PHI = (-28 * Math.PI) / 180;
const TH0 = (-80 * Math.PI) / 180; // just behind the right swoosh's tip: the ring draws from here
const TAU = Math.PI * 2;

// a point on the orbit (k scales it outwards), and whether that point is in front of the star
const pt = (th: number, k = 1, a = RA, b = RB) => ({
  x: C.x + k * (a * Math.cos(th) * Math.cos(PHI) - b * Math.sin(th) * Math.sin(PHI)),
  y: C.y + k * (a * Math.cos(th) * Math.sin(PHI) + b * Math.sin(th) * Math.cos(PHI)),
});
const inFront = (th: number) => Math.sin(th) > 0;

const FINAL = {
  starSX: 1, starSY: 1, starOp: 1, glow: 0.18,
  core: 0, coreOp: 0, flareSX: 0, flareOp: 0,
  slashLen: 1, slashOpen: 1, sweep: 1, cometOp: 0,
  upX: 0, upY: 0, upR: 0, loX: 0, loY: 0, loR: 0,
  orbitAng: -28, orbitK: RB / RA, orbitOp: 0,
  bladeSX: 0, bladeOp: 0, pop: 1,
  // ignition: the dot, the cross of rays, and how far the star has swollen out of them (fillP ≥ 1.5 = whole star)
  dot: 0, dotOp: 0, rayV: 0, rayH: 0, rayOp: 0, fillP: 2, bloom: 0,
  // cutFollow 1: the cut is opened by the comet as it crosses the star, growing from the cut's right end
  // cutA..cutB: the stretch of the comet's lap over which it opens the cut. slashO: where along its axis the cut grows from
  cutFollow: 0, cutA: 0.33, cutB: 0.6, slashO: 0,
};

// the four-point star's tips, for the swelling shape
const TIP = { r: 184.75, l: 185.5, t: 241.88, b: 233.5 };
function swell(p: number) {
  const e = 2 / p;
  let d = '';
  for (let i = 0; i < 200; i++) {
    const t = (i / 200) * TAU;
    const c = Math.cos(t), s = Math.sin(t);
    const x = Math.sign(c) * Math.abs(c) ** e * (c >= 0 ? TIP.r : TIP.l) * 1.02;
    const y = Math.sign(s) * Math.abs(s) ** e * (s >= 0 ? TIP.b : TIP.t) * 1.02;
    d += `${i ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  return d + 'Z';
}
type State = typeof FINAL;

export interface Emblem {
  svg: SVGSVGElement;
  s: State;
  render: () => void;
  front: SVGGElement;
  back: SVGGElement;
  stopMoons: () => void;
  startMoons: (n: number) => void;
}

export function mountEmblem(svg: SVGSVGElement): Emblem {
  const q = <T extends Element = SVGElement>(c: string) => svg.querySelector(c) as unknown as T;
  const el = {
    star: q('.e-star'), glow: q('.e-glow'), up: q('.e-up'), lo: q('.e-lo'),
    upRing: q('.e-up-ring'), loRing: q('.e-lo-ring'), slash: q('.e-slash'), sweep: q('.e-sweep'),
    core: q('.e-core'), flare: q('.e-flare'), blade: q('.e-blade'), orbit: q('.e-orbit'),
    wipe: q('.e-wipe'), dot: q('.e-dot'), rays: q('.e-rays'), fill: q('.e-fillshape'), bloom: q('.e-bloom'),
  };
  const wipeStops = Array.from(el.wipe.querySelectorAll('stop'));
  const raysV = Array.from(svg.querySelectorAll('.e-ray-v'));
  const raysH = Array.from(svg.querySelectorAll('.e-ray-h'));
  const front = q<SVGGElement>('.e-front');
  const back = q<SVGGElement>('.e-back');

  // comet: the bright head that draws the ring
  const comet = document.createElementNS(NS, 'g');
  comet.innerHTML = `<circle r="16" fill="url(#${svg.dataset.uid}-core)"/><circle r="3.2"/>`;
  front.appendChild(comet);

  const s: State = { ...FINAL };
  const tr = (e: Element, v: string) => e.setAttribute('transform', v);

  function sweepPath(p: number) {
    if (p >= 1) return 'M-400 -400H400V400H-400Z';
    if (p <= 0) return 'M0 0Z';
    let d = `M${C.x} ${C.y}`;
    const end = TH0 + p * TAU;
    for (let th = TH0; th < end; th += 0.04) {
      const o = pt(th, 3.2);
      d += `L${o.x.toFixed(1)} ${o.y.toFixed(1)}`;
    }
    const o = pt(end, 3.2);
    return `${d}L${o.x.toFixed(1)} ${o.y.toFixed(1)}Z`;
  }

  function render() {
    tr(el.star, `scale(${s.starSX} ${s.starSY})`);
    el.star.setAttribute('opacity', String(s.starOp));
    el.glow.setAttribute('opacity', String(s.glow));
    tr(el.up, `translate(${s.upX} ${s.upY}) rotate(${s.upR})`);
    tr(el.upRing, `translate(${s.upX} ${s.upY}) rotate(${s.upR})`);
    tr(el.lo, `translate(${s.loX} ${s.loY}) rotate(${s.loR})`);
    tr(el.loRing, `translate(${s.loX} ${s.loY}) rotate(${s.loR})`);
    // the cut is wiped in along its own axis, from slashO outwards: slashLen 0 = none, 1 = whole cut
    let len = s.slashLen;
    if (s.cutFollow) len = Math.min(1, Math.max(0, (s.sweep - s.cutA) / Math.max(s.cutB - s.cutA, 0.01)));
    // a soft leading edge (FEATHER units) so the cut slides in instead of ending in a hard line
    const FEATHER = 26;
    const lo = s.slashO - len * (s.slashO + 240);
    const hi = s.slashO + len * (240 - s.slashO);
    el.slash.style.display = len <= 0 ? 'none' : '';
    if (len > 0) {
      const span = Math.max(hi - lo, 0.01);
      const f = Math.min(0.5, FEATHER / span);
      el.wipe.setAttribute('x1', lo.toFixed(2));
      el.wipe.setAttribute('x2', (lo + span).toFixed(2));
      wipeStops[1].setAttribute('offset', String(f));
      wipeStops[2].setAttribute('offset', String(1 - f));
    }
    tr(el.dot, `scale(${s.dot})`);
    el.dot.setAttribute('opacity', String(s.dotOp));
    el.rays.setAttribute('opacity', String(s.rayOp));
    raysV.forEach((r) => tr(r, `scale(1 ${s.rayV})`));
    raysH.forEach((r) => tr(r, `scale(${s.rayH} 1)`));
    if (s.fillP >= 1.5) el.fill.setAttribute('d', 'M-400 -400H400V400H-400Z');
    else el.fill.setAttribute('d', swell(Math.max(s.fillP, 0.05)));
    el.bloom.setAttribute('opacity', String(s.bloom));
    if (s.bloom > 0) el.bloom.setAttribute('d', swell(Math.min(Math.max(s.fillP, 0.05), 0.75)));
    el.sweep.setAttribute('d', sweepPath(s.sweep));
    tr(el.core, `scale(${s.core})`);
    el.core.setAttribute('opacity', String(s.coreOp));
    tr(el.flare, `scale(${s.flareSX} 1)`);
    el.flare.setAttribute('opacity', String(s.flareOp));
    tr(el.blade, `translate(0 -5) rotate(-28) translate(-220 0) scale(${s.bladeSX} 1) translate(220 0)`);
    el.blade.setAttribute('opacity', String(s.bladeOp));
    tr(el.orbit, `translate(${C.x} ${C.y}) rotate(${s.orbitAng}) scale(1 ${s.orbitK})`);
    el.orbit.setAttribute('opacity', String(s.orbitOp));
    svg.style.scale = String(s.pop);

    const th = TH0 + Math.min(s.sweep, 1) * TAU;
    const c = pt(th);
    tr(comet, `translate(${c.x} ${c.y})`);
    comet.setAttribute('opacity', String(s.cometOp));
    const layer = inFront(th) ? front : back;
    if (comet.parentNode !== layer) layer.appendChild(comet);
  }

  // moons: small bodies on wider orbits, hidden behind the star on the far side.
  // Their loop runs only while the emblem can be seen (README performance rule 4): an IntersectionObserver stops it once
  // the emblem is out of view (the hero scrolled past, a lab card off screen) and starts it again on the way back. The
  // orbit's clock only counts the time it ran, so the moons carry on from where they were. Before, the loop wrote six
  // circles' attributes every frame for the life of the page, the hero long gone (found at the bottom of /vision/ssi).
  let moonRaf = 0;
  let moonIO: IntersectionObserver | null = null;
  // bumped by every stop: an observer callback already queued for an earlier set of moons must not restart its loop
  let moonGen = 0;
  let moons: { e: SVGCircleElement; k: number; b: number; speed: number; ph: number }[] = [];
  function stopMoons() {
    moonGen++;
    cancelAnimationFrame(moonRaf);
    moonRaf = 0;
    moonIO?.disconnect();
    moonIO = null;
    moons.forEach((m) => m.e.remove());
    moons = [];
  }
  function startMoons(n: number) {
    stopMoons();
    const gen = moonGen;
    let t = 0; // seconds of orbit shown so far
    let last = 0;
    let seen = true;
    for (let i = 0; i < n; i++) {
      const e = document.createElementNS(NS, 'circle');
      e.setAttribute('r', String(1.6 + (i % 3) * 0.9));
      moons.push({ e, k: 1.18 + i * 0.13, b: RB * (1.15 + i * 0.25), speed: 0.55 - i * 0.09, ph: (i * TAU) / n + 0.4 });
      front.appendChild(e);
    }
    const tick = (now: number) => {
      if (gen !== moonGen) return;
      moonRaf = 0;
      // a long gap (a hidden tab, the first frame back on screen) counts as one frame, not a jump round the orbit
      if (last) t += Math.min(0.05, (now - last) / 1000);
      last = now;
      for (const m of moons) {
        const th = m.ph + t * m.speed;
        const p = pt(th, m.k, RA, m.b / m.k);
        m.e.setAttribute('cx', p.x.toFixed(2));
        m.e.setAttribute('cy', p.y.toFixed(2));
        const fr = inFront(th);
        m.e.setAttribute('opacity', String(Math.min(1, t * 1.2) * (fr ? 1 : 0.45)));
        const layer = fr ? front : back;
        if (m.e.parentNode !== layer) layer.appendChild(m.e);
      }
      if (seen) moonRaf = requestAnimationFrame(tick);
    };
    // the outer moons reach past the svg's box, so the loop keeps running a little beyond the edges
    moonIO = new IntersectionObserver(
      ([e]) => {
        if (gen !== moonGen) return;
        seen = e.isIntersecting;
        if (seen && !moonRaf) {
          last = 0;
          moonRaf = requestAnimationFrame(tick);
        }
      },
      { rootMargin: '25% 0px' },
    );
    moonIO.observe(svg);
    moonRaf = requestAnimationFrame(tick);
  }

  render();
  return { svg, s, render, front, back, stopMoons, startMoons };
}

function base(gsap: Any, em: Emblem, from: Partial<State>) {
  em.stopMoons();
  em.front.querySelectorAll('circle:not([r="16"]):not([r="3.2"])').forEach((c) => c.remove());
  Object.assign(em.s, FINAL, from);
  em.render();
  return gsap.timeline({ onUpdate: em.render, defaults: { ease: 'expo.out' } });
}

/* 01 · Birth: a point of light, a cross of light, the star unfolds, then the ring cuts and wraps it */
export function birth(gsap: Any, em: Emblem) {
  const s = em.s;
  const tl = base(gsap, em, {
    starSX: 0.0001, starSY: 0.0001, glow: 0, core: 0, coreOp: 1,
    slashLen: 0, slashOpen: 0, sweep: 0,
  });
  tl.to(s, { core: 0.35, duration: 0.5, ease: 'power2.out' }, 0.2)
    .to(s, { core: 0.55, duration: 0.18, ease: 'sine.inOut', yoyo: true, repeat: 3 }, 0.7)
    // ignition: the vertical spike shoots first, then the arms
    .to(s, { core: 2.4, duration: 0.5 }, 1.45)
    .to(s, { coreOp: 0, duration: 1.4, ease: 'power2.out' }, 1.6)
    .to(s, { starSY: 1, duration: 1.3 }, 1.45)
    .to(s, { starSX: 0.06, duration: 0.25, ease: 'power2.out' }, 1.45)
    .to(s, { starSX: 1, duration: 1.3 }, 1.62)
    .to(s, { glow: 1, duration: 0.25, ease: 'power2.out' }, 1.45)
    .to(s, { glow: 0.18, duration: 2.2, ease: 'power2.out' }, 1.75)
    .to(s, { flareSX: 1, duration: 0.9 }, 1.45)
    .to(s, { flareOp: 1, duration: 0.12 }, 1.45)
    .to(s, { flareOp: 0, duration: 1.2, ease: 'power2.out' }, 1.7)
    // the ring slices through and wraps around
    .to(s, { slashLen: 1, duration: 0.55, ease: 'power3.inOut' }, 2.55)
    .to(s, { slashOpen: 1, duration: 0.45, ease: 'power3.out' }, 2.8)
    .to(s, { cometOp: 1, duration: 0.2, ease: 'none' }, 2.75)
    .to(s, { sweep: 1, duration: 1.5, ease: 'power2.inOut' }, 2.75)
    .to(s, { cometOp: 0, duration: 0.35, ease: 'power1.in' }, 3.95);
  return tl;
}

/* 02 · Cut + orbit: the star is sliced in two, things start orbiting, the ring draws itself, the halves close */
export function cutOrbit(gsap: Any, em: Emblem) {
  const s = em.s;
  const n = { x: Math.sin(PHI), y: -Math.cos(PHI) }; // normal to the cut, pointing up-left
  const gap = 26;
  const tl = base(gsap, em, {
    starOp: 0, starSX: 0.82, starSY: 0.82, glow: 0, slashLen: 0, slashOpen: 0, sweep: 0,
  });
  tl.to(s, { starOp: 1, duration: 0.6, ease: 'power2.out' }, 0.15)
    .to(s, { starSX: 1, starSY: 1, duration: 1.2 }, 0.15)
    .to(s, { glow: 0.35, duration: 1 }, 0.15)
    .to(s, { glow: 0.08, duration: 0.4, ease: 'power2.out' }, 1.3)
    // the blade passes
    .to(s, { bladeOp: 1, duration: 0.05, ease: 'none' }, 1.1)
    .to(s, { bladeSX: 1, duration: 0.32, ease: 'power3.in' }, 1.1)
    .to(s, { bladeOp: 0, duration: 0.5, ease: 'power2.out' }, 1.42)
    .to(s, { slashLen: 1, duration: 0.32, ease: 'power3.in' }, 1.1)
    .to(s, { slashOpen: 1, duration: 0.3, ease: 'power4.out' }, 1.42)
    // the halves drift apart
    .to(s, { upX: n.x * gap, upY: n.y * gap, upR: -2.5, loX: -n.x * gap, loY: -n.y * gap, loR: 2.5, duration: 1.1 }, 1.42)
    .call(() => em.startMoons(3), [], 1.6)
    // the ring draws itself between them
    .to(s, { cometOp: 1, duration: 0.2, ease: 'none' }, 1.8)
    .to(s, { sweep: 1, duration: 1.6, ease: 'power2.inOut' }, 1.8)
    .to(s, { cometOp: 0, duration: 0.35, ease: 'power1.in' }, 3.05)
    // and they lock back together
    .to(s, { upX: 0, upY: 0, upR: 0, loX: 0, loY: 0, loR: 0, duration: 0.9, ease: 'back.out(2.2)' }, 3.2)
    .to(s, { glow: 0.7, duration: 0.12, ease: 'power2.out' }, 3.35)
    .to(s, { glow: 0.18, duration: 1.4, ease: 'power2.out' }, 3.47)
    .to(s, { pop: 1.04, duration: 0.12, ease: 'power2.out', yoyo: true, repeat: 1 }, 3.35);
  return tl;
}

/* 03 · Spin lock: an orbit spins in around the star, flattens into place and locks into the ring */
export function spinLock(gsap: Any, em: Emblem) {
  const s = em.s;
  const tl = base(gsap, em, {
    starOp: 0, starSX: 1.25, starSY: 1.25, glow: 0, slashLen: 0, slashOpen: 0, sweep: 0,
    orbitAng: 160, orbitK: 0.95, orbitOp: 0,
  });
  tl.to(s, { starOp: 1, duration: 0.35, ease: 'power2.out' }, 0.1)
    .to(s, { starSX: 1, starSY: 1, duration: 1 }, 0.1)
    .to(s, { glow: 0.9, duration: 0.2, ease: 'power2.out' }, 0.1)
    .to(s, { glow: 0.2, duration: 1, ease: 'power2.out' }, 0.3)
    // the orbit tumbles in and flattens
    .to(s, { orbitOp: 0.85, duration: 0.4, ease: 'power1.out' }, 0.45)
    .to(s, { orbitAng: -28, duration: 2, ease: 'expo.inOut' }, 0.45)
    .to(s, { orbitK: RB / RA, duration: 2, ease: 'expo.inOut' }, 0.45)
    // lock: the ring takes the orbit's place and cuts the star
    .to(s, { sweep: 1, duration: 0.55, ease: 'power3.inOut' }, 2.25)
    .to(s, { slashLen: 1, duration: 0.3, ease: 'power3.out' }, 2.4)
    .to(s, { slashOpen: 1, duration: 0.3, ease: 'power3.out' }, 2.5)
    .to(s, { orbitOp: 0, duration: 0.6, ease: 'power2.out' }, 2.5)
    .to(s, { glow: 0.8, duration: 0.1, ease: 'power2.out' }, 2.55)
    .to(s, { glow: 0.18, duration: 1.3, ease: 'power2.out' }, 2.65)
    .to(s, { pop: 1.05, duration: 0.12, ease: 'power2.out', yoyo: true, repeat: 1 }, 2.55);
  return tl;
}

/* 04 · Ignition: a dot, four fine lines of light, the star fills out of them,
   and while it fills the cut opens and the comet draws the orbit. No glow, no split.
   Every time and ease is a setting, so the tuning panel on /vision/ssi/emblem can drive it. */
// the approved settings for the landing site, tuned on /vision/ssi/emblem (2026-10-27)
export const IGNITION_DEFAULTS = { ...SETTINGS };
export type IgnitionConfig = typeof IGNITION_DEFAULTS;

export function ignition(gsap: Any, em: Emblem, cfg: IgnitionConfig = IGNITION_DEFAULTS) {
  const s = em.s;
  const c = cfg;
  const w = c.rayWidth;
  em.svg.querySelectorAll('.e-ray-v').forEach((r) => r.setAttribute('d', `M0 -241.88L${w} 0L0 233.5L${-w} 0Z`));
  em.svg.querySelectorAll('.e-ray-h').forEach((r) => r.setAttribute('d', `M-185.5 2L0 ${-w}L184.75 -1.25L0 ${w}Z`));
  em.svg.querySelector('.e-dot')?.setAttribute('r', String(c.dotSize));

  const tl = base(gsap, em, {
    fillP: 0.05, glow: 0, sweep: 0, dotOp: 1, dot: 1,
    cutFollow: c.cutFollow ? 1 : 0, cutA: c.cutA, cutB: c.cutB,
    slashO: 150, slashLen: 0, slashOpen: 0,
  });
  // the dot is there from the first frame; the lines leave it
  tl.set(s, { rayOp: 1 }, c.raysStart)
    .to(s, { rayV: 1, duration: c.raysDur, ease: c.raysEase }, c.raysStart)
    .to(s, { rayH: 1, duration: c.raysDur, ease: c.raysEase }, c.raysStart + c.raysLag)
    .to(s, { dotOp: 0, duration: c.dotFadeDur, ease: 'power1.out' }, c.dotFadeStart)
    .to(s, { rayOp: 0, duration: c.raysFadeDur, ease: 'power1.inOut' }, c.raysFadeStart)
    // the star fills out of the lines
    .to(s, { fillP: 1.1, duration: c.fillDur, ease: c.fillEase }, c.fillStart)
    .set(s, { fillP: 2 }, c.fillStart + c.fillDur)
    // the comet draws the orbit
    .to(s, { cometOp: 1, duration: 0.2, ease: 'none' }, c.cometStart)
    .to(s, { sweep: 1, duration: c.cometDur, ease: c.cometEase }, c.cometStart)
    .to(s, { cometOp: 0, duration: 0.3, ease: 'power1.in' }, c.cometStart + c.cometDur - 0.3);
  // the cut: either opened by the comet as it passes, or on its own clock while the star fills
  if (!c.cutFollow) {
    tl.to(s, { slashLen: 1, duration: c.cutDur, ease: c.cutEase }, c.cutStart)
      .fromTo(s, { slashOpen: 0.25 }, { slashOpen: 1, duration: c.cutDur, ease: c.cutEase, immediateRender: false }, c.cutStart);
  }
  if (c.moons > 0) tl.call(() => em.startMoons(c.moons), [], c.moonsStart);
  tl.set(s, { cutFollow: 0, slashLen: 1, slashOpen: 1, fillP: 2, rayOp: 0, dotOp: 0, sweep: 1, cometOp: 0 },
    Math.max(c.fillStart + c.fillDur, c.cometStart + c.cometDur, c.cutStart + c.cutDur, c.raysFadeStart + c.raysFadeDur));
  tl.timeScale(c.speed);
  return tl;
}
