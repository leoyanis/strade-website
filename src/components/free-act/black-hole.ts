// The black hole behind the homepage's free stuff act: a WebGL ray tracer, written for this site.
//
// How it works
// - Every pixel is a light ray traced backwards from the camera through Schwarzschild space (units of the
//   Schwarzschild radius). A ray stays in one plane through the hole, so instead of stepping it in 3D the
//   shader integrates u = 1/r against the orbit angle phi: u'' = 1.5 u^2 - u (RK4, adaptive steps). Exact for
//   the orbit's shape, and the disc crossings fall at known angles in that plane, so none is missed.
// - Rays with an impact parameter under 3*sqrt(3)/2 fall in: the black shadow. The photon ring (light that
//   skimmed the photon sphere) is drawn from the impact parameter as a thin core with a soft halo, so it is
//   anti-aliased at any size. Only the first two images of the disc are traced (the near side, and the far
//   side bent over and under the shadow); the thinner higher orders are what the ring stands for. Tried
//   tracing them too: they drew a one-pixel hairline round the shadow that looked pasted on.
// - A thin disc from the innermost stable orbit (3) to 13. Its gas is turbulent noise in polar coordinates:
//   streaks along the orbit with a slow radial warp, ridged filaments, dark lanes, and hot clumps that flare.
//   It turns at Kepler's rate (inner edge faster than outer). A texture advected that way winds into tighter
//   spirals forever, so it is advected in two phases that each restart every PERIOD seconds while faded out
//   and cross-fade into each other (a variance-preserving blend, so the contrast does not pulse).
// - The light gets the Doppler and gravitational shift g of matter on circular orbits, exaggerated on purpose
//   (Yanis, 2026-11-07): the colour is a Planck spectrum at the temperature times g^1.85 and the brightness
//   goes as g^(1.85 * 3.6), about g^6.7 where physics gives g^3 to g^4. So the approaching side burns
//   white-blue and the receding side sinks to a dim amber-red. A tone curve with a long shoulder (extended
//   Reinhard) keeps the streaks inside the burning side instead of clipping it to one flat white.
// - Bloom: the scene goes to a texture whose alpha holds the light past white; a quarter-size bright pass,
//   two separable blurs and a composite spread it in linear light. About 0.4 ms a frame on an M1 Pro.
// - Rays that get away read a procedural star field in their final direction, so the stars are lensed too.
//   Where the lens squeezes the sky into less than a pixel the stars fade into their average instead of
//   sparkling.
// - Anti-aliasing: the loop only records where the ray crosses the disc's plane; shading happens after it,
//   where screen-space derivatives of each crossing's radius give its true pixel footprint (lensing
//   included). Every octave, filament, lane and clump finer than about two pixels fades to its mean, and the
//   disc's inner edge is never sharper than a pixel and a half. No sparkle, no grain, at any size.
// - Cost (M1 Pro, 1440x900 at 2x, so 1350x844 rendered): about 4 to 5 ms of GPU a frame with the bloom.
//   Render scale at most 0.75 with the DPR capped (1 on phones, 1.25 elsewhere) and about 1.2 million pixels
//   at most; 30 fps on phones and 60 elsewhere. After a run of long frames it steps down: less detail and
//   no haze, then 0.72 of the resolution without bloom, then half the resolution and fewer steps. It draws
//   only while the page says it can be seen and the tab is visible. Reduced motion gets one static frame.

export type Hole = {
  canvas: HTMLCanvasElement;
  /** The camera's slow drift through the act: 0 as the act enters the screen, 1 as it leaves. */
  setDrift: (v: number) => void;
  /** Whether any of the layer can be seen right now (the page knows its wipes); drawing stops when not. */
  setVisible: (on: boolean) => void;
  destroy: () => void;
};

/** Seconds per advection phase, and seconds per orbit at the disc's inner edge (shared with the shader). */
const PERIOD = 16;
const LAP = 24;
/** Bloom texels are stored as sqrt(light / RANGE), so light up to RANGE times white survives 8-bit textures. */
const RANGE = 3;

const VERT = `
attribute vec2 a_xy;
varying vec2 v_uv;
void main() { v_uv = a_xy * 0.5 + 0.5; gl_Position = vec4(a_xy, 0.0, 1.0); }
`;

const HASH = `
float hash12(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * vec3(0.1279, 0.1653, 0.1891));
  q += dot(q, q.zxy + 23.71);
  return fract((q.x + q.y * 1.37) * q.z * 3.17);
}
`;

