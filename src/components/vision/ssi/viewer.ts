// The Star Car viewer: a concept-car reveal. Nothing to drag, zoom or click: the first time the stage comes into
// view the car builds itself (lines lead, the clay sweeps nose to tail, the lights come on), then the camera runs a
// slow, self-running turntable. The studio lights turn with the camera, like a car on a real turntable.
// Renders only while on screen. Reduced motion: no build-in, no camera move, one still frame.

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildStarCar, FX, clamp, lerp, smooth, AXF, AXR, TRK } from './starcar3d';

type Opts = { reduced: boolean };
// yaw: degrees from the nose (+X) toward the right side (+Z); pitch: degrees above the horizon; dist: x fit distance
type Pose = { yaw: number; pitch: number; dist: number };

const TAU = Math.PI * 2;
const D2R = Math.PI / 180;
const HERO: Pose = { yaw: 34, pitch: 12, dist: 1 };
const INTRO: Pose = { yaw: 10, pitch: 3.5, dist: 0.8 };
const RATE = 4.2; // turntable speed, degrees a second (~86 s a turn)
const LIGHT_YAW = 38; // the light rig is set up for a camera at this yaw
const BUILD = 5.2; // build-in length, seconds

const ease = {
  out3: (t: number) => 1 - Math.pow(1 - t, 3),
  inOut3: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  out5: (t: number) => 1 - Math.pow(1 - t, 5),
};
const seg = (t: number, a: number, b: number) => clamp((t - a) / (b - a));

// The self-running camera: a slow turn, a gentle rise and fall, a slow breath in distance.
function orbit(t: number, out: Pose) {
  out.yaw = HERO.yaw + RATE * t;
  out.pitch = HERO.pitch + 3.2 * Math.sin((t / 47) * TAU);
  out.dist = HERO.dist + 0.035 * Math.sin((t / 31) * TAU);
  return out;
}

