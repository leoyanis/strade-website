// The free stuff act's motion (FreeAct.astro on top of HoleWorld.astro), mounted from index.astro once GSAP is in.
//
// - Hand-over from the stripes: the world rises as a dome whose top point is glued to the act's top edge, so the
//   last Side quests words always stay on cream and the dark only ever sits under this act. Transform only (the
//   dome moves, its inside moves back). Where the browser has scroll-driven animations (Chrome 115+, Safari 26) the
//   two moves are animations on the page's own scroll (free-act.css hole-dome-rise, ranges in px written here on
//   refresh), so they move in the same frame as the page, on the compositor where the browser runs them there,
//   instead of a frame or more behind it from a script (sys-01: on iOS the page scrolls in the UI process and every
//   script-moved layer trails it). Elsewhere the script writes the same two transforms, rounded to whole px.
// - Held: once the dome has covered the screen (half a screen past it, so a late frame can never show its square
//   corners), .is-held drops its round clip: the circle covers every screen corner there anyway, and a round clip
//   over a playing video is a mask pass for every frame of it (sys-08).
// - The nav: while the dome rises, each nav corner is forced to the tone actually under it (cream until the
//   dome's curved edge has covered it), through the nav's per-corner override, as the stripes wipe does.
// - The black hole is a pre-rendered loop (hole-video.ts): its poster and its video load within about three
//   screens, in an idle task, and it plays only once the dome covers a seventh of the screen, until the blueprint's
//   sheet covers it (or, on a phone, the hole has faded out under it). The scroll gives it a slow parallax (it was
//   the live camera's drift).
// - Phones (the portrait composition): the hole fades out under the rising blueprint sheet (V-02, 2026-11-09). The
//   sheet's straight edge used to cut through the hole's brightest ring with Kleus's heading right under it; now the
//   hole goes from full strength with the sheet's edge 75% down the screen to nothing at 35%, a scroll-driven
//   opacity on .hole-dome__in (the dome's own near-black stays), so the sheet only ever meets plain dark.
// - Phones: the heading and the All free stuff pill fade out on their way under the nav (V-08): gone by the time
//   their top is 72px from the screen's top, clear of the nav's links and pool (56px), from 96px before that.
// - The words and the band rise in with the scroll as the heading comes up (and go back scrolling up). They sit deep
//   enough in the act that the dark is always behind them, so light text never sits on cream.
// - The band's tilt follows the band's own trip across the screen: rotate plus skew, about -7 to +5 degrees
//   (+-4 on phones); the cards turn back half of it so they stay readable, and the row drifts gently sideways.
// Reduced motion (and ?still): the dome still follows the act's edge (a position, not an animation, like the
// blueprint's edge), the black hole is its poster (one still frame of the loop), the band keeps its resting tilt
// from free-act.css and the words are simply there; the fades above are positions too, and stay.
import { createHoleVideo, type Hole } from './hole-video';

type Deps = {
  gsap: typeof import('gsap').gsap;
  ScrollTrigger: typeof import('gsap/ScrollTrigger').ScrollTrigger;
  reduced: boolean;
};

/** Base.astro's nav line, the centre of the 64px nav row: where its band observer and the stripes wipe read tones. */
const NAV_LINE = 32;
/** Scroll-driven animations (CSS animation-timeline): the dome, the fades and the hole's rise then need no writes. */
const TIMELINE = typeof CSS !== 'undefined' && !!CSS.supports?.('animation-timeline: scroll()');
/** The hole plays once the dome's top point is this share of the screen up from its bottom ("15% visible"). */
const PLAY_AT = 0.15;
/** Phones: where the blueprint's edge is (share of the large screen from its top) as the hole starts and ends fading. */
const FADE_FROM = 0.75;
const FADE_TO = 0.35;
/** Screens past the dome's hold before its round clip is dropped (and before it comes back, scrolling up). */
const HELD_MARGIN = 0.5;
/** Phones: the heading and the pill are gone by the time their top is here (px from the screen's top), from NAV_FADE before. */
const NAV_CLEAR = 72;
const NAV_FADE = 96;