/* The scene. Look constants were tuned on screenshots of the standalone prototype (.scratch/free/proto2). */
const FRAG = `
precision highp float;
uniform vec2 u_center;
uniform float u_focal;
uniform float u_dist;
uniform vec3 u_e1;
uniform vec3 u_R;
uniform vec3 u_U;
uniform vec3 u_F;
uniform vec4 u_flow;
uniform float u_tw;
uniform float u_steps;
uniform float u_detail;
uniform vec4 u_look;
uniform float u_bpx;
uniform float u_haze;
uniform float u_dith;
uniform vec4 u_ringHalo;
uniform vec4 u_tex;
uniform float u_shift;
uniform float u_white;

const float PI = 3.14159265;
const float TAU = 6.28318531;
const float RIN = 3.0;
const float ROUT = 13.0;
const float BC = 2.59807621;
const float PERIOD = ${PERIOD.toFixed(1)};
const float LAP = ${LAP.toFixed(1)};
const int MAXSTEPS = 140;
${HASH}
float hash13(vec3 p) {
  p = fract(p * vec3(0.1279, 0.1653, 0.1891));
  p += dot(p, p.zxy + 23.71);
  return fract((p.x + p.y * 1.37) * p.z * 3.17);
}

// value noise, periodic in x over the given number of cells (the disc's angle wraps without a seam), with a
// quintic fade so no crease shows along the cell edges of the long streaks
float vnoise(vec2 p, float per) {
  vec2 i = floor(p);
  vec2 f = p - i;
  vec2 s = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float x0 = mod(i.x, per);
  float x1 = mod(i.x + 1.0, per);
  float a = hash12(vec2(x0, i.y));
  float b = hash12(vec2(x1, i.y));
  float c = hash12(vec2(x0, i.y + 1.0));
  float d = hash12(vec2(x1, i.y + 1.0));
  return mix(mix(a, b, s.x), mix(c, d, s.x), s.y);
}

// Planck radiance at 610, 550 and 465 nm, divided by a 4200 K body's (so that one reads white), as a colour
// with its brightest channel at 1, a little more saturated than film would give so the shift reads
vec3 blackbody(float T) {
  vec3 lam = vec3(0.61, 0.55, 0.465);
  vec3 l5 = lam * lam * lam * lam * lam;
  vec3 e = 1.0 / (l5 * (exp(14388.0 / (lam * max(T, 900.0))) - 1.0));
  e /= vec3(0.043248, 0.039265, 0.029074);
  e /= max(e.r, max(e.g, e.b));
  float l = dot(e, vec3(0.2126, 0.7152, 0.0722));
  return max(mix(vec3(l), e, 1.35), 0.0);
}

// One advection phase of the gas. a: angle in turns, already moved back along the orbit; r: radius; fp: the
// pixel's footprint in radius units (octaves finer than about two pixels fade to their mean, so the texture
// never sparkles); seed: this phase's random offset, new every time the phase restarts.
// Returns streaks (centred on 0), filaments, clumps, and the slow warp (the clumps' flicker phase).
vec4 gas(float a, float r, float fp, float seed) {
  float warp = vnoise(vec2(a * 5.0 + seed * 5.0, r * 0.55 + seed * 17.0), 5.0) - 0.5;
  float rr = r + warp * 1.2;
  float n = 0.0;
  float amp = 0.5;
  float per = 9.0;
  float rf = 1.45;
  for (int o = 0; o < 5; o++) {
    if (float(o) >= u_detail) break;
    float keep = 1.0 - smoothstep(0.25, 0.7, rf * fp);
    n += amp * keep * (vnoise(vec2(a * per + seed * per, rr * rf + seed * 7.0), per) - 0.5);
    per *= 2.0;
    rf *= 2.25;
    amp *= 0.58;
  }
  float fv = vnoise(vec2(a * 44.0 + seed * 44.0, rr * 6.2 + seed * 3.0), 44.0);
  float fl = pow(1.0 - abs(2.0 * fv - 1.0), 9.0) * (1.0 - smoothstep(0.25, 0.7, 6.2 * fp));
  // clumps fade earlier than their cell size says: the threshold gives them edges much sharper than a cell
  // (unfaded, they beaded the lensed arc under the shadow on phones)
  float cl = smoothstep(0.64, 0.92, vnoise(vec2(a * 15.0 + seed * 15.0, rr * 2.1 + seed * 11.0), 15.0)) * (1.0 - smoothstep(0.15, 0.5, 2.1 * fp));
  return vec4(n, fl, cl, warp);
}

// the disc where a ray crosses it: emission (premultiplied by opacity) and opacity
vec4 disc(vec3 P, vec3 dir, float fp, float cap) {
  float r = length(P.xz);
  float x = r / RIN;
  // matter on circular orbits, prograde about +y: its speed as a static observer sees it, the Doppler factor
  // for light leaving towards the camera (against the traced ray), and the gravitational redshift
  float beta = sqrt(0.5 / (r - 1.0));
  vec3 vdir = vec3(-P.z, 0.0, P.x) / r;
  float gam = inversesqrt(1.0 - beta * beta);
  float g = sqrt(1.0 - 1.0 / r) / (gam * (1.0 - beta * dot(vdir, -dir)));
  // turns per second at this radius: Kepler, the inner edge laps every LAP seconds
  float om = pow(x, -1.5) / LAP;
  float a = atan(P.z, P.x) / TAU;
  vec4 s0 = gas(a - om * u_flow.x, r, fp, u_flow.z);
  vec4 s1 = gas(a - om * u_flow.y, r, fp, u_flow.w);
  // each phase is faded out when it restarts; dividing by the weights' length keeps the contrast constant
  float w1 = abs(1.0 - 2.0 * u_flow.x / PERIOD);
  float w0 = 1.0 - w1;
  float k = inversesqrt(w0 * w0 + w1 * w1);
  float n = (s0.x * w0 + s1.x * w1) * k;
  float fl = (s0.y * w0 + s1.y * w1) * k;
  float cl = (s0.z * w0 + s1.z * w1) * k;
  float wp = s0.w * w0 + s1.w * w1;
  // dark lanes at a few radii, wandering with the warp
  float lane = 1.0 - u_tex.w * (1.0 - smoothstep(0.12, 0.5, vnoise(vec2(0.0, (r + wp * 1.4) * 1.15 + 3.0), 1.0))) * (1.0 - smoothstep(0.25, 0.7, 1.15 * fp));
  // hot clumps flare and fade, each on its own clock (u_tw wraps every 600 s: 250 whole cycles)
  float flick = 0.55 + 0.45 * sin(u_tw * 2.6179939 + wp * 41.0 + r * 1.7);
  float inner = exp(-(x - 1.0) * 8.0);
  // the inner edge is sharp, but never sharper than about a pixel and a half (lensing squeezes it hard).
  // Capped: where neighbouring pixels see different images of the disc the footprint is a jump, not a
  // squeeze, and an uncapped edge turned both hits see-through there (a one-pixel dark line)
  float edgeIn = smoothstep(1.0, 1.0 + clamp(1.5 * fp / RIN, 0.03, cap), x);
  float edgeOut = 1.0 - smoothstep(ROUT * 0.42, ROUT, r);
  float T = 5600.0 * pow(x, -0.6) * (1.0 + 0.3 * cl * flick + 0.5 * inner);
  float ge = pow(g, u_shift);
  float tex = max(0.0, 1.0 + u_tex.x * n) * lane + u_tex.y * fl + u_tex.z * cl * flick + 2.0 * inner;
  float I = pow(x, -2.3) * edgeIn * edgeOut * pow(ge, u_look.y) * tex;
  float alpha = clamp((0.58 + 1.1 * n + 0.4 * fl + 0.4 * cl) * lane, 0.0, 1.0) * edgeIn * edgeOut * (0.4 + 0.6 / x);
  return vec4(blackbody(T * ge) * (I * u_look.x), alpha);
}

// stars: one jittered point per cell of a 3D grid, read on the unit sphere. foot is the pixel's size on the
// sky: a star is at least a pixel wide and its light is spread, not added, when the pixel is bigger
vec3 starLayer(vec3 s, float scale, float keep, float foot) {
  vec3 q = s * scale;
  vec3 c = floor(q);
  vec3 f = q - c;
  if (hash13(c) > keep) return vec3(0.0);
  vec3 sp = vec3(hash13(c + 13.7), hash13(c + 55.0), hash13(c + 101.6)) * 0.6 + 0.2;
  vec3 d = f - sp;
  float sig = max(foot * scale * 0.32, 0.02);
  float b = exp(-dot(d, d) / (2.0 * sig * sig));
  // a power law: faint stars far more common than bright ones
  float mag = pow(hash13(c + 5.1), 6.0) * 2.4 + 0.05;
  vec3 col = mix(vec3(1.0, 0.78, 0.58), vec3(0.72, 0.84, 1.0), hash13(c + 9.3));
  return col * b * mag * min((0.02 * 0.02) / (sig * sig), 1.0) * 1.6;
}

vec3 sky(vec3 s, float foot) {
  vec3 c = starLayer(s, 70.0, 0.55, foot) + starLayer(s.zxy, 160.0, 0.5, foot) * 0.6 + starLayer(s.yzx, 330.0, 0.45, foot) * 0.35;
  // a faint band of the galaxy behind, tilted across the sky
  float band = exp(-pow(dot(s, vec3(0.3015, 0.9045, -0.3015)) / 0.22, 2.0));
  if (band > 0.02) {
    float ax = atan(s.z, s.x) / TAU;
    float dust = vnoise(vec2(ax * 24.0, s.y * 9.0), 24.0) * 0.6 + vnoise(vec2(ax * 48.0, s.y * 19.0), 48.0) * 0.4;
    c += vec3(0.55, 0.62, 0.8) * band * (0.0006 + 0.004 * dust * dust);
  }
  return c;
}

void main() {
  // the camera on a sphere of radius u_dist round the hole, looking at it (its basis comes from the page)
  vec3 e1 = u_e1;
  vec3 camPos = u_dist * e1;
  vec2 pix = gl_FragCoord.xy - u_center;
  vec3 dir = normalize(u_F * u_focal + u_R * pix.x + u_U * pix.y);

  // this ray's orbital plane: e1 points from the hole to the camera, e2 along the ray's sideways part
  float vr = dot(dir, e1);
  vec3 e2 = dir - vr * e1;
  float vt = length(e2);
  e2 = vt > 1e-5 ? e2 / vt : u_R;
  vt = max(vt, 1e-5);
  float u = 1.0 / u_dist;
  float w = -u * vr / vt;
  // the impact parameter, conserved along the ray: 1/b^2 = w^2 + u^2 - u^3
  float bimp = inversesqrt(max(w * w + u * u - u * u * u, 1e-8));
  float phi = 0.0;
  // the plane of the disc (y = 0) cuts the orbital plane along one line: crossings every PI from here
  float nextCross = mod(atan(-e1.y, e2.y), PI);
  if (nextCross < 1e-4) nextCross += PI;

  // The loop only records where the ray crosses the disc's plane (the first two times, on the disc or not)
  // and how much hot gas it passes on each stretch. Shading waits until after it, where screen-space
  // derivatives are allowed (outside any branch): the radius of each crossing then gives that image's true
  // pixel footprint, lensing included. Slots go by crossing number, not by hit order, so neighbouring pixels
  // always compare the same image of the disc (by hit order the lensed arc sat in slot 1 on one row and slot
  // 2 on the next, its footprint jumped, and a one-pixel dark line crossed the arc), and a crossing just
  // inside the inner edge still has a radius, so the edge itself is anti-aliased.
  vec3 P1 = vec3(0.0);
  vec3 D1 = vec3(0.0);
  vec3 P2 = vec3(0.0);
  vec3 D2 = vec3(0.0);
  vec3 haze0 = vec3(0.0);
  vec3 haze1 = vec3(0.0);
  vec3 haze2 = vec3(0.0);
  float ncross = 0.0;
  bool captured = false;
  bool escaped = false;
  vec3 prevP = camPos;
  for (int i = 0; i < MAXSTEPS; i++) {
    // out of steps: these rays skim the photon sphere; the impact parameter says which way they go
    if (float(i) >= u_steps) { captured = bimp < BC; break; }
    // RK4 is exact enough for big steps where the orbit is nearly straight (small u); near the hole the
    // relative change of u per step must stay small, and near the photon sphere (u = 2/3) the angle step
    float aw = abs(w) + 1e-5;
    float hmax = mix(0.32, 0.1, smoothstep(0.03, 0.15, u));
    float h = clamp(max(0.28 * u / aw, min(0.32, 0.015 / aw)), 0.003, hmax);
    bool cross = false;
    if (phi + h >= nextCross) { h = nextCross - phi; cross = true; }
    float k1w = 1.5 * u * u - u;
    float ua = u + 0.5 * h * w;
    float wa = w + 0.5 * h * k1w;
    float k2w = 1.5 * ua * ua - ua;
    float ub = u + 0.5 * h * wa;
    float wb = w + 0.5 * h * k2w;
    float k3w = 1.5 * ub * ub - ub;
    float uc = u + h * wb;
    float wc = w + h * k3w;
    float k4w = 1.5 * uc * uc - uc;
    u += h * (w + 2.0 * wa + 2.0 * wb + wc) / 6.0;
    w += h * (k1w + 2.0 * k2w + 2.0 * k3w + k4w) / 6.0;
    phi += h;
    // inside the horizon (the test is written so a NaN counts too)
    if (!(u < 1.0)) { captured = true; break; }
    float r = 1.0 / u;
    vec3 radial = cos(phi) * e1 + sin(phi) * e2;
    vec3 P = r * radial;
    // glow of hot gas just off the disc plane, along the bent path, beamed by the same Doppler shift (a cheap
    // tint here, not Planck). Skipped away from the disc, and dropped first when frames run long
    if (u_haze > 0.0) {
      float rho = length(P.xz);
      float hz = 0.045 + 0.035 * rho;
      if (abs(P.y) < 3.5 * hz && rho < ROUT) {
        float dens = exp(-P.y * P.y / (2.0 * hz * hz)) * smoothstep(RIN * 0.85, RIN * 1.25, rho) * exp(-(rho - RIN) * 0.45) * (1.0 - smoothstep(ROUT * 0.6, ROUT, rho));
        vec3 seg = P - prevP;
        float ds = length(seg);
        float hb = sqrt(0.5 / max(rho - 1.0, 0.5));
        float hcos = dot(vec3(-P.z, 0.0, P.x) / max(rho, 1e-3), -seg / max(ds, 1e-5));
        float hg = sqrt(1.0 - hb * hb) / (1.0 - hb * hcos);
        vec3 hz3 = dens * ds * hg * hg * hg * mix(vec3(1.0, 0.42, 0.12), vec3(0.72, 0.84, 1.0), smoothstep(0.7, 1.35, hg));
        if (ncross < 0.5) haze0 += hz3;
        else if (ncross < 1.5) haze1 += hz3;
        else haze2 += hz3;
      }
    }
    prevP = P;
    if (cross) {
      ncross += 1.0;
      vec3 tang = -sin(phi) * e1 + cos(phi) * e2;
      vec3 d = normalize(-w * r * r * radial + r * tang);
      if (ncross < 1.5) { P1 = P; D1 = d; }
      else {
        P2 = P;
        D2 = d;
        // later crossings are not shaded (the photon ring stands for them). Behind gas the rest of the path
        // hardly shows, so stop here; with no gas on either crossing, go on to find where the ray ends up
        float q = length(P1.xz);
        if ((q > RIN * 0.98 && q < ROUT) || (r > RIN * 0.98 && r < ROUT)) break;
      }
      nextCross += PI;
    }
    // far enough out and leaving: the rest of the path is nearly straight
    if (u < 1.0 / u_dist && w < 0.0) { escaped = true; break; }
  }

  // where the ray goes: the asymptote, where u(phi) runs out to 0
  float phiInf = phi + u / max(abs(w), 1e-4);
  vec3 sdir = cos(phiInf) * e1 + sin(phiInf) * e2;
  float r1 = length(P1.xz);
  float r2 = length(P2.xz);
#ifdef HAS_DERIV
  float foot = length(dFdx(sdir)) + length(dFdy(sdir));
  float fp1 = fwidth(r1);
  float fp2 = fwidth(r2);
#else
  float foot = 1.4 / u_focal;
  float fp1 = length(P1 - camPos) / u_focal / max(abs(D1.y), 0.04);
  float fp2 = fp1 * 3.5;
#endif
  vec4 c1 = vec4(0.0);
  vec4 c2 = vec4(0.0);
  // the lensed second image is squeezed far harder against the shadow, so its edge may soften further
  if (ncross > 0.5 && r1 > RIN * 0.98 && r1 < ROUT) c1 = disc(P1, D1, fp1, 0.12);
  if (ncross > 1.5 && r2 > RIN * 0.98 && r2 < ROUT) c2 = disc(P2, D2, fp2, 0.35);

  vec3 back = vec3(0.0);
  if (!captured) {
    float squeeze = smoothstep(0.02, 0.2, foot);
    back = sky(sdir, foot) * (1.0 - squeeze) + vec3(0.0012, 0.0013, 0.0016) * squeeze;
  }
  // The photon ring: a thin core just outside the shadow's edge (b = 2.598) and a soft halo that fades out
  // over a few pixels inside and a few dozen outside. Its light is the disc's after whole orbits, so it is
  // beamed like the disc: brighter and bluer where the photons orbit with the gas (the approaching side).
  float db = bimp - BC;
  float sig = max(0.018, 0.8 * u_bpx);
  float core = exp(-0.5 * db * db / (sig * sig));
  float halo = db > 0.0 ? u_ringHalo.x * exp(-db / (u_ringHalo.y * sig)) + u_ringHalo.z * exp(-db / 0.7) : u_ringHalo.x * exp(db / (1.3 * sig));
  float gr = 1.0 + 0.5 * cross(e1, e2).y;
  back += blackbody(6200.0 * pow(gr, 1.4)) * pow(gr, 3.0) * (u_ringHalo.w * core + halo) * u_look.z;
  // front to back: the first hit, then what shows through it, then through the second
  float hk = 0.1 * u_haze;
  vec3 col = haze0 * hk + c1.rgb * c1.a + (1.0 - c1.a) * (haze1 * hk + c2.rgb * c2.a + (1.0 - c2.a) * (haze2 * hk + back));

  // tone map the luminance and keep the colour, let the brightest light roll off towards white, then sRGB-ish
  col *= u_look.w;
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  // extended Reinhard with a white point: a long shoulder, so the burning side keeps its streaks and clumps
  // instead of clipping to one flat white (tried 1 - exp(-1.2 L): everything past 2.5 became the same white)
  float lm = lum * (1.0 + lum / (u_white * u_white)) / (1.0 + lum);
  vec3 tc = col * (lm / max(lum, 1e-5));
  tc = mix(tc, vec3(lm), smoothstep(0.55, 1.0, lm) * 0.35);
  vec3 o = pow(clamp(tc, 0.0, 1.0), vec3(1.0 / 2.2));
  // a touch of noise against banding in the dark gradients
  o += (hash12(gl_FragCoord.xy + u_dith) - 0.5) / 255.0;
  // alpha: the light past white, for the bloom pass (ignored when this draws straight to the screen)
  gl_FragColor = vec4(o, 1.0 - exp(-max(lum - 0.85, 0.0) * 0.45));
}
`;

