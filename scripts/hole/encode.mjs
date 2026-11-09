// Encodes a lossless master (render.mjs --master) into the web files and measures them.
//
//   node scripts/hole/encode.mjs <master.mkv> [--codecs av1,hevc,h264] [--crf av1=34,hevc=26,h264=24] [--scale WxH]
//        [--tag name] [--loop 10] [--fps 30] [--metrics] [--preset av1=4,hevc=slow,h264=slow] [--trc bt709|srgb]
//        [--outdir dir]   (with --outdir the files are named <tag>-<codec>.mp4 there: the site's names)
//
// - AV1: SVT-AV1, 10-bit 4:2:0 (av01). HEVC: x265 Main10, tagged hvc1 so Safari plays it. H.264: x264 High, 8-bit
//   (the hardware decoders that need H.264 do not do High 10). All three: BT.709, limited range, one keyframe per
//   loop (frame 0, so the loop's jump back is a cheap seek to a keyframe), no scene cuts, no audio, moov first.
// - x265 and x264 run with aq-mode 3, which leans their bits towards dark areas: nearly the whole frame is near black,
//   and the soft glow round the disc is exactly where 8- and 10-bit banding shows first.
// - The projection: the clip has one keyframe, so its size is I + (n - 1) x P. The full loop is projected as
//   I + (loop x fps - 1) x P from the clip's own packet sizes (ffprobe).
// - --metrics: SSIM and PSNR of each file against the master, both through the same RGB to YUV 4:2:0 conversion, so
//   the numbers measure the encoder, not the colour conversion.
// Prints a table and writes <tag>-encodes.json next to the master.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const FFMPEG = process.env.FFMPEG || '/opt/homebrew/bin/ffmpeg';
const FFPROBE = process.env.FFPROBE || '/opt/homebrew/bin/ffprobe';

const argv = process.argv.slice(2);
const master = path.resolve(argv[0]);
const opt = {};
for (let i = 1; i < argv.length; i++) if (argv[i].startsWith('--')) opt[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
const kv = (s, d) => ({ ...d, ...Object.fromEntries(String(s || '').split(',').filter(Boolean).map((p) => p.split('='))) });
const codecs = String(opt.codecs || 'av1,hevc,h264').split(',');
const crf = kv(opt.crf, { av1: '34', hevc: '26', h264: '24' });
const preset = kv(opt.preset, { av1: '4', hevc: 'slow', h264: 'slow' });
const loop = +(opt.loop || 10);
const fps = +(opt.fps || 30);
const tag = opt.tag || path.basename(master).replace(/-master\.mkv$/, '');
const dir = path.dirname(master);

const run = (bin, args) => {
  const r = spawnSync(bin, args, { encoding: 'utf8', maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error(`${bin} failed: ${r.stderr.slice(-2000)}`);
  return r;
};

// the master's size
const probe = JSON.parse(run(FFPROBE, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,nb_frames', '-of', 'json', master]).stdout).streams[0];
const [W, H] = opt.scale ? String(opt.scale).split('x').map(Number) : [probe.width, probe.height];
// The transfer tag: bt709 by default, or sRGB (--trc srgb, iec61966-2-1): the frames are rendered in display gamma
// like the poster, and the tag decides whether a browser treats them as camera-encoded video (bt709) or like the
// image. setparams writes the tags onto the frames: tried -color_primaries/-color_trc alone, and ffmpeg 8 let the
// untagged RGB master's frames win, so primaries and transfer came out "unknown" (ffprobe).
const trc = opt.trc === 'srgb' ? 'iec61966-2-1' : 'bt709';
const toYuv = (bits) => `scale=${W}:${H}:flags=lanczos:out_color_matrix=bt709:out_range=tv,format=${bits === 10 ? 'yuv420p10le' : 'yuv420p'},setparams=color_primaries=bt709:color_trc=${trc}:colorspace=bt709:range=tv`;
const tags = ['-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', trc, '-color_range', 'tv'];
const gop = loop * fps;

const ENC = {
  av1: { ext: 'mp4', bits: 10, args: ['-c:v', 'libsvtav1', '-preset', preset.av1, '-crf', crf.av1, '-g', String(gop), '-svtav1-params', 'tune=0:scd=0:film-grain=0:enable-overlays=1'] },
  hevc: { ext: 'mp4', bits: 10, args: ['-c:v', 'libx265', '-preset', preset.hevc, '-crf', crf.hevc, '-profile:v', 'main10', '-tag:v', 'hvc1', '-x265-params', `keyint=${gop}:min-keyint=${gop}:scenecut=0:open-gop=0:aq-mode=3:log-level=error`] },
  h264: { ext: 'mp4', bits: 8, args: ['-c:v', 'libx264', '-preset', preset.h264, '-crf', crf.h264, '-profile:v', 'high', '-x264-params', `keyint=${gop}:min-keyint=${gop}:scenecut=0:aq-mode=3`] },
};

const rows = [];
for (const c of codecs) {
  const e = ENC[c];
  const out = opt.outdir
    ? path.join(path.resolve(opt.outdir), `${tag}-${c}.${e.ext}`)
    : path.join(dir, `${tag}-${c}${opt.scale ? '-' + W + 'x' + H : ''}-crf${crf[c]}${opt.trc === 'srgb' ? '-srgb' : ''}.${e.ext}`);
  const t0 = Date.now();
  run(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error', '-i', master, '-vf', toYuv(e.bits), ...e.args, ...tags, '-an', '-movflags', '+faststart', out]);
  const secs = (Date.now() - t0) / 1000;
  const pk = run(FFPROBE, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'packet=size,flags', '-of', 'csv=p=0', out]).stdout.trim().split('\n').map((l) => l.split(','));
  const sizes = pk.map((p) => +p[0]);
  const keys = pk.filter((p) => p[1].includes('K')).length;
  const n = sizes.length;
  const I = sizes[0];
  const P = (sizes.reduce((a, b) => a + b, 0) - I) / (n - 1);
  const bytes = fs.statSync(out).size;
  const row = {
    codec: c, file: path.basename(out), crf: +crf[c], size: `${W}x${H}`, frames: n, keyframes: keys,
    bytes, kbps: Math.round((bytes * 8) / (n / fps) / 1000),
    iframeKB: Math.round(I / 1024), meanPKB: +(P / 1024).toFixed(1),
    projectedLoopMB: +((I + (gop - 1) * P + (bytes - sizes.reduce((a, b) => a + b, 0))) / 1e6).toFixed(2),
    encodeSeconds: +secs.toFixed(1),
  };
  if (opt.metrics) {
    const lavfi = `[0:v]format=yuv420p10le,split[a][b];[1:v]${toYuv(10)},split[c][d];[a][c]ssim;[b][d]psnr`;
    const r = spawnSync(FFMPEG, ['-hide_banner', '-i', out, '-i', master, '-lavfi', lavfi, '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 1 << 28 });
    const ss = r.stderr.match(/SSIM Y:([\d.]+).*All:([\d.]+)/);
    const ps = r.stderr.match(/PSNR y:([\d.]+).*average:([\d.]+)/);
    row.ssimY = ss ? +(+ss[1]).toFixed(5) : null;
    row.psnrY = ps ? +(+ps[1]).toFixed(2) : null;
  }
  rows.push(row);
  console.log(JSON.stringify(row));
}
fs.writeFileSync(path.join(dir, `${tag}${opt.scale ? '-' + W + 'x' + H : ''}-encodes.json`), JSON.stringify(rows, null, 1));
