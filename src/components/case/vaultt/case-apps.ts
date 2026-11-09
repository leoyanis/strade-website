/*
 * The apps section (#vt-apps): the two phones lean toward the pointer (the iPhone's Liquid Glass highlight
 * slides with the lean), the big tab bar's highlight follows the pointer across its panel, and the feed of
 * stills under it only slides while the panel can be seen. Transforms and one custom property only.
 * Reduced motion / ?still: nothing moves (the bars still glide on hover, which is LiquidGlassBar's own).
 */
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

/** Sets up the section. */
export function initApps(o: { still: boolean }) {
  const sec = document.getElementById('vt-apps');
  if (!sec || o.still) return;
  const tilt = sec.querySelector<HTMLElement>('.vt-apps__tilt');
  const glass = sec.querySelector<HTMLElement>('.vt-glass');
  const bigBar = glass?.querySelector<HTMLElement>('[data-lg]');
  const phoneBar = sec.querySelector<HTMLElement>('.vt-apps__iphone [data-lg]');

  // the feed under the glass slides only while it is on screen (a CSS animation, toggled)
  if (glass) {
    new IntersectionObserver((entries) => {
      glass.classList.toggle('is-run', entries.some((e) => e.isIntersecting));
    }, { rootMargin: '40px 0px' }).observe(glass);
  }

  // the big bar's specular highlight sits under the pointer
  if (glass && bigBar) {
    glass.addEventListener('pointermove', (e) => {
      const r = bigBar.getBoundingClientRect();
      if (!r.width) return;
      bigBar.style.setProperty('--gx', `${clamp(((e.clientX - r.left) / r.width) * 100, 4, 96).toFixed(1)}%`);
    }, { passive: true });
    glass.addEventListener('pointerleave', () => bigBar.style.setProperty('--gx', '32%'), { passive: true });
  }

  // the phones lean toward the pointer, eased, and only while they move (desktop pointers)
  if (!tilt || !matchMedia('(pointer: fine)').matches) return;
  let tx = 0;
  let ty = 0;
  let x = 0;
  let y = 0;
  let raf = 0;
  let last = 0;
  let gx = -1;
  const frame = (now: number) => {
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 1 / 60);
    last = now;
    const k = 1 - Math.exp(-dt * 4.5);
    x += (tx - x) * k;
    y += (ty - y) * k;
    tilt.style.transform = `rotateX(${x.toFixed(3)}deg) rotateY(${y.toFixed(3)}deg)`;
    const g = 32 + y * 5;
    if (phoneBar && Math.abs(g - gx) > 0.2) {
      gx = g;
      phoneBar.style.setProperty('--gx', `${g.toFixed(1)}%`);
    }
    if (Math.abs(tx - x) + Math.abs(ty - y) > 0.01) raf = requestAnimationFrame(frame);
    else {
      raf = 0;
      last = 0;
    }
  };
  const go = () => {
    if (!raf) raf = requestAnimationFrame(frame);
  };
  sec.addEventListener('pointermove', (e) => {
    ty = (e.clientX / innerWidth - 0.6) * 10;
    tx = -(e.clientY / innerHeight - 0.5) * 7;
    go();
  }, { passive: true });
  sec.addEventListener('pointerleave', () => {
    tx = 0;
    ty = 0;
    go();
  }, { passive: true });
}