/* Bloom 1: a quarter-size bright pass. Four bilinear taps average a 4x4 block of the scene exactly. */
const BRIGHT = `
precision mediump float;
uniform sampler2D u_src;
uniform vec2 u_px;
varying vec2 v_uv;
vec3 tap(vec2 o) {
  vec4 s = texture2D(u_src, v_uv + o * u_px);
  float l = dot(s.rgb, vec3(0.2126, 0.7152, 0.0722));
  // the light past white (alpha), plus a little of anything already bright, in linear light
  return s.rgb * s.rgb * (s.a * 2.5 + 0.25 * smoothstep(0.6, 0.95, l));
}
void main() {
  vec3 c = tap(vec2(-1.0, -1.0)) + tap(vec2(1.0, -1.0)) + tap(vec2(-1.0, 1.0)) + tap(vec2(1.0, 1.0));
  gl_FragColor = vec4(sqrt(c * (0.25 / ${RANGE.toFixed(1)})), 1.0);
}
`;

/* Bloom 2: a 9-tap Gaussian in 5 bilinear fetches, along u_dir, in linear light. */
const BLUR = `
precision mediump float;
uniform sampler2D u_src;
uniform vec2 u_dir;
varying vec2 v_uv;
vec3 lin(vec2 uv) { vec3 c = texture2D(u_src, uv).rgb; return c * c; }
void main() {
  vec3 c = lin(v_uv) * 0.2270270;
  c += (lin(v_uv + u_dir * 1.3846154) + lin(v_uv - u_dir * 1.3846154)) * 0.3162162;
  c += (lin(v_uv + u_dir * 3.2307692) + lin(v_uv - u_dir * 3.2307692)) * 0.0702703;
  gl_FragColor = vec4(sqrt(c), 1.0);
}
`;

