// Scroll-driven animations' ranges in px of the page's scroll, written so Chromium keeps them right.
//
// Chromium resolves an animation-range given in px against the page's scroll length at the moment it is written and
// never again: a range written while the page was still settling (fonts, images, a pinned section's height) stayed off
// once the page had its final length, by 21 to 49 px for the hole's dome in about one load in three (the hole and
// blueprint builder, 2026-11-09). So every write is made again a frame later, 0.001 px off (a value that changes, so
// the style is resolved again, against the length the page has by then), and again whenever the document's height
// changes (alternating the 0.001 px, so each write is a change). The callers write on every ScrollTrigger refresh, so
// a refresh is covered too. The finale's disc and inner box (finale-disc.ts) and its brake and letting go
// (finale-flight.ts) use it.

type Entry = { el: HTMLElement; vals: Record<string, number>; off: number };
const entries = new Map<string, Entry>();
let lastHeight = -1;
let watching = false;

function write(e: Entry) {
  for (const [k, v] of Object.entries(e.vals)) e.el.style.setProperty(k, `${(v + e.off).toFixed(3)}px`);
}

/** Watches the document's height (once): when it changes, every range is written again, 0.001 px moved. */
function watch() {
  if (watching || typeof ResizeObserver === 'undefined') return;
  watching = true;
  new ResizeObserver(() => {
    // (in a ResizeObserver callback layout is fresh: the read costs nothing)
    const h = document.documentElement.scrollHeight;
    if (h === lastHeight) return;
    lastHeight = h;
    for (const e of entries.values()) {
      e.off = e.off ? 0 : 0.001;
      write(e);
    }
  }).observe(document.body);
}

/**
 * Sets custom properties holding px scroll offsets on `el` (`vals`: name to px), and writes them again a frame later
 * 0.001 px off and on every later change of the document's height. `key` names the set: a later call with the same key
 * replaces it.
 */
export function setScrollRanges(key: string, el: HTMLElement, vals: Record<string, number>) {
  const e: Entry = { el, vals, off: 0 };
  entries.set(key, e);
  write(e);
  lastHeight = document.documentElement.scrollHeight;
  watch();
  requestAnimationFrame(() => {
    // (unless a newer write replaced this one meanwhile)
    if (entries.get(key) !== e) return;
    e.off = 0.001;
    write(e);
  });
}