/**
 * Wraps each character of a heading in a span (words kept whole, nested spans such as the outlined word kept), for
 * the reveal's letter-by-letter rise. "ff" stays in one span: split apart, the two letters can no longer be drawn
 * as the font's pair, their crossbars overlap, and each span paints its outline on its own, so the outlined word
 * showed a seam across the joined crossbar (free-act.css, .fa-h__o).
 */
function splitChars(root: HTMLElement): HTMLElement[] {
  const chars: HTMLElement[] = [];
  root.setAttribute('aria-label', (root.textContent ?? '').trim());
  const split = (text: string, into: Node) => {
    for (const part of text.split(/(\s+)/)) {
      if (!part) continue;
      if (/^\s+$/.test(part)) {
        into.appendChild(document.createTextNode(' '));
        continue;
      }
      const word = document.createElement('span');
      word.className = 'fa-w';
      word.setAttribute('aria-hidden', 'true');
      const letters = Array.from(part);
      for (let i = 0; i < letters.length; i++) {
        let text = letters[i];
        while (text.endsWith('f') && letters[i + 1] === 'f') text += letters[++i];
        const c = document.createElement('span');
        c.className = 'fa-c';
        c.textContent = text;
        word.appendChild(c);
        chars.push(c);
      }
      into.appendChild(word);
    }
  };
  const nodes = Array.from(root.childNodes);
  root.textContent = '';
  for (const node of nodes) {
    if (node.nodeType === Node.TEXT_NODE) split(node.textContent ?? '', root);
    else if (node instanceof HTMLElement) {
      const t = node.textContent ?? '';
      node.textContent = '';
      split(t, node);
      root.appendChild(node);
    }
  }
  return chars;
}

/**
 * Wires the act: the dome hand-over and the nav over it, the black hole's creation and visibility, the held reveal
 * and the band's scrubbed tilt. Called once from index.astro after GSAP and ScrollTrigger are registered; returns
 * nothing (everything it makes lives as long as the page).
 */
