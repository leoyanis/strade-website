// The Endless Pursuit star field drawn by the GPU: the gold wash as one textured quad, every glow in one
// instanced draw and every point in a second. The 2D renderer stamps about 2,770 sprites a frame with
// drawImage, and each call has a fixed cost in Chromium: that held the section at 60 fps on a 120 Hz screen
// and dropped nearly every frame on a phone at 4x CPU (a texture atlas and ImageBitmap sources changed
// nothing, .scratch/perf). Here a frame is one 25 KB buffer upload and three draw calls.
//
// The look is the 2D renderer's, stamp for stamp. The same sprite canvases are uploaded once into an atlas;
// each stamp covers the same rect; it is sampled the way Skia samples a drawImage at the canvas's default
// imageSmoothingQuality ('low': bilinear, no mipmaps, clamped to the sprite's edge); it is blended with the
// same premultiplied source-over. Chromium antialiases a drawImage only when its rect is under one device
// pixel across (BaseRenderingContext2D::ShouldDrawImageAntialiased), so only those stamps (dust at a DPR
// under about 1.85) weigh their pixels by coverage here; every other stamp is the plain rect.
//
// ep-stars.ts owns the simulation (where every star is, and how bright) and keeps the 2D renderer for a
// browser without WebGL and for a lost context. This file only draws what it is handed.

/** What the renderer needs once: the stars' fixed values and the sprites they are stamped with. */
export type GlStarsInit = {
  n: number;
  /** Per star, 4 floats: dot radius and glow reach (CSS px), glow strength, colour index. */
  stat: Float32Array;
  /** The sharp disc per colour (16px) and the soft glow per colour (64px), as the 2D renderer draws them. */
  dots: HTMLCanvasElement[];
  glows: HTMLCanvasElement[];
  /** The context went away: the caller draws in 2D until it comes back. */
  onLost(): void;
  /** The context is back with every resource rebuilt, except the wash, which the caller hands over again. */
  onRestored(): void;
};

export type GlStars = {
  /** Uploads the wash (drawn at the canvas's DPR). The caller may free its canvas afterwards. */
  setWash(src: HTMLCanvasElement): void;
  /**
   * One frame. `dyn` holds x and y (CSS px from the canvas's top left) and alpha per star. The wash is
   * drawn at (washX, washY) CSS px, one texel per device pixel, at `washAlpha`.
   */
  draw(dyn: Float32Array, dpr: number, washAlpha: number, washX: number, washY: number): void;
};

// Atlas layout: the three 64px glows stacked in the first column, the three 16px dots in a row under them.
const GLOW = 64;
const DOT = 16;
const ATLAS_W = GLOW;
const ATLAS_H = GLOW * 3 + DOT;

// One instance per star, one quad per instance. uGlow picks the pass: 1 stamps the glow (reach, alpha times
// the glow strength), 0 the point (radius, alpha). A stamp the 2D renderer would skip (alpha at or under its
// threshold) collapses outside the clip box. Everything the fragment shader needs is measured from the quad's
// own corner, so it stays small enough for mediump if a GPU has no highp in fragment shaders.
const STAR_VS = `
attribute vec2 aCorner;
attribute vec3 aDyn;
attribute vec4 aStat;
uniform vec2 uView;
uniform float uDpr;
uniform float uGlow;
uniform float uMin;
varying vec4 vLocal;
varying vec4 vRect;
varying vec3 vCell;
void main() {
  float r = mix(aStat.x, aStat.y, uGlow);
  float a = aDyn.z * mix(1.0, aStat.z, uGlow);
  if (a <= uMin) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    vLocal = vec4(0.0);
    vRect = vec4(0.0, 0.0, 1.0, 1.0);
    vCell = vec3(0.0, 0.0, 1.0);
    return;
  }
  vec2 lo = (aDyn.xy - r) * uDpr;
  vec2 hi = (aDyn.xy + r) * uDpr;
  // under one device pixel across, the stamp is antialiased: its quad grows to every pixel it touches
  float aa = hi.x - lo.x < 1.0 ? 1.0 : 0.0;
  vec2 qlo = aa > 0.5 ? floor(lo) : lo;
  vec2 qhi = aa > 0.5 ? ceil(hi) : hi;
  vec2 p = mix(qlo, qhi, aCorner);
  gl_Position = vec4(p.x / uView.x * 2.0 - 1.0, 1.0 - p.y / uView.y * 2.0, 0.0, 1.0);
  vLocal = vec4(p - qlo, a, aa);
  vRect = vec4(lo - qlo, hi - qlo);
  vCell = uGlow > 0.5 ? vec3(0.0, aStat.w * ${GLOW}.0, ${GLOW}.0) : vec3(aStat.w * ${DOT}.0, ${GLOW * 3}.0, ${DOT}.0);
}`;

