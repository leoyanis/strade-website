// Which platform features each engine here supports, for fixes that rely on them (content-visibility,
// @property, scrollend, requestIdleCallback, scheduler.postTask, LoAF, event timing, OffscreenCanvas).
// Playwright's WebKit is a recent WebKit build: shipping Safari can lag it, so treat a "yes" there as
// "Safari is getting it", and check caniuse for the Safari version floor.
// node scripts/perf/features.mjs
import { launch } from './lib/pw.mjs';

const probe = () => ({
  'content-visibility': CSS.supports('content-visibility', 'auto'),
  'contain-intrinsic-size': CSS.supports('contain-intrinsic-size', 'auto 500px'),
  '@property (CSS.registerProperty)': typeof CSS.registerProperty === 'function',
  scrollend: 'onscrollend' in window,
  requestIdleCallback: typeof window.requestIdleCallback === 'function',
  'scheduler.postTask': !!(window.scheduler && window.scheduler.postTask),
  'long-animation-frame': !!(PerformanceObserver.supportedEntryTypes || []).includes('long-animation-frame'),
  longtask: !!(PerformanceObserver.supportedEntryTypes || []).includes('longtask'),
  'event timing': !!(PerformanceObserver.supportedEntryTypes || []).includes('event'),
  LCP: !!(PerformanceObserver.supportedEntryTypes || []).includes('largest-contentful-paint'),
  OffscreenCanvas: typeof window.OffscreenCanvas === 'function',
  'animation-timeline (scroll-driven CSS)': CSS.supports('animation-timeline', 'scroll()'),
  'backdrop-filter (unprefixed)': CSS.supports('backdrop-filter', 'blur(2px)'),
  '-webkit-backdrop-filter': CSS.supports('-webkit-backdrop-filter', 'blur(2px)'),
  'image-set / avif decode': CSS.supports('background-image', 'image-set(url(a.avif) type("image/avif"))'),
  'IntersectionObserver v2 (trackVisibility)': 'isVisible' in (window.IntersectionObserverEntry ? IntersectionObserverEntry.prototype : {}),
  'navigator.userAgentData': !!navigator.userAgentData,
});

for (const engine of ['chromium', 'webkit']) {
  const b = await launch(engine);
  const p = await (await b.newContext()).newPage();
  await p.goto('data:text/html,<body>features</body>');
  const r = await p.evaluate(probe);
  console.log(`\n${engine} ${b.version()}`);
  for (const [k, v] of Object.entries(r)) console.log(`  ${v ? 'yes' : 'NO '}  ${k}`);
  await b.close();
}
