// Beat a of the Mobility card: lights in the dark. The dark side of the Moon: black, a whisper of regolith
// to the horizon, faint stars above it. The star headlight (hl-model.ts, the owner's approved look from
// hl-settings.json) sits in the black nose of a vehicle, seen from the front. Scrubbed by the scroll:
// while the card scrolls into view (pre) the edge light (DRL) runs out to the tips and fades up, steady;
// as the stage pins the main beam punches on and the camera at once pulls straight back and up, far, so the
// beam's pool reads on the ground and the vehicle shrinks into the dark, then the dissolve to the Moon. No atmosphere on
// the Moon, so no visible beam in the air: only the pool on the ground. Then the hard cut to the Moon beat.
// Vehicle space: x right, y up (ground at y = 0), z forward (towards the camera). Metres.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { type Beat, type BeatCtx, smooth, span, lerp, rng, disposeScene } from './mob-kit';
import { buildHeadlight, ignite, HL_DEFAULTS, type HlParams } from './hl-model';

type Look = HlParams & { exposure: number; studio: number; bloom: number };
// the owner's approved look from the lab (hl-settings.json); glob, like the lab, so the build survives without it
const approved = Object.values(import.meta.glob('./hl-settings.json', { eager: true, import: 'default' }))[0] as Partial<Look> | undefined;
const LOOK: Look = { exposure: 1, studio: 1, bloom: 0.45, ...HL_DEFAULTS, ...(approved ?? {}) };

const LY = 0.46; // the lamp's centre above the ground

/** The studio the chrome reflects: the lab's (hl-lab.ts) RoomEnvironment with dark walls plus long strip
 *  lights, so the lit lamp reads as it does in the lab. */
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
  return rt;
}

