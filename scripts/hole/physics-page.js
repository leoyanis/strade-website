// The physics check's page: runs the LIVE shader (legacy-shader.js, untouched apart from one debug exit) and reads
// back, per pixel, where its ray crosses the disc's plane, so geodesic_ref.py can compare that mapping with an
// independent geodesic integration. physics.mjs drives it; the maps are posted back as raw float32.
//
// The debug exit sits right after the shader's ray loop, before any shading: mode 1 writes the first and second
// crossing radii (-1 when the ray has no such crossing), the ray's fate (1 fell in, 2 got away, 0 ran out of
// steps) and its impact parameter; mode 2 writes both crossings' azimuths and the Doppler factor g the disc would
// be shaded with there. Derivatives stay off (HAS_DERIV unset): they only size the shading footprints.
import { VERT, FRAG, LOOK } from './legacy-shader.js';
import { VERT as VERT3, SCENE } from './shaders.js';
import { liveCamera } from './camera.js';

const DEBUG = `
#ifdef DEBUG_GEOM
  {
    float g1 = -1.0;
    float g2 = -1.0;
    if (ncross > 0.5 && r1 > 1.6) {
      float be = sqrt(0.5 / (r1 - 1.0));
      vec3 vd = vec3(-P1.z, 0.0, P1.x) / r1;
      g1 = sqrt(1.0 - 1.0 / r1) * sqrt(1.0 - be * be) / (1.0 - be * dot(vd, -D1));
    }
    if (ncross > 1.5 && r2 > 1.6) {
      float be = sqrt(0.5 / (r2 - 1.0));
      vec3 vd = vec3(-P2.z, 0.0, P2.x) / r2;
      g2 = sqrt(1.0 - 1.0 / r2) * sqrt(1.0 - be * be) / (1.0 - be * dot(vd, -D2));
    }
#if DEBUG_GEOM == 1
    gl_FragColor = vec4(ncross > 0.5 ? r1 : -1.0, ncross > 1.5 ? r2 : -1.0, captured ? 1.0 : (escaped ? 2.0 : 0.0), bimp);
#else
    gl_FragColor = vec4(ncross > 0.5 ? atan(P1.z, P1.x) : -9.0, ncross > 1.5 ? atan(P2.z, P2.x) : -9.0, g1, g2);
#endif
    return;
  }
#endif
`;

