// The Mobility sequence's clock. Two values drive it:
// - pre (0..1): the approach, from the section's top at the bottom of the screen to the stage pinning
//   (the card arriving in the middle). The headlight's edge light runs out and fades up on it.
// - P (0..1): the sticky runway once pinned, cut into beats.
// Shared by mob-stage.ts (lines, glass) and mob-engine.ts (the pictures).
export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const smooth = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** 0..1 inside [a, b], clamped (linear). */
export const span = (a: number, b: number, v: number) => clamp((v - a) / (b - a));

export const TL = {
  /** a: lights in the dark (mob-light.ts): the edge light is already on from the approach (pre); the main
   *  beam punches on as the stage pins and the camera pulls straight back and up, away from the vehicle */
  light: [0, 0.27] as const,
  /** the light dissolves into the Moon over this window (both pictures drawn) */
  cross: [0.235, 0.27] as const,
  /** past this, the glass card steps away on a clock (a CSS transition, reversed on the way back) */
  cardOff: 0.25,
  /** c: range: the whole Moon, laps drawn round it */
  moon: [0.235, 0.87] as const,
  /** the end: the picture and the lines leave */
  exit: [0.87, 1] as const,
  /** each line's window [in, out]; the first arrives as the main beam punches on */
  text: [
    [0.014, 0.25],
    [0.25, 0.875],
  ] as [number, number][],
};

/** Which beat a progress value falls in, by its line (TL.text.length = the exit). */
export function beatOf(p: number) {
  if (p >= TL.exit[0]) return TL.text.length;
  for (let i = TL.text.length - 1; i >= 0; i--) if (p >= TL.text[i][0]) return i;
  return 0;
}

/** Reduced motion: the one still frame shown for each beat (the lights: beam on, camera pulled back). */
export const KEYFRAMES = [0.12, 0.6, 0.6];
