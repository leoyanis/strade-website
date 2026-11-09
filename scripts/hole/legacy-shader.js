// The live black hole shader as it stood on 2026-11-08 (src/components/free-act/black-hole.ts, copied while the fix
// pass was still editing that folder), so the offline renderer can draw the current look next to the new one and
// the physics check can read the live ray mapping. Generated from the TS source: template constants filled in
// (PERIOD 16, LAP 24, RANGE 3). Not used by the page.
export const PERIOD = 16;
export const LAP = 24;
export const RANGE = 3;
export const LOOK = { disc: 1.25, beam: 3.6, ring: 0.9, exposure: 1.35, bloom: 1.25, haze: 0.12, halo: 0.2, reach: 5, wide: 0.035, core: 2.2, streak: 3.4, fil: 2.6, clump: 4.5, lanes: 0.85, shift: 1.85, white: 30, steps: 0 };
export const VERT = `
attribute vec2 a_xy;
varying vec2 v_uv;
void main() { v_uv = a_xy * 0.5 + 0.5; gl_Position = vec4(a_xy, 0.0, 1.0); }
`;
export const FRAG = `
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
const float PERIOD = 16.0;
const float LAP = 24.0;
const int MAXSTEPS = 140;

float hash12(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * vec3(0.1279, 0.1653, 0.1891));
  q += dot(q, q.zxy + 23.71);
  return fract((q.x + q.y * 1.37) * q.z * 3.17);
}

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
export const BRIGHT = `
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
  gl_FragColor = vec4(sqrt(c * (0.25 / 3.0)), 1.0);
}
`;
export const BLUR = `
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
export const COMP = `
precision highp float;
uniform sampler2D u_scene;
uniform sampler2D u_bloom;
uniform float u_gain;
uniform float u_dith;
varying vec2 v_uv;

float hash12(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * vec3(0.1279, 0.1653, 0.1891));
  q += dot(q, q.zxy + 23.71);
  return fract((q.x + q.y * 1.37) * q.z * 3.17);
}

void main() {
  vec3 c = texture2D(u_scene, v_uv).rgb;
  vec3 b = texture2D(u_bloom, v_uv).rgb;
  vec3 o = sqrt(c * c + b * b * u_gain);
  o += (hash12(gl_FragCoord.xy + u_dith) - 0.5) / 255.0;
  gl_FragColor = vec4(o, 1.0);
}
`;