function program(gl, vs, fs) {
  const sh = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const p = gl.createProgram();
  gl.attachShader(p, sh(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
  gl.bindAttribLocation(p, 0, 'a_xy');
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  return p;
}

/**
 * Renders one debug map. view: { W, H, bw, bh, d } as liveCamera takes, plus an optional `center` override (canvas
 * px, y from the bottom) so the hole can sit mid-canvas with the live focal length and angles. Returns the
 * camera and posts the float32 RGBA map (bw x bh, rows bottom to top) to /data.
 */
window.renderDebug = async ({ name, mode, view, steps = 100, mirror = false }) => {
  const cam = liveCamera(view);
  if (view.center) cam.center = view.center;
  // mirror: every pixel traces the ray of its mirror image about the projected spin axis (the line through the
  // hole along the disc's normal as the screen shows it), so map(p) and mirrored(p) should agree exactly
  if (mirror) {
    const ax = [cam.R[1], cam.U[1]];
    const n = Math.hypot(ax[0], ax[1]);
    const [x, y] = [ax[0] / n, ax[1] / n];
    const m = [2 * x * x - 1, 2 * x * y, 2 * x * y, 2 * y * y - 1];
    const R = cam.R.map((r, i) => r * m[0] + cam.U[i] * m[2]);
    const U = cam.R.map((r, i) => r * m[1] + cam.U[i] * m[3]);
    cam.R = R;
    cam.U = U;
  }
  const [bw, bh] = [view.bw, view.bh];
  const canvas = document.createElement('canvas');
  canvas.width = bw;
  canvas.height = bh;
  const gl = canvas.getContext('webgl2', { antialias: false });
  if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('no float render targets');
  const src = FRAG.replace('  vec4 c1 = vec4(0.0);', DEBUG + '  vec4 c1 = vec4(0.0);');
  if (src === FRAG) throw new Error('debug hook not inserted');
  const p = program(gl, VERT, `#define DEBUG_GEOM ${mode}\n` + src);
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, bw, bh, 0, gl.RGBA, gl.FLOAT, null);
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.viewport(0, 0, bw, bh);
  gl.useProgram(p);
  const u = (n) => gl.getUniformLocation(p, n);
  gl.uniform2f(u('u_center'), cam.center[0], cam.center[1]);
  gl.uniform1f(u('u_focal'), cam.focal);
  gl.uniform1f(u('u_dist'), cam.dist);
  gl.uniform3fv(u('u_e1'), cam.e1);
  gl.uniform3fv(u('u_F'), cam.F);
  gl.uniform3fv(u('u_R'), cam.R);
  gl.uniform3fv(u('u_U'), cam.U);
  gl.uniform4f(u('u_flow'), 4, 12, 0.3, 0.7);
  gl.uniform1f(u('u_tw'), 12);
  gl.uniform1f(u('u_steps'), steps);
  gl.uniform1f(u('u_detail'), 5);
  gl.uniform4f(u('u_look'), LOOK.disc, LOOK.beam, LOOK.ring, LOOK.exposure);
  gl.uniform1f(u('u_bpx'), 2.598 / cam.shadowPx);
  gl.uniform1f(u('u_haze'), 0);
  gl.uniform1f(u('u_dith'), 0);
  gl.uniform4f(u('u_ringHalo'), LOOK.halo, LOOK.reach, LOOK.wide, LOOK.core);
  gl.uniform4f(u('u_tex'), LOOK.streak, LOOK.fil, LOOK.clump, LOOK.lanes);
  gl.uniform1f(u('u_shift'), LOOK.shift);
  gl.uniform1f(u('u_white'), LOOK.white);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  const px = new Float32Array(bw * bh * 4);
  gl.readPixels(0, 0, bw, bh, gl.RGBA, gl.FLOAT, px);
  await fetch(`/data?name=${name}`, { method: 'POST', body: px });
  const meta = { name, mode, view, steps, mirror, cam };
  await fetch(`/data?name=${name}_meta`, { method: 'POST', body: JSON.stringify(meta) });
  return meta;
};
/**
 * The same check for the NEW renderer's scene shader (shaders.js SCENE, offline step sizes): mode 1 writes its first,
 * second and third crossing radii (-1 when absent) and its impact parameter. Its slots go strictly by crossing
 * number (the live shader kept the last crossing in slot 2 when the first two missed the disc).
 */
window.renderDebugNew = async ({ name, view, steps = 460 }) => {
  const cam = liveCamera(view);
  const [bw, bh] = [view.bw, view.bh];
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2', { antialias: false });
  if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('no float render targets');
  const dbg = `
#ifdef DEBUG_GEOM
  o_col = vec4(ncross > 0.5 ? r1 : -1.0, ncross > 1.5 ? r2 : -1.0, ncross > 2.5 ? r3 : -1.0, bimp);
  return;
#endif
`;
  const src = SCENE.replace('  vec4 c1 = vec4(0.0);', dbg + '  vec4 c1 = vec4(0.0);');
  if (src === SCENE) throw new Error('debug hook not inserted');
  const defs = '#define DEBUG_GEOM 1\n#define LOOP 10.0\n#define PERIOD 10.0\n#define LAP 9.0\n#define HOTN 1\n#define FLICK 4.0\n#define ARMS_TURNS 1.0\n';
  const fs = src.replace(/^(#version 300 es\n)/, `$1${defs}`);
  const sh = (type, code) => {
    const o = gl.createShader(type);
    gl.shaderSource(o, code);
    gl.compileShader(o);
    if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o));
    return o;
  };
  const p = gl.createProgram();
  gl.attachShader(p, sh(gl.VERTEX_SHADER, VERT3));
  gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, bw, bh, 0, gl.RGBA, gl.FLOAT, null);
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.viewport(0, 0, bw, bh);
  gl.useProgram(p);
  const u = (n) => gl.getUniformLocation(p, n);
  gl.uniform2f(u('u_center'), cam.center[0], cam.center[1]);
  gl.uniform2f(u('u_jitter'), 0, 0);
  gl.uniform1f(u('u_focal'), cam.focal);
  gl.uniform1f(u('u_dist'), cam.dist);
  gl.uniform3fv(u('u_e1'), cam.e1);
  gl.uniform3fv(u('u_F'), cam.F);
  gl.uniform3fv(u('u_R'), cam.R);
  gl.uniform3fv(u('u_U'), cam.U);
  gl.uniform1f(u('u_steps'), steps);
  gl.uniform1f(u('u_haze'), 0);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  const px = new Float32Array(bw * bh * 4);
  gl.readPixels(0, 0, bw, bh, gl.RGBA, gl.FLOAT, px);
  await fetch(`/data?name=${name}`, { method: 'POST', body: px });
  await fetch(`/data?name=${name}_meta`, { method: 'POST', body: JSON.stringify({ name, view, steps, cam }) });
  return true;
};
window.__ready = true;
