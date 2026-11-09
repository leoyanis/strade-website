// Reads the live shader's ray mapping for the physics check (geodesic_ref.py compares it with an independent
// geodesic integration). Runs the live shader in headless Chromium on the GPU and writes float32 maps plus the
// camera as JSON to .scratch/hole/phys/.
//
//   node scripts/hole/physics.mjs            the live desktop camera (1920x1080 CSS) at drift 0, 0.5 and 1, each also
//                                            mirrored about the spin axis, plus the live screenshot's camera at 4K
//                                            (live shader and the new offline scene shader)
//
// Each map is 1600x1000 with the hole in the middle, the live focal length (shadow 140.4 px) and the live angles,
// so the rays are exactly the live page's, with room on both sides of the hole for the left/right comparison.
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { startServer } from './server.mjs';
import { launchChrome } from './browser.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, '../../.scratch/hole/phys');
fs.mkdirSync(out, { recursive: true });

const srv = await startServer({
  root: here,
  onPost: async (kind, q, buf) => {
    const name = q.get('name') || 'x';
    if (kind !== 'data' || !/^[a-z0-9_.-]+$/i.test(name)) throw new Error('bad post');
    fs.writeFileSync(path.join(out, name.endsWith('_meta') ? name + '.json' : name + '.f32'), buf);
  },
});
const page = await launchChrome();
try {
  await page.goto(`http://127.0.0.1:${srv.port}/physics.html`);
  for (let i = 0; i < 100 && !(await page.evaluate('!!window.__ready')); i++) await new Promise((r) => setTimeout(r, 100));
  const run = async (args) => {
    const t0 = Date.now();
    await page.evaluate(`window.renderDebug(${JSON.stringify(args)})`);
    console.log(args.name, Date.now() - t0, 'ms');
  };
  for (const d of [0, 0.5, 1]) {
    const view = { W: 1920, H: 1080, bw: 1600, bh: 1000, d, center: [800, 500] };
    for (const mode of [1, 2]) await run({ name: `shader_m${mode}_d${d}`, mode, view, steps: 100 });
    // the same rays mirrored about the spin axis, for the exact left/right test
    await run({ name: `shader_m1_d${d}_mirror`, mode: 1, view, steps: 100, mirror: true });
  }
  // the live screenshot's own camera (1920x1080 CSS at 2x, drift 0.5), for drawing the true isoradials on it
  for (const mode of [1, 2]) await run({ name: `shader_m${mode}_live4k`, mode, view: { W: 1920, H: 1080, bw: 3840, bh: 2160, d: 0.5 }, steps: 100 });
  // the new offline renderer's scene shader through the same camera
  const t0 = Date.now();
  await page.evaluate(`window.renderDebugNew(${JSON.stringify({ name: 'new_live4k', view: { W: 1920, H: 1080, bw: 3840, bh: 2160, d: 0.5 } })})`);
  console.log('new_live4k', Date.now() - t0, 'ms');
} finally {
  await page.close();
  await srv.close();
}
