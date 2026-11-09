// The black hole behind the homepage's free stuff act, as a pre-rendered loop (Yanis, 2026-11-08: "a hyper
// optimized, this webpage only, version of a pre-rendered gif that works on mobile and desktop, loads fast and is
// actually 4k"). It replaced the live WebGL ray tracer (black-hole.ts, kept in the repo, no longer loaded).
//
// What plays
// - A seamless 10 s loop rendered offline by scripts/hole/ (render.mjs, encode.mjs): Schwarzschild lensing checked
//   against independently integrated geodesics (geodesic_ref.py), the violent disc, the photon ring and stardust
//   falling in, at native resolution with 24 samples a pixel. Two compositions, both through the live camera at mid
//   drift (elevation 6.5, azimuth 0, roll -0.5): desktop 3840x2160 with the hole at x 0.68, y 0.504 of the frame
//   and a 252 px shadow; phone 1440x3200 with the hole at x 0.5, y 0.298 and a 212 px shadow, margins sized so the
//   parallax below never needs the frame bigger than the layout on 16:9 and 16:10 screens or 19.5:9 to 20:9 phones
//   (phase 1's 266 px frame needed 7.5% more on a 1440x900 screen). Each comes as AV1 (10-bit), HEVC (10-bit,
//   hvc1) and H.264 at full size and at a smaller one (2560x1440, 1080x2400), in /images/hole/ (vercel.json: a
//   day's cache with revalidation), tagged with the sRGB transfer like the poster (with BT.709, Chromium played the
//   dark sky up to 3.7 levels darker than the poster). Landscape screens get the desktop composition, portrait
//   ones the phone one.
// - Which file: navigator.mediaCapabilities.decodingInfo() for each candidate, the first that decodes smoothly AND
//   power-efficiently (hardware) wins, then the first that is merely smooth. AV1 comes first, then HEVC (Safari,
//   and Chrome where the platform decodes HEVC in hardware), then H.264. The smaller files come first when the full
//   size would be shrunk on screen anyway (under 0.72 device pixels per frame pixel: a 1080p monitor at 1x).
//   Without the API, canPlayType's "probably", smaller files first.
// - Placement: the frame is scaled so the shadow has the radius free-act.css lays the words out around (wide
//   screens min(7.8vw, 13vh) at x 0.68, y 0.52; narrow ones min(15.5vw, 8.5vh) at x 0.5, y 0.31; the same rules as
//   black-hole.ts), and placed so the hole lands there. Where the frame would then not cover the screen at every
//   drift (21:9, 4:3, tall desktop windows), it is scaled up until it does, so the hole grows a little there.
// - The scroll's camera drift is now a transform-only parallax on the frame, about the hole's centre: it rises 5%
//   of the screen's height across the act (the live hole did, and the words are laid out for it), turns from -1 to
//   +1 degree and pushes in 4%. Written only when it changes.
// - Loading: nothing until the act is within three screens; then the poster (loop frame 0, AVIF or WebP, the
//   srcset width the frame needs), which covers the CSS drawing (.hole-art) as soon as it is decoded. Within two
//   screens the video's source is chosen and set (preload auto: Chromium buffers it then; Safari only once it
//   plays). It plays only while some of the layer can be seen (free-act.ts: the dome is up and the blueprint's
//   sheet has not covered it) and the tab is visible, and pauses otherwise.
// - The video sits UNDER the poster, at full opacity, and the poster fades out once the video has presented a
//   frame: iOS will not start a muted video that is hidden (atlas-final.ts found the same). Its first frame is the
//   poster's frame, so the fade shows nothing changing.
// - Poster only, for good: reduced motion (and ?still), the data saver, no playable file, a refused play() (iOS
//   Low Power Mode refuses muted autoplay), a decode error after the H.264 retry.
// Finding index: scripts/hole/ (render.mjs, site-media.mjs makes every file), .hole-stage / .hole-poster / .hole-video
// (free-act.css), HoleWorld.astro, data-hole-video on .theme--hole (the file chosen, or none / refused / error).

export type Hole = {
  /** The camera's drift through the act: 0 as the act enters the screen, 1 as it leaves (drives the parallax). */
  setDrift: (v: number) => void;
  /** Whether any of the layer can be seen right now (the page knows its wipes); the video plays only then. */
  setVisible: (on: boolean) => void;
  destroy: () => void;
};

