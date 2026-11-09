// The playback bar under the homepage's Atlas editor (Editor.astro, compact variant: .ae-play).
//
// Visitors could not tell the editor was playing at all (Yanis: "I don't know whether it's an animation or not"),
// so a bar under the window shows the loop as stages: one segment per stage, as wide as the stage is long,
// the current one filling in real time with a glowing head at its edge, finished ones full, and the stage's name
// under the current one. Everything comes from the editor timeline's own phases (atlas-editor.ts passes them in),
// never a copy of its numbers, so a retimed phase retimes the bar. The bar is driven by the timeline's playhead from
// the timeline's own onUpdate (narrate), so it freezes with the timeline when the editor pauses (off screen, a
// hidden tab) and is right on the first frame after a seek.
//
// The hold after a landing is a lead-in, not the end of a lap: the card has just landed as the finished reel and
// nothing has played yet, so the bar waits empty with its head on the start line (no name under it), and fills
// from the first stage once the rewind begins. Shown as what it is in the lap (the tail of the posted stage), it
// looked nearly finished the moment it appeared, the opposite of "this is playing" (review A3).
// Hot path: two style writes a frame (the filling segment's scale, the head's place); the rest is written only when
// the stage changes.

/** one phase of the editor timeline: [name, status text, running, short label] (atlas-editor.ts's PH) */
export type Phase = [string, string, boolean, string?];

export type Stage = { label: string; t0: number; len: number };

/**
 * Turn the timeline's phases into the bar's stages.
 * - Each phase lasts until the next one starts; the last until the loop's end (`dur`, one lap).
 * - Phases that say the same thing in the status pill are one stage (build and words: the words are a beat inside
 *   the build, with the same text, so a separate segment would split one visible stage in two).
 * - The loop wraps, so if the first and the last stage say the same thing (hold and post: the posted video, 2 s at
 *   the start and the rest at the end) they are one stage across the wrap, and the bar starts right after it.
 * Returns the stages in bar order and `origin`, the timeline time where the bar starts.
 */
export function stagesOf(phases: Phase[], T: Record<string, number>, dur: number): { stages: Stage[]; origin: number } {
  const ph = phases
    .map(([name, text, , label]) => ({ text, label: label ?? name, t0: T[name] }))
    .filter((p) => Number.isFinite(p.t0))
    .sort((a, b) => a.t0 - b.t0);
  const merged: { text: string; label: string; t0: number; len: number }[] = [];
  for (const p of ph) {
    const prev = merged[merged.length - 1];
    if (prev && prev.text === p.text) continue;
    merged.push({ ...p, len: 0 });
  }
  merged.forEach((p, i) => (p.len = (merged[i + 1]?.t0 ?? dur) - p.t0));
  if (merged.length > 1 && merged[0].text === merged[merged.length - 1].text) {
    const first = merged.shift()!;
    merged[merged.length - 1].len += first.len;
  }
  return { stages: merged.map(({ label, t0, len }) => ({ label, t0, len })), origin: merged[0]?.t0 ?? 0 };
}

export type Playbar = { update: (t: number, lead?: boolean) => void; el: HTMLElement };

/**
 * Build the bar's segments and head into `el` (.ae-play, from Editor.astro) and return update(t, lead), which takes
 * the editor timeline's time and paints the bar for it. `dur` is one lap of the timeline; `lead` is true during the
 * hold after a landing (the bar then waits, empty).
 */
export function mountPlaybar(el: HTMLElement, stages: Stage[], origin: number, dur: number): Playbar | null {
  const bar = el.querySelector<HTMLElement>('.ae-play__bar');
  const cap = el.querySelector<HTMLElement>('.ae-play__cap');
  const capText = cap?.querySelector('b');
  if (!bar || !cap || !capText || !stages.length || !(dur > 0)) return null;

  // each segment grows by its stage's length (flex-basis 0), so the widths are proportional; --n tells the
  // caption and the head where each one starts (atlas-editor.css works the gaps in with calc)
  const fills: HTMLElement[] = [];
  const segs: HTMLElement[] = [];
  const starts: number[] = [];
  let acc = 0;
  bar.textContent = '';
  stages.forEach((s) => {
    const seg = document.createElement('i');
    seg.style.flexGrow = s.len.toFixed(3);
    const fill = document.createElement('b');
    seg.appendChild(fill);
    bar.appendChild(seg);
    segs.push(seg);
    fills.push(fill);
    starts.push(acc);
    acc += s.len;
  });
  // the head: one glowing dot at the filling edge, absolute over the segments (not a flex item), moved by transform.
  // It cannot live inside the fill: the fill is scaled, and anything in it would squash with it
  const head = document.createElement('span');
  head.className = 'ae-play__head';
  bar.appendChild(head);
  el.style.setProperty('--segs', String(stages.length));

  let cur = -1;
  let lastK = -1;
  let lastX = '';
  let inLead = false;
  const update = (t: number, lead = false) => {
    if (lead) {
      // the lead-in: every segment empty, the head on the start line, no name (it fades back in with the rewind's,
      // already in place under the first segment)
      if (!inLead) {
        inLead = true;
        el.classList.add('is-lead');
        segs.forEach((s, j) => {
          s.classList.remove('is-done', 'is-on');
          fills[j].style.transform = 'scaleX(0)';
        });
        capText.textContent = stages[0].label;
        cap.style.setProperty('--k', '0');
        cap.style.setProperty('--n', '0');
        head.style.setProperty('--x', '0');
        head.style.setProperty('--n', '0');
        lastX = '0';
        cur = -1;
        lastK = -1;
      }
      return;
    }
    if (inLead) {
      inLead = false;
      el.classList.remove('is-lead');
    }
    // where the playhead is in the bar's lap: the bar starts at `origin`, so the posted stage, which straddles the
    // timeline's wrap (its end of the lap, then 0 to 2 s), is one continuous stretch at its end
    const lap = ((((t - origin) % dur) + dur) % dur);
    let i = stages.length - 1;
    while (i > 0 && lap < starts[i] - 1e-6) i--;
    if (i !== cur) {
      // a new stage: the ones before it full, the ones after it empty, the caption and the head on it
      segs.forEach((s, j) => {
        s.classList.toggle('is-done', j < i);
        s.classList.toggle('is-on', j === i);
        if (j !== i) fills[j].style.transform = `scaleX(${j < i ? 1 : 0})`;
      });
      capText.textContent = stages[i].label;
      cap.style.setProperty('--k', (starts[i] / dur).toFixed(4));
      cap.style.setProperty('--n', String(i));
      head.style.setProperty('--n', String(i));
      cur = i;
      lastK = -1;
    }
    // the current segment fills in real time; three decimals is finer than a device pixel on any bar width here
    const k = Math.round(Math.min(1, Math.max(0, (lap - starts[i]) / stages[i].len)) * 1000) / 1000;
    if (k !== lastK) {
      fills[i].style.transform = `scaleX(${k})`;
      lastK = k;
      // the head sits on the fill's edge: its share of the bar's segment length (the gaps are added in CSS)
      const x = ((starts[i] + k * stages[i].len) / dur).toFixed(4);
      if (x !== lastX) {
        head.style.setProperty('--x', x);
        lastX = x;
      }
    }
  };
  el.hidden = false;
  return { update, el };
}
