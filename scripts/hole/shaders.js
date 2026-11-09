// GLSL for the offline black hole renderer (WebGL2, GLSL ES 3.00). Built from the live shader
// (src/components/free-act/black-hole.ts, copied in legacy-shader.js) and kept as close to it as the new look
// allows, so the colours, the photon ring and the two disc images read the same.
//
// What changed from the live shader, and why
// - Offline budget: up to 700 integration steps with steps 0.6x the live size, a third disc image (the live
//   shader overwrote its second slot with any later crossing; here each crossing number has its own slot and
//   footprint), up to 7 octaves of gas, and no quality steps. The output is linear light (HDR); tone mapping
//   happens once all samples of a frame are summed and the bloom is added (FINAL).
// - Every motion repeats after LOOP seconds, so the video loops without a seam: the gas is advected in two phases
//   whose restarts land on the loop (PERIOD divides LOOP, one seed per restart slot), the clumps flicker at whole
//   cycles per loop, the hot spots live inside the loop, the spiral arms turn whole turns per loop.
// - A more violent disc (Yanis, 2026-11-08): eddies push the gas round in angle and radius so lanes break and
//   curl, and the Kepler shear drags them into spiral arcs; sheared hot spots flare and fade as they orbit;
//   faster rotation (LAP); a turbulent inner rim.
// - The Doppler boost is milder in brightness than the live g^6.7 (the bright side blew out into one white patch,
//   see geodesic_ref.py) and still strong in colour: brightness g^(shift * beam), colour T * g^shift.
// - Stardust (DUST_VS/DUST_FS) is drawn as lensed sprites into three depth layers, which the scene composites
//   between the disc's images, so dust behind the disc is hidden by it and dust in front is not.

export const VERT = `#version 300 es
layout(location = 0) in vec2 a_xy;
out vec2 v_uv;
void main() { v_uv = a_xy * 0.5 + 0.5; gl_Position = vec4(a_xy, 0.0, 1.0); }
`;

const COMMON = `
const float PI = 3.14159265;
const float TAU = 6.28318531;
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
// Planck radiance at 610, 550 and 465 nm over a 4200 K body's, brightest channel 1, a little over-saturated (live)
vec3 blackbody(float T) {
  vec3 lam = vec3(0.61, 0.55, 0.465);
  vec3 l5 = lam * lam * lam * lam * lam;
  vec3 e = 1.0 / (l5 * (exp(14388.0 / (lam * max(T, 900.0))) - 1.0));
  e /= vec3(0.043248, 0.039265, 0.029074);
  e /= max(e.r, max(e.g, e.b));
  float l = dot(e, vec3(0.2126, 0.7152, 0.0722));
  return max(mix(vec3(l), e, 1.35), 0.0);
}
`;

/* The scene: one jittered sample of one moment, in linear light. #defines from hole.js: PERIOD, LAP, LOOP, HOTN,
   FLICK (clump flicker cycles per loop), ARMS_TURNS (spiral pattern turns per loop). */