type Variant = { file: string; codec: string; w: number; h: number; kbps: number };
type Comp = {
  name: 'desktop' | 'phone';
  /** full-size frame, the hole's centre as fractions of it, the shadow's radius in its pixels */
  w: number;
  h: number;
  hx: number;
  hy: number;
  r: number;
  full: Variant[];
  small: Variant[];
  /** poster widths: [small, full] */
  posters: [number, number];
};

const DIR = '/images/hole/';
// codec strings: the profiles and levels the encoders wrote (ffprobe), so decodingInfo answers for the real streams;
// kbps: each file's average (scripts/hole/site-media.mjs makes them)
const COMPS: Record<'desktop' | 'phone', Comp> = {
  desktop: {
    name: 'desktop',
    w: 3840,
    h: 2160,
    hx: 0.68,
    hy: 0.504,
    r: 252,
    full: [
      { file: 'hole-desktop-2160-av1.mp4', codec: 'av01.0.12M.10', w: 3840, h: 2160, kbps: 4660 },
      { file: 'hole-desktop-2160-hevc.mp4', codec: 'hvc1.2.4.L150.B0', w: 3840, h: 2160, kbps: 4730 },
      { file: 'hole-desktop-2160-h264.mp4', codec: 'avc1.640033', w: 3840, h: 2160, kbps: 4750 },
    ],
    small: [
      { file: 'hole-desktop-1440-av1.mp4', codec: 'av01.0.12M.10', w: 2560, h: 1440, kbps: 3140 },
      { file: 'hole-desktop-1440-hevc.mp4', codec: 'hvc1.2.4.L150.B0', w: 2560, h: 1440, kbps: 2030 },
      { file: 'hole-desktop-1440-h264.mp4', codec: 'avc1.640032', w: 2560, h: 1440, kbps: 2300 },
    ],
    posters: [1920, 3840],
  },
  phone: {
    name: 'phone',
    w: 1440,
    h: 3200,
    hx: 0.5,
    hy: 0.298,
    r: 212,
    full: [
      { file: 'hole-phone-3200-av1.mp4', codec: 'av01.0.12M.10', w: 1440, h: 3200, kbps: 1850 },
      { file: 'hole-phone-3200-hevc.mp4', codec: 'hvc1.2.4.L150.B0', w: 1440, h: 3200, kbps: 1940 },
      { file: 'hole-phone-3200-h264.mp4', codec: 'avc1.640032', w: 1440, h: 3200, kbps: 1780 },
    ],
    small: [
      { file: 'hole-phone-2400-av1.mp4', codec: 'av01.0.12M.10', w: 1080, h: 2400, kbps: 1830 },
      { file: 'hole-phone-2400-hevc.mp4', codec: 'hvc1.2.4.L150.B0', w: 1080, h: 2400, kbps: 1650 },
      { file: 'hole-phone-2400-h264.mp4', codec: 'avc1.640032', w: 1080, h: 2400, kbps: 1450 },
    ],
    posters: [720, 1440],
  },
};

/** The parallax: rise (share of the screen's height), turn (radians either side of level), push-in (zoom at drift 1). */
const LIFT = 0.05;
const TURN = Math.PI / 180;
const ZOOM = 0.04;
/** Device pixels per full-size frame pixel under which the smaller files go first. */
const SMALL_BELOW = 0.72;

/**
 * Where the frame goes for a W x H screen: its scale (CSS px per frame px) and offset so the hole lands on the
 * layout's spot at drift 0, and the hole's centre inside the frame (the parallax's transform origin). Scales up
 * past the layout's radius only where the frame would otherwise leave a screen corner bare at some drift.
 */
function place(c: Comp, W: number, H: number) {
  const narrow = W < 900;
  const cx = W * (narrow ? 0.5 : 0.68);
  const cy0 = H * (narrow ? 0.31 : 0.52);
  const rs = narrow ? Math.min(W * 0.155, H * 0.085) : Math.min(W * 0.078, H * 0.13);
  const X = c.hx * c.w;
  const Y = c.hy * c.h;
  let s = rs / c.r;
  // each screen corner, relative to the hole at that drift, turned and zoomed back into the frame's own axes, must
  // stay inside the frame; the constraints are monotonic in the drift, so its ends and a few points between do
  for (const d of [0, 0.25, 0.5, 0.75, 1]) {
    const a = TURN * (2 * d - 1);
    const k = 1 + ZOOM * d;
    const cy = cy0 - LIFT * H * d;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    for (const [x, y] of [[0, 0], [W, 0], [0, H], [W, H]]) {
      const dx = x - cx;
      const dy = y - cy;
      const lx = (dx * ca + dy * sa) / k;
      const ly = (-dx * sa + dy * ca) / k;
      s = Math.max(s, lx < 0 ? -lx / X : lx / (c.w - X), ly < 0 ? -ly / Y : ly / (c.h - Y));
    }
  }
  return { s, left: cx - X * s, top: cy0 - Y * s, ox: X * s, oy: Y * s, grow: (s * c.r) / rs };
}

