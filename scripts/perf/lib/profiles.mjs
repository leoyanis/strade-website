// The device profiles the harness measures. Chromium profiles get CDP (CPU throttling, traces, layers, LoAF);
// WebKit profiles do not exist in CDP, so they get in-page rAF timing and Playwright network events only.
import { playwright } from './pw.mjs';

// An Android Chrome UA for the Chromium phone: it is Blink, so it stands in for an Android phone, not an iPhone
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Mobile Safari/537.36';

export function profiles() {
  const iphone = playwright().devices['iPhone 15'];
  return {
    desktop: {
      engine: 'chromium',
      label: 'Chromium desktop 1440x900 @2x',
      context: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
      cpu: 1,
      input: 'cdp-mouse',
      steadySpeed: 1500,
      flingSpeed: 6000,
    },
    'desktop-4x': {
      engine: 'chromium',
      label: 'Chromium desktop 1440x900 @2x, CPU 4x slower',
      context: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
      cpu: 4,
      input: 'cdp-mouse',
      steadySpeed: 1500,
      flingSpeed: 6000,
    },
    'phone-4x': {
      engine: 'chromium',
      label: 'Chromium phone 390x844 @3x, touch, CPU 4x slower',
      context: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: ANDROID_UA },
      cpu: 4,
      input: 'cdp-touch',
      steadySpeed: 1000,
      flingSpeed: 4000,
    },
    safari: {
      engine: 'webkit',
      label: 'WebKit (Safari engine) desktop 1440x900 @2x',
      context: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
      cpu: 1,
      input: 'wheel',
      steadySpeed: 1500,
      flingSpeed: 6000,
    },
    iphone: {
      engine: 'webkit',
      label: 'WebKit iPhone 15 393x659 @3x (Mac GPU, not a real iPhone)',
      // Playwright's iPhone 15 descriptor: 393x659 is the visible area with Safari's bars, on a 393x852 screen
      context: { ...iphone },
      cpu: 1,
      // mobile WebKit in Playwright has no wheel and no touch drag (only tap), so scrolling is programmatic
      input: 'programmatic',
      steadySpeed: 1000,
      flingSpeed: 4000,
    },
  };
}