export const SCENE = `#version 300 es
precision highp float;
precision highp int;
uniform vec2 u_center;
uniform vec2 u_jitter;
uniform float u_focal;
uniform float u_dist;
uniform vec3 u_e1;
uniform vec3 u_R;
uniform vec3 u_U;
uniform vec3 u_F;
uniform vec4 u_flow;
uniform float u_time;
uniform float u_steps;
uniform float u_detail;
uniform vec4 u_look;
uniform float u_bpx;
uniform float u_haze;
uniform vec4 u_ringHalo;
uniform vec4 u_tex;
uniform float u_shift;
uniform vec4 u_ring2;
uniform vec4 u_viol;
uniform float u_fpk;
uniform float u_weight;
uniform float u_stars;
uniform vec4 u_hotA[HOTN];
uniform vec4 u_hotB[HOTN];
uniform sampler2D u_dust0;
uniform sampler2D u_dust1;
uniform sampler2D u_dust2;
uniform float u_dustK;
out vec4 o_col;

const float RIN = 3.0;
const float ROUT = 13.0;
const float BC = 2.59807621;
const int MAXSTEPS = 700;
${COMMON}

// value noise, periodic in x over per cells, quintic fade (live)
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

// One advection phase of the gas (live gas() plus eddies). The eddy field pushes the texture round in angle and
// out in radius before the octaves read it, so the dark lanes and filaments wander, kink and break instead of
// running as clean circles; the Kepler advection outside this function then shears each kink into a spiral arc.
vec4 gas(float a, float r, float fp, float seed) {
  float warp = vnoise(vec2(a * 5.0 + seed * 5.0, r * 0.55 + seed * 17.0), 5.0) - 0.5;
  float eddy = vnoise(vec2(a * 14.0 + seed * 14.0, r * 1.6 + seed * 29.0), 14.0) - 0.5;
  float eddy2 = vnoise(vec2(a * 31.0 + seed * 31.0, r * 3.4 + seed * 13.0), 31.0) - 0.5;
  float ek = u_viol.x * (1.0 - smoothstep(0.3, 1.2, 3.4 * fp));
  float rr = r + warp * 1.2 + (eddy * 0.7 + eddy2 * 0.25) * ek;
  float aa = a + (eddy * 0.022 + eddy2 * 0.008) * ek;
  float n = 0.0;
  float amp = 0.5;
  float per = 9.0;
  float rf = 1.45;
  for (int o = 0; o < 7; o++) {
    if (float(o) >= u_detail) break;
    float keep = 1.0 - smoothstep(0.25, 0.7, rf * fp);
    n += amp * keep * (vnoise(vec2(aa * per + seed * per, rr * rf + seed * 7.0), per) - 0.5);
    per *= 2.0;
    rf *= 2.25;
    amp *= 0.58;
  }
  float fv = vnoise(vec2(aa * 44.0 + seed * 44.0, rr * 6.2 + seed * 3.0), 44.0);
  float fl = pow(1.0 - abs(2.0 * fv - 1.0), 9.0) * (1.0 - smoothstep(0.25, 0.7, 6.2 * fp));
  float fv2 = vnoise(vec2(aa * 88.0 + seed * 88.0, rr * 12.5 + seed * 5.0), 88.0);
  fl += 0.6 * pow(1.0 - abs(2.0 * fv2 - 1.0), 12.0) * (1.0 - smoothstep(0.25, 0.7, 12.5 * fp));
  float cl = smoothstep(0.64, 0.92, vnoise(vec2(aa * 15.0 + seed * 15.0, rr * 2.1 + seed * 11.0), 15.0)) * (1.0 - smoothstep(0.15, 0.5, 2.1 * fp));
  return vec4(n, fl, cl, warp);
}

// the disc where a ray crosses it: emission (premultiplied by opacity) and opacity
vec4 disc(vec3 P, vec3 dir, float fp, float cap) {
  float r = length(P.xz);
  float x = r / RIN;
  // circular orbits about -y as seen by a static observer, light leaving against the traced ray (live)
  float beta = sqrt(0.5 / (r - 1.0));
  vec3 vdir = vec3(-P.z, 0.0, P.x) / r;
  float gam = inversesqrt(1.0 - beta * beta);
  float g = sqrt(1.0 - 1.0 / r) / (gam * (1.0 - beta * dot(vdir, -dir)));
  // turns per second: Kepler, the inner edge laps every LAP seconds
  float om = pow(x, -1.5) / LAP;
  float a = atan(P.z, P.x) / TAU;
  vec4 s0 = gas(a - om * u_flow.x, r, fp, u_flow.z);
  vec4 s1 = gas(a - om * u_flow.y, r, fp, u_flow.w);
  float w1 = abs(1.0 - 2.0 * u_flow.x / PERIOD);
  float w0 = 1.0 - w1;
  float k = inversesqrt(w0 * w0 + w1 * w1);
  float n = (s0.x * w0 + s1.x * w1) * k;
  float fl = (s0.y * w0 + s1.y * w1) * k;
  float cl = (s0.z * w0 + s1.z * w1) * k;
  float wp = s0.w * w0 + s1.w * w1;
  float lane = 1.0 - u_tex.w * (1.0 - smoothstep(0.12, 0.5, vnoise(vec2(0.0, (r + wp * 1.4) * 1.15 + 3.0), 1.0))) * (1.0 - smoothstep(0.25, 0.7, 1.15 * fp));
  // clumps flare on whole cycles of the loop
  float flick = 0.55 + 0.45 * sin(u_time * (TAU * FLICK / LOOP) + wp * 41.0 + r * 1.7);
  float inner = exp(-(x - 1.0) * 8.0);
  // the turbulent inner rim: fine knots of brightness just outside the inner edge, advected and cross-faded in the
  // same two phases as the gas (tried one phase only: its restart every PERIOD seconds popped the whole rim)
  float rk = u_viol.z * exp(-(x - 1.0) * 5.0) * (1.0 - smoothstep(0.25, 0.7, 9.0 * fp));
  float rim0 = vnoise(vec2((a - om * u_flow.x) * 60.0 + u_flow.z * 60.0, r * 9.0), 60.0) - 0.5;
  float rim1 = vnoise(vec2((a - om * u_flow.y) * 60.0 + u_flow.w * 60.0, r * 9.0), 60.0) - 0.5;
  float rim = rk * (rim0 * w0 + rim1 * w1) * k;
  // sheared hot spots: each one a blob that orbits at its own Kepler rate and is dragged into an arc by the shear
  float hot = 0.0;
  float hotT = 0.0;
  for (int i = 0; i < HOTN; i++) {
    vec4 A = u_hotA[i];
    if (A.z <= 0.0) continue;
    vec4 B = u_hotB[i];
    float dr = r - A.x;
    if (abs(dr) > 4.0 * B.x) continue;
    float omk = pow(A.x / RIN, -1.5) / LAP;
    float shear = -1.5 * omk / A.x * A.w;
    float da = fract(a - A.y - shear * dr + 0.5) - 0.5;
    float e = exp(-0.5 * dr * dr / (B.x * B.x) - 0.5 * da * da / (B.y * B.y));
    hot += A.z * e;
    hotT += A.z * e * B.z;
  }
  // spiral density waves: a two-armed pattern turning ARMS_TURNS whole turns per loop
  float arms = 0.0;
  if (u_viol.w > 0.0) arms = u_viol.w * pow(0.5 + 0.5 * cos(2.0 * TAU * (a - u_time * ARMS_TURNS / LOOP) + 3.4 * log(r)), 3.0);
  float edgeIn = smoothstep(1.0, 1.0 + clamp(1.5 * fp / RIN, 0.03, cap), x);
  float edgeOut = 1.0 - smoothstep(ROUT * 0.42, ROUT, r);
  float T = 5600.0 * pow(x, -0.6) * (1.0 + 0.3 * cl * flick + 0.5 * inner + 0.4 * hotT);
  float ge = pow(g, u_shift);
  float tex = max(0.0, 1.0 + u_tex.x * n + rim) * lane * (1.0 + arms) + u_tex.y * fl + u_tex.z * cl * flick + 2.0 * inner + hot;
  float I = pow(x, -2.3) * edgeIn * edgeOut * pow(ge, u_look.y) * tex;
  float alpha = clamp((0.58 + 1.1 * n + 0.4 * fl + 0.4 * cl + 0.3 * hot) * lane, 0.0, 1.0) * edgeIn * edgeOut * (0.4 + 0.6 / x);
  return vec4(blackbody(T * ge) * (I * u_look.x), alpha);
}

vec3 starLayer(vec3 s, float scale, float keep, float foot) {
  vec3 q = s * scale;
  vec3 c = floor(q);
  vec3 f = q - c;
  if (hash13(c) > keep) return vec3(0.0);
  vec3 sp = vec3(hash13(c + 13.7), hash13(c + 55.0), hash13(c + 101.6)) * 0.6 + 0.2;
  vec3 d = f - sp;
  float sig = max(foot * scale * 0.32, 0.02);
  float b = exp(-dot(d, d) / (2.0 * sig * sig));
  float mag = pow(hash13(c + 5.1), 6.0) * 2.4 + 0.05;
  vec3 col = mix(vec3(1.0, 0.78, 0.58), vec3(0.72, 0.84, 1.0), hash13(c + 9.3));
  return col * b * mag * min((0.02 * 0.02) / (sig * sig), 1.0) * 1.6;
}

vec3 sky(vec3 s, float foot) {
  vec3 c = starLayer(s, 70.0, 0.55, foot) + starLayer(s.zxy, 160.0, 0.5, foot) * 0.6 + starLayer(s.yzx, 330.0, 0.45, foot) * 0.35;
  c *= u_stars;
  float band = exp(-pow(dot(s, vec3(0.3015, 0.9045, -0.3015)) / 0.22, 2.0));
  if (band > 0.02) {
    float ax = atan(s.z, s.x) / TAU;
    float dust = vnoise(vec2(ax * 24.0, s.y * 9.0), 24.0) * 0.6 + vnoise(vec2(ax * 48.0, s.y * 19.0), 48.0) * 0.4;
    c += vec3(0.55, 0.62, 0.8) * band * (0.0006 + 0.004 * dust * dust);
  }
  return c;
}

bool onDisc(float r) { return r > RIN * 0.98 && r < ROUT; }

void main() {
  vec3 camPos = u_dist * u_e1;
  vec2 pix = gl_FragCoord.xy + u_jitter - u_center;
  vec3 dir = normalize(u_F * u_focal + u_R * pix.x + u_U * pix.y);
  float vr = dot(dir, u_e1);
  vec3 e2 = dir - vr * u_e1;
  float vt = length(e2);
  e2 = vt > 1e-6 ? e2 / vt : u_R;
  vt = max(vt, 1e-6);
  float u = 1.0 / u_dist;
  float w = -u * vr / vt;
  float bimp = inversesqrt(max(w * w + u * u - u * u * u, 1e-10));
  float phi = 0.0;
  float nextCross = mod(atan(-u_e1.y, e2.y), PI);
  if (nextCross < 1e-4) nextCross += PI;

  // record the first three crossings of the disc's plane by number (slot k always holds crossing k, so
  // neighbouring pixels compare the same image and the footprints stay smooth), and the hot gas passed on the
  // way to each one
  vec3 P1 = vec3(0.0); vec3 D1 = vec3(0.0);
  vec3 P2 = vec3(0.0); vec3 D2 = vec3(0.0);
  vec3 P3 = vec3(0.0); vec3 D3 = vec3(0.0);
  vec3 haze0 = vec3(0.0); vec3 haze1 = vec3(0.0); vec3 haze2 = vec3(0.0);
  float ncross = 0.0;
  bool captured = false;
  vec3 prevP = camPos;
  for (int i = 0; i < MAXSTEPS; i++) {
    if (float(i) >= u_steps) { captured = bimp < BC; break; }
    float aw = abs(w) + 1e-5;
    float hmax = mix(0.2, 0.06, smoothstep(0.03, 0.15, u));
    float h = clamp(max(0.17 * u / aw, min(0.2, 0.009 / aw)), 0.0018, hmax);
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
    if (!(u < 1.0)) { captured = true; break; }
    float r = 1.0 / u;
    vec3 radial = cos(phi) * u_e1 + sin(phi) * e2;
    vec3 P = r * radial;
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
        vec3 hz3 = dens * ds * pow(hg, 3.0) * mix(vec3(1.0, 0.42, 0.12), vec3(0.72, 0.84, 1.0), smoothstep(0.7, 1.35, hg));
        if (ncross < 0.5) haze0 += hz3;
        else if (ncross < 1.5) haze1 += hz3;
        else haze2 += hz3;
      }
    }
    prevP = P;
    if (cross) {
      ncross += 1.0;
      vec3 tang = -sin(phi) * u_e1 + cos(phi) * e2;
      vec3 d = normalize(-w * r * r * radial + r * tang);
      if (ncross < 1.5) { P1 = P; D1 = d; }
      else if (ncross < 2.5) {
        P2 = P; D2 = d;
        // behind gas the rest hardly shows: stop once either of the first two crossings is on the disc
        if (onDisc(length(P1.xz)) || onDisc(r)) break;
      } else {
        P3 = P; D3 = d;
        break;
      }
      nextCross += PI;
    }
    if (u < 1.0 / u_dist && w < 0.0) break;
  }

  float phiInf = phi + u / max(abs(w), 1e-4);
  vec3 sdir = cos(phiInf) * u_e1 + sin(phiInf) * e2;
  float r1 = length(P1.xz);
  float r2 = length(P2.xz);
  float r3 = length(P3.xz);
  float foot = length(dFdx(sdir)) + length(dFdy(sdir));
  float fp1 = fwidth(r1) * u_fpk;
  float fp2 = fwidth(r2) * u_fpk;
  float fp3 = fwidth(r3) * u_fpk;
  vec4 c1 = vec4(0.0);
  vec4 c2 = vec4(0.0);
  vec4 c3 = vec4(0.0);
  if (ncross > 0.5 && onDisc(r1)) c1 = disc(P1, D1, fp1, 0.12);
  if (ncross > 1.5 && onDisc(r2)) c2 = disc(P2, D2, fp2, 0.35);
  if (ncross > 2.5 && onDisc(r3)) c3 = disc(P3, D3, fp3, 0.5);

  vec3 back = vec3(0.0);
  if (!captured) {
    float squeeze = smoothstep(0.02, 0.2, foot);
    back = sky(sdir, foot) * (1.0 - squeeze) + vec3(0.0012, 0.0013, 0.0016) * squeeze;
  }
  // the photon ring (live): a thin core just outside the shadow's edge and a soft halo, beamed like the disc but
  // over a narrower range (u_ring2.x) so its receding side stays a visible line
  float db = bimp - BC;
  float sig = max(0.018, 0.8 * u_bpx);
  float core = exp(-0.5 * db * db / (sig * sig));
  float halo = db > 0.0 ? u_ringHalo.x * exp(-db / (u_ringHalo.y * sig)) + u_ringHalo.z * exp(-db / 0.7) : u_ringHalo.x * exp(db / (1.3 * sig));
  float gr = 1.0 + u_ring2.x * cross(u_e1, e2).y;
  back += blackbody(u_ring2.z * pow(gr, 1.4)) * pow(gr, u_ring2.y) * (u_ringHalo.w * core + halo) * u_look.z;

  ivec2 ip = ivec2(gl_FragCoord.xy);
  vec3 d0 = texelFetch(u_dust0, ip, 0).rgb * u_dustK;
  vec3 d1 = texelFetch(u_dust1, ip, 0).rgb * u_dustK;
  vec3 d2 = texelFetch(u_dust2, ip, 0).rgb * u_dustK;
  float hk = 0.1 * u_haze;
  vec3 col = haze0 * hk + d0 + c1.rgb * c1.a + (1.0 - c1.a) * (haze1 * hk + d1 + c2.rgb * c2.a + (1.0 - c2.a) * (haze2 * hk + d2 + c3.rgb * c3.a + (1.0 - c3.a) * back));
  o_col = vec4(col * u_look.w * u_weight, u_weight);
}
`;

