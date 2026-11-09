// Input drivers: real input wherever the engine allows it.
// - Chromium: CDP Input.synthesizeScrollGesture, the browser's own synthetic gesture (wheel phases like a trackpad
//   for 'mouse', a finger drag for 'touch'), paced at vsync inside the browser, so the harness's event loop cannot
//   make the speed uneven. This is what Chromium's own smoothness benchmarks use.
// - WebKit desktop: page.mouse.wheel ticks on a wall clock (each tick sends whatever the clock says is due).
// - WebKit iPhone: Playwright's mobile WebKit has no wheel and no touch drag, so the page scrolls itself at the same
//   steady speed from a rAF loop (window.scrollTo). Scroll events and every scroll-linked effect still run.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function scrollY(page) {
  return page.evaluate(() => window.scrollY);
}

async function maxScroll(page) {
  return page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
}

// Scroll from the current position down to `to` (or the bottom) at `speed` px/s.
export async function scrollDown(page, { prof, cdp, speed, to, fling = false }) {
  const vp = page.viewportSize();
  const target = Math.min(to ?? Infinity, await maxScroll(page));
  const t0 = Date.now();
  let stuck = 0;
  if (prof.input === 'cdp-mouse') {
    // pointer where a reader's hand rests: right of centre, mid height
    let x = Math.round(vp.width * 0.62);
    const y = Math.round(vp.height * 0.5);
    for (;;) {
      const at = await scrollY(page);
      const left = target - at;
      if (left < 4) break;
      const chunk = Math.min(4000, left);
      await cdp.send('Input.synthesizeScrollGesture', { x, y, yDistance: -chunk, speed, gestureSourceType: 'mouse', preventFling: true });
      const moved = (await scrollY(page)) - at;
      if (moved < chunk * 0.5) {
        // something under the pointer took the wheel (a widget that turns on wheel); try further left
        stuck++;
        x = stuck === 1 ? 24 : Math.round(vp.width * 0.5);
        if (stuck > 3) break;
      }
    }
  } else if (prof.input === 'cdp-touch') {
    // a thumb: swipes of 60% of the screen, finger lifted between them (no fling on the steady pass)
    const x = Math.round(vp.width * 0.5);
    const swipe = Math.round(vp.height * 0.6);
    for (;;) {
      const at = await scrollY(page);
      const left = target - at;
      if (left < 4) break;
      const d = Math.min(swipe, left);
      await cdp.send('Input.synthesizeScrollGesture', {
        x,
        y: Math.round(vp.height * 0.8),
        yDistance: -d,
        speed,
        gestureSourceType: 'touch',
        preventFling: !fling,
      });
      if (fling) await sleep(120);
      const moved = (await scrollY(page)) - at;
      if (moved < 2) {
        stuck++;
        if (stuck > 3) break;
      } else stuck = 0;
    }
    if (fling) await waitScrollIdle(page);
  } else if (prof.input === 'wheel') {
    await page.mouse.move(Math.round(vp.width * 0.62), Math.round(vp.height * 0.5));
    let sent = 0;
    const start = await scrollY(page);
    const total = target - start;
    const s0 = Date.now();
    while (sent < total) {
      const due = Math.min(total, ((Date.now() - s0) / 1000) * speed);
      const d = Math.round(due - sent);
      if (d >= 1) {
        await page.mouse.wheel(0, d);
        sent += d;
      } else await sleep(4);
      if (Date.now() - s0 > (total / speed) * 1000 + 15000) break;
    }
    await waitScrollIdle(page);
  } else if (prof.input === 'programmatic') {
    await page.evaluate(
      ({ speed, target }) =>
        new Promise((done) => {
          const raf = window.__perf.nativeRAF;
          const y0 = window.scrollY;
          let t0 = 0;
          const step = (t) => {
            if (!t0) t0 = t;
            const y = Math.min(target, y0 + ((t - t0) / 1000) * speed);
            window.scrollTo(0, y);
            if (y >= target) done();
            else raf(step);
          };
          raf(step);
        }),
      { speed, target },
    );
  }
  return { ms: Date.now() - t0, from: undefined, to: await scrollY(page) };
}

export async function waitScrollIdle(page, quietMs = 400, maxMs = 6000) {
  const t0 = Date.now();
  let last = await scrollY(page);
  let since = Date.now();
  while (Date.now() - t0 < maxMs) {
    await sleep(80);
    const y = await scrollY(page);
    if (y !== last) {
      last = y;
      since = Date.now();
    } else if (Date.now() - since > quietMs) return;
  }
}

export async function jumpTo(page, y) {
  await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), y);
}

// Mouse path through a box (figure eight), one move per ~16ms
export async function pointerFigure8(page, box, ms = 5000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const t = (Date.now() - t0) / 1000;
    const x = box.x + box.width * (0.5 + 0.42 * Math.sin(t * 1.3));
    const y = box.y + box.height * (0.5 + 0.38 * Math.sin(t * 2.6));
    await page.mouse.move(x, y);
    await sleep(14);
  }
}

// Drag horizontally (mouse) from (x, y) by dx over ms
export async function mouseDrag(page, x, y, dx, ms, steps) {
  await page.mouse.move(x, y);
  await page.mouse.down();
  const n = steps ?? Math.max(4, Math.round(ms / 16));
  for (let i = 1; i <= n; i++) {
    await page.mouse.move(x + (dx * i) / n, y);
    await sleep(ms / n);
  }
  await page.mouse.up();
}

// Touch drag through CDP (Chromium only): touchStart, moves, touchEnd
export async function touchDrag(cdp, x, y, dx, ms) {
  const n = Math.max(4, Math.round(ms / 16));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let i = 1; i <= n; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + (dx * i) / n, y }] });
    await sleep(ms / n);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