/* ------------------------------------------------------------------ glare: the star the lens throws */
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
  float h = exp(-ay * ay / (0.00006 + 0.0011 * bx * bx * bx)) * pow(bx, 2.6);
  float v = exp(-ax * ax / (0.00006 + 0.0011 * by * by * by)) * pow(by, 2.6);
  float r2 = dot(p, p);
  float core = exp(-r2 / 0.0016) + 0.16 * exp(-r2 / 0.02);
  float g = (h + v * 0.82) * uRays + core * uCore;
  g *= 1.0 - smoothstep(0.88, 1.0, max(ax, ay));
  gl_FragColor = vec4(vec3(0.94, 0.97, 1.0) * g, 0.0);
}`;
const QUAD_VS = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const addBlend = <M extends THREE.Material>(m: M) => {
  m.transparent = true;
  m.depthWrite = false;
  m.blending = THREE.CustomBlending;
  m.blendEquation = THREE.AddEquation;
  m.blendSrc = THREE.OneFactor;
  m.blendDst = THREE.OneFactor;
  m.blendSrcAlpha = THREE.ZeroFactor;
  m.blendDstAlpha = THREE.OneFactor;
  return m;
};


/* ------------------------------------------------------------------ regolith: value noise */
function noise2(seed: number) {
  const R = rng(seed);
  const N = 256;
  const v = Float32Array.from({ length: N * N }, () => R());
  const at = (i: number, j: number) => v[(((j % N) + N) % N) * N + (((i % N) + N) % N)];
  return (x: number, y: number) => {
    const i = Math.floor(x);
    const j = Math.floor(y);
    let fx = x - i;
    let fy = y - j;
    fx = fx * fx * (3 - 2 * fx);
    fy = fy * fy * (3 - 2 * fy);
    const a = lerp(at(i, j), at(i + 1, j), fx);
    const b = lerp(at(i, j + 1), at(i + 1, j + 1), fx);
    return lerp(a, b, fy);
  };
}

/** A tileable grain for the regolith (bump and a little albedo variation). */
function grainTexture() {
  const s = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const g = cv.getContext('2d')!;
  const img = g.createImageData(s, s);
  const n = noise2(7);
  for (let y = 0; y < s; y++)
    for (let x = 0; x < s; x++) {
      // tileable: sample the noise on a period of 32 cells
      const f = (k: number) => (x * k) / s;
      const v = 0.55 * n(f(32), (y * 32) / s) + 0.3 * n(f(64) + 9, (y * 64) / s + 3) + 0.15 * Math.random();
      const c = Math.round(v * 255);
      const o = (y * s + x) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = c;
      img.data[o + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(26, 26);
  t.anisotropy = 4;
  return t;
}

/** The main beam's footprint: wide, soft, a flat cut-off along the top (projected by the spot light). */
function beamTexture() {
  const s = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, s, s);
  g.filter = 'blur(10px)';
  const grd = g.createRadialGradient(s / 2, s * 0.56, 0, s / 2, s * 0.56, s * 0.46);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.45, 'rgba(255,255,255,0.75)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.save();
  g.translate(s / 2, s * 0.56);
  g.scale(1, 0.62);
  g.translate(-s / 2, -s * 0.56);
  g.fillRect(0, s * 0.24, s, s);
  g.restore();
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export async function makeLight(ctx: BeatCtx): Promise<Beat> {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  const camera = new THREE.PerspectiveCamera(30, 4 / 3, 0.02, 160);
  const envRT = studio(ctx.renderer);
  const env = envRT.texture;

  /* ------------------------------------------------ the lamp */
  // the lighter geometry everywhere: the lamp never fills more than a third of the card
  const lamp = buildHeadlight(LOOK, env, { phone: true });
  // the landing's lens: no transmission (it re-renders the whole scene behind it every frame); dark glass
  // with the studio's reflections, its own glow (LENS_CODE) does the rest when the beam is on
  lamp.group.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.MeshPhysicalMaterial | undefined;
    if (m && (m as THREE.MeshPhysicalMaterial).isMeshPhysicalMaterial && m.transmission > 0) {
      m.transmission = 0;
      m.color.setRGB(0.035, 0.04, 0.05);
      m.needsUpdate = true;
    }
  });
  lamp.group.scale.z = LOOK.depth;
  lamp.group.position.set(0, LY, 0);
  scene.add(lamp.group);
  lamp.group.updateMatrixWorld(true);
  const st = lamp.newState();
  // each material's strength as the approved look set it (setLook ran in the build)
  const envMats = lamp.envMats.map(({ m }) => ({ m, k: m.envMapIntensity }));
  const lampBox = new THREE.Box3().setFromObject(lamp.group);
  const lampR = Math.max(lampBox.max.x - lampBox.min.x, lampBox.max.y - lampBox.min.y) / 2;
  const lensAt = lamp.group.localToWorld((lamp.lensTips[0] ?? new THREE.Vector3()).clone().add(new THREE.Vector3(0, 0, 0.006)));

  /* ------------------------------------------------ the vehicle: a black nose round the lamp, never lit */
  // matte: no glints off its edges; it reads only by hiding the stars and the ground behind it
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x020203, roughness: 1, metalness: 0 });
  const BW = 1.7;
  const BH = 0.52;
  const BD = 2.6;
  const body = new THREE.Mesh(new RoundedBoxGeometry(BW, BH, BD, 4, 0.13), bodyMat);
  const zFace = lampBox.min.z + 0.012; // the housing sits in the face, its rim proud of it
  body.position.set(0, LY + 0.04, zFace - BD / 2);
  scene.add(body);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x020202, roughness: 0.9 });
  const wheelGeo = new THREE.CylinderGeometry(0.29, 0.29, 0.22, 40);
  wheelGeo.rotateZ(Math.PI / 2);
  for (const sx of [-1, 1])
    for (const z of [zFace - 0.45, zFace - BD + 0.45]) {
      const w = new THREE.Mesh(wheelGeo, wheelMat);
      w.position.set(sx * (BW / 2 + 0.06), 0.29, z);
      scene.add(w);
    }

  /* ------------------------------------------------ the ground: dark regolith, gently rolling to the horizon */
  const n = noise2(3);
  const GS = 140;
  const GN = ctx.phone ? 90 : 120;
  const groundGeo = new THREE.PlaneGeometry(GS, GS, GN, GN);
  groundGeo.rotateX(-Math.PI / 2);
  {
    const pos = groundGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const r = Math.hypot(x, z - 1.5);
      // flat where the vehicle stands and the beam lands; rolling further out
      const k = smooth(4, 18, r);
      const h = (n(x * 0.06, z * 0.06) - 0.5) * 2.4 * k + (n(x * 0.25 + 40, z * 0.25) - 0.5) * 0.35 * (0.25 + k) + (n(x * 1.1 + 9, z * 1.1 + 4) - 0.5) * 0.05;
      pos.setY(i, h - 0.02);
    }
    groundGeo.computeVertexNormals();
  }
  const grain = grainTexture();
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3f, roughness: 1, metalness: 0, bumpMap: grain, bumpScale: 1.2, map: grain });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  scene.add(ground);

  /* ------------------------------------------------ faint stars over the black (the ground hides the low ones) */
  const NST = ctx.phone ? 700 : 1100;
  const R0 = rng(31);
  const sp: number[] = [];
  const sb: number[] = [];
  for (let i = 0; i < NST; i++) {
    const az = (R0() - 0.5) * 2.4;
    const el = Math.asin(-0.02 + R0() * 0.55);
    const d = 120;
    sp.push(Math.sin(az) * Math.cos(el) * d, Math.sin(el) * d, -Math.cos(az) * Math.cos(el) * d);
    sb.push(0.035 + 0.6 * Math.pow(R0(), 7));
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  starGeo.setAttribute('aB', new THREE.Float32BufferAttribute(sb, 1));
  const starMat = addBlend(
    new THREE.ShaderMaterial({
      uniforms: { uPx: { value: 1 } },
      vertexShader: /* glsl */ `
        attribute float aB;
        uniform float uPx;
        varying float vB;
        void main() {
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          vB = aB;
          gl_PointSize = uPx * (1.1 + aB * 2.4);
        }`,
      fragmentShader: /* glsl */ `
        varying float vB;
        void main() {
          float a = smoothstep(0.5, 0.05, length(gl_PointCoord - 0.5));
          gl_FragColor = vec4(vec3(0.9, 0.94, 1.0) * vB * a, 0.0);
        }`,
    }),
  );
  const stars = new THREE.Points(starGeo, starMat);
  stars.frustumCulled = false;
  scene.add(stars);

  /* ------------------------------------------------ lights */
  // a whisper of grazing light from the far left, so the regolith's relief just reads
  const graze = new THREE.DirectionalLight(0xc8d2e6, 0.7);
  graze.position.set(-10, 1.2, -4);
  // and the faintest fill from the sky, so the ground just separates from it at the horizon
  const fill = new THREE.HemisphereLight(0x9aa6bd, 0x000000, 0.35);
  scene.add(graze, fill);
  // the main beam: a spot from the lens, aimed down the road, with a flat cut-off
  const beam = new THREE.SpotLight(0xf2f6ff, 0, 40, 0.5, 0.65, 2);
  beam.map = beamTexture();
  beam.position.copy(lensAt).add(new THREE.Vector3(0, 0, 0.06));
  beam.target.position.set(0, 0, 9);
  scene.add(beam, beam.target);

  /* ------------------------------------------------ glare at the lens */
  const quad = new THREE.PlaneGeometry(1, 1);
  const glare = new THREE.Mesh(
    quad,
    addBlend(new THREE.ShaderMaterial({ vertexShader: QUAD_VS, fragmentShader: GLARE_FS, uniforms: { uRays: { value: 0 }, uCore: { value: 0 } }, depthTest: false })),
  );
  glare.renderOrder = 10;
  glare.frustumCulled = false;
  glare.position.copy(lensAt);
  scene.add(glare);

  /* ------------------------------------------------ the camera: from the front, close; then away */
  let aspect = 4 / 3;
  let pxH = 600;
  const C = new THREE.Vector3(0, LY, 0);
  const tgt = new THREE.Vector3();
  const tgtFar = new THREE.Vector3(0, 0.32, 1.6);
  const setFov = (deg: number) => {
    if (Math.abs(camera.fov - deg) > 1e-4 || Math.abs(camera.aspect - aspect) > 1e-6) {
      camera.fov = deg;
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
    }
    lamp.setPx(pxH / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))));
  };
  const place = (u: number, pre: number) => {
    // a slow drift round the lamp as the card arrives, then the pull: it starts the moment the beam is on
    const az = lerp(-0.15, -0.04, pre) + 0.14 * smooth(0, 1, u);
    const pull = span(0.02, 1, u);
    const pe = 1 - Math.pow(1 - pull, 2.4); // the beam kicks the camera back, then it eases out
    const el = lerp(lerp(0.17, 0.15, pre), 0.62, pe);
    const dClose = lerp(1.6, 1.3, pre);
    const d = lerp(dClose, 18, pe * pe * 0.35 + pe * 0.65);
    tgt.lerpVectors(C.clone().setY(LY + 0.1), tgtFar, pe);
    camera.position.set(tgt.x + d * Math.cos(el) * Math.sin(az), tgt.y + d * Math.sin(el), tgt.z + d * Math.cos(el) * Math.cos(az));
    camera.lookAt(tgt);
    // close: hold the lamp at about a third of the frame; far: a fixed lens
    const fit = lampR * 2.3;
    const tanV = (fit / dClose) * (aspect < 1 ? 1 / Math.max(aspect, 0.5) : 1);
    const fovClose = THREE.MathUtils.radToDeg(2 * Math.atan(Math.min(tanV, 1.2)));
    const fovFar = aspect < 1 ? 46 : 30;
    setFov(lerp(fovClose, fovFar, pe));
  };

  /* ------------------------------------------------ the sequence (u: 0..1 over the beat's window; pre: the approach) */
  const update = (u: number, _P: number, _t: number, _dt: number, pre: number) => {
    // the edge light: runs out from the feeds to the tips and fades up while the card comes into view; steady
    const gD = span(0.12, 0.62, pre);
    const fade = smooth(0.12, 0.8, pre);
    ignite(gD * 0.6, 0.12 + 0.88 * fade, st, lamp.tips, true);
    // the main beam punches on as the stage pins (a flash, then steady), the micro LEDs go round
    const on = smooth(0.0, 0.05, u);
    const flash = Math.exp(-Math.pow((u - 0.055) / 0.03, 2));
    st.lens = on * (1 + 0.6 * flash);
    st.ring = span(0.01, 0.3, u);
    st.led = Math.max(st.led, on);
    lamp.set(st);

    // the chrome: barely there in the dark, the lab's studio once the lamp is lit
    const rim = lerp(0.1, 1, smooth(0.1, 0.85, pre)) * LOOK.studio;
    for (const { m, k } of envMats) m.envMapIntensity = k * rim;

    beam.intensity = 400 * on * (1 + 0.5 * flash) * (LOOK.projector / 1.5);

    const g = glare.material as THREE.ShaderMaterial;
    g.uniforms.uRays.value = (st.lens * 0.5 + flash * 0.45) * LOOK.glare * LOOK.projector;
    g.uniforms.uCore.value = (st.lens * 1.6 + st.led * 0.5 * (1 - st.lens)) * LOOK.glare * LOOK.projector;

    place(u, pre);
    glare.quaternion.copy(camera.quaternion);
    glare.scale.setScalar(0.46 * (LOOK.projSize / 0.0249));
  };

  if (import.meta.env.DEV) Object.assign(window, { __lamp: { lamp, st, beam, graze, fill, ground, camera } });

  return {
    scene,
    camera,
    update,
    // the lab's bloom: its strength, and a threshold above anything the studio can reflect
    bloom: LOOK.bloom * 1.4,
    bloomThreshold: 2.4,
    exposure: LOOK.exposure,
    setAspect: (a, px) => {
      aspect = a;
      pxH = px.h;
      starMat.uniforms.uPx.value = ctx.renderer.getPixelRatio();
      place(0, 1);
    },
    dispose: () => {
      lamp.dispose();
      disposeScene(scene);
      beam.map?.dispose();
      grain.dispose();
      envRT.dispose();
    },
  };
}
