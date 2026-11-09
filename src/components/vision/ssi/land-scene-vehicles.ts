// Vehicles: the Moon's surface under a low sun from the top right, the Earth above the horizon,
// and long-exposure light trails of the four vehicles driving across it.
// - The ground is real geometry (three.js, loaded lazily): grey regolith, gentle undulation, a power-law
//   spread of craters (bowl, raised rim, ejecta; a few fresh bright ones), scattered rocks, long soft
//   shadows from a static shadow map, the Moon's curvature, and a very faint survey grid.
// - The Earth is a sphere at "infinity": day map on the lit side, city lights on the night side, a thin
//   atmosphere rim; it turns as you scroll. Maps: public/images/ssi/earth-day.jpg and earth-night.jpg,
//   passed in by ssi.astro only when the files exist; otherwise a procedural Earth is drawn.
// - One WebGL renderer, created on first need and only rendered while the section is on screen (the scene
//   engine only calls draw then). Each frame it renders, the picture is copied into the section's 2D
//   canvas, and the light trails are drawn on top in 2D with the same camera.
// Each product is one kind of trail: Star Car (fast twin tracks), Tourer (slow, far, the Earth rises),
// Hauler (a convoy), Kite (airborne, its shadow on the ground, the page's tiny cyan nav light).
import type * as Three from 'three';
import { type SceneFactory, clamp, smooth, near, fbm, rng, glow, CYAN } from './land-util';

const SCROLL_RUN = 24; // how far the camera dollies over the pinned scroll
const DFAR = 430; // ground extends this far ahead
const CURVE_R = 3400; // the Moon's curvature (scaled so the horizon sits close, as it does there)
const SUN = { x: 0.8, y: 0.13, z: -0.58 }; // towards the sun: right, low, a little ahead → top right
const WARM = '255,246,232';

/* ------------------------------------------------------------------ the ground (pure math) */
type Crater = { x: number; z: number; r: number; depth: number; rim: number; fresh: number };
const CELL = 16;
const halfW = (d: number) => 34 + 1.08 * Math.max(0, d);

function makeGround(seed: number) {
  const R = rng(seed);
  const grid = new Map<number, Crater[]>();
  const key = (i: number, j: number) => (i + 2048) * 8192 + (j + 2048);
  const add = (c: Crater) => {
    const reach = c.r * 2.3;
    for (let i = Math.floor((c.x - reach) / CELL); i <= Math.floor((c.x + reach) / CELL); i++)
      for (let j = Math.floor((c.z - reach) / CELL); j <= Math.floor((c.z + reach) / CELL); j++) {
        const k = key(i, j);
        const l = grid.get(k);
        if (l) l.push(c);
        else grid.set(k, [c]);
      }
  };
  const scatter = (count: number, rMin: number, rMax: number, dMax: number, skew: number) => {
    for (let k = 0; k < count; k++) {
      const r = rMin * Math.pow(rMax / rMin, Math.pow(R(), skew));
      const d = -6 + (dMax + 6) * Math.sqrt(R());
      const x = (R() * 2 - 1) * halfW(d);
      // keep the big bowls off the camera's own path
      if (r > 7 && Math.abs(x) < 24 + r && d < 55 + r) continue;
      const fresh = R() < 0.22 ? 0.6 + 0.4 * R() : 0;
      add({ x, z: -d, r, depth: r * (0.17 + 0.06 * R()), rim: r * (0.045 + 0.025 * R()), fresh });
    }
  };
  scatter(9, 16, 42, DFAR, 1);
  scatter(110, 4, 15, 320, 1.6);
  scatter(1300, 0.5, 3.6, 150, 2.2);

  const E3 = Math.pow(1 / 2.3, 3);
  const out = { h: 0, a: 1 };
  /** Height and albedo at (x, z). */
  const at = (x: number, z: number) => {
    let h = 3.4 * (fbm(x * 0.011 + 11, z * 0.011 + 3, 5, 7) - 0.5) + 0.55 * (fbm(x * 0.075, z * 0.075, 3, 3) - 0.5);
    h -= (x * x + z * z) / (2 * CURVE_R);
    let a = 0.9 + 0.32 * (fbm(x * 0.0065 + 40, z * 0.0065, 4, 21) - 0.5) + 0.08 * (fbm(x * 0.06, z * 0.06, 2, 9) - 0.5);
    const l = grid.get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
    if (l)
      for (const c of l) {
        const dx = x - c.x;
        const dz = z - c.z;
        const d2 = dx * dx + dz * dz;
        const lim = c.r * 2.3;
        if (d2 > lim * lim) continue;
        const q = Math.sqrt(d2) / c.r;
        if (q < 1) h += c.rim - (c.depth + c.rim) * (1 - q * q) * (1 - 0.25 * q * q);
        else {
          const iq = 1 / q;
          h += (c.rim * (iq * iq * iq - E3)) / (1 - E3);
        }
        if (c.fresh) a += 0.32 * c.fresh * (1 - smooth(0.6, 2.1, q));
      }
    out.h = h;
    out.a = a;
    return out;
  };
  const H = (x: number, z: number) => at(x, z).h;
  /** The rolling ground without craters (the camera rides this, so it doesn't bob over small craters). */
  const base = (x: number, z: number) => 3.4 * (fbm(x * 0.011 + 11, z * 0.011 + 3, 5, 7) - 0.5) - (x * x + z * z) / (2 * CURVE_R);
  return { at, H, base, R };
}

