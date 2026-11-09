// Car lab: scene + UI for /vision/ssi/star-car/lab. The car itself and the PARAMS schema live in carlab-model.ts.
// Baseline = schema defaults, overridden by carlab-settings.json if that file exists next to this one
// (drop a downloaded settings file there to change the baseline). Live edits auto-save to localStorage.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import GUI from 'lil-gui';
import { PARAMS, PRESETS, SCHEMA_DEFAULTS, buildCar, type CarMaterials, type Params } from './carlab-model';

// optional baseline file: glob so the build doesn't fail when it's absent
const baselineFile = Object.values(
  import.meta.glob('./carlab-settings.json', { eager: true, import: 'default' }),
)[0] as Params | undefined;
const DEFAULTS: Params = { ...SCHEMA_DEFAULTS, ...(baselineFile ?? {}) };
const STORE = 'carlab-settings-v1';

export function initCarLab() {
  const canvas = document.getElementById('lab-canvas') as HTMLCanvasElement;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 0.85;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.035).texture;
  scene.environmentIntensity = 0.3;

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 200);
  camera.position.set(7, 3.2, 7);
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 0.8, 0);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI / 2 - 0.02;
  controls.minDistance = 2;
  controls.maxDistance = 30;

  /* lights */
  const key = new THREE.DirectionalLight(0xffffff, 1.25);
  key.position.set(4.5, 8, 5.5);
  key.castShadow = true;
  key.shadow.mapSize.setScalar(2048);
  const sc = key.shadow.camera as THREE.OrthographicCamera;
  sc.left = -4.5; sc.right = 4.5; sc.top = 4.5; sc.bottom = -4.5; sc.near = 1; sc.far = 25;
  key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02; key.shadow.radius = 4;
  const rim = new THREE.DirectionalLight(0xffffff, 1.3); rim.position.set(-6, 4.5, -4);
  const fill = new THREE.DirectionalLight(0xffffff, 0.4); fill.position.set(-2, 3, 7);
  scene.add(key, rim, fill, new THREE.HemisphereLight(0xffffff, 0x202020, 0.25));

  /* floor: dark pool + subtle grid, shadow catcher, soft contact blob */
  const floorU = { uGrid: { value: 1 } };
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 60),
    new THREE.ShaderMaterial({
      uniforms: floorU,
      vertexShader: `varying vec2 vXZ; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vXZ = w.xz; gl_Position = projectionMatrix*viewMatrix*w; }`,
      fragmentShader: `varying vec2 vXZ; uniform float uGrid;
        void main(){
          float r = length(vXZ*vec2(0.8,1.0));
          float pool = 1.0 - smoothstep(0.0, 8.0, r);
          vec3 col = vec3(0.09)*pool*pool;
          vec2 g = vXZ/0.5; vec2 gd = abs(fract(g-0.5)-0.5)/fwidth(g);
          float line = 1.0 - min(min(gd.x,gd.y),1.0);
          col += vec3(line*0.045*(1.0-smoothstep(2.0,9.0,r))*uGrid);
          gl_FragColor = vec4(col,1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  const catcher = new THREE.Mesh(new THREE.PlaneGeometry(16, 16), new THREE.ShadowMaterial({ opacity: 0.6, depthWrite: false }));
  catcher.rotation.x = -Math.PI / 2; catcher.position.y = 0.001; catcher.receiveShadow = true;
  scene.add(catcher);
  const blobTex = (() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 128;
    const c = cv.getContext('2d')!;
    const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(0,0,0,0.85)'); g.addColorStop(0.55, 'rgba(0,0,0,0.4)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(cv);
  })();
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false }));
  blob.rotation.x = -Math.PI / 2; blob.position.y = 0.002;
  scene.add(blob);

  /* materials (shared, so look toggles don't need a rebuild) */
  const mats: CarMaterials = {
    clay: new THREE.MeshStandardMaterial({ color: 0xd9d4cb, roughness: 0.7, metalness: 0, vertexColors: true }),
    tyre: new THREE.MeshStandardMaterial({ color: 0x0d0d0d, roughness: 0.92 }),
    rim: new THREE.MeshStandardMaterial({ color: 0x1c1c1e, roughness: 0.6, metalness: 0.3 }),
    hub: new THREE.MeshStandardMaterial({ color: 0x8a8782, roughness: 0.5, metalness: 0.2 }),
    light: new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }),
    edge: new THREE.LineBasicMaterial({ color: 0x222222, transparent: true, opacity: 0.55 }),
  };

  /* state */
  let p: Params = { ...DEFAULTS };
  try { const s = localStorage.getItem(STORE); if (s) p = { ...DEFAULTS, ...JSON.parse(s) }; } catch { /* ignore */ }
  const save = () => { try { localStorage.setItem(STORE, JSON.stringify(p)); } catch { /* ignore */ } };

  let car: THREE.Group | null = null;
  const disposeTree = (o: THREE.Object3D) => o.traverse((c) => { const g = (c as THREE.Mesh).geometry; if (g) g.dispose(); });
  function applyLook() {
    mats.clay.color.set(p.clay);
    for (const m of [mats.clay, mats.tyre, mats.rim, mats.hub] as THREE.MeshStandardMaterial[]) m.wireframe = !!p.wireframe;
    floorU.uGrid.value = p.grid ? 1 : 0;
  }
  function rebuild() {
    if (car) { scene.remove(car); disposeTree(car); }
    car = buildCar(p, mats);
    scene.add(car);
    blob.scale.set(p.length * 1.15, p.width * 1.35, 1);
    applyLook();
  }
  let queued = false;
  const queueRebuild = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; rebuild(); });
  };
  let saveT = 0;
  const changed = () => { queueRebuild(); clearTimeout(saveT); saveT = window.setTimeout(save, 250); };

  /* GUI from the schema */
  const gui = new GUI({ title: 'Star Car lab', container: document.getElementById('lab-gui')! });
  const folders: Record<string, GUI> = {};
  const settingsF = gui.addFolder('Settings');
  const actions = {
    'Copy settings': async () => {
      try { await navigator.clipboard.writeText(JSON.stringify(p, null, 2)); toast('Settings copied'); } catch { toast('Copy failed'); }
    },
    'Download settings': () => {
      const blobFile = new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blobFile); a.download = 'carlab-settings.json'; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    },
    Reset: () => setAll({ ...DEFAULTS }),
  };
  settingsF.add(actions, 'Copy settings');
  settingsF.add(actions, 'Download settings');
  settingsF.add(actions, 'Reset');
  const presetsF = gui.addFolder('Presets');
  const presetActs: Record<string, () => void> = {};
  for (const name of Object.keys(PRESETS)) {
    presetActs[name] = () => setAll({ ...DEFAULTS, ...PRESETS[name] });
    presetsF.add(presetActs, name);
  }
  for (const d of PARAMS) {
    const f = (folders[d.folder] ??= gui.addFolder(d.folder));
    const c = typeof d.def === 'string' && d.def.startsWith('#')
      ? f.addColor(p, d.key)
      : typeof d.def === 'boolean' ? f.add(p, d.key) : f.add(p, d.key, d.min, d.max, d.step);
    c.name(d.label ?? d.key).onChange(changed);
  }
  for (const [name, f] of Object.entries(folders)) if (name !== 'Body') f.close();

  function setAll(next: Params) {
    for (const k of Object.keys(p)) delete p[k];
    Object.assign(p, next);
    gui.controllersRecursive().forEach((c) => c.updateDisplay());
    changed();
  }

  /* toast */
  const toastEl = document.getElementById('lab-toast')!;
  let toastT = 0;
  function toast(msg: string) {
    toastEl.textContent = msg; toastEl.classList.add('on');
    clearTimeout(toastT); toastT = window.setTimeout(() => toastEl.classList.remove('on'), 1400);
  }

  /* views */
  const VIEWS: Record<string, [number, number, number]> = {
    '3/4': [6.6, 2.8, 6.6], side: [0, 1.0, 10.5], front: [10.5, 1.0, 0], rear: [-10.5, 1.0, 0], top: [0.001, 12, 0],
  };
  let tween: { from: THREE.Vector3; to: THREE.Vector3; tf: THREE.Vector3; tt: THREE.Vector3; t: number } | null = null;
  function setView(name: string, instant = false) {
    const v = VIEWS[name];
    if (!v) return;
    const to = new THREE.Vector3(...v), tt = new THREE.Vector3(0, name === 'top' ? 0 : 0.8, 0);
    if (instant) { camera.position.copy(to); controls.target.copy(tt); tween = null; return; }
    tween = { from: camera.position.clone(), to, tf: controls.target.clone(), tt, t: 0 };
  }
  document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view!)));

  /* resize + loop */
  const resize = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // keep the car centred in the space left of the docked panel
    const guiW = w > 900 ? (document.querySelector('#lab-gui .lil-gui') as HTMLElement | null)?.offsetWidth ?? 0 : 0;
    camera.setViewOffset(w, h, guiW / 2, 0, w, h);
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(canvas);
  resize();
  rebuild();

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = clock.getDelta();
    if (tween) {
      tween.t = Math.min(1, tween.t + dt / 0.7);
      const e = 1 - Math.pow(1 - tween.t, 3);
      camera.position.lerpVectors(tween.from, tween.to, e);
      controls.target.lerpVectors(tween.tf, tween.tt, e);
      if (tween.t >= 1) tween = null;
    }
    controls.update();
    renderer.render(scene, camera);
  });

  // handy for debugging from the console
  (window as any).carlab = { get params() { return p; }, setAll, rebuild, setView, presets: PRESETS, defaults: DEFAULTS };
}
