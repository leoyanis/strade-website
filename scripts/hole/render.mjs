// Renders the black hole loop offline: headless Chrome on the GPU draws each frame (page.html + hole.js), posts
// it back packed as 10-bit RGB, and this script hands it to ffmpeg.
//
//   node scripts/hole/render.mjs <comp> --frames 0-89 [--master out.mkv] [--png] [--samples 8] [--out name]
//        [--look key=value,...] [--dust key=value,... | --nodust] [--loop 10] [--fps 30] [--phases 1]
//
// comp: desktop (3840x2160, hole at x 0.68, y 0.504, shadow 252 px), phone (1440x3200, hole at x 0.5, y 0.298,
// shadow 212 px), live4k (3840x2160 through the live page's own camera at 1920x1080 CSS and drift 0.5: the
// composition of the side-by-side). The camera is the live one at drift 0.5 (elevation 6.5, azimuth 0, roll -0.5).
// --master writes a lossless FFV1 master (RGB 10-bit) that encode.sh turns into the web files; --png writes a
// 16-bit PNG and a JPEG preview of each frame. Output goes to .scratch/hole/<out>/.
//
// One job at a time: the Mac's GPU is shared. A 4K frame at 8 samples takes a couple of seconds.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './server.mjs';
import { launchChrome } from './browser.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const FFMPEG = process.env.FFMPEG || '/opt/homebrew/bin/ffmpeg';

export const COMPS = {
  // the frames leave room for the page's parallax (a 5% rise, +-1 degree turn, 4% push-in, hole-video.ts) on 16:9 and
  // 16:10 desktops and 19.5:9 to 20:9 phones at exactly the layout's shadow radius (worked out in phase 2: with the
  // phase 1 frames, 266 px at y 0.495, a 1440x900 screen needed the frame 7.5% bigger than the layout)
  desktop: { w: 3840, h: 2160, camera: { kind: 'frame', hx: 0.68, hy: 0.504, shadowPx: 252, el: 6.5, az: 0, roll: -0.5 } },
  phone: { w: 1440, h: 3200, camera: { kind: 'frame', hx: 0.5, hy: 0.298, shadowPx: 212, el: 6.5, az: 0, roll: -0.5 } },
  live4k: { w: 3840, h: 2160, camera: { kind: 'live', W: 1920, H: 1080, d: 0.5 } },
  // half-size previews of the two compositions, for checking motion cheaply (dust sizes scale with the shadow)
  'desktop-half': { w: 1920, h: 1080, camera: { kind: 'frame', hx: 0.68, hy: 0.504, shadowPx: 126, el: 6.5, az: 0, roll: -0.5 } },
  'phone-half': { w: 720, h: 1600, camera: { kind: 'frame', hx: 0.5, hy: 0.298, shadowPx: 106, el: 6.5, az: 0, roll: -0.5 } },
};

function args(argv) {
  const a = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const k = argv[i].slice(2);
      const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
      a[k] = v;
    } else a._.push(argv[i]);
  }
  return a;
}
// key=value,key=value; a value like 350:1300 becomes [350, 1300]
const kv = (s) => Object.fromEntries(String(s).split(',').filter(Boolean).map((p) => {
  const [k, v] = p.split('=');
  if (v.includes(':')) return [k, v.split(':').map(Number)];
  return [k, Number.isFinite(+v) ? +v : v];
}));
function frameList(s, total) {
  if (!s) return [0];
  return String(s).split(',').flatMap((part) => {
    const m = part.match(/^(-?\d+)-(-?\d+)$/);
    if (m) {
      const out = [];
      for (let i = +m[1]; i <= +m[2]; i++) out.push(i);
      return out;
    }
    return [+part];
  }).map((i) => ((i % total) + total) % total);
}

