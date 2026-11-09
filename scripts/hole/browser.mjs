// Headless Chrome on the Mac's GPU (Metal through ANGLE) for the offline black hole renderer, driven over a bare
// DevTools protocol connection (Node 22's built-in WebSocket), not through Playwright.
//
// Tried Playwright first (as scripts/perf does): it turns on the protocol's Network domain for every page, and
// Chrome then copies each POST body into a network event. A 4K frame posted back to the local server became a
// string of several hundred MB inside Playwright, which first slowed every frame to seconds and then threw
// ERR_STRING_TOO_LONG on a 132 MB float map. With a raw connection only Runtime and Page are enabled, so the
// frames go to the server (server.mjs) and nowhere else.
//
// The binary is the Chrome for Testing that Playwright installs; HOLE_CHROME overrides it.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CHROME = process.env.HOLE_CHROME || '/Users/yanis/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
// a long offline frame must not be taken for a hung GPU process, and a background tab must not be throttled
const GPU_ARGS = ['--use-angle=metal', '--enable-gpu-rasterization', '--ignore-gpu-blocklist', '--disable-gpu-watchdog', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'];

/**
 * Starts Chrome and opens one page. Returns { goto(url), evaluate(expression), close() }. evaluate() runs an
 * expression in the page, awaits it if it is a promise, and returns its JSON value (keep results small: the
 * frames themselves travel by POST). Page console messages and errors are printed with a [page] prefix.
 */
export async function launchChrome({ quiet = false } = {}) {
  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hole-chrome-'));
  // --use-mock-keychain: without it Chrome waits forever on a macOS keychain prompt nobody can see (no DevTools
  // line ever appears); the other quiet flags are the ones Playwright passes for the same reasons
  const quietFlags = ['--use-mock-keychain', '--password-store=basic', '--no-service-autorun', '--disable-sync', '--disable-extensions', '--disable-component-update', '--disable-default-apps', '--disable-background-networking', '--metrics-recording-only'];
  const proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${userDir}`, '--no-first-run', '--no-default-browser-check', '--mute-audio', ...quietFlags, ...GPU_ARGS, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  const wsBrowser = await new Promise((resolve, reject) => {
    let buf = '';
    const timer = setTimeout(() => reject(new Error('Chrome did not start')), 30000);
    proc.stderr.on('data', (d) => {
      buf += String(d);
      const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) {
        clearTimeout(timer);
        resolve(m[1]);
      }
    });
    proc.on('exit', (c) => reject(new Error(`Chrome exited (${c})`)));
  });
  const port = new URL(wsBrowser).port;
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const target = list.find((t) => t.type === 'page');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => {
    ws.onopen = r;
    ws.onerror = j;
  });
  let seq = 0;
  const pending = new Map();
  const waiters = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
      return;
    }
    if (msg.method === 'Runtime.consoleAPICalled' && !quiet) {
      console.log('[page]', msg.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
    } else if (msg.method === 'Runtime.exceptionThrown') {
      console.log('[page error]', msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text);
    }
    for (let i = waiters.length - 1; i >= 0; i--) {
      if (waiters[i].method === msg.method) {
        waiters[i].resolve(msg.params);
        waiters.splice(i, 1);
      }
    }
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  const next = (method) => new Promise((resolve) => waiters.push({ method, resolve }));
  await send('Runtime.enable');
  await send('Page.enable');
  return {
    async goto(url) {
      const loaded = next('Page.loadEventFired');
      await send('Page.navigate', { url });
      await loaded;
    },
    async evaluate(expression) {
      const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    },
    async close() {
      try {
        ws.close();
      } catch {}
      proc.kill('SIGTERM');
      await new Promise((r) => setTimeout(r, 300));
      fs.rmSync(userDir, { recursive: true, force: true });
    },
  };
}
