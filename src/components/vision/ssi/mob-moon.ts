// Beat c of the Mobility card: range. The whole Moon (NASA LRO colour map, bump from the elevation map)
// floating over the starfield, lit from the top right, turning as you scroll. It is drawn over the whole
// stage (never clipped to the card; the glass steps away on a clock), centred where the card is, and it is
// whole from its first frame: it arrives just inside the card's height and eases further out. The car's
// light draws three laps round it, one after another: great circles through the same start point, each
// turned 60 degrees from the last, so every lap is one clean, closed line limb to limb.
import * as THREE from 'three';
import { type Beat, type BeatCtx, type Frame, glowSprite, smooth, lerp, disposeScene } from './mob-kit';

const LAPS = 3;
const PER_LAP = 512;
const LIFT = 1.008; // the laps ride just above the ground so the far side hides them

// the start point and first heading (Moon-local), and each lap's heading: turned about the start point
const S0 = new THREE.Vector3(0, 0, 1);
const T0 = new THREE.Vector3(1, 0.18, 0).normalize();
const B0 = new THREE.Vector3().crossVectors(S0, T0);
const TS = Array.from({ length: LAPS }, (_, i) => {
  const f = (i * Math.PI) / LAPS + 0.25;
  return T0.clone().multiplyScalar(Math.cos(f)).addScaledVector(B0, Math.sin(f));
});
/** A point on the car's path: lap = floor(s), the angle round it = frac(s). */
function pathPoint(s: number, out = new THREE.Vector3()) {
  const i = Math.min(LAPS - 1, Math.max(0, Math.floor(s)));
  const th = (s - i) * Math.PI * 2;
  return out.copy(S0).multiplyScalar(Math.cos(th)).addScaledVector(TS[i], Math.sin(th)).multiplyScalar(LIFT);
}

const LINE_VS = /* glsl */ `
attribute vec3 aNext;
attribute float aSide;
attribute float aT;
uniform vec2 uRes;
uniform float uWidth;
varying float vT;
varying float vSide;
void main() {
  vec4 a = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  vec4 b = projectionMatrix * modelViewMatrix * vec4(aNext, 1.0);
  vec2 sa = a.xy / a.w * uRes;
  vec2 sb = b.xy / b.w * uRes;
  vec2 d = normalize(sb - sa + vec2(1e-5, 0.0));
  vec2 n = vec2(-d.y, d.x);
  a.xy += n * aSide * uWidth / uRes * a.w;
  gl_Position = a;
  vT = aT;
  vSide = aSide;
}`;
const LINE_FS = /* glsl */ `
uniform float uHead;
uniform float uOn;
varying float vT;
varying float vSide;
void main() {
  float age = uHead - vT;
  if (age < 0.0) discard;
  // the newest stretch bright, older laps settle to a steady hairline
  float b = 1.15 + 1.2 * exp(-age * 2.0) + 2.4 * exp(-age * 40.0);
  float across = 1.0 - smoothstep(0.35, 1.0, abs(vSide));
  float v = b * across * uOn;
  gl_FragColor = vec4(vec3(0.93, 0.96, 1.0) * v, v);
}`;