/**
 * The file to play, or null for none (poster only). density: device pixels per full-size frame pixel on this
 * screen. See the file's header for the rules.
 */
async function pick(c: Comp, density: number): Promise<Variant | null> {
  const order = density < SMALL_BELOW ? [...c.small, ...c.full] : [...c.full, ...c.small];
  const mc = navigator.mediaCapabilities;
  const type = (v: Variant) => `video/mp4; codecs="${v.codec}"`;
  if (!mc?.decodingInfo) {
    const probe = document.createElement('video');
    const sm = [...c.small, ...c.full];
    return sm.find((v) => probe.canPlayType(type(v)) === 'probably') ?? sm.find((v) => v.codec.startsWith('avc1') && probe.canPlayType(type(v)) !== '') ?? null;
  }
  const infos = await Promise.all(
    order.map((v) =>
      mc
        .decodingInfo({ type: 'file', video: { contentType: type(v), width: v.w, height: v.h, bitrate: v.kbps * 1000, framerate: 30 } })
        .catch(() => null),
    ),
  );
  const ok = order.map((v, i) => ({ v, info: infos[i] })).filter((o) => o.info?.supported);
  return (ok.find((o) => o.info!.smooth && o.info!.powerEfficient) ?? ok.find((o) => o.info!.smooth))?.v ?? null;
}

/**
 * Starts the loop on the free act's world layer (HoleWorld.astro: .hole-stage with .hole-poster and .hole-video
 * inside .hole-dome__in) and returns its controls, or null when the markup is missing. act: the section whose
 * distance from the screen decides when the poster and the video load. onReady runs once the poster (or the
 * video) covers the CSS drawing.
 */
