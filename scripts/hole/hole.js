// The offline black hole renderer's page script (page.html): WebGL2, driven frame by frame by render.mjs.
//
// One frame = `samples` sub-frames summed in linear light. Each sub-frame has its own sub-pixel offset (an R2
// low-discrepancy sequence: anti-aliasing) and its own moment inside the shutter (motion blur), so the disc's
// streaks and the falling dust smear the way a camera would see them. Per sub-frame: the dust sprites go into
// three depth layers, then the ray tracer (SCENE in shaders.js) draws the disc, the sky and the photon ring and
// composites the dust between the disc's images, into the accumulator. Then a full-resolution bloom, the tone
// curve, 10-bit packing, and the frame is read back and posted to the local server, which pipes it to ffmpeg.
//
// Time: frame i shows t = i / fps, wrapped into the loop [0, LOOP). Every moving part of the scene is periodic in
// LOOP (see shaders.js), so frame LOOP * fps is frame 0 again.
import { frameCamera, liveCamera } from './camera.js';
import { buildLens, LUT_PHI, LUT_R, LUT_RMIN, LUT_RMAX } from './lens.js';
import { makeDust } from './dust.js';
import * as S from './shaders.js';

/** The look. Live values where the look is meant to stay (black-hole.ts `look`), new ones for the new parts. */
export const LOOK = {
  // live: disc gain, photon ring gain, exposure, gas glow, ring halo (strength, reach, wide, core), gas texture
  disc: 1.25, ring: 1.15, exposure: 1.35, haze: 0.12, halo: 0.22, reach: 5, wide: 0.035, core: 2.5,
  streak: 3.6, fil: 2.8, clump: 5.0, lanes: 0.88,
  // Doppler: colour T * g^shift, brightness g^(shift * beam). Live: 1.85 and 3.6 (g^6.7); here g^5.0
  shift: 1.75, beam: 2.85,
  // the photon ring's beaming: 1 +- ringRange across the ring, brightness gr^ringExp (live 0.5 and 3), colour
  ringRange: 0.36, ringExp: 2.4, ringTemp: 6200,
  // violence: eddies, rim turbulence, spiral arms, seconds per orbit at the inner edge (live 24)
  eddy: 1.0, rim: 0.7, arms: 0.0, lap: 9,
  // tone curve (live: white point 30, highlight desaturation 0.35) and bloom
  white: 30, desat: 0.3, bloomGain: 1.1, bloomThr: 0.9, bloomKnee: 0.7, bloomCap: 60, bloomSpread: 0.9,
  // stardust: gain, beaming exponent, colour shift, base temperature, heat exponent, near-camera cap, fades
  dustK: 1.0, dustGain: 0.9, dustBeam: 2.4, dustShift: 1.6, dustTemp: 6000, dustHeat: 1.3, dustNear: 3, dustIn: 0.14, dustOut: 0.06,
  stars: 1.0,
  // offline quality
  steps: 460, detail: 7, fpk: 0.55,
};

let C = null; // everything setup() makes

function compile(gl, vs, fs, defines = '') {
  const sh = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) + '\n' + src.split('\n').slice(0, 3).join('\n'));
    return s;
  };
  // #defines go right after the #version line
  const inject = (src) => src.replace(/^(#version 300 es\n)/, `$1${defines}`);
  const p = gl.createProgram();
  gl.attachShader(p, sh(gl.VERTEX_SHADER, inject(vs)));
  gl.attachShader(p, sh(gl.FRAGMENT_SHADER, inject(fs)));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(p, i);
    u[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, info.name);
  }
  return { p, u };
}

function tex(gl, w, h, internal, format, type, filter) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, null);
  return t;
}

function fbo(gl, texs) {
  const f = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, f);
  texs.forEach((t, i) => gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, t, 0));
  gl.drawBuffers(texs.map((_, i) => gl.COLOR_ATTACHMENT0 + i));
  const st = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  if (st !== gl.FRAMEBUFFER_COMPLETE) throw new Error('framebuffer incomplete ' + st);
  return f;
}

