// The Mobility card's WebGL engine: one renderer on one canvas over the sticky stage.
// Each beat (mob-light: lights in the dark, mob-moon: the range) renders into an HDR, multisampled target:
// the light the size of the card (clipped to it), the Moon the size of the whole stage (never clipped, so
// the whole sphere shows once the glass steps away). One picture at a time, except a short dissolve.
// Cost: DPR capped (1.5 desktop, 1.25 phone), bloom from a third-res bright pass, and nothing is drawn
// unless the scroll moved (mob-stage.ts asks only then; dirty() covers assets arriving). A small compositor adds a soft bloom from the
// brightest pixels only (the lights), tone-maps, and clips to the card's rounded corners (a hair inside
// them, so the glass rim stays). Premultiplied: wherever a beat leaves the picture empty the card's frosted
// glass shows through, and light adds over it. Built on first need, freed by mob-stage.ts when the section
// is far away.
import * as THREE from 'three';
import { TL, clamp, smooth } from './mob-timeline';
import { type Beat, type BeatCtx, type Frame, breathe } from './mob-kit';
import { makeLight } from './mob-light';

export type Layout = {
  w: number;
  h: number;
  card: { x: number; y: number; w: number; h: number; r: number };
};
export type Engine = {
  setSize(l: Layout): void;
  render(P: number, t: number, dt: number, pre?: number): void;
  /** an asset arrived or the size changed: draw even if the scroll did not move */
  dirty(): boolean;
  /** the last frame covered the card with the opaque light picture (its glass blur can rest) */
  covers(): boolean;
  dispose(): void;
};

const FS_TRI = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const BRIGHT_FS = /* glsl */ `
uniform sampler2D tA;
uniform float uThresh;
varying vec2 vUv;
void main() {
  vec4 c = texture2D(tA, vUv);
  // one bad pixel must never blot the card (the blur would spread it into a box)
  if (any(isnan(c)) || any(isinf(c))) c = vec4(0.0);
  float l = max(c.r, max(c.g, c.b));
  float k = smoothstep(uThresh, uThresh * 1.8 + 0.2, l);
  gl_FragColor = vec4(c.rgb * k, 1.0);
}`;

const BLUR_FS = /* glsl */ `
uniform sampler2D tMap;
uniform vec2 uDir;
varying vec2 vUv;
void main() {
  vec4 c = texture2D(tMap, vUv) * 0.2270270270;
  c += texture2D(tMap, vUv + uDir * 1.3846153846) * 0.3162162162;
  c += texture2D(tMap, vUv - uDir * 1.3846153846) * 0.3162162162;
  c += texture2D(tMap, vUv + uDir * 3.2307692308) * 0.0702702703;
  c += texture2D(tMap, vUv - uDir * 3.2307692308) * 0.0702702703;
  gl_FragColor = c;
}`;

const FINAL_FS = /* glsl */ `
uniform sampler2D tA;
uniform sampler2D tBloom1;
uniform sampler2D tBloom2;
uniform float uBloom;
uniform float uFade;
uniform vec2 uSize;
uniform float uRadius;
uniform float uInset;
varying vec2 vUv;
void main() {
  vec4 c = texture2D(tA, vUv);
  if (any(isnan(c)) || any(isinf(c))) c = vec4(0.0, 0.0, 0.0, 1.0);
  vec3 bl = texture2D(tBloom1, vUv).rgb * 0.75 + texture2D(tBloom2, vUv).rgb * 0.6;
  vec3 col = c.rgb + bl * uBloom;
  gl_FragColor = vec4(col, clamp(c.a, 0.0, 1.0));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  // the card's rounded corners, a hair inside its glass rim
  vec2 p = (vUv - 0.5) * uSize;
  float r = max(uRadius - uInset, 0.0);
  vec2 q = abs(p) - (uSize * 0.5 - uInset - r);
  float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  gl_FragColor *= clamp(0.5 - d, 0.0, 1.0) * uFade;
}`;

type SlotName = 'light' | 'moon';
type Slot = { make: (c: BeatCtx) => Promise<Beat>; beat: Beat | null; building: Promise<void> | null; win: readonly [number, number] };