const a = args(process.argv.slice(2));
const compName = a._[0] || 'desktop';
const comp = COMPS[compName];
if (!comp) throw new Error('unknown comp ' + compName);
const loop = +(a.loop || 10);
const fps = +(a.fps || 30);
const total = Math.round(loop * fps);
const frames = frameList(a.frames, total);
const outDir = path.resolve(here, '../../.scratch/hole', a.out || compName);
fs.mkdirSync(outDir, { recursive: true });

// the lossless master: frames in render order through one ffmpeg
let master = null;
if (a.master) {
  const file = path.isAbsolute(a.master) ? a.master : path.join(outDir, a.master);
  master = spawn(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'x2rgb10le', '-s', `${comp.w}x${comp.h}`, '-r', String(fps), '-i', 'pipe:0', '-c:v', 'ffv1', '-level', '3', '-slices', '16', '-pix_fmt', 'gbrp10le', file], { stdio: ['pipe', 'inherit', 'inherit'] });
}
// respects ffmpeg's pace: the page's POST is answered only once its frame is in the pipe
const writeMaster = (buf) => new Promise((resolve) => {
  if (!master.stdin.write(buf)) master.stdin.once('drain', resolve);
  else resolve();
});
const still = (buf, name, mode) => new Promise((resolve, reject) => {
  const fmt = mode === 1 ? 'rgba' : 'x2rgb10le';
  const p = spawn(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', fmt, '-s', `${comp.w}x${comp.h}`, '-i', 'pipe:0',
    '-frames:v', '1', '-pix_fmt', 'rgb48be', path.join(outDir, name + '.png'),
    '-frames:v', '1', '-q:v', '2', '-pix_fmt', 'yuvj444p', path.join(outDir, name + '.jpg')], { stdio: ['pipe', 'inherit', 'inherit'] });
  p.on('exit', (c) => (c === 0 ? resolve() : reject(new Error('ffmpeg still ' + c))));
  p.stdin.end(buf);
});

const srv = await startServer({
  root: here,
  onPost: async (kind, q, buf) => {
    if (kind !== 'frame') throw new Error('unexpected post ' + kind);
    const i = +q.get('i');
    const mode = +q.get('mode');
    if (master) await writeMaster(buf);
    if (a.png) await still(buf, `${compName}-f${String(i).padStart(3, '0')}`, mode);
  },
});

const page = await launchChrome();
try {
  await page.goto(`http://127.0.0.1:${srv.port}/page.html`);
  for (let i = 0; i < 200 && !(await page.evaluate('!!window.__ready')); i++) await new Promise((r) => setTimeout(r, 50));
  const cfg = {
    ...comp,
    loop,
    fps,
    samples: +(a.samples || 8),
    shutter: a.shutter !== undefined ? +a.shutter : 0.5,
    phases: +(a.phases || 1),
    look: a.look ? kv(a.look) : {},
    dust: a.nodust ? false : a.dust ? kv(a.dust) : {},
  };
  const info = await page.evaluate(`window.holeSetup(${JSON.stringify(cfg)})`);
  console.log(`${compName} ${info.W}x${info.H}, dust ${info.dust ? info.dust.count + ' particles in ' + info.dust.streams + ' streams' : 'off'}, lens table ${info.lutMs} ms, float blend ${info.floatBlend}`);
  fs.writeFileSync(path.join(outDir, 'config.json'), JSON.stringify({ cfg, info }, null, 1));
  const t0 = Date.now();
  for (const [n, i] of frames.entries()) {
    const r = await page.evaluate(`window.holeFrame(${i}, ${JSON.stringify({ samples: cfg.samples })})`);
    if (n % 10 === 0 || n === frames.length - 1) console.log(`frame ${i} (${n + 1}/${frames.length}): ${r.ms} ms`);
  }
  console.log(`done: ${frames.length} frames in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
} finally {
  await page.close();
  await srv.close();
  if (master) {
    master.stdin.end();
    await new Promise((r) => master.on('exit', r));
  }
}