/* ------------------------------------------------------------------ regolith detail (tileable) */
function regolithCanvas(seed: number) {
  const N = 256;
  const R = rng(seed);
  const hgt = new Float32Array(N * N);
  const hash = (i: number, j: number, s: number) => {
    let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(s, 1442695041)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const vnoise = (x: number, y: number, per: number, s: number) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);
    const m = (v: number) => ((v % per) + per) % per;
    const a = hash(m(ix), m(iy), s);
    const b = hash(m(ix + 1), m(iy), s);
    const c = hash(m(ix), m(iy + 1), s);
    const d = hash(m(ix + 1), m(iy + 1), s);
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  };
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      let v = 0;
      let amp = 0.5;
      for (let o = 0, per = 8; o < 5; o++, per *= 2, amp *= 0.55) v += amp * vnoise((x / N) * per, (y / N) * per, per, o * 31 + 7);
      hgt[y * N + x] = v;
    }
  // craterlets, wrapping around the tile edges
  for (let k = 0; k < 140; k++) {
    const cx = R() * N;
    const cy = R() * N;
    const r = 1.5 + 9 * Math.pow(R(), 2.4);
    const reach = Math.ceil(r * 2);
    for (let j = -reach; j <= reach; j++)
      for (let i = -reach; i <= reach; i++) {
        const q = Math.hypot(i, j) / r;
        if (q > 2) continue;
        const dh = q < 1 ? -0.35 * (1 - q * q) + 0.08 : 0.08 * Math.max(0, 1 - (q - 1));
        const px = (((Math.floor(cx) + i) % N) + N) % N;
        const py = (((Math.floor(cy) + j) % N) + N) % N;
        hgt[py * N + px] += dh * Math.min(1, r / 5);
      }
  }
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of hgt) {
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  const cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const c2 = cv.getContext('2d')!;
  const img = c2.createImageData(N, N);
  for (let i = 0; i < N * N; i++) {
    const g = Math.round(((hgt[i] - lo) / (hi - lo)) * 255);
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = g;
    img.data[i * 4 + 3] = 255;
  }
  c2.putImageData(img, 0, 0);
  return cv;
}

/* ------------------------------------------------------------------ the Earth */
const EARTH_VS = /* glsl */ `
varying vec3 vN;
varying vec3 vV;
varying vec3 vObj;
varying vec2 vUv;
void main() {
  vObj = position;
  vUv = uv;
  vN = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const NOISE = /* glsl */ `