export function createHoleVideo(layer: HTMLElement, act: HTMLElement, opts: { reduced: boolean; onReady?: () => void }): Hole | null {
  const inner = layer.querySelector<HTMLElement>('.hole-dome__in');
  const stage = layer.querySelector<HTMLElement>('.hole-stage');
  const box = layer.querySelector<HTMLElement>('.hole-poster');
  const video = layer.querySelector<HTMLVideoElement>('.hole-video');
  if (!inner || !stage || !box || !video) return null;
  // the poster's <picture> is made here, not in the markup: until the act is near it has no source to name
  const picture = document.createElement('picture');
  const avif = document.createElement('source');
  avif.type = 'image/avif';
  const img = document.createElement('img');
  img.alt = '';
  img.decoding = 'async';
  picture.append(avif, img);
  box.append(picture);
  video.muted = true;
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  const posterOnly = opts.reduced || conn?.saveData === true;

  let comp: Comp | null = null;
  let fit = place(COMPS.desktop, 1, 1);
  let W = 0;
  let H = 0;
  let drift = 0.5;
  let lastT = '';
  let posterWanted = false;
  let videoWanted = false;
  let visible = false;
  let refused = false;
  let ready = false;
  let variant: Variant | null = null;
  let retried = false;
  let dead = false;

  const markReady = () => {
    if (ready) return;
    ready = true;
    opts.onReady?.();
  };

  // the parallax for the current drift (reduced motion keeps the middle of the act, as the live hole did)
  const paint = () => {
    const d = opts.reduced ? 0.5 : drift;
    const t = `translate3d(0, ${(-LIFT * H * d).toFixed(2)}px, 0) rotate(${(TURN * (2 * d - 1)).toFixed(5)}rad) scale(${(1 + ZOOM * d).toFixed(5)})`;
    if (t === lastT) return;
    lastT = t;
    stage.style.transform = t;
  };

  const loadPoster = () => {
    if (!comp) return;
    const n = comp.name;
    const [a, b] = comp.posters;
    avif.srcset = `${DIR}hole-${n}-${a}.avif ${a}w, ${DIR}hole-${n}-${b}.avif ${b}w`;
    // no src: with one, Chromium fetched the WebP too while it settled on the AVIF source (every browser that
    // plays these videos reads srcset)
    img.srcset = `${DIR}hole-${n}-${a}.webp ${a}w, ${DIR}hole-${n}-${b}.webp ${b}w`;
    // decode() can reject for a source that changed under it; the load event is the fallback
    img.decode().then(markReady, () => img.addEventListener('load', markReady, { once: true }));
  };

  const play = () => {
    if (!visible || document.hidden || refused || !video.src || dead) return;
    const p = video.play();
    p?.catch((e: DOMException) => {
      // a pause() that lands before play() resolves rejects it with AbortError: that is not a refusal
      if (e?.name === 'AbortError') return;
      refused = true;
      layer.dataset.holeVideo = 'refused';
    });
  };

  const loadVideo = async () => {
    if (!comp || posterOnly) return;
    const c = comp;
    const v = await pick(c, fit.s * (devicePixelRatio || 1));
    // the screen turned while the answer was coming: the new composition loads its own
    if (dead || c !== comp) return;
    variant = v;
    layer.dataset.holeVideo = v ? v.file : 'none';
    if (!v) return;
    video.preload = 'auto';
    video.src = DIR + v.file;
    video.load();
    play();
  };

  // the poster fades out over the video once it has presented a frame (requestVideoFrameCallback where there is
  // one: 'playing' can fire before the first frame is on screen)
  const shown = () => {
    if (dead) return;
    layer.classList.add('is-playing');
    markReady();
  };
  const onPlaying = () => {
    const rvfc = (video as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number }).requestVideoFrameCallback;
    if (rvfc) rvfc.call(video, shown);
    else shown();
  };
  // a file that will not decode: the same frame in H.264 once, then the poster for good
  const onError = () => {
    if (dead || !comp || !variant) return;
    const h264 = [...comp.full, ...comp.small].find((x) => x.codec.startsWith('avc1') && x.w === variant!.w);
    if (!retried && h264 && h264 !== variant) {
      retried = true;
      variant = h264;
      layer.dataset.holeVideo = h264.file;
      video.src = DIR + h264.file;
      video.load();
      play();
      return;
    }
    refused = true;
    layer.dataset.holeVideo = 'error';
  };
  video.addEventListener('playing', onPlaying);
  video.addEventListener('error', onError);

  // measured on resize only (README rule 2): the world's box is 100vw x 100vh, so the URL bar never resizes it
  const layout = () => {
    W = inner.offsetWidth || innerWidth;
    H = inner.offsetHeight || innerHeight;
    const next = H > W ? COMPS.phone : COMPS.desktop;
    const turned = comp !== null && next !== comp;
    comp = next;
    fit = place(comp, W, H);
    stage.style.width = `${(comp.w * fit.s).toFixed(2)}px`;
    stage.style.height = `${(comp.h * fit.s).toFixed(2)}px`;
    stage.style.left = `${fit.left.toFixed(2)}px`;
    stage.style.top = `${fit.top.toFixed(2)}px`;
    stage.style.transformOrigin = `${fit.ox.toFixed(2)}px ${fit.oy.toFixed(2)}px`;
    img.sizes = avif.sizes = `${Math.round(comp.w * fit.s)}px`;
    lastT = '';
    paint();
    if (turned) {
      // the other composition: its own poster and file (the old video stops; the poster covers until the new plays)
      layer.classList.remove('is-playing');
      video.removeAttribute('src');
      video.load();
      variant = null;
      retried = false;
      if (posterWanted) loadPoster();
      if (videoWanted) loadVideo();
    }
  };
  const ro = new ResizeObserver(layout);
  ro.observe(inner);
  layout();

  // nothing loads until the act is near: the poster within three screens, the video within two
  const io3 = new IntersectionObserver(
    (es) => {
      if (!es.some((e) => e.isIntersecting)) return;
      io3.disconnect();
      posterWanted = true;
      loadPoster();
    },
    { rootMargin: '300% 0px 300% 0px' },
  );
  io3.observe(act);
  const io2 = new IntersectionObserver(
    (es) => {
      if (!es.some((e) => e.isIntersecting)) return;
      io2.disconnect();
      videoWanted = true;
      loadVideo();
    },
    { rootMargin: '200% 0px 200% 0px' },
  );
  if (!posterOnly) io2.observe(act);

  const onVis = () => (document.hidden ? video.pause() : play());
  document.addEventListener('visibilitychange', onVis);

  return {
    setDrift: (v) => {
      drift = Math.min(1, Math.max(0, v));
      paint();
    },
    setVisible: (on) => {
      if (on === visible) return;
      visible = on;
      if (on) play();
      else video.pause();
    },
    destroy: () => {
      dead = true;
      ro.disconnect();
      io3.disconnect();
      io2.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('error', onError);
      picture.remove();
      video.pause();
      video.removeAttribute('src');
      video.load();
    },
  };
}
