// The night sky behind every page but the homepage: the homepage's sky (starfield.ts) drawn as one still frame, by
// still-sky.ts.
//
// - Regular pages (Base.astro's #page-sky): fixed behind the whole page. The footer drops its fill and its top line
//   and lets the sky through under a scrim, as the homepage's footer does (portfolio.css, html.has-page-sky).
// - Case studies (bare pages, Base.astro's .sf-sky inside #site-footer): their sections keep their own branded
//   backgrounds, so the same fixed sky shows only through the footer, which clips it (portfolio.css,
//   html.has-footer-sky). It is made once the footer comes within a screen and a half, so a visitor who never gets
//   near the footer never loads or draws it.
//
// Still, not animated: still-sky.ts draws the frame starfield.ts's createSky draws in its reduced mode (no twinkle, lens,
// meteors or parallax) and draws again only when the window is resized, so nothing runs per frame and there is nothing
// to pause in a hidden tab. It builds that frame in idle slices of at most 8 ms after the first paint. Tried createSky
// itself first: its few long tasks took /work's blocking time on a phone at 4x CPU from 42 to 114 ms. The frame fades
// in once it is whole (at once under reduced motion, portfolio.css). Without WebGL it is the 2D frame of the same
// stars; without any canvas, or without JavaScript, the classes below are never set (or are taken back) and the page
// keeps its plain background and the opaque footer.

/** Mounts the sky Base.astro asked for, if any. The homepage asks for none: it draws its own (index.astro). */
export function mountPageSky() {
  const page = document.getElementById('page-sky');
  if (page) {
    // after the first frame, so the page's own content paints before the stars are generated and uploaded
    requestAnimationFrame(() => setTimeout(() => void start(page, 'has-page-sky'), 0));
    return;
  }
  const mount = document.querySelector<HTMLElement>('#site-footer > .sf-sky');
  const footer = mount?.parentElement;
  if (!mount || !footer) return;
  const near = new IntersectionObserver(
    (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      near.disconnect();
      void start(mount, 'has-footer-sky');
    },
    { rootMargin: '150% 0px' },
  );
  near.observe(footer);
}

async function start(mount: HTMLElement, flag: 'has-page-sky' | 'has-footer-sky') {
  let createStillSky: typeof import('./still-sky').createStillSky;
  try {
    ({ createStillSky } = await import('./still-sky'));
  } catch {
    return; // decoration only: the page keeps its plain background and footer
  }
  const root = document.documentElement;
  // The flag goes first: it shows the footer's mount (display: none until the footer clips it), and the sky reads its
  // size from its canvas.
  root.classList.add(flag);
  const sky = createStillSky(mount, {
    // two frames after the whole frame is drawn: the canvas is styled at opacity 0 first, so its fade to 1 runs
    onFrame: () => requestAnimationFrame(() => requestAnimationFrame(() => mount.classList.add('is-lit'))),
    onFail: () => root.classList.remove(flag),
  });
  if (!sky) root.classList.remove(flag);
}
