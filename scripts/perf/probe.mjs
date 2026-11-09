// Quick environment probe: GPU renderer strings, rAF cadence and input support per engine.
// node scripts/perf/probe.mjs [url]
import { launch, playwright } from './lib/pw.mjs';

const url = process.argv[2] || 'about:blank';
const RAF = `new Promise((res) => { const ts = []; const step = (t) => { ts.push(t); if (ts.length < 121) requestAnimationFrame(step); else res(ts); }; requestAnimationFrame(step); })`;
const GL = `(() => { const c = document.createElement('canvas'); const g = c.getContext('webgl2') || c.getContext('webgl'); if (!g) return 'no webgl'; const e = g.getExtension('WEBGL_debug_renderer_info'); return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) + ' | ' + g.getParameter(e.UNMASKED_VENDOR_WEBGL) : g.getParameter(g.RENDERER); })()`;

for (const engine of ['chromium', 'webkit']) {
  const t0 = Date.now();
  const browser = await launch(engine);
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(url === 'about:blank' ? 'data:text/html,<body style="height:5000px"><p>probe</p></body>' : url);
  const gl = await page.evaluate(GL);
  const ts = await page.evaluate(RAF);
  const d = ts.slice(1).map((t, i) => t - ts[i]).sort((a, b) => a - b);
  console.log(`[${engine}] version=${browser.version()} launch=${Date.now() - t0}ms`);
  console.log(`[${engine}] webgl: ${gl}`);
  console.log(`[${engine}] rAF median=${d[d.length >> 1].toFixed(2)}ms p95=${d[Math.floor(d.length * 0.95)].toFixed(2)}ms`);
  console.log(`[${engine}] UA: ${await page.evaluate('navigator.userAgent')}`);
  if (engine === 'chromium') {
    const cdp = await ctx.newCDPSession(page);
    const before = await page.evaluate('scrollY');
    const t1 = Date.now();
    await cdp.send('Input.synthesizeScrollGesture', { x: 700, y: 450, yDistance: -1200, speed: 1200, gestureSourceType: 'mouse' });
    console.log(`[chromium] synthesizeScrollGesture mouse: scrollY ${before} -> ${await page.evaluate('scrollY')} in ${Date.now() - t1}ms`);
    const info = await cdp.send('SystemInfo.getInfo').catch((e) => ({ err: String(e) }));
    if (info.gpu) {
      console.log(`[chromium] gpu devices: ${JSON.stringify(info.gpu.devices.map((x) => x.deviceString || x.vendorString))}`);
      const fs = info.gpu.featureStatus || {};
      console.log(`[chromium] feature status: ${JSON.stringify(fs)}`);
    } else console.log('[chromium] SystemInfo', JSON.stringify(info).slice(0, 300));
  } else {
    const before = await page.evaluate('scrollY');
    await page.mouse.move(700, 450);
    for (let i = 0; i < 20; i++) await page.mouse.wheel(0, 40);
    await page.waitForTimeout(300);
    console.log(`[webkit] mouse.wheel x20: scrollY ${before} -> ${await page.evaluate('scrollY')}`);
    const mctx = await browser.newContext({ ...playwright().devices['iPhone 15'] });
    const mp = await mctx.newPage();
    await mp.goto('data:text/html,<meta name=viewport content="width=device-width"><body style="height:5000px">m</body>');
    console.log(`[webkit iPhone 15] innerWidth=${await mp.evaluate('innerWidth')} dpr=${await mp.evaluate('devicePixelRatio')} touch=${await mp.evaluate('"ontouchstart" in window')} pointer coarse=${await mp.evaluate('matchMedia("(pointer: coarse)").matches')}`);
    await mp.mouse.move(200, 300);
    for (let i = 0; i < 10; i++) await mp.mouse.wheel(0, 40);
    await mp.waitForTimeout(300);
    console.log(`[webkit iPhone 15] wheel scrollY -> ${await mp.evaluate('scrollY')}`);
    const ts2 = await mp.evaluate(RAF);
    const d2 = ts2.slice(1).map((t, i) => t - ts2[i]).sort((a, b) => a - b);
    console.log(`[webkit iPhone 15] rAF median=${d2[d2.length >> 1].toFixed(2)}ms`);
  }
  await browser.close();
}