float h3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float n3(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fb(vec3 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 6; i++) { s += a * n3(p); p *= 2.03; a *= 0.5; } return s; }`;
const EARTH_FS = /* glsl */ `
uniform sampler2D uDay;
uniform sampler2D uNight;
uniform float uHasDay;
uniform float uHasNight;
uniform vec3 uL;
varying vec3 vN;
varying vec3 vV;
varying vec3 vObj;
varying vec2 vUv;
${NOISE}
void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(vV);
  vec3 L = normalize(uL);
  float ndl = dot(N, L);
  vec3 p = normalize(vObj);

  // procedural stand-in (used only when the maps are missing)
  float c = fb(p * 2.1 + 3.7) + 0.08 * fb(p * 9.0);
  float land = smoothstep(0.515, 0.535, c);
  float lat = abs(p.y);
  vec3 ocean = mix(vec3(0.010, 0.035, 0.085), vec3(0.02, 0.07, 0.14), smoothstep(0.42, 0.51, c));
  vec3 ground = mix(vec3(0.07, 0.10, 0.045), vec3(0.32, 0.26, 0.16), smoothstep(0.45, 0.62, fb(p * 3.0 + 9.0) + 0.25 * (1.0 - lat)));
  vec3 alb = mix(ocean, ground, land);
  alb = mix(alb, vec3(0.85), smoothstep(0.8, 0.9, lat + 0.06 * fb(p * 12.0)));
  float cl = smoothstep(0.5, 0.72, fb(p * 3.3 + vec3(5.0, 1.0, 2.0)) + 0.05 * sin(p.y * 18.0));
  alb = mix(alb, vec3(0.92), cl * 0.85);
  float oceanMask = (1.0 - land) * (1.0 - cl);
  vec3 lights = vec3(1.0, 0.78, 0.5) * smoothstep(0.62, 0.8, n3(p * 140.0)) * land * smoothstep(0.55, 0.7, fb(p * 7.0)) * (1.0 - smoothstep(0.7, 0.85, lat));

  if (uHasDay > 0.5) {
    alb = texture2D(uDay, vUv).rgb;
    oceanMask = smoothstep(0.02, 0.08, alb.b - max(alb.r, alb.g) * 0.85);
  }
  if (uHasNight > 0.5) {
    vec3 nt = texture2D(uNight, vUv).rgb;
    lights = vec3(1.0, 0.8, 0.55) * smoothstep(0.08, 0.6, dot(nt, vec3(0.3333)));
  }

  float day = max(ndl, 0.0);
  vec3 col = alb * (day * 1.35 + 0.004);
  // sun glint on the oceans
  vec3 H = normalize(L + V);
  col += vec3(1.0, 0.95, 0.85) * pow(max(dot(N, H), 0.0), 60.0) * oceanMask * day * 0.5;
  // city lights on the night side
  col += lights * (1.0 - smoothstep(-0.18, 0.04, ndl)) * 0.75;
  // thin atmosphere: a fresnel rim on the lit side, a blue haze over the day
  float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  float sunSide = smoothstep(-0.25, 0.45, ndl);
  col = mix(col, vec3(0.30, 0.52, 0.95) * (0.2 + day), fres * sunSide * 0.85);
  col += vec3(0.04, 0.08, 0.16) * day * 0.6;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
const HALO_FS = /* glsl */ `
uniform vec3 uL;
varying vec3 vN;
varying vec3 vV;
void main() {
  vec3 N = normalize(vN);
  // back faces of a slightly larger shell: brightest against the planet's limb, gone at the shell's edge
  float edge = smoothstep(0.0, 0.23, -dot(N, normalize(vV)));
  float sunSide = smoothstep(-0.3, 0.6, dot(N, normalize(uL)));
  float a = edge * edge * sunSide;
  gl_FragColor = vec4(vec3(0.42, 0.66, 1.0) * a * 0.6, 1.0);
  #include <colorspace_fragment>
}`;

