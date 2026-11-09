// The black hole's camera, shared by the offline renderer pages, the Node drivers and (as JSON) the Python physics
// check, so all three trace exactly the same rays.
//
// Units: the Schwarzschild radius is 1 (so M = 0.5, the photon sphere is at 1.5, the shadow's edge is at impact
// parameter 3*sqrt(3)/2 = 2.598 and the innermost stable orbit at 3). The hole sits at the origin, the disc in the
// plane y = 0. The camera sits on a sphere of radius `dist` and looks at the hole.
//
// liveCamera() is the live page's composition, copied from black-hole.ts draw() (2026-11-08): wide screens put the
// hole at x 0.68, y 0.52 minus 0.05 x drift; narrow ones (< 900 CSS px) at x 0.5, y 0.31 minus 0.05 x drift; the
// shadow's radius is min(W x 0.078, H x 0.13) wide and min(W x 0.155, H x 0.085) narrow; the drift (0 to 1 across
// the act) moves the elevation 8 to 5 degrees, the azimuth -10 to +10 and the roll -4 to +3.

export const BC = 2.598076211353316; // 3*sqrt(3)/2
const DEG = Math.PI / 180;

/**
 * The camera's basis for an elevation, azimuth and roll (degrees). Returns e1 (unit, hole to camera), F (forward),
 * R and U (the image's right and up, after the roll). Same construction as black-hole.ts.
 */
export function basis(elDeg, azDeg, rollDeg) {
  const el = elDeg * DEG;
  const az = azDeg * DEG;
  const ro = rollDeg * DEG;
  const e1 = [Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)];
  const F = [-e1[0], -e1[1], -e1[2]];
  const rl = Math.hypot(F[2], F[0]);
  const rg = [-F[2] / rl, 0, F[0] / rl];
  const up = [rg[1] * F[2] - rg[2] * F[1], rg[2] * F[0] - rg[0] * F[2], rg[0] * F[1] - rg[1] * F[0]];
  const cr = Math.cos(ro);
  const sr = Math.sin(ro);
  const R = [cr * rg[0] + sr * up[0], cr * rg[1] + sr * up[1], cr * rg[2] + sr * up[2]];
  const U = [-sr * rg[0] + cr * up[0], -sr * rg[1] + cr * up[1], -sr * rg[2] + cr * up[2]];
  return { e1, F, R, U };
}

/** The camera angles the live page uses at a drift d (0 to 1). */
export function driftAngles(d) {
  return { el: 8 - 3 * d, az: -10 + 20 * d, roll: -4 + 7 * d };
}

/**
 * The live page's camera for a CSS viewport W x H drawn into a canvas of bw x bh pixels, at drift d.
 * center is in canvas pixels with y measured from the bottom (gl_FragCoord), focal in canvas pixels.
 */
export function liveCamera({ W, H, bw, bh, d, dist = 30 }) {
  const k = bw / W;
  const narrow = W < 900;
  const cx = W * (narrow ? 0.5 : 0.68);
  const cy = H * (narrow ? 0.31 - 0.05 * d : 0.52 - 0.05 * d);
  const shadow = narrow ? Math.min(W * 0.155, H * 0.085) : Math.min(W * 0.078, H * 0.13);
  const a = driftAngles(d);
  return {
    ...basis(a.el, a.az, a.roll),
    angles: a,
    dist,
    focal: (shadow * k * dist) / 2.598,
    center: [cx * k, bh - cy * k],
    shadowPx: shadow * k,
    size: [bw, bh],
  };
}

/**
 * A camera for an arbitrary frame: the hole at (hx, hy) as fractions of the frame from its top left, with a
 * shadow of `shadowPx` pixels, at the given angles. Used by the offline renderer's compositions.
 */
export function frameCamera({ w, h, hx, hy, shadowPx, el, az, roll, dist = 30 }) {
  return {
    ...basis(el, az, roll),
    angles: { el, az, roll },
    dist,
    focal: (shadowPx * dist) / 2.598,
    center: [w * hx, h - h * hy],
    shadowPx,
    size: [w, h],
  };
}
