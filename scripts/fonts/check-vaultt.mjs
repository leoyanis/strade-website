#!/usr/bin/env node
// Checks that the homepage Vaultt section never sets a character its self-hosted font subsets lack.
//
//   node scripts/fonts/check-vaultt.mjs                          the dev server (http://localhost:4321)
//   node scripts/fonts/check-vaultt.mjs --url http://host:port   any running copy of the site
//   node scripts/fonts/check-vaultt.mjs --build-dir .scratch/x   serves a production build itself
//
// How: opens the homepage (?still, so every number and card is in its finished state) at desktop and phone
// widths, walks every text node and generated ::before/::after string inside #mq-vaultt, groups the characters
// by the first family of their computed font-family, and compares those set in Bricolage Grotesque or Hanken
// Grotesk with the cmap of the matching subset (read with fontTools). Text the canvas draws in Hanken (the
// network's feedback bubbles, BUBBLES in network.ts) is added from the source, since no DOM node holds it.
// Text set in Inter (the drawn app cards, the canvas labels) is listed but not checked: Inter is the full face.
// Exits 1 and names each missing character, so it can gate a build. Regenerate with subset-vaultt.sh.
// Playwright comes from the copy npx cached (see scripts/perf/lib/pw.mjs; PERF_PLAYWRIGHT overrides it).
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from '../perf/lib/pw.mjs';
import { startServer } from '../perf/lib/server.mjs';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const arg = (k) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const SUBSETS = {
  'Bricolage Grotesque': resolve(ROOT, 'src/components/vaultt/fonts/bricolage-vaultt.woff2'),
  'Hanken Grotesk': resolve(ROOT, 'src/components/vaultt/fonts/hanken-vaultt.woff2'),
};

/** The code points a woff2 maps (fontTools in a subprocess: python -I so nothing local shadows it). */
function cmapOf(file) {
  const py = 'import sys, json\nfrom fontTools.ttLib import TTFont\nprint(json.dumps(sorted(TTFont(sys.argv[1]).getBestCmap().keys())))';
  const r = spawnSync('python3', ['-I', '-c', py, file], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`fontTools could not read ${file}: ${r.stderr}`);
  return new Set(JSON.parse(r.stdout));
}

/** Strings the world canvas draws in Hanken Grotesk, read from network.ts so they never drift from it. */
function canvasHankenText() {
  const src = readFileSync(resolve(ROOT, 'src/components/vaultt/network.ts'), 'utf8');
  const m = /const BUBBLES = \[([^\]]*)\]/.exec(src);
  return m ? [...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1]).join('') : '';
}

let server = null;
let base = arg('url') || 'http://localhost:4321';
if (arg('build-dir')) {
  const port = Number(arg('port') || 4419);
  server = await startServer({ root: resolve(ROOT, arg('build-dir')), port });
  base = server.url;
}

const browser = await launch('chromium');
const found = {}; // family -> Set of characters
const fetched = new Set();
for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  page.on('request', (r) => {
    const u = r.url();
    if (/\.woff2(\?|$)|fonts\.googleapis/.test(u)) fetched.add(u.replace(base, ''));
  });
  await page.goto(`${base.replace(/\/$/, '')}/?still`, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const got = await page.evaluate(() => {
    const root = document.getElementById('mq-vaultt');
    if (!root) return null;
    const out = {};
    const add = (el, text) => {
      if (!text) return;
      const fam = getComputedStyle(el).fontFamily.split(',')[0].replace(/["']/g, '').trim();
      out[fam] = (out[fam] || '') + text;
    };
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) {
      const el = n.parentElement;
      if (!el || el.closest('script, style')) continue;
      // screen-reader copies (VaulttNumber's .vn__sr: a 1px clipped box) are never painted, so no glyph of theirs
      // is ever drawn from the subset (it inherits the number's Bricolage, but says "projects shared")
      const box = el.getBoundingClientRect();
      if (box.width <= 1 && box.height <= 1) continue;
      add(el, n.textContent.replace(/\s+/g, ' ').trim());
    }
    for (const el of root.querySelectorAll('*')) {
      for (const pseudo of ['::before', '::after']) {
        const c = getComputedStyle(el, pseudo).content;
        if (c && c !== 'none' && c !== 'normal' && /^["']/.test(c)) {
          const fam = getComputedStyle(el, pseudo).fontFamily.split(',')[0].replace(/["']/g, '').trim();
          out[fam] = (out[fam] || '') + c.slice(1, -1);
        }
      }
    }
    return out;
  });
  if (!got) throw new Error('no #mq-vaultt on the homepage');
  for (const [fam, text] of Object.entries(got)) {
    found[fam] ||= new Set();
    for (const ch of text) found[fam].add(ch);
  }
  await ctx.close();
}
await browser.close();
// not awaited: the harness server's close() waits for idle keep-alive sockets, and the exit below ends them anyway
if (server) server.close();

found['Hanken Grotesk'] ||= new Set();
for (const ch of canvasHankenText()) found['Hanken Grotesk'].add(ch);

let missing = 0;
for (const [fam, file] of Object.entries(SUBSETS)) {
  const cmap = cmapOf(file);
  const chars = [...(found[fam] || [])].filter((c) => c.trim());
  const lack = chars.filter((c) => !cmap.has(c.codePointAt(0)));
  console.log(`${fam}: ${chars.length} characters set, subset maps ${cmap.size}${lack.length ? `, MISSING ${lack.map((c) => `"${c}" U+${c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`).join(' ')}` : ', all covered'}`);
  missing += lack.length;
}
for (const [fam, set] of Object.entries(found)) {
  if (SUBSETS[fam]) continue;
  console.log(`${fam} (not a subset, not checked): ${[...set].filter((c) => c.trim()).sort().join('')}`);
}
console.log(`font files requested: ${[...fetched].join(', ') || 'none'}`);
if ([...fetched].some((u) => /fonts\.googleapis.*(Bricolage|Hanken)/.test(u))) {
  console.log('FAIL: the page still asks Google Fonts for Bricolage or Hanken');
  missing++;
}
if (missing) {
  console.log('FAIL: add the characters to BRIC in scripts/fonts/subset-vaultt.sh (or widen the Hanken range), rerun it');
  process.exit(1);
}
console.log('OK');
process.exit(0);
