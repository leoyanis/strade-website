/*
 * Vaultt's Network map on a 2D canvas.
 *
 * The look is the app's own (Vaultt repo, lib/feature/main_frame/network/map, read 2026-11-07):
 * one colour per kind of builder (mapGlow1..7), only connections wear their full colour and
 * everyone around the network is half way to neutral, a tie is an additive wide stroke under a thin
 * core line that gets brighter and closer with more chat, blooms are one radial sprite drawn
 * additively, connections are a deep tint of their colour with a ring and their initials, the
 * physics is a damped spring star (k 10, damping 5.2, fixed 1/60 s steps, at most 4 a frame).
 * Everyone on it is invented: first names and drawn initials, never a real user.
 *
 * Two looks share the engine:
 *  - 'app':   the phone's Network page, on the app's charcoal (#131517), sized in iPhone points
 *             (393 wide) and stretched down the way the app stretches a phone's map (1.3).
 *  - 'world': the homepage backdrop on vaultt.io's navy. Its hub is glued to the drawn phone by
 *             the host (vaultt-home.ts), which also feeds the scroll beats in `beats`.
 *
 * Cost rules (the homepage already runs a WebGL sky): DPR capped at 2 and at a pixel budget, no
 * allocation inside the frame loop (typed arrays, cached colour strings, globalAlpha instead of
 * new rgba strings), the loop only runs while started, and the host stops it off screen and in
 * hidden tabs. Reduced motion paints single frames on demand and never starts the loop.
 */

export type NetLook = 'app' | 'world';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface NetworkOptions {
  look: NetLook;
  seed?: number;
  reduced?: boolean;
  /** 'lite' draws fewer people (phones). */
  density?: 'full' | 'lite';
  /** Element that receives pointer events (defaults to the canvas). */
  pointerTarget?: HTMLElement | null;
  /** Return true when a pointer event belongs to the page (a link, a button, the phone). */
  ignore?: (target: EventTarget | null) => boolean;
  /** Runs first in every frame (and before every single paint), so the host can move the hub and set beats. */
  onFrame?: (net: Network, dt: number) => void;
  /** app: points of design width (393 = an iPhone). */
  designWidth?: number;
  /** app: where the viewer sits, in design points from the top. */
  hubY?: number;
  /** app: people-free band at the top of the map (the header and tabs float there). */
  topInset?: number;
}

export interface Network {
  readonly canvas: HTMLCanvasElement;
  /** world: the hub (phone centre) in canvas CSS px, and the phone's half size it keeps clear. `keep` 0..1 eases that clearance.
   *  `viewer` 0..1 shows the drawn "You" at the hub; -1 (the default) derives it from `keep` (shown as the clearance goes). */
  hub: { x: number; y: number; keepW: number; keepH: number; keep: number; viewer: number };
  /** world: text areas (canvas CSS px); people under them fade so the copy stays readable. */
  shield: Rect[];
  /** world: height of the layer's soft top edge (canvas CSS px); points there fade with it. */
  fadeTop: number;
  /** world: the part of the canvas the screen shows (canvas CSS px from its top), and a band at the top kept clear (the site nav). */
  view: { top: number; height: number; clearTop: number };
  /** Scroll beats, all 0..1 (world). `calm` dims everything for the hand-over below. */
  beats: { reveal: number; sea: number; builders: number; feedback: number; connect: number; calm: number };
  readonly running: boolean;
  /** Canvas CSS px of person `i` (world: one of the connections or ring people). */
  screenOf(i: number, out: { x: number; y: number }): boolean;
  /** Up to `n` people currently on screen and clear of the shield, spread out (for flying tiles). */
  pickVisible(n: number, into: number[]): number;
  start(): void;
  stop(): void;
  /** While false, a running loop still advances (physics, beats, pulses, onFrame) but does not draw: for a
   *  canvas that cannot be seen yet. Turning it back on draws the current state at once. Default true. */
  setDrawing(on: boolean): void;
  /** app: start on the finished map instead of the entrance (ties drawing out, dots blooming). For a map
   *  first seen mid-screen (a jump, a reload, scrolling back up), where the entrance read as a blank screen. */
  skipEntrance(): void;
  /** Draws one frame now (reduced motion, resize). */
  paint(): void;
  resize(): void;
  destroy(): void;
}

const TAU = Math.PI * 2;
const GOLDEN = 2.399963229728653;
const STEP = 1 / 60;
const MAX_STEPS = 4;

/** The Network map's colour per kind of builder (`mapGlow1..7`, in `kMapKindOrder` order). */
export const KIND_COLOURS = ['#4C8DFF', '#FF5FA2', '#FF9A3D', '#2FD4C1', '#A27BFF', '#8BE04E', '#FFCF4A'];
/** The line under a name, shortened the way the app does (`kMapKindShortNames`). */
export const KIND_LINES = ['Software Dev', 'Creative Arts', 'Marketing', 'Engineering', 'Research', 'Analytics', 'Entrepreneurship'];
// how often each kind turns up: Creative Arts and Software are the two big ones on Vaultt
const KIND_WEIGHTS = [0.27, 0.31, 0.1, 0.05, 0.11, 0.09, 0.07];

// Invented first names. None of them is taken from Vaultt's data.
const NAMES = [
  'Maya', 'Theo', 'Ines', 'Kofi', 'Lena', 'Arjun', 'Sofia', 'Jonah', 'Amara', 'Felix', 'Noor', 'Luca', 'Priya', 'Mateo', 'Zoe',
  'Elif', 'Ravi', 'Hana', 'Oscar', 'Leila', 'Tomas', 'Yara', 'Ben', 'Chloe', 'Idris', 'Mila', 'Sami', 'Ava', 'Kenji', 'Rosa',
  'Dev', 'Nia', 'Emil', 'Lucia', 'Omar', 'Freya', 'Kai', 'Esme', 'Ruben', 'Anya', 'Joel', 'Tara', 'Hugo', 'Selin', 'Marco',
  'Ada', 'Finn', 'Lina', 'Tariq', 'Iris', 'Leo', 'Mira', 'Nico', 'Sana', 'Alba', 'Cyrus', 'Effie', 'Jude', 'Keira', 'Malik',
  'Nell', 'Otto', 'Pia', 'Quinn', 'Rhea', 'Silas', 'Thea', 'Uma', 'Vik', 'Wren', 'Xavi', 'Yusuf', 'Zara', 'Aiko', 'Bilal',
  'Cleo', 'Dara', 'Eli', 'Farah', 'Gus', 'Hiro', 'Isla', 'Jasper', 'Kira', 'Lars', 'Mona', 'Nate', 'Olu', 'Paz', 'Remi',
  'Teo', 'Una', 'Vera', 'Wes', 'Ximena', 'Yosef', 'Zain', 'Asha', 'Bruno', 'Celia', 'Dmitri', 'Eva', 'Fynn', 'Gemma', 'Hamza',
  'Ivy', 'Jonas', 'Kemi', 'Liv', 'Mei', 'Nadia', 'Orla', 'Pablo', 'Rania', 'Stellan', 'Tess', 'Umar', 'Viola', 'Wilf', 'Yuki',
  'Zeno', 'Aria', 'Basil', 'Carmen', 'Dina', 'Ezra', 'Gia', 'Hector', 'Ilse', 'Juno', 'Kasim', 'Lotte', 'Matteo', 'Nour',
  'Odin', 'Petra', 'Ronan', 'Sade', 'Timo', 'Vida', 'Wanda', 'Yann', 'Zuri', 'Aled', 'Bea', 'Cato', 'Dalia', 'Enzo', 'Fleur',
];

// Feedback a builder might leave (invented, for the feedback beat).
const BUBBLES = ['Love the lighting', 'Try a shorter intro', 'Can I help on this?'];

