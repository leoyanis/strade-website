/*
 * Mounts every <NetworkMap> canvas on the page that no page script manages itself.
 * Live maps run only while on screen and while the tab is visible; still maps (or reduced motion,
 * or ?still) paint once and repaint on resize. The homepage's world canvas is `data-managed`, so it is
 * left to vaultt-home.ts.
 */
import { createNetwork, type Network } from './network';

/** Finds unmounted network canvases under `root` and starts them. Safe to call more than once. */
export function mountNetworks(root: ParentNode = document) {
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches || new URLSearchParams(location.search).has('still');
  root.querySelectorAll<HTMLCanvasElement>('canvas[data-vx-net]:not([data-managed]):not([data-vx-on])').forEach((c) => {
    c.dataset.vxOn = '1';
    const look = c.dataset.look === 'world' ? 'world' : 'app';
    const live = c.dataset.live === '1' && !still;
    let shownAt = -1;
    let clock = 0;
    const net: Network = createNetwork(c, {
      look,
      seed: Number(c.dataset.seed) || 7,
      reduced: !live,
      density: c.dataset.density === 'lite' ? 'lite' : 'full',
      hubY: c.dataset.hubY ? Number(c.dataset.hubY) : undefined,
      topInset: c.dataset.top ? Number(c.dataset.top) : 0,
      // a world map without a host: hub in the middle (or at data-hub-x / data-hub-y, as fractions), lines draw out once seen
      onFrame:
        look === 'world'
          ? (n, dt) => {
              clock += dt;
              if (shownAt < 0 && n.running) shownAt = clock;
              n.hub.x = c.clientWidth * (Number(c.dataset.hubX) || 0.5);
              n.hub.y = c.clientHeight * (Number(c.dataset.hubY) || 0.5);
              const k = live ? Math.min(1, Math.max(0, (clock - shownAt) / 1.8)) : 1;
              n.beats.reveal = shownAt < 0 && live ? 0 : k;
              n.beats.sea = 1;
              n.beats.connect = live ? 0.45 + 0.4 * k : 1;
            }
          : undefined,
    });
    if (!live) {
      net.paint();
      new ResizeObserver(() => net.resize()).observe(c);
      return;
    }
    let onScreen = false;
    let seen = false;
    const sync = () => (onScreen && !document.hidden ? net.start() : net.stop());
    new IntersectionObserver((entries) => {
      const en = entries[entries.length - 1];
      onScreen = en.isIntersecting;
      // the app map's entrance (ties drawing out of You) plays when the phone arrives from below on a normal
      // scroll. First seen already mid-screen (a jump into the section, a reload, coming back up), it starts
      // on the finished map: the entrance there read as a black screen with one dot for a second
      if (onScreen && !seen) {
        seen = true;
        if (look === 'app' && en.boundingClientRect.top < innerHeight * 0.72) net.skipEntrance();
      }
      sync();
    }, { rootMargin: '80px 0px' }).observe(c);
    document.addEventListener('visibilitychange', sync);
    new ResizeObserver(() => net.resize()).observe(c);
  });
}
