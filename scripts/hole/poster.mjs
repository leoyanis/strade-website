// The posters: loop frame 0 of a lossless master, as AVIF and WebP at two widths, named as the site loads them
// (hole-video.ts: hole-<comp>-<width>.avif / .webp, one srcset per format).
//
//   node scripts/hole/poster.mjs <master.mkv> <comp> <fullWidth>,<smallWidth> <outdir> [--frame 0]
//   e.g. node scripts/hole/poster.mjs .scratch/hole/loop/desktop-loop-master.mkv desktop 3840,1920 public/images/hole
//
// Frame 0 is the frame the video starts on, so the poster's fade-out over the playing video shows nothing change.
// AVIF: 10-bit 4:2:0, quality 50, tagged BT.709 primaries and matrix with the sRGB transfer (the renderer writes
// display gamma, like any image); WebP quality 72 for browsers without AVIF. Needs avifenc and cwebp (Homebrew).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const FFMPEG = process.env.FFMPEG || '/opt/homebrew/bin/ffmpeg';
const [master, comp, widths, outdir] = process.argv.slice(2);
const fi = process.argv.indexOf('--frame');
const frame = fi > 0 ? +process.argv[fi + 1] : 0;
const run = (bin, args) => {
  const r = spawnSync(bin, args, { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`${bin} failed: ${r.stderr}`);
};
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hole-poster-'));
fs.mkdirSync(outdir, { recursive: true });
for (const w of widths.split(',').map(Number)) {
  const png16 = path.join(tmp, `f${w}.png`);
  const png8 = path.join(tmp, `f${w}-8.png`);
  run(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error', '-i', master, '-vf', `select='eq(n\\,${frame})',scale=${w}:-2:flags=lanczos`, '-vsync', '0', '-frames:v', '1', '-pix_fmt', 'rgb48be', png16]);
  run(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error', '-i', png16, '-pix_fmt', 'rgb24', png8]);
  const avif = path.join(outdir, `hole-${comp}-${w}.avif`);
  const webp = path.join(outdir, `hole-${comp}-${w}.webp`);
  run('avifenc', ['-q', '50', '-s', '4', '-d', '10', '-y', '420', '--cicp', '1/13/1', '-j', '8', png16, avif]);
  run('cwebp', ['-quiet', '-q', '72', '-m', '6', png8, '-o', webp]);
  console.log(`${path.basename(avif)} ${fs.statSync(avif).size} B, ${path.basename(webp)} ${fs.statSync(webp).size} B`);
}
fs.rmSync(tmp, { recursive: true, force: true });