/** Seeded random numbers (mulberry32), so every visit draws the same network. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hexRgb(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mixHex(a: string, b: string, t: number): string {
  const x = hexRgb(a);
  const y = hexRgb(b);
  const c = (i: number) => Math.round(x[i] + (y[i] - x[i]) * t).toString(16).padStart(2, '0');
  return `#${c(0)}${c(1)}${c(2)}`;
}
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (v: number) => {
  const t = clamp01(v);
  return t * t * (3 - 2 * t);
};
const easeOut = (v: number) => 1 - Math.pow(1 - clamp01(v), 3);

/** One soft radial bloom, the app's `_glowSpriteImage` stops (1, 0.55, 0.16, 0), tinted once per colour. */
function glowSprite(colour: string, size = 128): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const [r, gg, b] = hexRgb(colour);
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, `rgba(${r},${gg},${b},1)`);
  grad.addColorStop(0.2, `rgba(${r},${gg},${b},0.55)`);
  grad.addColorStop(0.52, `rgba(${r},${gg},${b},0.16)`);
  grad.addColorStop(1, `rgba(${r},${gg},${b},0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return c;
}

interface LookSpec {
  bg: string | null;
  neutral: string;
  shadow: string;
  label: string;
  labelSoft: string;
  hub: string;
  sea: string[];
  ink: string;
}

const LOOKS: Record<NetLook, LookSpec> = {
  // the app's tokens: primaryBackground, charcoal50 (neutral), charcoal100 (labels), charcoal200, primary
  app: { bg: '#131517', neutral: '#CDD1D5', shadow: '#131517', label: '#959EA7', labelSoft: '#636E78', hub: '#70A9FF', sea: ['#CDD1D5', '#A27BFF', '#4C8DFF'], ink: '#EEF0F1' },
  // vaultt.io: navy #0C2748, light #E8F1FF, blue #6FA8FF
  world: { bg: null, neutral: '#E8F1FF', shadow: '#0C2748', label: '#E8F1FF', labelSoft: '#9FB7D9', hub: '#6FA8FF', sea: ['#E8F1FF', '#8EBBFF', '#A27BFF'], ink: '#F4F8FF' },
};

const ROLE_CONN = 0; // an approved connection: a tie to the hub, full colour
const ROLE_RING = 1; // someone around the network: a solid calm dot on the rings
const ROLE_SUGG = 2; // a suggestion: a hollow ring (the world's connect beat ties some of them in)

export function createNetwork(canvas: HTMLCanvasElement, opts: NetworkOptions): Network {
  const look = opts.look;
  const L = LOOKS[look];
  const reduced = !!opts.reduced;
  const lite = opts.density === 'lite';
  const rand = rng(opts.seed ?? 7);
  const ctx = canvas.getContext('2d', { alpha: L.bg === null })!;
  const designW = opts.designWidth ?? 393;
  const stretchY = look === 'app' ? 1.3 : 1;
  const topInset = opts.topInset ?? 0;

  /* ------------------------------------------------------------------ people */
  const nConn = look === 'app' ? 90 : lite ? 34 : 60;
  const nRing = look === 'app' ? 44 : lite ? 46 : 96;
  const nSugg = look === 'app' ? 22 : lite ? 18 : 34;
  const N = nConn + nRing + nSugg;

  const role = new Uint8Array(N);
  const kind = new Int8Array(N);
  const str = new Float32Array(N); // chat strength, connections only
  const ang = new Float32Array(N);
  const base = new Float32Array(N); // rest radius (connections) or ring radius (others)
  const order = new Float32Array(N); // reveal order 0..1
  const ph = new Float32Array(N);
  const px = new Float32Array(N);
  const py = new Float32Array(N);
  const vx = new Float32Array(N);
  const vy = new Float32Array(N);
  const rad = new Float32Array(N); // drawn radius, design units
  const lit = new Float32Array(N); // hover glow, eased
  const flash = new Float32Array(N); // a pulse arriving, decays
  const joinAt = new Float32Array(N).fill(-1); // world connect beat: when a suggestion is tied in
  const forced = new Float32Array(N).fill(-1); // a click tied this suggestion in at this time (s)
  const sx = new Float32Array(N); // screen position this frame (canvas CSS px)
  const sy = new Float32Array(N);
  const vis = new Float32Array(N); // alpha this frame
  const names: string[] = [];
  const inits: string[] = [];
  const nameW = new Float32Array(N);
  const lineW = new Float32Array(N);

  const pickKind = () => {
    let r = rand();
    for (let k = 0; k < KIND_WEIGHTS.length; k++) {
      r -= KIND_WEIGHTS[k];
      if (r <= 0) return k;
    }
    return 1;
  };
  const nameOff = Math.floor(rand() * NAMES.length);
  for (let i = 0; i < N; i++) {
    const nm = NAMES[(nameOff + i * 7) % NAMES.length];
    names.push(nm);
    const last = String.fromCharCode(65 + Math.floor(rand() * 26));
    inits.push(nm[0] + last);
    ph[i] = rand() * TAU;
    role[i] = i < nConn ? ROLE_CONN : i < nConn + nRing ? ROLE_RING : ROLE_SUGG;
    // a few people around the network have no kind yet: they stay neutral grey, as in the app
    kind[i] = role[i] !== ROLE_CONN && rand() < 0.22 ? -1 : pickKind();
  }
  // connections: a few strong chats, a long tail of quiet ones, strongest first
  const strengths: number[] = [];
  for (let i = 0; i < nConn; i++) strengths.push(Math.pow(rand(), 2.1));
  strengths.sort((a, b) => b - a);
  const angOff = rand() * TAU;
  for (let i = 0; i < nConn; i++) {
    str[i] = strengths[i];
    order[i] = i / Math.max(1, nConn - 1);
    // golden-angle slots: the strong ties never sit next to each other (the app's `_kTieAngle` homes)
    ang[i] = angOff + i * GOLDEN + (rand() - 0.5) * 0.18;
  }
  // rings around the network: as many per ring as fit, each ring starting at its own angle
  {
    let i = nConn;
    let ring = 0;
    const others = nRing + nSugg;
    const ids: number[] = [];
    for (let k = 0; k < others; k++) ids.push(nConn + k);
    // suggestions mixed in among the rings, not all on the last one
    for (let k = ids.length - 1; k > 0; k--) {
      const j = Math.floor(rand() * (k + 1));
      [ids[k], ids[j]] = [ids[j], ids[k]];
    }
    let placed = 0;
    while (placed < others) {
      const perRing = look === 'app' ? 10 + ring * 4 : lite ? 9 + ring * 3 : 12 + ring * 5;
      const a0 = rand() * TAU;
      for (let k = 0; k < perRing && placed < others; k++, placed++) {
        const id = ids[placed];
        ang[id] = a0 + (k / perRing) * TAU + (rand() - 0.5) * 0.22;
        base[id] = ring; // ring index for now, turned into a radius in layout()
        order[id] = clamp01(0.35 + ring * 0.12 + rand() * 0.15);
      }
      ring++;
      i++;
    }
  }
  const ringIndex = new Float32Array(N);
  for (let i = nConn; i < N; i++) ringIndex[i] = base[i];
  // the world's connect beat ties suggestions in one after another, nearest first
  {
    const s: number[] = [];
    for (let i = nConn + nRing; i < N; i++) s.push(i);
    s.sort((a, b) => ringIndex[a] - ringIndex[b] || ang[a] - ang[b]);
    s.forEach((id, k) => (joinAt[id] = (k / s.length) * 0.78));
  }

  // constellation lines between connections close to each other (soft springs, 5% hairlines in the app)
  const links: number[] = [];
  const linkLen: number[] = [];
  const linkNew: number[] = []; // > 0: drawn in by the world's connect beat, at this threshold
  const extraLinks = look === 'world' ? Math.round(nConn * 0.7) : 0;

  /* ------------------------------------------------------------------ the sea of points and the crowd */
  // Ambient points (never people, never counted) in loose spiral arms, each with a depth for parallax.
  // The world adds the crowd: points that join in the builders beat.
  const nSea = look === 'app' ? 340 : lite ? 300 : 620;
  const nCrowd = look === 'world' ? (lite ? 650 : 1500) : 0;
  const M = nSea + nCrowd;
  const ax = new Float32Array(M);
  const ay = new Float32Array(M);
  const adepth = new Float32Array(M);
  const asize = new Float32Array(M);
  const atint = new Uint8Array(M);
  const aph = new Float32Array(M);
  const ajoin = new Float32Array(M); // crowd: join threshold in the builders beat; sea: -1
  const anear = new Int16Array(M); // crowd: the connection it joins (a hairline while it flashes)

  /* ------------------------------------------------------------------ sizes */
  let cssW = 1;
  let cssH = 1;
  let dpr = 1;
  let unit = 1; // CSS px per design unit
  let maxR = 0; // world: furthest ring

  /** Places everyone for the current canvas size (world radii follow the viewport). */
  function layout() {
    if (look === 'app') {
      // rest lengths in iPhone points: the busiest tie close (kMapRestNear), the quietest further out
      for (let i = 0; i < nConn; i++) {
        base[i] = 46 + 78 * Math.pow(1 - str[i], 0.85);
        rad[i] = 6 + 4.5 * str[i];
      }
      for (let i = nConn; i < N; i++) {
        base[i] = 150 + ringIndex[i] * 26 + (ph[i] / TAU - 0.5) * 12;
        rad[i] = role[i] === ROLE_SUGG ? 3.6 : 4.2;
      }
    } else {
      // the world: a desktop screen holds a wide network, a phone a tall one
      const span = Math.max(cssW, cssH);
      const k = Math.min(1.15, Math.max(0.62, span / 1440));
      for (let i = 0; i < nConn; i++) {
        base[i] = (40 + 250 * Math.pow(1 - str[i], 0.9)) * k;
        rad[i] = (lite ? 5.2 : 6) + (lite ? 3.2 : 4.5) * str[i];
      }
      const ring0 = 330 * k;
      const step = (lite ? 64 : 78) * k;
      maxR = 0;
      for (let i = nConn; i < N; i++) {
        base[i] = ring0 + ringIndex[i] * step + (ph[i] / TAU - 0.5) * step * 0.7;
        maxR = Math.max(maxR, base[i]);
        rad[i] = role[i] === ROLE_SUGG ? 3.4 : 3.1;
      }
    }
    // springs start at home, so the first frame is already settled
    for (let i = 0; i < N; i++) {
      homeOf(i, 0);
      px[i] = hx;
      py[i] = hy;
      vx[i] = vy[i] = 0;
    }
    // the random links below come from their own seed, made fresh for each layout: on the shared `rand` every
    // resize (a phone's URL bar showing or hiding was enough) drew a different set of hairlines
    const lr = rng((opts.seed ?? 7) + 57);
    // links: each connection to its two nearest connections (by home position)
    links.length = linkLen.length = linkNew.length = 0;
    const seen = new Set<number>();
    for (let i = 0; i < nConn; i++) {
      let b1 = -1;
      let b2 = -1;
      let d1 = Infinity;
      let d2 = Infinity;
      for (let j = 0; j < nConn; j++) {
        if (j === i) continue;
        const d = (px[i] - px[j]) ** 2 + (py[i] - py[j]) ** 2;
        if (d < d1) {
          d2 = d1;
          b2 = b1;
          d1 = d;
          b1 = j;
        } else if (d < d2) {
          d2 = d;
          b2 = j;
        }
      }
      for (const j of [b1, b2]) {
        if (j < 0) continue;
        const key = Math.min(i, j) * 1000 + Math.max(i, j);
        if (seen.has(key)) continue;
        seen.add(key);
        links.push(i, j);
        linkLen.push(Math.hypot(px[i] - px[j], py[i] - py[j]));
        linkNew.push(0);
      }
    }
    // a faint mesh among the people around the network (the app's constellation hairlines), so the
    // outer field reads as people who know each other, not as loose dots on spokes
    const meshLinks = look === 'world' ? Math.round(nRing * 0.8) : Math.round(nRing * 0.5);
    for (let e = 0; e < meshLinks; e++) {
      const i = nConn + Math.floor(lr() * nRing);
      let best = -1;
      let bd = Infinity;
      for (let j = nConn; j < nConn + nRing; j++) {
        if (j === i) continue;
        const d = (px[i] - px[j]) ** 2 + (py[i] - py[j]) ** 2;
        if (d < bd) {
          bd = d;
          best = j;
        }
      }
      if (best < 0) continue;
      const key = Math.min(i, best) * 1000 + Math.max(i, best);
      if (seen.has(key)) continue;
      seen.add(key);
      links.push(i, best);
      linkLen.push(Math.sqrt(bd));
      linkNew.push(0);
    }
    // the connect beat draws extra lines out to the rings (connections meeting people around them)
    for (let e = 0; e < extraLinks; e++) {
      const i = Math.floor(lr() * nConn);
      let best = -1;
      let bd = Infinity;
      for (let j = nConn; j < nConn + nRing; j++) {
        const d = (px[i] - px[j]) ** 2 + (py[i] - py[j]) ** 2;
        if (d < bd && lr() < 0.5) {
          bd = d;
          best = j;
        }
      }
      if (best < 0) continue;
      links.push(i, best);
      linkLen.push(Math.sqrt(bd));
      linkNew.push(0.05 + (e / extraLinks) * 0.75);
    }
    layoutSea();
  }

  /** Scatters the sea (and the world's crowd) over the area the canvas can show. */
  function layoutSea() {
    const r2 = rng((opts.seed ?? 7) + 99);
    // spiral arms around the hub, reaching past the screen edges
    const reachX = look === 'app' ? designW * 0.85 : Math.max(cssW, 900) * 0.95;
    const reachY = look === 'app' ? 900 / stretchY : Math.max(cssH, 700) * 0.9;
    const arms = 3;
    for (let p = 0; p < M; p++) {
      const crowd = p >= nSea;
      let x: number;
      let y: number;
      if (!crowd && r2() < 0.72) {
        const arm = Math.floor(r2() * arms);
        const t = Math.pow(r2(), 0.7);
        const a = (arm / arms) * TAU + t * 3.4 + (r2() - 0.5) * 0.9;
        const r = 0.12 + t * 0.95;
        x = Math.cos(a) * r * reachX;
        y = Math.sin(a) * r * reachY;
      } else {
        // the crowd fills the whole screen around the network, in loose clusters
        const a = r2() * TAU;
        const r = Math.sqrt(r2()) * (crowd ? 1.05 : 1.1);
        x = Math.cos(a) * r * reachX * (crowd ? 1.08 : 1);
        y = Math.sin(a) * r * reachY * (crowd ? 1.12 : 1);
        if (crowd && r2() < 0.55) {
          // pull toward a few cluster centres, so it reads as groups of builders rather than noise
          const c = Math.floor(r2() * 9);
          const ca = c * 1.7 + 0.4;
          const cr = (0.35 + (c % 3) * 0.24) * reachX;
          x = x * 0.42 + Math.cos(ca) * cr;
          y = y * 0.42 + Math.sin(ca) * cr * 0.62;
        }
      }
      ax[p] = x;
      ay[p] = y;
      adepth[p] = 0.45 + r2() * 0.55;
      // tints in contiguous blocks (positions are random anyway), so the loop sets fillStyle three times, not M
      const q = crowd ? (p - nSea) / Math.max(1, nCrowd) : p / nSea;
      atint[p] = q < (look === 'app' ? 0.7 : 0.8) ? 0 : q < (look === 'app' ? 0.86 : 0.91) ? 1 : 2;
      asize[p] = crowd ? 0.8 + r2() * 0.9 : 0.5 + Math.pow(r2(), 2.4) * 1.9;
      aph[p] = r2() * TAU;
      ajoin[p] = -1;
      anear[p] = -1;
    }
    if (nCrowd) {
      // the crowd joins in waves from the network outward
      let far = 1;
      for (let p = nSea; p < M; p++) far = Math.max(far, Math.hypot(ax[p], ay[p]));
      for (let p = nSea; p < M; p++) {
        const d = Math.hypot(ax[p], ay[p]) / far;
        ajoin[p] = clamp01(d * 0.8 + r2() * 0.2) * 0.96;
        let best = 0;
        let bd = Infinity;
        for (let i = 0; i < nConn; i++) {
          const dd = (px[i] - ax[p]) ** 2 + (py[i] - ay[p]) ** 2;
          if (dd < bd) {
            bd = dd;
            best = i;
          }
        }
        anear[p] = best;
      }
    }
  }

  /* ------------------------------------------------------------------ physics */
  let hx = 0;
  let hy = 0;
  /** Where person `i` wants to be at time `t` (sets hx, hy): their slot, breathing slowly. */
  function homeOf(i: number, t: number) {
    const a = ang[i] + 0.014 * Math.sin(t * 0.31 + ph[i] * 1.7);
    let r = base[i] * (1 + 0.02 * Math.sin(t * 0.7 + ph[i]));
    if (look === 'world' && net.hub.keep > 0) {
      // keep the phone clear: the distance to its edge along this direction, eased by `keep`
      const c = Math.abs(Math.cos(a)) || 1e-4;
      const s = Math.abs(Math.sin(a)) || 1e-4;
      const edge = Math.min((net.hub.keepW + 26) / c, (net.hub.keepH + 22) / s);
      r += edge * net.hub.keep;
    }
    hx = Math.cos(a) * r;
    hy = Math.sin(a) * r;
  }

  let simT = 0;
  let acc = 0;
  let drag = -1;
  let dragX = 0;
  let dragY = 0;
  let dragVX = 0;
  let dragVY = 0;

  /** One fixed 1/60 s step: springs home, links, the dragged dot and its neighbours. */
  function step() {
    simT += STEP;
    const K = 10;
    const KR = 6;
    const C = 5.2;
    for (let i = 0; i < N; i++) {
      if (i === drag) continue;
      homeOf(i, simT);
      const k = role[i] === ROLE_CONN ? K : KR;
      let fx = -k * (px[i] - hx) - C * vx[i];
      let fy = -k * (py[i] - hy) - C * vy[i];
      if (drag >= 0) {
        // the dragged dot shoulders people aside (repulsion only within a short radius)
        const dx = px[i] - px[drag];
        const dy = py[i] - py[drag];
        const d2 = dx * dx + dy * dy;
        const R = look === 'app' ? 34 : 70;
        if (d2 < R * R && d2 > 0.01) {
          const d = Math.sqrt(d2);
          const f = ((R - d) / R) * 900;
          fx += (dx / d) * f;
          fy += (dy / d) * f;
        }
      }
      vx[i] += fx * STEP;
      vy[i] += fy * STEP;
    }
    // constellation springs: dragging one connection tugs the ones it is linked to
    for (let e = 0; e < links.length; e += 2) {
      const a = links[e];
      const b = links[e + 1];
      const dx = px[b] - px[a];
      const dy = py[b] - py[a];
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = (1.6 * (d - linkLen[e >> 1])) / d;
      if (a !== drag) {
        vx[a] += dx * f * STEP;
        vy[a] += dy * f * STEP;
      }
      if (b !== drag) {
        vx[b] -= dx * f * STEP;
        vy[b] -= dy * f * STEP;
      }
    }
    for (let i = 0; i < N; i++) {
      if (i === drag) {
        px[i] = dragX;
        py[i] = dragY;
        vx[i] = dragVX;
        vy[i] = dragVY;
        continue;
      }
      const sp = vx[i] * vx[i] + vy[i] * vy[i];
      const max = look === 'app' ? 900 : 2200;
      if (sp > max * max) {
        const k = max / Math.sqrt(sp);
        vx[i] *= k;
        vy[i] *= k;
      }
      px[i] += vx[i] * STEP;
      py[i] += vy[i] * STEP;
    }
  }

  /* ------------------------------------------------------------------ pulses (feedback travelling along ties) */
  const PMAX = 56;
  const pFrom = new Int16Array(PMAX); // person index, or -1 for the hub
  const pTo = new Int16Array(PMAX);
  const pT = new Float32Array(PMAX);
  const pDur = new Float32Array(PMAX);
  const pOn = new Uint8Array(PMAX);
  let pAcc = 0;
  function spawnPulse() {
    let slot = -1;
    for (let k = 0; k < PMAX; k++) if (!pOn[k]) { slot = k; break; }
    if (slot < 0) return;
    let i = Math.floor(rand() * nConn);
    if (vis[i] < 0.25) i = Math.floor(rand() * nConn);
    if (vis[i] < 0.15) return;
    const r = rand();
    if (r < 0.5) {
      pFrom[slot] = i;
      pTo[slot] = -1;
    } else if (r < 0.78) {
      pFrom[slot] = -1;
      pTo[slot] = i;
    } else {
      // along a constellation line, builder to builder
      const e = Math.floor(rand() * (links.length / 2)) * 2;
      if (linkNew[e >> 1] > 0) return;
      pFrom[slot] = links[e];
      pTo[slot] = links[e + 1];
    }
    pT[slot] = 0;
    pDur[slot] = 0.85 + rand() * 0.75;
    pOn[slot] = 1;
  }

  /* ------------------------------------------------------------------ ripples (a click on the world) */
  const RMAX = 5;
  const rX = new Float32Array(RMAX);
  const rY = new Float32Array(RMAX);
  const rT = new Float32Array(RMAX).fill(-1);

  /* ------------------------------------------------------------------ bubbles (the feedback beat) */
  const bubOwner = new Int16Array(BUBBLES.length).fill(-1);
  const bubW = new Float32Array(BUBBLES.length);
  let bubOn = false;

  /* ------------------------------------------------------------------ sprites */
  const glows: HTMLCanvasElement[] = KIND_COLOURS.map((c) => glowSprite(c));
  const glowNeutral = glowSprite(L.neutral);
  const glowHub = glowSprite(L.hub, 256);
  const kindStr = KIND_COLOURS.slice();
  const calmStr = KIND_COLOURS.map((c) => mixHex(c, L.neutral, 0.5));
  const tintStr = KIND_COLOURS.map((c) => mixHex(c, L.shadow, 0.62));
  const neutralStr = L.neutral;
  const seaStr = L.sea;
  // connection dots with initials, drawn once at device resolution and blitted
  const dotSprites: (HTMLCanvasElement | null)[] = new Array(N).fill(null);
  let spritePx = 0;
  const fontFamily = "Inter, 'Hanken Grotesk', system-ui, sans-serif";

  /** Renders every connection's dot (deep tint, ring, initials) at the current pixel scale. */
  function buildSprites() {
    const pxScale = dpr * unit;
    spritePx = pxScale;
    for (let i = 0; i < N; i++) {
      if (role[i] !== ROLE_CONN) continue;
      const r = rad[i];
      const size = Math.ceil((r + 1.5) * 2 * pxScale);
      const c = dotSprites[i] ?? document.createElement('canvas');
      c.width = c.height = size;
      const g = c.getContext('2d')!;
      g.clearRect(0, 0, size, size);
      g.setTransform(pxScale, 0, 0, pxScale, size / 2, size / 2);
      const col = kind[i] < 0 ? neutralStr : kindStr[kind[i]];
      g.beginPath();
      g.arc(0, 0, r, 0, TAU);
      g.fillStyle = kind[i] < 0 ? mixHex(L.neutral, L.shadow, 0.7) : tintStr[kind[i]];
      g.fill();
      g.lineWidth = 1.1;
      g.strokeStyle = col;
      g.beginPath();
      g.arc(0, 0, r - 0.55, 0, TAU);
      g.stroke();
      if (r >= 6.4) {
        g.fillStyle = L.ink;
        g.globalAlpha = 0.92;
        g.font = `600 ${Math.round(r * 0.78 * 10) / 10}px ${fontFamily}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(inits[i], 0, r * 0.06);
        g.globalAlpha = 1;
      }
      dotSprites[i] = c;
    }
    // name widths for label placement
    ctx.font = labelFont;
    for (let i = 0; i < N; i++) nameW[i] = ctx.measureText(names[i]).width;
    ctx.font = lineFont;
    for (let i = 0; i < N; i++) lineW[i] = kind[i] >= 0 ? ctx.measureText(KIND_LINES[kind[i]]).width : 0;
    ctx.font = bubbleFont;
    for (let b = 0; b < BUBBLES.length; b++) bubW[b] = ctx.measureText(BUBBLES[b]).width;
  }
  // the app's names are 11 points: in the phone they scale with the drawn screen (set in resize)
  let labelFont = `600 13px ${fontFamily}`;
  let lineFont = `500 11px ${fontFamily}`;
  const bubbleFont = `500 13px 'Hanken Grotesk', ${fontFamily}`;

  // the app's faint dot grid in map space, painted once per size and blitted
  let grid: HTMLCanvasElement | null = null;
  function buildGrid() {
    if (look !== 'app') return;
    const g = grid ?? document.createElement('canvas');
    g.width = Math.max(1, Math.round(cssW * dpr));
    g.height = Math.max(1, Math.round(cssH * dpr));
    const c = g.getContext('2d')!;
    c.clearRect(0, 0, g.width, g.height);
    c.setTransform(dpr * unit, 0, 0, dpr * unit, 0, 0);
    const sp = 24;
    const cx = designW / 2;
    const cy = (opts.hubY ?? 430);
    c.fillStyle = '#434A51';
    const H = cssH / unit;
    for (let y = cy % sp; y < H; y += sp) {
      for (let x = cx % sp; x < designW; x += sp) {
        const d = Math.hypot((x - cx) / designW, (y - cy) / H) * 2;
        const a = 0.42 * (1 - smooth((d - 0.35) / 0.75));
        if (a <= 0.01) continue;
        c.globalAlpha = a;
        c.fillRect(x - 0.6, y - 0.6, 1.2, 1.2);
      }
    }
    grid = g;
  }

  /* ------------------------------------------------------------------ pointer */
  const target = opts.pointerTarget ?? canvas;
  let ptrX = -1e5;
  let ptrY = -1e5;
  let ptrIn = false;
  let hover = -1;
  let camX = 0;
  let camY = 0;
  let camTX = 0;
  let camTY = 0;
  let lastMoveT = 0;
  let downX = 0;
  let downY = 0;
  let downT = 0;

  /** Pointer position in canvas CSS px (the app look reads its own local coordinates, so a tilted phone still hits). */
  function toCanvas(e: PointerEvent): boolean {
    if (look === 'app' && e.target === canvas) {
      ptrX = e.offsetX;
      ptrY = e.offsetY;
      return true;
    }
    const r = canvas.getBoundingClientRect();
    if (!r.width) return false;
    ptrX = ((e.clientX - r.left) / r.width) * cssW;
    ptrY = ((e.clientY - r.top) / r.height) * cssH;
    return true;
  }
  /** The person under (x, y) in canvas CSS px, or -1. */
  function hit(x: number, y: number): number {
    let best = -1;
    let bd = Infinity;
    const slop = look === 'app' ? 7 : 10;
    for (let i = 0; i < N; i++) {
      if (vis[i] < 0.35) continue;
      const r = rad[i] * unit + slop;
      const d = (sx[i] - x) ** 2 + (sy[i] - y) ** 2;
      if (d < r * r && d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  }
  /** Screen to map space (undoes the hub offset, the camera and the app's vertical stretch). */
  function toMap(x: number, y: number) {
    const hubX = look === 'app' ? (designW / 2) * unit : net.hub.x;
    const hubY = look === 'app' ? (opts.hubY ?? 430) * unit : net.hub.y;
    mapX = (x - hubX - camX) / unit;
    mapY = (y - hubY - camY) / (unit * stretchY);
  }
  let mapX = 0;
  let mapY = 0;

  const onMove = (e: PointerEvent) => {
    if (reduced) return;
    if (drag < 0 && opts.ignore?.(e.target)) {
      ptrIn = false;
      hover = -1;
      setCursor('');
      return;
    }
    if (!toCanvas(e)) return;
    ptrIn = true;
    lastMoveT = performance.now();
    if (drag >= 0) {
      toMap(ptrX, ptrY);
      const dt = Math.max(0.008, (performance.now() - dragLastT) / 1000);
      dragVX = dragVX * 0.6 + ((mapX - dragX) / dt) * 0.4;
      dragVY = dragVY * 0.6 + ((mapY - dragY) / dt) * 0.4;
      dragX = mapX;
      dragY = mapY;
      dragLastT = performance.now();
      wake();
      return;
    }
    if (e.pointerType === 'mouse') {
      hover = hit(ptrX, ptrY);
      setCursor(hover >= 0 ? 'grab' : '');
    }
    wake();
  };
  let dragLastT = 0;
  const onDown = (e: PointerEvent) => {
    if (reduced || opts.ignore?.(e.target)) return;
    if (!toCanvas(e)) return;
    pressing = true;
    downX = ptrX;
    downY = ptrY;
    downT = performance.now();
    const h = hit(ptrX, ptrY);
    // touch never grabs: a swipe over the map must still scroll the page
    if (h >= 0 && e.pointerType !== 'touch') {
      drag = h;
      toMap(ptrX, ptrY);
      dragX = mapX;
      dragY = mapY;
      dragVX = dragVY = 0;
      dragLastT = performance.now();
      try {
        target.setPointerCapture(e.pointerId);
      } catch {
        /* the target cannot capture (already released) */
      }
      setCursor('grabbing');
      e.preventDefault();
    }
    wake();
  };
  const onUp = (e: PointerEvent) => {
    if (reduced) return;
    pressing = false;
    const wasDrag = drag;
    if (drag >= 0) {
      // thrown: it keeps its release velocity and the spring wobbles it home
      vx[drag] = dragVX;
      vy[drag] = dragVY;
      drag = -1;
      try {
        target.releasePointerCapture(e.pointerId);
      } catch {
        /* not captured */
      }
      setCursor(hover >= 0 ? 'grab' : '');
    }
    if (opts.ignore?.(e.target)) return;
    // a tap or click that did not drag: light the person up, or ripple the world and tie someone in
    const moved = Math.hypot(ptrX - downX, ptrY - downY);
    if (wasDrag < 0 && moved < 8 && performance.now() - downT < 500 && toCanvas(e)) {
      const h = hit(ptrX, ptrY);
      if (h >= 0) {
        flash[h] = 1;
        tapLit = h;
        tapLitT = simT;
        // lit for 2.2 s, then it eases back (full rate on a touch screen until then)
        busyUntil = simT + 2.8;
      } else if (look === 'world') {
        ripple(ptrX, ptrY);
        tieNearest(ptrX, ptrY);
      }
    }
    wake();
  };
  const onLeave = () => {
    ptrIn = false;
    hover = -1;
    if (drag < 0) setCursor('');
  };
  let tapLit = -1;
  let tapLitT = 0;
  let cursor = '';
  function setCursor(c: string) {
    if (c === cursor) return;
    cursor = c;
    target.style.cursor = c;
  }
  function ripple(x: number, y: number) {
    let k = 0;
    for (let j = 1; j < RMAX; j++) if (rT[j] < rT[k]) k = j;
    rX[k] = x;
    rY[k] = y;
    rT[k] = simT;
    // the ring runs 1.4 s and the person it ties in lights up: full rate on a touch screen until both are done
    busyUntil = Math.max(busyUntil, simT + 2);
  }
  /** A click on empty space ties the nearest suggestion to the hub: a new connection lights up. */
  function tieNearest(x: number, y: number) {
    let best = -1;
    let bd = Infinity;
    for (let i = nConn + nRing; i < N; i++) {
      if (forced[i] >= 0 || vis[i] < 0.2) continue;
      if (net.beats.connect > joinAt[i] + 0.18) continue; // already tied in by the scroll
      const d = (sx[i] - x) ** 2 + (sy[i] - y) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    if (best >= 0 && bd < 420 * 420) forced[best] = simT;
  }

  if (!reduced) {
    target.addEventListener('pointermove', onMove, { passive: true });
    target.addEventListener('pointerdown', onDown);
    target.addEventListener('pointerup', onUp, { passive: true });
    target.addEventListener('pointercancel', onUp, { passive: true });
    target.addEventListener('pointerleave', onLeave, { passive: true });
  }

  /* ------------------------------------------------------------------ frame */
  let raf = 0;
  let running = false;
  let drawing = true;
  let lastT = 0;
  // On a touch screen the canvas is drawn about 30 times a second while nobody touches it: what moves on its own is
  // slow ambient life (the sea and the crowd drift about half a pixel a second, the people breathe, the feedback
  // pulses glide along their ties with a tail) and the beats are eased from the scroll, so it looks the same at 30,
  // while every drawn frame is the whole screen of dots, ties and glows (about 1100 canvas calls a frame in the intro,
  // its raster and upload; 2026-11-09 audit, VE-02). The simulation still advances every frame with the frame's own
  // dt, so the physics are exact. Full rate while a finger or button is down, and while a tap's ripple or lit person
  // plays (busyUntil). (The pulses are not counted as interaction: the feedback beat sends about two a second for the
  // whole act, so "full rate while a pulse runs" meant full rate nine frames in ten.)
  const coarse = typeof matchMedia === 'function' && matchMedia('(hover: none) and (pointer: coarse)').matches;
  const LITE_MS = 1000 / 30 - 4;
  let lastDraw = -1e9;
  let pressing = false;
  let busyUntil = -1;
  let idleSince = 0;
  let appReveal = reduced ? 1 : 0;
  let appRevealStart = -1;
  let entranceSkipped = false;
  let appTieT = 0;
  let appTie = -1;

  function wake() {
    if (running && !raf) raf = requestAnimationFrame(frame);
  }

  let failed = 0; // frames in a row that threw
  let reported = false;
  let dead = false; // stopped for good after a failure that keeps repeating: start() does nothing any more
  /** Logs the first failure, in production too, so the console (and any error reporter) gets one line. */
  function report(err: unknown) {
    if (reported) return;
    reported = true;
    console.error('[vaultt network] a frame failed', err);
  }
  /** One animation frame. The next one is booked first, so one frame that throws never stops the loop. */
  function frame(now: number) {
    raf = 0;
    if (!running) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, lastT ? (now - lastT) / 1000 : STEP);
    lastT = now;
    try {
      tick(dt);
      if (drawing && (!coarse || pressing || drag >= 0 || simT < busyUntil || now - lastDraw >= LITE_MS)) {
        lastDraw = now;
        draw();
      }
      failed = 0;
    } catch (err) {
      report(err);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      // a one-off throw costs one frame. One that repeats (a bad value stuck in the state) used to burn a
      // full frame of work 60 times a second over a half-painted canvas, silently: after five in a row the
      // loop stops and leaves one last still frame
      if (++failed >= 5) giveUp();
    }
  }
  /** Stops the loop for good and paints what it can: the current state, or a clean empty canvas if even that throws. */
  function giveUp() {
    dead = true;
    net.stop();
    try {
      draw();
    } catch {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  /** Advances everything by dt seconds (physics in fixed steps, eased values, pulses). */
  function tick(dt: number) {
    opts.onFrame?.(net, dt);
    acc += dt;
    let n = 0;
    while (acc >= STEP && n < MAX_STEPS) {
      step();
      acc -= STEP;
      n++;
    }
    if (n === MAX_STEPS) acc = 0;
    // the camera leans away from the pointer a touch: deep points move less (parallax)
    if (look === 'world' && ptrIn && drag < 0) {
      camTX = -(ptrX - cssW / 2) * 0.014;
      camTY = -(ptrY - cssH / 2) * 0.014;
    } else if (!ptrIn) {
      camTX *= 0.96;
      camTY *= 0.96;
    }
    const ce = 1 - Math.exp(-dt * 3.2);
    camX += (camTX - camX) * ce;
    camY += (camTY - camY) * ce;
    const le = 1 - Math.exp(-dt * 9);
    const fe = Math.exp(-dt * 2.4);
    for (let i = 0; i < N; i++) {
      const want = i === hover || i === drag || (i === tapLit && simT - tapLitT < 2.2) ? 1 : 0;
      lit[i] += (want - lit[i]) * le;
      flash[i] *= fe;
    }
    // app: the entrance (ties draw out, dots bloom by strength), then life: chats pulse, someone new connects
    if (look === 'app' && !reduced) {
      if (appRevealStart < 0) appRevealStart = entranceSkipped ? simT - 10 : simT;
      appReveal = clamp01((simT - appRevealStart) / 1.9);
      pAcc += dt * (appReveal >= 1 ? 1.6 : 0);
      if (simT - appTieT > 5.5) {
        appTieT = simT;
        appTie = nConn + nRing + Math.floor(rand() * nSugg);
        forced[appTie] = simT;
      }
    }
    if (look === 'world') pAcc += dt * net.beats.feedback * (lite ? 14 : 24);
    while (pAcc >= 1) {
      spawnPulse();
      pAcc -= 1;
    }
    for (let k = 0; k < PMAX; k++) {
      if (!pOn[k]) continue;
      pT[k] += dt / pDur[k];
      if (pT[k] >= 1) {
        pOn[k] = 0;
        if (pTo[k] >= 0) flash[pTo[k]] = 1;
      }
    }
    // forced ties in the app fade back to suggestions after a while, so the map keeps breathing
    if (look === 'app') for (let i = nConn + nRing; i < N; i++) if (forced[i] >= 0 && simT - forced[i] > 9) forced[i] = -1;
    if (ptrIn) idleSince = simT;
  }

  /** Tie progress of a suggestion (0 = still a hollow ring, 1 = tied to the hub). */
  function tieOf(i: number): number {
    let t = 0;
    if (look === 'world' && joinAt[i] >= 0) t = clamp01((net.beats.connect - joinAt[i]) / 0.18);
    if (forced[i] >= 0) t = Math.max(t, clamp01((simT - forced[i]) / 0.7));
    if (look === 'app' && forced[i] >= 0 && simT - forced[i] > 8) t = Math.min(t, clamp01(1 - (simT - forced[i] - 8)));
    return t;
  }
  /** How much the text shield dims a point at (x, y): 1 clear, down to 0.22 under the copy. */
  function shieldAt(x: number, y: number): number {
    let m = 1;
    for (let s = 0; s < net.shield.length; s++) {
      const r = net.shield[s];
      const dx = Math.max(r.x - x, 0, x - (r.x + r.w));
      const dy = Math.max(r.y - y, 0, y - (r.y + r.h));
      const d = Math.sqrt(dx * dx + dy * dy);
      const f = 0.22 + 0.78 * smooth(d / 90);
      if (f < m) m = f;
    }
    return m;
  }

  const tmp = { x: 0, y: 0 };

  /** Paints the current state. */
  function draw() {
    const W = cssW;
    const H = cssH;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    if (L.bg) {
      ctx.fillStyle = L.bg;
      ctx.fillRect(0, 0, W, H);
    } else ctx.clearRect(0, 0, W, H);

    const b = net.beats;
    const calm = look === 'world' ? 1 - 0.62 * b.calm : 1;
    const reveal = look === 'world' ? b.reveal : appReveal;
    const hubX = look === 'app' ? (designW / 2) * unit : net.hub.x;
    const hubY = look === 'app' ? (opts.hubY ?? 430) * unit : net.hub.y;
    const t = simT;
    const u = unit;

    // world: the light behind the phone (the viewer's blue bloom in the app)
    if (look === 'world') {
      const s = Math.max(W, H) * 0.95;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.34 * (0.35 + 0.65 * reveal) * calm;
      ctx.drawImage(glowHub, hubX - s / 2, hubY - s / 2, s, s);
      ctx.globalCompositeOperation = 'source-over';
    } else if (grid) {
      ctx.globalAlpha = 1;
      ctx.drawImage(grid, 0, 0, W, H);
    }

    /* the sea and the crowd */
    const seaA = look === 'world' ? b.sea * calm : 1;
    const crowdOn = look === 'world' ? b.builders : 0;
    const repR = look === 'world' ? 150 : 46 * u;
    let tintNow = -1;
    for (let p = 0; p < M; p++) {
      const crowd = p >= nSea;
      let a: number;
      let joinFlash = 0;
      if (crowd) {
        const j = ajoin[p];
        if (crowdOn <= j) continue;
        const since = crowdOn - j;
        joinFlash = since < 0.08 ? 1 - since / 0.08 : 0;
        a = (0.42 + 0.5 * joinFlash) * smooth(since / 0.02) * calm * (0.55 + 0.45 * b.sea);
      } else a = (look === 'app' ? 0.38 : 0.5) * seaA;
      if (a <= 0.01) continue;
      const d = adepth[p];
      const drift = look === 'app' ? 5 : 9;
      let x = ax[p] * (look === 'app' ? u : 1) + Math.sin(t * 0.13 + aph[p]) * drift * d;
      let y = ay[p] * (look === 'app' ? u * stretchY : 1) + Math.cos(t * 0.11 + aph[p] * 1.3) * drift * d;
      x = hubX + x + camX * d;
      y = (look === 'world' ? hubY * d + (1 - d) * (H * 0.5) : hubY) + y + camY * d;
      if (x < -4 || x > W + 4 || y < -4 || y > H + 4) continue;
      if (ptrIn) {
        const dx = x - ptrX;
        const dy = y - ptrY;
        const d2 = dx * dx + dy * dy;
        if (d2 < repR * repR && d2 > 0.5) {
          const dd = Math.sqrt(d2);
          const f = (1 - dd / repR) ** 2 * (look === 'world' ? 26 : 8 * u) * d;
          x += (dx / dd) * f;
          y += (dy / dd) * f;
        }
      }
      for (let k = 0; k < RMAX; k++) {
        if (rT[k] < 0) continue;
        const age = t - rT[k];
        if (age > 1.4) continue;
        const rr = age * 300;
        const dx = x - rX[k];
        const dy = y - rY[k];
        const dd = Math.sqrt(dx * dx + dy * dy) || 1;
        const band = 1 - Math.min(1, Math.abs(dd - rr) / 60);
        if (band > 0) {
          const f = band * 16 * (1 - age / 1.4);
          x += (dx / dd) * f;
          y += (dy / dd) * f;
          a = Math.min(1, a + band * 0.4 * (1 - age / 1.4));
        }
      }
      if (look === 'world') {
        if (y < net.fadeTop) a *= smooth(y / net.fadeTop) * 0.85 + 0.15 * (y > 0 ? 1 : 0);
        if (net.shield.length) a *= 0.45 + 0.55 * shieldAt(x, y);
      }
      const s = asize[p] * (0.6 + 0.4 * d) * (look === 'app' ? u : 1) * (1 + joinFlash * 1.6);
      ctx.globalAlpha = a * (0.55 + 0.45 * d);
      if (atint[p] !== tintNow) {
        tintNow = atint[p];
        ctx.fillStyle = seaStr[tintNow];
      }
      if (s < 1.4) ctx.fillRect(x - s / 2, y - s / 2, s, s);
      else {
        ctx.beginPath();
        ctx.arc(x, y, Math.max(0, s / 2), 0, TAU);
        ctx.fill();
      }
      // a builder joining: a hairline to the connection they joined through, while it flashes
      if (joinFlash > 0.05) {
        // joining: a small ring opens around the newcomer and a thread runs to the person they came through
        ctx.strokeStyle = seaStr[0];
        ctx.globalAlpha = joinFlash * 0.55 * calm;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.arc(x, y, 2.5 + (1 - joinFlash) * 9, 0, TAU);
        ctx.stroke();
        const i = anear[p];
        // only short threads: a newcomer far from anyone gets the ring alone (long ones fanned across the copy)
        const tl = (sx[i] - x) ** 2 + (sy[i] - y) ** 2;
        if (i >= 0 && vis[i] > 0.2 && tl < 240 * 240) {
          ctx.globalAlpha = joinFlash * 0.42 * calm * vis[i] * (1 - Math.sqrt(tl) / 240);
          ctx.lineWidth = 0.6;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(sx[i], sy[i]);
          ctx.stroke();
        }
        ctx.fillStyle = seaStr[tintNow];
      }
    }

    /* screen positions and visibility of the people */
    for (let i = 0; i < N; i++) {
      const isConn = role[i] === ROLE_CONN;
      const x = hubX + px[i] * u + camX;
      const y = hubY + py[i] * u * stretchY + camY;
      sx[i] = x;
      sy[i] = y;
      let a: number;
      if (isConn) a = clamp01((reveal * 1.6 - order[i] * 0.6 - 0.55) / 0.3);
      else a = clamp01((reveal * 1.4 - order[i] * 0.7 - 0.2) / 0.35);
      if (look === 'app' && y < topInset * u) a *= clamp01((y - (topInset - 46) * u) / (46 * u));
      if (look === 'world') {
        if (net.shield.length) a *= shieldAt(x, y);
        if (y < net.fadeTop) a *= smooth(y / net.fadeTop);
        a *= calm;
      }
      vis[i] = a;
    }

    /* constellation lines (hairlines between connections, and the connect beat's new ones) */
    ctx.lineCap = 'round';
    for (let e = 0; e < links.length; e += 2) {
      const i = links[e];
      const j = links[e + 1];
      const nw = linkNew[e >> 1];
      let draw = 1;
      if (nw > 0) {
        if (look !== 'world') continue;
        draw = clamp01((b.connect - nw) / 0.2);
        if (draw <= 0) continue;
      }
      const a = Math.min(vis[i], vis[j] > 0 ? vis[j] : vis[i] * 0.6) * (look === 'app' ? 0.07 : nw > 0 ? 0.2 : 0.1) * (1 + (lit[i] + lit[j]) * 2.5);
      if (a <= 0.005) continue;
      const k = kind[i];
      ctx.strokeStyle = k < 0 ? neutralStr : nw > 0 ? calmStr[k] : kindStr[k];
      ctx.globalAlpha = Math.min(1, a);
      ctx.lineWidth = (look === 'app' ? 0.7 : 0.8) * (look === 'app' ? u : 1);
      ctx.beginPath();
      ctx.moveTo(sx[i], sy[i]);
      ctx.lineTo(sx[i] + (sx[j] - sx[i]) * easeOut(draw), sy[i] + (sy[j] - sy[i]) * easeOut(draw));
      ctx.stroke();
    }

    /* ties to the hub: an additive wide glow under a thin core, brighter the more they chat */
    const crowd = 1; // glows already scaled for ~60-90 ties
    for (let i = 0; i < N; i++) {
      const isConn = role[i] === ROLE_CONN;
      let tie = 1;
      let s = str[i];
      if (!isConn) {
        if (role[i] !== ROLE_SUGG) continue;
        tie = tieOf(i);
        if (tie <= 0) continue;
        s = 0.35;
      }
      const v = isConn ? clamp01((reveal * 1.6 - order[i] * 0.6) / 0.55) : tie;
      if (v <= 0) continue;
      const k = kind[i];
      const col = k < 0 ? neutralStr : kindStr[k];
      const ex = hubX + (sx[i] - hubX) * easeOut(v);
      const ey = hubY + (sy[i] - hubY) * easeOut(v);
      // the line fades with what it crosses (the copy, the soft top edge, the calm), not with its dot's entrance
      const a = look === 'world' ? shieldLine(i) * calm : 1;
      const lt = lit[i];
      const w = look === 'app' ? u : 1;
      // on navy the quiet ties show more than on charcoal: the world draws them a fifth softer
      const soft = look === 'world' ? 0.62 + 0.38 * s : 1;
      if (s > 0.08) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = col;
        ctx.globalAlpha = (lt > 0.01 ? 0.03 + 0.09 * s + lt * 0.1 : 0.03 + 0.09 * s) * crowd * a * soft;
        ctx.lineWidth = (3 + 9 * s) * w;
        ctx.beginPath();
        ctx.moveTo(hubX, hubY);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.strokeStyle = col;
      ctx.globalAlpha = Math.min(1, ((0.18 + 0.34 * s) * soft + lt * 0.3 + flash[i] * 0.3) * a);
      ctx.lineWidth = (0.8 + 1.4 * s) * w;
      ctx.beginPath();
      ctx.moveTo(hubX, hubY);
      ctx.lineTo(ex, ey);
      ctx.stroke();
    }

    /* where the ties meet with no "You" over them (only on a world whose host sets `viewer`, the homepage): their
       additive glows piled up into one white-hot point, so the middle is taken out softly and a faint blue light
       is left in its place. The rays dissolve into it instead of flaring. It goes as the "You" comes in. */
    if (look === 'world' && net.hub.viewer >= 0) {
      const hole = 1 - viewerShown(hubX, hubY);
      if (hole > 0.02) {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.globalAlpha = 0.85 * hole;
        const hs = 48;
        ctx.drawImage(holeSprite(), hubX - hs / 2, hubY - hs / 2, hs, hs);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.55 * hole * reveal * calm;
        const gs = 96;
        ctx.drawImage(glowHub, hubX - gs / 2, hubY - gs / 2, gs, gs);
        ctx.globalCompositeOperation = 'source-over';
      }
    }

    /* feedback pulses: a bright head with a short tail */
    ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < PMAX; k++) {
      if (!pOn[k]) continue;
      const f = pFrom[k];
      const to = pTo[k];
      const x0 = f < 0 ? hubX : sx[f];
      const y0 = f < 0 ? hubY : sy[f];
      const x1 = to < 0 ? hubX : sx[to];
      const y1 = to < 0 ? hubY : sy[to];
      const who = f >= 0 ? f : to;
      const kk = kind[who];
      const spr = kk < 0 ? glowNeutral : glows[kk];
      const fade = Math.min(1, pT[k] * 6, (1 - pT[k]) * 6) * (look === 'world' ? calm * shieldLine(who) : 1);
      for (let tail = 0; tail < 4; tail++) {
        const tt = clamp01(easeInOut(pT[k]) - tail * 0.035);
        const x = x0 + (x1 - x0) * tt;
        const y = y0 + (y1 - y0) * tt;
        const s = (look === 'app' ? 9 * u : 24) * (1 - tail * 0.2);
        ctx.globalAlpha = fade * (tail === 0 ? 0.95 : 0.45 - tail * 0.1);
        ctx.drawImage(spr, x - s / 2, y - s / 2, s, s);
      }
    }

    /* blooms: one additive sprite per person, connections strongest */
    const hubS = (look === 'app' ? 66 : 0) * u;
    if (look === 'app') {
      ctx.globalAlpha = 0.42 * reveal;
      ctx.drawImage(glowHub, hubX - hubS / 2, hubY - hubS / 2, hubS, hubS);
    }
    for (let i = 0; i < N; i++) {
      if (vis[i] <= 0.02) continue;
      const isConn = role[i] === ROLE_CONN;
      const tie = isConn ? 1 : role[i] === ROLE_SUGG ? tieOf(i) : 0;
      const k = kind[i];
      const lt = lit[i];
      const fl = flash[i];
      let g = isConn ? 0.22 + 0.4 * str[i] : tie * 0.4;
      g = g * 0.62 + lt * 0.5 + fl * 0.55; // calm: about 60% of the first version until hovered
      if (g <= 0.01) continue;
      const s = (rad[i] * (isConn ? 5.5 : 7) * (1 + lt * 0.5 + fl * 0.6)) * u;
      ctx.globalAlpha = Math.min(1, g * vis[i]);
      ctx.drawImage(k < 0 ? glowNeutral : glows[k], sx[i] - s / 2, sy[i] - s / 2, s, s);
    }
    ctx.globalCompositeOperation = 'source-over';

    /* dots */
    for (let i = 0; i < N; i++) {
      const a = vis[i];
      if (a <= 0.02) continue;
      const k = kind[i];
      const r = rad[i] * u * (1 + lit[i] * 0.18 + flash[i] * 0.25);
      if (role[i] === ROLE_CONN) {
        const spr = dotSprites[i];
        const bloom = clamp01((reveal * 1.6 - order[i] * 0.6 - 0.55) / 0.3);
        const s = (rad[i] + 1.5) * 2 * u * (1 + lit[i] * 0.18 + flash[i] * 0.25) * (0.6 + 0.4 * easeOut(bloom));
        ctx.globalAlpha = a;
        if (spr) ctx.drawImage(spr, sx[i] - s / 2, sy[i] - s / 2, s, s);
        continue;
      }
      const tie = role[i] === ROLE_SUGG ? tieOf(i) : 0;
      const col = k < 0 ? neutralStr : tie > 0.5 || lit[i] > 0.5 ? kindStr[k] : calmStr[k];
      if (role[i] === ROLE_SUGG && tie < 1) {
        // a suggestion: a hollow ring that fills as it is tied in
        ctx.globalAlpha = a * (0.55 + 0.45 * tie);
        ctx.strokeStyle = col;
        ctx.lineWidth = 1.1 * (look === 'app' ? u : 1);
        ctx.beginPath();
        ctx.arc(sx[i], sy[i], Math.max(0, r), 0, TAU);
        ctx.stroke();
        if (tie > 0) {
          ctx.globalAlpha = a * tie;
          ctx.fillStyle = col;
          ctx.beginPath();
          ctx.arc(sx[i], sy[i], Math.max(0, r * tie), 0, TAU);
          ctx.fill();
        }
      } else {
        ctx.globalAlpha = a * (role[i] === ROLE_SUGG ? 1 : 0.88);
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(sx[i], sy[i], Math.max(0, r), 0, TAU);
        ctx.fill();
      }
    }

    /* the viewer in the middle: a drawn avatar over a blue bloom. On the world it shows once the phone
       has moved off the hub (on phones), so the ties always end at someone */
    if (look === 'app') drawViewer(hubX, hubY, reveal);
    else if (viewerAmt() > 0.02) {
      const k = viewerShown(hubX, hubY);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.5 * k;
      const s = 120;
      ctx.drawImage(glowHub, hubX - s / 2, hubY - s / 2, s, s);
      ctx.globalCompositeOperation = 'source-over';
      drawViewer(hubX, hubY, reveal * k);
    }

    /* satellites: small project stills orbiting the strongest connections (the app shows them from zoom 0.55) */
    if (look === 'app') drawSatellites(reveal);

    /* labels */
    drawLabels();

    /* bubbles: feedback landing next to builders */
    if (look === 'world') drawBubbles();

    /* ripples */
    for (let k = 0; k < RMAX; k++) {
      if (rT[k] < 0) continue;
      const age = t - rT[k];
      if (age > 1.4) {
        rT[k] = -1;
        continue;
      }
      ctx.globalAlpha = 0.32 * (1 - age / 1.4);
      ctx.strokeStyle = L.hub;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(rX[k], rY[k], Math.max(0, age * 300), 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (glass.length) drawGlass();
  }

  /* ------------------------------------------------------------------ glass (the app's look, touch screens)
     The app screen's frosted controls (NetworkScreen.astro's .vs__glass buttons and .vs__pill--dark, the iOS tab bar's
     .lg__glass, the Android pill .ap) sit over this canvas with a CSS backdrop-filter, and the canvas redraws every
     frame, so each of them was its own blur pass over a fresh backdrop on every frame: 16 across the homepage's two
     phones (2026-11-09 audit, sys-05). On a touch screen the canvas draws the frost itself under each one: a mip chain
     of the frame (halved four or five times, each a single drawImage of a small canvas), and from it each control's box
     scaled back up, clipped to its rounded shape (bilinear upscaling from 1/16 is the blur). Their tint, rims and icons
     stay in the page; .vs--glass on the screen takes their backdrop-filter off. Their sizes and corners are read on
     resize, in the screen's own layout pixels (offsets, so the phones' turns and tilts do not enter). */
  type GlassBox = { x: number; y: number; w: number; h: number; r: number; k: number };
  let glass: GlassBox[] = [];
  const mips: HTMLCanvasElement[] = [];
  const screen = look === 'app' && coarse ? canvas.closest<HTMLElement>('.vs') : null;
  // each control's backdrop blur in the screen's points (--u), as NetworkScreen, LiquidGlassBar and AndroidPillBar set it
  const GLASS: [string, number][] = [['.vs__glass', 8], ['.vs__pill--dark', 10], ['.lg__glass', 5], ['.ap', 24]];
  function measureGlass() {
    if (!screen) return;
    const u = parseFloat(getComputedStyle(screen).getPropertyValue('--u')) || 1;
    const out: GlassBox[] = [];
    for (const [sel, blurU] of GLASS) {
      screen.querySelectorAll<HTMLElement>(sel).forEach((el) => {
        let x = 0;
        let y = 0;
        let n: HTMLElement | null = el;
        while (n && n !== screen) {
          x += n.offsetLeft;
          y += n.offsetTop;
          n = n.offsetParent as HTMLElement | null;
        }
        if (n !== screen || !el.offsetWidth) return;
        const w = el.offsetWidth;
        const h = el.offsetHeight;
        const r = Math.min(parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0, w / 2, h / 2);
        // the mip level whose upscale blurs about as much as the CSS blur: a level 2^k down spreads about 0.4 * 2^k px
        const sigma = blurU * u * dpr;
        const k = Math.max(1, Math.min(6, Math.round(Math.log2(sigma / 0.4))));
        out.push({ x, y, w, h, r, k });
      });
    }
    glass = out;
    const levels = out.reduce((m, g) => Math.max(m, g.k), 0);
    for (let k = 1; k <= levels; k++) {
      const c = mips[k - 1] ?? (mips[k - 1] = document.createElement('canvas'));
      const w = Math.max(1, Math.ceil(canvas.width / 2 ** k));
      const h = Math.max(1, Math.ceil(canvas.height / 2 ** k));
      if (c.width !== w || c.height !== h) {
        c.width = w;
        c.height = h;
      }
    }
    screen.classList.toggle('vs--glass', out.length > 0);
  }
  function drawGlass() {
    const levels = glass.reduce((m, g) => Math.max(m, g.k), 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    // the chain: each level is the one above halved (bilinear at exactly half averages each 2x2 block)
    let src: HTMLCanvasElement = canvas;
    for (let k = 1; k <= levels; k++) {
      const m = mips[k - 1];
      const g = m.getContext('2d')!;
      g.imageSmoothingEnabled = true;
      g.drawImage(src, 0, 0, src.width, src.height, 0, 0, m.width, m.height);
      src = m;
    }
    ctx.imageSmoothingEnabled = true;
    for (const b of glass) {
      const s = 2 ** b.k;
      const x = b.x * dpr;
      const y = b.y * dpr;
      const w = b.w * dpr;
      const h = b.h * dpr;
      ctx.save();
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x, y, w, h, b.r * dpr);
      else ctx.rect(x, y, w, h);
      ctx.clip();
      ctx.drawImage(mips[b.k - 1], x / s, y / s, w / s, h / s, x, y, w, h);
      ctx.restore();
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /** How much of the drawn "You" shows at the hub (world): the host's `viewer`, or the inverse of the clearance. */
  function viewerAmt(): number {
    return net.hub.viewer >= 0 ? net.hub.viewer : 1 - net.hub.keep;
  }

  /** How much of the "You" the world draws this frame: viewerAmt(), gone entirely while copy passes over the hub
   *  (a faint disc behind a digit reads as a smudge) and with the calm, so nothing of it is left when the next
   *  section's world takes over. The soft middle under the ties (draw()) uses the same amount, so one hands over
   *  to the other. */
  function viewerShown(hubX: number, hubY: number): number {
    return viewerAmt() * (1 - net.beats.calm) * (net.shield.length ? smooth((shieldAt(hubX, hubY) - 0.35) / 0.6) : 1);
  }

  let holeCanvas: HTMLCanvasElement | null = null;
  /** A soft disc of alpha (its colour is never used), made on first use: draw() takes the middle out of the ties
   *  with it where they meet and no "You" covers them. Its own falloff, wider and softer than glowSprite's, so the
   *  rays fade into the middle rather than stopping at a ring. */
  function holeSprite(): HTMLCanvasElement {
    if (holeCanvas) return holeCanvas;
    const c = (holeCanvas = document.createElement('canvas'));
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(0,0,0,1)');
    grad.addColorStop(0.3, 'rgba(0,0,0,0.85)');
    grad.addColorStop(0.65, 'rgba(0,0,0,0.3)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    return c;
  }

  /** A tie's alpha from the shield along it: the mean of its two ends, so a line into the copy fades as it goes. */
  function shieldLine(i: number): number {
    if (look !== 'world' || !net.shield.length) return 1;
    const hubA = shieldAt(net.hub.x, net.hub.y);
    const endA = shieldAt(sx[i], sy[i]);
    const mid = shieldAt((sx[i] + net.hub.x) / 2, (sy[i] + net.hub.y) / 2);
    let a = Math.min(1, (hubA + endA + mid) / 3);
    if (sy[i] < net.fadeTop) a *= smooth(sy[i] / net.fadeTop);
    return a;
  }

  function easeInOut(v: number) {
    return v < 0.5 ? 2 * v * v : 1 - Math.pow(-2 * v + 2, 2) / 2;
  }

  const viewerFill = (() => {
    const c = document.createElement('canvas');
    return c;
  })();
  let viewerPx = 0;
  /** The viewer: a ringed avatar with initials over the app's blue bloom (a drawn avatar, no photo). */
  function drawViewer(x: number, y: number, reveal: number) {
    const r = 22 * unit;
    const pxs = Math.ceil((r + 3) * 2 * dpr);
    if (viewerPx !== pxs) {
      viewerPx = pxs;
      viewerFill.width = viewerFill.height = pxs;
      const g = viewerFill.getContext('2d')!;
      g.setTransform(dpr, 0, 0, dpr, pxs / 2, pxs / 2);
      const grad = g.createLinearGradient(-r, -r, r, r);
      grad.addColorStop(0, '#8CC6FF');
      grad.addColorStop(1, '#1C63F8');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(0, 0, r, 0, TAU);
      g.fill();
      g.fillStyle = '#0E1A33';
      g.globalAlpha = 0.85;
      g.font = `700 ${r * 0.72}px ${fontFamily}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('You', 0, r * 0.05);
      g.globalAlpha = 1;
      g.lineWidth = 2;
      g.strokeStyle = 'rgba(238,240,241,0.9)';
      g.beginPath();
      g.arc(0, 0, r + 1.5, 0, TAU);
      g.stroke();
    }
    const s = (pxs / dpr) * (0.7 + 0.3 * easeOut(reveal * 2));
    ctx.globalAlpha = clamp01(reveal * 3);
    ctx.drawImage(viewerFill, x - s / 2, y - s / 2, s, s);
  }

  const satOwners: number[] = [];
  /** Small project stills orbiting a few strong connections, framed in their colour. */
  function drawSatellites(reveal: number) {
    if (!satOwners.length) for (let i = 0; i < Math.min(14, nConn); i++) satOwners.push(i * 2 + 1);
    const u = unit;
    for (let n = 0; n < satOwners.length; n++) {
      const i = satOwners[n];
      if (vis[i] < 0.3) continue;
      const a = ph[i] + simT * 0.12 * (n % 2 ? 1 : -1);
      const rr = (rad[i] + 8.5) * u;
      const x = sx[i] + Math.cos(a) * rr;
      const y = sy[i] + Math.sin(a) * rr;
      const h = 5.2 * u;
      const k = kind[i] < 0 ? 0 : kind[i];
      ctx.globalAlpha = vis[i] * 0.95 * clamp01(reveal * 2 - 1);
      ctx.fillStyle = tintStr[k];
      roundRect(x - h, y - h, h * 2, h * 2, 2 * u);
      ctx.fill();
      // a still's suggestion: a lighter band across, in the person's colour
      ctx.globalAlpha *= 0.55;
      ctx.fillStyle = calmStr[k];
      roundRect(x - h + 1.4 * u, y - 0.5 * u, h * 2 - 2.8 * u, h - 1.2 * u, 1 * u);
      ctx.fill();
      ctx.globalAlpha = vis[i] * 0.8 * clamp01(reveal * 2 - 1);
      ctx.strokeStyle = kindStr[k];
      ctx.lineWidth = 0.9 * u;
      roundRect(x - h, y - h, h * 2, h * 2, 2 * u);
      ctx.stroke();
    }
  }

  function roundRect(x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* labels: placed every few frames (greedy, highest priority first), drawn every frame */
  const LMAX = look === 'app' ? 46 : 3;
  const labIdx = new Int16Array(LMAX).fill(-1);
  const labSide = new Int8Array(LMAX);
  const labTwo = new Uint8Array(LMAX);
  let labCount = 0;
  let labFrame = 0;
  const rects = new Float32Array(LMAX * 4);
  const prio: number[] = [];
  // the label order (connections by strength, the lit one first), made once instead of a fresh closure per placement
  const byPrio = (a: number, b: number) =>
    (role[b] === ROLE_CONN ? 2 + str[b] : 0) + lit[b] * 9 - ((role[a] === ROLE_CONN ? 2 + str[a] : 0) + lit[a] * 9);
  function placeLabels() {
    labCount = 0;
    if (look === 'world') {
      // the world names only the person under the pointer (or the one being dragged, or tapped)
      const who = drag >= 0 ? drag : hover >= 0 ? hover : tapLit >= 0 && simT - tapLitT < 2.2 ? tapLit : -1;
      if (who >= 0) {
        labIdx[0] = who;
        // the side facing away from the hub (never under the phone), unless that runs off the screen
        const w = Math.max(nameW[who], lineW[who]) + rad[who] + 8;
        let side = sx[who] >= net.hub.x ? 0 : 1;
        if (side === 0 && sx[who] + w > cssW - 8) side = 1;
        else if (side === 1 && sx[who] - w < 8) side = 0;
        labSide[0] = side;
        labTwo[0] = kind[who] >= 0 ? 1 : 0;
        labCount = 1;
      }
      return;
    }
    // the app: connections strongest first, then people around, skipping any that would collide
    prio.length = 0;
    for (let i = 0; i < N; i++) if (vis[i] > 0.6) prio.push(i);
    prio.sort(byPrio);
    const u = unit;
    for (let q = 0; q < prio.length && labCount < LMAX; q++) {
      const i = prio[q];
      const r = rad[i] * u;
      const two = kind[i] >= 0 && (role[i] === ROLE_CONN ? str[i] > 0.25 : (i % 3 === 0));
      const w = Math.max(nameW[i], two ? lineW[i] : 0);
      const h = (two ? 24 : 13) * u;
      let placed = false;
      for (let side = 0; side < 2 && !placed; side++) {
        const x0 = side === 0 ? sx[i] + r + 4 * u : sx[i] - r - 4 * u - w;
        const y0 = sy[i] - 6.5 * u;
        if (x0 < 4 * u || x0 + w > cssW - 4 * u || y0 < (topInset + 4) * u || y0 + h > cssH - 150 * u) continue;
        let clash = false;
        for (let k = 0; k < labCount && !clash; k++) {
          const o = k * 4;
          if (x0 < rects[o + 2] + 3 && x0 + w > rects[o] - 3 && y0 < rects[o + 3] + 2 && y0 + h > rects[o + 1] - 2) clash = true;
        }
        // never over someone's dot
        for (let j = 0; j < N && !clash; j++) {
          if (j === i || vis[j] < 0.3) continue;
          const rr = rad[j] * u + 2;
          if (sx[j] + rr > x0 && sx[j] - rr < x0 + w && sy[j] + rr > y0 && sy[j] - rr < y0 + h) clash = true;
        }
        const hubR = 26 * u;
        if (!clash && (designW / 2) * u + hubR > x0 && (designW / 2) * u - hubR < x0 + w && (opts.hubY ?? 430) * u + hubR > y0 && (opts.hubY ?? 430) * u - hubR < y0 + h) clash = true;
        if (clash) continue;
        const o = labCount * 4;
        rects[o] = x0;
        rects[o + 1] = y0;
        rects[o + 2] = x0 + w;
        rects[o + 3] = y0 + h;
        labIdx[labCount] = i;
        labSide[labCount] = side;
        labTwo[labCount] = two ? 1 : 0;
        labCount++;
        placed = true;
      }
    }
  }
  function drawLabels() {
    if (labFrame++ % (look === 'app' ? 9 : 1) === 0) placeLabels();
    const u = look === 'app' ? unit : 1;
    for (let k = 0; k < labCount; k++) {
      const i = labIdx[k];
      const a = look === 'app' ? vis[i] : Math.max(lit[i], 0.0001) * vis[i] + (drag === i ? 1 : 0);
      if (a <= 0.02) continue;
      const r = rad[i] * (look === 'app' ? unit : 1);
      const side = labSide[k];
      const x = side === 0 ? sx[i] + r + 5 * u : sx[i] - r - 5 * u;
      const two = labTwo[k] && kind[i] >= 0;
      let dy = 0;
      if (look === 'world') {
        // both lines stay inside what the screen shows of the canvas, clear of the nav band: a person dragged
        // to the bottom edge had their second line cut by the canvas, so near an edge the label slides inward
        const vTop = net.view.height ? net.view.top : 0;
        const bottom = Math.min(cssH, net.view.height ? vTop + net.view.height : cssH) - 8;
        const last = sy[i] + (two ? 23 : 8);
        if (last > bottom) dy = bottom - last;
        const first = sy[i] - 8 + dy;
        const top = vTop + net.view.clearTop + 6;
        if (first < top) dy += top - first;
        // a soft navy halo keeps the name readable over the crowd
        ctx.shadowColor = 'rgba(8,24,46,0.9)';
        ctx.shadowBlur = 8;
      }
      ctx.textAlign = side === 0 ? 'left' : 'right';
      ctx.textBaseline = 'alphabetic';
      ctx.font = labelFont;
      ctx.fillStyle = L.label;
      ctx.globalAlpha = Math.min(1, a) * (look === 'app' ? 0.95 : 1);
      ctx.fillText(names[i], x, sy[i] + (look === 'app' ? 3.6 * u : 4) + dy);
      if (two) {
        ctx.font = lineFont;
        ctx.fillStyle = look === 'app' ? L.labelSoft : calmStr[kind[i]];
        ctx.fillText(KIND_LINES[kind[i]], x, sy[i] + (look === 'app' ? 15 * u : 19) + dy);
      }
      ctx.shadowBlur = 0;
      ctx.shadowColor = 'transparent';
    }
  }

  /** Three bits of feedback land next to builders while the feedback beat is on. */
  // the bubbles placed this frame (x, y, w, h), so a later one never sits on an earlier one
  const bubRects = new Float32Array(BUBBLES.length * 4);
  function drawBubbles() {
    const on = net.beats.feedback;
    if (on <= 0.02) {
      if (bubOn) {
        bubOn = false;
        bubOwner.fill(-1);
      }
      return;
    }
    if (!bubOn) {
      bubOn = true;
      const picks: number[] = [];
      pickVisible(BUBBLES.length + 2, picks);
      for (let b2 = 0; b2 < BUBBLES.length; b2++) bubOwner[b2] = picks[b2] ?? -1;
    }
    let placed = 0;
    let fontSet = false;
    for (let k = 0; k < BUBBLES.length; k++) {
      const i = bubOwner[k];
      if (i < 0) continue;
      const appear = smooth((on - 0.18 - k * 0.2) / 0.16);
      if (appear <= 0.01) continue;
      // the bubble keeps its owner's entrance, edge fade and calm but not the copy's shade on the owner: a
      // person near a text block is dimmed, and their bubble came out at a fifth of its strength. Text near the
      // bubble itself still fades it (below)
      const a = appear * Math.min(1, vis[i] / (net.shield.length ? shieldAt(sx[i], sy[i]) : 1));
      if (a <= 0.02) continue;
      const w = bubW[k] + 40;
      const h = 32;
      // on the side away from the phone, unless that runs off the screen
      let right = sx[i] >= net.hub.x;
      if (right && sx[i] + 14 + w > cssW - 12) right = false;
      else if (!right && sx[i] - 14 - w < 12) right = true;
      const x = right ? sx[i] + 14 : sx[i] - 14 - w;
      const y = sy[i] - h - 10 - (1 - appear) * 10;
      if (behindPhone(x, y) || behindPhone(x + w, y + h) || behindPhone(x + w, y) || behindPhone(x, y + h)) continue;
      if (net.view.height && y < net.view.top + net.view.clearTop + 8) continue;
      // nor over the "You" avatar once it shows (phones, after the phone has scrolled past): it fades near it
      let hubClear = 1;
      if (viewerAmt() > 0.02) {
        const hx2 = Math.max(x, Math.min(net.hub.x, x + w));
        const hy2 = Math.max(y, Math.min(net.hub.y, y + h));
        hubClear = smooth((Math.sqrt((hx2 - net.hub.x) ** 2 + (hy2 - net.hub.y) ** 2) - 30) / 18);
        if (hubClear <= 0.01) continue;
      }
      // a bubble never sits under the copy: it fades out as it nears a text block
      let clear = 1;
      for (let s = 0; s < net.shield.length; s++) {
        const r = net.shield[s];
        const dx = Math.max(r.x - (x + w), 0, x - (r.x + r.w));
        const dy = Math.max(r.y - (y + h), 0, y - (r.y + r.h));
        clear = Math.min(clear, smooth(Math.sqrt(dx * dx + dy * dy) / 40));
      }
      clear *= hubClear;
      // nor on another bubble: two builders close together stacked their bubbles edge to edge, so the later
      // one fades out as it nears an earlier one and comes back once their people drift apart
      for (let q = 0; q < placed; q++) {
        const ox = bubRects[q * 4];
        const oy = bubRects[q * 4 + 1];
        const dx = Math.max(ox - (x + w), 0, x - (ox + bubRects[q * 4 + 2]));
        const dy = Math.max(oy - (y + h), 0, y - (oy + bubRects[q * 4 + 3]));
        clear = Math.min(clear, smooth((Math.sqrt(dx * dx + dy * dy) - 6) / 16));
      }
      if (clear <= 0.01) continue;
      bubRects[placed * 4] = x;
      bubRects[placed * 4 + 1] = y;
      bubRects[placed * 4 + 2] = w;
      bubRects[placed * 4 + 3] = h;
      placed++;
      // a navy underlay that stays solid while the bubble fades, so a fading bubble dims instead of
      // turning see-through (the field's dots showed through its words)
      ctx.globalAlpha = Math.min(1, a * clear * 2.4);
      ctx.fillStyle = '#0C2748';
      roundRect(x - 1, y - 1, w + 2, h + 2, 17);
      ctx.fill();
      ctx.globalAlpha = a * clear;
      ctx.fillStyle = '#123058';
      roundRect(x, y, w, h, 16);
      ctx.fill();
      ctx.strokeStyle = 'rgba(232,241,255,0.16)';
      ctx.lineWidth = 1;
      ctx.stroke();
      const k2 = kind[i] < 0 ? 0 : kind[i];
      ctx.fillStyle = kindStr[k2];
      ctx.beginPath();
      ctx.arc(x + 16, y + h / 2, 5, 0, TAU);
      ctx.fill();
      // the font only once a bubble is really drawn: every ctx.font assignment first brings the page's style up to
      // date (Chromium), and after the frame's DOM writes that was a forced style recalc on every frame of the
      // homepage world (feedback 0.16, no bubble ever shows): 146 recalcs, 364 ms in 4.5 s of phone-4x scroll
      if (!fontSet) {
        fontSet = true;
        ctx.font = bubbleFont;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
      }
      ctx.fillStyle = '#E8F1FF';
      ctx.fillText(BUBBLES[k], x + 28, y + h / 2 + 0.5);
      flash[i] = Math.max(flash[i], appear < 0.9 ? 0.6 : 0);
    }
  }

  /** True when (x, y) sits behind the phone (or the phone peeking out beside it), where nothing should come from. */
  function behindPhone(x: number, y: number): boolean {
    const h = net.hub;
    if (look !== 'world' || h.keep < 0.5) return false;
    return x > h.x - h.keepW * 2.5 && x < h.x + h.keepW + 28 && Math.abs(y - h.y) < h.keepH + 28;
  }

  /** Fills `into` with up to n people on screen, clear of the copy, the nav and the phone, and spread apart. */
  function pickVisible(n: number, into: number[]): number {
    into.length = 0;
    const margin = 60;
    // the window the screen shows (the world canvas is taller than the screen)
    const top = look === 'world' && net.view.height ? net.view.top + Math.max(margin, net.view.clearTop + 40) : margin;
    const bottom = look === 'world' && net.view.height ? net.view.top + net.view.height - margin : cssH - margin;
    for (let pass = 0; pass < 2 && into.length < n; pass++) {
      for (let q = 0; q < N && into.length < n; q++) {
        const i = (q * 37 + pass * 11) % N;
        if (role[i] === ROLE_SUGG) continue;
        if (vis[i] < (pass ? 0.3 : 0.6)) continue;
        if (sx[i] < margin || sx[i] > cssW - margin || sy[i] < top || sy[i] > bottom) continue;
        if (behindPhone(sx[i], sy[i])) continue;
        let close = false;
        for (const j of into) if ((sx[j] - sx[i]) ** 2 + (sy[j] - sy[i]) ** 2 < 160 * 160) close = true;
        if (close && !pass) continue;
        into.push(i);
      }
    }
    return into.length;
  }

  /* ------------------------------------------------------------------ size and lifecycle */
  /** Sizes the backing store and lays everyone out again. Returns false (and does nothing) when the canvas kept
   *  its CSS size and pixel ratio: every reallocation of the world's canvas costs up to 25 MB of fresh pixels. */
  function resize(): boolean {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return false;
    // Touch screens: at most 1.5x and a smaller budget (2.2 Mpx for the world, 0.9 for a phone's map). The world is
    // the whole screen, redrawn and uploaded every drawn frame: at 2x a 393x852 phone held 786x1704 (5.4 MB), at 1.5x
    // 590x1278 (3 MB, -44%); its content is soft dots, glows and hairlines under the copy's shield (P4, VE-04).
    const budget = look === 'world' ? (coarse ? 2.2e6 : 6.4e6) : coarse ? 0.9e6 : 1.8e6;
    const d = Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2, Math.sqrt(budget / (w * h)));
    if (w === cssW && h === cssH && d === dpr && canvas.width === Math.round(w * d)) return false;
    cssW = w;
    cssH = h;
    dpr = d;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    unit = look === 'app' ? w / designW : 1;
    if (look === 'app') {
      labelFont = `500 ${(11 * unit).toFixed(2)}px ${fontFamily}`;
      lineFont = `400 ${(9.5 * unit).toFixed(2)}px ${fontFamily}`;
    }
    layout();
    buildSprites();
    buildGrid();
    measureGlass();
    return true;
  }

  const net: Network = {
    canvas,
    hub: { x: 0, y: 0, keepW: 0, keepH: 0, keep: 0, viewer: -1 },
    shield: [],
    fadeTop: 0,
    view: { top: 0, height: 0, clearTop: 0 },
    beats: { reveal: look === 'app' || reduced ? 1 : 0, sea: look === 'app' ? 1 : 0, builders: 0, feedback: 0, connect: 0, calm: 0 },
    get running() {
      return running;
    },
    screenOf(i, out) {
      out.x = sx[i];
      out.y = sy[i];
      return vis[i] > 0.05;
    },
    pickVisible,
    start() {
      if (reduced || running || dead) return;
      running = true;
      lastT = 0;
      raf = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
      raf = 0;
    },
    setDrawing(on) {
      if (on === drawing) return;
      drawing = on;
      // the frame this is called in shows the current state, as the loop would have drawn it (a throw here
      // must not escape into the host's scroll handler)
      if (on && running) {
        try {
          draw();
        } catch (err) {
          report(err);
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = 1;
        }
      }
    },
    skipEntrance() {
      entranceSkipped = true;
      if (appRevealStart >= 0) appRevealStart = simT - 10;
    },
    paint() {
      // single frames run from scroll and resize handlers: a throw here would surface in every one of them
      try {
        opts.onFrame?.(net, 0);
        draw();
      } catch (err) {
        report(err);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
      }
    },
    resize() {
      // resize() skips the costly part (a new backing store, the layout, the sprites) when the canvas kept its
      // size; a still map repaints either way, since the host may have moved the hub or the shield
      resize();
      if (!running) net.paint();
    },
    destroy() {
      net.stop();
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerdown', onDown);
      target.removeEventListener('pointerup', onUp);
      target.removeEventListener('pointercancel', onUp);
      target.removeEventListener('pointerleave', onLeave);
    },
  };

  resize();
  // Text on the canvas: the dots' initials (Inter 600), the names and second lines (Inter 600 and 500 on the world,
  // 500 and 400 in the app, set in resize()), the drawn "You" (Inter 700) and the feedback bubbles (Hanken Grotesk
  // 500). A canvas never redraws by itself when a font arrives: whatever face was there when a sprite was built or
  // a still map painted stays. So every face actually drawn is loaded, for the characters drawn (the right
  // unicode-range files), and only once all of them are in are the sprites rebuilt (the "You" one too) and a still
  // map repainted. Tried waiting for Inter 600 alone: when 600 landed first, a still map repainted with it and kept
  // a fallback face for its 500 and 400 labels, and the "You" sprite kept whichever face it was first built with.
  if (document.fonts && document.fonts.load) {
    const text = Array.from(new Set([...names, ...inits, ...KIND_LINES, 'You'].join(''))).join('');
    const faces = [labelFont, lineFont, `600 12px ${fontFamily}`, `700 12px ${fontFamily}`];
    const loads = faces.map((f) => document.fonts.load(f, text));
    if (look === 'world') loads.push(document.fonts.load(bubbleFont, Array.from(new Set(BUBBLES.join(''))).join('')));
    Promise.all(loads)
      .then(() => {
        buildSprites();
        viewerPx = 0;
        if (!running) net.paint();
      })
      .catch(() => {});
  }
  void tmp;
  void idleSince;
  return net;
}