export function mountViewer(stage: HTMLElement, opts: Opts) {
  const canvas = stage.querySelector('canvas') as HTMLCanvasElement | null;
  if (!canvas) return null;
  const fail = () => {
    stage.classList.add('is-nogl');
    const fb = stage.querySelector('.scp-fallback') as HTMLElement | null;
    if (fb) fb.hidden = false;
  };
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', alpha: false });
  } catch {
    fail();
    return null;
  }
  canvas.style.cursor = 'default';
  const phone = window.matchMedia('(max-width: 767px), (pointer: coarse)').matches;
  const DPR = Math.min(window.devicePixelRatio || 1, phone ? 1.25 : 1.75);
  renderer.setPixelRatio(DPR);
  renderer.setClearColor(0x000000, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = new RoomEnvironment();
  const envTex = pmrem.fromScene(env, 0.035).texture;
  scene.environment = envTex;
  scene.environmentIntensity = 0.5;
  env.traverse((o) => { const me = o as THREE.Mesh; if (me.geometry) me.geometry.dispose(); if (me.material) (me.material as THREE.Material).dispose(); });
  pmrem.dispose();

  /* ---------------------------------------------------------------- lights: a rig that turns with the camera */
  const rig = new THREE.Group();
  const key = new THREE.DirectionalLight(0xffffff, 1.7);
  key.position.set(4.5, 8, 5.5);
  key.castShadow = true;
  key.shadow.mapSize.setScalar(phone ? 1024 : 2048);
  const sc = key.shadow.camera as THREE.OrthographicCamera;
  sc.left = -3.6; sc.right = 3.6; sc.top = 3.6; sc.bottom = -3.6; sc.near = 2; sc.far = 20;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 3;
  const rim = new THREE.DirectionalLight(0xffffff, 1.5);
  rim.position.set(-6, 4.5, -4);
  const fill = new THREE.DirectionalLight(0xffffff, 0.45);
  fill.position.set(-2, 3, 7);
  rig.add(key, key.target, rim, fill);
  scene.add(rig);

  /* ---------------------------------------------------------------- floor */
  const floorU = { uFloor: { value: 1 }, uGrid: { value: 1 } };
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 40),
    new THREE.ShaderMaterial({
      uniforms: floorU,
      polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2,
      vertexShader: `varying vec2 vXZ; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vXZ = w.xz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `
        varying vec2 vXZ; uniform float uFloor; uniform float uGrid;
        void main() {
          float r = length(vXZ * vec2(0.82, 1.0));
          float reach = mix(0.6, 1.0, uFloor);
          float pool = 1.0 - smoothstep(0.0, 6.8 * reach, r);
          vec3 col = vec3(0.10) * pool * pool;
          vec2 g = vXZ / 0.5;
          vec2 gd = abs(fract(g - 0.5) - 0.5) / fwidth(g);
          float line = 1.0 - min(min(gd.x, gd.y), 1.0);
          float gfade = 1.0 - smoothstep(1.8 * reach, 7.5 * reach, r);
          col += vec3(line * 0.04 * gfade * uGrid);
          float rr = length(vXZ);
          float ring = 1.0 - min(abs(rr - 3.4) / fwidth(rr), 1.0);
          col += vec3(ring * 0.07 * uGrid);
          gl_FragColor = vec4(col * uFloor, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  const catcher = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.62, depthWrite: false }));
  catcher.rotation.x = -Math.PI / 2;
  catcher.position.y = 0.001;
  catcher.receiveShadow = true;
  catcher.renderOrder = 1;
  scene.add(catcher);
  // soft contact shadow under the body and each tyre
  const aoTex = (() => {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 128;
    const c = cv.getContext('2d')!;
    const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(0,0,0,0.9)');
    g.addColorStop(0.5, 'rgba(0,0,0,0.45)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(cv);
  })();
  const ao = new THREE.Group();
  const blob = (w: number, d: number, x: number, z: number, o = 1) => {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: aoTex, transparent: true, depthWrite: false, opacity: o }));
    p.userData.base = o;
    p.rotation.x = -Math.PI / 2;
    p.position.set(x, 0.002, z);
    p.renderOrder = 1;
    ao.add(p);
  };
  blob(5.4, 2.7, 0, 0, 0.8);
  for (const x of [AXF, AXR]) for (const z of [TRK, -TRK]) blob(0.8, 0.62, x, z, 1);
  scene.add(ao);

  /* ---------------------------------------------------------------- the car */
  const car = buildStarCar();
  scene.add(car.root);

  /* ---------------------------------------------------------------- camera */
  const camera = new THREE.PerspectiveCamera(phone ? 34 : 28, 1, 0.1, 80);
  const target = new THREE.Vector3(0, 0.74, 0);
  let fit = 8;
  let W = 1, H = 1;
  function resize(w?: number, h?: number) {
    if (w && h) { W = w; H = h; } else {
      const r = stage.getBoundingClientRect();
      W = Math.max(1, Math.round(r.width));
      H = Math.max(1, Math.round(r.height));
    }
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    // fit the car's footprint (~4.8 m long, ~1.7 m tall), with room for the title above it
    const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const needW = phone ? 2.75 : 4.0, needH = 2.05;
    fit = Math.max(needH / t, needW / (t * camera.aspect));
    const shift = phone ? 0.05 : 0.1;
    camera.setViewOffset(W, H, 0, -shift * H, W, H);
    camera.updateProjectionMatrix();
    dirty = 3;
  }

  // the camera's pose right now, and where it is placed from it
  const cur: Pose = { ...HERO };
  const _o: Pose = { ...HERO };
  function place(p: Pose) {
    const yaw = p.yaw * D2R, pitch = p.pitch * D2R, d = fit * p.dist;
    camera.position.set(Math.cos(yaw) * Math.cos(pitch), Math.sin(pitch), Math.sin(yaw) * Math.cos(pitch)).multiplyScalar(d).add(target);
    camera.lookAt(target);
    // the light rig and the reflections turn with the camera
    rig.rotation.y = (LIGHT_YAW - p.yaw) * D2R;
    rig.updateMatrixWorld(true);
    scene.environmentRotation.set(0, 0.6 + (LIGHT_YAW - p.yaw) * D2R, 0);
    renderer.shadowMap.needsUpdate = true;
  }

  /* ---------------------------------------------------------------- build-in */
  let dirty = 3;
  let t0 = 0; // build start
  let built = opts.reduced;
  const lampLevel = { head: 1, seam: 1 };
  function applyBuild(t: number) {
    // floor and grid open up
    floorU.uFloor.value = ease.out3(seg(t, 0, 1.0));
    floorU.uGrid.value = ease.out3(seg(t, 0.1, 1.2));
    // the sweep: lines lead, the clay follows, a construction-line band rides between them
    const s = ease.inOut3(seg(t, 0.3, 3.3));
    FX.lead.value = 1.1;
    FX.reveal.value = lerp(2.55 + 1.1, -2.6, s);
    FX.iso.value = 1 - smooth(3.1, 3.7, t);
    FX.glow.value = 0.9 * (1 - smooth(2.9, 3.4, t));
    // wheels slide onto their hubs, the body settles
    const w = ease.out5(seg(t, 1.2, 2.6));
    const settle = seg(t, 2.6, 3.9);
    const bounce = settle <= 0 ? 0.09 : 0.09 * Math.exp(-5.2 * settle) * Math.cos(settle * 9.5);
    car.pose({ out: (1 - w) * 0.42, lift: bounce });
    // lights: the stars flicker on, then the seam runs out from the middle
    const head = smooth(3.4, 3.6, t) * (0.6 + 0.4 * Math.abs(Math.sin(t * 40)) * (1 - smooth(3.6, 3.85, t))) + smooth(3.6, 3.85, t) * 0.4;
    lampLevel.head = clamp(head);
    lampLevel.seam = smooth(3.8, 4.7, t);
    // contact shadows arrive with the car
    const aoK = smooth(1.3, 3.2, t);
    ao.children.forEach((c) => { ((c as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = (c.userData.base as number) * aoK; });
  }
  const lampWhite = new THREE.Color(0xffffff), lampDim = new THREE.Color(0x2e3134);
  function applyLamps() {
    car.mats.lampHead.color.copy(lampDim).lerp(lampWhite, lampLevel.head);
    FX.seam.value = lampLevel.seam;
    car.lamps.seamGlow.opacity = 0.22 * smooth(0.5, 1, lampLevel.seam);
  }
  const _fp = new THREE.Vector3(), _fn = new THREE.Vector3();
  function placeFlares() {
    for (const f of car.flares) {
      const mat = f.sprite.material as THREE.SpriteMaterial;
      let k = lampLevel.head;
      if (f.normal) {
        f.sprite.getWorldPosition(_fp);
        _fn.copy(camera.position).sub(_fp).normalize();
        k *= smooth(-0.05, 0.55, _fn.dot(f.normal));
      }
      mat.opacity = f.base * k;
      f.sprite.visible = mat.opacity > 0.01;
    }
  }
  function draw() {
    applyLamps();
    placeFlares();
    renderer.render(scene, camera);
  }

  /* ---------------------------------------------------------------- loop */
  let raf = 0;
  let running = false;
  let last = performance.now();
  let clock = 0; // turntable time: only runs while the stage is on screen, so it never jumps
  let begun = opts.reduced;
  let hold: Pose | null = null; // dev: a fixed camera

  function frame(now: number) {
    raf = 0;
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (begun && !opts.reduced) {
      if (!built) {
        const t = (now - t0) / 1000;
        applyBuild(t);
        if (t >= BUILD) { built = true; applyBuild(BUILD + 1); }
      }
      FX.time.value += dt;
      clock += dt;
      if (hold) Object.assign(cur, hold);
      else {
        orbit(clock, _o);
        // ease out of the low opening shot into the turntable, matching its motion as it lands
        const k = built ? 1 : ease.inOut3(seg((now - t0) / 1000, 0, BUILD));
        cur.yaw = lerp(INTRO.yaw, _o.yaw, k);
        cur.pitch = lerp(INTRO.pitch, _o.pitch, k);
        cur.dist = lerp(INTRO.dist, _o.dist, k);
      }
      place(cur);
      draw();
    } else if (dirty > 0) {
      place(hold || cur);
      draw();
      dirty--;
    }
    raf = requestAnimationFrame(frame);
  }
  function start() {
    if (running) return;
    running = true;
    last = performance.now();
    if (!raf) raf = requestAnimationFrame(frame);
  }
  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  /* ---------------------------------------------------------------- first show */
  resize();
  if (opts.reduced) {
    applyBuild(BUILD + 1);
    Object.assign(cur, HERO);
  } else {
    applyBuild(0);
    Object.assign(cur, INTRO);
  }
  place(cur);
  stage.classList.add('is-ready');

  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) {
        if (!begun && e.intersectionRatio > 0.25) {
          begun = true;
          t0 = performance.now();
          clock = 0;
        }
        start();
      } else stop();
    }
  }, { threshold: [0, 0.25, 0.5] });
  io.observe(stage);
  const ro = new ResizeObserver(() => resize());
  ro.observe(stage);
  const onVis = () => { if (document.hidden) stop(); else if (stage.getBoundingClientRect().bottom > 0) start(); };
  document.addEventListener('visibilitychange', onVis);

  // dev/testing hooks (harmless): window.__scp.hold(90, 6) for a side view, __scp.shot('name') to save a frame
  (window as any).__scp = {
    hold: (yaw: number, pitch: number, dist = 1) => { hold = { yaw, pitch, dist }; place(hold); dirty = 3; },
    release: () => { hold = null; },
    finish: () => { begun = true; built = true; t0 = performance.now() - BUILD * 1000 - 10; applyBuild(BUILD + 1); dirty = 3; },
    at: (t: number) => { begun = true; built = true; applyBuild(t); dirty = 3; },
    // render one frame at a fixed size and hand it to a local receiver (dev only)
    shot: async (name: string, w = 1600, h = 1000, port = 8765) => {
      renderer.setPixelRatio(1);
      resize(w, h);
      place(hold || cur);
      draw();
      const url = canvas.toDataURL('image/png');
      renderer.setPixelRatio(DPR);
      resize();
      place(hold || cur);
      draw();
      await fetch(`http://127.0.0.1:${port}/save?name=${encodeURIComponent(name)}`, { method: 'POST', body: url });
      return name;
    },
    car, camera, renderer, FX,
  };

  function dispose() {
    stop();
    io.disconnect();
    ro.disconnect();
    document.removeEventListener('visibilitychange', onVis);
    car.dispose();
    scene.traverse((o) => {
      const me = o as THREE.Mesh;
      if (me.geometry) me.geometry.dispose();
      const mt = me.material as THREE.Material | undefined;
      if (mt && mt.dispose) mt.dispose();
    });
    aoTex.dispose();
    envTex.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
  window.addEventListener('pagehide', (e) => { if (!(e as PageTransitionEvent).persisted) dispose(); }, { once: true });
  return { dispose };
}