const seedOf = (k) => {
  const x = Math.sin(k * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
const mod = (a, b) => ((a % b) + b) % b;

/** Seeded hot spots: radius, start angle, birth time, life, strength, size, heat. Each lives inside the loop. */
function makeHot(n, loop, seed) {
  let s = seed;
  const R = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  const out = [];
  for (let k = 0; k < n; k++) {
    const r = 3.25 + 5.5 * R() ** 1.6;
    out.push({ r, a0: R(), t0: R() * loop, life: 1.4 + 3.2 * R(), amp: (1.6 + 3.4 * R()) * Math.min(1, 4.5 / r), wr: 0.1 + 0.22 * R(), wa: 0.006 + 0.016 * R(), heat: 0.3 + 0.7 * R() });
  }
  return out;
}

/**
 * Sets everything up for one composition. cfg: { w, h, camera: { kind: 'frame', hx, hy, shadowPx, el, az, roll } or
 * { kind: 'live', W, H, d }, loop, fps, samples, shutter, phases (advection restarts per loop), look (overrides),
 * dust (makeDust options, or false), hot (count), seed }. Returns a summary.
 */
window.holeSetup = (cfg) => {
  const look = { ...LOOK, ...(cfg.look || {}) };
  const { w: W, h: H } = cfg;
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 16;
  const gl = canvas.getContext('webgl2', { antialias: false, depth: false, stencil: false, alpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
  if (!gl) throw new Error('no WebGL2');
  if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('no float render targets');
  const floatBlend = !!gl.getExtension('EXT_float_blend');
  gl.disable(gl.DITHER);
  const cam = cfg.camera.kind === 'live'
    ? liveCamera({ W: cfg.camera.W, H: cfg.camera.H, bw: W, bh: H, d: cfg.camera.d })
    : frameCamera({ w: W, h: H, ...cfg.camera });
  const loop = cfg.loop;
  const phases = cfg.phases || 1;
  const hotN = cfg.hot ?? 14;
  const defines = [
    `#define LOOP ${loop.toFixed(4)}`,
    `#define PERIOD ${(loop / phases).toFixed(4)}`,
    `#define LAP ${look.lap.toFixed(4)}`,
    `#define HOTN ${Math.max(1, hotN)}`,
    `#define FLICK ${(cfg.flick ?? 4).toFixed(1)}`,
    `#define ARMS_TURNS ${(cfg.armsTurns ?? 1).toFixed(1)}`,
    `#define LUT_W ${LUT_PHI}`,
    `#define LUT_H ${LUT_R}`,
    `#define LOG_RMIN ${Math.log(LUT_RMIN).toFixed(8)}`,
    `#define LOG_RMAX ${Math.log(LUT_RMAX).toFixed(8)}`,
    '',
  ].join('\n');
  const P = {
    scene: compile(gl, S.VERT, S.SCENE, defines),
    dust: compile(gl, S.DUST_VS, S.DUST_FS, defines),
    pre: compile(gl, S.VERT, S.BLOOM_PRE),
    down: compile(gl, S.VERT, S.BLOOM_DOWN),
    up: compile(gl, S.VERT, S.BLOOM_UP),
    fin: compile(gl, S.VERT, S.FINAL),
  };
  // the full-screen triangle
  const tri = gl.createVertexArray();
  gl.bindVertexArray(tri);
  const tb = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, tb);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  // render targets: accumulator, three dust layers, the bloom chain, the packed output
  const accFmt = floatBlend ? gl.RGBA32F : gl.RGBA16F;
  const accTex = tex(gl, W, H, accFmt, gl.RGBA, gl.FLOAT, gl.NEAREST);
  const accFB = fbo(gl, [accTex]);
  const dustTex = [0, 1, 2].map(() => tex(gl, W, H, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.NEAREST));
  const dustFB = fbo(gl, dustTex);
  const levels = 7;
  const D = [];
  const Up = [];
  for (let i = 0; i < levels; i++) {
    const lw = Math.max(1, Math.ceil(W / 2 ** i));
    const lh = Math.max(1, Math.ceil(H / 2 ** i));
    const t = tex(gl, lw, lh, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR);
    D.push({ t, f: fbo(gl, [t]), w: lw, h: lh });
    if (i < levels - 1) {
      const t2 = tex(gl, lw, lh, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR);
      Up.push({ t: t2, f: fbo(gl, [t2]), w: lw, h: lh });
    }
  }
  const outTex = tex(gl, W, H, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.NEAREST);
  const outFB = fbo(gl, [outTex]);

  // the lens table for the dust (float32 b and slope w, read with texelFetch)
  let lut = null;
  let dust = null;
  const t0 = performance.now();
  if (cfg.dust !== false) {
    const L = buildLens(cam.dist);
    lut = tex(gl, L.width, L.height, gl.RG32F, gl.RG, gl.FLOAT, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG32F, L.width, L.height, 0, gl.RG, gl.FLOAT, L.data);
    const d = makeDust(cfg.dust || {});
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const vb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, d.data, gl.STATIC_DRAW);
    for (let a = 0; a < 4; a++) {
      gl.enableVertexAttribArray(a);
      gl.vertexAttribPointer(a, 4, gl.FLOAT, false, 64, a * 16);
    }
    gl.bindVertexArray(null);
    dust = { vao, count: d.count, streams: d.streams.length };
  }
  const tLut = performance.now() - t0;
  C = { gl, cfg, look, W, H, cam, P, tri, accTex, accFB, dustTex, dustFB, D, Up, outTex, outFB, lut, dust, loop, phases, hot: makeHot(hotN, loop, cfg.seed || 12345), buf: new Uint8Array(W * H * 4), floatBlend };
  return { W, H, cam, dust: dust && { count: dust.count, streams: dust.streams }, lutMs: Math.round(tLut), floatBlend, maxPoint: gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE)[1] };
};

/** One sub-frame at loop time t (seconds), sub-pixel offset jit, added to the accumulator with weight wt. */
function subframe(t, jit, wt, first) {
  const { gl, cam, look, W, H, P } = C;
  const loop = C.loop;
  // dust layers
  gl.bindFramebuffer(gl.FRAMEBUFFER, C.dustFB);
  gl.viewport(0, 0, W, H);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  if (C.dust) {
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    const p = P.dust;
    gl.useProgram(p.p);
    gl.uniform1f(p.u.u_time, t);
    gl.uniform3fv(p.u.u_e1, cam.e1);
    gl.uniform3fv(p.u.u_R, cam.R);
    gl.uniform3fv(p.u.u_U, cam.U);
    gl.uniform2f(p.u.u_center, cam.center[0], cam.center[1]);
    gl.uniform2f(p.u.u_jitter, jit[0], jit[1]);
    gl.uniform2f(p.u.u_size, W, H);
    gl.uniform1f(p.u.u_focal, cam.focal);
    gl.uniform1f(p.u.u_dist, cam.dist);
    // dust sizes are given in pixels for a 4K frame (shadow about 266 px); other frames scale them
    gl.uniform1f(p.u.u_pxk, cam.shadowPx / 266);
    gl.uniform4f(p.u.u_dlook, look.dustGain, look.dustBeam, look.dustShift, look.dustTemp);
    gl.uniform4f(p.u.u_dlook2, look.dustHeat, look.dustNear, look.dustIn, look.dustOut);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, C.lut);
    gl.uniform1i(p.u.u_lut, 0);
    gl.bindVertexArray(C.dust.vao);
    for (const img of [0, 1]) {
      gl.uniform1i(p.u.u_image, img);
      gl.drawArrays(gl.POINTS, 0, C.dust.count);
    }
    gl.bindVertexArray(null);
  }
  // the scene into the accumulator
  gl.bindFramebuffer(gl.FRAMEBUFFER, C.accFB);
  gl.viewport(0, 0, W, H);
  if (first) {
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE);
  const p = P.scene;
  const u = p.u;
  gl.useProgram(p.p);
  gl.uniform2f(u.u_center, cam.center[0], cam.center[1]);
  gl.uniform2f(u.u_jitter, jit[0], jit[1]);
  gl.uniform1f(u.u_focal, cam.focal);
  gl.uniform1f(u.u_dist, cam.dist);
  gl.uniform3fv(u.u_e1, cam.e1);
  gl.uniform3fv(u.u_F, cam.F);
  gl.uniform3fv(u.u_R, cam.R);
  gl.uniform3fv(u.u_U, cam.U);
  // the advection phases: PERIOD = LOOP / phases, one seed per restart slot, so the pattern repeats with the loop
  const per = loop / C.phases;
  const ph = t / per;
  const tau0 = (ph - Math.floor(ph)) * per;
  const tau1 = (ph + 0.5 - Math.floor(ph + 0.5)) * per;
  const k0 = mod(Math.floor(ph), C.phases);
  const k1 = mod(Math.floor(ph + 0.5), C.phases);
  gl.uniform4f(u.u_flow, tau0, tau1, seedOf(k0 + 1), seedOf(k1 + 101.5));
  gl.uniform1f(u.u_time, t);
  gl.uniform1f(u.u_steps, look.steps);
  gl.uniform1f(u.u_detail, look.detail);
  gl.uniform4f(u.u_look, look.disc, look.beam, look.ring, look.exposure);
  gl.uniform1f(u.u_bpx, 2.598 / cam.shadowPx);
  gl.uniform1f(u.u_haze, look.haze);
  gl.uniform4f(u.u_ringHalo, look.halo, look.reach, look.wide, look.core);
  gl.uniform4f(u.u_tex, look.streak, look.fil, look.clump, look.lanes);
  gl.uniform1f(u.u_shift, look.shift);
  gl.uniform4f(u.u_ring2, look.ringRange, look.ringExp, look.ringTemp, 0);
  gl.uniform4f(u.u_viol, look.eddy, 0, look.rim, look.arms);
  gl.uniform1f(u.u_fpk, look.fpk);
  gl.uniform1f(u.u_weight, wt);
  gl.uniform1f(u.u_stars, look.stars);
  gl.uniform1f(u.u_dustK, look.dustK);
  // hot spots now: each flares and fades inside its own window of the loop while it orbits at its Kepler rate
  const A = new Float32Array(C.hot.length * 4);
  const B = new Float32Array(C.hot.length * 4);
  C.hot.forEach((h, i) => {
    const age = mod(t - h.t0, loop);
    const on = age < h.life ? Math.sin((Math.PI * age) / h.life) ** 2 : 0;
    const om = (h.r / 3) ** -1.5 / look.lap;
    A.set([h.r, mod(h.a0 + om * age, 1), h.amp * on, age], i * 4);
    B.set([h.wr, h.wa, h.heat, 0], i * 4);
  });
  if (C.hot.length) {
    gl.uniform4fv(u.u_hotA, A);
    gl.uniform4fv(u.u_hotB, B);
  }
  for (let i = 0; i < 3; i++) {
    gl.activeTexture(gl.TEXTURE0 + i);
    gl.bindTexture(gl.TEXTURE_2D, C.dustTex[i]);
  }
  gl.uniform1i(u.u_dust0, 0);
  gl.uniform1i(u.u_dust1, 1);
  gl.uniform1i(u.u_dust2, 2);
  gl.bindVertexArray(C.tri);
  // in bands, flushed one by one, so a 4K sub-frame never holds the GPU in one long draw (other work interleaves)
  gl.enable(gl.SCISSOR_TEST);
  const band = 256;
  for (let y = 0; y < H; y += band) {
    gl.scissor(0, y, W, Math.min(band, H - y));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.flush();
  }
  gl.disable(gl.SCISSOR_TEST);
  gl.disable(gl.BLEND);
}