/* Stardust: each particle is a point on a periodic infall path, drawn twice (u_image 0: the image reached the
   short way round the hole, 1: the faint one that comes round the back) at the place the lens table says, into
   one of three depth layers. #defines: LOOP, LAP, LUT_W, LUT_H, LOG_RMIN, LOG_RMAX. */
export const DUST_VS = `#version 300 es
precision highp float;
precision highp int;
layout(location = 0) in vec4 a_p0; // phase in [0,1), cycles per loop, brightness, seed
layout(location = 1) in vec4 a_p1; // start radius, end radius, fall profile q, start angle (turns)
layout(location = 2) in vec4 a_p2; // inclination (rad), node (rad), sigma (px at 4K), height
layout(location = 3) in vec4 a_p3; // per-cycle jitter: angle (turns), start radius (fraction), inclination (rad), heat
uniform float u_time;
uniform vec3 u_e1;
uniform vec3 u_R;
uniform vec3 u_U;
uniform vec2 u_center;
uniform vec2 u_jitter;
uniform vec2 u_size;
uniform float u_focal;
uniform float u_dist;
uniform float u_pxk;
uniform sampler2D u_lut;
uniform int u_image;
uniform vec4 u_dlook;   // gain, beaming exponent, colour shift, base temperature
uniform vec4 u_dlook2;  // heat exponent, near-camera boost cap, fade-in, fade-out (life fractions)
out vec3 v_col;
out float v_sig;
out vec2 v_c;
flat out int v_layer;
${COMMON}

float hash11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
// radians per second on a circular orbit at r (the disc's own law, so dust and gas turn together)
float omega(float r) { return TAU / LAP * pow(max(r, 1.6) / 3.0, -1.5); }

vec2 lut(float phi, float r) {
  float cx = clamp(phi / TAU, 0.0, 1.0) * float(LUT_W - 1);
  float cy = (log(r) - LOG_RMIN) / (LOG_RMAX - LOG_RMIN) * float(LUT_H - 1);
  if (cy < 0.0 || cy > float(LUT_H - 1)) return vec2(0.0);
  ivec2 i0 = ivec2(floor(vec2(cx, cy)));
  vec2 f = vec2(cx, cy) - vec2(i0);
  ivec2 i1 = min(i0 + 1, ivec2(LUT_W - 1, LUT_H - 1));
  vec2 v00 = texelFetch(u_lut, i0, 0).rg;
  vec2 v10 = texelFetch(u_lut, ivec2(i1.x, i0.y), 0).rg;
  vec2 v01 = texelFetch(u_lut, ivec2(i0.x, i1.y), 0).rg;
  vec2 v11 = texelFetch(u_lut, i1, 0).rg;
  // a corner no ray reaches makes the place unreachable (no blending of a real b with "none")
  if (min(min(v00.x, v10.x), min(v01.x, v11.x)) <= 0.0) return vec2(0.0);
  return mix(mix(v00, v10, f.x), mix(v01, v11, f.x), f.y);
}

void cull() { gl_Position = vec4(3.0, 3.0, 3.0, 1.0); gl_PointSize = 1.0; v_col = vec3(0.0); v_sig = 1.0; v_c = vec2(-1e5); v_layer = 9; }

void main() {
  float kc = a_p0.y;
  float T = LOOP / kc;
  float lt = u_time / T + a_p0.x;
  float cyc = floor(lt);
  float tau = lt - cyc;
  float cm = mod(cyc, kc);
  float s1 = hash11(a_p0.w * 17.31 + cm * 3.7);
  float s2 = hash11(a_p0.w * 5.13 + cm * 11.9);
  float s3 = hash11(a_p0.w * 9.77 + cm * 7.3);
  float rs = a_p1.x * (1.0 + a_p3.y * (s2 - 0.5));
  float re = a_p1.y;
  float q = a_p1.z;
  float th0 = (a_p1.w + a_p3.x * (s1 - 0.5)) * TAU;
  float inc0 = a_p2.x + a_p3.z * (s3 - 0.5);
  float fade = smoothstep(0.0, u_dlook2.z, tau) * (1.0 - smoothstep(1.0 - u_dlook2.w, 1.0, tau));
  if (fade <= 0.0) { cull(); return; }
  // radius now: r = re + (rs - re)(1 - tau)^q, slow far out and fast at the end (q < 1), like a free fall
  float r = re + (rs - re) * pow(1.0 - tau, q);
  // the angle swept since birth: the orbit rate integrated along the fall (Simpson, 16 intervals)
  float sw = 0.0;
  float hh = tau / 16.0;
  for (int i = 0; i <= 16; i++) {
    float ri = re + (rs - re) * pow(max(1.0 - hh * float(i), 0.0), q);
    float wgt = (i == 0 || i == 16) ? 1.0 : ((i & 1) == 1 ? 4.0 : 2.0);
    sw += wgt * omega(ri);
  }
  float th = th0 + sw * hh / 3.0 * T;
  // the orbit's plane tilts down into the disc as the dust falls; a_p2.w lifts it a little off the plane
  float fall = clamp((r - re) / max(rs - re, 1e-3), 0.0, 1.0);
  float inc = inc0 * pow(fall, 0.7);
  vec3 p = vec3(r * cos(th), a_p2.w * r * 0.025, r * sin(th));
  vec3 nd = vec3(cos(a_p2.y), 0.0, sin(a_p2.y));
  float ci = cos(inc);
  float si = sin(inc);
  vec3 P = p * ci + cross(nd, p) * si + nd * dot(nd, p) * (1.0 - ci);
  float drdt = -(rs - re) * q * pow(max(1.0 - tau, 1e-3), q - 1.0) / T;
  float om = omega(r);
  vec3 vel = drdt * vec3(cos(th), 0.0, sin(th)) + r * om * vec3(-sin(th), 0.0, cos(th));
  vel = vel * ci + cross(nd, vel) * si + nd * dot(nd, vel) * (1.0 - ci);

  // the lens: the ray to this point lies in the plane of the camera, the hole and the point
  float rp = length(P);
  vec3 n = P / rp;
  float cpsi = clamp(dot(n, u_e1), -1.0, 1.0);
  vec3 e2 = n - cpsi * u_e1;
  float e2l = length(e2);
  if (rp < 1.05 || rp > 38.0 || e2l < 1e-4) { cull(); return; }
  e2 /= e2l;
  float psi = acos(cpsi);
  float PHI = u_image == 0 ? psi : TAU - psi;
  vec3 e2i = u_image == 0 ? e2 : -e2;
  vec2 bw = lut(PHI, rp);
  if (bw.x <= 0.0) { cull(); return; }
  float b = bw.x;
  float w = bw.y;
  float u0 = 1.0 / u_dist;
  float w0 = sqrt(max(1.0 / (b * b) - u0 * u0 + u0 * u0 * u0, 1e-12));
  float rho = u_focal * u0 / w0;
  vec2 sd = normalize(vec2(dot(e2i, u_R), dot(e2i, u_U)));
  vec2 pos = u_center + rho * sd - u_jitter;
  if (pos.x < -8.0 || pos.y < -8.0 || pos.x > u_size.x + 8.0 || pos.y > u_size.y + 8.0) { cull(); return; }
  // depth against the disc: how many times the ray crossed the disc's plane before it reached the dust
  float nc = mod(atan(-u_e1.y, e2i.y), PI);
  if (nc < 1e-4) nc += PI;
  v_layer = PHI <= nc ? 0 : (PHI <= nc + PI ? 1 : 2);
  // the light leaves the dust along the ray, towards the camera
  vec3 tang = -sin(PHI) * u_e1 + cos(PHI) * e2i;
  vec3 kem = -normalize(-w * rp * rp * n + rp * tang);
  float bphys = sqrt(0.5 / max(rp - 1.0, 0.6));
  float ratio = abs(drdt) / max(r * om, 1e-4);
  float beta = min(bphys * sqrt(1.0 + ratio * ratio), 0.93);
  float cosk = dot(normalize(vel), kem);
  float g = sqrt(max(1.0 - 1.0 / rp, 0.0)) * sqrt(1.0 - beta * beta) / (1.0 - beta * cosk);
  // brightness change from the lens: how far the image moves when the dust moves one unit across the ray, in
  // both directions, against flat space at the same distance (secondary images come out a few % as bright)
  float eps = 0.003;
  float bR1 = lut(PHI, rp * (1.0 + eps)).x;
  float bR0 = lut(PHI, rp * (1.0 - eps)).x;
  float pa = max(PHI - 0.004, 0.0);
  float pb = min(PHI + 0.004, TAU);
  float bP1 = lut(pb, rp).x;
  float bP0 = lut(pa, rp).x;
  float mu = 1.0;
  if (bR1 > 0.0 && bR0 > 0.0 && bP1 > 0.0 && bP0 > 0.0) {
    float dbdr = (bR1 - bR0) / (2.0 * rp * eps);
    float dbdphi = (bP1 - bP0) / (pb - pa);
    vec2 dpl = normalize(vec2(-w * rp * rp, rp));
    float dbdl = dbdr * (-dpl.y) + dbdphi * dpl.x / rp;
    float drhodb = u_focal * u0 / (b * b * b * w0 * w0 * w0);
    float sr = abs(drhodb * dbdl);
    float st = rho / max(rp * sin(psi), 1e-3);
    float dcam = length(P - u_dist * u_e1);
    mu = clamp(st * sr * dcam * dcam / (u_focal * u_focal), 0.0, 25.0);
  }
  float dcam = length(P - u_dist * u_e1);
  float near = min(pow(u_dist / dcam, 2.0), u_dlook2.y);
  float temp = u_dlook.w * pow(rp / 3.0, -0.6) * (1.0 + a_p3.w);
  float ge = pow(g, u_dlook.z);
  float heat = pow(3.0 / max(rp, 2.2), u_dlook2.x);
  // u_pxk^2: a dot's light is given for a 4K frame; a smaller frame has fewer pixels per unit of sky, so the same
  // dust must carry less light per pixel area (tried without: the half-size previews read four times as dusty)
  float flux = a_p0.z * u_dlook.x * heat * pow(ge, u_dlook.y) * mu * near * fade * u_pxk * u_pxk;
  if (flux < 1e-5) { cull(); return; }
  v_col = blackbody(temp * ge) * flux;
  v_sig = max(a_p2.z * u_pxk, 0.55);
  v_c = pos;
  gl_PointSize = 2.0 * ceil(3.2 * v_sig) + 1.0;
  gl_Position = vec4(pos / u_size * 2.0 - 1.0, 0.0, 1.0);
}
`;

