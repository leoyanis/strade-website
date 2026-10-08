// Free resources sent out by the Instagram DM automation.
//
// To add one:
//   1. Add an entry below (copy an existing one). The slug becomes the URL: strade.tech/free/<slug>
//   2. Optional: put the DM keyword in `keyword` so the page can say "You commented X".
//   3. Deliver it any way you like (combine freely):
//        - `body`:      the resource lives right on the page (prompts get a copy button)
//        - `downloads`: buttons to files in /public/free/<slug>/ or external links (Notion, Drive, Figma...)
//   4. Set `published: true`. Drafts only show in `npm run dev`.
//   5. Optional: run `npm run og` to generate the link-preview image used in DMs.

export interface ResourceBlock {
  heading?: string;
  text?: string;
  list?: string[];
  /** Rendered as a copyable block, ideal for prompts, commands and templates. */
  copy?: { label?: string; text: string };
}

/** Little animated scene shown beside a step while it is on screen. */
export type StepArt =
  | { kind: 'zip'; file: string; folder: string }
  | { kind: 'cmd'; folder: string; cmd: string }
  | { kind: 'chips'; label: string; q: string; items: string[]; picked: number; progress?: number }
  | { kind: 'review'; label: string; note?: string; rows: { text: string; warn?: boolean; fix?: string }[]; action?: string; reply?: string }
  | { kind: 'files'; files: { name: string; lines?: string[]; swatches?: boolean; code?: string[] }[] }
  | { kind: 'slider'; label: string; options: string[]; reply?: string }
  | { kind: 'pile'; label: string; items: string[] }
  | { kind: 'phone'; q: string; reply: string };

export interface ResourceStep {
  text: string;
  art?: StepArt;
}

/**
 * Structured sections for richer resource pages, rendered in order.
 * Text fields accept `code`, **bold** and [label](url).
 * `stage` swaps a section for its pinned, scroll-driven version.
 */
export type ResourceSection =
  | { type: 'cards'; heading: string; cards: { tag: string; title: string; text: string }[]; note?: string; stage?: 'ship-safe-scan' }
  | { type: 'steps'; heading: string; steps: ResourceStep[] }
  | { type: 'chips'; heading: string; items: string[]; stage?: 'style-morph' }
  | { type: 'works'; heading: string; groups: string[][] }
  | { type: 'callout'; heading?: string; text: string; tone?: 'promise' | 'fine' };

export interface Resource {
  slug: string;
  title: string;
  kind: 'Template' | 'Guide' | 'Checklist' | 'Prompt pack' | 'Tool' | 'Skill' | 'Video';
  /** Small line above the title, e.g. "Free Claude skill". Defaults to the kind. */
  eyebrow?: string;
  /** The word people comment or DM, e.g. "SAFE". */
  keyword?: string;
  summary: string;
  /** Short line for the link-preview image. Defaults to the summary. */
  ogLine?: string;
  /** Page accent colour. Defaults to cyan. */
  accent?: string;
  /** Small line under the download button; with `href` it becomes a link. */
  note?: { text: string; href?: string };
  /** Custom animated preview beside or under the hero. */
  preview?: 'ship-safe' | 'design-system' | 'ssot';
  /** "What's inside" bullets above the fold. */
  inside?: string[];
  sections?: ResourceSection[];
  body?: ResourceBlock[];
  /** First one is the big button. */
  downloads?: { label: string; href: string; download?: boolean }[];
  /** Project slugs to show under "See it in real work". */
  related?: string[];
  date: string;
  published: boolean;
}

const SKILL_NOTE = { text: 'Works with Claude Code, Claude.ai and any AI chat', href: '#how' };