export function mountFreeAct({ gsap, ScrollTrigger, reduced }: Deps) {
  const act = document.getElementById('act-free');
  const layer = document.querySelector<HTMLElement>('.theme--hole');
  const dome = layer?.querySelector<HTMLElement>('.hole-dome');
  const inner = layer?.querySelector<HTMLElement>('.hole-dome__in');
  if (!act || !layer || !dome || !inner) return;
  const bp = document.getElementById('act-blueprint');
  const stripes = document.getElementById('act-stripes');

  /* Geometry, measured on refreshes, resizes and page height changes, never per frame (README rule 2): the
     screen, the dome's radius as CSS made it, how much lower than its top point its edge meets the screen's
     sides (sag), where this act, the blueprint and the stripes act start in the document, and the outer end of
     each nav corner's text (the nav is fixed, so those never move with the scroll). */
  const geo = { vw: innerWidth, vh: innerHeight, park: innerHeight, R: 1, sag: 0, top: 0, bottom: 0, bp: Infinity, stripes: -Infinity, navL: 60, navR: innerWidth - 180 };
  const docTop = (el: Element) => el.getBoundingClientRect().top + window.scrollY;
  // an element's top in the document from layout alone (offsets, no transforms: the pill may be mid-reveal at a refresh)
  const layoutTop = (el: HTMLElement) => {
    let y = 0;
    for (let e: HTMLElement | null = el; e; e = e.offsetParent as HTMLElement | null) y += e.offsetTop;
    return y;
  };
  // the phone fades of the heading and the pill (V-08): each element's scroll range, measured with the rest
  const navFaders = [act.querySelector<HTMLElement>('.fa-h'), act.querySelector<HTMLElement>('.fa-all__link')].filter((e): e is HTMLElement => !!e);
  const navFade = navFaders.map(() => ({ a: NaN, b: NaN }));
  const phone = matchMedia('(max-width: 767px)');
  // custom properties on an element, written only when the value changes
  const setVar = (el: HTMLElement, name: string, v: string) => {
    if (el.style.getPropertyValue(name) !== v) el.style.setProperty(name, v);
  };
  // the thousandth of a pixel the scroll-driven ranges carry, flipped to make the browser resolve them again
  // (writeRanges() below)
  let nudge = 0;
  // the outer end of each nav corner's text: the logo's left end, and the right end of the last link before the
  // filled Book a call pill (it carries its own background, so its tone does not matter)
  const navEnds = () => {
    const brand = document.querySelector('.nav-brand')?.getBoundingClientRect();
    const links = Array.from(document.querySelectorAll('.nav-links a:not(.nav-book)'), (a) => a.getBoundingClientRect()).filter((r) => r.width);
    geo.navL = brand && brand.width ? brand.left + 2 : 40;
    geo.navR = links.length ? Math.max(...links.map((r) => r.right)) - 2 : geo.vw - 180;
  };
  const measure = () => {
    geo.vw = inner.offsetWidth || innerWidth;
    geo.vh = innerHeight;
    // where the dome parks while the act is below the screen: past the large screen (the layer's own height, 100lvh,
    // home.css .themes), not innerHeight, or a phone's toolbar collapsing showed its top along the bottom of the
    // stripes (Mobile Safari, iOS 26.3); the large screen does not change with the toolbar, so no resize is needed
    geo.park = Math.max(geo.vh, layer.offsetHeight);
    geo.R = dome.offsetWidth / 2 || geo.vw;
    const half = Math.min(geo.vw / 2, geo.R);
    geo.sag = geo.R - Math.sqrt(geo.R * geo.R - half * half);
    geo.top = docTop(act);
    geo.bottom = geo.top + act.offsetHeight;
    geo.bp = bp ? docTop(bp) : Infinity;
    geo.stripes = stripes ? docTop(stripes) : -Infinity;
    navEnds();
    navFaders.forEach((el, i) => {
      const D = Math.round(layoutTop(el));
      navFade[i].a = D - NAV_CLEAR - NAV_FADE;
      navFade[i].b = D - NAV_CLEAR;
    });
    writeRanges();
    rekick();
  };
  /* The scroll-driven moves (free-act.css), as ranges of the page's scroll in whole px. Chromium resolves such a px
     range against the page's scroll length when the range is written, and keeps that when the page's length changes
     later, in a refresh's passing layout or as the page grows: the dome then sat 21 to 49px off the act's edge, for
     good, in about 1 load in 3 (Chrome for Testing, phone emulation, 2026-11-09; writing the range again, a hair
     different, put it right every time). So each write is followed, a frame later and after every ScrollTrigger
     refresh, by the same ranges a thousandth of a pixel off (both ends together, so nothing moves): that write is
     resolved against the page as it then is. */
  const writeRanges = () => {
    const px = (v: number) => `${(v + nudge).toFixed(3)}px`;
    // the dome goes from parked (park + 8 below the screen's top) to held (its edge past the top corners) 1:1 with
    // the scroll, exactly what place() writes without them (its rounding included: round(top - scroll) is
    // round(top) - scroll)
    const T = Math.round(geo.top);
    const yPark = Math.round(geo.park + 8);
    const yHold = Math.round(-(geo.sag + 4));
    setVar(layer, '--hd-park', `${yPark}px`);
    setVar(layer, '--hd-hold', `${yHold}px`);
    setVar(layer, '--hd-a', px(T - yPark));
    setVar(layer, '--hd-b', px(T - yHold));
    // phones: the hole's fade under the blueprint's sheet, from its edge FADE_FROM down the large screen to FADE_TO
    if (Number.isFinite(geo.bp)) {
      const B = Math.round(geo.bp);
      setVar(layer, '--hf-a', px(B - Math.round(FADE_FROM * geo.park)));
      setVar(layer, '--hf-b', px(B - Math.round(FADE_TO * geo.park)));
    }
    // the hole's rise: the drift's own range (place() below), as the act enters the screen to the blueprint at its top
    hole?.setLiftRange(Math.round(geo.top - geo.vh) + nudge, Math.round(geo.bottom) + nudge);
    // phones: the heading and the pill, gone by the time their top reaches NAV_CLEAR (V-08)
    navFaders.forEach((el, i) => {
      setVar(el, '--nf-a', px(navFade[i].a));
      setVar(el, '--nf-b', px(navFade[i].b));
    });
    // (the ranges are set from here on, so the CSS fade may run)
    if (TIMELINE && navFaders.length) act.classList.add('is-navfade');
  };
  let kick = 0;
  const rekick = () => {
    if (!TIMELINE || kick) return;
    kick = requestAnimationFrame(() => {
      kick = 0;
      nudge = nudge ? 0 : 0.001;
      writeRanges();
    });
  };
  ScrollTrigger.addEventListener('refresh', rekick);

  /* ---------- the nav over the dome ----------
     Base.astro tones each nav corner from the [data-nav-theme] band under it: the stripes act is tagged light, and
     this act is untagged, so the page's dark applies. But the dome is a curve: when the act's top passes the nav
     line its edge is still up to `sag` px lower at the sides, and the observer flipped both corners to light ink
     while cream still filled them (about 150 to 250 px of scroll; reviewer, 2026-11-08). So while the dome rises,
     each corner is forced (body[data-nav-force-l|r], the nav's per-corner override) light until the dome has
     cleared it, then dark: cleared once its edge is above the nav line at the outer end of that corner's text (the
     edge is lowest there). Tried the content's centre, the stripes wipe's rule: the logo's star and the Instagram
     icon then sat in light ink on cream for a moment (contrast 1.9). Dark ink on the light pool holds up over the
     dark while the dome passes under it (measured 4.1:1 or more), light ink on the dark pool over cream does not.
     Arithmetic per update: the edge's y at x is y + R - sqrt(R^2 - (x - vw/2)^2).
     Only from the stripes wipe's hand-over (the stripes act's top past the screen's top; on screens taller than
     that act, 2560x1440 and up, both would otherwise write the same attributes at once) to the dome's hold. On
     either side of that range the bands already agree with the forces (light under the stripes act, the page's
     dark once the dome holds), so taking a force off never flips a corner, even for the frame an
     IntersectionObserver lags. Each side only removes the value this script set. */
  const forced: Record<'l' | 'r', string | null> = { l: null, r: null };
  // Sets or clears one corner's force on body (Base.astro's MutationObserver picks it up in the same task). Writes
  // only on a change: each write restyles the nav.
  const force = (side: 'l' | 'r', v: string | null) => {
    if (forced[side] === v) return;
    const key = side === 'l' ? 'navForceL' : 'navForceR';
    const d = document.body.dataset;
    if (v) d[key] = v;
    else if (d[key] === forced[side]) delete d[key];
    forced[side] = v;
  };
  // The tone each corner needs for the dome at y (its top point on screen; apex is the act's unclamped top), called
  // from place() on every scroll update of the act, so in reduced motion too
  // What the dome paints under the nav, for Base.astro (nav.toneAt and a 'nav:paint' event): dark inside its curve,
  // nothing outside, where the stripes' bands decide, or where no band is (this act's own cream round the dome, once
  // the stripes act has left the nav line) the corner's force below. With it each link takes the tone under it while
  // its corner is forced: before, a corner stayed light until the dome had covered its outer end, so Work and Free stuff kept
  // dark ink on a white pool over the black dome for 400 to 600px of scroll at 1440 (2026-11-08, scripted nav
  // sweep). Arithmetic only: the nav calls it a few hundred times per change.
  // Surfaces, not tones (Base.astro reads an element as a surface under the page's bands): inside the curve the plain
  // night (#nav-paint-night, index.astro: no pool, no knockout; the act's heading and cards are still far below the
  // nav while the dome rises), outside it the stripes act's cream, which this act's cream round the dome is (243 239
  // 230 against its declared 244 240 231, both engines, 1440). With tones the corners kept their pools there: a pale
  // haze over the cream behind the logo, a grey box round Book a call, a dark blob beside Results (2026-11-09 re-check).
  const navEl = document.getElementById('site-nav') as (HTMLElement & { toneAt?: ((x: number, y: number) => string | Element | null) | null }) | null;
  const navNight = document.getElementById('nav-paint-night');
  let paintY = NaN;
  const domeToneAt = (x: number, y: number): string | Element | null => {
    const dx = x - geo.vw / 2;
    if (y >= paintY + geo.R - Math.sqrt(Math.max(0, geo.R * geo.R - dx * dx))) return navNight ?? 'dark';
    return stripes ?? null;
  };
  const navOverDome = (y: number, apex: number, scroll: number) => {
    let l: string | null = null;
    let r: string | null = null;
    const over = apex <= geo.vh && apex > -(geo.sag + 4) && geo.stripes - scroll <= 0;
    if (over) {
      const covered = (x: number) => {
        const dx = x - geo.vw / 2;
        return y + geo.R - Math.sqrt(Math.max(0, geo.R * geo.R - dx * dx)) < NAV_LINE;
      };
      l = covered(geo.navL) ? 'dark' : 'light';
      r = covered(geo.navR) ? 'dark' : 'light';
    }
    // the paint first, so the forces' own resolve (a MutationObserver on body) already sees it
    if (navEl && (over || navEl.toneAt === domeToneAt) && (over ? y !== paintY || navEl.toneAt !== domeToneAt : true)) {
      paintY = y;
      navEl.toneAt = over ? domeToneAt : null;
      navEl.dispatchEvent(new Event('nav:paint'));
    }
    force('l', l);
    force('r', r);
  };

  /* ---------- the hand-over: the dome follows the act's top edge ---------- */
  let hole: Hole | null = null;
  let lastY = NaN;
  let held = false;
  let faded = false;
  let lastFade = '';
  const lastNav = navFaders.map(() => '');
  if (TIMELINE) layer.classList.add('is-timeline');
  const place = (scroll: number) => {
    const apex = geo.top - scroll;
    // parked just below the screen until the act arrives; held once its edge has cleared the screen's top corners
    const y = Math.round(Math.min(Math.max(apex, -(geo.sag + 4)), geo.park + 8));
    // (with scroll-driven animations the dome moves itself: free-act.css)
    if (!TIMELINE && y !== lastY) {
      lastY = y;
      dome.style.transform = `translate3d(0, ${y}px, 0)`;
      inner.style.transform = `translate3d(0, ${-y}px, 0)`;
    }
    // the round clip goes once the dome has held the screen for half a screen, and comes back that far before it
    // lowers again (written only when it changes)
    const h = apex <= -(geo.sag + 4) - HELD_MARGIN * geo.vh;
    if (h !== held) {
      held = h;
      layer.classList.toggle('is-held', h);
    }
    navOverDome(y, apex, scroll);
    const portrait = hole?.portrait ?? false;
    // where the blueprint's sheet edge is on the screen (its act's top)
    const edge = geo.bp - scroll;
    // phones: the hole fades out under the rising sheet (free-act.css hole-fade; written here only without it)
    if (portrait && !TIMELINE) {
      const o = Math.min(1, Math.max(0, (edge - FADE_TO * geo.park) / ((FADE_FROM - FADE_TO) * geo.park)));
      const v = o >= 1 ? '' : o.toFixed(3);
      if (v !== lastFade) {
        lastFade = v;
        inner.style.opacity = v;
      }
    } else if (lastFade) {
      lastFade = '';
      inner.style.opacity = '';
    }
    // the hole's own layers hidden once nothing of it can show: faded out (phones), or a quarter screen under the
    // sheet (wider screens); the dome's near-black stays. The margins cover a late frame either way
    const f = portrait ? edge < 0.1 * geo.park : edge < -0.25 * geo.park;
    if (f !== faded) {
      faded = f;
      layer.classList.toggle('is-faded', f);
    }
    // the hole plays once the dome covers a seventh of the screen, until the sheet covers it (or it has faded out)
    hole?.setVisible(apex <= (1 - PLAY_AT) * geo.vh && edge > (portrait ? FADE_TO * geo.park : 0));
    hole?.setDrift((geo.vh - apex) / Math.max(1, geo.bottom - geo.top + geo.vh));
    // phones: the heading and the pill fade out on their way under the nav (written here only without the CSS one)
    if (!TIMELINE) {
      navFaders.forEach((el, i) => {
        const { a, b } = navFade[i];
        const o = phone.matches && b > a ? Math.min(1, Math.max(0, (b - scroll) / (b - a))) : 1;
        const v = o >= 1 ? '' : o.toFixed(3);
        if (v !== lastNav[i]) {
          lastNav[i] = v;
          el.style.opacity = v;
        }
      });
    }
  };
  measure();
  ScrollTrigger.create({
    trigger: act,
    start: 'top bottom',
    endTrigger: bp ?? act,
    // half a screen past the blueprint's top at the screen's top, so the hole's layers are let go (.is-faded, a
    // quarter of a screen under the sheet on wide screens) from here too; a jump past it still lands in onToggle
    end: bp ? 'top top-=50%' : 'bottom top',
    onUpdate: (self) => place(self.scroll()),
    onToggle: (self) => place(self.scroll()),
    onRefresh: (self) => {
      measure();
      place(self.scroll());
    },
  });
  // fonts, images and the sections above change the page's height without a ScrollTrigger refresh
  new ResizeObserver(() => {
    measure();
    place(window.scrollY);
  }).observe(document.body);
  place(window.scrollY);

  /* ---------- the black hole: a pre-rendered loop ----------
     hole-video.ts loads it itself as the act comes near (the poster and the video within three screens, in an idle
     task, nothing before), picks the file this browser decodes best, places the frame so the hole lands where the
     words expect it, and plays only while place() says enough of it can be seen. Made now: it costs one layout read
     and two observers until then. Until 2026-11-08 this was the live WebGL ray tracer (black-hole.ts, still in the
     repo, no longer imported): 4 to 5 ms of GPU a frame at 30 to 60 frames a second plus about 5 MB of render
     targets, made in an idle callback within two screens. The CSS drawing (.hole-art) shows until the poster is
     decoded, and stays if neither the poster nor the video arrives. */
  hole = createHoleVideo(layer, act, { reduced, onReady: () => layer.classList.add('has-hole') });
  hole?.setLiftRange(Math.round(geo.top - geo.vh) + nudge, Math.round(geo.bottom) + nudge);
  place(window.scrollY);

  if (reduced) return;

  /* ---------- the words and the band ----------
     The reveal follows the scroll as the heading comes up, from the bottom of the screen to 55% of the way up, and
     back (Yanis, 2026-11-08: nothing on the page plays at its own pace). Light text never sits on cream: the words sit
     deeper in the act than the dome's edge ever drops below its top point (free-act.css: 38vh plus the edge's 17.6vw
     sag on desktop, 55vh plus it on phones), so wherever they are on screen the dark is behind them. They used to be
     held until the dome cleared the screen's top corners and then play, in about 1.6 s; on phones they crossed the
     lower half of the screen unseen while the dome rose, empty black for about 350px of scroll (2026-11-08 site check,
     390x844). */
  const heading = act.querySelector<HTMLElement>('.fa-h');
  const chars = heading ? splitChars(heading) : [];
  const reveal = gsap
    .timeline({ paused: true, defaults: { ease: 'power3.out' } })
    .fromTo(chars, { yPercent: 112 }, { yPercent: 0, duration: 1.1, ease: 'power4.out', stagger: 0.035 }, 0)
    .fromTo(act.querySelectorAll('.fa-line, .fa-follow'), { y: 26, opacity: 0 }, { y: 0, opacity: 1, duration: 0.9, stagger: 0.08 }, 0.2)
    .fromTo(act.querySelector('.fa-band__strip'), { opacity: 0 }, { opacity: 1, duration: 1 }, 0.15)
    .fromTo(act.querySelectorAll('.fa-card'), { y: 70, opacity: 0 }, { y: 0, opacity: 1, duration: 1, stagger: 0.08 }, 0.3)
    .fromTo(act.querySelector('.fa-all'), { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8 }, 0.6);
  if (heading) ScrollTrigger.create({ trigger: heading, start: 'top bottom', end: 'top 55%', scrub: true, animation: reveal });

  /* ---------- the band's tilt follows its own trip across the screen ----------
     Scrubbed from the moment the band's top reaches the bottom of the screen to the moment its bottom leaves the
     top, measured on its layout box (offsetTop in the act, offsetHeight), so its own tilt never moves the trigger.
     Until 2026-11-08 the scrub ran over the whole act and its screen of run-in: the act is about two screens tall
     and the band only crosses in its second half, so the big angles happened off screen and the band read level
     (-1.1 to +2.3 deg while on screen; reviewer). */
  const band = act.querySelector<HTMLElement>('.fa-band');
  const track = act.querySelector<HTMLElement>('.fa-track');
  const slots = Array.from(act.querySelectorAll<HTMLElement>('.fa-slot'));
  if (!band || !track) return;
  const tilt = { p: 0 };
  // The edge's angle runs a0 + (a1 - a0) * p^CURVE: -7 deg as the band enters to +5 as it leaves (-4 to +4 on
  // phones). The curve keeps it clearly tilted through the middle of the trip (about -4.7 deg at mid-screen) and
  // crosses level only near the end (p 0.8; 0.75 on phones), so the turn speeds up as the band leaves.
  const CURVE = 2.4;
  // The share of the edge's angle that is skew rather than turn: the ruler ticks lean a little further than the
  // edges, like tape seen in perspective (edge = turn + skew, with skew = -SKEW * turn)
  const SKEW = 0.25;
  /** Writes the band's tilt for the current tilt.p (the band, the track's drift and each slot's counter-turn). */
  const paintBand = () => {
    const narrow = geo.vw < 640;
    const p = tilt.p;
    const edge = narrow ? -4 + 8 * p ** CURVE : -7 + 12 * p ** CURVE;
    const r = edge / (1 - SKEW);
    const s = -SKEW * r;
    const x = (0.5 - p) * geo.vw * (narrow ? 0.06 : 0.05);
    band.style.transform = `rotate(${r.toFixed(3)}deg) skewY(${s.toFixed(3)}deg)`;
    track.style.transform = `translate3d(${x.toFixed(2)}px, 0, 0)`;
    // the band's skew undone and half its turn given back: each card ends up turned by half the band's turn
    const back = `skewY(${(-s).toFixed(3)}deg) rotate(${(-r / 2).toFixed(3)}deg)`;
    for (const el of slots) el.style.transform = back;
  };
  gsap.fromTo(
    tilt,
    { p: 0 },
    {
      p: 1,
      ease: 'none',
      onUpdate: paintBand,
      scrollTrigger: {
        trigger: act,
        start: () => `top+=${band.offsetTop} bottom`,
        end: () => `top+=${band.offsetTop + band.offsetHeight} top`,
        scrub: 0.6,
        onRefresh: paintBand,
      },
    },
  );
  paintBand();
}
