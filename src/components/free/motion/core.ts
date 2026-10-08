// Shared GSAP loader and helpers for the free resource pages.
// Everything is visible without JS; hidden "from" states are only ever set after GSAP has loaded.
import type { gsap as GSAP } from 'gsap';
import type { ScrollTrigger as ST } from 'gsap/ScrollTrigger';

export type Gsap = typeof GSAP;
export type Motion = { gsap: Gsap; ScrollTrigger: typeof ST; refresh: () => void };
/* eslint-disable @typescript-eslint/no-explicit-any */
export type Tl = ReturnType<Gsap['timeline']>;

let loading: Promise<Motion | null> | null = null;
let timer: number | undefined;

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Pinned, scroll-scrubbed scenes on normal desktop screens; self-playing loops on phones and very tall windows. */
export const PIN_MEDIA = { desk: '(min-width: 901px) and (max-height: 1300px)', loop: '(max-width: 900px), (min-height: 1301px)' };

export function loadMotion(): Promise<Motion | null> {
  if (reducedMotion()) return Promise.resolve(null);
  loading ??= (async () => {
    try {
      const { gsap } = await import('gsap');
      const { ScrollTrigger } = await import('gsap/ScrollTrigger');
      gsap.registerPlugin(ScrollTrigger);
      // Keep timelines on real time, so loops never stall half-way after a long frame.
      gsap.ticker.lagSmoothing(0);
      ScrollTrigger.config({ ignoreMobileResize: true });
      const refresh = () => {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => {
          ScrollTrigger.sort();
          ScrollTrigger.refresh();
        }, 200);
      };
      window.addEventListener('load', refresh);
      document.fonts?.ready.then(refresh);
      if (import.meta.env.DEV) Object.assign(window, { __gsap: gsap, __st: ScrollTrigger });
      return { gsap, ScrollTrigger, refresh };
    } catch {
      return null;
    }
  })();
  return loading;
}

/**
 * Split text into clipped words of single characters, for rise-in titles. Nested inline
 * elements (e.g. an outlined <span>) are kept and split inside. Keeps an accessible label.
 */
export function splitChars(el: HTMLElement): HTMLElement[] {
  if (el.dataset.split) return Array.from(el.querySelectorAll<HTMLElement>('.fx-ch'));
  el.dataset.split = 'chars';
  el.setAttribute('aria-label', (el.textContent ?? '').replace(/\s+/g, ' ').trim());
  const chars: HTMLElement[] = [];
  const walk = (node: HTMLElement) => {
    Array.from(node.childNodes).forEach((n) => {
      if (n instanceof HTMLElement) return walk(n);
      if (n.nodeType !== Node.TEXT_NODE) return;
      const frag = document.createDocumentFragment();
      (n.textContent ?? '').split(/(\s+)/).forEach((part) => {
        if (!part) return;
        if (/^\s+$/.test(part)) return frag.appendChild(document.createTextNode(' '));
        const word = document.createElement('span');
        word.className = 'fx-w';
        word.setAttribute('aria-hidden', 'true');
        [...part].forEach((c) => {
          const ch = document.createElement('span');
          ch.className = 'fx-ch';
          ch.textContent = c;
          word.appendChild(ch);
          chars.push(ch);
        });
        frag.appendChild(word);
      });
      node.replaceChild(frag, n);
    });
  };
  walk(el);
  return chars;
}

/** Wrap every word in a span, keeping inline elements (code, strong, links) intact. */
export function splitWords(el: HTMLElement): HTMLElement[] {
  if (el.dataset.split) return Array.from(el.querySelectorAll<HTMLElement>('.fx-wd'));
  el.dataset.split = 'words';
  const out: HTMLElement[] = [];
  const walk = (node: Node) => {
    Array.from(node.childNodes).forEach((n) => {
      if (n.nodeType === Node.TEXT_NODE) {
        const frag = document.createDocumentFragment();
        (n.textContent ?? '').split(/(\s+)/).forEach((part) => {
          if (!part) return;
          if (/^\s+$/.test(part)) return frag.appendChild(document.createTextNode(part));
          const s = document.createElement('span');
          s.className = 'fx-wd';
          s.textContent = part;
          frag.appendChild(s);
          out.push(s);
        });
        node.replaceChild(frag, n);
      } else if (n instanceof HTMLElement) {
        if (n.matches('code, a, strong, mark')) {
          n.classList.add('fx-wd');
          out.push(n);
        } else walk(n);
      }
    });
  };
  walk(el);
  return out;
}

/** Returns a setter that types an element's text from 0 (empty) to 1 (full). */
export function typer(el: HTMLElement) {
  const full = el.dataset.text ?? el.textContent ?? '';
  el.dataset.text = full;
  let last = -1;
  return (p: number) => {
    const n = Math.round(full.length * Math.min(1, Math.max(0, p)));
    if (n === last) return;
    last = n;
    el.textContent = full.slice(0, n);
  };
}

/**
 * Scroll trigger for one-off reveals. Plays however the trigger is reached, even if a jump
 * (an anchor link, a fast flick) skips straight past it, so nothing can stay hidden.
 */
export const once = (trigger: Element | string | null, start = 'top 85%') => ({
  trigger: trigger ?? undefined,
  start,
  once: true,
  toggleActions: 'play play play play',
});

/** Plays a timeline only while its element is on screen. */
export function playInView(m: Motion, el: Element, tl: { play: () => unknown; pause: () => unknown }, start = 'top 85%') {
  m.ScrollTrigger.create({
    trigger: el,
    start,
    end: 'bottom 10%',
    onToggle: (self) => (self.isActive ? tl.play() : tl.pause()),
  });
}

/**
 * Hand an element's CSS centring (translate: -50% -50%) and tilt (rotate) over to GSAP.
 * GSAP would otherwise bake those into pixels the first time it transforms the element.
 */
export function adopt(m: Motion, els: HTMLElement[], vars: Record<string, unknown> = {}) {
  els.forEach((el) => {
    el.style.translate = 'none';
    el.style.rotate = 'none';
  });
  m.gsap.set(els, { xPercent: -50, yPercent: -50, ...vars });
}

/** Pointer-driven 3D tilt (fine pointers only). */
export function tilt(m: Motion, area: HTMLElement, target: HTMLElement, max = 8) {
  if (!window.matchMedia('(pointer: fine)').matches) return;
  const rx = m.gsap.quickTo(target, 'rotationX', { duration: 0.8, ease: 'power3' });
  const ry = m.gsap.quickTo(target, 'rotationY', { duration: 0.8, ease: 'power3' });
  area.addEventListener('pointermove', (e) => {
    const r = area.getBoundingClientRect();
    ry(((e.clientX - r.left) / r.width - 0.5) * max * 2);
    rx(-((e.clientY - r.top) / r.height - 0.5) * max * 1.5);
  });
  area.addEventListener('pointerleave', () => {
    rx(0);
    ry(0);
  });
}
