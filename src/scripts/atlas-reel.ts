// Motion for the Atlas reel (src/components/atlas/AtlasReel.astro), the short-form video built in code.
//
// One GSAP timeline per reel, 7.2 s, looping: five shots joined by hard cuts (punch-ins on the face, a slow
// push inside each shot), the hook popping in, the captions landing word by word, a screen card popping in
// where the hook was, a hit on the music at every cut, and at the end the post getting likes. The overlays on
// the video are switched on and off in one step and move by scale: none is ever half faded over the face. The music bars and
// the handheld drift are CSS loops (compositor only); they pause with the timeline. The markup ships with
// is-paused, so they also stand still before this runs, if it never runs (reduced motion, ?still), and on any copy
// nobody plays.
//
// The homepage runs three copies (the wheel card, the flyer, the editor's preview). Only one plays at a
// time; a hand-over copies the playhead with seek(), so the copies cannot be told apart.
// Hot path: transforms and opacity only, nothing is created per frame.
import type { gsap as GsapNS } from 'gsap';

type Gsap = typeof GsapNS;

export type Reel = {
  el: HTMLElement;
  tl: gsap.core.Timeline;
  play: () => void;
  pause: () => void;
  /** where the playhead is, 0 to REEL_T */
  time: () => number;
  seek: (t: number) => void;
  restart: () => void;
  playing: () => boolean;
  /** freeze the timeline (true) or let it run again (false) while the reel stays playing: its CSS loops (the music
   *  bars, the hand-held drift) go on. The editor holds it on the raw take, where everything the timeline moves is
   *  hidden or held still, and where it restarts the reel anyway as the words land */
  hold: (on: boolean) => void;
};

export const REEL_T = 7.2;