export const RESOURCES: Resource[] = [
  {
    slug: 'ship-safe',
    title: 'Ship-Safe',
    kind: 'Skill',
    eyebrow: 'Free Claude skill',
    accent: '#3dff9a',
    summary:
      'AI builds your app fast. It also leaves the same security holes in almost every one. This skill finds them and fixes them.',
    ogLine: 'Finds and fixes the security holes AI leaves in your app.',
    note: SKILL_NOTE,
    preview: 'ship-safe',
    downloads: [{ label: 'Download Ship-Safe', href: '/free/ship-safe/ship-safe.zip', download: true }],
    sections: [
      {
        type: 'cards',
        heading: 'What it checks',
        cards: [
          { tag: 'Phase 1', title: 'The rookie mistakes', text: 'Keys in the app, open databases, users seeing each other’s data. Always runs.' },
          { tag: 'Phase 2', title: 'Real users and real money', text: 'Fake payments, spam signups, runaway AI bills, script injection.' },
          { tag: 'Phase 3', title: 'High security', text: 'Two-factor login, team data isolation, encryption, AI that can take actions safely.' },
        ],
        note: 'It asks 7 questions, then only runs what your app actually needs.',
        stage: 'ship-safe-scan',
      },
      {
        type: 'steps',
        heading: 'How to use it',
        steps: [
          { text: 'Download and unzip it.', art: { kind: 'zip', file: 'ship-safe.zip', folder: 'ship-safe' } },
          {
            text: '**Claude Code:** drop the folder into `.claude/skills/` in your project and type `/ship-safe`. **Any other AI chat:** open [SKILL.md](/free/ship-safe/SKILL.md), copy everything and paste it in.',
            art: { kind: 'cmd', folder: 'ship-safe', cmd: '/ship-safe' },
          },
          {
            text: 'Answer 7 quick questions, or pick Auto and let it read your code.',
            art: { kind: 'chips', label: 'Choose a mode', q: 'How do you want to do this?', items: ['Interview: 7 quick questions', 'Auto: read my code'], picked: 0, progress: 7 },
          },
          {
            text: 'Approve the plan. It fixes each problem, tests it, and explains it in plain English.',
            art: {
              kind: 'review',
              label: 'The plan',
              note: 'Phase 2, because you take payments',
              rows: [
                { text: 'Secret key out of the app', fix: 'Tested' },
                { text: 'Database locked to each user', fix: 'Tested' },
                { text: 'Stripe payments verified', fix: 'Tested' },
              ],
              reply: 'go',
            },
          },
          {
            text: 'You get a `SECURITY-REPORT.md`: what was fixed, and what you need to do yourself.',
            art: { kind: 'files', files: [{ name: 'SECURITY-REPORT.md', lines: ['✓ 9 problems fixed and tested', '→ 2 things for you to do'] }] },
          },
        ],
      },
      {
        type: 'works',
        heading: 'Works with',
        groups: [['Web', 'iOS', 'Android', 'Flutter', 'React Native', 'SwiftUI', 'Kotlin', 'Supabase', 'Firebase', 'Stripe', 'In-app purchases']],
      },
      {
        type: 'callout',
        tone: 'fine',
        text: 'It saves your work first and asks before anything risky. It catches the common mistakes AI makes; it isn’t a replacement for a professional penetration test.',
      },
    ],
    related: ['vaultt', 'outreach-crm'],
    date: '2026-10-07',
    published: true,
  },
  {
    slug: 'design-system-interviewer',
    title: 'Design System Interviewer',
    kind: 'Skill',
    eyebrow: 'Free Claude skill',
    accent: '#ff5ca8',
    summary:
      'Why does every screen your AI builds look slightly different? Nobody decided the rules. This skill interviews you, shows you one screen of your app, and turns it into a full design system.',
    ogLine: 'Interviews you, previews your app, writes the design system.',
    note: SKILL_NOTE,
    preview: 'design-system',
    downloads: [
      { label: 'Download the Interviewer', href: '/free/design-system-interviewer/design-system-interviewer.zip', download: true },
    ],
    sections: [
      {
        type: 'steps',
        heading: 'How to use it',
        steps: [
          { text: 'Download and unzip it.', art: { kind: 'zip', file: 'design-system-interviewer.zip', folder: 'design-system-interviewer' } },
          {
            text: '**Claude Code:** drop the folder into `.claude/skills/` and type `/design-system-interviewer`. **Any other AI chat:** paste in the contents of [SKILL.md](/free/design-system-interviewer/SKILL.md).',
            art: { kind: 'cmd', folder: 'design-system-interviewer', cmd: '/design-system-interviewer' },
          },
          {
            text: 'Answer the questions: platforms, look, colours, fonts, corners. Say “you pick” on anything you don’t care about.',
            art: { kind: 'chips', label: 'Corners', q: 'How round should things be?', items: ['Sharp', 'Slightly rounded', 'Very round', 'You pick'], picked: 3 },
          },
          {
            text: 'It builds a preview of one screen of your real app. Tweak it until you love it.',
            art: { kind: 'phone', q: 'How does this feel?', reply: 'That’s it' },
          },
          {
            text: 'You get the full system: a rulebook, a live visual reference page, and tokens ready to drop into your code.',
            art: {
              kind: 'files',
              files: [
                { name: 'DESIGN_SYSTEM.md', lines: ['1. Principles', '2. Colour', '3. Type', '4. Components'] },
                { name: 'design-system.html', swatches: true },
                { name: 'theme tokens', code: ['--accent: #ff5ca8;', '--radius: 14px;'] },
              ],
            },
          },
        ],
      },
      {
        type: 'chips',
        heading: 'Styles it can do',
        items: ['Apple native', 'Liquid Glass', 'Material 3', 'Minimal', 'Soft physical', 'Glassmorphism', 'Neumorphism', 'Skeuomorphism', 'Brutalist', 'Playful'],
        stage: 'style-morph',
      },
      {
        type: 'works',
        heading: 'Works with',
        groups: [
          ['iOS', 'Android', 'Web', 'Mac', 'Windows'],
          ['SwiftUI', 'Flutter', 'React Native', 'Kotlin/Compose', 'React/Next.js', 'Vue', 'Svelte', 'Electron', 'Tauri'],
        ],
      },
      {
        type: 'callout',
        tone: 'promise',
        text: 'Every future screen follows the same rules, because Claude reads them before it builds.',
      },
    ],
    date: '2026-10-08',
    published: true,
  },
  {
    slug: 'ssot-builder',
    title: 'SSOT Builder',
    kind: 'Skill',
    eyebrow: 'Free Claude skill',
    accent: '#ffb000',
    summary:
      'Claude forgets what you agreed, guesses your prices and re-argues decisions you’ve already made. This skill gives your project one source of truth, so it stops.',
    ogLine: 'One source of truth for your project, so Claude stops guessing.',
    note: { text: 'Works best in Claude Code', href: '#how' },
    preview: 'ssot',
    downloads: [{ label: 'Download SSOT Builder', href: '/free/ssot-builder/ssot-builder.zip', download: true }],
    sections: [
      {
        type: 'steps',
        heading: 'How to use it',
        steps: [
          {
            text: 'Download and unzip it into `.claude/skills/` in your project, then type `/ssot-builder`. (Other AI chats: paste in the contents of [SKILL.md](/free/ssot-builder/SKILL.md).)',
            art: { kind: 'cmd', folder: 'ssot-builder', cmd: '/ssot-builder' },
          },
          {
            text: 'Turn on the highest reasoning setting when it asks. It’s about to read everything.',
            art: { kind: 'slider', label: 'Reasoning', options: ['Low', 'Medium', 'High', 'Highest'], reply: 'ready' },
          },
          {
            text: 'Dump everything you’ve got: notes, pricing, pitch deck, voice-note transcripts. Messy is fine.',
            art: { kind: 'pile', label: 'Everything you’ve got', items: ['notes.txt', 'pricing.xlsx', 'pitch-deck.pdf', 'voice-note.txt', 'TODO.md', 'ideas.md'] },
          },
          {
            text: 'Review what it found: a health check, every contradiction, and every missing detail, each with a recommendation you can accept in one go.',
            art: {
              kind: 'review',
              label: 'What it found',
              rows: [
                { text: 'Health: 🟡 Needs work' },
                { text: 'Pricing doesn’t match', warn: true, fix: '£24 everywhere' },
                { text: 'No refund policy', warn: true, fix: '14-day refund' },
              ],
              action: 'Accept all',
            },
          },
          {
            text: 'It writes your source of truth, one doc per major feature, and a `CLAUDE.md` that keeps it all up to date from then on.',
            art: {
              kind: 'files',
              files: [
                { name: 'CLAUDE.md', lines: ['Read docs/SSOT.md first', 'Open one spoke per job', 'Update the docs as you go'] },
                { name: 'docs/SSOT.md', lines: ['1. What this is', '2. Business', '3. Users and roles'] },
                { name: 'spokes/billing.md', lines: ['Pro: £24 / month', 'Refunds: 14 days'] },
              ],
            },
          },
        ],
      },
      {
        type: 'cards',
        heading: 'What you get',
        cards: [
          { tag: 'The hub', title: 'One source of truth', text: 'What the product is, who it’s for, the business, the rules and the decisions.' },
          { tag: 'The spokes', title: 'One doc per feature', text: 'Claude opens only the one it needs, never everything at once.' },
          { tag: 'The habit', title: 'Docs that stay true', text: 'Every change updates the docs in the same session.' },
        ],
      },
      {
        type: 'callout',
        tone: 'promise',
        heading: 'The honest bit',
        text: 'If your project has serious problems, it tells you plainly, along with what to do about them.',
      },
    ],
    date: '2026-10-08',
    published: true,
  },
  {
    slug: 'example',
    title: 'Example: the copy-paste design prompt',
    kind: 'Prompt pack',
    keyword: 'DESIGN',
    summary:
      'Placeholder to preview the layout. Replace with a real resource and set published: true. This page is only visible in dev.',
    inside: ['What the resource gives them, in one line', 'A second concrete benefit', 'How long it takes to use'],
    body: [
      {
        heading: 'How to use it',
        list: ['Open Claude', 'Paste the prompt below', 'Swap the [brackets] for your details'],
      },
      {
        heading: 'The prompt',
        copy: {
          label: 'Copy prompt',
          text: 'You are a senior product designer. Design [screen] for [product], for [audience]...\n\n(Your real prompt goes here.)',
        },
      },
    ],
    related: ['vaultt', 'youcook'],
    date: '2026-01-01',
    published: false,
  },
];

export const visibleResources = () =>
  RESOURCES.filter((r) => r.published || import.meta.env.DEV).sort((a, b) => b.date.localeCompare(a.date));

export const getResource = (slug: string) => RESOURCES.find((r) => r.slug === slug);
