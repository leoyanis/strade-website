// Energy for /vision/ssi: a power grid seen from high above, lighting up across a dark plain.
// Black ground, white light, the page's cyan only on a speck. Lit like the Vehicles scene: a low sun
// from the top right, so the relief catches light on that side and the masts throw long shadows down-left.
import { type SceneFactory, clamp, smooth, near, rng, fbm, glow, CYAN } from './land-util';

const TAU = Math.PI * 2;

/* ================================================================== energy */
export const energy: SceneFactory = (ctx, o) => {
  const r = rng(41);
  type N = { x: number; z: number; d: number; hub: boolean };
  const nodes: N[] = [];
  for (let tries = 0; nodes.length < 74 && tries < 4000; tries++) {
    const x = (r() - 0.5) * 130;
    const z = 22 + r() * 150;
    if (nodes.every((n) => Math.hypot(n.x - x, n.z - z) > 8.5)) nodes.push({ x, z, d: Infinity, hub: false });
  }
  // cables: each mast to its nearest neighbours
  const edges: [number, number, number][] = [];
  const seen = new Set<string>();
  nodes.forEach((a, i) => {
    nodes
      .map((b, j) => ({ j, d: Math.hypot(a.x - b.x, a.z - b.z) }))
      .filter((q) => q.j !== i)
      .sort((p, q) => p.d - q.d)
      .slice(0, 3)
      .forEach(({ j, d }) => {
        const key = i < j ? `${i}-${j}` : `${j}-${i}`;
        if (seen.has(key) || d > 30) return;
        seen.add(key);
        edges.push([i, j, d]);
      });
  });
  // energised from the node nearest the front centre (shortest path along cable)
  let root = 0;
  nodes.forEach((n, i) => {
    if (Math.hypot(n.x, n.z - 60) < Math.hypot(nodes[root].x, nodes[root].z - 60)) root = i;
  });
  nodes[root].d = 0;
  for (let it = 0; it < nodes.length; it++)
    for (const [a, b, d] of edges) {
      if (nodes[a].d + d < nodes[b].d) nodes[b].d = nodes[a].d + d;
      if (nodes[b].d + d < nodes[a].d) nodes[a].d = nodes[b].d + d;
    }
  const maxD = Math.max(...nodes.filter((n) => n.d < Infinity).map((n) => n.d));
  nodes.forEach((n, i) => {
    if (n.d === Infinity) n.d = maxD;
    n.hub = i % 9 === 0 || i === root;
  });
  // the plain, as faint stipple following the relief
  const dots: { x: number; z: number; b: number; lit: number }[] = [];
  for (let i = 0; i < (o.phone ? 2600 : 4200); i++) {
    const x = (r() - 0.5) * 220;
    const z = 10 + r() * 200;
    const b = fbm(x * 0.03, z * 0.03, 4, 5);
    // relief lit by a low sun from the top right: slopes facing +x / +z catch it
    const gx = fbm((x + 1) * 0.03, z * 0.03, 4, 5) - b;
    const gz = fbm(x * 0.03, (z + 1) * 0.03, 4, 5) - b;
    const lit = clamp(0.5 - 30 * (0.8 * gx + 0.6 * gz));
    if (b > 0.42 || r() < 0.25) dots.push({ x, z, b, lit });
  }

  let w = 1;
  let h = 1;
  let cx = 0;
  let hy = 0;
  let f = 1;
  const CAM_H = 46;
  let rot = 0;
  let camZ = 0;
  const P = { x: 0, y: 0, d: 0 };
  const proj = (x: number, y: number, z: number, out = P) => {
    // turn the ground around its middle, then project
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    const dx = x;
    const dz = z - 95;
    const rx = dx * c - dz * s;
    const rz = dx * s + dz * c + 95;
    const zr = rz - camZ;
    if (zr < 1) return false;
    out.x = cx + (f * rx) / zr;
    out.y = hy + (f * (CAM_H - y)) / zr;
    out.d = zr;
    return true;
  };
  const Q = { x: 0, y: 0, d: 0 };

  return {
    resize(W, Hh) {
      w = W;
      h = Hh;
      cx = o.phone ? w * 0.5 : w * 0.36;
      hy = o.phone ? h * 0.02 : h * 0.06;
      f = o.phone ? h * 0.9 : h * 0.95;
    },
    draw(t, p, step) {
      const e = [0, 1, 2, 3].map((i) => near(step, i));
      rot = -0.18 + 0.32 * p + 0.04 * Math.sin(t * 0.05);
      camZ = -18 + 10 * p;
      const W0 = (0.08 + 1.0 * p) * maxD + 6 * Math.sin(t * 0.3);

      // low sun from the top right: a faint wash of light across the plain from that corner
      const sun = ctx.createRadialGradient(w * 1.05, -h * 0.1, 0, w * 1.05, -h * 0.1, Math.hypot(w, h) * 0.95);
      sun.addColorStop(0, 'rgba(255,250,242,0.16)');
      sun.addColorStop(0.5, 'rgba(255,250,242,0.055)');
      sun.addColorStop(1, 'rgba(255,250,242,0)');
      ctx.fillStyle = sun;
      ctx.fillRect(0, 0, w, h);

      // the plain
      for (const d of dots) {
        if (!proj(d.x, 0, d.z)) continue;
        if (P.x < -4 || P.x > w + 4 || P.y < -4 || P.y > h + 4) continue;
        const a = (0.03 + 0.34 * smooth(0.42, 0.75, d.b) * (0.25 + 0.95 * d.lit)) * smooth(230, 120, P.d) * (0.75 + 0.5 * (P.x / w) * (1 - P.y / h));
        ctx.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`;
        ctx.fillRect(P.x, P.y, 1, 1);
      }

      // Spire shadows: long and soft, thrown down-left across the plain
      if (e[1] > 0.01) {
        ctx.lineCap = 'round';
        nodes.forEach((n) => {
          const on = smooth(n.d - 2, n.d + 4, W0);
          const mh = 7 * e[1] * on;
          if (mh < 0.1 || !proj(n.x, 0, n.z, P) || !proj(n.x - mh * 3.2, 0, n.z - mh * 2.2, Q)) return;
          const g = ctx.createLinearGradient(P.x, P.y, Q.x, Q.y);
          g.addColorStop(0, `rgba(0,0,0,${(0.85 * e[1] * on).toFixed(3)})`);
          g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.strokeStyle = g;
          ctx.lineWidth = clamp(320 / P.d, 1.5, 4);
          ctx.beginPath();
          ctx.moveTo(P.x, P.y);
          ctx.lineTo(Q.x, Q.y);
          ctx.stroke();
        });
      }

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      // cables: dark until the power reaches them, then lit along their length
      for (const [ia, ib] of edges) {
        let a = nodes[ia];
        let b = nodes[ib];
        if (b.d < a.d) [a, b] = [b, a];
        if (!proj(a.x, 0, a.z, P) || !proj(b.x, 0, b.z, Q)) continue;
        const len = Math.hypot(b.x - a.x, b.z - a.z);
        const k = clamp((W0 - a.d) / len);
        ctx.strokeStyle = 'rgba(255,255,255,0.07)';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(P.x, P.y);
        ctx.lineTo(Q.x, Q.y);
        ctx.stroke();
        if (k <= 0) continue;
        const mx = P.x + (Q.x - P.x) * k;
        const my = P.y + (Q.y - P.y) * k;
        const lit = 0.3 + 0.35 * e[3];
        ctx.strokeStyle = `rgba(255,255,255,${lit * 0.1})`;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(P.x, P.y);
        ctx.lineTo(mx, my);
        ctx.stroke();
        ctx.strokeStyle = `rgba(255,255,255,${lit})`;
        ctx.lineWidth = 1.1;
        ctx.stroke();
        if (k < 1) glow(ctx, mx, my, 16, 0.6); // the front of the power
        else {
          // current running along live cables
          const n = 1 + Math.round(e[3] * 2);
          for (let j = 0; j < n; j++) {
            const u = (t * (0.22 + 0.1 * e[3]) + j / n + (ia * 0.37) % 1) % 1;
            glow(ctx, P.x + (Q.x - P.x) * u, P.y + (Q.y - P.y) * u, 7, 0.5 + 0.3 * e[3]);
          }
        }
      }
      // masts, cells, banks
      nodes.forEach((n, i) => {
        if (!proj(n.x, 0, n.z, P)) return;
        const on = smooth(n.d - 2, n.d + 4, W0);
        const s = clamp(240 / P.d, 1.2, 4);
        // Starcell: every node is a cell that breathes
        const cell = on * (0.55 + 0.45 * e[0] * (0.5 + 0.5 * Math.sin(t * 2 + i)));
        ctx.fillStyle = `rgba(255,255,255,${(0.12 + 0.85 * cell).toFixed(3)})`;
        ctx.fillRect(P.x - s / 2, P.y - s / 2, s, s);
        if (on > 0.5) glow(ctx, P.x, P.y, s * 5, 0.22 * on);
        // Spire: masts stand up out of the ground
        const mh = 7 * e[1] * on;
        if (mh > 0.1 && proj(n.x, mh, n.z, Q)) {
          ctx.strokeStyle = `rgba(255,255,255,${0.55 * e[1] * on})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(P.x, P.y);
          ctx.lineTo(Q.x, Q.y);
          ctx.stroke();
          // the sun side of the mast catches the light
          ctx.strokeStyle = `rgba(255,250,242,${0.35 * e[1] * on})`;
          ctx.beginPath();
          ctx.moveTo(P.x + 1, P.y);
          ctx.lineTo(Q.x + 1, Q.y);
          ctx.stroke();
          glow(ctx, Q.x, Q.y, 6, 0.8 * e[1] * on, i === root ? CYAN : undefined);
        }
        // Nightbank: the big storage nodes hold a slow ring of light
        if (n.hub && e[2] > 0.01) {
          for (let k = 0; k < 2; k++) {
            const u = (t * 0.25 + k / 2) % 1;
            ctx.strokeStyle = `rgba(255,255,255,${(0.5 * (1 - u) * e[2] * on).toFixed(3)})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            const rr = (8 + u * 26) * (s / 2);
            ctx.ellipse(P.x, P.y, rr, rr * (CAM_H / (P.d + 20)) * 1.4, 0, 0, TAU);
            ctx.stroke();
          }
          glow(ctx, P.x, P.y, s * 9, 0.4 * e[2] * on);
        }
      });
      ctx.restore();
    },
  };
};