function pass(target, prog, setup) {
  const { gl } = C;
  gl.bindFramebuffer(gl.FRAMEBUFFER, target.f);
  gl.viewport(0, 0, target.w, target.h);
  gl.useProgram(prog.p);
  setup(prog.u);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

function bloomAndOut(mode) {
  const { gl, look, D, Up, W, H } = C;
  gl.disable(gl.BLEND);
  gl.bindVertexArray(C.tri);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, C.accTex);
  pass(D[0], C.P.pre, (u) => {
    gl.uniform1i(u.u_src, 0);
    gl.uniform3f(u.u_thr, look.bloomThr, look.bloomKnee, look.bloomCap);
  });
  for (let i = 1; i < D.length; i++) {
    gl.bindTexture(gl.TEXTURE_2D, D[i - 1].t);
    pass(D[i], C.P.down, (u) => {
      gl.uniform1i(u.u_src, 0);
      gl.uniform2f(u.u_px, 1 / D[i - 1].w, 1 / D[i - 1].h);
    });
  }
  for (let i = Up.length - 1; i >= 0; i--) {
    const low = i === Up.length - 1 ? D[i + 1] : Up[i + 1];
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, low.t);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, D[i].t);
    pass(Up[i], C.P.up, (u) => {
      gl.uniform1i(u.u_low, 0);
      gl.uniform1i(u.u_high, 1);
      gl.uniform2f(u.u_px, 1 / low.w, 1 / low.h);
      gl.uniform1f(u.u_k, look.bloomSpread);
    });
  }
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, C.accTex);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, Up[0].t);
  pass({ f: C.outFB, w: W, h: H }, C.P.fin, (u) => {
    gl.uniform1i(u.u_hdr, 0);
    gl.uniform1i(u.u_bloom, 1);
    gl.uniform1f(u.u_gain, look.bloomGain);
    gl.uniform1f(u.u_white, look.white);
    gl.uniform1f(u.u_desat, look.desat);
    gl.uniform2f(u.u_size, W, H);
    gl.uniform1i(u.u_mode, mode);
  });
  gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, C.buf);
}