const PRECISION = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif`;

// Samples the sprite at this pixel's centre, mapped into the stamp's rect, clamped half a texel inside the
// sprite's cell as CLAMP_TO_EDGE would clamp a texture of its own (which is what drawImage samples).
const STAR_FS = `${PRECISION}
uniform sampler2D uAtlas;
varying vec4 vLocal;
varying vec4 vRect;
varying vec3 vCell;
void main() {
  vec2 d = vLocal.xy;
  vec2 uv = (d - vRect.xy) / (vRect.zw - vRect.xy);
  vec2 t = clamp(uv * vCell.z, 0.5, vCell.z - 0.5);
  vec4 c = texture2D(uAtlas, (vCell.xy + t) / vec2(${ATLAS_W}.0, ${ATLAS_H}.0));
  float cover = 1.0;
  if (vLocal.w > 0.5) {
    vec2 k = clamp(min(vRect.zw, d + 0.5) - max(vRect.xy, d - 0.5), 0.0, 1.0);
    cover = k.x * k.y;
  }
  gl_FragColor = c * (vLocal.z * cover);
}`;

// The wash: its texture one texel per device pixel at a CSS-pixel offset, as drawImage puts it.
const WASH_VS = `
attribute vec2 aCorner;
uniform vec4 uRect;
uniform vec2 uView;
varying vec2 vUv;
void main() {
  vec2 p = uRect.xy + aCorner * uRect.zw;
  gl_Position = vec4(p.x / uView.x * 2.0 - 1.0, 1.0 - p.y / uView.y * 2.0, 0.0, 1.0);
  vUv = aCorner;
}`;

const WASH_FS = `${PRECISION}
uniform sampler2D uWash;
uniform float uAlpha;
varying vec2 vUv;
void main() {
  gl_FragColor = texture2D(uWash, vUv) * uAlpha;
}`;

/**
 * Makes the GPU renderer on `canvas`, or returns null when it cannot (no WebGL, only a software one, no
 * instancing, a shader that does not compile). A null after the context was made leaves the canvas holding
 * a WebGL context, so ep-stars.ts draws its 2D fallback on a canvas of its own. Resizing is the caller's:
 * it sets canvas.width and height and the next draw follows.
 */
export function createGlStars(canvas: HTMLCanvasElement, init: GlStarsInit): GlStars | null {
  let gl: WebGLRenderingContext | null = null;
  try {
    // premultiplied, like a 2D canvas, so the page composites it the same way. failIfMajorPerformanceCaveat:
    // a software WebGL would draw the wash quad on the CPU every frame; the 2D path is no worse there.
    gl = canvas.getContext('webgl', {
      alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false,
      preserveDrawingBuffer: false, powerPreference: 'default', failIfMajorPerformanceCaveat: true,
    });
  } catch {
    gl = null;
  }
  if (!gl || gl.isContextLost()) return null;
  const g = gl;
  const { n } = init;

  let ext: ANGLE_instanced_arrays | null = null;
  let star: WebGLProgram | null = null;
  let wash: WebGLProgram | null = null;
  let quadBuf: WebGLBuffer | null = null, statBuf: WebGLBuffer | null = null, dynBuf: WebGLBuffer | null = null;
  let atlasTex: WebGLTexture | null = null, washTex: WebGLTexture | null = null;
  let washW = 0, washH = 0;
  let lost = false;
  // uniform locations, looked up once per program
  let sView: WebGLUniformLocation | null = null, sDpr: WebGLUniformLocation | null = null;
  let sGlow: WebGLUniformLocation | null = null, sMin: WebGLUniformLocation | null = null;
  let wRect: WebGLUniformLocation | null = null, wView: WebGLUniformLocation | null = null, wAlpha: WebGLUniformLocation | null = null;

  /** Compiles and links one program with the attribute slots fixed (aCorner on 0: some drivers need 0 to be a per-vertex array). */
  function program(vs: string, fs: string): WebGLProgram | null {
    const p = g.createProgram();
    const v = g.createShader(g.VERTEX_SHADER);
    const f = g.createShader(g.FRAGMENT_SHADER);
    if (!p || !v || !f) return null;
    g.shaderSource(v, vs);
    g.compileShader(v);
    g.shaderSource(f, fs);
    g.compileShader(f);
    g.attachShader(p, v);
    g.attachShader(p, f);
    g.bindAttribLocation(p, 0, 'aCorner');
    g.bindAttribLocation(p, 1, 'aDyn');
    g.bindAttribLocation(p, 2, 'aStat');
    g.linkProgram(p);
    if (!g.getProgramParameter(p, g.LINK_STATUS)) {
      if (import.meta.env?.DEV) console.error('[ep-stars-gl]', g.getShaderInfoLog(v), g.getShaderInfoLog(f), g.getProgramInfoLog(p));
      return null;
    }
    g.deleteShader(v);
    g.deleteShader(f);
    return p;
  }

  /** A texture sampled like drawImage samples: bilinear, no mipmaps, edges clamped. */
  function texture(): WebGLTexture | null {
    const t = g.createTexture();
    g.bindTexture(g.TEXTURE_2D, t);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE);
    return t;
  }

  /** Uploads a canvas as it is stored: premultiplied (no lossy round trip through straight alpha), unflipped, unconverted. */
  function upload(t: WebGLTexture | null, src: TexImageSource) {
    g.bindTexture(g.TEXTURE_2D, t);
    g.pixelStorei(g.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    g.pixelStorei(g.UNPACK_FLIP_Y_WEBGL, false);
    g.pixelStorei(g.UNPACK_COLORSPACE_CONVERSION_WEBGL, g.NONE);
    g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, g.RGBA, g.UNSIGNED_BYTE, src);
  }

  /**
   * Every GPU resource, built at start and again after a restore (a lost context takes them all). The atlas
   * is the sprite canvases copied 1:1 at whole-pixel offsets, an exact copy, so a stamp samples the very
   * texels the 2D renderer's drawImage samples.
   */
  function setup(): boolean {
    ext = g.getExtension('ANGLE_instanced_arrays');
    if (!ext) return false;
    star = program(STAR_VS, STAR_FS);
    wash = program(WASH_VS, WASH_FS);
    if (!star || !wash) return false;
    sView = g.getUniformLocation(star, 'uView');
    sDpr = g.getUniformLocation(star, 'uDpr');
    sGlow = g.getUniformLocation(star, 'uGlow');
    sMin = g.getUniformLocation(star, 'uMin');
    wRect = g.getUniformLocation(wash, 'uRect');
    wView = g.getUniformLocation(wash, 'uView');
    wAlpha = g.getUniformLocation(wash, 'uAlpha');
    g.useProgram(star);
    g.uniform1i(g.getUniformLocation(star, 'uAtlas'), 0);
    g.useProgram(wash);
    g.uniform1i(g.getUniformLocation(wash, 'uWash'), 0);

    quadBuf = g.createBuffer();
    g.bindBuffer(g.ARRAY_BUFFER, quadBuf);
    g.bufferData(g.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), g.STATIC_DRAW);
    g.enableVertexAttribArray(0);
    g.vertexAttribPointer(0, 2, g.FLOAT, false, 0, 0);
    dynBuf = g.createBuffer();
    g.bindBuffer(g.ARRAY_BUFFER, dynBuf);
    g.bufferData(g.ARRAY_BUFFER, n * 3 * 4, g.DYNAMIC_DRAW);
    g.enableVertexAttribArray(1);
    g.vertexAttribPointer(1, 3, g.FLOAT, false, 0, 0);
    ext.vertexAttribDivisorANGLE(1, 1);
    statBuf = g.createBuffer();
    g.bindBuffer(g.ARRAY_BUFFER, statBuf);
    g.bufferData(g.ARRAY_BUFFER, init.stat, g.STATIC_DRAW);
    g.enableVertexAttribArray(2);
    g.vertexAttribPointer(2, 4, g.FLOAT, false, 0, 0);
    ext.vertexAttribDivisorANGLE(2, 1);

    const atlas = document.createElement('canvas');
    atlas.width = ATLAS_W;
    atlas.height = ATLAS_H;
    const a = atlas.getContext('2d');
    if (!a) return false;
    init.glows.forEach((c, i) => a.drawImage(c, 0, i * GLOW));
    init.dots.forEach((c, i) => a.drawImage(c, i * DOT, GLOW * 3));
    atlasTex = texture();
    upload(atlasTex, atlas);
    atlas.width = atlas.height = 0;
    washTex = texture();
    washW = washH = 0;

    // premultiplied source-over, as a 2D canvas composites every stamp
    g.enable(g.BLEND);
    g.blendFunc(g.ONE, g.ONE_MINUS_SRC_ALPHA);
    g.disable(g.DEPTH_TEST);
    g.clearColor(0, 0, 0, 0);
    return true;
  }

  if (!setup()) {
    // the canvas keeps this context whatever happens (the fallback draws on a canvas of its own), so give back
    // its drawing buffer now rather than hold it all page
    g.getExtension('WEBGL_lose_context')?.loseContext();
    return null;
  }

  // preventDefault asks the browser to restore the context; until it does, the caller draws in 2D
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    lost = true;
    init.onLost();
  });
  canvas.addEventListener('webglcontextrestored', () => {
    if (!setup()) return;
    lost = false;
    init.onRestored();
  });

  return {
    setWash(src) {
      if (lost || !src.width || !src.height) return;
      washW = src.width;
      washH = src.height;
      // A wash wider than the GPU's largest texture (only a very old one, under 4096) goes up scaled to fit
      // and is stretched back over the same rect: it is a blur, so the loss does not show.
      const max = g.getParameter(g.MAX_TEXTURE_SIZE) as number;
      if (washW > max || washH > max) {
        const k = max / Math.max(washW, washH);
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.floor(washW * k));
        c.height = Math.max(1, Math.floor(washH * k));
        c.getContext('2d')?.drawImage(src, 0, 0, c.width, c.height);
        upload(washTex, c);
        c.width = c.height = 0;
      } else upload(washTex, src);
    },
    draw(dyn, dpr, washAlpha, washX, washY) {
      if (lost) return;
      const vw = canvas.width, vh = canvas.height;
      g.viewport(0, 0, g.drawingBufferWidth, g.drawingBufferHeight);
      g.clear(g.COLOR_BUFFER_BIT);
      g.activeTexture(g.TEXTURE0);
      if (washAlpha > 0 && washW) {
        g.useProgram(wash);
        g.bindTexture(g.TEXTURE_2D, washTex);
        g.uniform4f(wRect, washX * dpr, washY * dpr, washW, washH);
        g.uniform2f(wView, vw, vh);
        g.uniform1f(wAlpha, washAlpha);
        // one instance: the per-star arrays stay enabled and simply give their first element, unused here
        ext!.drawArraysInstancedANGLE(g.TRIANGLE_STRIP, 0, 4, 1);
      }
      g.useProgram(star);
      g.bindBuffer(g.ARRAY_BUFFER, dynBuf);
      g.bufferSubData(g.ARRAY_BUFFER, 0, dyn);
      g.bindTexture(g.TEXTURE_2D, atlasTex);
      g.uniform2f(sView, vw, vh);
      g.uniform1f(sDpr, dpr);
      // glows first, then the points over them, as the 2D renderer orders its two loops
      g.uniform1f(sGlow, 1);
      g.uniform1f(sMin, 0.004);
      ext!.drawArraysInstancedANGLE(g.TRIANGLE_STRIP, 0, 4, n);
      g.uniform1f(sGlow, 0);
      g.uniform1f(sMin, 0.01);
      ext!.drawArraysInstancedANGLE(g.TRIANGLE_STRIP, 0, 4, n);
    },
  };
}
