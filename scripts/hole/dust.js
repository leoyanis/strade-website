// The stardust falling into the hole (Yanis, 2026-11-08: "like its actually taking in matter from other parts
// actively. like stars, mostly dots. dont have it rip apart big objects. just like large amounts of stardust").
//
// Every particle is a set of numbers; its place at any moment is worked out on the GPU (DUST_VS in shaders.js):
// it is born far out (fading in, as if pulled from the surrounding field), spirals in at the disc's own Kepler
// rate, speeds up and heats up as it falls (r = re + (rs - re)(1 - tau)^q, slow far out, fast at the end), its
// orbit's tilt shrinks so dust that arrives from above or below the disc settles into it, and it fades into the
// inner disc. Its life lasts LOOP / k seconds (k whole lives per loop), so the whole cloud repeats with the loop.
//
// Two kinds:
// - streams: a few dozen thin filaments, each hundreds to thousands of dots on one path with their phases spread
//   evenly, so at any moment they draw the path itself, a spiral string of dots flowing into the disc. Most come
//   in tilted (above or below the disc's plane), which reads best from a camera only 6.5 degrees above it.
// - drift: single dots on their own random paths, a new random start angle every life, the general inflow.
//
// Attribute layout (16 floats a particle), matching DUST_VS: phase, lives per loop, brightness, seed | start
// radius, end radius, fall profile q, start angle (turns) | inclination (rad), node (rad), sigma (px at 4K),
// height | per-life jitter of angle (turns), start radius (fraction), inclination (rad), heat offset.

/** Small seeded PRNG (mulberry32), so the same seed always gives the same dust. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Builds the particle attributes. Options (all have defaults): seed, streams (count), perStream [min, max],
 * drift (count), brightness scales for each kind. Returns { data: Float32Array, count, streams: [...] } where
 * streams describes each filament (for notes and debugging).
 */
export function makeDust(opt = {}) {
  const o = { seed: 11, streams: 38, perStream: [700, 2600], drift: 12000, streamGain: 1.15, driftGain: 0.32, rsMax: 19, mist: 0, mistSigma: [2.5, 5], ...opt };
  const R = rng(o.seed);
  const U = (a, b) => a + (b - a) * R();
  const G = () => {
    // a standard normal (Box-Muller)
    const u = Math.max(R(), 1e-9);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * R());
  };
  const out = [];
  const meta = [];
  const deg = Math.PI / 180;
  for (let s = 0; s < o.streams; s++) {
    const roll = R();
    // most streams arrive tilted, from above or below; a few run in the disc's own plane
    const inc = (roll < 0.45 ? U(20, 58) : roll < 0.8 ? U(7, 20) : U(0, 4)) * deg * (R() < 0.5 ? -1 : 1);
    const st = {
      rs: U(11, o.rsMax),
      re: U(2.6, 4.0),
      q: U(0.55, 0.78),
      th: R(),
      inc,
      node: U(0, 2 * Math.PI),
      k: R() < 0.7 ? 1 : 2,
      n: Math.round(U(o.perStream[0], o.perStream[1])),
      gain: U(0.55, 1.35) * o.streamGain,
      dth: U(0.003, 0.012),
      drs: U(0.015, 0.05),
      dinc: U(0.008, 0.03),
    };
    meta.push(st);
    for (let j = 0; j < st.n; j++) {
      const clump = R() < 0.03;
      // mist: most of a stream's grains drawn wide and faint, so together they make one smooth glowing filament
      // (cheap to encode: it moves as a whole) with the sharp dots riding in it
      const mist = !clump && R() < o.mist;
      const b = st.gain * Math.exp(0.55 * G()) * (clump ? 3.5 : 1);
      out.push(
        (j + R()) / st.n, st.k, b, R() * 1000,
        st.rs * (1 + st.drs * G()), st.re * (1 + 0.04 * G()), st.q, st.th + st.dth * G(),
        st.inc + st.dinc * G(), st.node, mist ? U(o.mistSigma[0], o.mistSigma[1]) : clump ? U(0.85, 1.1) : U(0.5, 0.72), G() * 0.6,
        0.002, 0, 0, U(-0.12, 0.12),
      );
    }
  }
  for (let i = 0; i < o.drift; i++) {
    // start radii biased outwards (more of the volume is far out)
    const rs = 5.5 + (o.rsMax - 5.5) * Math.sqrt(R());
    const inc = Math.max(-1.25, Math.min(1.25, G() * 0.45));
    out.push(
      R(), [1, 1, 2, 3][Math.floor(R() * 4)], o.driftGain * Math.exp(0.6 * G()), R() * 1000,
      rs, U(2.6, 4.6), U(0.5, 0.85), R(),
      inc, U(0, 2 * Math.PI), U(0.45, 0.65), G() * 0.8,
      1.0, 0.18, 0.35, U(-0.15, 0.15),
    );
  }
  return { data: new Float32Array(out), count: out.length / 16, streams: meta };
}
