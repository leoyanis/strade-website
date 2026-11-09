// The lens table for the stardust: where on the screen a point near the hole shows up, for the renderer's fixed
// camera. The disc is ray traced pixel by pixel (shaders.js); the dust is thousands of points drawn as sprites,
// so each point needs the inverse question answered: which ray from the camera passes through it.
//
// How: a light ray from the camera stays in the plane through the camera, the hole and the point. In that plane
// its path is u(phi) (u = 1/r, phi the angle round the hole from the camera's direction) and depends only on its
// impact parameter b. The point sits at angle psi from the camera's direction at radius rp; the ray that reaches
// it the short way round gives its primary image (phi = psi), the one that goes round the back gives the faint
// secondary image near the shadow's edge (phi = 2 pi - psi). At a fixed phi, u(b, phi) falls steadily as b grows
// (rays that miss wider are less bent), so every (phi, rp) has one b: rays with b < 2.598 fall in after passing
// the point (it is in front of the shadow), rays with b > 2.598 get away (it is beside or behind the hole).
//
// buildLens() integrates ~4600 rays (b packed tightly round the shadow's edge, where the secondary images live)
// with the shader's own orbit equation u'' = 1.5 u^2 - u in double precision, then inverts the table: for each phi
// (2048 steps over a full turn) and each radius (512, spaced by log r from 1.02 to 40) it stores b and the slope
// w = du/dphi there (its sign says whether the ray is still falling inwards or already leaving). The vertex shader
// reads it (dust shaders in shaders.js) to place each image, its depth order against the disc, its brightness
// change and the direction the light leaves the point in, for the Doppler shift.
//
// Cost: about half a second of CPU once per camera. The camera never moves in the video.

export const LUT_PHI = 2048;
export const LUT_R = 512;
export const LUT_RMIN = 1.02;
export const LUT_RMAX = 40;
const BC = 2.598076211353316;

/** Integrates one ray from the camera (u0 = 1/dist) and samples u and w at nPhi + 1 even angles over [0, 2 pi].
 * After the ray falls in u is set to +10, after it gets away to -1: sentinels that keep each column monotonic. */
function orbit(b, u0, nPhi, sub, U, Wt, off) {
  const h = (2 * Math.PI) / (nPhi * sub);
  let u = u0;
  let w = Math.sqrt(Math.max(1 / (b * b) - u0 * u0 + u0 * u0 * u0, 0));
  let state = 0; // 0 flying, 1 fell in, 2 got away
  U[off] = u;
  Wt[off] = w;
  for (let i = 1; i <= nPhi; i++) {
    for (let s = 0; s < sub && state === 0; s++) {
      const k1w = 1.5 * u * u - u;
      const ua = u + 0.5 * h * w;
      const wa = w + 0.5 * h * k1w;
      const k2w = 1.5 * ua * ua - ua;
      const ub = u + 0.5 * h * wa;
      const wb = w + 0.5 * h * k2w;
      const k3w = 1.5 * ub * ub - ub;
      const uc = u + h * wb;
      const wc = w + h * k3w;
      const k4w = 1.5 * uc * uc - uc;
      u += (h * (w + 2 * wa + 2 * wb + wc)) / 6;
      w += (h * (k1w + 2 * k2w + 2 * k3w + k4w)) / 6;
      if (u >= 1) state = 1;
      else if (u <= 0) state = 2;
    }
    U[off + i] = state === 1 ? 10 : state === 2 ? -1 : u;
    Wt[off + i] = state === 0 ? w : 0;
  }
}

/**
 * Builds the table for a camera at `dist`. Returns { data: Float32Array(LUT_PHI * LUT_R * 2) as (b, w) pairs, row
 * by radius, column by angle, width, height, rmin, rmax } with b = 0 where no ray reaches that place.
 */
export function buildLens(dist) {
  const u0 = 1 / dist;
  const bmax = 1 / (u0 * Math.sqrt(1 - u0)) - 1e-6;
  // impact parameters: an even grid (0.01 apart) for the wide primary images, plus offsets from the shadow's edge
  // spaced by their logarithm (1e-8 to 0.1 on both sides), where the secondary images live
  const set = new Set();
  for (let b = 0.005; b < bmax; b += 0.01) set.add(+b.toFixed(6));
  for (let i = 0; i < 800; i++) {
    const off = 10 ** (-8 + (7 * i) / 799);
    set.add(BC - off);
    set.add(BC + off);
  }
  const bs = Array.from(set).filter((b) => b > 0 && b < bmax).sort((a, b) => a - b);
  const nb = bs.length;
  const nPhi = LUT_PHI;
  const U = new Float64Array(nb * (nPhi + 1));
  const Wt = new Float64Array(nb * (nPhi + 1));
  for (let k = 0; k < nb; k++) orbit(bs[k], u0, nPhi, 6, U, Wt, k * (nPhi + 1));

  const data = new Float32Array(LUT_PHI * LUT_R * 2);
  const lrmin = Math.log(LUT_RMIN);
  const lrmax = Math.log(LUT_RMAX);
  const col = new Float64Array(nb);
  for (let i = 0; i < LUT_PHI; i++) {
    // column i is the angle i / (LUT_PHI - 1) of a full turn (the shader puts texel centres on these angles)
    const fi = (i / (LUT_PHI - 1)) * nPhi;
    const i0 = Math.min(Math.floor(fi), nPhi - 1);
    const fr = fi - i0;
    for (let k = 0; k < nb; k++) {
      const a = U[k * (nPhi + 1) + i0];
      const c = U[k * (nPhi + 1) + i0 + 1];
      // a sentinel on either side wins (no blending of "fell in" with a real radius)
      col[k] = a >= 10 || c >= 10 ? 10 : a <= -1 || c <= -1 ? -1 : a + (c - a) * fr;
    }
    for (let j = 0; j < LUT_R; j++) {
      const r = Math.exp(lrmin + ((lrmax - lrmin) * j) / (LUT_R - 1));
      const ut = 1 / r;
      // col falls as b grows: find the last k with col[k] >= ut
      let lo = 0;
      let hi = nb - 1;
      if (!(col[lo] >= ut) || !(col[hi] < ut)) continue;
      while (hi - lo > 1) {
        const m = (lo + hi) >> 1;
        if (col[m] >= ut) lo = m;
        else hi = m;
      }
      // a bracket that touches a sentinel means the ray falls in or gets away before reaching this radius here
      if (col[lo] >= 10 || col[hi] <= -1) continue;
      const t = (col[lo] - ut) / (col[lo] - col[hi]);
      const b = bs[lo] + (bs[hi] - bs[lo]) * t;
      const wl = Wt[lo * (nPhi + 1) + i0] + (Wt[lo * (nPhi + 1) + i0 + 1] - Wt[lo * (nPhi + 1) + i0]) * fr;
      const wh = Wt[hi * (nPhi + 1) + i0] + (Wt[hi * (nPhi + 1) + i0 + 1] - Wt[hi * (nPhi + 1) + i0]) * fr;
      const o = (j * LUT_PHI + i) * 2;
      data[o] = b;
      data[o + 1] = wl + (wh - wl) * t;
    }
  }
  return { data, width: LUT_PHI, height: LUT_R, rmin: LUT_RMIN, rmax: LUT_RMAX };
}
