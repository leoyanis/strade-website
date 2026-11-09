// Makes every file the page loads for the black hole (public/images/hole/) from the two lossless loop masters,
// with the settings the site shipped with, so the set can be remade in one go after a re-render.
//
//   node scripts/hole/render.mjs desktop --frames 0-299 --samples 24 --master desktop-loop-master.mkv --out loop
//   node scripts/hole/render.mjs phone   --frames 0-299 --samples 24 --master phone-loop-master.mkv   --out loop
//   node scripts/hole/site-media.mjs [--trc srgb|bt709] [--only desktop-2160,...,posters | posters-phone] [--out public/images/hole]
//
// Per composition: AV1, HEVC and H.264 at full size and at the smaller size (hole-video.ts picks among them), and
// the posters (loop frame 0, AVIF and WebP). Targets for the 10 s loop: desktop under 6 MB, phone under 12 MB (the
// sizes each run gets are in .scratch/hole/loop/*-encodes.json). The shipped files carry the sRGB transfer tag
// (--trc srgb): with bt709 the dark sky played up to 3.7 levels darker than the poster in Chromium.
// The phone files were remade on 2026-11-09: at 1.4 to 1.9 Mbit/s (0.014 bits a pixel) the dark dust and the fine
// stars came apart in blocks on an iPhone ("extremely compressed", Yanis). Now HEVC Main10 (Safari) at a two-pass
// 9 Mbit/s (x265 slow: aq-mode 3, psy-rd 2, psy-rdoq 1, no SAO, deblock -1, and chroma 6 QP finer: the orange dust
// inside the photon ring kept its colour through the 4:2:0 input but the encoder turned it grey, cbqpoffs/crqpoffs -6
// gave back 0.35 dB of chroma for 0.03 of luma), AV1 10-bit at CRF 31 (about 9 Mbit/s; SVT-AV1 4.0 ignored its
// chroma qindex offsets) and H.264 at 9 Mbit/s with an error-diffused 8-bit input; 7.5 to 8 Mbit/s for the
// 1080x2400 tier, which phones at 2x get. Measured against the master at an iPhone 15's own scale (1228 device px
// wide): the old HEVC 37.3 dB overall and 33.6 dB on the hole, the new about 42 and 38 (.scratch/hole-build/enc,
// disp.mjs). 1440x3200 stays the 3x tier: 1170x2600 at the same bitrate came out 0.4 dB worse there (it is
// upscaled; 1440 is shrunk). x265 slower instead of slow was not worth its time here.
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

// Desktop CRFs as shipped (2026-11-08): the full loops came out 25 to 85% bigger than the phase 1 clip projected at
// the same CRFs (a busier draw of the dust), so the full-size files went up to these to stay under the targets.
// Phone: see the header (2026-11-09). Its files are named hole-phone2-* so a phone that cached the old ones (a day,
// vercel.json) fetches the new ones at once.
const PHONE_X265 = 'aq-mode=3:aq-strength=1.0:psy-rd=2.0:psy-rdoq=1.0:no-sao=1:deblock=-1,-1:cbqpoffs=-6:crqpoffs=-6';
const JOBS = [
  { tag: 'hole-desktop-2160', master: 'desktop-loop-master.mkv', crf: 'av1=46,hevc=34,h264=34' },
  { tag: 'hole-desktop-1440', master: 'desktop-loop-master.mkv', crf: 'av1=43,hevc=34,h264=33', scale: '2560x1440' },
  { tag: 'hole-phone2-3200', master: 'phone-loop-master.mkv', crf: 'av1=31', kbps: 'hevc=9000,h264=9000', preset: 'av1=4,hevc=slow,h264=slow', x265: PHONE_X265, dither: true },
  { tag: 'hole-phone2-2400', master: 'phone-loop-master.mkv', crf: 'av1=28', kbps: 'hevc=7500,h264=8000', preset: 'av1=4,hevc=slow,h264=slow', x265: PHONE_X265, dither: true, scale: '1080x2400' },
];
const POSTERS = [
  { comp: 'desktop', master: 'desktop-loop-master.mkv', widths: '3840,1920' },
  { comp: 'phone2', master: 'phone-loop-master.mkv', widths: '1440,1080,720', qAvif: 64, qWebp: 82 },
];
const run = (args) => {
  const r = spawnSync(process.execPath, args, { stdio: 'inherit', cwd: root });
  if (r.status !== 0) throw new Error('failed: ' + args.join(' '));
};
for (const j of JOBS) {
  if (only && !only.split(',').some((o) => j.tag.endsWith(o))) continue;
  const a = [path.join(here, 'encode.mjs'), path.join(loop, j.master), '--tag', j.tag, '--outdir', out, '--crf', j.crf, '--trc', trc];
  if (j.scale) a.push('--scale', j.scale);
  if (j.kbps) a.push('--kbps', j.kbps);
  if (j.preset) a.push('--preset', j.preset);
  if (j.x265) a.push('--x265', j.x265);
  if (j.dither) a.push('--dither');
  run(a);
}
if (!only || only.includes('posters')) {
  for (const p of POSTERS) {
    if (only && only.includes('posters-') && !only.includes(`posters-${p.comp}`)) continue;
    const a = [path.join(here, 'poster.mjs'), path.join(loop, p.master), p.comp, p.widths, out];
    if (p.qAvif) a.push('--q-avif', String(p.qAvif));
    if (p.qWebp) a.push('--q-webp', String(p.qWebp));
    run(a);
  }
}