/** Build the reel's timeline on one copy of the markup. It starts paused, on its first frame. */
export function createReel(el: HTMLElement, gsap: Gsap): Reel {
  const q = <T extends Element = HTMLElement>(s: string) => el.querySelector<T & HTMLElement>(s);
  const cam = q('.ar-cam');
  const title = q('.ar-title');
  const broll = q('.ar-broll');
  const wave = q('.ar-wave');
  const heart = q('.ar-heart svg');
  const up = q('.ar-views__up');
  const floaters = Array.from(el.querySelectorAll<HTMLElement>('.ar-heart i'));
  const groups = Array.from(el.querySelectorAll<HTMLElement>('.ar-cg')).map((g) => Array.from(g.querySelectorAll<HTMLElement>('b')));
  const words = groups.flat();

  const tl = gsap.timeline({ paused: true, repeat: -1, defaults: { ease: 'power2.out', immediateRender: false } });
  // a set at 0 for everything that starts hidden, so any seek (or the loop wrapping) renders a clean frame
  tl.set(words, { opacity: 0 }, 0);
  if (broll) tl.set(broll, { autoAlpha: 0 }, 0);
  if (floaters.length) tl.set(floaters, { autoAlpha: 0 }, 0);

  /* ---------- the shots: hard cuts, each with a slow push in (xPercent/yPercent keep the face in frame).
     The camera scales about the face, 59% across and 43% down the frame (atlas-reel.css), so a shot moved by
     x%, y% only still covers the frame while y <= 43 * (s - 1) (top edge), x <= 59 * (s - 1) (left edge) and
     -x <= 41 * (s - 1) (right edge); every shot below keeps a margin. Tried y 6.5 at s 1.07 first (with the old
     take's origin at 36% down) and it opened a sliver at the top. ---------- */
  const shots = [
    { t: 0, s: 1, x: 0, y: 0, d: 1.25 },
    { t: 1.25, s: 1.17, x: 0, y: 1.6, d: 1.3 }, // punch in on the face
    { t: 2.55, s: 1.13, x: -1.5, y: 3.4, d: 1.6 }, // the face drops lower while the screen card sits on top
    { t: 4.15, s: 1.21, x: 1, y: 1.2, d: 1.5 }, // punch in again
    { t: 5.65, s: 1.03, x: 0, y: 0, d: REEL_T - 5.65 }, // wide for the end
  ];
  if (cam) {
    for (const sh of shots) {
      tl.fromTo(cam, { scale: sh.s, xPercent: sh.x, yPercent: sh.y }, { scale: sh.s + 0.035, duration: sh.d, ease: 'none' }, sh.t);
      // every cut lands on the beat: the music jumps
      if (sh.t > 0 && wave) tl.fromTo(wave, { scaleY: 1.8 }, { scaleY: 1, duration: 0.45, ease: 'power3.out' }, sh.t);
    }
  }

  /* ---------- the hook and the screen card take turns, as pops: they grow out of nothing and shrink back into it,
     and they are switched on and off in one step (opacity is never in between). Tried fades first: a hook or a card
     half faded over the face read as a ghost on any still frame, and the two overlapped while one left and the
     other came in. Now the hook is gone (2.58) before the card pops in, and the card is gone (4.08) before the hook
     comes back (4.1). ---------- */
  const show = (el: HTMLElement, t: number, v: 0 | 1) =>
    tl.fromTo(el, { autoAlpha: 1 - v }, { autoAlpha: v, duration: 0.001, ease: 'none' }, t);
  if (title) {
    show(title, 0.02, 1);
    tl.fromTo(title, { scale: 0, yPercent: 0 }, { scale: 1, duration: 0.46, ease: 'back.out(1.9)' }, 0.02)
      .fromTo(title, { scale: 1 }, { scale: 0, duration: 0.22, ease: 'back.in(1.7)' }, 2.36);
    show(title, 2.58, 0);
    show(title, 4.1, 1);
    tl.fromTo(title, { scale: 0 }, { scale: 1, duration: 0.46, ease: 'back.out(1.9)' }, 4.1);
  }
  /* ---------- the screen card: pops in where the hook was, leans, pops out ---------- */
  if (broll) {
    show(broll, 2.6, 1);
    tl.fromTo(broll, { scale: 0, rotation: -14, yPercent: -6 }, { scale: 1, rotation: -3, yPercent: 0, duration: 0.5, ease: 'back.out(1.5)' }, 2.6)
      .fromTo(broll, { rotation: -3 }, { rotation: -1.4, duration: 1.05, ease: 'sine.inOut' }, 3.1)
      .fromTo(broll, { scale: 1, yPercent: 0 }, { scale: 0, yPercent: -4, duration: 0.22, ease: 'back.in(1.6)' }, 3.86);
    show(broll, 4.08, 0);
  }

  /* ---------- the captions: word by word, each group gone on the next cut ---------- */
  const spans: [number, number][] = [[0.2, 1.2], [1.25, 2.47], [2.57, 3.4], [3.45, 4.1], [4.15, 5.56]];
  // Like the hook, every word is switched on in one step and pops by scale; a group cuts away on the next cut (real
  // captions cut, they do not fade: a half faded line read as a ghost on a still frame)
  groups.forEach((g, i) => {
    const [t0, t1] = spans[i] ?? [0, 0];
    g.forEach((w, k) => {
      const t = t0 + k * 0.12;
      tl.fromTo(w, { opacity: 0 }, { opacity: 1, duration: 0.001, ease: 'none' }, t)
        .fromTo(w, { yPercent: 45, scale: 0.78 }, { yPercent: 0, scale: 1, duration: 0.3, ease: 'back.out(2.4)' }, t);
    });
    tl.fromTo(g, { opacity: 1 }, { opacity: 0, duration: 0.001, ease: 'none' }, t1);
  });

  /* ---------- the post: a like lands, hearts float up, the views tick up ---------- */
  if (heart) {
    tl.fromTo(heart, { scale: 1 }, { scale: 1.34, duration: 0.14, ease: 'power2.out' }, 5.85)
      .fromTo(heart, { scale: 1.34 }, { scale: 1, duration: 0.4, ease: 'back.out(3)' }, 5.99);
  }
  floaters.forEach((f, i) => {
    const t = 5.88 + i * 0.16;
    const dx = (i - 1) * 70;
    tl.fromTo(f, { autoAlpha: 0, yPercent: 0, xPercent: 0, scale: 0.4 }, { autoAlpha: 1, yPercent: -150, xPercent: dx * 0.5, scale: 1, duration: 0.42 }, t)
      .fromTo(f, { autoAlpha: 1, yPercent: -150, xPercent: dx * 0.5 }, { autoAlpha: 0, yPercent: -340, xPercent: dx, duration: 0.6, ease: 'power1.in' }, t + 0.42);
  });
  if (up) {
    tl.fromTo(up, { yPercent: 0 }, { yPercent: -28, duration: 0.18, ease: 'power2.out' }, 6.05)
      .fromTo(up, { yPercent: -28 }, { yPercent: 0, duration: 0.42, ease: 'bounce.out' }, 6.23);
  }
  // pad to the loop length, so the wrap lands exactly on REEL_T
  tl.set({}, {}, REEL_T);

  // render every tween once, then come back to the start: from now on any seek draws the right frame
  tl.totalTime(REEL_T - 0.001).totalTime(0);
  el.classList.add('is-paused');

  let on = false;
  let held = false;
  return {
    el,
    tl,
    play() {
      if (on) return;
      on = true;
      el.classList.remove('is-paused');
      if (!held) tl.play();
    },
    pause() {
      if (!on) return;
      on = false;
      el.classList.add('is-paused');
      tl.pause();
    },
    time: () => tl.time(),
    seek(t) {
      tl.time(((t % REEL_T) + REEL_T) % REEL_T);
    },
    restart() {
      tl.time(0);
    },
    playing: () => on,
    // the editor's raw take: the hook, the captions, the screen card and the post are all hidden there (--ow, --op 0)
    // and the camera is held (is-raw), yet the timeline went on writing them every frame (CDP: about a third of the
    // style work of the editor's raw stages on a phone at 4x CPU)
    hold(h) {
      if (held === h) return;
      held = h;
      if (on) {
        if (h) tl.pause();
        else tl.play();
      }
    },
  };
}
