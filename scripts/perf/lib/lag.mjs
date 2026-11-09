// Scrub smoothing, modelled with GSAP's own algorithm: on every scroll update ScrollTrigger calls
// scrubTween.resetTo('totalProgress', target, current) (ScrollTrigger.js), i.e. it restarts a tween of `scrub`
// seconds with ease "expo" (expo.out, 1 - 2^(-10t)) from wherever the animation is towards the new scroll
// progress. So while the page scrolls at a steady speed the animation trails the scroll by a fixed distance, and
// after the scroll stops it keeps moving for about `scrub` seconds. That trailing is deliberate (it is the
// "weight" of the motion), but it reads as lag, so it is reported apart from jank.
// Measured instances were not reachable (GSAP keeps ScrollTrigger out of window in this build), hence a model.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const expoOut = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

// steady-state trailing distance (px of scroll) and time, and the settle time after a stop
export function lagModel(scrub, speed, frameMs) {
  const dt = frameMs / 1000;
  let target = 0;
  let pos = 0;
  let from = 0;
  let t = 0;
  // run 4 s of steady scrolling: long enough for the lag to converge
  for (let i = 0; i < Math.round(4 / dt); i++) {
    target += speed * dt;
    // resetTo: a new tween from here to the new target, restarted
    from = pos;
    t = 0;
    t += dt;
    pos = from + (target - from) * expoOut(Math.min(1, t / scrub));
  }
  const lagPx = target - pos;
  // stop: the last tween runs out; time until within 1 px of the target
  let settle = 0;
  from = pos;
  t = 0;
  while (target - pos > 1 && settle < 5) {
    t += dt;
    settle += dt;
    pos = from + (target - from) * expoOut(Math.min(1, t / scrub));
  }
  return { lagPx, lagMs: (lagPx / speed) * 1000, settleMs: settle * 1000 };
}

// every `scrub:` in the code a page runs, by file:line (static, so it lists triggers whether or not they ran)
export function scrubSites(root, files) {
  const out = [];
  const walk = (p) => {
    const st = statSync(p);
    if (st.isDirectory()) readdirSync(p).forEach((f) => walk(join(p, f)));
    else if (/\.(ts|astro|js|mjs)$/.test(p)) {
      const lines = readFileSync(p, 'utf8').split('\n');
      lines.forEach((l, i) => {
        const m = /scrub:\s*([0-9.]+|true)/.exec(l);
        if (m) out.push({ at: `${relative(root, p)}:${i + 1}`, scrub: m[1] === 'true' ? true : Number(m[1]) });
      });
    }
  };
  files.forEach((f) => walk(join(root, f)));
  return out;
}
