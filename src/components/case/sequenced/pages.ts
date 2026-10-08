// Demo story pages for the Sequenced case study, written in the studio's house grammar.
// The copy pitches the tool itself, so every claim on a page is a real fact about it.
// Markup → HTML: <b> semibold · <i class="a"> accent · <mark> pill · <u> marker underline
//                <span class="ell"> hand ellipse · <span class="box"> dashed box · <s> strike

export interface StoryBlock {
  /** k = kicker, d = display, h = headline, p = body, s = statement, x = aside */
  role: 'k' | 'd' | 'h' | 'p' | 's' | 'x';
  html: string;
  align?: 'left' | 'center' | 'right';
}

export interface StoryPage {
  id: string;
  /** Archetype id from the app's layout library (src/lib/archetypes). */
  archetype: string;
  scene: 'a' | 'b' | 'c' | 'd' | 'e';
  subject?: 'low' | 'high';
  ghost?: string;
  /** Vertical centre of the ghost word, % of page height. */
  ghostY?: number;
  top: StoryBlock[];
  bottom?: StoryBlock[];
  /** Hand-drawn extras drawn on top. */
  marks?: { kind: 'arrow-cta' | 'arrow-curve' | 'sparkle' | 'hook'; x: number; y: number; w: number; rot?: number; white?: boolean }[];
  aside?: string;
}

export const STORY_PAGES: StoryPage[] = [
  {
    id: 'p1',
    archetype: 'headline-photo',
    scene: 'a',
    subject: 'low',
    ghost: 'STORIES',
    ghostY: 47,
    top: [
      { role: 'k', html: 'what if a whole <b>story sequence</b>', align: 'center' },
      { role: 'd', html: 'took <i class="a"><u>one brief</u></i>', align: 'center' },
    ],
    marks: [{ kind: 'sparkle', x: 78, y: 27, w: 11 }],
    aside: '(tap)',
  },
  {
    id: 'p2',
    archetype: 'statement-stack',
    scene: 'b',
    top: [
      { role: 'p', html: 'the layouts come from <b>63 real sequences.</b>' },
      { role: 'p', html: 'the studio’s own work, broken down <mark>page by page.</mark>' },
      { role: 'p', html: 'so it looks <b><u>like the studio,</u></b> not like a template.' },
    ],
    marks: [{ kind: 'arrow-curve', x: 60, y: 60, w: 26, rot: 8, white: true }],
    aside: '(next slide)',
  },
  {
    id: 'p3',
    archetype: 'callout-box',
    scene: 'c',
    subject: 'low',
    top: [
      { role: 'h', html: '<span class="box">claude never draws pixels.</span>', align: 'center' },
      { role: 'p', html: 'it <b>picks a layout</b> & <mark>fills it.</mark>', align: 'center' },
      { role: 'x', html: '(the layout lives in code)', align: 'center' },
    ],
  },
  {
    id: 'p4',
    archetype: 'big-word',
    scene: 'd',
    ghost: 'LAYERS',
    ghostY: 46,
    top: [{ role: 'k', html: 'and when it’s <span class="ell">done</span>..', align: 'center' }],
    bottom: [{ role: 's', html: 'every text box, pill & photo lands in canva as its <mark>own layer.</mark>', align: 'center' }],
  },
  {
    id: 'p5',
    archetype: 'cta',
    scene: 'e',
    top: [
      { role: 'h', html: 'brief it.' },
      { role: 'h', html: 'generate it.' },
      { role: 'h', html: '<i class="a">finish the <u>last 10%</u></i> in canva.' },
    ],
    marks: [{ kind: 'arrow-cta', x: 44, y: 52, w: 16 }],
    aside: '(see how it’s built)',
  },
];
