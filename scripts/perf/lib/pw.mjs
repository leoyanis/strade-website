// Loads Playwright without making it a repo dependency, and launches the engines the harness measures.
// Playwright 1.64 is cached by npx; PERF_PLAYWRIGHT points at another install if that cache moves.
import { createRequire } from 'node:module';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const DEFAULT_PW = '/Users/yanis/.npm/_npx/e41f203b7505f1fb/node_modules/playwright';
const CACHE = process.env.PLAYWRIGHT_BROWSERS_PATH || join(homedir(), 'Library/Caches/ms-playwright');

let pw;
export function playwright() {
  if (pw) return pw;
  const dir = process.env.PERF_PLAYWRIGHT || DEFAULT_PW;
  if (!existsSync(join(dir, 'package.json'))) {
    throw new Error(`Playwright not found at ${dir}. Set PERF_PLAYWRIGHT to a playwright package folder.`);
  }
  const require = createRequire(join(dir, 'package.json'));
  pw = require(dir);
  return pw;
}

// Playwright 1.64 wants chromium-1248, but only chromium-1223 is cached and downloads are off the table, so the
// executable is found by hand: the newest cached "Google Chrome for Testing" build (the full browser, which runs
// headless=new and can use the GPU; the headless shell cannot).
export function chromiumExecutable() {
  if (process.env.PERF_CHROMIUM) return process.env.PERF_CHROMIUM;
  if (!existsSync(CACHE)) return undefined;
  const dirs = readdirSync(CACHE).filter((d) => /^chromium-\d+$/.test(d)).sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
  for (const d of dirs) {
    const p = join(CACHE, d, 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
    if (existsSync(p)) return p;
    const p2 = join(CACHE, d, 'chrome-mac/Chromium.app/Contents/MacOS/Chromium');
    if (existsSync(p2)) return p2;
  }
  return undefined;
}

// GPU flags for headless Chromium on macOS. Without them WebGL can fall back to SwiftShader (software), which makes
// paint and raster look far worse than on Yanis's Mac. The probe command prints the renderer string to confirm.
export const CHROMIUM_GPU_ARGS = [
  '--use-angle=metal',
  '--enable-gpu-rasterization',
  '--ignore-gpu-blocklist',
  '--enable-zero-copy',
  // keep timers and rAF running at full rate in a headless page that is never "visible" on screen
  '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows',
  // no autoplay flag on purpose: the default policy (muted video plays, sound waits for a gesture) is what a
  // visitor gets, and the audio checks depend on it
];

export async function launch(engine, { gpu = true, extraArgs = [] } = {}) {
  const p = playwright();
  if (engine === 'webkit') {
    // WebKit runs headless with the Mac's GPU (Safari's engine, not an iPhone)
    return p.webkit.launch({ headless: true });
  }
  const executablePath = chromiumExecutable();
  return p.chromium.launch({
    headless: true,
    executablePath,
    // the full Chromium build in headless=new mode (Playwright picks the right flag for a non-shell binary)
    args: [...(gpu ? CHROMIUM_GPU_ARGS : []), ...extraArgs],
  });
}
