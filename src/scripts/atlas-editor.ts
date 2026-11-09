// Motion for the Atlas editor scene (src/components/atlas/Editor.astro).
//
// Phases, after the scene on getatlas.site:
//   explode  the preview turns and its layers stand apart, named (the take, dissected)
//   rewind   back to the raw take: no music, no captions, every retake still in, the timeline zoomed out
//   scan     the playhead watches the take and marks what goes
//   cut      the marked pieces collapse, the duration drops from 2:07 to 0:51, the timeline zooms back in
//   build    music, captions, graphics and sound land; the colour comes up
//   fin      the finished reel plays
//
// mode 'loop'  (homepage): the preview is the Atlas reel built in code (atlas-reel.ts), and the card that flew in
//              already came apart on the way, so there is no explode here. It starts on the posted video,
//              goes back to the raw take, scans it, cuts it, builds it and posts it again, looping only while
//              the editor is on screen.
// mode 'scrub' (case study): pinned, the scroll drives raw → scan → cut → build → explode → fin.
// The status line and the duration are read off the playhead, so scrubbing backwards rewrites them.
// The homepage loop also drives a playback bar under the window (atlas-playbar.ts) and, once an edit is posted,
// the real finished video in the preview (atlas-final.ts), both off the same playhead.
import type { gsap as GsapNS } from 'gsap';
import type { ScrollTrigger as STNS } from 'gsap/ScrollTrigger';
import { createReel, type Reel } from './atlas-reel';
import { mountPlaybar, stagesOf, type Phase, type Playbar } from './atlas-playbar';
import { createFinal, type Final } from './atlas-final';

type Gsap = typeof GsapNS;
type ST = typeof STNS;

export type Editor = {
  tl: gsap.core.Timeline;
  start: () => void;
  stop: () => void;
  seek0: () => void;
  reel: Reel | null;
  /** the preview is showing the real finished video right now (homepage only): the flight's hand-back reads it */
  finShowing: () => boolean;
};