export const DUST_FS = `#version 300 es
precision highp float;
in vec3 v_col;
in float v_sig;
in vec2 v_c;
flat in int v_layer;
layout(location = 0) out vec4 o0;
layout(location = 1) out vec4 o1;
layout(location = 2) out vec4 o2;
void main() {
  vec2 d = gl_FragCoord.xy - v_c;
  // a Gaussian with unit integral, so v_col is the dot's whole light whatever its size
  vec4 c = vec4(v_col * exp(-dot(d, d) / (2.0 * v_sig * v_sig)) / (6.2831853 * v_sig * v_sig), 0.0);
  o0 = v_layer == 0 ? c : vec4(0.0);
  o1 = v_layer == 1 ? c : vec4(0.0);
  o2 = v_layer == 2 ? c : vec4(0.0);
}
`;

/* Bloom, at full resolution in linear light: a soft-knee bright pass, a 13-tap downsample chain to 1/64, and a
   tent upsample chain that adds each level back (the usual filmic bloom). */
export const BLOOM_PRE = `#version 300 es
precision highp float;
uniform sampler2D u_src;
uniform vec3 u_thr; // threshold, knee, cap
in vec2 v_uv;
out vec4 o;
void main() {
  vec3 c = texture(u_src, v_uv).rgb;
  float l = max(c.r, max(c.g, c.b));
  float soft = clamp(l - u_thr.x + u_thr.y, 0.0, 2.0 * u_thr.y);
  soft = soft * soft / (4.0 * u_thr.y + 1e-5);
  float k = max(soft, l - u_thr.x) / max(l, 1e-5);
  o = vec4(min(c * k, vec3(u_thr.z)), 1.0);
}
`;

