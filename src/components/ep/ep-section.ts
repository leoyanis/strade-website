// Endless Pursuit's homepage section: a working slice of the app's Today screen, built for the web
// from the app's own design system, with its motion and its sounds, plus the app's star ∞ behind it.
// Everything you can touch does what the app does: Stop logs the session (the day card plays it in,
// gold for the first log of the day, then the streak flame hops), Start focus ignites the ring, the
// timer style switches in one tap, and a quiet member can be nudged. Moving round the phone turns it
// and takes it apart into its layers, to show how it is built.
// Mounted by the homepage script (src/pages/index.astro) once GSAP has loaded.

import type { gsap as GsapT } from 'gsap';
import type { ScrollTrigger as ScrollTriggerT } from 'gsap/ScrollTrigger';
import { SPRING, springOf, easeOf, Follow, clamp, lerp, smoothstep, easeOutCubic, easeInOutCubic, easeOut, easeIn } from './ep-motion';
import { createAudio, type SoundName } from './ep-audio';
import { createStars } from './ep-stars';

type Opts = { gsap: typeof GsapT; ScrollTrigger: typeof ScrollTriggerT };

/**
 * What the homepage's backdrops (src/scripts/backdrops.ts) tell the section: where the switch into its black
 * world is (the gather starts there) and where Vaultt's jobs have left the screen (`clear`: with reduced motion the
 * finished ∞ shows only from there, never behind them), and whether that world is showing (the star field fades in
 * right after the black, and out before it lifts).
 */
export interface EpWorld {
  from(y: number, clear?: number): void;
  show(on: boolean, instant: boolean): void;
}

// FeelEvent names, as the app calls them, for the scope's label.
const EVENT: Record<SoundName, string> = {
  tap: 'tap', select: 'select', toggle_on: 'toggleOn', toggle_off: 'toggleOff', start: 'start', stop: 'stop',
  logged: 'logged', celebrate: 'celebrate', streak: 'streak', nudge: 'nudge', success: 'success',
  sheet_open: 'sheetOpen', sheet_close: 'sheetClose', detent: 'detent', detent_major: 'detentMajor', limit: 'limit',
};
const ICON = {
  zap: '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
};
const NOW_HOUR = 16.5; // the day card's gold "now" marker, as in the app's screenshots
const SESSION_AT_LOAD = 18 * 60 + 20; // the running session, in seconds, when the page opens
/**
 * A second press this soon after the first (ms) is the other half of a web double click, not a new
 * intent: longer than a double click's gap, shorter than a deliberate second press.
 */
const DOUBLE_CLICK = 360;

/**
 * Wires the section. Calm (?still or Reduce Motion) keeps every interaction and its sound, and drops
 * what moves by itself: no flow, no assembling, no ambient loops; springs become short fades, as the
 * app does. ?still also holds the clock, for screenshots.
 */
