// Makes every file the page loads for the black hole (public/images/hole/) from the two lossless loop masters,
// with the settings the site shipped with, so the set can be remade in one go after a re-render.
//
//   node scripts/hole/render.mjs desktop --frames 0-299 --samples 24 --master desktop-loop-master.mkv --out loop
//   node scripts/hole/render.mjs phone   --frames 0-299 --samples 24 --master phone-loop-master.mkv   --out loop
//   node scripts/hole/site-media.mjs [--trc srgb|bt709] [--only desktop-2160,...,posters] [--out public/images/hole]
//
// Per composition: AV1, HEVC and H.264 at full size and at the smaller size (hole-video.ts picks among them), and
// the posters (loop frame 0, AVIF and WebP at two widths). Targets for the 10 s loop: desktop under 6 MB, phone under
// 2.5 MB (the sizes each run gets are in .scratch/hole/loop/*-encodes.json). The shipped files carry the sRGB
// transfer tag (--trc srgb): with bt709 the dark sky played up to 3.7 levels darker than the poster in Chromium.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const argv = process.argv.slice(2);
const arg = (k, d) => {
  const i = argv.indexOf('--' + k);
  return i >= 0 ? argv[i + 1] : d;
};
const out = path.resolve(root, arg('out', 'public/images/hole'));
const trc = arg('trc', 'srgb');
const only = arg('only', '');
const loop = path.join(root, '.scratch/hole/loop');

// CRFs as shipped (2026-11-08): the full loops came out 25 to 85% bigger than the phase 1 clip projected at the
// same CRFs (a busier draw of the dust), so the full-size files went up to these to stay under the targets
const JOBS = [
  { tag: 'hole-desktop-2160', master: 'desktop-loop-master.mkv', crf: 'av1=46,hevc=34,h264=34' },
  { tag: 'hole-desktop-1440', master: 'desktop-loop-master.mkv', crf: 'av1=43,hevc=34,h264=33', scale: '2560x1440' },
  { tag: 'hole-phone-3200', master: 'phone-loop-master.mkv', crf: 'av1=49,hevc=35,h264=35' },
  { tag: 'hole-phone-2400', master: 'phone-loop-master.mkv', crf: 'av1=44,hevc=33,h264=33', scale: '1080x2400' },
];
const POSTERS = [
  { comp: 'desktop', master: 'desktop-loop-master.mkv', widths: '3840,1920' },
  { comp: 'phone', master: 'phone-loop-master.mkv', widths: '1440,720' },
];
const run = (args) => {
  const r = spawnSync(process.execPath, args, { stdio: 'inherit', cwd: root });
  if (r.status !== 0) throw new Error('failed: ' + args.join(' '));
};
for (const j of JOBS) {
  if (only && !only.split(',').some((o) => j.tag.endsWith(o))) continue;
  const a = [path.join(here, 'encode.mjs'), path.join(loop, j.master), '--tag', j.tag, '--outdir', out, '--crf', j.crf, '--trc', trc];
  if (j.scale) a.push('--scale', j.scale);
  run(a);
}
if (!only || only.includes('posters')) for (const p of POSTERS) run([path.join(here, 'poster.mjs'), path.join(loop, p.master), p.comp, p.widths, out]);
