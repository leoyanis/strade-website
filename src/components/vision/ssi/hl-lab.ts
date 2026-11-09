// Headlight lab: scene + UI for /vision/ssi/headlight. The headlight itself and its slider schema live in
// hl-model.ts (the landing page's "lights in the dark" beat builds the same model).
// Baseline = schema defaults, overridden by hl-settings.json if that file exists next to this one (drop a
// downloaded settings file there to change the baseline). Live edits auto-save to localStorage.
// Studio: black, RoomEnvironment reflections plus long strip lights, ACES, MSAA, bloom on the light only
// (the bloom threshold sits above everything the studio can reflect), a soft contact shadow on a dark floor.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import GUI from 'lil-gui';
import {
  HL_DEFAULTS,
  HL_SCHEMA,
  buildHeadlight,
  housingExtent,
  ignite,
  lampMat,
  lampUniforms,
  tube,
  GUIDE_PARS,
  GUIDE_CODE,
  GUIDE_VERT,
  type Headlight,
  type HlParams,
  type LampState,
} from './hl-model';

type View = { pair: boolean; seam: boolean; exposure: number; studio: number; bloom: number };
type LabParams = HlParams & View;
const VIEW_DEFAULTS: View = { pair: false, seam: true, exposure: 1, studio: 1, bloom: 0.45 };

// optional baseline file: glob so the build doesn't fail when it's absent
const baselineFile = Object.values(import.meta.glob('./hl-settings.json', { eager: true, import: 'default' }))[0] as Partial<LabParams> | undefined;
const DEFAULTS: LabParams = { ...HL_DEFAULTS, ...VIEW_DEFAULTS, ...(baselineFile ?? {}) };
const STORE = 'hl-settings-v1';

/** The studio the metal reflects: RoomEnvironment (walls taken down to a dark grey so chrome reads as
 *  chrome, not grey) plus long strip lights, high on the right and a kicker on the left. */
function studio(renderer: THREE.WebGLRenderer) {
  const room = new RoomEnvironment();
  room.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.Material | undefined;
    if (m instanceof THREE.MeshLambertMaterial) m.emissiveIntensity *= 0.1;
    else if (m instanceof THREE.MeshStandardMaterial) m.color.setScalar(0.035);
  });
  const box = new THREE.BoxGeometry(1, 1, 1);
  const strip = (dir: THREE.Vector3Tuple, dist: number, w: number, h: number, intensity: number, roll = 0) => {
    const m = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: new THREE.Color(0.93, 0.96, 1).multiplyScalar(intensity) }));
    m.position.set(...dir).normalize().multiplyScalar(dist);
    m.lookAt(0, 0, 0);
    m.rotateZ(roll);
    m.scale.set(w, h, 0.05);
    room.add(m);
  };
  strip([0.62, 0.6, 0.52], 9, 9, 0.5, 6, -0.5);
  strip([0.9, 0.24, 0.36], 10, 0.4, 6, 3);
  strip([-0.85, 0.3, 0.42], 10, 0.35, 6, 2.2);
  strip([0.1, 0.92, 0.2], 10, 5, 1.4, 0.22);
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(room, 0.006, 0.1, 60);
  pm.dispose();
  room.dispose();
  box.dispose();
  return rt.texture;
}

const GLARE_FS = /* glsl */ `
uniform float uRays;
uniform float uCore;
varying vec2 vUv;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float ax = abs(p.x);
  float ay = abs(p.y);
  float bx = max(1.0 - ax, 0.0);
  float by = max(1.0 - ay, 0.0);
  // four thin rays tapering to their tips: the emblem's star, symmetric
  float h = exp(-ay * ay / (0.00006 + 0.0011 * bx * bx * bx)) * pow(bx, 2.6);
  float v = exp(-ax * ax / (0.00006 + 0.0011 * by * by * by)) * pow(by, 2.6);
  float r2 = dot(p, p);
  float core = exp(-r2 / 0.0016) + 0.16 * exp(-r2 / 0.02);
  float g = (h + v * 0.82) * uRays + core * uCore;
  g *= 1.0 - smoothstep(0.88, 1.0, max(ax, ay));
  gl_FragColor = vec4(vec3(0.94, 0.97, 1.0) * g, 1.0);
}`;

/** The flicker once a star is complete, in seconds since it fired: the driver catching, then steady. */
function flicker(tau: number) {
  if (tau < 0.035) return 0.22;
  if (tau < 0.075) return 1;
  if (tau < 0.105) return 0.42;
  if (tau < 0.19) return 1;
  if (tau < 0.22) return 0.72;
  return 1;
}