/* ------------------------------------------------------------------ the scene */
type P3 = { x: number; y: number; z: number };
type Out = { x: number; y: number; d: number };

export const vehicles: SceneFactory = (ctx, o) => {
  let w = 1;
  let h = 1;
  const ground = makeGround(17);
  const { H, base } = ground;
  const dayUrl = o.el.dataset.earthDay;
  const nightUrl = o.el.dataset.earthNight;

  let T: typeof Three | null = null;
  let camera: Three.PerspectiveCamera | null = null;
  let renderer: Three.WebGLRenderer | null = null;
  let scene: Three.Scene | null = null;
  let earth: Three.Group | null = null;
  let earthSpin: Three.Object3D | null = null;
  let glFailed = false;
  let readyAt = 0;
  let preparing = false;
  const fov = o.phone ? 46 : 33;

  /* ---------- build (lazy, once) ---------- */
  const build = (THREE: typeof Three) => {
    T = THREE;
    camera = new THREE.PerspectiveCamera(fov, w / h, 0.3, 2400);
    camera.rotation.order = 'YXZ';
    scene = new THREE.Scene();

    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.NeutralToneMapping;
      renderer.toneMappingExposure = 1;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFShadowMap;
      renderer.shadowMap.autoUpdate = false; // the sun and ground never move: draw the shadows once
    } catch (err) {
      if (import.meta.env.DEV) console.warn('[ssi] vehicles: no WebGL, trails only', err);
      renderer = null;
      glFailed = true;
    }

    // ground mesh: rows packed densely near the lens, widening with distance
    const NR = o.phone ? 220 : 320;
    const NC = o.phone ? 200 : 290;
    const pos = new Float32Array((NR + 1) * (NC + 1) * 3);
    const col = new Float32Array((NR + 1) * (NC + 1) * 3);
    const uv = new Float32Array((NR + 1) * (NC + 1) * 2);
    let vi = 0;
    for (let i = 0; i <= NR; i++) {
      const u = i / NR;
      const d = -10 + (DFAR + 10) * Math.pow(u, 2.05);
      const hw = halfW(d);
      for (let j = 0; j <= NC; j++) {
        const x = (j / NC) * 2 * hw - hw;
        const z = -d;
        const g = ground.at(x, z);
        pos[vi * 3] = x;
        pos[vi * 3 + 1] = g.h;
        pos[vi * 3 + 2] = z;
        const a = clamp(g.a, 0.55, 1.5);
        col[vi * 3] = a * 1.0;
        col[vi * 3 + 1] = a * 0.995;
        col[vi * 3 + 2] = a * 0.985;
        uv[vi * 2] = x / 4.5;
        uv[vi * 2 + 1] = z / 4.5;
        vi++;
      }
    }
    const idx = new Uint32Array(NR * NC * 6);
    let ii = 0;
    for (let i = 0; i < NR; i++)
      for (let j = 0; j < NC; j++) {
        const a = i * (NC + 1) + j;
        const b = a + NC + 1;
        // counter-clockwise seen from above, so the faces (and normals) point up
        idx[ii++] = a;
        idx[ii++] = a + 1;
        idx[ii++] = b;
        idx[ii++] = a + 1;
        idx[ii++] = b + 1;
        idx[ii++] = b;
      }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeVertexNormals();

    const bump = new THREE.CanvasTexture(regolithCanvas(5));
    bump.wrapS = bump.wrapT = THREE.RepeatWrapping;
    bump.anisotropy = renderer ? Math.min(8, renderer.capabilities.getMaxAnisotropy()) : 1;
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x8e8d8a,
      vertexColors: true,
      roughness: 1,
      metalness: 0,
      bumpMap: bump,
      bumpScale: 2.4,
    });
    // a very faint survey grid over the real surface, fading out with distance
    groundMat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWp;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvWp = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWp;')
        .replace(
          '#include <opaque_fragment>',
          `#include <opaque_fragment>
          {
            vec2 g = vWp.xz / 12.0;
            vec2 fw = fwidth(g);
            vec2 l = abs(fract(g - 0.5) - 0.5) / max(fw, vec2(1e-4));
            float line = 1.0 - min(min(l.x, l.y), 1.0);
            float dist = length(vWp.xz - cameraPosition.xz);
            float fade = smoothstep(190.0, 25.0, dist) * (1.0 - smoothstep(0.06, 0.35, max(fw.x, fw.y)));
            gl_FragColor.rgb += vec3(0.0075) * line * fade;
          }`,
        );
    };
    const groundMesh = new THREE.Mesh(geo, groundMat);
    groundMesh.receiveShadow = true;
    groundMesh.castShadow = true;
    scene.add(groundMesh);

    // rocks: one lumpy shape, many sizes, mostly small, a few boulders
    const rockGeo = new THREE.IcosahedronGeometry(1, 1);
    const rp = rockGeo.attributes.position as Three.BufferAttribute;
    for (let k = 0; k < rp.count; k++) {
      const x = rp.getX(k);
      const y = rp.getY(k);
      const z = rp.getZ(k);
      const n = 0.72 + 0.5 * fbm(x * 1.7 + 4, z * 1.7 + y * 1.3, 2, 11);
      rp.setXYZ(k, x * n, y * n * (y < 0 ? 0.35 : 0.7), z * n);
    }
    rockGeo.computeVertexNormals();
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x8a8782, roughness: 0.96, metalness: 0, flatShading: true });
    const RN = o.phone ? 650 : 1200;
    const rocks = new THREE.InstancedMesh(rockGeo, rockMat, RN);
    const R = rng(23);
    const m4 = new THREE.Matrix4();
    const qt = new THREE.Quaternion();
    const eu = new THREE.Euler();
    const sc = new THREE.Vector3();
    const ps = new THREE.Vector3();
    for (let k = 0; k < RN; k++) {
      const d = 2 + 150 * Math.pow(R(), 1.7);
      const x = (R() * 2 - 1) * halfW(d) * 0.9;
      const big = R() < 0.03;
      const s = big ? 0.7 + 1.3 * R() : 0.06 + 0.42 * Math.pow(R(), 3);
      sc.set(s * (0.8 + 0.5 * R()), s * (0.6 + 0.5 * R()), s * (0.8 + 0.5 * R()));
      eu.set(R() * 0.4, R() * Math.PI * 2, R() * 0.4);
      qt.setFromEuler(eu);
      ps.set(x, H(x, -d) - 0.12 * sc.y, -d);
      m4.compose(ps, qt, sc);
      rocks.setMatrixAt(k, m4);
    }
    rocks.castShadow = true;
    rocks.receiveShadow = true;
    scene.add(rocks);

    // the sun: low, from the top right; a whisper of earthshine fills the shadows
    const sun = new THREE.DirectionalLight(0xfffaf3, 3.6);
    const sd = new THREE.Vector3(SUN.x, SUN.y, SUN.z).normalize();
    sun.target.position.set(0, 0, -95);
    sun.position.copy(sun.target.position).addScaledVector(sd, 420);
    sun.castShadow = true;
    const SM = o.phone ? 2048 : 4096;
    sun.shadow.mapSize.set(SM, SM);
    const sc2 = sun.shadow.camera;
    sc2.left = -150;
    sc2.right = 150;
    sc2.top = 120;
    sc2.bottom = -120;
    sc2.near = 200;
    sc2.far = 700;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.06;
    sun.shadow.radius = 3;
    scene.add(sun, sun.target);
    scene.add(new THREE.AmbientLight(0xbfcbe0, 0.03));

    // the Earth
    const loader = new THREE.TextureLoader();
    const uni = {
      uDay: { value: null as Three.Texture | null },
      uNight: { value: null as Three.Texture | null },
      uHasDay: { value: 0 },
      uHasNight: { value: 0 },
      uL: { value: new THREE.Vector3(0.62, 0.52, 0.34).normalize() },
    };
    const take = (url: string | undefined, slot: 'uDay' | 'uNight', flag: 'uHasDay' | 'uHasNight') => {
      if (!url) return;
      loader.load(
        url,
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.anisotropy = 4;
          uni[slot].value = tex;
          uni[flag].value = 1;
          o.invalidate();
        },
        undefined,
        () => {},
      );
    };
    take(dayUrl, 'uDay', 'uHasDay');
    take(nightUrl, 'uNight', 'uHasNight');
    earth = new THREE.Group();
    earth.rotation.z = 0.41; // axial tilt
    earthSpin = new THREE.Group();
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(1, 96, 64),
      new THREE.ShaderMaterial({ uniforms: uni, vertexShader: EARTH_VS, fragmentShader: EARTH_FS }),
    );
    earthSpin.add(sphere);
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(1.028, 64, 48),
      new THREE.ShaderMaterial({
        uniforms: { uL: uni.uL },
        vertexShader: EARTH_VS,
        fragmentShader: HALO_FS,
        side: THREE.BackSide,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    earth.add(earthSpin, halo);
    scene.add(earth);

    if (renderer) renderer.shadowMap.needsUpdate = true;
    sizeGL();
    readyAt = performance.now();
    o.invalidate();
  };

  const prepare = () => {
    if (preparing) return;
    preparing = true;
    import('three')
      .then((THREE) => build(THREE))
      .catch((err) => {
        glFailed = true;
        if (import.meta.env.DEV) console.error('[ssi] vehicles', err);
      });
  };
  // get ready once the hero intro is over, or as soon as the section is drawn
  const ric = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
  setTimeout(() => (ric ? ric(prepare, { timeout: 2500 }) : prepare()), 6500);

  const sizeGL = () => {
    if (!camera) return;
    camera.aspect = w / h;
    // put the vanishing point where the composition wants it (left of the text on desktop)
    const dx = o.phone ? 0 : w * 0.13;
    const dy = h * (o.phone ? 0.1 : 0.06);
    camera.setViewOffset(w, h, dx, dy, w, h);
    camera.updateProjectionMatrix();
    if (renderer) {
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, o.phone ? 2 : 1.5));
      renderer.setSize(w, h, false);
    }
  };

  /* ---------- projection for the 2D trails (same camera) ---------- */
  let V: Three.Vector3 | null = null;
  const proj = (x: number, y: number, z: number, out: Out) => {
    if (!camera || !T) return false;
    V ??= new T.Vector3();
    V.set(x, y, z).applyMatrix4(camera.matrixWorldInverse);
    if (-V.z < 0.5) return false;
    out.d = -V.z;
    V.applyMatrix4(camera.projectionMatrix);
    out.x = ((V.x + 1) / 2) * w;
    out.y = ((1 - V.y) / 2) * h;
    return true;
  };

  /* ---------- the four vehicles: loops around the ground ahead (z is negative ahead) ---------- */
  let ahead = 0; // the loops travel with the camera's dolly
  const paths: ((s: number, q: P3) => void)[] = [
    // Star Car: fast figure-eights
    (s, q) => {
      q.x = 15 * Math.sin(0.34 * s) + 3 * Math.sin(0.9 * s + 1);
      q.z = -(ahead + 34 + 9 * Math.sin(0.68 * s + 0.4));
      q.y = H(q.x, q.z) + 0.35;
    },
    // Tourer: slow, along the far ground
    (s, q) => {
      q.x = -14 + 17 * Math.sin(0.11 * s + 0.6);
      q.z = -(ahead + 58 + 7 * Math.cos(0.11 * s));
      q.y = H(q.x, q.z) + 0.4;
    },
    // Hauler: heavy and steady
    (s, q) => {
      q.x = 3 + 24 * Math.sin(0.065 * s + 2.1);
      q.z = -(ahead + 24 + 6 * Math.sin(0.13 * s + 2));
      q.y = H(q.x, q.z) + 0.5;
    },
    // Kite: loops in the air
    (s, q) => {
      q.x = -7 + 12 * Math.sin(0.38 * s);
      q.z = -(ahead + 48 + 9 * Math.sin(0.52 * s + 1));
      q.y = H(q.x, q.z) + 3 + 0.8 * Math.sin(1.3 * s);
    },
  ];
  const TRAIL = [3.4, 8, 5.5, 2.8]; // seconds of exposure
  const CAMX = [0, -9, 4, -4];
  const A: Out = { x: 0, y: 0, d: 0 };
  const B: Out = { x: 0, y: 0, d: 0 };
  const Q: P3 = { x: 0, y: 0, z: 0 };
  const Rr: P3 = { x: 0, y: 0, z: 0 };
  const sunLen = Math.hypot(SUN.x, SUN.z);
  const sunTan = SUN.y / sunLen;

  const pool = (x: number, y: number, rx: number, a: number) => {
    // light thrown on the ground: a flattened glow
    if (a <= 0.002) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, 0.32);
    glow(ctx, 0, 0, rx, a, WARM);
    ctx.restore();
  };

  const trail = (i: number, t: number, e: number, lag = 0, wide = 0.5) => {
    const dur = TRAIL[i];
    const N = 70;
    const path = paths[i];
    const a0 = 0.2 + 0.8 * e;
    for (const side of i === 3 ? [0] : [-1, 1]) {
      let has = false;
      let lx = 0;
      let ly = 0;
      for (let k = 0; k <= N; k++) {
        const s = t - lag - (k / N) * dur;
        path(s, Q);
        path(s - 0.04, Rr);
        const dx = Q.x - Rr.x;
        const dz = Q.z - Rr.z;
        const L = Math.hypot(dx, dz) || 1;
        const ox = (-dz / L) * wide * side;
        const oz = (dx / L) * wide * side;
        if (!proj(Q.x + ox, Q.y, Q.z + oz, A)) {
          has = false;
          continue;
        }
        if (has && !(i === 3 && k % 3 === 2)) {
          const fade = (1 - k / N) ** 1.7;
          const lw = clamp((h * 0.11) / A.d, 0.5, 3.2);
          ctx.strokeStyle = `rgba(${WARM},${(a0 * fade).toFixed(3)})`;
          ctx.lineWidth = lw;
          ctx.beginPath();
          ctx.moveTo(lx, ly);
          ctx.lineTo(A.x, A.y);
          ctx.stroke();
          if (k < N * 0.6) {
            ctx.strokeStyle = `rgba(${WARM},${(a0 * fade * 0.07).toFixed(3)})`;
            ctx.lineWidth = lw * 7;
            ctx.stroke();
          }
        }
        lx = A.x;
        ly = A.y;
        has = true;
      }
    }
    // the vehicle itself: lamps, and the light it throws on the ground ahead
    path(t - lag, Q);
    path(t - lag - 0.05, Rr);
    if (proj(Q.x, Q.y, Q.z, A)) {
      const rr = clamp((h * 1.6) / A.d, 3, 46);
      glow(ctx, A.x, A.y, rr * 2.4, 0.16 * a0, WARM);
      glow(ctx, A.x, A.y, rr, 0.85 * a0, WARM);
      ctx.fillStyle = `rgba(255,255,255,${a0})`;
      ctx.beginPath();
      ctx.arc(A.x, A.y, clamp(rr * 0.09, 0.8, 2.6), 0, Math.PI * 2);
      ctx.fill();
      if (i === 3) {
        const blink = Math.sin(t * 5.2) > 0.7 ? 1 : 0;
        glow(ctx, A.x + rr * 0.35, A.y - rr * 0.1, rr * 0.5, 0.9 * blink * a0, CYAN);
        // its down-light on the ground right below
        if (proj(Q.x, H(Q.x, Q.z) + 0.05, Q.z, B)) pool(B.x, B.y, clamp((h * 4) / B.d, 6, 90), 0.1 * a0);
      } else {
        const dx = Q.x - Rr.x;
        const dz = Q.z - Rr.z;
        const L = Math.hypot(dx, dz) || 1;
        const fx = Q.x + (dx / L) * 4;
        const fz = Q.z + (dz / L) * 4;
        if (proj(fx, H(fx, fz) + 0.05, fz, B)) pool(B.x, B.y, clamp((h * 6) / B.d, 8, 140), 0.12 * a0);
      }
    }
  };

  /** The Kite's shadow, cast by the same low sun (drawn before the additive light). */
  const kiteShadow = (t: number, e: number) => {
    paths[3](t, Q);
    const g = H(Q.x, Q.z);
    const run = (Q.y - g) / sunTan; // how far the shadow falls from the drone's foot
    const sx = Q.x - (SUN.x / sunLen) * run;
    const sz = Q.z - (SUN.z / sunLen) * run;
    if (!proj(sx, H(sx, sz) + 0.05, sz, B)) return;
    const rr = clamp((h * 1.1) / B.d, 2, 30);
    ctx.fillStyle = `rgba(0,0,0,${(0.35 + 0.35 * e).toFixed(3)})`;
    ctx.beginPath();
    ctx.ellipse(B.x, B.y, rr, rr * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
  };

  const placeEarth = (e1: number, p: number, t: number) => {
    if (!earth || !camera || !T || !earthSpin) return;
    const rpx = Math.min(w, h) * (o.phone ? 0.11 : 0.088);
    const ex = o.phone ? w * 0.3 : w * 0.21;
    const ey = h * (o.phone ? 0.2 : 0.29) - h * 0.07 * e1;
    const dir = new T.Vector3((ex / w) * 2 - 1, 1 - (ey / h) * 2, 0.5).unproject(camera).sub(camera.position).normalize();
    const D = 1500;
    earth.position.copy(camera.position).addScaledVector(dir, D);
    const r = D * (rpx / (h / 2)) * Math.tan(T.MathUtils.degToRad(fov / 2));
    earth.scale.setScalar(r);
    earthSpin.rotation.y = -1.9 + p * 3.4 + t * 0.006;
  };

  return {
    resize(W, Hh) {
      w = W;
      h = Hh;
      sizeGL();
    },
    draw(t, p, step) {
      if (!T && !preparing) prepare();
      const e = [0, 1, 2, 3].map((i) => near(step, i));
      ahead = p * SCROLL_RUN;
      if (camera) {
        const cx = e.reduce((acc, v, i) => acc + v * CAMX[i], 0) + 2 * Math.sin(t * 0.07);
        const cz = -p * SCROLL_RUN;
        camera.position.set(cx, Math.max(base(cx, cz), base(cx, cz - 8)) + 5.4 - 1.3 * p - 0.5 * e[1], cz);
        camera.rotation.set(-0.035, 0, 0);
        camera.updateMatrixWorld();
        placeEarth(e[1], p, t);
      }
      if (renderer && scene && camera) {
        renderer.render(scene, camera);
        ctx.save();
        ctx.globalAlpha = o.reduced ? 1 : smooth(0, 900, performance.now() - readyAt);
        ctx.drawImage(renderer.domElement, 0, 0, w, h);
        ctx.restore();
      }
      if (!camera) return; // three still loading: the sky shows through for a moment
      kiteShadow(t, e[3]);

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      trail(1, t, e[1], 0, 0.6);
      for (let c = 0; c < 4; c++) trail(2, t, e[2], c * 1.7, 0.8);
      trail(3, t, e[3]);
      trail(0, t, e[0], 0, 0.45);
      ctx.restore();

      // a little darkness close to the lens
      const v = ctx.createLinearGradient(0, h * 0.8, 0, h);
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(1, 'rgba(0,0,0,0.55)');
      ctx.fillStyle = v;
      ctx.fillRect(0, h * 0.8, w, h * 0.2);
      void glFailed;
    },
  };
};
