// The real finished video in the homepage editor's preview (Editor.astro, compact: .ae-fin > video[data-ae-final]).
//
// getatlas.site's own editor demo shows the raw still while it edits and its real finished video (final.mp4)
// once the edit is done; the homepage does the same with that very video (take-02-final.mp4). The editor's
// timeline says when (atlas-editor.ts calls post() as the edit is posted, unpost() as it goes back to the raw
// take, run() whenever the editor starts, stops, goes off screen, or the tab hides); this module owns the one
// <video> element: when it downloads, when it plays, and whether it shows.
//
// - Nothing is fetched until attach(), which the editor calls once it is near the screen (the markup carries
//   data-src and data-poster, never src or poster). With the data saver on it never attaches.
// - It only shows once it can show its own first frame, so the cut is always to frame one, never to a blank,
//   a poster that never starts or the frame it was paused on. Until then (still loading, refused by Low Power
//   Mode, a codec error) the code-built reel keeps showing its own posted look underneath: the fallback is the
//   page as it was before the video.
// - When not shown it sits under the reel (rendered and covered, never hidden: iOS will not start a muted video
//   that is hidden), paused on its first frame (park), so the next post cuts in on frame one with no seek.
// - Safari only buffers a video once it plays (preload is a hint it ignores on phones), so warm() plays it under
//   the reel for a moment during the edit, long before the post, and parks it again.
// - One element, muted, playsinline; paused off screen and in hidden tabs (run()). It plays once per post, from
//   frame one to its end: the editor's posted stage is as long as the file (data-dur), so it never needs to loop,
//   and without the loop attribute a clock that runs late leaves it on its last frame instead of on frame one.
// - Showing it is a dissolve, not a cut (atlas-editor.css): the reel over it fades out in 250 ms. The editor holds
//   the reel's camera on the wide shot from the raw take to the post when ready() says the video will take over,
//   and the video is framed exactly like that shot (same take, same crop, and the reel's 3% oversize copied), so
//   the dissolve shows one picture finishing, not two framings swapping.

export type Final = {
  /** set the source and start buffering (once) */
  attach: () => void;
  /** during the edit: make sure the first frame is decoded before the post */
  warm: () => void;
  /** the edit is posted: cut to the video from its first frame (now, or the moment it can play) */
  post: () => void;
  /** back to the raw take (or a fresh landing): hide it and park it on its first frame */
  unpost: () => void;
  /** whether the editor is running and on screen: plays the video while it shows, pauses it otherwise */
  run: (go: boolean) => void;
  /** the video is what the preview shows right now */
  live: () => boolean;
  /** shown, or posted and about to show the moment it starts */
  showing: () => boolean;
  /** a post now would show it at once, from frame one: loaded, parked on frame one, not refused */
  ready: () => boolean;
};

/**
 * `mon` is the preview (.ae-mon): its is-fin class shows the video over the reel (atlas-editor.css).
 * `onChange` runs whenever the video starts or stops being shown, so the editor can pause the reel under it.
 */
export function createFinal(video: HTMLVideoElement, mon: HTMLElement, onChange: () => void): Final {
  const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
  let attached = false;
  let refused = false; // play() was refused for good (autoplay policy, Low Power Mode, no playable source)
  let isLive = false;
  let pendingShow = false; // posted while it could not play yet: show it the moment it starts
  let warming = false;
  let go = false;

  const show = (on: boolean) => {
    if (isLive === on) return;
    isLive = on;
    mon.classList.toggle('is-fin', on);
    onChange();
  };
  // paused on the first frame. currentTime is only touched when it is off frame one: a seek drops readyState
  // for a moment, and the post checks readyState
  const park = () => {
    if (!video.paused) video.pause();
    if (video.readyState >= 1 && video.currentTime > 0.02) video.currentTime = 0;
  };
  const tryPlay = () => {
    // ended: it has played to its last frame and holds it until the editor goes back to the raw take. play() on an
    // ended video starts it over from frame one (a resume from off screen in that last moment would replay the hook)
    if (!video.paused || video.ended || refused || !attached) return;
    const p = video.play();
    p?.catch((e: DOMException) => {
      // a pause() that lands before play() resolves rejects it with AbortError: that is not a refusal
      if (e?.name === 'AbortError') return;
      refused = true;
      pendingShow = false;
      warming = false;
      show(false);
    });
  };

  video.addEventListener('playing', () => {
    if (pendingShow) {
      pendingShow = false;
      // it started late (the post came before it could play): it played from frame one, so cut to it now
      if (go && !document.hidden) show(true);
      else park();
      return;
    }
    if (warming) {
      warming = false;
      if (!isLive) park();
    }
  });
  video.addEventListener('error', () => {
    refused = true;
    pendingShow = false;
    show(false);
  });
  document.addEventListener('visibilitychange', () => run(go));

  const attach = () => {
    if (attached || saveData) return;
    const src = video.dataset.src;
    if (!src) return;
    attached = true;
    video.muted = true; // the property, not only the attribute: iOS checks it before it lets a video autoplay
    if (video.dataset.poster) video.poster = video.dataset.poster;
    video.preload = 'auto';
    video.src = src;
    video.load();
  };
  const warm = () => {
    if (!attached || refused || isLive || warming || pendingShow || video.readyState >= 2) return;
    warming = true;
    tryPlay();
  };
  const post = () => {
    if (!attached || refused) return;
    // shown right away only if frame one is what it holds now (not mid seek: it would show the old frame first)
    if (video.readyState >= 2 && !video.seeking && video.currentTime <= 0.02) {
      show(true);
      if (go && !document.hidden) tryPlay();
    } else {
      // not ready yet (or not parked): it shows on 'playing', from frame one
      park();
      pendingShow = true;
      warming = false;
      if (go && !document.hidden) tryPlay();
    }
  };
  const unpost = () => {
    pendingShow = false;
    warming = false;
    show(false);
    park();
  };
  function run(on: boolean) {
    go = on;
    const can = on && !document.hidden;
    if (isLive || pendingShow) {
      if (can) tryPlay();
      else if (!video.paused) video.pause();
    } else if (!warming && !video.paused) {
      video.pause();
    }
  }
  // the same test post() makes before it shows the video at once (the editor asks it as the words land, so the
  // camera only holds the wide shot when the video will really take over at the post)
  const ready = () =>
    attached && !refused && !isLive && !pendingShow && video.readyState >= 2 && !video.seeking && video.currentTime <= 0.02;
  return { attach, warm, post, unpost, run, live: () => isLive, showing: () => isLive || pendingShow, ready };
}