export function mountEp(root: HTMLElement, { gsap, ScrollTrigger }: Opts): EpWorld {
  const still = new URLSearchParams(location.search).has('still');
  const prm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const calm = still || prm;
  const fine = window.matchMedia('(pointer: fine)').matches;
  const q = <T extends Element = HTMLElement>(s: string) => root.querySelector<T>(s)!;

  const grid = q('.ep3__grid');
  const text = q('.ep3__text');
  const stage = q('[data-ep-stage]');
  const phone = q('[data-ep-phone]');
  const layers = Array.from(phone.querySelectorAll<HTMLElement>(':scope > .ep3-ly'));
  const edges = layers.map((l) => l.querySelector<HTMLElement>(':scope > .ep3-edge'));
  const tags = layers.map((l) => l.querySelector<HTMLElement>(':scope > .ep3-tag'));
  const glare = q('.ep3-ly--glass > i');
  const cards = q('.ep3-scr--cards');

  const snappy = easeOf(SPRING.snappy);
  const smooth = easeOf(SPRING.smooth);
  const bouncy = easeOf(SPRING.bouncy);
  const roll = easeOf(SPRING.roll);
  const land = easeOf(SPRING.land);

  /** 1pt of the app, in CSS pixels, from the screen's width (402pt). */
  let pt = cards.clientWidth / 402 || 0.8;

  // ================================================================ sound
  const audio = createAudio('/sounds/ep/');
  const KEY = 'ep-sound';
  let choice: string | null = null;
  try { choice = sessionStorage.getItem(KEY); } catch { /* storage blocked: the default stands */ }
  let soundOn = choice === 'on';
  const soundBtn = q<HTMLButtonElement>('[data-ep-sound]');
  const soundLabel = q('[data-ep-sound-label]');
  const scope = soundBtn.querySelector('canvas')!;
  const sctx = scope.getContext('2d')!;
  const wave = new Uint8Array(128);
  let labelTimer = 0;
  let scopeUntil = 0;
  let scopeRaf = 0;

  /** Morphs the switch's words (a quick fade, as the app's MorphText). */
  function setLabel(t: string) {
    if (soundLabel.textContent === t) return;
    soundLabel.classList.add('is-swap');
    window.setTimeout(() => {
      soundLabel.textContent = t;
      soundLabel.classList.remove('is-swap');
    }, 90);
  }
  function syncSound() {
    soundBtn.setAttribute('aria-pressed', String(soundOn));
    window.clearTimeout(labelTimer);
    setLabel(soundOn ? 'Sound on' : 'Sound off');
    drawScope(false);
  }
  /** The scope: the live waveform while a sound plays, a quiet line otherwise. */
  function drawScope(live: boolean) {
    const w = scope.width, h = scope.height;
    sctx.clearRect(0, 0, w, h);
    sctx.lineWidth = 2;
    sctx.lineJoin = 'round';
    const an = audio.analyser();
    if (live && an) {
      an.getByteTimeDomainData(wave);
      sctx.strokeStyle = '#F0DCAF';
      sctx.beginPath();
      for (let i = 0; i < wave.length; i++) {
        const x = (i / (wave.length - 1)) * w;
        const y = h / 2 + ((wave[i] - 128) / 128) * (h / 2) * 2.4;
        if (i) sctx.lineTo(x, clamp(y, 1, h - 1));
        else sctx.moveTo(x, clamp(y, 1, h - 1));
      }
      sctx.stroke();
    } else {
      sctx.strokeStyle = soundOn ? 'rgba(240, 220, 175, 0.45)' : 'rgba(94, 94, 90, 0.8)';
      sctx.setLineDash(soundOn ? [] : [2, 4]);
      sctx.beginPath();
      sctx.moveTo(0, h / 2);
      sctx.lineTo(w, h / 2);
      sctx.stroke();
      sctx.setLineDash([]);
    }
  }
  function scopeTick() {
    scopeRaf = 0;
    const live = performance.now() < scopeUntil;
    drawScope(live);
    if (live) scopeRaf = requestAnimationFrame(scopeTick);
  }
  audio.onPlay = (name, secs) => {
    scopeUntil = performance.now() + secs * 1000 + 60;
    if (!scopeRaf) scopeRaf = requestAnimationFrame(scopeTick);
    window.clearTimeout(labelTimer);
    setLabel(EVENT[name]);
    labelTimer = window.setTimeout(() => setLabel(soundOn ? 'Sound on' : 'Sound off'), Math.max(900, secs * 1000 + 700));
  };
  syncSound();

  /**
   * A deliberate press in the demo: the first one turns sound on (unless the visitor turned it off
   * this session) and wakes the AudioContext inside the gesture, as browsers require.
   */
  function pressed(): boolean {
    window.clearTimeout(warmTimer);
    if (choice !== 'off' && !soundOn) {
      soundOn = true;
      syncSound();
    }
    const fresh = soundOn ? audio.unlock() : false;
    wake();
    return fresh;
  }
  /**
   * On a mouse pointerdown: wake the AudioContext during the press, so creating it never eats a click's
   * motion. Creating one can hold the main thread for a few hundred milliseconds (300 to 600 ms measured
   * in Chrome on an M1 Pro), so it is made just after the frame that shows the press: the press-down
   * scale is a compositor transition and keeps playing through the wait. The click still unlocks inside
   * its own gesture (pressed()), which is what Safari needs to resume it.
   * Tried creating it inside pointerdown: the press itself froze until the context existed.
   * Mouse only: a touch or pen pointerdown is not a user activation (the gesture counts on pointerup),
   * so a context made there starts suspended and logs a warning, and on a phone most pointerdowns on
   * the stage start a scroll, which would carry the stall. Those create it in the click instead.
   * A press dragged off its button makes no click: the context it woke is put back to sleep.
   */
  let warmTimer = 0;
  function warm(e: PointerEvent) {
    if (e.pointerType !== 'mouse' || choice === 'off' || audio.running) return;
    requestAnimationFrame(() => window.setTimeout(() => {
      if (choice === 'off') return;
      audio.unlock();
      window.clearTimeout(warmTimer);
      warmTimer = window.setTimeout(() => { if (!soundOn) audio.suspend(); }, 1500);
    }, 0));
  }
  /** Plays an event's sound and, on a phone that can, its haptic (the app's pairing, roughly). */
  function feel(name: SoundName, buzz = 0) {
    if (soundOn) audio.play(name);
    if (buzz && !fine && 'vibrate' in navigator) {
      try { navigator.vibrate(buzz); } catch { /* not allowed yet */ }
    }
  }
  // the switch warms the context like any press (mouse only, and back to sleep if no click follows)
  soundBtn.addEventListener('pointerdown', (e) => { if (!soundOn) warm(e); });
  soundBtn.addEventListener('click', () => {
    if (soundOn) {
      soundOn = false;
      choice = 'off';
      // nothing will play: the audio thread can sleep until sound is switched back on
      audio.suspend();
    } else {
      choice = 'on';
      soundOn = true;
      audio.unlock();
    }
    try { sessionStorage.setItem(KEY, choice); } catch { /* fine */ }
    syncSound();
    // a switch plays its toggle just after the change lands, so turning sound on is heard
    if (soundOn) window.setTimeout(() => feel('toggle_on'), 30);
  });

  // ================================================================ ambient motion
  // The app's heat rule: what moves with nobody touching (live dots, the ring's breath, the flame's
  // flicker, a member's turning ring, the empty day's light) plays for 12 s after the last touch, then
  // each loop finishes its beat and rests. Off screen it never runs.
  let visible = false;
  let awake = false;
  let sleepTimer = 0;
  let lastWake = 0;
  const amb = () => Array.from(root.querySelectorAll<HTMLElement>('[data-ep-ambient], [data-ep-halo], .ept-flame__icon, .ept-member__ring'));
  /** Whether a loop belongs to what is on screen right now. */
  function wanted(el: HTMLElement): boolean {
    const kind = el.dataset.epAmbient;
    if (kind === 'run' || kind === 'breath') return !dayLogged;
    if (el.matches('[data-ep-halo]')) return running && ignited;
    if (el.classList.contains('ept-member__ring')) return !!el.closest('.ept-member--active');
    if (el.closest('[data-ep-run]')) return running;
    return true;
  }
  function syncAmbient() {
    for (const el of amb()) {
      const on = awake && wanted(el);
      if (on) el.classList.add('is-amb');
      else if (el.classList.contains('is-amb')) restLoop(el);
    }
  }
  /** Lets one loop finish its beat into its rest pose, then stops it. */
  function restLoop(el: HTMLElement) {
    // woken again before the beat ended: it keeps going
    const end = () => { if (!(awake && wanted(el))) el.classList.remove('is-amb'); };
    el.addEventListener('animationiteration', end, { once: true });
    window.setTimeout(end, 8200);
  }
  function wake() {
    if (calm || !visible) return;
    const now = performance.now();
    if (awake && now - lastWake < 600) return;
    lastWake = now;
    awake = true;
    syncAmbient();
    window.clearTimeout(sleepTimer);
    sleepTimer = window.setTimeout(() => {
      awake = false;
      syncAmbient();
    }, 12000);
  }
  function sleepNow() {
    awake = false;
    window.clearTimeout(sleepTimer);
    for (const el of root.querySelectorAll('.is-amb')) el.classList.remove('is-amb');
  }
  // Touch screens: what moves by itself waits for the scroll to rest. A phone visitor scrolls the whole time this
  // section is in view, and the ambient loops (infinite CSS animations inside the phone's 3D layers) and the clock's
  // once-a-second repaint of the ring ran under the finger, from the moment it came into view (2026-11-09 audit,
  // VE-07). So on touch, coming into view no longer wakes them: the loops wake 150 ms after the scroll last moved (for
  // the same 12 s), hold while it moves (.is-scrolling, ep-section.css), and the clock keeps its second until the
  // scroll rests, then catches up. A tap wakes them as before. At rest it all looks as it did.
  const touch = !fine && window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  let scrolling = false;
  let restT = 0;
  let scrollRaf = 0;
  function onRest() {
    scrolling = false;
    if (scrollRaf) cancelAnimationFrame(scrollRaf);
    scrollRaf = 0;
    root.classList.remove('is-scrolling');
    if (visible) wake();
  }
  if (touch && !calm) {
    addEventListener('scroll', () => {
      if (!visible) return;
      window.clearTimeout(restT);
      restT = window.setTimeout(onRest, 150);
      if (scrolling) return;
      scrolling = true;
      // the class in the next frame, never from inside the scroll listener (README rule 3)
      scrollRaf = requestAnimationFrame(() => {
        scrollRaf = 0;
        if (scrolling) root.classList.add('is-scrolling');
      });
    }, { passive: true });
  }

  // ================================================================ rolling numbers and morphs
  /**
   * RollingNumber: only the changed digits move, rolling up through a soft edge (down when the value
   * falls) on the roll spring. A new leading digit slides in as the number widens. At rest it is
   * plain text again.
   */
  function setNum(el: HTMLElement, value: string, animate: boolean, dir = 1) {
    const old = el.dataset.v ?? el.textContent ?? '';
    if (old === value) return;
    el.dataset.v = value;
    gsap.killTweensOf(el.querySelectorAll('*'));
    if (!animate || calm || !visible) {
      el.textContent = value;
      return;
    }
    const L = Math.max(old.length, value.length);
    const a = old.padStart(L, ' ');
    const b = value.padStart(L, ' ');
    el.textContent = '';
    const fs = parseFloat(getComputedStyle(el).fontSize) || 20;
    for (let i = 0; i < L; i++) {
      if (a[i] === b[i]) {
        if (b[i] !== ' ') el.append(b[i]);
        continue;
      }
      const slot = document.createElement('span');
      slot.className = 'ep3-d';
      const o = document.createElement('span');
      o.className = 'ep3-d__old';
      o.textContent = a[i] === ' ' ? '' : a[i];
      const nw = document.createElement('span');
      nw.className = 'ep3-d__new';
      nw.textContent = b[i] === ' ' ? '' : b[i];
      slot.append(o, nw);
      el.append(slot);
      const grow = a[i] === ' ';
      const shrink = b[i] === ' ';
      if (grow || shrink) gsap.fromTo(slot, { width: grow ? 0 : '1ch' }, { width: grow ? '1ch' : 0, duration: SPRING.roll.settle, ease: roll });
      const blur = { b: 0 };
      // position on the roll spring; the new digit shows almost at once and the old one goes quickly,
      // so a digit is always readable mid-roll (tried slow cross-fades: small numbers blinked out)
      gsap.fromTo(o, { yPercent: 0 }, { yPercent: -100 * dir, duration: SPRING.roll.settle * 0.7, ease: roll });
      gsap.fromTo(o, { opacity: 1 }, { opacity: 0, duration: SPRING.roll.settle * 0.35, ease: 'power1.in' });
      gsap.fromTo(nw, { yPercent: 100 * dir }, { yPercent: 0, duration: SPRING.roll.settle, ease: roll });
      gsap.fromTo(nw, { opacity: 0.25 }, { opacity: 1, duration: SPRING.roll.settle * 0.22, ease: 'power1.out' });
      gsap.to(blur, {
        b: 1, duration: SPRING.roll.settle * 0.6, ease: 'none',
        onUpdate: () => {
          const f = `blur(${(Math.sin(Math.PI * blur.b) * fs * 0.06).toFixed(2)}px)`;
          o.style.filter = f;
          nw.style.filter = f;
        },
      });
    }
    const settleMs = SPRING.roll.settle * 1000 + 40;
    window.setTimeout(() => {
      if (el.dataset.v === value) el.textContent = value;
    }, settleMs);
  }
  /** Counts a number up from zero the first time it shows (AppMotion.countUp, 780 ms). */
  function countUp(el: HTMLElement, to: number) {
    el.dataset.v = String(to);
    if (calm) {
      el.textContent = String(to);
      return;
    }
    const v = { n: 0 };
    gsap.to(v, { n: to, duration: 0.78, ease: 'power2.out', onUpdate: () => { el.textContent = String(Math.round(v.n)); } });
  }
  /** Morph: the old words blur out in 180 ms while the new ones sharpen in over 460 ms. */
  function morphText(el: HTMLElement, value: string) {
    if (el.textContent === value) return;
    if (calm) {
      el.textContent = value;
      return;
    }
    gsap.killTweensOf(el);
    gsap.to(el, {
      opacity: 0, filter: 'blur(10px)', scale: 0.96, duration: 0.18, ease: 'power1.in',
      onComplete: () => {
        el.textContent = value;
        gsap.fromTo(el, { opacity: 0, filter: 'blur(10px)', scale: 1.04 }, { opacity: 1, filter: 'blur(0px)', scale: 1, duration: 0.46, ease: 'power2.out', clearProps: 'filter,transform' });
      },
    });
  }

  // ================================================================ presses
  /**
   * Press: scale to 0.96 on the snappy spring while held (CSS), and a click does the work. A pointer
   * that wandered more than 10px before letting go was a drag, not a press. The handler gets the click,
   * so it can tell a keyboard press (detail 0) from a pointer one.
   */
  function press(el: HTMLElement, onClick: (e: MouseEvent) => void) {
    let moved = false;
    let sx = 0, sy = 0;
    el.addEventListener('pointerdown', (e) => {
      // a control that has done its job (Dee once he showed up) keeps its focus but takes no press
      if (el.getAttribute('aria-disabled') === 'true') return;
      moved = false;
      sx = e.clientX;
      sy = e.clientY;
      el.classList.add('is-down');
      warm(e);
    });
    el.addEventListener('pointermove', (e) => {
      if (Math.hypot(e.clientX - sx, e.clientY - sy) > 10) {
        moved = true;
        el.classList.remove('is-down');
      }
    });
    const up = () => el.classList.remove('is-down');
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('pointerleave', up);
    el.addEventListener('click', (e) => {
      // `moved` belongs to the pointer press it was measured on: it is spent here, and a keyboard
      // click (detail 0, no pointerdown before it) never reads it, so Enter or Space always works
      const drag = moved && e.detail !== 0;
      moved = false;
      if (drag || el.getAttribute('aria-disabled') === 'true') {
        e.preventDefault();
        return;
      }
      // A press can follow a pause (the AudioContext being created on pointerdown, or just now for a
      // keyboard press). GSAP's clock was last read before it, and would jump the new motion forward by
      // the whole pause; reading the clock first makes every press start on its first frame.
      // Tried: a requestAnimationFrame defer alone, broke because the clock still jumped on that frame.
      pressed();
      gsap.ticker.tick();
      onClick(e);
    });
  }

  // ================================================================ the focus ring
  const ring = q('[data-ep-ring]');
  const ringTime = q('[data-ep-time]');
  const clock = q('[data-ep-clock]');
  const caption = q('[data-ep-caption]');
  const laps = q('[data-ep-laps]');
  const ripple = q('[data-ep-ripple]');
  let running = true;
  let ignited = calm;
  let startedAt = performance.now() - SESSION_AT_LOAD * 1000;
  let style: 'pomodoro' | 'free' = 'pomodoro';
  let roundMin = 25;
  let lapsDone = 0;
  let tick = 0;
  const cycle = () => (style === 'pomodoro' ? roundMin : 60) * 60;
  const styleText = () => (style === 'pomodoro' ? `Pomodoro · ${roundMin} min` : 'Free timer');
  const elapsed = () => (still ? SESSION_AT_LOAD : (performance.now() - startedAt) / 1000);
  const fmt = (sec: number) => {
    const s = Math.floor(sec);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = String(s % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
  };
  const captionFor = () => (style === 'pomodoro' ? `round ${lapsDone + 1}` : lapsDone ? `lap ${lapsDone + 1}` : 'of an hour');
  const sweepNow = () => ((elapsed() % cycle()) / cycle()) * 360;
  function paintRing(v: Partial<Record<'sweep' | 'draw' | 'flash' | 'glow' | 'rs' | 'arc' | 'head' | 'headA', number>>) {
    for (const [k, val] of Object.entries(v)) {
      ring.style.setProperty(`--${k}`, k === 'sweep' || k === 'head' ? `${val!.toFixed(2)}deg` : val!.toFixed(4));
    }
  }
  /** The clock ticks on each whole second while it runs (only while it can be seen). */
  function schedule() {
    window.clearTimeout(tick);
    if (!running || still || !visible || document.hidden) return;
    const ms = 1000 - ((elapsed() * 1000) % 1000);
    tick = window.setTimeout(onTick, ms + 6);
  }
  function onTick() {
    if (!running) return;
    // (touch: held while the scroll moves, see onRest)
    if (scrolling) {
      tick = window.setTimeout(onTick, 160);
      return;
    }
    // the clock rolls while someone's there, and simply changes once a second after
    setNum(clock, fmt(elapsed()), awake);
    if (ignited) paintRing({ sweep: sweepNow(), head: sweepNow() });
    const lap = Math.floor(elapsed() / cycle());
    if (lap > lapsDone && ignited) lapDone(lap);
    schedule();
  }
  /** A lap done: the ring flares, the lap drops inside the arc as a thin ring, `success`. */
  function lapDone(lap: number) {
    lapsDone = lap;
    feel('success', 14);
    drawLaps();
    morphText(caption, captionFor());
    if (!calm) gsap.fromTo(ripple, { opacity: 0.6, scale: 1 }, { opacity: 0, scale: 1.22, duration: 0.9, ease: 'power2.out' });
  }
  function drawLaps() {
    laps.textContent = '';
    const n = Math.min(lapsDone, 48);
    const pitch = Math.min(5, 14 / Math.max(n, 1));
    const stroke = Math.min(2.5, pitch * 0.6);
    for (let k = 0; k < n; k++) {
      const i = document.createElement('i');
      const inset = 10 + 4 + pitch * (k + 0.5);
      i.style.cssText = `inset:calc(${inset - stroke / 2} * var(--p));border-width:calc(${stroke} * var(--p));opacity:${lerp(0.55, 0.18, n === 1 ? 0 : k / (n - 1))}`;
      laps.append(i);
    }
  }
  /** The ring before it ignites: the track undrawn, the time not yet sharp. */
  function preIgnite() {
    paintRing({ draw: 0, flash: 0, glow: 0, rs: 0.6, arc: 0, head: 0, headA: 0 });
    ringTime.style.opacity = '0';
  }
  /**
   * Ignite (AppMotion.ignite, 1.2 s), exactly as focusRingValues: a spark waits at twelve, then runs
   * once round the track drawing it; the ring catches light as the track closes; the time sharpens in.
   */
  function ignite() {
    ignited = true;
    if (calm) {
      paintRing({ draw: 1, flash: 0, glow: 1, rs: 1, arc: 1, sweep: sweepNow(), head: sweepNow(), headA: 1 });
      ringTime.style.opacity = '1';
      ringTime.style.filter = '';
      syncAmbient();
      return;
    }
    const p = { i: 0 };
    gsap.to(p, {
      i: 1, duration: 1.2, ease: 'none',
      onUpdate: () => {
        const i = p.i;
        const draw = easeInOutCubic(clamp((i - 0.2) / 0.55, 0, 1));
        const flash = i <= 0.68 || i >= 1 ? 0 : Math.sin((Math.PI * (i - 0.68)) / 0.32);
        const settle = easeOut(clamp((i - 0.6) / 0.4, 0, 1));
        const digits = clamp((i - 0.6) / 0.35, 0, 1);
        const sw = sweepNow();
        paintRing({
          draw, flash, sweep: sw,
          rs: lerp(0.6, 1, bouncy(clamp(i / 0.75, 0, 1))),
          arc: draw >= 1 ? 1 : 0,
          head: draw < 1 ? draw * 360 : sw,
          headA: draw < 1 ? (i < 0.2 ? i / 0.2 : 1) : 1,
          glow: clamp(settle + 0.65 * flash, 0, 1.29),
        });
        ringTime.style.opacity = String(digits);
        ringTime.style.filter = digits < 1 ? `blur(${(10 * (1 - digits)).toFixed(2)}px)` : '';
      },
      onComplete: () => {
        ringTime.style.filter = '';
        syncAmbient();
      },
    });
  }

  // ================================================================ the day card
  const myday = q('[data-ep-myday]');
  const blocks = q('[data-ep-blocks]');
  const empty = q('[data-ep-empty]');
  const stats = q('[data-ep-stats]');
  const heroStat = stats.querySelector<HTMLElement>('.ept-stat--hero')!;
  const focusNum = q('[data-ep-roll="focus"]');
  const chip = q('[data-ep-chip]');
  const chipText = chip.querySelector('b')!;
  const sparks = Array.from(chip.querySelectorAll<HTMLElement>('.ept-chip__sparks i'));
  const sweepEl = q('.ept-sweep');
  let dayLogged = false;
  let focusMin = 0;

  /**
   * A log landing on your day (MyDayCard.moment): the mode colour sweeps across the card, the block
   * grows into the bar on the land spring with a bright leading edge, the tile pulses and a "+18 min"
   * chip floats up and fades. The first log of the day is a show-up: gold, longer, with sparks and
   * `celebrate`, and the streak flame hops a beat later.
   */
  function landLog(minutes: number) {
    const showUp = !dayLogged;
    const colour = showUp ? '227, 197, 136' : '148, 138, 234';
    feel(showUp ? 'celebrate' : 'logged', showUp ? 22 : 14);
    // the block, from when the session started to now
    const start = NOW_HOUR - minutes / 60;
    const b = document.createElement('span');
    b.className = 'ept-block';
    b.style.cssText = `left:${(((start - 6) / 18) * 100).toFixed(3)}%;width:${(((minutes / 60) / 18) * 100).toFixed(3)}%;--c:#948AEA`;
    b.innerHTML = '<i class="ept-block__glow"></i><i class="ept-block__fill"></i><i class="ept-block__edge"></i>';
    blocks.append(b);
    const [glowEl, fillEl, edgeEl] = Array.from(b.children) as HTMLElement[];
    // the numbers: the empty line morphs into them the first time
    if (showUp) {
      dayLogged = true;
      myday.classList.add('is-logged');
      syncAmbient();
      stats.hidden = false;
      if (calm) {
        empty.style.opacity = '0';
      } else {
        gsap.to(empty, { opacity: 0, filter: 'blur(10px)', scale: 0.97, duration: 0.18, ease: 'power1.in' });
        gsap.fromTo(stats, { opacity: 0, filter: 'blur(10px)', scale: 1.02 }, { opacity: 1, filter: 'blur(0px)', scale: 1, duration: 0.46, delay: 0.08, ease: 'power2.out', clearProps: 'filter,transform' });
      }
    }
    focusMin += minutes;
    if (showUp) countUp(focusNum, focusMin);
    else setNum(focusNum, String(focusMin), true);
    // the streak flame hops a beat after the card reacts (AppMotion.momentStagger)
    if (showUp) window.setTimeout(hopFlame, calm ? 450 : 450 + 280);
    chipText.textContent = `+${minutes} min`;
    chip.style.setProperty('--chip', showUp ? '#E3C588' : '#948AEA');
    chip.style.setProperty('--chip-ink', showUp ? '#F0DCAF' : '#B7AFF3');
    if (calm) {
      // Reduce Motion: the block is simply there, and the chip only fades in and out, held where the
      // moving one reads best (16pt up). Tried its resting spot: it sat on the number it adds to.
      fillEl.style.transform = 'none';
      chip.style.transform = 'translateY(calc(-16 * var(--p)))';
      chipText.style.filter = '';
      gsap.timeline()
        .fromTo(chip, { opacity: 0 }, { opacity: 1, duration: 0.15, ease: 'none' })
        .to(chip, { opacity: 0, duration: 0.25, ease: 'none' }, 1.3);
      return;
    }
    const dur = showUp ? 1.4 : 0.9; // AppMotion.celebrate, AppMotion.sweep
    gsap.fromTo(fillEl, { scaleX: 0 }, { scaleX: 1, duration: SPRING.land.settle, ease: land });
    gsap.fromTo([glowEl, edgeEl], { opacity: (i: number) => (i ? 1 : 0.4) }, { opacity: 0, duration: SPRING.land.settle, ease: 'none' });
    sweepEl.style.setProperty('--sweep-c', `rgba(${colour}, ${showUp ? 0.24 : 0.16})`);
    const sx = { t: 0 };
    gsap.to(sx, {
      t: 1, duration: dur, ease: smooth,
      onUpdate: () => sweepEl.style.setProperty('--sweep-x', `${lerp(-120, 120, sx.t).toFixed(1)}%`),
      onComplete: () => sweepEl.style.setProperty('--sweep-x', '-120%'),
    });
    // the changed tile pulses on the bouncy spring
    gsap.fromTo(heroStat, { scale: 1 }, { keyframes: [{ scale: 1.08, duration: 0.16, ease: 'power2.out' }, { scale: 1, duration: SPRING.bouncy.settle, ease: bouncy }], transformOrigin: '0% 100%', clearProps: 'transform' });
    // the chip, exactly as momentChipValues; its width is read once here (the text is set, and the
    // frames below only write transforms), so no frame forces a layout
    const chipW = chip.offsetWidth / pt;
    const c = { t: 0 };
    gsap.to(c, {
      t: 1, duration: 1.6, ease: 'none',
      onUpdate: () => {
        const t = c.t;
        const fadeIn = clamp((t - 0.06) / 0.14, 0, 1);
        const fadeOut = clamp((t - 0.62) / 0.38, 0, 1);
        const op = fadeIn * (1 - easeIn(fadeOut));
        const pop = bouncy(clamp((t - 0.06) / 0.3, 0, 1));
        const dy = -30 * easeOutCubic(t);
        const sc = lerp(0.6, 1, pop);
        const bl = 6 * (1 - fadeIn) + 4 * fadeOut;
        chip.style.opacity = op.toFixed(3);
        chip.style.transform = `translateY(calc(${dy.toFixed(2)} * var(--p))) scale(${sc.toFixed(3)})`;
        chipText.style.filter = bl > 0.05 ? `blur(${bl.toFixed(2)}px)` : '';
        // gold sparks burst as the chip pops out (12 short rays, _SparkPainter)
        const burst = (t - 0.06) / 0.4;
        const w = chipW;
        for (let i = 0; i < sparks.length; i++) {
          const s = sparks[i];
          if (!showUp || burst <= 0 || burst >= 1) {
            s.style.opacity = '0';
            continue;
          }
          const e = easeOutCubic(burst);
          const ang = (2 * Math.PI * i) / 12 + 0.2;
          const dx = Math.cos(ang), dyy = Math.sin(ang);
          const reach = (w / 2) * Math.abs(dx) + 13 * Math.abs(dyy) + 12 + (i % 2 ? 0 : 8);
          const from = reach * (0.55 + 0.45 * e);
          const len = 8 * (1 - burst);
          s.style.opacity = (1 - burst).toFixed(3);
          s.style.transform = `rotate(${ang}rad) translateX(calc(${from.toFixed(2)} * var(--p))) scaleX(${Math.max(0.05, len / 8).toFixed(3)})`;
        }
      },
      onComplete: () => {
        chip.style.opacity = '0';
        sparks.forEach((s) => (s.style.opacity = '0'));
      },
    });
  }

  // ================================================================ the streak flame
  const flame = q('[data-ep-flame]');
  const flameGlow = flame.querySelector<HTMLElement>('.ept-flame__glow')!;
  const embers = Array.from(flame.querySelectorAll<HTMLElement>('.ept-flame__embers i'));
  const streakNum = q('[data-ep-roll="streak"]');
  const streakBox = q('[data-ep-streak]');
  let streak = 3;
  let hops = 0;
  /**
   * Streak +1 (StreakFlame): the flame hops up quickly and lands on the bouncy spring, swelling to
   * 1.25, flares gold and throws six embers from its tip while the number rolls; `streak`.
   */
  function hopFlame() {
    streak += 1;
    streakBox.setAttribute('aria-label', `Streak: ${streak} days`);
    feel('streak', 22);
    setNum(streakNum, String(streak), true, 1);
    if (calm) return;
    hops += 1;
    let r = hops * 9301 + 49297;
    const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
    const size = flame.offsetWidth;
    const drift = embers.map(() => (rnd() - 0.5) * size * 1.6);
    const rise = embers.map(() => size * (0.9 + rnd() * 0.9));
    const f = { t: 0 };
    gsap.to(f, {
      t: 1, duration: 1.1, ease: 'none',
      onUpdate: () => {
        const t = f.t;
        const hop = clamp((t * 1.1) / 0.72, 0, 1);
        const lift = hop <= 0 || hop >= 1 ? 0 : hop < 0.35 ? easeOut(hop / 0.35) : 1 - bouncy((hop - 0.35) / 0.65);
        const burst = Math.sin(Math.PI * t);
        flame.style.transform = `translateY(calc(${(-10 * lift).toFixed(2)} * var(--p))) scale(${(1 + 0.25 * lift).toFixed(3)})`;
        flameGlow.style.opacity = (0.16 + 0.34 * burst).toFixed(3);
        flameGlow.style.transform = `scale(${(1 + 0.6 * burst).toFixed(3)})`;
        for (let i = 0; i < embers.length; i++) {
          const em = embers[i];
          const p = clamp((t - i * 0.06) / 0.7, 0, 1);
          if (p <= 0 || p >= 1) {
            em.style.opacity = '0';
            continue;
          }
          const e = easeOut(p);
          em.style.opacity = (0.9 * (1 - p)).toFixed(3);
          em.style.transform = `translate(${(drift[i] * e).toFixed(2)}px, ${(-rise[i] * e).toFixed(2)}px) scale(${(1 - 0.6 * p).toFixed(3)})`;
        }
      },
      onComplete: () => {
        flame.style.transform = '';
        flameGlow.style.opacity = '';
        flameGlow.style.transform = '';
      },
    });
  }

  // ================================================================ focus: stop and start
  const focusSlot = q('[data-ep-focus]');
  const runBlock = q('[data-ep-run]');
  const startBtn = q<HTMLButtonElement>('[data-ep-start]');
  const stopBtn = q<HTMLButtonElement>('[data-ep-stop]');
  const styleBtn = q<HTMLButtonElement>('[data-ep-style]');
  const styleLabel = q('[data-ep-style-label]');
  let busy = false;

  /**
   * Swaps what the focus slot shows (FocusRing's Morph inside an AnimatedSize): the old content blurs
   * out in 180 ms, the new one sharpens in over 460 ms, and the slot's height follows on the smooth
   * spring, so the tiles and the circle glide up or down under it.
   */
  function swapFocus(toRunning: boolean, then?: () => void) {
    const show = toRunning ? runBlock : startBtn;
    const hide = toRunning ? startBtn : runBlock;
    if (calm) {
      hide.hidden = true;
      show.hidden = false;
      then?.();
      return;
    }
    const h0 = focusSlot.offsetHeight;
    show.hidden = false;
    show.style.cssText = 'position:absolute;left:0;right:0;top:0';
    const h1 = show.offsetHeight;
    hide.style.cssText = 'position:absolute;left:0;right:0;top:0';
    focusSlot.style.height = `${h0}px`;
    // AnimatedSize clips its child while it resizes, so the tiles never slide over the fading card
    focusSlot.style.overflow = 'hidden';
    gsap.to(hide, { opacity: 0, filter: 'blur(10px)', scale: 0.985, transformOrigin: '50% 0%', duration: 0.18, ease: 'power1.in', onComplete: () => { hide.hidden = true; hide.style.cssText = ''; } });
    gsap.fromTo(show, { opacity: 0, filter: 'blur(10px)', scale: 1.02, transformOrigin: '50% 0%' }, { opacity: 1, filter: 'blur(0px)', scale: 1, duration: 0.46, ease: 'power2.out', clearProps: 'filter,transform,opacity' });
    gsap.to(focusSlot, {
      height: h1, duration: SPRING.smooth.settle, ease: smooth,
      onComplete: () => {
        focusSlot.style.height = '';
        focusSlot.style.overflow = '';
        show.style.cssText = '';
        then?.();
      },
    });
  }
  press(stopBtn, () => {
    if (!running || busy) return;
    busy = true;
    feel('stop', 8);
    const minutes = Math.floor(elapsed() / 60);
    running = false;
    syncReach();
    window.clearTimeout(tick);
    setMember('you', minutes > 0 || dayLogged ? 'showed' : 'quiet');
    syncAmbient();
    const hadFocus = document.activeElement === stopBtn;
    swapFocus(false, () => { busy = false; });
    // the focused Stop is gone: focus moves to what took its place, so Enter on Stop never drops a
    // keyboard user back at the top of the page (after a mouse click the browser shows no ring for it)
    if (hadFocus) startBtn.focus({ preventScroll: true });
    // the session saves, then lands on the day card (a session under a minute logs nothing, as in the app)
    if (minutes > 0) window.setTimeout(() => landLog(minutes), calm ? 0 : 280);
  });
  // Today's Start only opens the "Focus for" sheet; the sheet's own Start focus plays `start`
  press(startBtn, (e) => {
    if (running || busy) return;
    openSheet(e.detail === 0);
  });
  /** Starts a session on what the sheet picked: the ring ignites, the clock counts from 0:00. */
  function startSession() {
    if (running || busy) return;
    busy = true;
    feel('start', 14);
    running = true;
    syncReach();
    startedAt = performance.now();
    lapsDone = 0;
    drawLaps();
    clock.dataset.v = '0:00';
    clock.textContent = '0:00';
    caption.textContent = captionFor();
    setMember('you', 'active');
    preIgnite();
    styleLabel.textContent = styleText();
    styleBtn.setAttribute('aria-label', `Timer style: ${style === 'pomodoro' ? `Pomodoro, ${roundMin} minutes` : 'free timer'}. Switch`);
    swapFocus(true, () => { busy = false; });
    window.setTimeout(ignite, calm ? 0 : 120);
    schedule();
  }
  press(styleBtn, () => {
    feel('select', 4);
    const from = ignited ? sweepNow() : 0;
    style = style === 'pomodoro' ? 'free' : 'pomodoro';
    lapsDone = Math.floor(elapsed() / cycle());
    drawLaps();
    const label = styleText();
    styleBtn.setAttribute('aria-label', `Timer style: ${style === 'pomodoro' ? `Pomodoro, ${roundMin} minutes` : 'free timer'}. Switch`);
    // the chip's label morphs and its width follows on the smooth spring
    const w0 = styleLabel.offsetWidth;
    morphText(styleLabel, label);
    if (!calm) {
      window.setTimeout(() => {
        styleLabel.style.width = 'auto';
        const w1 = styleLabel.scrollWidth;
        gsap.fromTo(styleLabel, { width: w0 }, { width: w1, duration: SPRING.smooth.settle, ease: smooth, clearProps: 'width' });
      }, 180);
    }
    morphText(caption, captionFor());
    if (!ignited) return;
    const to = sweepNow();
    if (calm) {
      paintRing({ sweep: to, head: to });
      return;
    }
    const s = { v: from };
    gsap.to(s, { v: to, duration: SPRING.smooth.settle, ease: smooth, onUpdate: () => paintRing({ sweep: s.v, head: s.v }) });
  });

  // ================================================================ "Focus for": the sheet and its drum
  const scrim = q('[data-ep-scrim]');
  const sheet = q('[data-ep-sheet]');
  const closeBtn = q<HTMLButtonElement>('[data-ep-close]');
  const goBtn = q<HTMLButtonElement>('[data-ep-go]');
  const opts = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-ep-opt]'));
  const roundBox = q('[data-ep-round]');
  const drum = q('[data-ep-drum]');
  const cells = Array.from(drum.querySelectorAll<HTMLElement>('[data-ep-cells] i'));
  const caretGlow = q('[data-ep-caret]');
  const behind = [q('.ep3-scr--cards'), q('.ep3-scr--chrome')];
  let sheetStyle: 'pomodoro' | 'free' = 'pomodoro';
  // One state for the sheet, and one owner for its motion: every open or close first stops whatever
  // the last one started, so presses in any order and at any speed always land on a whole sheet or none.
  // Tried: separate open and close tweens left running side by side; a triple click let a stale close
  // finish after the reopen, hiding the sheet under a full scrim with no way out.
  let sheetPhase: 'closed' | 'opening' | 'open' | 'closing' = 'closed';
  let sheetTimer = 0;
  /**
   * How long a sheet that just opened, or just started closing, catches presses without acting on them
   * (ms). Otherwise a double or triple click on Start focus lands its extra clicks on the scrim and shuts
   * the sheet as it opens, and a double click on the scrim reaches the screen behind as the sheet goes.
   */
  const SHEET_GUARD = DOUBLE_CLICK;
  const sheetUp = () => sheetPhase === 'open' || sheetPhase === 'opening';
  const sheetMotion = () => gsap.killTweensOf([sheet, scrim, ...behind]);

  /**
   * showAppSheet: hinged at its bottom edge, the sheet starts tilted away (56°), smaller and blurred
   * (15px), and stands up on the sheet spring (620 ms, bounce 0.18) while it sharpens. The screen behind
   * dims and blurs (6px). `sheetOpen` as it folds up; the drum turns into place, silently. Opened from
   * the keyboard, focus moves into it.
   */
  function openSheet(fromKeys = false) {
    if (sheetUp()) return;
    const fresh = sheetPhase === 'closed';
    sheetPhase = 'opening';
    window.clearTimeout(sheetTimer);
    sheetMotion();
    if (fresh) {
      // a fresh sheet shows the current set-up; one reopened as it closed keeps what it showed
      sheetStyle = style;
      syncOpts();
      roundBox.style.height = sheetStyle === 'free' ? '0px' : '';
      drumTo(roundMin, false);
    }
    sheet.hidden = false;
    sheet.classList.add('is-busy');
    scrim.classList.add('is-open');
    // the dimmed screen behind is out of reach for the keyboard too, as it is for the pointer under the
    // scrim: Tab and Enter can no longer press Dee or a tile through it. Only the phone's screen goes
    // inert; the page round the phone stays as it was (so aria-modal stays false).
    for (const b of behind) b.inert = true;
    feel('sheet_open', 8);
    sheetTimer = window.setTimeout(() => {
      if (sheetPhase !== 'opening') return;
      sheetPhase = 'open';
      sheet.classList.remove('is-busy');
    }, SHEET_GUARD);
    if (fromKeys) (opts.find((o) => o.classList.contains('is-on')) ?? goBtn).focus({ preventScroll: true });
    if (calm) {
      gsap.set(sheet, { opacity: 1 });
      gsap.set(scrim, { opacity: 1 });
      return;
    }
    const ease = easeOf(SPRING.sheet);
    if (fresh) {
      // the drum turns into place, silently, while the sheet folds up (not on a reopen: it is already
      // in place and sharp there, so it would visibly jump)
      drumPos = roundMin - 5 + 2.4;
      drumAnim(roundMin - 5, SPRING.sheet, true);
      gsap.fromTo(sheet, { rotationX: 56, transformPerspective: 900 * pt, scale: 0.94, y: 18 * pt, filter: 'blur(15px)' }, {
        rotationX: 0, scale: 1, y: 0, filter: 'blur(0px)', duration: SPRING.sheet.settle, ease, clearProps: 'filter',
      });
      gsap.fromTo(sheet, { opacity: 0 }, { opacity: 1, duration: 0.15, ease: 'none' });
    } else {
      // reopened while it was still tipping away: it stands back up from wherever it got to
      gsap.to(sheet, { rotationX: 0, scale: 1, y: 0, filter: 'blur(0px)', duration: SPRING.sheet.settle, ease, clearProps: 'filter' });
      gsap.to(sheet, { opacity: 1, duration: 0.15, ease: 'none' });
    }
    gsap.to(scrim, { opacity: 1, duration: 0.25, ease: 'power1.out' });
    gsap.to(behind, { filter: `blur(${(6 * pt).toFixed(2)}px)`, duration: 0.25, ease: 'power1.out' });
  }
  /**
   * Closing tips it back away; the screen behind sharpens. `sheetClose` however it is closed. The sheet
   * and the scrim keep catching presses until it has gone (SHEET_GUARD); a focused control inside hands
   * focus back to the screen.
   */
  function closeSheet() {
    if (!sheetUp()) return;
    sheetPhase = 'closing';
    window.clearTimeout(sheetTimer);
    sheetMotion();
    sheet.classList.add('is-busy');
    // the screen behind comes back at once, so the focus handed back below can land on it (the scrim
    // still absorbs stray clicks until the sheet has gone)
    for (const b of behind) b.inert = false;
    feel('sheet_close');
    // after the caller is done (the sheet's Start focus starts the session right after this), so focus
    // lands on what the slot now shows: Stop for a running session, Start focus otherwise
    queueMicrotask(() => {
      if (sheet.contains(document.activeElement)) (running ? stopBtn : startBtn).focus({ preventScroll: true });
    });
    sheetTimer = window.setTimeout(() => {
      if (sheetPhase !== 'closing') return;
      sheetPhase = 'closed';
      sheet.hidden = true;
      sheet.classList.remove('is-busy');
      scrim.classList.remove('is-open');
      gsap.set(sheet, { clearProps: 'filter' });
    }, SHEET_GUARD);
    if (calm) {
      gsap.set([sheet, scrim], { opacity: 0 });
      return;
    }
    gsap.to(sheet, { rotationX: 40, scale: 0.95, y: 24 * pt, opacity: 0, filter: 'blur(12px)', duration: 0.28, ease: 'power2.in' });
    gsap.to(scrim, { opacity: 0, duration: 0.25, ease: 'power1.in' });
    gsap.to(behind, { filter: 'blur(0px)', duration: 0.25, ease: 'power1.in', clearProps: 'filter' });
  }
  function syncOpts() {
    for (const o of opts) {
      const on = o.dataset.epOpt === sheetStyle;
      o.classList.toggle('is-on', on);
      o.setAttribute('aria-checked', String(on));
    }
  }
  for (const o of opts) {
    press(o, () => {
      const next = o.dataset.epOpt === 'free' ? 'free' : 'pomodoro';
      if (!sheetUp() || next === sheetStyle) return;
      feel('select', 4);
      sheetStyle = next;
      syncOpts();
      // a Pomodoro has a round to set; a free timer runs until you stop
      const h0 = roundBox.offsetHeight;
      roundBox.style.height = 'auto';
      const h1 = next === 'free' ? 0 : roundBox.offsetHeight;
      if (calm) {
        roundBox.style.height = next === 'free' ? '0px' : '';
        return;
      }
      gsap.fromTo(roundBox, { height: h0 }, { height: h1, duration: SPRING.smooth.settle, ease: smooth, onComplete: () => { if (next !== 'free') roundBox.style.height = ''; } });
    });
  }
  press(closeBtn, () => closeSheet());
  // the scrim closes an open sheet; while one is still folding up or tipping away it only absorbs the press
  scrim.addEventListener('click', () => {
    if (sheetPhase === 'open') closeSheet();
  });
  press(goBtn, () => {
    if (!sheetUp()) return;
    style = sheetStyle;
    roundMin = drumCommit() + 5;
    closeSheet();
    startSession();
  });
  // Escape closes the sheet, as it closes any sheet (only while the section is on screen)
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !visible || !sheetUp()) return;
    closeSheet();
  });

  // The drum: AppDial's physics. It follows the finger; a throw coasts on friction (it keeps 12% of
  // its speed after a second) and clicks into the nearest number on the snappy spring once it is slower
  // than 6 numbers a second. Past an end it rubber-bands (0.55, as iOS) with one `limit`. Every number
  // plays a `detent`, every fifth a `detentMajor`, and the caret flares (220 ms). What it drives (the
  // round) settles once, when it comes to rest.
  const STEPS = 55; // 5 to 60 minutes
  const ANGLE = 0.405; // radians round the drum per number
  const RADIUS = 188; // pt: 74pt to the next number, foreshortening beyond
  let drumPos = 20; // index from 5 minutes
  let drumTick = Math.round(drumPos);
  let drumRaf = 0;
  let drumMode: 'idle' | 'drag' | 'coast' | 'snap' = 'idle';
  let vel = 0;
  let snapFrom = 0, snapTo = 0, snapT = 0, snapS = SPRING.snappy, snapEase = snappy, silent = false;
  let limited = false;
  const samples: { t: number; x: number }[] = Array.from({ length: 6 }, () => ({ t: 0, x: 0 }));
  let sampleN = 0;
  let dragX = 0, dragPos = 0, downX = 0, downT = 0;

  const rubber = (over: number) => (1 - 1 / ((over * 0.55) / 12 + 1)) * 12;
  /** Lays the visible numbers round the drum for the current position (nine cells, reused). */
  function paintDrum() {
    const base = Math.round(drumPos);
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i];
      const k = base - 4 + i;
      if (k < 0 || k > STEPS) {
        c.style.opacity = '0';
        continue;
      }
      const d = k - drumPos;
      const a = d * ANGLE;
      if (Math.abs(a) > 1.45) {
        c.style.opacity = '0';
        continue;
      }
      const ad = Math.abs(d);
      const sc = ad <= 1 ? 1 - 0.28 * ad : 0.72 * (Math.cos(a) / Math.cos(ANGLE));
      const op = ad <= 1 ? 1 - 0.3 * ad : Math.max(0, 0.7 * (1 - (ad - 1) / 2.2));
      const txt = String(k + 5);
      if (c.textContent !== txt) c.textContent = txt;
      c.style.opacity = op.toFixed(3);
      c.style.transform = `translateX(calc(${(RADIUS * Math.sin(a)).toFixed(2)} * var(--p))) scale(${sc.toFixed(3)})`;
    }
  }
  function detentCheck() {
    // past an end the number stays the end's, so the rubber band clicks nothing more
    const k = clamp(Math.round(drumPos), 0, STEPS);
    if (k === drumTick) return;
    drumTick = k;
    if (silent) return;
    feel((k + 5) % 5 === 0 ? 'detent_major' : 'detent', 4);
    if (!calm) {
      // the caret flares on each click (AppDial.flare, 220 ms)
      const g = { a: 1 };
      gsap.to(g, { a: 0, duration: 0.22, ease: 'power1.out', onUpdate: () => caretGlow.style.setProperty('--glowA', g.a.toFixed(3)) });
    }
  }
  function drumLoop(now: number) {
    drumRaf = 0;
    const dt = Math.min(0.05, (now - (lastDrum || now)) / 1000) || 1 / 60;
    lastDrum = now;
    if (drumMode === 'coast') {
      // FrictionSimulation(0.12): v(t) = v0 · 0.12^t
      vel *= Math.pow(0.12, dt);
      drumPos += vel * dt;
      if (drumPos < 0 || drumPos > STEPS) {
        if (!limited) { limited = true; feel('limit', 14); }
        settleDrum(clamp(Math.round(drumPos), 0, STEPS), SPRING.snappy);
      } else if (Math.abs(vel) < 6) {
        settleDrum(clamp(Math.round(drumPos + vel * 0.06), 0, STEPS), SPRING.snappy);
      }
    } else if (drumMode === 'snap') {
      snapT += dt;
      drumPos = snapFrom + (snapTo - snapFrom) * snapEase(Math.min(1, snapT / snapS.settle));
      if (snapT >= snapS.settle) {
        drumPos = snapTo;
        drumMode = 'idle';
        silent = false;
        onDrumRest();
      }
    }
    detentCheck();
    paintDrum();
    if (drumMode === 'coast' || drumMode === 'snap') drumRaf = requestAnimationFrame(drumLoop);
  }
  let lastDrum = 0;
  function runDrum() {
    if (!drumRaf) {
      lastDrum = 0;
      drumRaf = requestAnimationFrame(drumLoop);
    }
  }
  function settleDrum(to: number, sp: typeof SPRING.snappy) {
    drumMode = 'snap';
    snapFrom = drumPos;
    snapTo = to;
    snapT = 0;
    snapS = sp;
    snapEase = sp === SPRING.snappy ? snappy : easeOf(sp);
  }
  function drumAnim(to: number, sp: typeof SPRING.snappy, quiet: boolean) {
    silent = quiet;
    drumTick = Math.round(drumPos);
    settleDrum(to, sp);
    runDrum();
  }
  /** Jumps the drum to a number of minutes (no motion). */
  function drumTo(min: number, motion: boolean) {
    const k = clamp(min - 5, 0, STEPS);
    if (motion && !calm) drumAnim(k, SPRING.snappy, false);
    else {
      drumPos = k;
      drumTick = k;
      paintDrum();
    }
  }
  /** The round settles once, when the drum comes to rest. */
  function onDrumRest() {
    limited = false;
    setDrumValue(Math.round(drumPos));
  }
  function setDrumValue(k: number) {
    const v = k + 5;
    drum.setAttribute('aria-valuenow', String(v));
    drum.setAttribute('aria-valuetext', `${v} minutes`);
  }
  /**
   * What the drum says right now, for Start focus pressed while it still moves: a click into a number
   * commits that number, and a drum still coasting (or held) stops where it is, as a finger stops a
   * spinning drum, and clicks into the number under the caret. Either way the committed round and the
   * number the drum comes to rest on are the same. Tried reading the position as it was: a press during
   * a fling committed 29 while the drum went on to rest on 35.
   */
  function drumCommit(): number {
    if (drumMode === 'coast' || drumMode === 'drag') {
      settleDrum(clamp(Math.round(drumPos), 0, STEPS), SPRING.snappy);
      runDrum();
    }
    const k = drumMode === 'snap' ? snapTo : clamp(Math.round(drumPos), 0, STEPS);
    setDrumValue(k);
    return k;
  }
  drum.addEventListener('pointerdown', (e) => {
    e.stopPropagation(); // the drum's drag is the drum's, not the phone's turn
    pressed();
    gsap.ticker.tick();
    drum.setPointerCapture?.(e.pointerId);
    drum.classList.add('is-held');
    drumMode = 'drag';
    holding = true;
    dragX = downX = e.clientX;
    downT = performance.now();
    dragPos = drumPos;
    sampleN = 0;
    limited = false;
  });
  drum.addEventListener('pointermove', (e) => {
    if (drumMode !== 'drag') return;
    const stepPx = 74 * pt;
    let raw = dragPos - (e.clientX - dragX) / stepPx;
    if (raw < 0) {
      if (!limited) { limited = true; feel('limit', 14); }
      raw = -rubber(-raw);
    } else if (raw > STEPS) {
      if (!limited) { limited = true; feel('limit', 14); }
      raw = STEPS + rubber(raw - STEPS);
    }
    drumPos = raw;
    const sm = samples[sampleN % samples.length];
    sm.t = performance.now();
    sm.x = e.clientX;
    sampleN++;
    detentCheck();
    paintDrum();
  });
  const release = (e: PointerEvent) => {
    // the hold ends with the pointer whatever the drum is doing: an arrow key pressed mid-drag hands the
    // drum to a snap, and a stale hold would keep the phone from coming apart for the rest of the visit
    drum.classList.remove('is-held');
    holding = false;
    if (drumMode !== 'drag') return;
    const moved = Math.abs(e.clientX - downX);
    if (moved < 6 && performance.now() - downT < 400) {
      // a tap on a neighbour turns there
      const r = drum.getBoundingClientRect();
      const dx = (e.clientX - (r.left + r.width / 2)) / pt;
      const d = Math.round(Math.asin(clamp(dx / RADIUS, -0.99, 0.99)) / ANGLE);
      drumMode = 'idle';
      drumAnim(clamp(Math.round(drumPos) + d, 0, STEPS), SPRING.snappy, false);
      return;
    }
    // the throw's speed, from the last few samples (numbers per second)
    const n = Math.min(sampleN, samples.length);
    let v = 0;
    if (n >= 2) {
      const a = samples[(sampleN - n) % samples.length];
      const b = samples[(sampleN - 1) % samples.length];
      const dtS = (b.t - a.t) / 1000;
      if (dtS > 0 && performance.now() - b.t < 80) v = -((b.x - a.x) / (74 * pt)) / dtS;
    }
    if (calm || drumPos < 0 || drumPos > STEPS || Math.abs(v) < 6) {
      drumMode = 'snap';
      settleDrum(clamp(Math.round(drumPos), 0, STEPS), SPRING.snappy);
    } else {
      drumMode = 'coast';
      vel = clamp(v, -60, 60);
    }
    runDrum();
  };
  drum.addEventListener('pointerup', release);
  // A cancelled pointer (the browser took a vertical swipe for the page, the sheet closed under a held
  // drag, Escape mid-drag) ends the hold and settles the drum on the nearest number: never a tap, so a
  // scroll that starts on a neighbouring number can never turn the drum to it (Chrome sends a cancel at
  // 0,0, other engines can send the last position).
  const cancel = () => {
    drum.classList.remove('is-held');
    holding = false;
    if (drumMode !== 'drag') return;
    settleDrum(clamp(Math.round(drumPos), 0, STEPS), SPRING.snappy);
    runDrum();
  };
  drum.addEventListener('pointercancel', cancel);
  drum.addEventListener('lostpointercapture', cancel);
  drum.addEventListener('keydown', (e) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0;
    const to = e.key === 'Home' ? 0 : e.key === 'End' ? STEPS : step ? clamp(Math.round(drumPos) + step, 0, STEPS) : null;
    if (to === null || !sheetUp()) return;
    e.preventDefault();
    pressed();
    if (to === Math.round(drumPos) && step) feel('limit', 14);
    drumAnim(to, SPRING.snappy, false);
  });
  paintDrum();

  // ================================================================ the circle: nudge, toast, realtime
  const toastEl = q('[data-ep-toast]');
  const topBar = q('.ept-top');
  const toastText = q('[data-ep-toast-text]');
  const brass = q('[data-ep-brass]');
  const shownNum = q('[data-ep-roll="shown"]');
  const realtime = q('[data-ep-realtime]');
  const dee = q<HTMLButtonElement>('[data-ep-member="dee"]');
  const circleEl = q('[data-ep-circle]');
  /**
   * While a session runs, the ring card is tall and the circle sits under the screen's bottom edge; it
   * rises into view once the session stops. Out of sight, its controls are out of reach (inert): Tab
   * would otherwise land on an invisible Dee and Enter would nudge him unseen. The screen itself is
   * clipped (overflow: clip in the CSS), so a focus can never scroll it either: before, a Tab to Dee
   * scrolled it 196px and left the top bar printed over the day card.
   */
  function syncReach() {
    circleEl.inert = running;
  }
  syncReach();
  // Safari before 16 has no overflow: clip: there a screen that something scrolled is put straight back
  for (const scr of root.querySelectorAll<HTMLElement>('.ep3-scr')) {
    scr.addEventListener('scroll', () => {
      if (scr.scrollTop || scr.scrollLeft) {
        scr.scrollTop = 0;
        scr.scrollLeft = 0;
      }
    }, { passive: true });
  }
  let deeNudged = false;
  let deeShowed = false;
  let toastTimer = 0;
  let toastUp = false;
  let shown = 3;

  /** A member's ring changes in place (gold, turning or dashed), with a small settle so it reads. */
  function setMember(id: string, state: 'active' | 'showed' | 'quiet') {
    const el = q(`[data-ep-member="${id}"]`);
    if (el.classList.contains(`ept-member--${state}`)) return;
    el.classList.remove('ept-member--active', 'ept-member--showed', 'ept-member--quiet');
    el.classList.add(`ept-member--${state}`);
    syncAmbient();
    if (!calm && visible) {
      const r = el.querySelector('.ept-member__ring');
      gsap.fromTo(r, { scale: 0.94 }, { scale: 1, duration: SPRING.bouncy.settle, ease: bouncy, clearProps: 'transform' });
    }
  }
  /**
   * showToast: a glass pill drops 20pt in from the top on the snappy spring with a fade and a slight
   * scale, says one thing, stays 1.6 s and leaves on `base` (250 ms). A new one morphs into the old
   * one's place, and its brass medallion rings.
   */
  function toast(message: string, icon: keyof typeof ICON) {
    window.clearTimeout(toastTimer);
    const swap = () => {
      toastText.textContent = message;
      brass.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON[icon]}</svg>`;
    };
    gsap.killTweensOf(toastEl);
    // the toast drops in over the top bar, as in the app; the bar steps back while it is up, so the
    // wordmark never peeks out round the pill
    topBar.classList.add('is-under');
    if (calm) {
      swap();
      gsap.set(toastEl, { opacity: 1, y: 0, scale: 1, xPercent: -50, x: 0 });
    } else if (toastUp) {
      gsap.to(toastEl, {
        opacity: 0.2, filter: 'blur(8px)', duration: 0.12, ease: 'power1.in',
        onComplete: () => {
          swap();
          gsap.to(toastEl, { opacity: 1, filter: 'blur(0px)', duration: 0.3, ease: 'power2.out', clearProps: 'filter' });
        },
      });
    } else {
      swap();
      gsap.fromTo(toastEl, { xPercent: -50, x: 0, y: -20 * pt, scale: 0.96, opacity: 0 }, { y: 0, scale: 1, opacity: 1, duration: SPRING.snappy.settle, ease: snappy });
    }
    toastUp = true;
    if (!calm) gsap.fromTo(brass, { scale: 1 }, { keyframes: [{ scale: 1.16, duration: 0.12, ease: 'power2.out' }, { scale: 1, duration: SPRING.bouncy.settle, ease: bouncy }], delay: 0.08 });
    toastTimer = window.setTimeout(() => {
      toastUp = false;
      topBar.classList.remove('is-under');
      if (calm) gsap.set(toastEl, { opacity: 0 });
      else gsap.to(toastEl, { y: -20 * pt, scale: 0.96, opacity: 0, duration: 0.25, ease: 'power1.in' });
    }, 1600);
  }
  let nudgedAt = 0;
  press(dee, () => {
    if (deeShowed) return;
    if (deeNudged) {
      // a double click nudges once; only a later press hears "already nudged"
      if (performance.now() - nudgedAt < DOUBLE_CLICK) return;
      feel('tap', 8);
      toast('Already nudged Dee today', 'check');
      return;
    }
    deeNudged = true;
    nudgedAt = performance.now();
    feel('nudge', 14);
    dee.classList.add('is-nudged');
    dee.setAttribute('aria-label', 'Dee, quiet today, nudged');
    toast('Nudged Dee', 'zap');
    // live: Dee answers the nudge a moment later, and the strip changes as it happens
    window.setTimeout(deeShowsUp, 2600);
  });
  /** Someone in the circle showing up, arriving live: colour comes back, the count rolls. */
  function deeShowsUp() {
    deeShowed = true;
    dee.classList.remove('is-nudged');
    setMember('dee', 'showed');
    // aria-disabled, not disabled: a disabled button drops the focus of a keyboard user resting on Dee
    dee.setAttribute('aria-disabled', 'true');
    dee.setAttribute('aria-label', 'Dee, showed up');
    shown += 1;
    setNum(shownNum, String(shown), true, 1);
    if (visible && !document.hidden) {
      feel('success', 14);
      toast('Dee just showed up', 'check');
    }
    if (!calm) {
      gsap.fromTo(realtime, { opacity: 0, x: -6 * pt }, { opacity: 1, x: 0, duration: 0.3, ease: snappy });
      gsap.to(realtime, { opacity: 0, duration: 0.4, delay: 2.2, ease: 'power1.in' });
    }
  }

  // ================================================================ the phone in 3D
  // It turns to face the pointer, and round the screen it comes apart into its layers, each with a word
  // on what it is: from the bezel outwards, on every side, so a pointer heading for the phone from
  // anywhere sees it open up on the way in. Over the screen it stays whole, so everything can be pressed.
  /** Pointer distance past the phone's outer edge (px) at which it is fully apart. */
  const REACH = 84;
  const turn = springOf(640, 0.12);
  const yaw = new Follow(turn, -7);
  const pitch = new Follow(turn, 3);
  // Apart opens on a quicker spring than it closes: a pointer crossing the band on its way to the
  // screen spends a fraction of a second in it, and the layers have to part in that time to be seen;
  // landing on the screen, they come back together on the slower one. Tried one 560 ms spring both
  // ways: at a person's pace (700 px/s) the phone barely parted on the way in.
  const APART_OPEN = springOf(340, 0.08);
  const APART_CLOSE = springOf(560, 0.06);
  const apart = new Follow(APART_CLOSE, 0);
  const asm = new Follow(springOf(700, 0), calm ? 1 : 0);
  let ptrIn = false;
  let holding = false; // a drag on the drum: the phone stays whole and still
  let ptrX = 0, ptrY = 0;
  let dragging = false;
  let dragX0 = 0;
  let raf = 0;
  let lastT = 0;
  let left = false;
  // layout, cached so pointer moves never read it
  let secTop = 0, secLeft = 0, secH = 0, stTop = 0, stLeft = 0, stW = 0, phW = 0, phH = 0, phTop = 0, bz = 0;
  // The star sky is the background, not part of the page (Yanis, 2026-11-08: only the background changes, as if
  // you were not scrolling). Its canvas sits in a one-screen frame (.ep3-sky__pin) that is sticky, so the stars hold
  // still on the screen from just before the switch into this world until the ∞ is centred on the words and the
  // phone, and from then on scroll away with them; the box it sticks inside (.ep3-sky) is sized for exactly that
  // (place(), below). Sticky, not a fixed layer moved by script: the hand-over to the page happens in the
  // compositor, so the formed ∞ cannot trail the words during a fast scroll, as a canvas redrawn at the scroll
  // position can wherever scrolling runs off the main thread (Safari, phones). All in page pixels.
  const skyBox = q('.ep3-sky');
  const pin = q('.ep3-sky__pin');
  let skyLeft = 0;
  let pinH = 0; // the frame's height (100lvh)
  let centred = 0; // the scroll at which the ∞'s centre is mid-screen: everything centred, the frame lets go
  let boxTop = 0; // the scroll from which the frame holds still
  let switchY = NaN; // the switch into this world (backdrops.ts): the star frame holds still from a little above it
  let clearY = -Infinity; // where Vaultt's jobs have left the screen (backdrops.ts; their bottom edge at its top)
  let gatherFrom = Infinity; // where the stars start to rearrange into the ∞ (gatherStart())
  let epShows = Infinity; // where this section's first thing comes up (measure()): reduced motion forms the ∞ there
  // The stars only drift for a breath, this share of a screen, between Vaultt's jobs clearing the screen and their
  // gather into the ∞ (Yanis, 2026-11-09: "the stars before EP are roaming free for just a sec too long. Have them go
  // into the infinity icon basically after passing the job applications"; they used to wait for this section's words,
  // about 500px on a desktop, and then barely moved for a while). A tenth of a screen here, with the pull taking
  // another fifth to show, still read as roaming (2026-11-09 check); the stars' ease out (ep-stars.ts FIELD_EASE) now
  // shows the pull within a tenth of a screen of the jobs.
  const BREATH = 0.03;
  let vh = window.innerHeight;
  window.addEventListener('resize', () => { vh = window.innerHeight; }, { passive: true });
  /** The frame's top on screen at scroll y: coming up until it sticks, then 0, then scrolling away. */
  const pinTop = (y: number) => (y < boxTop ? boxTop - y : y <= centred ? 0 : centred - y);
  /** A point on screen, in the star canvas's own pixels. */
  const skyX = (clientX: number) => clientX - (skyLeft - window.scrollX);
  const skyY = (clientY: number) => clientY - pinTop(window.scrollY);
  let wordsRight = 0;
  let twoColumns = true;
  // the labels need room on the side the layers slide out to (the front ones travel furthest); without
  // it (phones, narrow windows, the words' side at most widths) the layers part without words rather
  // than with clipped or overlapping ones
  let labelRight = true;
  let labelLeft = false;
  const ink = [q('.ep3__l1'), q('.ep3__l2'), q('.ep3__tag')];
  const ctaBtns = Array.from(root.querySelectorAll<HTMLElement>('.ep3__btn'));
  const inkRange = document.createRange();

  function measure() {
    pt = cards.clientWidth / 402 || pt;
    const sr = root.getBoundingClientRect();
    const r = stage.getBoundingClientRect();
    secTop = sr.top + window.scrollY;
    secLeft = sr.left + window.scrollX;
    secH = sr.height;
    skyLeft = secLeft + skyBox.offsetLeft;
    pinH = pin.offsetHeight || window.innerHeight;
    stTop = r.top + window.scrollY;
    stLeft = r.left + window.scrollX;
    stW = r.width;
    phW = phone.offsetWidth;
    phH = phone.offsetHeight;
    phTop = phone.offsetTop;
    bz = cards.offsetLeft;
    // where the words actually end (their lines are full-width blocks, so the ink is measured, not the box)
    let wr = 0;
    for (const el of ink) {
      inkRange.selectNodeContents(el);
      wr = Math.max(wr, inkRange.getBoundingClientRect().right);
    }
    for (const b of ctaBtns) wr = Math.max(wr, b.getBoundingClientRect().right);
    wordsRight = wr + window.scrollX;
    twoColumns = getComputedStyle(grid).gridTemplateColumns.split(' ').length > 1;
    // each label sits past its layer's edge, and fully apart a layer slides out by about half its depth
    let need = 0;
    for (let i = 0; i < tags.length; i++) {
      const t = tags[i];
      if (t) need = Math.max(need, t.offsetWidth + 4 + i * phW * 0.13 * 0.55);
    }
    const pl = r.left + r.width / 2 - phW / 2;
    labelRight = twoColumns && window.innerWidth - (pl + phW) - 16 > need;
    labelLeft = twoColumns && pl - wr - 24 > need;
    // The ∞'s centre in the page: between the words and the phone at the phone's middle (two columns), round the
    // headline (one column, as the swarm's frame below places it). Everything is centred when it is mid-screen.
    const tr = text.getBoundingClientRect();
    const cyPage = twoColumns ? stTop + phTop + phH / 2 : tr.top + window.scrollY + tr.height * 0.42;
    centred = cyPage - pinH / 2;
    // The scroll at which this section first shows: its words' top 5% into the screen, where they start to show (the
    // phone's top layer fades in at about the same scroll on desktop, its box coming up a little earlier, unseen).
    // Reduced motion forms the ∞ there; with motion the stars start for it earlier (gatherStart()).
    epShows = Math.min(centred - 1, tr.top + window.scrollY - 0.95 * pinH);
    gatherStart();
    place();
  }

  /** Where the stars start to pull into the ∞: a breath after Vaultt's jobs have cleared the screen (BREATH), or,
   *  before the backdrops have said where that is, where this section first shows. */
  function gatherStart() {
    gatherFrom = Math.min(centred - 1, Number.isFinite(clearY) ? clearY + BREATH * pinH : epShows);
  }

  /**
   * Sizes the box the star frame sticks inside: from a little above the switch (so scrolling back up, the field
   * fades out while it still holds still) to one frame below the centred scroll, so the frame lets go of the screen
   * exactly as the content is centred on the ∞. Before the backdrops have said where the switch is, a screen and a
   * half above. Writes only when something changed (it is absolutely placed: nothing else moves).
   */
  let placed = '';
  function place() {
    boxTop = Math.min(centred - vh * 0.5, Number.isFinite(switchY) ? switchY - vh * 0.35 : centred - vh * 1.5);
    const top = `${(boxTop - secTop).toFixed(2)}px`;
    const h = `${(centred + pinH - boxTop).toFixed(2)}px`;
    if (top + h === placed) return;
    placed = top + h;
    skyBox.style.top = top;
    skyBox.style.height = h;
  }
  const phoneCX = () => stLeft + stW / 2 - window.scrollX;
  const phoneCY = () => stTop + phTop + phH / 2 - window.scrollY;

  /** Where the pointer wants the phone: turned towards it, apart when it is just off its edge. */
  function aim() {
    if (calm) return;
    if (!ptrIn && !dragging) {
      yaw.target = -7;
      pitch.target = 3;
      apart.target = 0;
      return;
    }
    const dx = ptrX - phoneCX();
    const dy = ptrY - phoneCY();
    const hw = phW / 2;
    const hh = phH / 2;
    if (holding) {
      apart.target = 0;
      return;
    }
    // over the words it only glances at the pointer; it takes the pointer in fully over the last 60px
    // before the gap, so crossing from the words to the phone never jumps
    const g = dragging || !twoColumns ? 1 : smoothstep(wordsRight - window.scrollX - 36, wordsRight - window.scrollX + 24, ptrX);
    // how far past the phone's outer edge the pointer is (negative over it): the layers start parting
    // at the screen's edge and are fully apart REACH px out, on whichever side the pointer is
    const ox = Math.abs(dx) - hw;
    const oy = Math.abs(dy) - hh;
    const out = ox > 0 && oy > 0 ? Math.hypot(ox, oy) : Math.max(ox, oy);
    const a = smoothstep(-bz, REACH, out) * g;
    let yw = clamp(dx / (hw + 240), -1, 1) * 30;
    // a stack seen face on reads as one phone, so apart it keeps a three-quarter turn (towards the pointer)
    const bias = 16 * a * clamp(dx / (hw * 0.6), -1, 1);
    if (Math.abs(bias) > Math.abs(yw)) yw = bias;
    yaw.target = lerp(clamp(dx / 900, -1, 1) * 12, yw, g);
    pitch.target = lerp(clamp(-dy / 700, -1, 1) * 6, clamp(-dy / (hh + 180), -1, 1) * 10, g);
    apart.target = a;
  }
  function kick() {
    if (!raf && visible) {
      lastT = 0;
      raf = requestAnimationFrame(loop);
    }
  }
  function loop(now: number) {
    raf = 0;
    const dt = lastT ? Math.min(0.05, (now - lastT) / 1000) : 1 / 60;
    lastT = now;
    aim();
    apart.spring = apart.target > apart.x ? APART_OPEN : APART_CLOSE;
    const m1 = yaw.step(dt), m2 = pitch.step(dt), m3 = apart.step(dt), m4 = asm.step(dt);
    paintPhone();
    if (!ignited && asm.x > 0.96 && running) ignite();
    if ((m1 || m2 || m3 || m4) && visible) raf = requestAnimationFrame(loop);
  }
  /** Writes the turn and the depth: transforms and opacity only. */
  function paintPhone() {
    const a = asm.x;
    const off = 1 - a;
    const y = yaw.x - 30 * off;
    const p = pitch.x + 16 * off;
    const e = apart.x + 1.9 * off;
    phone.style.transform = `translate3d(0, ${(70 * off).toFixed(2)}px, 0) rotateX(${p.toFixed(3)}deg) rotateY(${y.toFixed(3)}deg)`;
    const gap = phW * 0.13;
    const shownEdge = smoothstep(0.12, 0.6, e).toFixed(3);
    // the labels hang on the side the stack fans out to; near face on they fade, so swapping sides
    // (the pointer passing over or under the phone) never shows them jump. They are fully there once the
    // layers have visibly parted (about 40px off the bezel). Tried them full only near fully apart
    // (0.38 to 0.85): a pointer resting just off the phone, where people actually hover, saw them at 40%.
    const lab = (left ? labelLeft : labelRight) ? smoothstep(0.2, 0.55, apart.x) * a * smoothstep(2, 9, Math.abs(y)) : 0;
    const labOp = lab.toFixed(3);
    const labX = `translateX(${((1 - lab) * (left ? 8 : -8)).toFixed(2)}px)`;
    // plain loops: this runs every frame of a turn, so it builds no closures
    for (let i = 0; i < layers.length; i++) {
      const l = layers[i];
      l.style.transform = `translate3d(0, 0, ${(i * (1.5 + e * gap)).toFixed(2)}px)`;
      // assembling: the layers arrive from the back to the front
      if (off > 0.001) l.style.opacity = smoothstep(0.02 + i * 0.07, 0.32 + i * 0.07, a).toFixed(3);
      else if (l.style.opacity) l.style.opacity = '';
      const ed = edges[i];
      if (ed) ed.style.opacity = shownEdge;
      const t = tags[i];
      if (t) {
        t.style.opacity = labOp;
        t.style.transform = labX;
      }
    }
    const nowLeft = y < -2;
    if (nowLeft !== left) {
      left = nowLeft;
      phone.classList.toggle('is-left', left);
    }
    glare.style.transform = `translateX(${(y * 1.4).toFixed(2)}%)`;
    glare.style.opacity = (1 - smoothstep(0.1, 0.5, e)).toFixed(3);
  }

  // the pointer, read once per frame
  root.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') {
      if (dragging) {
        // a thumb travels less than a mouse: a 90px drag is most of the way apart
        ptrX = phoneCX() + (e.clientX - dragX0) * 2.2;
        ptrY = phoneCY();
        kick();
      }
      return;
    }
    ptrIn = true;
    ptrX = e.clientX;
    ptrY = e.clientY;
    stars.pointer(skyX(e.clientX), skyY(e.clientY), true);
    wake();
    kick();
  }, { passive: true });
  root.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'touch') return;
    ptrIn = false;
    stars.pointer(0, 0, false);
    kick();
  });
  // A wheel or keyboard scroll moves the phone under a pointer that stays still, and no pointermove
  // follows (Chrome only sends the boundary events after a scroll). The turn, the explode and the
  // swarm's parting are aimed again from where the pointer now sits; one that the section scrolled out
  // from under has left. Before, all three held their last pose until the mouse moved.
  window.addEventListener('scroll', () => {
    if (!visible || !ptrIn || dragging) return;
    const top = secTop - window.scrollY;
    if (ptrY < top || ptrY > top + secH) {
      ptrIn = false;
      stars.pointer(0, 0, false);
    } else {
      stars.pointer(skyX(ptrX), skyY(ptrY), true);
    }
    kick();
  }, { passive: true });
  // a finger: drag sideways on the phone or round it to turn it and take it apart; let go and it springs back
  stage.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch' || calm) return;
    dragging = true;
    dragX0 = e.clientX;
    ptrX = phoneCX();
    ptrY = phoneCY();
    wake();
  }, { passive: true });
  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    kick();
  };
  window.addEventListener('pointerup', endDrag, { passive: true });
  window.addEventListener('pointercancel', endDrag, { passive: true });
  // a tap on the sky sends a ring through the swarm
  root.addEventListener('pointerdown', (e) => {
    const t = e.target as Element;
    if (t.closest('a, button, .ep3-phone')) return;
    stars.ripple(skyX(e.clientX), skyY(e.clientY));
    wake();
  }, { passive: true });

  // ================================================================ the star ∞
  const canvas = q<HTMLCanvasElement>('.ep3-sky__stars');
  // the outline's reach past its line (the line and its close glow): what is kept clear round the ∞
  const GLOW = 12;
  /**
   * Where the ∞ sits, in the canvas's own pixels, read on every layout after measure() has run. The frame holds
   * still while the ∞ forms and lets go of the screen just as the content is centred on it (place()), so the ∞
   * forms mid-frame and the words and the phone scroll up into it. The loops' half height is 0.425 of the ∞'s half
   * width (ep-stars.ts: 0.354, the curve's, filled out 1.2), and its half width is 0.42 of `w` (A.span 0.84 over
   * two), so w = half / 0.42.
   */
  function starFrame() {
    const cr = canvas.getBoundingClientRect();
    const tr = text.getBoundingClientRect();
    const W = cr.width;
    if (twoColumns) {
      // The words in the left loop, the phone in the right one, crossing in the gap between them so the crossing
      // shows (centred between the words' middle and the phone's, it sat under the phone's left edge): as tall as
      // the words, past both, and inside the screen.
      const phL = stLeft + stW / 2 - phW / 2 - skyLeft;
      const cx = (wordsRight - skyLeft + phL) / 2;
      const need = Math.max(cx - (tr.left - cr.left) + 40, phL + phW - cx + 60, (tr.height / 2 + 24) / 0.425);
      const half = Math.max(200, Math.min(need, cx - 16, W - cx - 16));
      return { cx, cy: cr.height / 2, w: half / 0.42 };
    }
    // One column: fitted to the screen, in the open band above the words when everything is centred (measure() puts
    // the words' 42% line mid-screen then): under the site nav, and under Vaultt's last job card, which on a phone is
    // still leaving the top of the screen then (its bottom edge is clearY - centred down), so the ∞ never sits behind
    // it. Round the headline, a screen and a fifth wide, its loops ran off both edges and its crossing sat in the
    // words' shade: nothing of it read.
    const top = cr.height / 2 - 0.42 * tr.height - 16;
    const lim = Math.max(72, Number.isFinite(clearY) ? clearY - centred + 8 : 0) + GLOW;
    const half = Math.max(70, Math.min(W / 2 - 18, (top - lim) / (2 * 0.425)));
    return { cx: W / 2, cy: (lim + top) / 2, w: half / 0.42 };
  }
  const stars = createStars(canvas, {
    count: fine && window.innerWidth > 900 ? 2100 : 1100,
    still: calm,
    frame: starFrame,
    // before the gather the stars are a sky over the whole screen, a little past its edges (calm too: a still sky for
    // the stars-only beat, then the ∞ formed)
    field: () => {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      return { x: -w * 0.04, y: -h * 0.04, w: w * 1.08, h: h * 1.08 };
    },
  });

  // ================================================================ arriving: the hand-over from Vaultt
  const words = Array.from(root.querySelectorAll<HTMLElement>('[data-ep-word]'));
  const ins = Array.from(root.querySelectorAll<HTMLElement>('[data-ep-in]'));
  const markPath = q<SVGPathElement>('.ep3__mark-path');
  const markSpark = q<SVGPathElement>('.ep3__mark-spark');
  /**
   * The welcome screen's opening, for the words (AppIntro): each rises 14pt and sharpens from a
   * 10px blur, in the app's order (wordmark, line, ways in). The ∞ draws itself first and a spark
   * runs once through it. Paused: the scroll moves it, as the headline comes up (Yanis, 2026-11-08:
   * nothing on the page plays at its own pace; it used to play once, in about 1.9 s, when the
   * headline came into view).
   */
  function introTimeline() {
    const tl = gsap.timeline({ paused: true });
    tl.fromTo(markPath, { strokeDasharray: 100, strokeDashoffset: 100 }, { strokeDashoffset: 0, duration: 0.9, ease: 'power2.inOut' }, 0);
    tl.fromTo(markSpark, { strokeDasharray: '7 93', strokeDashoffset: 0, opacity: 0 }, { strokeDashoffset: -100, opacity: 1, duration: 1.1, ease: 'power1.inOut' }, 0.75);
    tl.to(markSpark, { opacity: 0, duration: 0.25 }, 1.65);
    const el = (x: Element, at: number) => tl.fromTo(x, { opacity: 0, y: 14, filter: 'blur(10px)' }, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.62, ease: 'power3.out', clearProps: 'filter,transform' }, at);
    words.forEach((w, i) => el(w, 0.1 + i * 0.1));
    ins.forEach((x, i) => el(x, 0.34 + i * 0.1));
    el(soundBtn, 0.68);
    return tl;
  }

  // ================================================================ visibility, layout, start
  function setVisible(on: boolean) {
    if (on) {
      // (touch: once the scroll rests, onRest)
      if (!touch) wake();
      else if (!scrolling) {
        window.clearTimeout(restT);
        restT = window.setTimeout(onRest, 150);
      }
      schedule();
      kick();
      if (soundOn) audio.resume();
    } else {
      sleepNow();
      window.clearTimeout(tick);
      audio.suspend();
    }
  }
  const io = new IntersectionObserver(([en]) => {
    visible = en.isIntersecting;
    setVisible(visible && !document.hidden);
  }, { threshold: 0 });
  io.observe(root);
  // The sounds are fetched and decoded on the first sign of a visitor reaching for the demo: a pointer over the
  // section, a touch, or keyboard focus inside it (Yanis, 2026-11-07, Q1). They used to load as the section came
  // within 900px, so every visit that scrolled past paid 16 files and their decoding without a single press. A
  // press that beats the decode still plays if its sound lands within LATE (ep-audio.ts), and unlock() inside
  // the press asks for them too, so a first touch on a phone can only make its own sound late, never wrong.
  const firstReach = () => {
    audio.preload();
    root.removeEventListener('pointerover', firstReach);
    root.removeEventListener('pointerdown', firstReach);
    root.removeEventListener('focusin', firstReach);
  };
  root.addEventListener('pointerover', firstReach, { passive: true });
  root.addEventListener('pointerdown', firstReach, { passive: true });
  root.addEventListener('focusin', firstReach);
  document.addEventListener('visibilitychange', () => {
    setVisible(visible && !document.hidden);
    starsGate();
  });

  // ================================================================ the star sky: shown, gathered, bloomed
  // The swarm runs only while its frame is on screen and its world is showing. The frame is on screen, invisible,
  // from a little above the switch, and before this gate the swarm flowed wherever the section was in view, seen
  // or not (it used to sit behind Vaultt's world for most of its gather).
  let skyOn = false;
  let skyShown = false;
  function starsGate() {
    stars.run(skyOn && skyShown && !document.hidden);
  }
  new IntersectionObserver(([en]) => {
    skyOn = en.isIntersecting;
    starsGate();
  }, { threshold: 0 }).observe(pin);

  // Shown: the field fades in right after the black (backdrops.ts fades it in over 0.5 s) and out before the black
  // lifts again; a compositor fade of the whole frame, so the stars themselves are never dimmed.
  let skyFade: Animation | null = null;
  let skyTo = 0;
  pin.style.opacity = '0';
  pin.style.visibility = 'hidden';
  // Reduced motion: the backdrops show this world at once where Vaultt's jobs start to leave, and the finished ∞ then
  // sat behind them while they scrolled away. It waits (calmAt): until they have left the screen if that happens
  // before everything is centred (desktop), else until their last card has passed above the ∞ (a phone, where they
  // are still leaving as the words reach the middle, and starFrame() keeps the ∞ under that card).
  let skyWant = false;
  let calmAt = -Infinity;
  function calmFrom() {
    if (!Number.isFinite(clearY)) return -Infinity;
    if (clearY <= centred) return clearY;
    const f = starFrame();
    return Math.min(clearY, Math.max(boxTop, clearY - (f.cy - 0.425 * f.w * 0.42 - GLOW)));
  }
  function showSky(on: boolean, instant: boolean) {
    skyWant = on;
    setSky(calm ? on && window.scrollY >= calmAt : on, instant);
  }
  function setSky(on: boolean, instant: boolean) {
    const to = on ? 1 : 0;
    if (to === skyTo && !skyFade && !instant) return;
    const from = skyFade ? Number(getComputedStyle(pin).opacity) : skyTo;
    skyFade?.cancel();
    skyFade = null;
    skyTo = to;
    // the end value sits underneath the animation, so cancelling or finishing it leaves the right opacity
    pin.style.opacity = String(to);
    if (on) {
      skyShown = true;
      pin.style.visibility = '';
      starsGate();
    }
    const done = () => {
      if (on) return;
      skyShown = false;
      pin.style.visibility = 'hidden';
      starsGate();
    };
    const span = Math.abs(to - from);
    if (instant || span < 0.02) {
      done();
      return;
    }
    const a = pin.animate(
      [{ opacity: from }, { opacity: to }],
      on
        ? { duration: 640 * span, delay: 220, easing: 'cubic-bezier(0.3, 0.5, 0.35, 1)', fill: 'backwards' }
        : { duration: 300 * span, easing: 'cubic-bezier(0.45, 0, 0.55, 1)' },
    );
    skyFade = a;
    a.finished
      .then(() => {
        if (skyFade !== a) return;
        skyFade = null;
        done();
      })
      .catch(() => {});
  }

  // Gathered: from a breath after Vaultt's jobs have cleared the screen (gatherFrom; the field just drifting until
  // then) to the centred scroll, the field pulls into the ∞ with the scroll, and this section's words and phone come
  // up into it on the way (it used to start at the switch into this world, under the leaving jobs, and then at the
  // words, the field roaming for most of a screen). Lightly smoothed, about 0.1 s, so a wheel's steps or a jump glide
  // instead of snapping. Calm shows the still field once the jobs have left, then the ∞ formed, at once, where this
  // section first shows (epShows).
  let gT = calm ? 1 : 0;
  let gX = gT;
  let gRaf = 0;
  let gLast = 0;
  function gStep(now: number) {
    gRaf = 0;
    const dt = gLast ? Math.min(0.05, (now - gLast) / 1000) : 1 / 60;
    gLast = now;
    gX += (gT - gX) * (1 - Math.exp(-dt * 10));
    // settled, or the field has just faded out or left the screen: straight to the end (no frames for nobody)
    if (Math.abs(gT - gX) < 5e-4 || !skyOn || !skyShown) gX = gT;
    stars.setGather(gX);
    if (gX !== gT) gRaf = requestAnimationFrame(gStep);
  }
  function gatherTo(t: number) {
    if (t === gT) return;
    gT = t;
    // unseen it goes straight there: nothing to watch glide, and no frames drawn for nobody
    if (!skyOn || !skyShown) {
      if (gRaf) cancelAnimationFrame(gRaf);
      gRaf = 0;
      gX = t;
      stars.setGather(t);
      return;
    }
    if (!gRaf) {
      gLast = 0;
      gRaf = requestAnimationFrame(gStep);
    }
  }

  // Bloomed: the ∞'s outline glow (the gold wash along the curve) appears only once everything is centred (Yanis,
  // 2026-11-08), timed rather than scrubbed; with two columns that is also once the phone has come together (its
  // assembly ends just past the centre). It used to come in with the gather, before anything was in place.
  let asmEnd = -Infinity;
  let bloomAt = Infinity;
  let bloomOn = false;
  const glow = { v: 0 };
  let blTween: { kill(): void } | null = null;
  // (reduced motion: the finished ∞, its outline included, from where this section comes up; onScroll)
  stars.bloom(0);
  let calmFormed = -1;
  function bloomCheck(y: number) {
    if (calm) return;
    const on = bloomOn ? y >= bloomAt - 40 : y >= bloomAt - 2;
    if (on === bloomOn) return;
    bloomOn = on;
    blTween?.kill();
    blTween = null;
    blTween = gsap.to(glow, { v: on ? 1 : 0, duration: on ? 1.2 : 0.45, ease: on ? 'power2.out' : 'power1.in', onUpdate: () => stars.bloom(glow.v) });
  }

  /** Every scroll update: the gather's target and the bloom, or reduced motion's steps (arithmetic only). */
  function onScroll(y: number) {
    if (!calm) {
      gatherTo(clamp((y - gatherFrom) / Math.max(1, centred - gatherFrom), 0, 1));
    } else {
      // Reduced motion: the still field once Vaultt's jobs have left (never behind them), then, from where this
      // section comes up, the ∞ formed with its outline, at once
      const on = skyWant && y >= calmAt;
      if (on !== (skyTo === 1)) setSky(on, true);
      const formed = y >= epShows ? 1 : 0;
      if (formed !== calmFormed) {
        calmFormed = formed;
        stars.setGather(formed);
        stars.bloom(formed);
      }
    }
    bloomCheck(y);
  }

  // The phone's assembly against its stage's scroll progress: the layers arrive (to half assembled) while it comes
  // up, stay apart while it crosses the screen (0.5 to 0.6), and close up as it passes the middle.
  const A_REVEAL = 0.34;
  function asmAt(p: number) {
    // one column: the phone is most of a screen tall, and staying apart for about half a screen with at least half
    // of it on screen needs the later close
    const hold = twoColumns ? 0.8 : 0.86;
    if (p < A_REVEAL) return 0.5 * smoothstep(0, A_REVEAL, p);
    if (p < hold) return 0.5 + (0.1 * (p - A_REVEAL)) / (hold - A_REVEAL);
    return 0.6 + 0.4 * smoothstep(hold, 1, p);
  }

  const relayout = () => {
    measure();
    stars.layout();
    paintPhone();
    bloomAt = twoColumns ? Math.max(centred, asmEnd) : centred;
    calmAt = calm ? calmFrom() : -Infinity;
    onScroll(window.scrollY);
  };
  measure();
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => relayout()).observe(root);
  ScrollTrigger.addEventListener('refresh', relayout);
  if (document.fonts?.ready) document.fonts.ready.then(() => relayout()).catch(() => {});
  ScrollTrigger.create({ start: 0, end: 'max', onUpdate: (s) => onScroll(s.scroll()) });

  if (calm) {
    // the finished section: whole, ignited, words in place, the swarm still (formed from where the section comes up,
    // onScroll)
    asm.x = asm.target = 1;
    ignite();
    relayout();
  } else {
    preIgnite();
    gsap.set([...ins, ...words, soundBtn], { opacity: 0 });
    gsap.set(markPath, { strokeDasharray: 100, strokeDashoffset: 100 });
    // The phone assembles as its stage scrolls in, from the moment its top enters, over a longer stretch than it
    // used to (Yanis, 2026-11-08: "have the app center a bit later in the scroll, so you see the layering for
    // longer"): it comes together a little past the middle of the screen (46%; 40% on one column, see asmAt). It
    // used to end at 'center 56%', still below the middle, with the layers apart for about a sixth of a screen.
    // The words rise in as the headline comes up, with the scroll. Both happen while the stars gather.
    const st = ScrollTrigger.create({
      trigger: stage, start: 'top bottom', end: () => (window.innerWidth <= 900 ? 'center 40%' : 'center 46%'),
      invalidateOnRefresh: true,
      onUpdate: (s) => { asm.target = asmAt(s.progress); kick(); },
      onRefresh: (s) => { asmEnd = s.end; asm.target = asmAt(s.progress); kick(); },
    });
    asmEnd = st.end;
    asm.target = asmAt(st.progress);
    // the words' opening follows the headline from the bottom of the screen to 55% of the way up, either way
    ScrollTrigger.create({ trigger: q('.ep3__h'), start: 'top bottom', end: 'top 55%', scrub: true, animation: introTimeline() });
    relayout();
  }
  paintPhone();
  drawScope(false);

  return {
    /** The switch into this world (page px): the box the stars hold still in starts above it, the gather at it; and
     *  where Vaultt's jobs have left the screen (reduced motion shows the ∞ from there). */
    from(y: number, clear?: number) {
      const c = clear ?? -Infinity;
      if (y === switchY && c === clearY) return;
      const moved = c !== clearY;
      switchY = y;
      clearY = c;
      place();
      // a phone's ∞ sits under the jobs' last card (starFrame), so it moves with where they leave; so does the gather
      if (moved) stars.layout();
      gatherStart();
      calmAt = calm ? calmFrom() : -Infinity;
      onScroll(window.scrollY);
    },
    show: showSky,
  };
}
