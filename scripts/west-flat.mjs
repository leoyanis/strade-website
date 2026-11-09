// Bakes the west's five static layers (the sun, the far mesas, the buttes, the town and the boardwalk: the art boxes
// in src/components/west/WestWorld.astro) into images for phones. In WebKit (Safari, every iOS browser) on screens up
// to 767 px wide west.ts swaps them in for the live SVG, fetched and decoded about two screens before the act, so the
// frame that reveals the west draws five decoded bitmaps instead of painting ~900 SVG nodes cold (2026-11-09 audit,
// B02). Desktop, and Chromium and Gecko phones (where it gained about nothing), keep the SVG.
//
//   node scripts/west-flat.mjs --build-dir .scratch/build     a production build of the current tree, served here
//   node scripts/west-flat.mjs --url http://127.0.0.1:4463    or a server already running one
//
// Run it after any change to that art, or to the layers' sizes in src/styles/west.css, and commit public/images/west/
// and src/components/west/flat.json with the change: the images are the art as it was when they were made.
//
// How: WebKit (the iPhone's engine) draws each layer's art box on its own, over transparency, at DPR 3, once per width
// in WIDTHS. A width is the art box in device pixels (the scene's 1600 units across) and its CSS width is a third of it
// (to the nearest CSS px, the DPR a hair off 3 to make up the rest), so the sun's box-shadow (sized in CSS px, unlike
// everything else, which scales with the box) comes out the size a phone draws it when its art box is that wide (west.ts
// picks the sun's width by that). Each is cut to the rows and columns it paints, in steps of 20 scene units (whole pixels
// at every width), its box in % of the art box going into flat.json, and written as AVIF (4:4:4:
// the thin rim lights keep their colour) and, up to WEBP_MAX and but for the sun, WebP (for browsers without AVIF:
// old iPhones, which need no more; the sun's soft glow is 130 to 250 KB as WebP, against 30 as AVIF, so there it stays
// live). Left out, because they stay live above the images: the overlays (heat shimmer, hawk, tumbleweeds, window
// glows, smoke, sign), which move, and the town's two painted signs' lettering (SALOON, GENERAL STORE), which each
// engine sets a little differently (Chromium's letters sat up to a few px off WebKit's), so each keeps its own.
import { mkdirSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { playwright } from './perf/lib/pw.mjs';
import { startServer } from './perf/lib/server.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
let OUT = join(ROOT, 'public/images/west');
let MANIFEST = join(ROOT, 'src/components/west/flat.json');
// art box widths in device px. 2640 covers a 430 px wide phone at DPR 3 (its art box is at most 1.6 x 58% of a 932 px
// screen, 865 CSS px, 2595 px) without upscaling; the steps between are 6 to 13% apart, so a phone's image is never more
// than that wider than it draws it (a downscaled image softens: by 5% it is already a little softer than the SVG at 3x
// zoom). Multiples of 80, so every layer's height is whole too
let WIDTHS = [1200, 1360, 1520, 1680, 1840, 2000, 2160, 2320, 2480, 2640];
// the widest WebP: browsers without AVIF are old iPhones (iOS 15 and before: up to the 7 Plus, art box at most ~1840 px)
const WEBP_MAX = 1840;
// each layer's share of the scene's height (west.css --k) and the scene row its viewBox starts at (WestWorld.astro)
// q: the AVIF quality (the sun is one smooth glow: 55 holds it to 54 dB, 99.9% of pixels within 3 levels, at 30 KB);
// webp: whether it has a WebP fallback
const LAYERS = {
  sun: { k: 1, y0: 0, q: 55, webp: false },
  far: { k: 0.7, y0: 300, q: 88, webp: true },
  mid: { k: 0.38, y0: 420, q: 88, webp: true },
  town: { k: 0.72, y0: 280, q: 88, webp: true },
  near: { k: 0.42, y0: 580, q: 88, webp: true },
};
const STEP = 20;
// encoder settings, checked against the PNG of the town at 2640 (composited over the dusk purple and the horizon
// orange): AVIF 52.7 dB, 99.9% of pixels within 3 levels, the worst a few lone pixels on window frames (45 KB);
// WebP near-lossless 58.5 dB, every pixel within 4 levels (141 KB, only for browsers without AVIF). 8 bit, not 10: a
// 10-bit AVIF can be decoded to 16 bits a channel, twice the memory, for no visible gain over an 8-bit source
const AVIF = { chromaSubsampling: '4:4:4', bitdepth: 8, effort: 4 };
const WEBP = { nearLossless: true, quality: 60, effort: 6 };

/**
 * The colour under thin alpha, made smooth. A screenshot over transparency is drawn premultiplied in 8 bits and written
 * straight, so where a pixel is nearly clear (the sun's glow fading out, an edge's last pixel) its colour is a small
 * number divided by a tiny alpha: noise (255,0,0 at alpha 1 beside 255,255,255) that cost the encoder more than the
 * whole picture (the sun was 200 to 550 KB) and that nobody sees, since only colour x alpha is drawn. Each colour
 * channel is moved toward the alpha-weighted average of its neighbourhood (a blur of the premultiplied picture over the
 * blur of its alpha: the gradient's own colour, which the rounding lost), but only as far as it still premultiplies to
 * the same value: what a browser draws is unchanged, bit for bit (checked). Clear pixels take that colour outright, so
 * the colour runs on past an edge instead of dropping to black. In place, on RGBA bytes.
 */
function cleanUnderAlpha(px, w, h, R = 6) {
  const n = w * h;
  const f = [new Float32Array(n), new Float32Array(n), new Float32Array(n), new Float32Array(n)];
  for (let i = 0; i < n; i++) {
    const a = px[i * 4 + 3];
    f[3][i] = a;
    for (let c = 0; c < 3; c++) f[c][i] = px[i * 4 + c] * a;
  }
  // three passes of a box blur of radius R, each way (about a gaussian of sigma 6 px, 2 CSS px)
  const tmp = new Float32Array(n);
  const box = (src, dst, len, stride, lines, lineStride) => {
    const inv = 1 / (2 * R + 1);
    for (let l = 0; l < lines; l++) {
      const o = l * lineStride;
      let s = 0;
      for (let k = -R; k <= R; k++) s += src[o + Math.min(len - 1, Math.max(0, k)) * stride];
      for (let k = 0; k < len; k++) {
        dst[o + k * stride] = s * inv;
        s += src[o + Math.min(len - 1, k + R + 1) * stride] - src[o + Math.max(0, k - R) * stride];
      }
    }
  };
  for (const g of f) for (let p = 0; p < 3; p++) {
    box(g, tmp, w, 1, h, w);
    box(tmp, g, h, w, w, 1);
  }
  const pm = (c, a) => Math.round((c * a) / 255);
  for (let i = 0; i < n; i++) {
    const a = px[i * 4 + 3];
    if (a === 255 || f[3][i] < 1e-3) continue;
    for (let c = 0; c < 3; c++) {
      const want = Math.min(255, Math.max(0, Math.round(f[c][i] / f[3][i])));
      if (a === 0) {
        px[i * 4 + c] = want;
        continue;
      }
      const v = px[i * 4 + c];
      const p = pm(v, a);
      // the colours that premultiply to p (round(t a / 255) = p: t in [(p - 0.5) 255 / a, (p + 0.5) 255 / a)),
      // the one nearest the neighbourhood's colour
      const lo = Math.max(0, Math.ceil(((p - 0.5) * 255) / a));
      const hi = Math.min(255, Math.ceil(((p + 0.5) * 255) / a) - 1);
      const t = Math.min(hi, Math.max(lo, want));
      if (pm(t, a) === p) px[i * 4 + c] = t;
    }
  }
}

function args(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) o[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
  return o;
}

const o = args(process.argv.slice(2));
// --out <dir> --manifest <file> --widths a,b: a trial run somewhere else (the real one writes the defaults)
if (o.out) OUT = resolve(o.out);
if (o.manifest) MANIFEST = resolve(o.manifest);
if (o.widths) WIDTHS = String(o.widths).split(',').map(Number);
// --keep <dir>: also write each capture, cleaned, as PNG (for checking the encodes against)
if (o.keep) mkdirSync(resolve(o.keep), { recursive: true });
let server = null;
let url = o.url;
if (!url) {
  if (!o['build-dir']) throw new Error('give --build-dir <a production build> or --url <a server running one>');
  server = await startServer({ root: resolve(o['build-dir']), port: Number(o.port || 4398) });
  url = `http://127.0.0.1:${Number(o.port || 4398)}`;
}

const { webkit } = playwright();
const browser = await webkit.launch();
/** name -> width -> { png: Buffer, box: [x0, y0, x1, y1] in device px, painted pixels only } */
const shots = {};
try {
  for (const W of WIDTHS) {
    const A = Math.round(W / 3);
    const dpr = W / A;
    const S = A / 1.6;
    const ctx = await browser.newContext({ viewport: { width: A + 40, height: Math.ceil(S) + 40 }, deviceScaleFactor: dpr, reducedMotion: 'reduce' });
    // the live SVG only: these images must never be drawn from themselves
    await ctx.route('**/images/west/**', (r) => r.abort());
    const page = await ctx.newPage();
    await page.goto(`${url}/?still`, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    if (!(await page.evaluate(() => document.fonts.check('800 60px Geist')))) throw new Error('Geist 800 did not load: the town signs would be drawn in another font');
    await page.addStyleTag({
      content: `
        html, body { background: transparent !important; }
        html * { visibility: hidden !important; animation: none !important; transition: none !important; }
        .themes, .theme--west, .w-wipe, .w-wipe__inner { display: block !important; content-visibility: visible !important; transform: none !important; translate: none !important; will-change: auto !important; opacity: 1 !important; filter: none !important; clip-path: none !important; }
        .theme--west { --sh: ${S}px !important; --sb: 0px !important; }
        .theme--west .w-l { display: none !important; }
        .theme--west .w-l.cap { display: block !important; position: absolute !important; left: 0 !important; top: 0 !important; right: auto !important; bottom: auto !important; width: ${A}px !important; transform: none !important; translate: none !important; }
        .theme--west .w-l.cap > .w-art { position: absolute !important; left: 0 !important; top: 0 !important; bottom: auto !important; translate: none !important; --dx: 0% !important; }
        .theme--west .w-flat { display: none !important; }
        .theme--west .w-l.cap > .w-art > svg, .theme--west .w-l.cap .w-sun__glow, .theme--west .w-l.cap .w-sun__disc { display: block !important; }
        .theme--west .w-l.cap > .w-art, .theme--west .w-l.cap > .w-art > svg, .theme--west .w-l.cap > .w-art > svg *,
        .theme--west .w-l.cap .w-sun__glow, .theme--west .w-l.cap .w-sun__disc { visibility: visible !important; }
        .theme--west .w-l.cap > .w-art > svg text { visibility: hidden !important; }
      `,
    });
    for (const [name, { k }] of Object.entries(LAYERS)) {
      const H = S * k;
      // the art box at exactly A x H CSS px (its width otherwise follows its height through aspect-ratio, and a height
      // rounded to a layout unit, 1/64 px, came out up to 0.05 px narrow)
      await page.evaluate(([n, A, H]) => {
        for (const el of document.querySelectorAll('.theme--west .w-l')) el.classList.toggle('cap', el.classList.contains(`w-l--${n}`));
        const l = document.querySelector(`.theme--west .w-l--${n}`);
        const art = l.querySelector('.w-art');
        art.style.setProperty('width', `${A}px`, 'important');
        art.style.setProperty('height', `${H}px`, 'important');
        art.style.setProperty('aspect-ratio', 'auto', 'important');
        l.style.setProperty('height', `${H}px`, 'important');
      }, [name, A, H]);
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      const r = await page.evaluate((n) => {
        const b = document.querySelector(`.theme--west .w-l--${n} > .w-art`).getBoundingClientRect();
        return [b.x, b.y, b.width, b.height];
      }, name);
      // (to a layout unit, 1/64 CSS px)
      if (Math.abs(r[0]) > 0.02 || Math.abs(r[1]) > 0.02 || Math.abs(r[2] - A) > 0.02 || Math.abs(r[3] - H) > 0.02) throw new Error(`${name} at ${W}: art box ${r.join(' ')}, expected 0 0 ${A} ${H}`);
      // a CSS px more than the box, then cut to its exact device rows (W k / 1.6, whole): Playwright rounds a clip whose
      // height is not whole in device px down a row
      const Hd = Math.round((W * k) / 1.6);
      const shot = await page.screenshot({ clip: { x: 0, y: 0, width: A, height: Math.ceil(H) + 1 }, omitBackground: true, animations: 'disabled' });
      const png = await sharp(shot).extract({ left: 0, top: 0, width: W, height: Hd }).png().toBuffer();
      const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      if (info.width !== W || info.height !== Hd) throw new Error(`${name} at ${W}: got ${info.width}x${info.height}, expected ${W}x${Hd}`);
      const before = Buffer.from(data);
      cleanUnderAlpha(data, info.width, info.height);
      // nothing drawn may change: every pixel premultiplies to what it did
      for (let i = 0; i < data.length; i += 4) {
        const a = data[i + 3];
        for (let c = 0; c < 3; c++) if (Math.round((data[i + c] * a) / 255) !== Math.round((before[i + c] * a) / 255)) throw new Error(`${name} at ${W}: cleaning changed pixel ${i / 4}`);
      }
      let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
      for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) if (data[(y * info.width + x) * 4 + 3]) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
      (shots[name] ??= {})[W] = { raw: data, w: info.width, h: info.height, box: [x0, y0, x1 + 1, y1 + 1] };
      if (o.keep) writeFileSync(join(resolve(o.keep), `${name}-${W}.png`), await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer());
      console.log(`${name} ${W}: ${info.width}x${info.height}, painted ${x0}..${x1 + 1} x ${y0}..${y1 + 1}`);
    }
    await ctx.close();
  }
} finally {
  await browser.close();
  server?.close?.();
}

// per layer and width, a box in scene units from its art box's top left: the pixels that width paints, out to 20-unit
// steps (whole pixels at every width). Per width, not one for all: the sun's halo is sized in CSS px, so at a narrow
// art box it reaches much further across the scene (its box at 1200 is 880 units tall, at 2640 it needs 660), and a
// box made for the narrowest would decode a quarter more pixels than the widest needs
mkdirSync(OUT, { recursive: true });
for (const f of readdirSync(OUT)) rmSync(join(OUT, f));
const manifest = { widths: WIDTHS, webpMax: WEBP_MAX, layers: {} };
const pct = (n, d) => Math.round((n / d) * 1e6) / 1e4;
for (const [name, { k, q, webp: hasWebp }] of Object.entries(LAYERS)) {
  const Hu = 1000 * k;
  manifest.layers[name] = { webp: hasWebp, boxes: {} };
  for (const W of WIDTHS) {
    const s = 1600 / W;
    const [x0, y0, x1, y1] = shots[name][W].box;
    const u0 = Math.max(0, Math.floor((x0 * s) / STEP) * STEP);
    const v0 = Math.max(0, Math.floor((y0 * s) / STEP) * STEP);
    const u1 = Math.min(1600, Math.ceil((x1 * s) / STEP) * STEP);
    const v1 = Math.min(Hu, Math.ceil((y1 * s) / STEP) * STEP);
    manifest.layers[name].boxes[W] = { left: pct(u0, 1600), top: pct(v0, Hu), width: pct(u1 - u0, 1600), height: pct(v1 - v0, Hu) };
    const crop = { left: u0 / s, top: v0 / s, width: (u1 - u0) / s, height: (v1 - v0) / s };
    for (const [key, v] of Object.entries(crop)) {
      if (Math.abs(v - Math.round(v)) > 1e-6) throw new Error(`${name} at ${W}: crop ${JSON.stringify(crop)} is not whole pixels`);
      crop[key] = Math.round(v);
    }
    const sh = shots[name][W];
    const img = sharp(sh.raw, { raw: { width: sh.w, height: sh.h, channels: 4 } }).extract(crop);
    const avif = await img.clone().avif({ ...AVIF, quality: q }).toBuffer();
    writeFileSync(join(OUT, `${name}-${W}.avif`), avif);
    const webp = hasWebp && W <= WEBP_MAX ? await img.clone().webp(WEBP).toBuffer() : null;
    if (webp) writeFileSync(join(OUT, `${name}-${W}.webp`), webp);
    console.log(`${name}-${W}: ${crop.width}x${crop.height} (units ${u0}..${u1} x ${v0}..${v1}), avif ${(avif.length / 1024).toFixed(1)} KB` + (webp ? `, webp ${(webp.length / 1024).toFixed(1)} KB` : ''));
  }
}
writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
console.log('wrote', MANIFEST);