/**
 * Renders frame i (loop time i / fps) and posts it to /frame?i=i (packed 10-bit, or 8-bit RGBA with mode 1).
 * opts: { samples, post, mode, tag }. Returns { ms }.
 */
window.holeFrame = async (i, opts = {}) => {
  const t0 = performance.now();
  const { cfg } = C;
  const n = opts.samples || cfg.samples || 8;
  const shutter = cfg.shutter ?? 0.5;
  // a multiplier coprime with n scrambles the shutter order (so neighbouring sub-pixel offsets get far-apart moments)
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  C.mul = [7, 5, 11, 13, 3].find((m) => gcd(m, n) === 1) || 1;
  for (let s = 0; s < n; s++) {
    // R2 sequence for the sub-pixel offsets; the shutter moments evenly spaced, in a scrambled order
    const jit = [((0.5 + (s + 1) * 0.7548776662466927) % 1) - 0.5, ((0.5 + (s + 1) * 0.5698402909980532) % 1) - 0.5];
    const ts = (((s * C.mul) % n) + 0.5) / n - 0.5;
    const t = mod((i + shutter * ts) / cfg.fps, C.loop);
    subframe(t, jit, 1 / n, s === 0);
  }
  bloomAndOut(opts.mode || 0);
  if (opts.post !== false) {
    const q = new URLSearchParams({ i: String(i), w: String(C.W), h: String(C.H), mode: String(opts.mode || 0), tag: opts.tag || '' });
    const r = await fetch(`/frame?${q}`, { method: 'POST', body: C.buf });
    if (!r.ok) throw new Error('post failed: ' + (await r.text()));
  }
  return { ms: Math.round(performance.now() - t0) };
};

window.__ready = true;
