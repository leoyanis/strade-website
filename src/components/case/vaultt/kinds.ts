/*
 * Every project on Vaultt as one square, stacked by kind (VtKinds.astro). One 2D canvas, one pre-drawn
 * sprite per colour, typed arrays for the ~1,270 tiles, no allocation in the frame loop.
 *
 * - Assembly, scrubbed by the scroll: squares fall into their column, bottom row first, and hop once as
 *   they land, so each column grows like a stack. Scrolling back up lifts them out again.
 * - Play, once landed: the pointer pushes squares out of its way and each springs back to its slot
 *   (fixed 1/60 s steps, slightly underdamped so they wobble home).
 * - Hover (or tap) a column: the other columns dim and its label shows its count.
 * Runs only while on screen and only while something moves (scroll, springs, a fade); otherwise no frame
 * is booked. Reduced motion / ?still: the finished chart, painted once (hover still works).
 */

interface Group { id: string; label: string; n: number; c: string[] }

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (v: number) => {
  const t = clamp01(v);
  return t * t * (3 - 2 * t);
};
const STEP = 1 / 60;

/** Seeded random numbers (mulberry32): the same scatter on every visit. */
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
function shade(h: string, k: number): string {
  const [r, g, b] = hexRgb(h);
  const f = (c: number) => Math.round(k >= 0 ? c + (255 - c) * k : c * (1 + k));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

/** Sets up the chart. */
export function initKinds(o: { still: boolean }) {
  const chart = document.querySelector<HTMLElement>('.vt-kinds__chart');
  const canvas = chart?.querySelector<HTMLCanvasElement>('.vt-kinds__canvas');
  if (!chart || !canvas) return;
  const groups: Group[] = JSON.parse(chart.dataset.kinds || '[]');
  if (!groups.length) return;
  const labs = Array.from(chart.querySelectorAll<HTMLElement>('.vt-kinds__lab'));
  const ctx = canvas.getContext('2d')!;
  const still = o.still;
  chart.classList.add('has-js');

  /* ---------- tiles ---------- */
  const G = groups.length;
  const N = groups.reduce((s, g) => s + g.n, 0);
  const maxN = Math.max(...groups.map((g) => g.n));
  const tg = new Uint8Array(N); // group
  const tv = new Uint8Array(N); // colour variant
  const tk = new Uint16Array(N); // index inside the group
  const jx = new Float32Array(N); // scatter: x offset in pitches
  const jy = new Float32Array(N); // scatter: height above the canvas, 0..1
  const jr = new Float32Array(N); // spin while falling
  const jd = new Float32Array(N); // delay jitter
  const slotX = new Float32Array(N);
  const slotY = new Float32Array(N);
  const delay = new Float32Array(N);
  const ox = new Float32Array(N); // spring offsets (play)
  const oy = new Float32Array(N);
  const vx = new Float32Array(N);
  const vy = new Float32Array(N);
  {
    const rand = rng(1270);
    let i = 0;
    groups.forEach((g, gi) => {
      for (let k = 0; k < g.n; k++, i++) {
        tg[i] = gi;
        tk[i] = k;
        tv[i] = Math.floor(rand() * g.c.length);
        jx[i] = (rand() - 0.5) * 7;
        jy[i] = rand();
        jr[i] = (rand() - 0.5) * 1.4;
        jd[i] = rand();
      }
    });
  }

  /* ---------- layout ---------- */
  let W = 1;
  let H = 1;
  let dpr = 1;
  let P = 10; // pitch (tile + gap)
  let S = 8; // tile size
  let C = 8; // columns per group
  let rows = 1;
  let base = 0; // y of the bottom row's bottom edge
  const gx0 = new Float32Array(G);
  let gw = 1;
  let gap = 20;
  const sprites: HTMLCanvasElement[][] = groups.map((g) => g.c.map(() => document.createElement('canvas')));

  /** Picks columns per group so the chart is about as tall as it is meant to be, then places every slot. */
  function layout() {
    W = canvas!.clientWidth || 1;
    const narrow = W < 560;
    gap = narrow ? 10 : Math.min(36, Math.max(16, W * 0.026));
    const target = narrow ? Math.min(440, W * 1.22) : Math.min(470, Math.max(320, W * 0.42));
    const maxP = narrow ? 12 : 19;
    let best = 8;
    let bestScore = Infinity;
    for (let c = 4; c <= 18; c++) {
      const p = Math.min(maxP, (W - gap * (G - 1)) / (G * c));
      const h = Math.ceil(maxN / c) * p;
      const score = Math.abs(h - target) + (p < 6 ? 999 : 0);
      if (score < bestScore) {
        bestScore = score;
        best = c;
      }
    }
    C = best;
    P = Math.min(maxP, (W - gap * (G - 1)) / (G * C));
    S = P - Math.max(1.5, P * 0.2);
    rows = Math.ceil(maxN / C);
    // room above the tallest column for the squares to fall through
    const head = Math.round(P * 3);
    H = Math.round(rows * P + head + 4);
    base = H - 2;
    canvas!.style.height = `${H}px`;
    gw = C * P;
    const used = G * gw + (G - 1) * gap;
    const off = (W - used) / 2;
    for (let g = 0; g < G; g++) gx0[g] = off + g * (gw + gap);
    for (let i = 0; i < N; i++) {
      const k = tk[i];
      const col = k % C;
      const row = Math.floor(k / C);
      slotX[i] = gx0[tg[i]] + col * P + P / 2;
      slotY[i] = base - row * P - P / 2;
      // bottom rows first, so the columns grow upward; a little jitter so a row never lands as one line
      delay[i] = 0.02 + 0.58 * (row / Math.max(1, rows - 1)) + 0.05 * jd[i];
    }
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas!.width = Math.round(W * dpr);
    canvas!.height = Math.round(H * dpr);
    buildSprites();
    labs.forEach((l, g) => l.style.setProperty('--x', (gx0[g] + gw / 2).toFixed(1)));
  }

  /** One rounded square per colour at device resolution: a soft diagonal gradient, a lit top edge. */
  function buildSprites() {
    const px = Math.max(2, Math.ceil(S * dpr));
    const r = px * 0.26;
    groups.forEach((g, gi) => {
      g.c.forEach((col, vi) => {
        const c = sprites[gi][vi];
        c.width = c.height = px;
        const x = c.getContext('2d')!;
        x.clearRect(0, 0, px, px);
        const grad = x.createLinearGradient(0, 0, px, px);
        grad.addColorStop(0, shade(col, 0.16));
        grad.addColorStop(1, shade(col, -0.18));
        x.fillStyle = grad;
        x.beginPath();
        // roundRect is missing in older Safari and Firefox: the same corners with arcTo
        x.moveTo(r, 0);
        x.arcTo(px, 0, px, px, r);
        x.arcTo(px, px, 0, px, r);
        x.arcTo(0, px, 0, 0, r);
        x.arcTo(0, 0, px, 0, r);
        x.closePath();
        x.fill();
        if (px >= 8) {
          x.strokeStyle = 'rgba(255,255,255,0.22)';
          x.lineWidth = Math.max(1, px * 0.06);
          x.beginPath();
          x.moveTo(r, x.lineWidth / 2);
          x.lineTo(px - r, x.lineWidth / 2);
          x.stroke();
        }
      });
    });
  }

  /* ---------- state ---------- */
  let pT = still ? 1 : 0; // assembly target from the scroll
  let pS = pT; // assembly shown, eased
  const gA = new Float32Array(G).fill(1); // column alpha (hover dims the others)
  let hover = -1;
  let tapUntil = 0;
  let ptrX = -1e5;
  let ptrY = -1e5;
  let ptrIn = false;
  let acc = 0;
  let still60 = 0; // frames in a row with nothing moving
  let raf = 0;
  let lastT = 0;
  let onScreen = false;

  /** Assembly progress from where the chart sits on the screen: starts as its top enters, done once it is all in view. */
  function readScroll() {
    if (still) return;
    const r = canvas!.getBoundingClientRect();
    const vh = innerHeight;
    const span = Math.max(200, r.height + 90 - vh * 0.02);
    pT = clamp01((vh * 0.98 - r.top) / span);
  }

  /** The column under a point in canvas px, or -1. */
  function groupAt(x: number, y: number) {
    if (y < base - rows * P - P * 2 || y > H + 60) return -1;
    for (let g = 0; g < G; g++) if (x >= gx0[g] - gap / 2 && x <= gx0[g] + gw + gap / 2) return g;
    return -1;
  }

  function setHover(g: number) {
    if (g === hover) return;
    hover = g;
    chart!.classList.toggle('is-hover', g >= 0);
    labs.forEach((l, i) => l.classList.toggle('is-on', i === g));
  }

  /** One fixed step of the springs: home to the slot, pushed away from the pointer once everything has landed.
   *  Returns true while anything still travels (a resting pointer holds its dent without booking frames). */
  function physics() {
    const push = ptrIn && pS > 0.985 && !still;
    const R = W < 560 ? 44 : 74;
    const R2 = R * R;
    const K = 110;
    const D = 11;
    let maxV = 0;
    let maxO = 0;
    for (let i = 0; i < N; i++) {
      let fx = -K * ox[i] - D * vx[i];
      let fy = -K * oy[i] - D * vy[i];
      if (push) {
        const dx = slotX[i] + ox[i] - ptrX;
        const dy = slotY[i] + oy[i] - ptrY;
        const d2 = dx * dx + dy * dy;
        if (d2 < R2 && d2 > 0.01) {
          const d = Math.sqrt(d2);
          const f = (1 - d / R) * (1 - d / R) * 5200;
          fx += (dx / d) * f;
          fy += (dy / d) * f;
        }
      }
      vx[i] += fx * STEP;
      vy[i] += fy * STEP;
      ox[i] += vx[i] * STEP;
      oy[i] += vy[i] * STEP;
      const sv = Math.abs(vx[i]) + Math.abs(vy[i]);
      const so = Math.abs(ox[i]) + Math.abs(oy[i]);
      if (sv > maxV) maxV = sv;
      if (so > maxO) maxO = so;
    }
    if (!push && maxV < 0.4 && maxO < 0.2) {
      if (maxO > 0) {
        ox.fill(0);
        oy.fill(0);
        vx.fill(0);
        vy.fill(0);
      }
      return false;
    }
    return maxV > 0.4;
  }

  /** Paints every tile at its current place. */
  function draw() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas!.width, canvas!.height);
    const fallTop = -P * 2;
    for (let i = 0; i < N; i++) {
      const t = clamp01((pS - delay[i]) / 0.34);
      if (t <= 0) continue;
      const g = tg[i];
      let x = slotX[i] + ox[i];
      let y = slotY[i] + oy[i];
      let rot = 0;
      if (t < 1) {
        // fall: drift in from the side a little, accelerate down, hop once on landing
        const f = t < 0.86 ? (t / 0.86) * (t / 0.86) : 1;
        const startY = fallTop - jy[i] * (base - rows * P + P * 4);
        const sx = slotX[i] + jx[i] * P;
        x = sx + (slotX[i] - sx) * (1 - (1 - Math.min(1, t / 0.86)) ** 2);
        y = startY + (slotY[i] - startY) * f;
        if (t >= 0.86) y -= Math.sin(((t - 0.86) / 0.14) * Math.PI) * P * 0.45;
        rot = jr[i] * (1 - Math.min(1, t / 0.86));
      }
      // fade in through the top of the canvas, so there is no line where squares appear
      let a = smooth((y - fallTop) / (P * 4)) * gA[g];
      if (t < 1) a *= smooth(t / 0.18);
      if (a <= 0.01) continue;
      ctx.globalAlpha = a > 1 ? 1 : a;
      const spr = sprites[g][tv[i]];
      if (rot !== 0) {
        const c = Math.cos(rot) * dpr;
        const s = Math.sin(rot) * dpr;
        // the transform already carries the pixel ratio, so the tile is drawn in CSS px here
        // (drawn at S * dpr, falling squares came out twice their size on phones)
        ctx.setTransform(c, s, -s, c, x * dpr, y * dpr);
        ctx.drawImage(spr, -S / 2, -S / 2, S, S);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      } else {
        // landed squares snap to device pixels, so their edges stay crisp
        ctx.drawImage(spr, Math.round((x - S / 2) * dpr), Math.round((y - S / 2) * dpr), Math.round(S * dpr), Math.round(S * dpr));
      }
    }
    ctx.globalAlpha = 1;
  }

  /** One frame: ease the assembly and the column fades, step the springs, paint, and stop once still. */
  function frame(now: number) {
    raf = 0;
    const dt = Math.min(0.05, lastT ? (now - lastT) / 1000 : STEP);
    lastT = now;
    readScroll();
    let moving = false;
    const k = 1 - Math.exp(-dt * 9);
    pS += (pT - pS) * k;
    if (Math.abs(pT - pS) < 0.0004) pS = pT;
    else moving = true;
    if (tapUntil && now > tapUntil) {
      tapUntil = 0;
      setHover(-1);
    }
    for (let g = 0; g < G; g++) {
      const want = hover < 0 || g === hover ? 1 : 0.26;
      gA[g] += (want - gA[g]) * (1 - Math.exp(-dt * 10));
      if (Math.abs(want - gA[g]) < 0.003) gA[g] = want;
      else moving = true;
    }
    acc += dt;
    let n = 0;
    while (acc >= STEP && n < 4) {
      if (physics()) moving = true;
      acc -= STEP;
      n++;
    }
    if (n === 4) acc = 0;
    draw();
    still60 = moving ? 0 : still60 + 1;
    if (onScreen && !document.hidden && still60 < 20) raf = requestAnimationFrame(frame);
    else lastT = 0;
  }
  const wake = () => {
    still60 = 0;
    if (!raf && onScreen && !document.hidden) raf = requestAnimationFrame(frame);
  };

  /* ---------- pointer ---------- */
  const local = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    ptrX = e.clientX - r.left;
    ptrY = e.clientY - r.top;
  };
  chart.addEventListener('pointermove', (e) => {
    local(e);
    if (e.pointerType === 'mouse') {
      ptrIn = ptrY > -20 && ptrY < H + 70;
      setHover(groupAt(ptrX, ptrY));
    }
    if (still) draw();
    wake();
  }, { passive: true });
  chart.addEventListener('pointerleave', () => {
    ptrIn = false;
    setHover(-1);
    if (still) draw();
    wake();
  }, { passive: true });
  // touch: a tap names a column for a moment
  chart.addEventListener('pointerup', (e) => {
    if (e.pointerType === 'mouse') return;
    local(e);
    const g = groupAt(ptrX, ptrY);
    setHover(g === hover ? -1 : g);
    tapUntil = g >= 0 ? performance.now() + 2600 : 0;
    if (still) draw();
    wake();
  }, { passive: true });

  /* ---------- lifecycle ---------- */
  layout();
  readScroll();
  pS = pT;
  draw();
  new IntersectionObserver((entries) => {
    onScreen = entries.some((e) => e.isIntersecting);
    if (onScreen) wake();
  }, { rootMargin: '80px 0px' }).observe(chart);
  addEventListener('scroll', wake, { passive: true });
  document.addEventListener('visibilitychange', wake);
  let rt = 0;
  addEventListener('resize', () => {
    clearTimeout(rt);
    rt = window.setTimeout(() => {
      layout();
      readScroll();
      draw();
      wake();
    }, 140);
  });
  document.fonts?.ready.then(() => {
    layout();
    draw();
  });
}