export const BLOOM_DOWN = `#version 300 es
precision highp float;
uniform sampler2D u_src;
uniform vec2 u_px; // one source texel
in vec2 v_uv;
out vec4 o;
vec3 t(float x, float y) { return texture(u_src, v_uv + vec2(x, y) * u_px).rgb; }
void main() {
  vec3 a = t(-2.0, -2.0), b = t(0.0, -2.0), c = t(2.0, -2.0);
  vec3 d = t(-1.0, -1.0), e = t(1.0, -1.0);
  vec3 f = t(-2.0, 0.0), g = t(0.0, 0.0), h = t(2.0, 0.0);
  vec3 i = t(-1.0, 1.0), j = t(1.0, 1.0);
  vec3 k = t(-2.0, 2.0), l = t(0.0, 2.0), m = t(2.0, 2.0);
  vec3 s = (d + e + i + j) * 0.125 + (a + b + f + g) * 0.03125 + (b + c + g + h) * 0.03125 + (f + g + k + l) * 0.03125 + (g + h + l + m) * 0.03125;
  o = vec4(s, 1.0);
}
`;

export const BLOOM_UP = `#version 300 es
precision highp float;
uniform sampler2D u_low;
uniform sampler2D u_high;
uniform vec2 u_px; // one low-level texel
uniform float u_k;
in vec2 v_uv;
out vec4 o;
vec3 t(float x, float y) { return texture(u_low, v_uv + vec2(x, y) * u_px).rgb; }
void main() {
  vec3 s = t(0.0, 0.0) * 4.0 + (t(-1.0, 0.0) + t(1.0, 0.0) + t(0.0, -1.0) + t(0.0, 1.0)) * 2.0 + t(-1.0, -1.0) + t(1.0, -1.0) + t(-1.0, 1.0) + t(1.0, 1.0);
  o = vec4(texture(u_high, v_uv).rgb + s * (u_k / 16.0), 1.0);
}
`;