/* Bloom 3: the scene plus its glow, in linear light, onto the screen. */
const COMP = `
precision highp float;
uniform sampler2D u_scene;
uniform sampler2D u_bloom;
uniform float u_gain;
uniform float u_dith;
varying vec2 v_uv;
${HASH}
void main() {
  vec3 c = texture2D(u_scene, v_uv).rgb;
  vec3 b = texture2D(u_bloom, v_uv).rgb;
  vec3 o = sqrt(c * c + b * b * u_gain);
  o += (hash12(gl_FragCoord.xy + u_dith) - 0.5) / 255.0;
  gl_FragColor = vec4(o, 1.0);
}
`;

type Prog = { p: WebGLProgram; u: Record<string, WebGLUniformLocation | null> };
type Target = { tex: WebGLTexture; fb: WebGLFramebuffer; w: number; h: number };

/**
 * Compiles and links every program, without blocking the main thread when the browser can compile in the
 * background (KHR_parallel_shader_compile): the scene shader is long, and a plain LINK_STATUS query waits
 * for the driver (a long task on slow machines). `done` gets the programs, or null if any failed.
 */
function buildAll(gl: WebGLRenderingContext, srcs: string[], ready: (ps: Prog[] | null) => void) {
  // always answer after the caller has returned: WebKit reports the compile finished on the first poll, and a
  // synchronous answer ran onReady inside createHole, before its result existed
  const done = (ps: Prog[] | null) => queueMicrotask(() => ready(ps));
  const sh = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return s;
  };
  const progs = srcs.map((fs) => {
    const p = gl.createProgram()!;
    const f = sh(gl.FRAGMENT_SHADER, fs);
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(p, f);
    // every program reads the one full-screen triangle at attribute 0
    gl.bindAttribLocation(p, 0, 'a_xy');
    gl.linkProgram(p);
    return { p, f };
  });
  const finish = () => {
    const out: Prog[] = [];
    for (const { p, f } of progs) {
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
        if (import.meta.env?.DEV) console.error('[hole]', gl.getShaderInfoLog(f) || gl.getProgramInfoLog(p));
        return done(null);
      }
      const u: Record<string, WebGLUniformLocation | null> = {};
      const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS) as number;
      for (let i = 0; i < n; i++) {
        const info = gl.getActiveUniform(p, i);
        if (info) u[info.name] = gl.getUniformLocation(p, info.name);
      }
      out.push({ p, u });
    }
    done(out);
  };
  const par = gl.getExtension('KHR_parallel_shader_compile') as { COMPLETION_STATUS_KHR: number } | null;
  if (!par) return finish();
  const poll = () => {
    if (gl.isContextLost()) return done(null);
    if (progs.every(({ p }) => gl.getProgramParameter(p, par.COMPLETION_STATUS_KHR))) finish();
    else requestAnimationFrame(poll);
  };
  poll();
}

