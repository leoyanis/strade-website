// Generates the 1200x630 link-preview images in public/og/ (what Instagram DMs,
// iMessage, WhatsApp and LinkedIn show when a link is shared).
//
//   npm run og            -> all cards
//   npm run og ship-safe  -> only cards whose name contains "ship-safe"
//
// Renders HTML with a local Chromium browser (Chrome or Brave). Set CHROME=/path
// to use another one. Run it after adding a free resource or a project.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pub = path.join(root, 'public');
const outDir = path.join(pub, 'og');
fs.mkdirSync(outDir, { recursive: true });

// Data modules are TypeScript; Node 22 strips the types on import.
const { PROJECTS } = await import(pathToFileURL(path.join(root, 'src/data/work.ts')));
const { RESOURCES } = await import(pathToFileURL(path.join(root, 'src/data/resources.ts')));
const { SITE } = await import(pathToFileURL(path.join(root, 'src/data/site.ts')));

const browsers = [
  process.env.CHROME,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);
const browser = browsers.find((b) => fs.existsSync(b));
if (!browser) {
  console.error('No Chrome/Brave/Chromium found. Set CHROME=/path/to/browser.');
  process.exit(1);
}

const file = (p) => pathToFileURL(path.join(pub, p)).href;
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function card({ kicker, title, line, accent = '#00e5ff', image, imageFit = 'cover', imageBg = '#0b0b0b', light = false }) {
  const bg = light ? '#F2F0EB' : '#070708';
  const ink = light ? '#111' : '#f2f2f2';
  const muted = light ? '#555' : '#9a9a9a';
  return `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@500;700;800&family=JetBrains+Mono:wght@500;600&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1200px;height:630px;overflow:hidden}
body{background:${bg};color:${ink};font-family:Inter,system-ui,sans-serif;position:relative}
.glow{position:absolute;width:900px;height:900px;border-radius:50%;left:-260px;top:-380px;background:radial-gradient(circle,${accent}33,transparent 62%)}
.grid{position:absolute;inset:0;background-image:linear-gradient(${light ? 'rgba(0,0,0,.06)' : 'rgba(255,255,255,.04)'} 1px,transparent 1px),linear-gradient(90deg,${light ? 'rgba(0,0,0,.06)' : 'rgba(255,255,255,.04)'} 1px,transparent 1px);background-size:40px 40px;mask-image:linear-gradient(90deg,#000,transparent 75%)}
.l{position:absolute;left:64px;top:64px;bottom:64px;width:${image ? 600 : 1070}px;display:flex;flex-direction:column}
.k{font-family:'JetBrains Mono',monospace;font-size:20px;letter-spacing:.14em;text-transform:uppercase;color:${accent};font-weight:600}
h1{font-size:${title.length > 34 ? 62 : title.length > 18 ? 78 : 104}px;line-height:.98;letter-spacing:-.045em;font-weight:800;margin-top:22px}
p{font-size:27px;line-height:1.35;color:${muted};margin-top:22px;max-width:560px}
.me{margin-top:auto;display:flex;align-items:center;gap:16px;font-size:24px;font-weight:700}
.me img{width:60px;height:60px;border-radius:50%;object-fit:cover;border:3px solid ${accent}}
.me span{color:${muted};font-weight:500}
.r{position:absolute;right:-30px;top:70px;width:540px;height:490px;transform:rotate(-4deg);border-radius:22px;overflow:hidden;background:${imageBg};box-shadow:0 30px 80px rgba(0,0,0,.5),0 0 0 2px ${accent}55}
.r img{width:100%;height:100%;object-fit:${imageFit};${imageFit === 'contain' ? 'padding:24px;' : ''}}
.bar{position:absolute;left:0;right:0;bottom:0;height:10px;background:${accent}}
</style></head><body>
<div class="glow"></div><div class="grid"></div>
<div class="l">
  <div class="k">${esc(kicker)}</div>
  <h1>${esc(title)}</h1>
  ${line ? `<p>${esc(line)}</p>` : ''}
  <div class="me"><img src="${file(SITE.avatar)}"><div>Yanis Schweizer <span>· ${esc(SITE.instagramHandle)}</span></div></div>
</div>
${image ? `<div class="r"><img src="${file(image)}"></div>` : ''}
<div class="bar"></div>
</body></html>`;
}

const cards = [
  { name: 'default', html: card({ kicker: 'Builder · apps, automations, AI tools', title: 'AI made the code free. I make the decisions.', line: 'Fixed price. You own the code.', image: SITE.portrait, imageFit: 'cover' }) },
  { name: 'work', html: card({ kicker: 'My work', title: 'Everything I’ve built.', line: 'Vaultt, Kleus, Endless Pursuit and every side quest.', image: '/images/work/vaultt/cards.webp' }) },
  { name: 'free', html: card({ kicker: 'Free stuff · no email needed', title: 'Skills, prompts and templates I actually use.', line: 'Everything I give away in my DMs.', accent: '#FFB000' }) },
  ...PROJECTS.map((p) => ({
    name: `work-${p.slug}`,
    html: card({
      kicker: `${p.tier === 'main' ? 'Main quest' : 'Side quest'} · ${p.status === 'Work in progress' ? p.status : p.kind === 'product' ? 'My product' : 'Case study'}`,
      title: p.name,
      line: p.summary,
      accent: p.accent,
      image: p.cover.type === 'image' ? p.cover.src : null,
      imageFit: p.cover.type === 'image' ? p.cover.fit ?? 'cover' : 'cover',
      imageBg: p.cover.type === 'image' ? p.cover.bg ?? '#0b0b0b' : '#0b0b0b',
    }),
  })),
  ...RESOURCES.filter((r) => r.published).map((r) => ({
    name: `free-${r.slug}`,
    html: card({ kicker: `Free ${r.kind.toLowerCase()} · from Yanis`, title: r.title.split(':')[0], line: r.ogLine ?? (r.title.includes(':') ? cap(r.title.split(':').slice(1).join(':').trim()) : r.summary), accent: r.accent ?? '#FFB000' }),
  })),
];

const only = process.argv[2];
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'og-'));
for (const c of cards.filter((c) => !only || c.name.includes(only))) {
  const html = path.join(tmp, `${c.name}.html`);
  fs.writeFileSync(html, c.html);
  const out = path.join(outDir, `${c.name}.png`);
  execFileSync(browser, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--allow-file-access-from-files',
    '--window-size=1200,630', '--virtual-time-budget=5000', `--screenshot=${out}`, pathToFileURL(html).href,
  ], { stdio: 'ignore' });
  console.log('✓', path.relative(root, out));
}
fs.rmSync(tmp, { recursive: true, force: true });
