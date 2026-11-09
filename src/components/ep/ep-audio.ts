// The app's sounds on the web. All of them were synthesised from scratch for the app
// (tool/make_sounds.py in the app repo) and are copied here as small mono MP3s.
// Web Audio for tight, low-latency playback: the files are fetched and decoded ahead (an
// OfflineAudioContext needs no gesture and logs nothing), and the real AudioContext is only
// created inside a press, so nothing can ever play before the visitor asks for it.

export type SoundName =
  | 'tap' | 'select' | 'toggle_on' | 'toggle_off' | 'start' | 'stop' | 'logged' | 'celebrate'
  | 'streak' | 'nudge' | 'success' | 'sheet_open' | 'sheet_close' | 'detent' | 'detent_major' | 'limit';

const NAMES: SoundName[] = [
  'tap', 'select', 'toggle_on', 'toggle_off', 'start', 'stop', 'logged', 'celebrate',
  'streak', 'nudge', 'success', 'sheet_open', 'sheet_close', 'detent', 'detent_major', 'limit',
];

// NativeSound.volumeOf: the frequent sounds quieter, the rare moments at full, air well under all.
const VOLUME: Record<SoundName, number> = {
  sheet_close: 0.22, sheet_open: 0.26, detent: 0.6, tap: 0.7, detent_major: 0.75,
  select: 0.8, toggle_on: 0.8, toggle_off: 0.8, limit: 0.8, stop: 0.8,
  success: 0.9, logged: 0.9, start: 0.9, nudge: 0.9,
  streak: 1, celebrate: 1,
};

/** The app's repeat rule: the same sound closer than 22 ms apart is played once. */
const MIN_GAP = 22;
/** Every file peaks at -12 dBFS; on laptop speakers this sits under music, as the app does. */
const MASTER = 0.72;
/** A sound asked for before its file had decoded still plays if it lands within this (ms); later, it would no longer belong to the press. */
const LATE = 120;
/** After a fetch fails, the missing files are fetched again on the next press, at most this often (ms). */
const RETRY = 2000;

type Loaded = { buf: AudioBuffer; offset: number };

export type EpAudio = {
  /** Fetches and decodes every sound; safe to call early and more than once (a failed file is fetched again later). */
  preload(): Promise<void>;
  /**
   * Creates or wakes the AudioContext; true when it was created just now. Call it from inside a press.
   * Creating one can hold the main thread for a few hundred milliseconds on some machines, so the
   * section warms it on pointerdown, before the click starts any motion.
   */
  unlock(): boolean;
  play(name: SoundName): void;
  /** Pauses a running context (section off screen, tab hidden, sound switched off). */
  suspend(): void;
  /** Wakes a context that suspend() paused. */
  resume(): void;
  readonly running: boolean;
  /** The live waveform, for the scope; null until the context exists. */
  analyser(): AnalyserNode | null;
  onPlay: ((name: SoundName, seconds: number) => void) | null;
};

/**
 * Builds the player. The leading silence an MP3 encoder adds varies by decoder, so each buffer's
 * first real sample is found once and playback starts there: a detent lands on the frame it was asked for.
 */
export function createAudio(base: string): EpAudio {
  const buffers = new Map<SoundName, Loaded>();
  const last = new Map<SoundName, number>();
  /** Sounds asked for while their file was still on its way, with when (performance.now()). */
  const waiting = new Map<SoundName, number>();
  let loading: Promise<void> | null = null;
  let retryAt = 0;
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let scope: AnalyserNode | null = null;
  let wanted = false;

  const onset = (buf: AudioBuffer) => {
    const d = buf.getChannelData(0);
    const cap = Math.min(d.length, Math.round(buf.sampleRate * 0.06));
    for (let i = 0; i < cap; i++) if (Math.abs(d[i]) > 1e-4) return i / buf.sampleRate;
    return 0;
  };
  /** Starts one decoded sound now, from its first real sample. */
  const start = (name: SoundName, b: Loaded) => {
    if (!ctx || !master || ctx.state === 'closed') return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const src = ctx.createBufferSource();
    src.buffer = b.buf;
    const g = ctx.createGain();
    g.gain.value = VOLUME[name];
    src.connect(g);
    g.connect(master);
    src.start(0, b.offset);
    api.onPlay?.(name, b.buf.duration - b.offset);
  };

  const api: EpAudio = {
    onPlay: null,
    get running() {
      return !!ctx && ctx.state === 'running';
    },
    preload() {
      if (loading) return loading;
      if (performance.now() < retryAt) return Promise.resolve();
      loading = (async () => {
        const Offline = window.OfflineAudioContext || (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext;
        if (!Offline) return;
        const off = new Offline(1, 1, 44100);
        let failed = false;
        // only what is still missing: a retry never fetches a sound twice
        await Promise.all(
          NAMES.filter((n) => !buffers.has(n)).map(async (n) => {
            try {
              const res = await fetch(`${base}${n}.mp3`);
              if (!res.ok) throw new Error(`${res.status}`);
              const loaded = { buf: await off.decodeAudioData(await res.arrayBuffer()), offset: 0 };
              loaded.offset = onset(loaded.buf);
              buffers.set(n, loaded);
              // a press beat the decode: it still plays if that press was only a moment ago
              const at = waiting.get(n);
              waiting.delete(n);
              if (at !== undefined && performance.now() - at < LATE) start(n, loaded);
            } catch {
              // one missing sound never breaks the others
              failed = true;
            }
          }),
        );
        // A blip (offline for a moment, a 5xx) must not silence the demo for the whole visit: the next
        // press fetches whatever is still missing. Tried memoising the first attempt: one failed fetch
        // left that sound dead until a reload.
        if (failed) {
          retryAt = performance.now() + RETRY;
          loading = null;
        }
      })();
      return loading;
    },
    unlock() {
      let fresh = false;
      if (!ctx) {
        const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!Ctx) return false;
        fresh = true;
        ctx = new Ctx({ latencyHint: 'interactive' });
        master = ctx.createGain();
        master.gain.value = MASTER;
        scope = ctx.createAnalyser();
        scope.fftSize = 256;
        scope.smoothingTimeConstant = 0;
        master.connect(scope);
        scope.connect(ctx.destination);
      }
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      api.preload();
      return fresh;
    },
    play(name) {
      if (!ctx || !master || ctx.state === 'closed') return;
      const now = performance.now();
      if (now - (last.get(name) ?? -1e9) < MIN_GAP) return;
      last.set(name, now);
      const b = buffers.get(name);
      if (b) {
        start(name, b);
        return;
      }
      // not decoded yet, or its fetch failed: it plays the moment it lands if that is soon enough
      waiting.set(name, now);
      api.preload();
    },
    suspend() {
      // Only a running context is paused, and only then is it marked to come back. A second call
      // while the first is still settling (the section leaving the screen, then the tab hiding) reads
      // 'suspended' and must not clear the mark. Tried recording the state on every call: the second
      // call forgot the first, and sound stayed asleep on return until the next press.
      if (ctx && ctx.state === 'running') {
        wanted = true;
        ctx.suspend().catch(() => {});
      }
    },
    resume() {
      if (ctx && wanted && ctx.state === 'suspended') ctx.resume().catch(() => {});
    },
    analyser: () => scope,
  };
  return api;
}