export async function makeMoon(ctx: BeatCtx): Promise<Beat> {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1.33, 0.05, 100);

  const moon = new THREE.Group();
  scene.add(moon);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(1, ctx.phone ? 96 : 128, ctx.phone ? 48 : 64), mat);
  moon.add(sphere);
  const loader = new THREE.TextureLoader();
  // a map arriving changes the material's program: compile it off the scroll's frames
  const warm = () => ctx.renderer.compileAsync(scene, camera).catch(() => {}).then(ctx.invalidate);
  loader.load('/images/ssi/moon.jpg', (t) => {
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    mat.map = t;
    mat.needsUpdate = true;
    ctx.renderer.initTexture(t); // upload now, not on the first frame that shows it
    warm();
  });
  loader.load('/images/ssi/moon-height.jpg', (t) => {
    t.anisotropy = 4;
    mat.bumpMap = t;
    mat.bumpScale = 3.2;
    mat.needsUpdate = true;
    ctx.renderer.initTexture(t);
    warm();
  });

  // the sun: top right, a little in front, so most of the disc is lit and the terminator falls lower left
  const sun = new THREE.DirectionalLight(0xfff6ea, 3.1);
  sun.position.set(2.6, 2.0, 1.5);
  scene.add(sun);
  const earthshine = new THREE.AmbientLight(0x8fa6c8, 0.025);
  scene.add(earthshine);

  // the laps: a screen-space ribbon along each closed great circle (one strip per lap, no joins between)
  const NV = LAPS * (PER_LAP + 1) * 2;
  const pos = new Float32Array(NV * 3);
  const nxt = new Float32Array(NV * 3);
  const side = new Float32Array(NV);
  const tt = new Float32Array(NV);
  const p = new THREE.Vector3();
  const q = new THREE.Vector3();
  const idx: number[] = [];
  let v = 0;
  for (let l = 0; l < LAPS; l++) {
    const first = v;
    for (let j = 0; j <= PER_LAP; j++) {
      const sj = l + (j % PER_LAP) / PER_LAP;
      pathPoint(sj, p);
      pathPoint(l + ((j + 1) % PER_LAP) / PER_LAP, q);
      for (let k = 0; k < 2; k++) {
        pos.set([p.x, p.y, p.z], v * 3);
        nxt.set([q.x, q.y, q.z], v * 3);
        side[v] = k ? 1 : -1;
        tt[v] = l + j / PER_LAP;
        v++;
      }
    }
    for (let j = 0; j < PER_LAP; j++) {
      const a = first + j * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  lg.setAttribute('aNext', new THREE.BufferAttribute(nxt, 3));
  lg.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
  lg.setAttribute('aT', new THREE.BufferAttribute(tt, 1));
  lg.setIndex(idx);
  const lineMat = new THREE.ShaderMaterial({
    vertexShader: LINE_VS,
    fragmentShader: LINE_FS,
    uniforms: { uRes: { value: new THREE.Vector2(800, 600) }, uWidth: { value: 1.1 }, uHead: { value: 0 }, uOn: { value: 1 } },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
    blendSrcAlpha: THREE.ZeroFactor,
    blendDstAlpha: THREE.OneFactor,
  });
  const laps = new THREE.Mesh(lg, lineMat);
  laps.frustumCulled = false;
  moon.add(laps);
  const head = glowSprite(0xffffff, 2.4);
  head.scale.setScalar(0.08);
  moon.add(head);

  // orient the Moon so the start point sits just above the disc's centre, where the light beat leaves the
  // lamp as a point: the pull-back lands on the car. The scroll turns it away, so the laps read as ellipses.
  const camDir = new THREE.Vector3(0, 0, 1);
  const q0 = new THREE.Quaternion().setFromUnitVectors(S0, new THREE.Vector3(0.12, 0.2, 0.97).normalize());
  const spin = new THREE.Quaternion();
  const AX = new THREE.Vector3(0, 1, 0);

  // the frame: the stage, with the Moon's centre on the card's centre
  let F: Frame = { W: 800, H: 600, cx: 400, cy: 300, cw: 800, ch: 600 };
  let fullH = 600;
  const res = new THREE.Vector2(400, 300);
  const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  /** the camera distance at which the sphere's radius is r device pixels */
  const distFor = (r: number) => 1 / Math.sin(Math.atan(((r / (fullH / 2)) * tanHalf)));

  const update = (u: number) => {
    // ease out: from just inside the card's height to a little smaller, the whole sphere throughout
    const k = smooth(0, 0.3, u);
    const fitH = Math.min(F.ch, F.cw);
    const r = lerp(0.47, 0.37, 1 - Math.pow(1 - k, 2)) * fitH;
    camera.position.copy(camDir).multiplyScalar(distFor(r));
    camera.lookAt(0, 0, 0);
    // the Moon turns as you scroll
    spin.setFromAxisAngle(AX, -1.0 * u);
    moon.quaternion.copy(q0).multiply(spin);
    // the laps: one after another, all three closed well before the beat ends
    const lapsDone = 0.04 + (LAPS - 0.04) * smooth(0.04, 0.82, u);
    lineMat.uniforms.uHead.value = lapsDone + (u >= 0.82 ? 0.01 : 0);
    // half-width in device pixels: a clean hairline at any size
    lineMat.uniforms.uWidth.value = 1.25 * Math.max(0.85, fitH / 700);
    lineMat.uniforms.uRes.value.copy(res);
    head.visible = lapsDone < LAPS - 0.001;
    pathPoint(Math.min(lapsDone, LAPS - 1e-4), head.position);
    head.scale.setScalar(0.1);
  };
  return {
    scene,
    camera,
    update,
    full: true,
    setAspect: (_a, px, f) => {
      F = { ...f };
      const fullW = 2 * Math.max(f.cx, f.W - f.cx);
      fullH = 2 * Math.max(f.cy, f.H - f.cy);
      camera.aspect = fullW / fullH;
      camera.setViewOffset(fullW, fullH, fullW / 2 - f.cx, fullH / 2 - f.cy, f.W, f.H);
      camera.updateProjectionMatrix();
      res.set(px.w / 2, px.h / 2);
    },
    dispose: () => disposeScene(scene),
  };
}