export function initHeadlightLab() {
  const canvas = document.getElementById('hl-canvas') as HTMLCanvasElement;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  scene.fog = new THREE.Fog(0x000000, 1.6, 4.2);
  const env = studio(renderer);

  const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 40);
  camera.position.set(0.42, 0.12, 0.5);
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 0, -0.03);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 0.12;
  controls.maxDistance = 3;

  /* the key: a hint of light from the top right (chrome glints), and its soft shadow */
  const key = new THREE.DirectionalLight(0xe8efff, 1.1);
  key.position.set(1.2, 2.2, 1.4);
  key.castShadow = true;
  key.shadow.mapSize.setScalar(2048);
  const sc = key.shadow.camera as THREE.OrthographicCamera;
  sc.left = -0.8;
  sc.right = 0.8;
  sc.top = 0.8;
  sc.bottom = -0.8;
  sc.near = 0.5;
  sc.far = 6;
  key.shadow.radius = 9;
  key.shadow.blurSamples = 16;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.004;
  scene.add(key);

  /* floor: dark gloss fading to black, a soft contact shadow */
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(12, 12),
    new THREE.MeshPhysicalMaterial({ color: 0x050506, roughness: 0.38, metalness: 0, clearcoat: 0.7, clearcoatRoughness: 0.18, envMap: env, envMapIntensity: 0.45 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const blobTex = (() => {
    const cv = document.createElement('canvas');
    cv.width = 256;
    cv.height = 128;
    const c = cv.getContext('2d')!;
    c.filter = 'blur(14px)';
    c.fillStyle = 'rgba(0,0,0,0.95)';
    c.beginPath();
    c.roundRect(48, 34, 160, 60, 26);
    c.fill();
    return new THREE.CanvasTexture(cv);
  })();
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, opacity: 0.85 }));
  blob.rotation.x = -Math.PI / 2;
  scene.add(blob);

  /* state */
  let p: LabParams = { ...DEFAULTS };
  try {
    const s = localStorage.getItem(STORE);
    if (s) p = { ...DEFAULTS, ...JSON.parse(s) };
  } catch {
    /* ignore */
  }
  const save = () => {
    try {
      localStorage.setItem(STORE, JSON.stringify(p));
    } catch {
      /* ignore */
    }
  };

  /* the headlight(s), the seam, the glare */
  const rig = new THREE.Group();
  scene.add(rig);
  let lamps: Headlight[] = [];
  let states: LampState[] = [];
  const glareMat = () =>
    new THREE.ShaderMaterial({
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: GLARE_FS,
      uniforms: { uRays: { value: 0 }, uCore: { value: 0 } },
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    });
  let glares: THREE.Mesh[] = [];
  const quad = new THREE.PlaneGeometry(1, 1);

  // the seam: a light line in a slot with a chrome lip, above the lamp(s)
  const seamU = lampUniforms();
  const seamSeg = seamU.uSeg.value as THREE.Vector4[];
  const seamP = seamU.uP.value as THREE.Vector4[];
  const seamGroup = new THREE.Group();
  rig.add(seamGroup);
  const seamMats = {
    guide: lampMat({ envMap: env, envMapIntensity: 1, color: 0x8e949c, roughness: 0.14, clearcoat: 1, clearcoatRoughness: 0.03 }, seamU, 0.3, { pars: GUIDE_PARS, code: GUIDE_CODE, vert: GUIDE_VERT }),
    lip: lampMat({ envMap: env, envMapIntensity: 1.15, color: 0xf2f4f7, roughness: 0.08, metalness: 1 }, seamU, 1.6),
    slot: lampMat({ envMap: env, envMapIntensity: 1, color: 0x060607, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.06, side: THREE.DoubleSide }, seamU, 0.35),
  };
  function buildSeam(halfLen: number, y: number) {
    seamGroup.children.forEach((c) => (c as THREE.Mesh).geometry.dispose());
    seamGroup.clear();
    const N = 160;
    const path = (sx: number, dy: number, dz: number) => {
      const out: THREE.Vector3[] = [];
      for (let k = 0; k < N; k++) {
        const x = sx * (0.003 + (halfLen - 0.003) * (k / (N - 1)));
        out.push(new THREE.Vector3(x, y + dy, dz));
      }
      return out;
    };
    [-1, 1].forEach((sx, si) => {
      seamGroup.add(new THREE.Mesh(tube(path(sx, 0, -0.0026), (s) => [0.0013 - 0.0005 * s ** 3, 0.0013 - 0.0005 * s ** 3], 10, si, 2), seamMats.guide));
      seamGroup.add(new THREE.Mesh(tube(path(sx, -0.0042, -0.0001), () => [0.00062, 0.00062], 8, si, 2), seamMats.lip));
      for (let k = 0; k < 6; k++) seamP[si * 6 + k].set(sx * halfLen * (k / 5), y, -0.0015, 0);
    });
    // the trim the seam runs in: a slim black bar with the slot cut into it
    const bar = new THREE.Shape();
    const L = halfLen + 0.012;
    const hh = 0.011;
    bar.moveTo(-L, -hh);
    bar.lineTo(L, -hh);
    bar.absarc(L, 0, hh, -Math.PI / 2, Math.PI / 2, false);
    bar.lineTo(-L, hh);
    bar.absarc(-L, 0, hh, Math.PI / 2, (3 * Math.PI) / 2, false);
    const slot = new THREE.Path();
    slot.moveTo(-halfLen, -0.0035);
    slot.lineTo(halfLen, -0.0035);
    slot.lineTo(halfLen, 0.0035);
    slot.lineTo(-halfLen, 0.0035);
    slot.lineTo(-halfLen, -0.0035);
    bar.holes.push(slot);
    const barGeo = new THREE.ExtrudeGeometry(bar, { depth: 0.02, bevelEnabled: true, bevelThickness: 0.0025, bevelSize: 0.0022, bevelSegments: 4, curveSegments: 24 });
    barGeo.translate(0, y, -0.0225);
    const barMesh = new THREE.Mesh(barGeo, seamMats.slot);
    barMesh.castShadow = true;
    seamGroup.add(barMesh);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(halfLen * 2, 0.008), seamMats.slot);
    back.position.set(0, y, -0.0068);
    seamGroup.add(back);
  }

  function rebuild() {
    for (const l of lamps) {
      rig.remove(l.group);
      l.dispose();
    }
    for (const g of glares) {
      scene.remove(g);
      (g.material as THREE.Material).dispose();
    }
    lamps = [];
    glares = [];
    const n = p.pair ? 2 : 1;
    // the housing's real extent (the star housing ignores width/height)
    const ext = housingExtent(p);
    const gap = ext.x * 2 + 0.15;
    for (let i = 0; i < n; i++) {
      const l = buildHeadlight(p, env);
      l.group.position.x = n === 2 ? (i - 0.5) * gap : 0;
      l.group.scale.z = p.depth;
      rig.add(l.group);
      lamps.push(l);
      for (let j = 0; j < l.lensTips.length; j++) {
        const g = new THREE.Mesh(quad, glareMat());
        g.renderOrder = 10;
        g.frustumCulled = false;
        g.userData = { lamp: i, tip: j };
        scene.add(g);
        glares.push(g);
      }
    }
    states = lamps.map((l) => l.newState());
    const halfLen = n === 2 ? gap / 2 + ext.x * 0.95 : ext.x * 1.05;
    buildSeam(halfLen, ext.y + 0.036);
    seamGroup.visible = p.seam;
    // the floor sits just under the lowest part; the shadow blob under the housing
    const lowest = -ext.y - 0.014;
    rig.position.y = 0;
    floor.position.y = lowest - 0.05;
    blob.position.set(0, floor.position.y + 0.001, -0.05 * p.depth);
    blob.scale.set((n === 2 ? gap + ext.x * 2 : ext.x * 2) * 1.6, 0.34 * p.depth, 1);
    applyLook();
  }
  function applyLook() {
    for (const l of lamps) {
      l.setLook(p);
      for (const e of l.envMats) e.m.envMapIntensity *= p.studio;
    }
    for (const m of Object.values(seamMats)) m.envMapIntensity = (m === seamMats.lip ? 1.15 : 1) * p.studio * (m === seamMats.lip ? p.chrome : 1);
    (seamU.uDrl as THREE.IUniform).value = p.drl;
    seamGroup.visible = p.seam;
    renderer.toneMappingExposure = p.exposure;
    bloomPass.strength = p.bloom;
  }

  /* post: HDR + MSAA, bloom from the light only, then ACES */
  const size = new THREE.Vector2();
  const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.45, 0.4, 2.4);
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());

  /* ignition: the slider, or a replay in real time */
  let replay: { t0: number } | null = null;
  const fired: boolean[] = [];
  const fireT: number[] = [];
  const clock = new THREE.Clock();
  let now = 0;
  function lightsAt(g: number) {
    lamps.forEach((l, i) => {
      // the right lamp a beat after the left one
      const gi = Math.min(1, Math.max(0, (g - i * 0.04) / (1 - 0.04 * (lamps.length - 1)) / 0.8));
      if (gi >= 0.5 && !fired[i]) {
        fired[i] = true;
        fireT[i] = now;
      } else if (gi < 0.47) fired[i] = false;
      const level = fired[i] && replay ? flicker(now - fireT[i]) : 1;
      ignite(gi, level, states[i], l.tips, p.starHousing > 0.5);
      l.set(states[i]);
    });
    // the seam draws from the centre out once the stars are lit
    const s = Math.min(1, Math.max(0, (g - 0.8) / 0.2));
    const sf = s <= 0 ? -0.1 : (1 - Math.pow(1 - s, 1.6)) * 1.1;
    for (let i = 0; i < 2; i++) seamSeg[i].set(sf, 1, s > 0 ? 1.6 * (1 - Math.min(1, Math.max(0, (s - 0.85) / 0.15))) : 0, 0);
    for (let i = 0; i < 2; i++)
      for (let k = 0; k < 6; k++) {
        const f = k / 5;
        const t = Math.min(1, Math.max(0, (f - (sf - 0.05)) / 0.05));
        seamP[i * 6 + k].w = (1 - t * t * (3 - 2 * t)) * p.drl;
      }
  }

  /* GUI from the schema */
  const gui = new GUI({ title: 'Headlight lab', container: document.getElementById('hl-gui')! });
  let queued = false;
  const queueRebuild = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      rebuild();
    });
  };
  let saveT = 0;
  const changed = (live: boolean) => {
    if (live) applyLook();
    else queueRebuild();
    clearTimeout(saveT);
    saveT = window.setTimeout(save, 250);
  };
  const settingsF = gui.addFolder('Settings');
  const actions = {
    'Replay ignition': () => {
      replay = { t0: now };
      fired.length = 0;
    },
    'Copy settings': async () => {
      try {
        await navigator.clipboard.writeText(JSON.stringify(p, null, 2));
        toast('Settings copied');
      } catch {
        toast('Copy failed');
      }
    },
    'Download settings': () => {
      const file = new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(file);
      a.download = 'hl-settings.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    },
    Reset: () => setAll({ ...DEFAULTS }),
  };
  const folders: Record<string, GUI> = {};
  const lightsF = (folders.Lights = gui.addFolder('Lights'));
  lightsF.add(actions, 'Replay ignition');
  let lightsCtl: ReturnType<GUI['add']> | null = null;
  const ctl: Partial<Record<keyof LabParams, ReturnType<GUI['add']>>> = {};
  // the star housing ignores the rounded square's width, height and corner shape: hide them there
  const syncHousingCtl = () => {
    const star = p.starHousing >= 0.999;
    for (const k of ['width', 'height', 'roundness'] as const) ctl[k]?.show(!star);
  };
  for (const d of HL_SCHEMA) {
    const f = (folders[d.folder] ??= gui.addFolder(d.folder));
    const c = typeof p[d.key] === 'boolean' ? f.add(p, d.key) : f.add(p, d.key, d.min, d.max, d.step);
    ctl[d.key] = c;
    c.name(d.label).onChange(() => {
      if (d.key === 'lights') replay = null;
      if (d.key === 'starHousing') syncHousingCtl();
      changed(!!d.live);
    });
    if (d.key === 'lights') lightsCtl = c;
  }
  const viewF = gui.addFolder('Studio');
  viewF.add(p, 'pair').name('Pair (two units)').onChange(() => changed(false));
  viewF.add(p, 'seam').name('Light seam').onChange(() => changed(true));
  viewF.add(p, 'exposure', 0.3, 2.5, 0.01).name('Exposure').onChange(() => changed(true));
  viewF.add(p, 'studio', 0, 2.5, 0.01).name('Studio reflections').onChange(() => changed(true));
  viewF.add(p, 'bloom', 0, 2, 0.01).name('Bloom').onChange(() => changed(true));
  settingsF.add(actions, 'Copy settings');
  settingsF.add(actions, 'Download settings');
  settingsF.add(actions, 'Reset');
  for (const [name, f] of Object.entries(folders)) if (name !== 'Lights' && name !== 'Star') f.close();
  syncHousingCtl();

  function setAll(next: LabParams) {
    for (const k of Object.keys(p)) delete (p as Record<string, unknown>)[k];
    Object.assign(p, next);
    gui.controllersRecursive().forEach((c) => c.updateDisplay());
    syncHousingCtl();
    replay = null;
    rebuild();
    save();
  }

  /* toast */
  const toastEl = document.getElementById('hl-toast')!;
  let toastT = 0;
  function toast(msg: string) {
    toastEl.textContent = msg;
    toastEl.classList.add('on');
    clearTimeout(toastT);
    toastT = window.setTimeout(() => toastEl.classList.remove('on'), 1400);
  }

  /* views */
  const VIEWS: Record<string, { pos: THREE.Vector3Tuple; tgt: THREE.Vector3Tuple }> = {
    front: { pos: [0, 0.015, 0.98], tgt: [0, 0.01, -0.03] },
    '3/4': { pos: [0.66, 0.2, 0.72], tgt: [0, 0.01, -0.03] },
    side: { pos: [0.98, 0.05, -0.03], tgt: [0, 0.01, -0.03] },
    star: { pos: [0.04, 0.035, 0.36], tgt: [0, 0, -0.03] },
  };
  let tween: { from: THREE.Vector3; to: THREE.Vector3; tf: THREE.Vector3; tt: THREE.Vector3; t: number } | null = null;
  function setView(name: string, instant = false) {
    const v = VIEWS[name];
    if (!v) return;
    const k = p.pair && name !== 'star' ? 1.9 : 1;
    const to = new THREE.Vector3(...v.pos).multiplyScalar(k);
    const tt = new THREE.Vector3(...v.tgt);
    if (instant) {
      camera.position.copy(to);
      controls.target.copy(tt);
      tween = null;
      return;
    }
    tween = { from: camera.position.clone(), to, tf: controls.target.clone(), tt, t: 0 };
  }
  document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view!)));

  /* resize + loop */
  const resize = () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    composer.setPixelRatio(renderer.getPixelRatio());
    camera.aspect = w / h;
    // keep the lamp centred in the space left of the docked panel
    const guiW = w > 900 ? ((document.querySelector('#hl-gui .lil-gui') as HTMLElement | null)?.offsetWidth ?? 0) : 0;
    camera.setViewOffset(w, h, guiW / 2, 0, w, h);
    camera.updateProjectionMatrix();
    renderer.getDrawingBufferSize(size);
    const s = size.y / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    for (const l of lamps) l.setPx(s);
  };
  new ResizeObserver(resize).observe(canvas);
  rebuild();
  resize();
  setView('3/4', true);

  const tmp = new THREE.Vector3();
  const frame = () => {
    const dt = Math.min(0.05, clock.getDelta());
    now += dt;
    if (tween) {
      tween.t = Math.min(1, tween.t + dt / 0.8);
      const e = 1 - Math.pow(1 - tween.t, 3);
      camera.position.lerpVectors(tween.from, tween.to, e);
      controls.target.lerpVectors(tween.tf, tween.tt, e);
      if (tween.t >= 1) tween = null;
    }
    controls.update();
    // ignition
    let g = p.lights;
    if (replay) {
      g = Math.min(1, (now - replay.t0) / 2.8);
      if (Math.abs(p.lights - g) > 0.002) {
        p.lights = g;
        lightsCtl?.updateDisplay();
      }
      if (g >= 1 && now - replay.t0 > 3.4) replay = null;
    }
    lightsAt(g);
    // glare: at each lens, facing the camera
    for (const gl of glares) {
      const { lamp, tip } = gl.userData as { lamp: number; tip: number };
      const l = lamps[lamp];
      if (!l) continue;
      l.group.localToWorld(tmp.copy(l.lensTips[tip]).add(new THREE.Vector3(0, 0, 0.006)));
      gl.position.copy(tmp);
      gl.quaternion.copy(camera.quaternion);
      gl.scale.setScalar(0.46 * (p.projSize / 0.0249));
      const st = states[lamp];
      const flash = Math.exp(-Math.pow((p.lights - 0.66) / 0.08, 2));
      const m = gl.material as THREE.ShaderMaterial;
      m.uniforms.uRays.value = (st.lens * 0.5 + flash * 0.45 * (replay ? 1 : 0)) * p.glare * p.projector;
      m.uniforms.uCore.value = (st.lens * 1.6 + st.led * 0.5 * (1 - st.lens)) * p.glare * p.projector;
    }
    composer.render();
  };
  renderer.setAnimationLoop(frame);

  // handy for debugging (and screenshots) from the console
  Object.assign(window, {
    hl: {
      get params() {
        return p;
      },
      setAll,
      rebuild,
      setView,
      replay: actions['Replay ignition'],
      /** render one frame now (hidden tabs don't run the loop) */
      frame,
      camera,
      controls,
    },
  });
}