/* The frame out: scene plus bloom, the live tone curve (extended Reinhard on luminance with a long shoulder and a
   little highlight desaturation), display gamma, then 10 bits a channel packed into one RGBA8 texel as ffmpeg's
   x2rgb10le (the 32-bit word (r << 20) | (g << 10) | b, little-endian). Rows are flipped so readPixels returns
   them top to bottom. u_mode 1 writes plain 8-bit RGB instead (previews). */
export const FINAL = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D u_hdr;
uniform sampler2D u_bloom;
uniform float u_gain;
uniform float u_white;
uniform float u_desat;
uniform vec2 u_size;
uniform int u_mode;
out vec4 o;
void main() {
  ivec2 ip = ivec2(gl_FragCoord.xy);
  ivec2 src = ivec2(ip.x, int(u_size.y) - 1 - ip.y);
  vec3 col = texelFetch(u_hdr, src, 0).rgb + texelFetch(u_bloom, src, 0).rgb * u_gain;
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  float lm = lum * (1.0 + lum / (u_white * u_white)) / (1.0 + lum);
  vec3 tc = col * (lm / max(lum, 1e-6));
  tc = mix(tc, vec3(lm), smoothstep(0.55, 1.0, lm) * u_desat);
  vec3 v = pow(clamp(tc, 0.0, 1.0), vec3(1.0 / 2.2));
  if (u_mode == 1) { o = vec4(v, 1.0); return; }
  uvec3 q = uvec3(v * 1023.0 + 0.5);
  uint word = (q.r << 20) | (q.g << 10) | q.b;
  o = vec4(float(word & 255u), float((word >> 8) & 255u), float((word >> 16) & 255u), float(word >> 24)) / 255.0;
}
`;