export async function createEngine(canvas: HTMLCanvasElement, o: { reduced: boolean; phone: boolean; wake?: () => void }): Promise<Engine> {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, premultipliedAlpha: true, stencil: false, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  renderer.autoClear = false;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const gl = renderer.getContext();
  const half = renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float');
  const TYPE = half ? THREE.HalfFloatType : THREE.UnsignedByteType;

  let wanted = true;
  const ctx: BeatCtx = { renderer, phone: o.phone, reduced: o.reduced, invalidate: () => {
      wanted = true;
      o.wake?.();
    },
  };

  const slots: Record<SlotName, Slot> = {
    light: { make: makeLight, beat: null, building: null, win: TL.light },
    moon: { make: async () => (await import('./mob-moon')).makeMoon(ctx), beat: null, building: null, win: TL.moon },
  };
  let disposed = false;
  const frame: Frame = { W: 800, H: 600, cx: 400, cy: 300, cw: 800, ch: 600 };
  const pxCard = { w: 800, h: 600 };
  const pxStage = { w: 800, h: 600 };
  const aspectOf = (b: Beat) => (b.full ? [pxStage.w / pxStage.h, pxStage] : [pxCard.w / pxCard.h, pxCard]) as [number, { w: number; h: number }];
  const build = (name: SlotName) => {
    const s = slots[name];
    if (s.beat || s.building) return s.building;
    s.building = s
      .make(ctx)
      .then(async (b) => {
        if (disposed) return void b.dispose();
        const [a, px] = aspectOf(b);
        b.setAspect(a, px, frame);
        s.beat = b;
        try {
          await renderer.compileAsync(b.scene, b.camera);
        } catch {
          /* compiles on first use instead */
        }
        ctx.invalidate();
      })
      .catch((err) => {
        if (import.meta.env.DEV) console.error('[mob] beat', name, err);
      })
      .finally(() => (s.building = null));
    return s.building;
  };

  /* -------------------------------------------------------- targets and passes */
  const samples = o.phone ? 2 : 4;
  const mk = (ms: number, depth = true) =>
    new THREE.WebGLRenderTarget(1, 1, { type: TYPE, samples: ms, depthBuffer: depth, magFilter: THREE.LinearFilter, minFilter: THREE.LinearFilter });
  const rtCard = mk(samples);
  const rtStage = mk(samples);
  const rtBright = mk(0, false);
  const rtB1 = mk(0, false);
  const rtB2 = mk(0, false);
  const rtB3 = mk(0, false);
  const rtB4 = mk(0, false);
  const black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
  black.needsUpdate = true;

  const tri = new THREE.BufferGeometry();
  tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  tri.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
  const quad = new THREE.Mesh(tri);
  quad.frustumCulled = false;
  const qScene = new THREE.Scene();
  qScene.add(quad);
  const qCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const pass = (fs: string, uniforms: Record<string, THREE.IUniform>, toneMapped = false) =>
    new THREE.ShaderMaterial({ vertexShader: FS_TRI, fragmentShader: fs, uniforms, depthTest: false, depthWrite: false, toneMapped, transparent: false, blending: THREE.NoBlending });
  const brightM = pass(BRIGHT_FS, { tA: { value: black }, uThresh: { value: 1.1 } });
  const blurM = pass(BLUR_FS, { tMap: { value: black }, uDir: { value: new THREE.Vector2() } });
  const finalM = pass(
    FINAL_FS,
    {
      tA: { value: black },
      tBloom1: { value: black },
      tBloom2: { value: black },
      uBloom: { value: 0.9 },
      uFade: { value: 1 },
      uSize: { value: new THREE.Vector2(1, 1) },
      uRadius: { value: 0 },
      uInset: { value: 0 },
    },
    true,
  );
  // premultiplied "over": the dissolve draws the Moon over the fading light
  finalM.transparent = true;
  finalM.blending = THREE.CustomBlending;
  finalM.blendEquation = THREE.AddEquation;
  finalM.blendSrc = THREE.OneFactor;
  finalM.blendDst = THREE.OneMinusSrcAlphaFactor;
  finalM.blendSrcAlpha = THREE.OneFactor;
  finalM.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
  const runPass = (m: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null) => {
    quad.material = m;
    renderer.setRenderTarget(target);
    renderer.render(qScene, qCam);
  };

  /* -------------------------------------------------------- sizing */
  let L: Layout | null = null;
  const dprMax = o.phone ? 1.25 : 1.5;
  let dpr = 1;
  const setSize = (l: Layout) => {
    L = l;
    dpr = Math.min(devicePixelRatio || 1, dprMax);
    renderer.setPixelRatio(dpr);
    renderer.setSize(Math.max(1, Math.round(l.w)), Math.max(1, Math.round(l.h)), false);
    const cw = Math.max(2, Math.round(l.card.w * dpr));
    const ch = Math.max(2, Math.round(l.card.h * dpr));
    const sw = Math.max(2, Math.round(l.w * dpr));
    const sh = Math.max(2, Math.round(l.h * dpr));
    rtCard.setSize(cw, ch);
    rtStage.setSize(sw, sh);
    // the bloom chain at a third of the stage (the brightest pixels only; soft by nature)
    rtBright.setSize(Math.ceil(sw / 3), Math.ceil(sh / 3));
    rtB1.setSize(Math.ceil(sw / 6), Math.ceil(sh / 6));
    rtB2.setSize(Math.ceil(sw / 6), Math.ceil(sh / 6));
    rtB3.setSize(Math.ceil(sw / 12), Math.ceil(sh / 12));
    rtB4.setSize(Math.ceil(sw / 12), Math.ceil(sh / 12));
    pxCard.w = cw;
    pxCard.h = ch;
    pxStage.w = sw;
    pxStage.h = sh;
    Object.assign(frame, { W: sw, H: sh, cx: (l.card.x + l.card.w / 2) * dpr, cy: (l.card.y + l.card.h / 2) * dpr, cw, ch });
    for (const s of Object.values(slots))
      if (s.beat) {
        const [a, px] = aspectOf(s.beat);
        s.beat.setAspect(a, px, frame);
      }
    wanted = true;
  };

  /* -------------------------------------------------------- which picture: one, or a short dissolve */
  const mix = (P: number): [SlotName, number][] => {
    const [a, b] = TL.cross;
    if (P <= a) return [['light', 1]];
    if (P >= b) return [['moon', 1]];
    const k = smooth(a, b, P);
    return [
      ['light', 1 - k],
      ['moon', k],
    ];
  };
  const local = (s: Slot, P: number) => clamp((P - s.win[0]) / (s.win[1] - s.win[0]));

  /* -------------------------------------------------------- render */
  let lightOpaque = false;
  const render = (P: number, t: number, dt: number, pre = 1) => {
    if (!L || disposed || gl.isContextLost()) return;
    const parts = mix(P);
    // keep the next picture building ahead of the scroll
    for (const [n] of parts) if (!slots[n].beat) build(n);
    if (P > 0.05) build('moon');

    renderer.setRenderTarget(null);
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, L.w, L.h);
    renderer.clear(true, true, true);
    const exitFade = 1 - smooth(TL.exit[0], TL.exit[0] + 0.06, P);
    lightOpaque = false;

    for (const [n, w] of parts) {
      const s = slots[n];
      const beat = s.beat;
      if (!beat || w <= 0.001) continue;
      const full = !!beat.full;
      const rt = full ? rtStage : rtCard;
      beat.update(local(s, P), P, t, dt, pre);
      renderer.setRenderTarget(rt);
      renderer.setClearColor(0x000000, 0);
      renderer.clear(true, true, true);
      renderer.render(beat.scene, beat.camera);

      // bloom from the brightest pixels only
      brightM.uniforms.tA.value = rt.texture;
      brightM.uniforms.uThresh.value = beat.bloomThreshold ?? 1.1;
      runPass(brightM, rtBright);
      const blur = (src: THREE.WebGLRenderTarget, dst: THREE.WebGLRenderTarget, dx: number, dy: number, k: number) => {
        blurM.uniforms.tMap.value = src.texture;
        blurM.uniforms.uDir.value.set((dx * k) / src.width, (dy * k) / src.height);
        runPass(blurM, dst);
      };
      blur(rtBright, rtB1, 1, 0, 1.2);
      blur(rtB1, rtB2, 0, 1, 1.2);
      blur(rtB2, rtB3, 1, 0, 1.6);
      blur(rtB3, rtB4, 0, 1, 1.6);

      // composite: the light into the card (rounded, a hair inside its rim), the Moon over the whole stage
      finalM.uniforms.tA.value = rt.texture;
      finalM.uniforms.tBloom1.value = rtB2.texture;
      finalM.uniforms.tBloom2.value = rtB4.texture;
      finalM.uniforms.uBloom.value = beat.bloom ?? 0.9;
      finalM.uniforms.uFade.value = w * exitFade;
      renderer.toneMappingExposure = beat.exposure ?? 1;
      renderer.setRenderTarget(null);
      quad.material = finalM;
      if (full) {
        finalM.uniforms.uSize.value.set(rt.width, rt.height);
        finalM.uniforms.uRadius.value = 0;
        finalM.uniforms.uInset.value = -2;
        renderer.setViewport(0, 0, L.w, L.h);
        renderer.render(qScene, qCam);
      } else {
        const card = L.card;
        finalM.uniforms.uSize.value.set(rt.width, rt.height);
        finalM.uniforms.uRadius.value = card.r * dpr;
        finalM.uniforms.uInset.value = 1.25 * dpr;
        const yGL = L.h - card.y - card.h;
        renderer.setViewport(card.x, yGL, card.w, card.h);
        renderer.setScissor(card.x, yGL, card.w, card.h);
        renderer.setScissorTest(true);
        renderer.render(qScene, qCam);
        renderer.setScissorTest(false);
        lightOpaque = w >= 0.999 && exitFade >= 0.999;
      }
    }
    renderer.setViewport(0, 0, L.w, L.h);
    wanted = false;
  };

  // build the first picture now, the Moon in the background
  await build('light');
  (async () => {
    if (disposed) return;
    await breathe();
    await build('moon');
  })();

  if (import.meta.env.DEV) Object.assign(window, { __mobEngine: { renderer, slots, wanted: () => wanted, rts: { rtCard, rtStage, rtBright, rtB1, rtB2, rtB3, rtB4 } } });

  return {
    setSize,
    render,
    dirty: () => wanted,
    covers: () => lightOpaque,
    dispose: () => {
      disposed = true;
      for (const s of Object.values(slots)) {
        s.beat?.dispose();
        s.beat = null;
      }
      [rtCard, rtStage, rtBright, rtB1, rtB2, rtB3, rtB4].forEach((r) => r.dispose());
      [brightM, blurM, finalM].forEach((m) => m.dispose());
      tri.dispose();
      black.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