/** A colour texture to render into, or null when the driver will not render to it (the bloom is then off). */
function makeTarget(gl: WebGLRenderingContext, w: number, h: number): Target | null {
  const tex = gl.createTexture();
  const fb = gl.createFramebuffer();
  if (!tex || !fb) return null;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  if (ok) return { tex, fb, w, h };
  gl.deleteTexture(tex);
  gl.deleteFramebuffer(fb);
  return null;
}

/** A seed in [0, 1) for one restart of an advection phase (the same restart always gets the same seed). */
const seedOf = (k: number) => {
  const x = Math.sin(k * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * Starts the black hole on `canvas` (sized by CSS) and returns its controls, or null without WebGL (the
 * page then keeps its CSS drawing). `onReady` runs after the first frame is on the canvas, and again after the
 * first frame of a restored context; `onLost` runs when the context is lost (the canvas then shows no hole until
 * that restored frame, plain white in Chromium, so the page hides it and shows its CSS drawing).
 * Layout: on wide screens the hole sits right of centre so the act's words keep the left side; on narrow
 * ones it is centred, higher up, and bigger relative to the width.
 */
export function createHole(canvas: HTMLCanvasElement, opts: { reduced: boolean; onReady?: () => void; onLost?: () => void }): Hole | null {
  let gl: WebGLRenderingContext | null = null;
  try {
    gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, powerPreference: 'default' });
  } catch {
    gl = null;
  }
  if (!gl) return null;
  const g = gl;
  // the shader needs 32-bit floats in the fragment stage (a few old phone GPUs only have 16)
  const hp = g.getShaderPrecisionFormat(g.FRAGMENT_SHADER, g.HIGH_FLOAT);
  if (!hp || hp.precision < 16) return null;

  // read on resize only: on phones every read of innerWidth/innerHeight runs a layout first (README rule 2)
  let phone = Math.min(innerWidth, innerHeight) < 600;
  const BUDGET = 1.2e6;
  const deg = Math.PI / 180;

  // the look, tuned on screenshots of the prototype (.scratch/free/proto2), whose DEV-only hook writes into
  // it: disc gain, beaming exponent, photon ring gain, exposure, bloom, gas glow, the ring's halo (strength,
  // reach in core widths, wide halo, core), the gas texture (streak contrast, filaments, clumps, lane depth),
  // the colour shift's exponent, the tone curve's white point, and a step count override (0: the default)
  const look = { disc: 1.25, beam: 3.6, ring: 0.9, exposure: 1.35, bloom: 1.25, haze: 0.12, halo: 0.2, reach: 5, wide: 0.035, core: 2.2, streak: 3.4, fil: 2.6, clump: 4.5, lanes: 0.85, shift: 1.85, white: 30, steps: 0 };

  let progs: Prog[] | null = null;
  let buf: WebGLBuffer | null = null;
  let scene: Target | null = null;
  let b1: Target | null = null;
  let b2: Target | null = null;
  let ready = false;
  let dead = false;

  // quality: 0 is the full look; 1 drops a level of detail and the haze; 2 renders at 0.72 of
  // the resolution without bloom; 3 at half, with fewer steps (for weak integrated GPUs). Phones start at 0 too:
  // tried starting them at 1 (2026-11-08), and the harness's phone pass at 4x CPU read the same frame times in
  // interleaved runs (p95 25.6 ms either way: the main thread holds that act's frames, not this shader)
  let level = 0;
  const scaleOf = (lv: number) => (lv >= 3 ? 0.5 : lv === 2 ? 0.72 : 1);
  let W = 1;
  let H = 1;
  const freeTargets = () => {
    for (const t of [scene, b1, b2]) {
      if (!t) continue;
      g.deleteTexture(t.tex);
      g.deleteFramebuffer(t.fb);
    }
    scene = b1 = b2 = null;
  };
  const size = () => {
    phone = Math.min(innerWidth, innerHeight) < 600;
    W = Math.max(1, canvas.clientWidth || innerWidth);
    H = Math.max(1, canvas.clientHeight || innerHeight);
    const dpr = Math.min(devicePixelRatio || 1, phone ? 1 : 1.25);
    // at most 0.75 of the capped resolution, and at most BUDGET pixels; less at quality steps 2 and 3
    const fit = Math.sqrt(BUDGET / (W * dpr * H * dpr));
    const s = Math.min(0.75, fit) * dpr * scaleOf(level);
    const bw = Math.max(1, Math.round(W * s));
    const bh = Math.max(1, Math.round(H * s));
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    if (!ready) return;
    // render targets follow the canvas: the scene at its size, the bloom at a quarter
    const qw = Math.max(1, Math.round(bw / 4));
    const qh = Math.max(1, Math.round(bh / 4));
    if (level > 1) freeTargets();
    else if (!scene || scene.w !== bw || scene.h !== bh || !b1 || b1.w !== qw || b1.h !== qh) {
      freeTargets();
      scene = makeTarget(g, bw, bh);
      b1 = scene && makeTarget(g, qw, qh);
      b2 = b1 && makeTarget(g, qw, qh);
    }
  };

  const init = () => {
    // asked for again on every build: a restored context starts with no extensions enabled, and the shader's
    // #extension line then failed to compile, so the canvas was dropped after the first context loss
    const deriv = !!g.getExtension('OES_standard_derivatives');
    const head = deriv ? '#extension GL_OES_standard_derivatives : enable\n#define HAS_DERIV\n' : '';
    buildAll(g, [head + FRAG, BRIGHT, BLUR, COMP], (ps) => {
      if (dead) return;
      if (!ps) return fail();
      progs = ps;
      buf = g.createBuffer();
      g.bindBuffer(g.ARRAY_BUFFER, buf);
      // one triangle that covers the screen, shared by every pass
      g.bufferData(g.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), g.STATIC_DRAW);
      g.enableVertexAttribArray(0);
      g.vertexAttribPointer(0, 2, g.FLOAT, false, 0, 0);
      ready = true;
      size();
      draw();
      opts.onReady?.();
      wake();
    });
  };
  // if the shaders cannot be built (a driver bug), the canvas goes and the CSS drawing stays
  const fail = () => {
    dead = true;
    canvas.remove();
  };

  /* ------------------------------------------------------------------ drawing */
  let time = 12;
  let drift = 0.5;
  let shownDrift = 0.5;
  const pass = (t: Target | null, w: number, h: number) => {
    g.bindFramebuffer(g.FRAMEBUFFER, t ? t.fb : null);
    g.viewport(0, 0, w, h);
  };
  const draw = () => {
    if (!ready || !progs || g.isContextLost()) return;
    const [main, bright, blur, comp] = progs;
    const bw = canvas.width;
    const bh = canvas.height;
    const k = bw / W;
    const narrow = W < 900;
    const d = opts.reduced ? 0.5 : shownDrift;
    // where the hole sits (CSS px from the top left) and its shadow's radius; the camera drifts with the scroll.
    // Narrow screens: high up, so the words arrive below it (free-act.css holds them about 55% down); at 40% they
    // landed right on the disc. Wide: right of centre, clear of the heading. The CSS drawing (.hole-art) matches.
    const cx = W * (narrow ? 0.5 : 0.68);
    const cy = H * (narrow ? 0.31 - 0.05 * d : 0.52 - 0.05 * d);
    const shadow = narrow ? Math.min(W * 0.155, H * 0.085) : Math.min(W * 0.078, H * 0.13);
    const dist = 30;
    const focal = (shadow * k * dist) / 2.598;
    // the camera's basis, once per frame instead of once per pixel
    const el = (8 - 3 * d) * deg;
    const az = (-10 + 20 * d) * deg;
    const ro = (-4 + 7 * d) * deg;
    const e1 = [Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)];
    const F = [-e1[0], -e1[1], -e1[2]];
    const rl = Math.hypot(F[2], F[0]);
    const rg = [-F[2] / rl, 0, F[0] / rl];
    const up = [rg[1] * F[2] - rg[2] * F[1], rg[2] * F[0] - rg[0] * F[2], rg[0] * F[1] - rg[1] * F[0]];
    const cr = Math.cos(ro);
    const sr = Math.sin(ro);
    // the two advection phases (seconds into each, and their seeds), worked out here in double precision
    const ph = time / PERIOD;
    const tau0 = (ph - Math.floor(ph)) * PERIOD;
    const tau1 = (ph + 0.5 - Math.floor(ph + 0.5)) * PERIOD;
    const dith = (time * 37.1) % 97;
    const useBloom = level < 2 && !!(scene && b1 && b2) && look.bloom > 0;

    pass(useBloom ? scene : null, bw, bh);
    g.useProgram(main.p);
    const u = main.u;
    g.uniform2f(u.u_center, cx * k, bh - cy * k);
    g.uniform1f(u.u_focal, focal);
    g.uniform1f(u.u_dist, dist);
    g.uniform3f(u.u_e1, e1[0], e1[1], e1[2]);
    g.uniform3f(u.u_F, F[0], F[1], F[2]);
    g.uniform3f(u.u_R, cr * rg[0] + sr * up[0], cr * rg[1] + sr * up[1], cr * rg[2] + sr * up[2]);
    g.uniform3f(u.u_U, -sr * rg[0] + cr * up[0], -sr * rg[1] + cr * up[1], -sr * rg[2] + cr * up[2]);
    g.uniform4f(u.u_flow, tau0, tau1, seedOf(Math.floor(ph)), seedOf(Math.floor(ph + 0.5) + 0.5));
    g.uniform1f(u.u_tw, time % 600);
    g.uniform1f(u.u_steps, (look.steps || (phone ? 72 : 100)) * (level >= 3 ? 0.6 : level ? 0.8 : 1));
    g.uniform1f(u.u_detail, Math.max(2, (phone ? 4 : 5) - level));
    g.uniform4f(u.u_look, look.disc, look.beam, look.ring, look.exposure);
    g.uniform1f(u.u_bpx, 2.598 / (shadow * k));
    g.uniform1f(u.u_haze, level > 0 ? 0 : look.haze);
    g.uniform1f(u.u_dith, dith);
    g.uniform4f(u.u_ringHalo, look.halo, look.reach, look.wide, look.core);
    g.uniform4f(u.u_tex, look.streak, look.fil, look.clump, look.lanes);
    g.uniform1f(u.u_shift, look.shift);
    g.uniform1f(u.u_white, look.white);
    g.drawArrays(g.TRIANGLES, 0, 3);
    if (!useBloom || !scene || !b1 || !b2) return;

    g.activeTexture(g.TEXTURE0);
    pass(b1, b1.w, b1.h);
    g.useProgram(bright.p);
    g.bindTexture(g.TEXTURE_2D, scene.tex);
    g.uniform1i(bright.u.u_src, 0);
    g.uniform2f(bright.u.u_px, 1 / bw, 1 / bh);
    g.drawArrays(g.TRIANGLES, 0, 3);
    // the glow: a tight blur, then a wider one on top of it. Both at quality step 1 too: tried only one narrow
    // pass there, and on a phone's small canvas (a quarter-size glow about 70 texels wide) the bright pass's
    // texel blocks showed as a stepped glow inside the shadow; at a quarter of the canvas the second pass costs
    // next to nothing
    g.useProgram(blur.p);
    g.uniform1i(blur.u.u_src, 0);
    for (const spread of [1, 2.4]) {
      pass(b2, b2.w, b2.h);
      g.bindTexture(g.TEXTURE_2D, b1.tex);
      g.uniform2f(blur.u.u_dir, spread / b1.w, 0);
      g.drawArrays(g.TRIANGLES, 0, 3);
      pass(b1, b1.w, b1.h);
      g.bindTexture(g.TEXTURE_2D, b2.tex);
      g.uniform2f(blur.u.u_dir, 0, spread / b1.h);
      g.drawArrays(g.TRIANGLES, 0, 3);
    }
    pass(null, bw, bh);
    g.useProgram(comp.p);
    g.activeTexture(g.TEXTURE1);
    g.bindTexture(g.TEXTURE_2D, b1.tex);
    g.activeTexture(g.TEXTURE0);
    g.bindTexture(g.TEXTURE_2D, scene.tex);
    g.uniform1i(comp.u.u_scene, 0);
    g.uniform1i(comp.u.u_bloom, 1);
    g.uniform1f(comp.u.u_gain, look.bloom * RANGE);
    g.uniform1f(comp.u.u_dith, dith + 13);
    g.drawArrays(g.TRIANGLES, 0, 3);
  };

  /* ------------------------------------------------------------------ running and pausing */
  let visible = false;
  let raf = 0;
  let last = 0;
  let lastDraw = 0;
  let slow = 0;
  let runFor = 0;
  const shouldRun = () => ready && !opts.reduced && visible && !document.hidden && !g.isContextLost();
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 1 / 15);
    last = now;
    runFor += dt;
    // 30 frames a second on phones; elsewhere 60 while the scroll moves the camera and 30 once it has settled
    // (the disc turns slowly: at rest 60 cost about a third of the GPU's time in the harness's idle pass)
    const settled = Math.abs(drift - shownDrift) < 0.0004;
    const gap = phone || settled ? 1000 / 30 : 1000 / 60;
    if (now - lastDraw < gap - 3) return;
    const step = Math.min((now - lastDraw) / 1000, 1 / 15);
    lastDraw = now;
    time += step;
    shownDrift += (drift - shownDrift) * (1 - Math.exp(-step * 6));
    draw();
    // a run of long frames (not the first second, while the shader warms up): less detail, then fewer pixels.
    // Very long frames count three times, so a GPU that is far too slow steps down in about a second
    if (runFor > 1.2 && dt > 0.026) slow += dt > 0.05 ? 3 : 1;
    else slow = Math.max(0, slow - 0.25);
    if (slow > 90 && level < 3) {
      level++;
      slow = 0;
      size();
      // resizing the canvas cleared it: draw now, or the cleared buffer is what the next composite shows
      draw();
      if (import.meta.env?.DEV) console.info('[hole] long frames: quality step', level);
    }
  };
  function wake() {
    if (raf || !shouldRun()) return;
    last = lastDraw = performance.now();
    runFor = 0;
    raf = requestAnimationFrame(frame);
  }
  const sleep = () => {
    cancelAnimationFrame(raf);
    raf = 0;
  };
  const onVis = () => (document.hidden ? sleep() : wake());

  let rt: number | undefined;
  const onResize = () => {
    clearTimeout(rt);
    rt = window.setTimeout(() => {
      size();
      draw();
    }, 150);
  };
  const onLost = (e: Event) => {
    e.preventDefault();
    sleep();
    ready = false;
    // the old context's objects are gone with it; init() makes new ones
    progs = null;
    scene = b1 = b2 = null;
    // no hole on the canvas until the restored context's first frame (init() then calls onReady again)
    opts.onLost?.();
  };
  const onRestored = () => init();

  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);
  addEventListener('resize', onResize);
  document.addEventListener('visibilitychange', onVis);
  // The shaders are sent to compile in a task of their own, at the next idle moment after the one that made the
  // context. The page makes the hole as its act comes near, so while the visitor scrolls, and the two together
  // took 13 to 59 ms at 4x CPU in the harness on a loaded machine (a long task over 50 ms); each half alone is
  // about half that. A context lost in between is rebuilt by onRestored instead.
  const start = () => {
    if (!dead && !g.isContextLost()) init();
  };
  if ('requestIdleCallback' in window) requestIdleCallback(start, { timeout: 300 });
  else setTimeout(start, 0);

  // the standalone prototype drives frames, tunes the look and times the GPU through this (DEV builds only)
  if (import.meta.env?.DEV)
    Object.assign(canvas, {
      __hole: {
        look,
        frame: (t: number, dv: number, lv = 0) => {
          time = t;
          shownDrift = drift = dv;
          if (lv !== level) {
            level = lv;
            size();
          }
          draw();
        },
        // GPU time of one frame: draws back to back, each followed by a one-pixel read that waits for the GPU
        bench: (n = 30) => {
          const px = new Uint8Array(4);
          const runs: number[] = [];
          for (let b = 0; b < 5; b++) {
            const t0 = performance.now();
            for (let i = 0; i < n; i++) {
              time += 1 / 60;
              draw();
              g.readPixels(0, 0, 1, 1, g.RGBA, g.UNSIGNED_BYTE, px);
            }
            runs.push((performance.now() - t0) / n);
          }
          runs.sort((a, b) => a - b);
          return { min: +runs[0].toFixed(2), med: +runs[2].toFixed(2), size: `${canvas.width}x${canvas.height}`, bloom: level < 2 && !!scene, level };
        },
        ready: () => ready,
      },
    });

  return {
    canvas,
    setDrift: (v) => {
      drift = Math.min(1, Math.max(0, v));
    },
    setVisible: (on) => {
      if (on === visible) return;
      visible = on;
      if (on) wake();
      else sleep();
    },
    destroy: () => {
      dead = true;
      sleep();
      clearTimeout(rt);
      freeTargets();
      removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVis);
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
    },
  };
}