export function mountEditor(
  root: HTMLElement,
  opts: {
    gsap: Gsap;
    ScrollTrigger: ST;
    mode: 'loop' | 'scrub';
    reduced: boolean;
    pin?: HTMLElement;
    scrubEnd?: string;
    /** scrub mode: called with the scroll progress through the pinned edit (0..1) */
    onProgress?: (p: number) => void;
  },
): Editor | null {
  const { gsap, mode } = opts;
  const $ = <T extends Element = HTMLElement>(s: string) => root.querySelector<T & HTMLElement>(s);
  const $$ = (s: string) => Array.from(root.querySelectorAll<HTMLElement>(s));
  const stEl = $('[data-ae-st]');
  const stBox = $('.ae-status');
  const durEl = $('[data-ae-dur]');
  const video = root.querySelector<HTMLVideoElement>('[data-ae-video]');
  const ph = $('[data-ae-ph]');
  const trk = $('.ae-trk--vid');
  const cuts = $$('.ae-c');
  const caps = $$('.ae-cw');
  const gbs = $$('.ae-gb');
  const sxs = $$('.ae-sx');
  const steps = $$('[data-ae-step]');
  const says = $$('[data-ae-say]');
  const capt = $('.ae-capt');
  const gfx = $('.ae-gfx-title');
  const mchip = $('.ae-mchip');
  if (!stEl || !trk || !ph) return null;
  if (opts.reduced) return null; // the markup is already the finished frame

  // where each cut piece starts on the raw take (0..1), so the scan can mark it as the playhead passes
  const RAW = 70;
  const cutAt = cuts.map((c) => Number(c.style.getPropertyValue('--o')) / RAW);

  const T: Record<string, number> = {};
  const PH: Phase[] = [];
  // label: the stage's short name under the homepage's playback bar (the status pill carries the long text)
  const phase = (name: string, at: number, text: string, run: boolean, label?: string) => {
    T[name] = at;
    PH.push([name, text, run, label]);
  };

  const tl = gsap.timeline({ paused: true, defaults: { ease: 'power2.inOut' } });

  /* ---------- the pieces of the story ---------- */
  const explode = (t: number, d = 1.2) =>
    tl.fromTo(root, { '--x': 0, '--dim': 0 }, { '--x': 1, '--dim': 1, duration: d, immediateRender: false }, t);
  const collapse = (t: number, d = 0.8) =>
    tl.fromTo(root, { '--x': 1, '--dim': 1 }, { '--x': 0, '--dim': 0, duration: d, immediateRender: false }, t);

  const rewind = (t: number) => {
    tl.fromTo(root, { '--fin': 1 }, { '--fin': 0, duration: 0.5, immediateRender: false }, t)
      .fromTo(root, { '--mus': 1, '--grade': 1 }, { '--mus': 0, '--grade': 0, duration: 0.6, immediateRender: false }, t + 0.1)
      .fromTo([capt, gfx, mchip], { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.35, immediateRender: false }, t)
      .fromTo([...caps, ...gbs, ...sxs], { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.3, stagger: 0.01, immediateRender: false }, t)
      .fromTo(steps, { '--on': 1 }, { '--on': 0, duration: 0.3, immediateRender: false }, t)
      .fromTo(says, { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.3, immediateRender: false }, t)
      .fromTo(cuts, { '--c': 1, '--mark': 1 }, { '--c': 0, '--mark': 0, duration: 0.7, stagger: 0.03, immediateRender: false }, t + 0.25)
      .fromTo(root, { '--zoom': 1 }, { '--zoom': 0.4, duration: 0.8, immediateRender: false }, t + 0.25);
  };

  // stepEl: the step ticked while the playhead watches the take (the case study's "transcribed the take")
  const scan = (t: number, d = 1.9, stepEl: HTMLElement | null = steps[0] ?? null) => {
    tl.fromTo(ph, { autoAlpha: 0, x: 0 }, { autoAlpha: 1, duration: 0.2, immediateRender: false }, t)
      .fromTo(ph, { x: 0 }, { x: () => trk.offsetWidth, duration: d, ease: 'none', immediateRender: false }, t);
    if (stepEl) tl.fromTo(stepEl, { '--on': 0 }, { '--on': 1, duration: 0.3, immediateRender: false }, t + 0.3);
    cuts.forEach((c, i) => tl.fromTo(c, { '--mark': 0 }, { '--mark': 1, duration: 0.18, ease: 'power1.out', immediateRender: false }, t + cutAt[i] * d));
    tl.to(ph, { autoAlpha: 0, duration: 0.2 }, t + d);
  };

  const cut = (t: number) => {
    tl.fromTo(cuts, { '--c': 0 }, { '--c': 1, duration: 0.55, stagger: 0.06, ease: 'power3.inOut', immediateRender: false }, t)
      .fromTo(root, { '--zoom': 0.4 }, { '--zoom': 1, duration: 0.9, immediateRender: false }, t + 0.35)
      .fromTo(steps[1] ?? {}, { '--on': 0 }, { '--on': 1, duration: 0.3, immediateRender: false }, t + 0.5);
    if (says[0]) tl.fromTo(says[0], { autoAlpha: 0, y: 8 }, { autoAlpha: 1, y: 0, duration: 0.35, immediateRender: false }, t + 0.6);
  };

  const build = (t: number) => {
    tl.fromTo(root, { '--mus': 0 }, { '--mus': 1, duration: 1, ease: 'power1.inOut', immediateRender: false }, t)
      .fromTo(mchip, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3, immediateRender: false }, t + 0.3)
      .fromTo(root, { '--grade': 0 }, { '--grade': 1, duration: 0.9, immediateRender: false }, t + 0.1)
      .fromTo(gbs, { autoAlpha: 0, y: -8 }, { autoAlpha: 1, y: 0, duration: 0.35, stagger: 0.12, ease: 'back.out(1.7)', immediateRender: false }, t + 0.35)
      .fromTo(gfx, { autoAlpha: 0, scale: 0.88 }, { autoAlpha: 1, scale: 1, duration: 0.45, ease: 'back.out(1.6)', immediateRender: false }, t + 0.45)
      .fromTo(caps, { autoAlpha: 0, y: 6 }, { autoAlpha: 1, y: 0, duration: 0.28, stagger: 0.05, immediateRender: false }, t + 0.6)
      .fromTo(capt, { autoAlpha: 0, y: 6 }, { autoAlpha: 1, y: 0, duration: 0.35, immediateRender: false }, t + 0.75)
      .fromTo(sxs, { autoAlpha: 0, scale: 0 }, { autoAlpha: 1, scale: 1, duration: 0.3, stagger: 0.04, ease: 'back.out(2.4)', immediateRender: false }, t + 0.8);
    steps.slice(2, steps.length - 1).forEach((s, i) => tl.fromTo(s, { '--on': 0 }, { '--on': 1, duration: 0.3, immediateRender: false }, t + 0.3 + i * 0.3));
    if (says[1]) tl.fromTo(says[1], { autoAlpha: 0, y: 8 }, { autoAlpha: 1, y: 0, duration: 0.35, immediateRender: false }, t + 0.4);
    if (says[2]) tl.fromTo(says[2], { autoAlpha: 0, y: 8 }, { autoAlpha: 1, y: 0, duration: 0.35, immediateRender: false }, t + 1);
  };

  // the finished video takes over from the stacked layers. Its own title and caption are not the overlay graphic's
  // and the caption layer's (another size, another place), so the title and caption cut away first, and a beat later
  // the edit cuts to the finished video. Cuts, not fades: a cross-fade showed both titles at once ("i built danny an"
  // twice), and a half faded title or a half faded video caption over the face read as a ghost on a still frame
  const fin = (t: number) => {
    tl.fromTo([gfx, capt], { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.001, ease: 'none', immediateRender: false }, t)
      .fromTo(root, { '--fin': 0 }, { '--fin': 1, duration: 0.001, ease: 'none', immediateRender: false }, t + 0.22)
      .fromTo(steps[steps.length - 1] ?? {}, { '--on': 0 }, { '--on': 1, duration: 0.3, immediateRender: false }, t + 0.2);
    if (says[3]) tl.fromTo(says[3], { autoAlpha: 0, y: 8 }, { autoAlpha: 1, y: 0, duration: 0.35, immediateRender: false }, t + 0.3);
  };

  /* ---------- the homepage loop: the reel in the preview, driven through its CSS variables ---------- */
  const reelEl = mode === 'loop' ? root.querySelector<HTMLElement>('[data-reel]') : null;
  const reel: Reel | null = reelEl ? createReel(reelEl, gsap) : null;
  // Each animated variable is set on the smallest element that reads it (README, performance rule 6): set on the
  // editor's root, --zoom and --mus restyled every element of the editor, reel included, on every frame of the
  // rewind, the cut and the build (CDP, phone at 4x CPU: about 330 to 390 ms of style work per second there).
  // The reel's colour and music pill are set on the take's graded picture and on the pill themselves (the flight's
  // hand-back reads them there too, index.astro takeLook); the music waveform's reveal on the waveform; the track's
  // zoom and cuts are plain numbers that paintTrack() below turns into the pieces' transforms.
  const reelPic = reelEl?.querySelector<HTMLElement>('.ar-pic') ?? null;
  const reelMus = reelEl?.querySelector<HTMLElement>('.ar-music') ?? null;
  const musEl = $('.ae-mus');

  /* ---------- the homepage's video track, moved by transforms (review A4; atlas-editor.css explains the layout) ----------
     The zoom (z) and every cut (c0 to c6: 1 closed, 0 open) are tweened as plain numbers on `lane`, and paintTrack()
     turns them into each piece's transform from narrate, writing only what changed. A piece rests k units in (the
     finished edit); open cuts before it push it right, the zoom scales every place and width about the track's start. */
  const lane: Record<string, number> = { z: 1 };
  cuts.forEach((_, j) => (lane[`c${j}`] = 1));
  const laneKeys = Object.keys(lane);
  const geo = (mode === 'loop' ? (Array.from(trk.children) as HTMLElement[]) : []).map((el) => ({
    el,
    inner: el.firstElementChild as HTMLElement | null,
    w: Number(el.style.getPropertyValue('--w')),
    o: Number(el.style.getPropertyValue('--o')),
    k: Number(el.style.getPropertyValue('--k')),
    j: el.classList.contains('ae-c') ? cuts.indexOf(el) : -1,
    tf: '',
    itf: '',
    c: '',
  }));
  // the track's unit in the editor's em (--u0: 1.45 wide, 1.12 on phones), so the transforms are in em like the layout
  // and follow the editor's font size by themselves; read again when a resize may have crossed the phone breakpoint
  let u0 = 1.45;
  const readU0 = () => {
    u0 = parseFloat(getComputedStyle(root).getPropertyValue('--u0')) || 1.45;
  };
  const lastLane: number[] = laneKeys.map(() => NaN);
  const paintTrack = () => {
    let same = true;
    laneKeys.forEach((key, i) => {
      if (lane[key] !== lastLane[i]) {
        lastLane[i] = lane[key];
        same = false;
      }
    });
    if (same) return;
    const z = lane.z;
    let shut = 0; // units taken by the closed part of every cut before this piece
    for (const g of geo) {
      const c = g.j >= 0 ? lane[`c${g.j}`] : 0;
      const x = u0 * (z * (g.o - shut) - g.k);
      const s = g.j >= 0 ? z * (1 - c) : z;
      // at rest (in place, kept at full width, cut closed) no inline transform: the CSS one applies (none for a kept
      // piece, scaleX(0) for a cut one), so the thumbnails are drawn exactly where layout put them
      const rest = Math.abs(x) < 1e-4 && Math.abs(s - (g.j >= 0 ? 0 : 1)) < 1e-4;
      const tf = rest ? '' : `translateX(${x.toFixed(4)}em) scaleX(${s.toFixed(4)})`;
      if (tf !== g.tf) g.el.style.transform = g.tf = tf;
      const itf = Math.abs(z - 1) < 1e-4 ? '' : `scaleX(${(1 / z).toFixed(4)})`;
      if (g.inner && itf !== g.itf) g.inner.style.transform = g.itf = itf;
      if (g.j >= 0) {
        // the cut's label fades as it closes (atlas-editor.css: opacity is --mark times 1 - --c)
        const cv = c.toFixed(3);
        if (cv !== g.c) g.el.style.setProperty('--c', (g.c = cv));
        shut += g.w * c;
      }
    }
  };
  if (geo.length) {
    readU0();
    let rz = 0;
    window.addEventListener('resize', () => {
      if (rz) return;
      rz = requestAnimationFrame(() => {
        rz = 0;
        readU0();
        lastLane.fill(NaN);
        paintTrack();
      });
    });
  }
  // the steps the loop ticks (the idea and the script were done before the take, so they stay ticked)
  const live = steps.filter((s) => s.dataset.aeStep !== 'done');
  const tick = (el: HTMLElement | undefined, t: number) => {
    if (el) tl.fromTo(el, { '--on': 0 }, { '--on': 1, duration: 0.3, immediateRender: false }, t);
  };
  // back to the raw take: the reel loses its words, music, post and colour; the timeline zooms out with every retake back in.
  // The steps untick from the bottom up, one after another, so it reads as a rewind rather than a hard reset.
  // It clears only what the compact markup has (reel, caption chips, music chip, steps, cuts): the loop never calls
  // rewind(), so a layer added to the compact variant later (graphics, sound, the AI's messages) must be cleared here too,
  // or it stays on through "back to your raw take"
  const homeRewind = (t: number) => {
    if (reelEl) {
      // the words and the post leave in one step (the video's overlays are switched, never half faded: a see-through
      // hook over the face read as a ghost on any still frame); the music pill fades and the colour drains
      tl.fromTo(reelEl, { '--ow': 1, '--op': 1 }, { '--ow': 0, '--op': 0, duration: 0.001, ease: 'none', immediateRender: false }, t)
        .fromTo(reelMus, { '--om': 1 }, { '--om': 0, duration: 0.45, immediateRender: false }, t)
        .fromTo(reelPic, { '--grade': 1 }, { '--grade': 0, duration: 0.75, immediateRender: false }, t + 0.1);
    }
    tl.fromTo(musEl, { '--mus': 1 }, { '--mus': 0, duration: 0.6, immediateRender: false }, t + 0.1)
      .fromTo(mchip, { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.35, immediateRender: false }, t)
      .fromTo(caps, { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.3, stagger: { each: 0.04, from: 'end' }, immediateRender: false }, t)
      .fromTo(live, { '--on': 1 }, { '--on': 0, duration: 0.25, stagger: { each: 0.08, from: 'end' }, immediateRender: false }, t)
      .fromTo(cuts, { '--mark': 1 }, { '--mark': 0, duration: 0.7, stagger: 0.03, immediateRender: false }, t + 0.25)
      // every retake opens again (one number per cut, staggered like the old per-piece tween) and the track zooms out:
      // numbers on `lane`, painted as transforms by paintTrack()
      .fromTo(lane, { z: 1 }, { z: 0.4, duration: 0.8, immediateRender: false }, t + 0.25);
    cuts.forEach((_, j) => tl.fromTo(lane, { [`c${j}`]: 1 }, { [`c${j}`]: 0, duration: 0.7, immediateRender: false }, t + 0.25 + j * 0.03));
  };
  const homeCut = (t: number) => {
    cuts.forEach((_, j) => tl.fromTo(lane, { [`c${j}`]: 0 }, { [`c${j}`]: 1, duration: 0.55, ease: 'power3.inOut', immediateRender: false }, t + j * 0.06));
    tl.fromTo(lane, { z: 0.4 }, { z: 1, duration: 0.9, immediateRender: false }, t + 0.35);
    tick(live[0], t + 0.5);
  };
  // the edit lands on the reel in the order Atlas makes it: music and colour, then the words, with the captions on the
  // timeline. The words are switched on at WORDS, the moment the reel starts over (narrate restarts it at the 'words'
  // phase), so the hook pops in from nothing and the captions come word by word; until then the camera holds still (no
  // punch-ins), so the restart's wide first shot follows on without a jump.
  // WORDS is 1.1 s into the build so the post (8.7) comes 1.2 s into the restarted reel: still its first, wide shot (its
  // first punch-in is at 1.25 s, atlas-reel.ts), the real video's own framing, so the dissolve to the video changes no
  // framing (review A2). At 0.5 the post came 1.8 s in, on a punch-in of 1.2x, and the cut to the wide video popped
  const WORDS = 1.1;
  const homeBuild = (t: number) => {
    if (reelEl) {
      tl.fromTo(reelMus, { '--om': 0 }, { '--om': 1, duration: 0.4, immediateRender: false }, t)
        .fromTo(reelPic, { '--grade': 0 }, { '--grade': 1, duration: 0.9, immediateRender: false }, t + 0.1)
        .fromTo(reelEl, { '--ow': 0 }, { '--ow': 1, duration: 0.001, ease: 'none', immediateRender: false }, t + WORDS);
    }
    tl.fromTo(musEl, { '--mus': 0 }, { '--mus': 1, duration: 1, ease: 'power1.inOut', immediateRender: false }, t)
      .fromTo(mchip, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3, immediateRender: false }, t + 0.3)
      // the caption chips arrive with the words on the reel, not before them
      .fromTo(caps, { autoAlpha: 0, y: 6 }, { autoAlpha: 1, y: 0, duration: 0.28, stagger: 0.06, immediateRender: false }, t + WORDS + 0.05);
    tick(live[1], t + 0.3);
    tick(live[2], t + WORDS + 0.1);
  };
  // the post: the reel's own post chips (the views pill, the heart rail) switch on just after the 250 ms dissolve to
  // the real video, so they only ever show when the video could not take over (the reel stays then); switched on at the
  // post itself, they popped in over the dissolve and faded straight out with it
  const homePost = (t: number) => {
    if (reelEl) tl.fromTo(reelEl, { '--op': 0 }, { '--op': 1, duration: 0.001, ease: 'none', immediateRender: false }, t + 0.3);
    tick(live[4], t + 0.2);
  };

  /* ---------- the order ---------- */
  if (mode === 'loop') {
    // The posted stage is the real finished video, played once, whole: from the post to the end of the lap and on
    // across the wrap through the 2 s hold, so it lasts exactly the video's length (data-dur, 9.6 s). It was 4.7 s,
    // so the video always stopped at its first sentence and its STEP 1 panel and closing graphics never showed
    // (review A1). The hold is also where a landing starts: 2 s of the reel the card flew in as, then the edit (the
    // video cannot show there: it would have to start mid way, and swapping it in at the landing swapped the hook
    // card for the video's own captions the moment the card landed). Everything else in the lap is unchanged, so the
    // edit still comes 2 s after a landing; one lap is 16.3 s
    const HOLD = 2;
    const POST = 8.7;
    const finDur = Number(root.querySelector<HTMLElement>('[data-ae-final]')?.dataset.dur) || 0;
    const lap = POST + Math.max(2.7, finDur - HOLD); // 2.7: the old posted stretch, when there is no video to wait for
    phase('hold', 0, 'posted to your accounts', false, 'posted');
    phase('rewind', 2, 'back to your raw take', true, 'rewind');
    homeRewind(2);
    phase('scan', 3.1, 'watching your take', true, 'scan');
    scan(3.1, 1.9, null);
    phase('cut', 5.1, 'cutting retakes and silences', true, 'cut');
    homeCut(5.1);
    phase('build', 6.4, 'adding music, captions and graphics', true, 'build');
    homeBuild(6.4);
    phase('words', 6.4 + WORDS, 'adding music, captions and graphics', true, 'build');
    phase('check', 8, 'checking the whole edit', true, 'check');
    tick(live[3], 8.1);
    phase('post', POST, 'posted to your accounts', false, 'posted');
    homePost(POST);
    tl.set({}, {}, lap); // let the posted video play out before the next take apart (pads the lap to its length)
    tl.repeat(-1);
  } else {
    // start from the raw take
    gsap.set(root, { '--fin': 0, '--mus': 0, '--grade': 0, '--zoom': 0.4, '--x': 0, '--dim': 0 });
    gsap.set([capt, gfx, mchip, ...caps, ...gbs, ...sxs, ...says], { autoAlpha: 0 });
    gsap.set(steps, { '--on': 0 });
    gsap.set(cuts, { '--c': 0, '--mark': 0 });
    phase('raw', 0, 'your take is in', false);
    phase('scan', 0.4, 'watching your take', true);
    scan(0.4, 2.2);
    phase('cut', 2.8, 'cutting retakes and silences', true);
    cut(2.8);
    phase('build', 4.2, 'adding music, captions and graphics', true);
    build(4.2);
    phase('explode', 6, 'every layer, placed for you', true);
    explode(6, 1.4);
    tl.to({}, { duration: 1 }, 7.4);
    phase('fin', 8.4, 'your edit is ready', false);
    collapse(8.4, 0.9);
    fin(8.9);
    tl.to({}, { duration: 0.8 }, 9.7);
  }

  /* ---------- the homepage's playback bar and finished video, both off the same playhead ---------- */
  // the bar's stages come from the phases above; one lap is tl.duration() (repeat(-1) leaves it at one iteration)
  const playEl = mode === 'loop' ? root.querySelector<HTMLElement>('[data-ae-play]') : null;
  let bar: Playbar | null = null;
  if (playEl) {
    const { stages, origin } = stagesOf(PH, T, tl.duration());
    bar = mountPlaybar(playEl, stages, origin, tl.duration());
  }
  const monEl = root.querySelector<HTMLElement>('[data-ae-mon]');
  const finEl = mode === 'loop' ? root.querySelector<HTMLVideoElement>('[data-ae-final]') : null;
  // the video calls media() (below) whenever it starts or stops showing, so the reel under it pauses and resumes
  const final: Final | null = finEl && monEl ? createFinal(finEl, monEl, () => media()) : null;
  let finPhase = '';

  /* ---------- narration: read the phase and the duration off the playhead ---------- */
  let lastText = '';
  let lastDur = '';
  // whole seconds first, then minutes and seconds (rounding the seconds part alone showed "0:60" for 59.5 to 60 s)
  const fmt = (s: number) => {
    const r = Math.round(s);
    return `${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')}`;
  };
  // the take's real lengths in seconds, finished and raw, from the markup (Editor.astro writes them per variant:
  // 0:41 from 3:42 on the homepage, 0:51 from 2:07 on the case study), so this file holds no copy of them
  const durTo = Number(durEl?.dataset.to) || 51;
  const durFrom = Number(durEl?.dataset.from) || 127;
  const narrate = () => {
    const t = tl.time();
    let cur = PH[0];
    for (const p of PH) if (t >= T[p[0]] - 0.001) cur = p;
    if (cur[1] !== lastText) {
      stEl.textContent = cur[1];
      lastText = cur[1];
    }
    stBox?.classList.toggle('run', cur[2]);
    // the finished length while the finished video shows, the raw length once it is back to the raw take, counting
    // down through the cut. Written only when the text changes (it was rewritten every frame of the loop)
    if (durEl) {
      const raw = mode === 'loop' ? T.rewind : 0;
      let secs = durTo;
      if (t >= raw && t < T.cut) secs = durFrom;
      else if (t >= T.cut && t < T.cut + 0.9) secs = durFrom - (durFrom - durTo) * ((t - T.cut) / 0.9);
      const txt = fmt(secs);
      if (txt !== lastDur) {
        durEl.textContent = txt;
        lastDur = txt;
      }
    }
    // the finished video (the case study only: the homepage's preview is the reel built in code, and its loop has no
    // fin or explode phase, so a loop-mode test here compared against undefined and could never be true)
    if (video && mode === 'scrub') {
      const finShowing = t >= T.fin;
      const want = onScreen && finShowing;
      if (want && video.paused) video.play().catch(() => {});
      else if (!want && !video.paused) video.pause();
    }
    // the homepage's finished video: warmed up during the cut (Safari only buffers a video that plays), shown as the
    // edit is posted (a 250 ms dissolve, atlas-editor.css), kept across the loop's wrap (the posted stage is one
    // stretch, the video's length: the end of the lap, then 2 s at its start), gone as it goes back to the raw take.
    // On phase changes only. Before the reel below, so on the post's own frame the reel already knows the video is
    // coming (its camera hold must not let go for a frame)
    if (final && cur[0] !== finPhase) {
      if (cur[0] === 'cut') final.warm();
      else if (cur[0] === 'post') final.post();
      else if (cur[0] === 'rewind') final.unpost();
      finPhase = cur[0];
    }
    // the homepage reel: no punch-ins while it is the raw take (until the words land), and the video starts over as
    // the words land. Read off the playhead (not callbacks), so a seek or the loop wrapping can never leave it in the
    // wrong state.
    // When the real video will take over at the post (ready() as the words land: loaded and parked on frame one), the
    // camera goes on holding the wide shot through the build and the post until the video has dissolved in over it:
    // the video is that same wide shot, so the dissolve changes the picture, never the framing. Otherwise (still
    // loading, refused, no video) the punch-ins come back with the words, as before
    if (reel) {
      if (cur[0] === 'words' && lastPhase !== 'words') {
        reel.restart();
        holdWide = final?.ready() ?? false;
      }
      const rawTake = t >= T.rewind && t < T.words;
      const raw = rawTake || (holdWide && ((t >= T.words && t < T.post) || (final?.showing() ?? false)));
      if (raw !== wasRaw) reel.el.classList.toggle('is-raw', (wasRaw = raw));
      // on the raw take the reel's timeline only moves hidden things, and it starts over as the words land: frozen
      // there (its CSS loops, the music bars and the drift, go on)
      reel.hold(rawTake);
      // the music pill is gone from the moment the rewind has faded it (0.45 s) until the build brings it back: its
      // bars' CSS loop stops meanwhile (atlas-reel.css .is-mute; 18 bars restyled every frame for a pill nobody sees)
      const mute = t >= T.rewind + 0.45 && t < T.build;
      if (mute !== wasMute) reel.el.classList.toggle('is-mute', (wasMute = mute));
      lastPhase = cur[0];
    }
    // the bar: the hold after a landing is its lead-in (it waits, empty) until the playhead runs into the rewind;
    // after that the hold is the posted video's last 2 s and the bar shows it as such
    if (bar) {
      if (lead && prevT < T.rewind && t >= T.rewind) lead = false;
      prevT = t;
      bar.update(t, lead);
    }
    // the homepage's track: its pieces follow the zoom and the cuts (writes only when they changed)
    if (geo.length) paintTrack();
  };
  let wasRaw = false;
  let wasMute = false;
  let lastPhase = '';
  let holdWide = false;
  // lead: the bar's lead-in is on (the timeline starts on the hold, and every landing seeks back to it); prevT: the
  // playhead at the last narrate, so the lead-in ends when the playhead crosses into the rewind, not merely when a
  // stopped playhead is read past it
  let lead = true;
  let prevT = 0;
  tl.eventCallback('onUpdate', narrate);

  let onScreen = false;
  let running = false;
  // The status spark's CSS spin keys off this class (atlas-editor.css): the timeline pauses off screen but the
  // status keeps .run, and a running CSS animation keeps the whole page rendering every frame. Any part of the
  // editor on screen counts, in both modes (the scrub mode's own onScreen is the pin's range, not visibility).
  // The same moment is "near" for the finished video: it starts to download then, never at page load
  const vis = new IntersectionObserver(([e]) => {
    root.classList.toggle('is-onscreen', e.isIntersecting);
    if (e.isIntersecting) final?.attach();
  });
  vis.observe(root);
  // the reel and the finished video follow the editor: they play only while it runs and is on screen, and the reel
  // also stands still while the video covers it (its punch-ins and CSS loops would keep drawing under it)
  function media() {
    const go = running && onScreen;
    if (reel) {
      if (go && !final?.live()) reel.play();
      else reel.pause();
    }
    final?.run(go);
  }
  const start = () => {
    running = true;
    if (onScreen) tl.play();
    media();
  };
  // stop: the flight has taken the card back (index.astro). The next start is a landing, which begins on the hold, so
  // the bar goes back to its lead-in now: it fades out and in again with the title bar (--tb) already empty, instead
  // of fading in frozen mid lap and jumping to empty the moment the card lands
  const stop = () => {
    running = false;
    tl.pause();
    video?.pause();
    media();
    if (bar) {
      lead = true;
      prevT = tl.time();
      bar.update(prevT, true);
    }
  };

  if (mode === 'scrub') {
    tl.progress(0);
    opts.ScrollTrigger.create({
      trigger: opts.pin ?? root,
      start: 'top top',
      end: opts.scrubEnd ?? '+=260%',
      pin: true,
      scrub: 0.6,
      animation: tl,
      onToggle: (self) => {
        onScreen = self.isActive;
        narrate();
      },
      onUpdate: (self) => opts.onProgress?.(self.progress),
    });
    onScreen = false;
    narrate();
  } else {
    const io = new IntersectionObserver(([e]) => {
      onScreen = e.isIntersecting;
      if (onScreen && running) {
        tl.play();
      } else {
        tl.pause();
        video?.pause();
      }
      media();
      narrate();
    }, { threshold: 0.2 });
    io.observe(root);
  }

  // seek(0) suppresses onUpdate, so narrate by hand: the status, the duration, the raw-take state and the bar must
  // already be right on the frame the flying card hands over. A landing starts on the card's own reel: the posted
  // stretch right after it keeps the reel the card flew in as, so the hand-over stays unseen (the video would swap
  // the hook card and the captions for its own the moment it landed), and the real video takes over from the first
  // post the visitor sees being made
  const seek0 = () => {
    final?.unpost();
    finPhase = 'hold';
    holdWide = false;
    lead = true;
    prevT = 0;
    tl.seek(0);
    narrate();
  };
  return { tl, start, stop, seek0, reel, finShowing: () => final?.live() ?? false };
}
