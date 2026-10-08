// YouCook chef hat, redrawn as SVG from the brand mark (three puffs, a band, two sparkles).
// viewBox 0 0 64 64.
export const HAT_BODY =
  'M19.5 52 L16.9 35.5 A9 9 0 0 1 21.2 18.1 A11 11 0 0 1 42.8 18.1 A9 9 0 0 1 47.1 35.5 L44.5 52 Q32 54.5 19.5 52 Z';
export const HAT_BAND = 'M18.4 45.2 Q32 47.8 45.6 45.2';
export const HAT_SPARKS =
  'M28.5 24 Q29.4 30.1 35.5 31 Q29.4 31.9 28.5 38 Q27.6 31.9 21.5 31 Q27.6 30.1 28.5 24 Z M37.6 35.6 Q38.1 38.4 40.9 38.9 Q38.1 39.4 37.6 42.2 Q37.1 39.4 34.3 38.9 Q37.1 38.4 37.6 35.6 Z';

/** A 4-point sparkle like the ones in the logo, viewBox 0 0 24 24. */
export const SPARK = 'M12 0 Q13.4 10.6 24 12 Q13.4 13.4 12 24 Q10.6 13.4 0 12 Q10.6 10.6 12 0 Z';

function hat(tx: number, ty: number, rot: number, s: number, ink: string, op: number) {
  return `<g transform='translate(${tx} ${ty}) rotate(${rot} 26 26) scale(${s})'>` +
    `<path d='${HAT_BODY}' fill='none' stroke='${ink}' stroke-opacity='${op}' stroke-width='1.5' stroke-linejoin='round'/>` +
    `<path d='${HAT_BAND}' fill='none' stroke='${ink}' stroke-opacity='${op}' stroke-width='1.5' stroke-linecap='round'/>` +
    `<path d='${HAT_SPARKS}' fill='${ink}' fill-opacity='${op}'/></g>`;
}

/** Repeating chef-hat pattern (like youcookapp.com's background) as a CSS url(). */
export function hatPattern(ink = '#333333', op = 0.085) {
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200' viewBox='0 0 200 200'>` +
    hat(4, 8, -22, 0.82, ink, op) +
    hat(112, 14, 28, 0.82, ink, op) +
    hat(50, 106, 12, 0.82, ink, op) +
    hat(146, 118, -38, 0.82, ink, op) +
    `</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
