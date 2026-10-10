---
name: landing-page-beautifier
description: Turns any website or landing page (an existing codebase, a live URL, or nothing yet) into a beautiful, premium site with fancy scroll animations, designed transitions between sections, strong typography and sizing, and one coherent, documented design system, without touching the copy. Works for any industry, any stack and any visual style. It interviews the owner about the look they want (or picks a direction if they have no idea), audits what exists, plans every page, then builds, checks and documents it. Use it whenever someone wants to revamp, redesign, polish or "make premium" a site, add scroll animations or section transitions, fix inconsistent fonts, sizes or colours, or build a new marketing, portfolio, product or business site that should look expensive, even if they don't say "design system" or "animation".
---

# Landing Page Beautifier

You take a website from "fine" to "how did they make this?". Every section earns its place, every boundary between sections is a designed moment, the type and spacing feel inevitable, and underneath it all sits one small, documented system that the next person can extend without breaking.

This skill is domain-agnostic and design-agnostic. It doesn't impose one look. It gives you a craft vocabulary (directions, type, scale, colour, motion, components) and a process for choosing from it with the owner.

## Ground rules, and why they matter

1. **The words belong to the owner.** Don't rewrite, shorten, reorder, translate or "improve" copy unless they ask. Copy carries legal claims, brand voice and SEO the owner has thought about. You *can* flag typos, contradictions between pages, stale numbers, placeholder text and lines that read as AI-written, in the log (format below). Layout can change around copy; the words stay.
2. **One system, no strays.** Every colour, font stack, size, ease, duration, radius, shadow, z-index and breakpoint comes from a token. Inconsistency is what makes sites feel cheap, even when each piece is pretty. If a sub-page needs its own brand (a product, a case study), it gets a scoped override of the role tokens, not new literals.
3. **Content first, motion second.** The HTML ships the finished, readable state. JS adds hidden "from" states only once the motion library has loaded. Visitors with no JS, failed JS or reduced motion get a complete page where every button still works. Motion that can trap content invisible is worse than no motion.
4. **Match motion to the surface.** Marketing pages get scroll scenes and section transitions. Product UI gets fast, quiet state transitions. Checkout and docs get almost none. See "Surface budgets" below.
5. **Flag, don't wander.** Anything outside the brief (dead code, a11y holes, slow assets, brand values that disagree between files) goes in the log. Fix only what's in scope or approved.
6. **Keep what they love.** If the owner likes an existing section or transition, keep its look and fix its smoothness (transform-only, no scrub lag, correct trigger math) instead of redesigning it.

## Surface budgets

| Surface | Motion budget | Where the "wow" goes |
|---|---|---|
| Landing / marketing / launch | High: pinned scenes, act transitions, kinetic type | Hero sequence + one signature scene per page |
| Portfolio / agency / personal brand | High | Each case study wears its subject's brand; hand-off to the next one |
| Business / local (restaurant, clinic, studio) | Medium: reveals, one scene, rich imagery | The offer or the place (menu, space, before/after) |
| E-commerce | Medium on story pages, low on grids, near zero in checkout | Product story section on the product page; never slow down add-to-cart |
| SaaS app / dashboard | Low: 120–250ms state transitions, no scroll-jacking | Empty states, onboarding, success moments |
| Docs / blog / long reads | Low: reading-paced reveals at most | Typography and code blocks, not animation |
| Nonprofit / institutional | Medium, calm | Impact numbers, a story told in scroll |

## Workflow

Announce each phase in one line so the owner can follow along.

### Phase 0: Look first

Questions are better once you've looked.

- **Codebase:** identify the stack, pages, shared layouts, any motion library and the current tokens. Run the audit inventory in `references/design-system.md`. For big sites (more than ~15 source files), split the reading across parallel read-only research subagents (one per area) on a fast, cheap model. Each returns the techniques it found plus inconsistencies with file:line.
- **Live URL only:** open it in a browser, read every nav page, and screenshot desktop (1440×900) and phone (375×812).
- **Nothing yet:** go straight to the interview.

Output a short "What I see" summary (stack, pages, what already works, top 5 problems) and start the log.

### Phase 1: Interview

Use `references/interview.md`. Ask at most 3 rounds of at most 4 questions (use a multiple-choice question tool if you have one). Every question has a "you decide" option. Ground questions in what you saw ("Your hero is a centred headline over a stock photo: keep, evolve or replace?").

If they have a vision, capture it exactly, including reference sites. If they don't, **pick a direction on purpose**: read the brand, choose one of the directions in `references/directions.md`, state it in two sentences, and move on. A missing vision is not a reason to stall.

Save the answers as `REVAMP-BRIEF.md` (template in the interview file).

### Phase 2: Direction and page plans

1. **Direction:** one preset from `references/directions.md`, or a blend of two (say which parts come from which). It sets the type pairing, scale ratio, palette structure, radius, depth style, texture and motion personality in one go.
2. **Type and scale:** choose families, the scale ratio and fluid sizes using `references/typography.md` and `references/layout-and-scale.md`.
3. **Colour:** build role-based palettes with `references/color.md`.
4. **Acts:** treat each long marketing page as 3–5 "worlds" (palette + texture + type voice) that the visitor travels through.
5. **Boundaries:** for each act-to-act boundary pick a transition from `references/motion.md` § "Section transitions". Don't use the same one twice in a row on a page.
6. **Signature scene per marketing page:** one pinned, scroll-scrubbed moment that tells that page's story (the product working itself, a before/after, a morph, an exploded view). Phones get the same timeline as a loop that plays while visible.
7. **First screen:** it must not look like the whole page. Let the next section visibly peek in.

Present one compact table per page and get a yes before building:

| Section | World | Enters via | Signature motion | Phone fallback |
|---|---|---|---|---|

Also list the tokens you'll introduce and the in-scope fixes from the log.

### Phase 3: Foundation

Build these before touching sections:

1. **Tokens** (template in `references/design-system.md`): colour roles, type scale, font stacks, spacing, containers, radii, shadows, z-index scale, breakpoints, eases and durations.
2. **Fonts:** load only the weights you use, from one source, with fallback metric overrides (see typography § "Loading").
3. **Motion kernel** (`references/motion-kernel.md`): lazy loader, reduced-motion handling, refresh after fonts, text splitters, reveal helpers, pin media queries and a `data-fx` registry. Adapt it to the stack (adapters included).
4. **Intro gate:** a tiny inline `<head>` script that hides the hero parts until motion takes over, with a failsafe timeout.
5. **Docs:** start `DESIGN.md` and `MOTION.md` now (templates in `references/design-system.md`) and fill them in as you build.

### Phase 4: Build, section by section

Order: global type and spacing → hero → act transitions → signature scenes → components (`references/components.md`) → secondary motion → tertiary polish.

For each section:
- It's a `data-fx` block that only queries inside itself.
- Scenes are one `build()` function returning a paused timeline. Desktop pins and scrubs it; phones loop it while visible.
- Animated state lives in 0..1 CSS custom properties that CSS turns into visuals, so scrubbing works both ways with no reverse code.
- Use tokens only. If you reach for a literal, add a token or reuse one.
- Each page gets one loud idea with quiet support. Pick secondary and tertiary details deliberately; don't stack every trick in one viewport.

If you find a better idea mid-build, propose it rather than just doing it.

### Phase 5: Check it yourself

Run `references/qa-checklist.md` in a real browser:
- **Sizes:** 1440×900, 1280×720, 375×812 and a tall 1440×1600 window.
- **Conditions:** reduced motion, JS disabled, 4× CPU throttle.

Fix what you find. Share screenshots as proof instead of asking the owner to check.

### Phase 6: Hand over

Deliver:
- `DESIGN.md` and `MOTION.md`.
- `REVAMP-LOG.md`, split into *fixed*, *flagged, needs your call* and *out of scope*.
- A short page-by-page summary of what changed.

## Avoid the template look

These patterns make a site read as "generated". Reach past them unless the owner specifically wants them:
- A centred headline, a gradient blob and three identical bordered feature cards.
- Every section the same height, padding and layout.
- One font at three sizes with no real hierarchy.
- Grey-on-white body text below 4.5:1 contrast.
- Animations that are only fade-up-on-scroll.
- Stock photos with no art direction.
- Five accent colours with no roles.
- Buttons with only a colour change on hover.

## The log

Keep `REVAMP-LOG.md`, one line per issue:

```
## Copy (flag only)
- [/pricing] "Cancel anytime" vs "12-month minimum" in the FAQ. Which is right?

## Design system
- [styles/home.css:138,179] #f0f0f0 hard-coded 8× where --c-ink exists. (fixing: in scope)

## Accessibility / performance / dead code
- [components/Glow.tsx:40] cursor effect animates left/top every frame, runs in hidden tabs. (flagged)
```

Each line has a location, the problem in one sentence, and a status: *fixing*, *flagged* or *needs your call*.

## Reference files (read when you reach that step)

| File | Read it for |
|---|---|
| `references/interview.md` | Question bank, picking a direction when there's no vision, brief template |
| `references/directions.md` | 9 complete design directions: type pairing, scale, palette, radius, depth, texture, motion |
| `references/typography.md` | Choosing and pairing fonts, scale ratios, fluid sizes, line-height, tracking, measure, loading |
| `references/layout-and-scale.md` | Spacing scale, containers, grids, section rhythm, radius, elevation, touch targets, imagery |
| `references/color.md` | Role palettes, OKLCH ramps, contrast, dark mode, accent budget, brand skins |
| `references/motion.md` | Motion catalog (primary / secondary / tertiary), section transitions, personality tables |
| `references/motion-kernel.md` | Portable motion kernel code, scene template, stack adapters |
| `references/components.md` | Craft details for nav, hero, buttons, cards, forms, pricing, proof, footer |
| `references/design-system.md` | Token template, audit commands, `DESIGN.md` / `MOTION.md` templates |
| `references/qa-checklist.md` | Verification passes and the common failure modes |


---

<!-- references/interview.md -->

# Interview

Goal: learn what the owner wants the site to feel like in as few questions as possible, then get out of their way. At most 3 rounds of at most 4 questions. Every question offers "You decide". Ground every question in what you saw during the look-first phase; abstract questions get vague answers.

## Round 1: Purpose and feel (always ask)

1. **Who lands here, and what should they do?** Offer options shaped by what you saw: book a call, buy, sign up, download, visit in person, donate, read and subscribe, be impressed and hire. Plus "You decide".
2. **What should it feel like?** Offer the closest 3–4 directions from `directions.md` by name, each with a one-line description (e.g. "Editorial: calm, serif-led, generous space"), plus "Mix" and "You decide".
3. **Any site you'd like it to feel like?** Free text: URLs or screenshots. If they give one, open it and name the specific moves you'd borrow, in plain words, then confirm.
4. **What must stay?** Logo, colours, a section they love, a transition they like. The copy stays by default unless they say otherwise.

## Round 2: Look and structure (only what you couldn't infer)

- **Colour:** keep, evolve (same hues with more depth and contrast), or new? Light, dark, or shifting between sections?
- **Type:** keep, or pick a direction (offer 2–3 pairings from the chosen direction by name, e.g. "a heavy modern sans with a serif accent").
- **Structure:** are the current sections right? Reorder or merge only with approval; never cut copy without it.
- **Sub-brands:** should product or case-study pages look like their own brand, or share the main look?
- **Imagery:** real photos, product screenshots, recreated live UI, illustration, or abstract shapes?

## Round 3: Constraints (only if relevant)

- Stack constraints: CMS, framework, hosting, "no new dependencies".
- Performance budget, or visitors on slow phones.
- Accessibility requirements beyond the defaults.
- Deadline, or which page to start with.
- Who maintains it afterwards. This decides how simple the kernel and docs must be.

## Don't ask

- Anything you can see for yourself.
- Exact animation values, sizes or hex codes: that's your job.
- "Do you want animations?": they asked for this skill.
- Whether you may rewrite copy. List copy issues as flags instead.

## Picking a direction when there's no vision

1. Read the product, the audience and any existing brand assets (logo colours, fonts in use, photography).
2. Map the brand to a direction in `directions.md`. Use the "Good for" lines there; when two fit, prefer the one that contrasts with the competitors you saw.
3. Write a two-sentence direction, e.g.: *"Editorial: warm off-white paper, a high-contrast serif for headlines with a quiet sans for text, generous space. Motion is slow and reading-paced, with one scroll-scrubbed story of the product."*
4. Show the page table and proceed after a yes. Don't run another round of questions.

## REVAMP-BRIEF.md template

```markdown
# Revamp brief: <site>
Date: <YYYY-MM-DD> · Owner: <name>

## Purpose
- Visitors: <who>
- Main action: <what>
- Feel: <direction> (<one line on why>)

## Keep
- <logo / colours / sections / transitions / all copy>

## References
- <url>: borrowing <specific moves>

## Direction
<two sentences>

## Look
- Palette: <keep | evolve | new: roles>
- Type: <families and roles>
- Imagery: <photos | screenshots | live UI | illustration | shapes>
- Sub-brands: <own brand | shared>

## Constraints
- Stack: <…>
- Performance / accessibility: <…>
- Maintainer: <…>

## Out of scope
- Copy changes (flag only) unless listed here: <…>
```


---

<!-- references/directions.md -->

# Design directions

Nine complete directions. Each one decides type, scale, palette, shape, depth, texture, imagery and motion together, so the result is coherent rather than a collage. Pick one, or blend two and say which parts come from which (e.g. "Editorial type and palette, Cinematic motion").

All fonts listed are free for commercial use: Google Fonts (G) or Fontshare (F). Check licences again before shipping anything else. Values are starting points; tune them to the brand.

**Contents:** 1 Cinematic Dark · 2 Editorial · 3 Swiss / Technical · 4 Soft & Friendly · 5 Playful · 6 Brutalist · 7 Luxury Minimal · 8 Warm Crafted · 9 Tactile Product

---

## 1. Cinematic Dark
**Good for:** personal brands, agencies, launches, portfolios, AI and dev products that want drama.
- **Type:** heavy neo-grotesk display (800–900) with tight tracking, plus a serif italic accent for single words. Pairings: Inter Tight (G) + Instrument Serif (G) · Geist (G) + Instrument Serif · Satoshi (F) + Erode (F) · Bricolage Grotesque (G) solo. Mono for labels: JetBrains Mono (G), Geist Mono (G).
- **Scale:** body 17px, ratio 1.25 for text steps, a separate display step up to `clamp(56px, min(10vw, 17svh), 180px)`. Display tracking −0.05 to −0.065em, line-height 0.86–0.95.
- **Palette:** near-black base (#050505–#0d0d0d) tinted toward the accent hue, off-white ink (#f0f0f0), one electric accent (cyan, lime, orange, violet), muted greys for secondary text. Light "acts" (paper, blueprint) can interrupt the dark for contrast.
- **Shape and depth:** small radii (6–12px) or chamfered corners via `clip-path`; glow instead of shadow (`0 0 40px` accent at 20–40%); glass for floating chrome.
- **Texture:** starfields, grain, faint grids, light streaks.
- **Imagery:** product on dark, duotone or desaturated photos that turn colour on hover, recreated UI.
- **Motion:** cinematic. `expo.out` / `power4.out` entrances at 1–1.6s, letter-rise headlines, a hero that assembles like film titles and dismantles on scroll, pinned product scenes, act transitions (diagonal wipe, iris). Pops `back.out(1.7)`.
- **Avoid:** neon everywhere; low-contrast grey body text; more than one glowing element per viewport.

## 2. Editorial
**Good for:** wellness, premium services, publications, consultancies, nonprofits, books, architecture.
- **Type:** high-contrast serif display with a quiet sans or serif for text. Pairings: Fraunces (G) + Inter (G) · Newsreader (G) + Source Sans 3 (G) · Instrument Serif (G) + Geist (G) · Playfair Display (G) + Lato (G) · Erode (F) + Switzer (F). Small caps or tracked uppercase for kickers.
- **Scale:** body 18–19px (reading comfort), ratio 1.333, display up to 96–128px, line-height 1.0–1.1 for display, 1.6–1.7 for body. Measure 62–70ch.
- **Palette:** warm off-white paper (#f6f3ee, #f2efe8), soft ink (#1d1b18), one muted accent (oxblood, forest, ochre, ink blue). Optional dark "night" section.
- **Shape and depth:** square or barely rounded (0–4px); hairline rules instead of boxes; almost no shadows.
- **Texture:** paper grain, generous whitespace, drop caps, pull quotes, numbered sections (§, I, II).
- **Imagery:** large art-directed photography, full-bleed or offset; captions in small caps.
- **Motion:** calm. `power2.out` at 1.4–2.2s, reading-paced word reveals (`scrub: 1–1.2`), slow parallax on images, hairline rules that draw in. Little or no overshoot.
- **Avoid:** bouncy pops; more than two type families; centring long paragraphs.

## 3. Swiss / Technical
**Good for:** dev tools, B2B SaaS, data, infrastructure, fintech, research.
- **Type:** neutral grotesk with a mono companion. Pairings: Inter (G) + JetBrains Mono (G) · Geist (G) + Geist Mono (G) · IBM Plex Sans (G) + IBM Plex Mono (G) · Switzer (F) + DM Mono (G).
- **Scale:** body 16px, ratio 1.2 (text) and 1.25 (marketing heads), display 56–88px, tracking −0.02 to −0.035em. Labels in mono uppercase at 11–12px, +0.08 to +0.12em.
- **Palette:** white or near-black base, ink, 2–3 greys, one functional accent (blue, green, orange) plus semantic states. Colour means something.
- **Shape and depth:** 4–8px radii, 1px hairlines at 8–12% ink, flat or very soft shadows. Strict 12-column grid with visible alignment.
- **Texture:** dot grids, coordinates, diagrams, code blocks with real syntax colours.
- **Imagery:** real UI (recreated in HTML where possible), diagrams, terminal sessions.
- **Motion:** precise. `power3.out` at 0.6–0.9s, small travel (y 16–24), typing and terminal effects, counters, flow lines drawing between nodes, scrubbed diagrams. Pops `back.out(1.4)` at most.
- **Avoid:** decorative illustration with no information in it; rounded-bubbly UI; slow easing.

## 4. Soft & Friendly
**Good for:** consumer apps, health, education, community, family products, onboarding-heavy SaaS.
- **Type:** rounded or humanist sans. Pairings: Nunito (G) + Nunito Sans (G) · Plus Jakarta Sans (G) solo · Figtree (G) solo · General Sans (F) + Satoshi (F) · Quicksand (G) for display with Inter for text.
- **Scale:** body 17px, ratio 1.25, display 48–80px, tracking −0.01 to −0.025em, line-height 1.1 for heads.
- **Palette:** light base with soft tints (pastel surfaces), one saturated friendly accent, plenty of white. Coloured sections as full-bleed blocks.
- **Shape and depth:** large radii (16–28px), pill buttons, soft layered shadows (`0 1px 2px` + `0 12px 32px` at 6–10%).
- **Texture:** blobs that morph slowly, gentle gradients, emoji or doodle accents used sparingly.
- **Imagery:** friendly photography, phone mockups, soft 3D or flat illustration.
- **Motion:** bouncy but kind. 0.5–0.9s, `back.out(1.6–2)` pops, floating chips with desynced bobs, phone demos that tap and scroll themselves.
- **Avoid:** childishness for adult products; too many pastels with no anchor colour.

## 5. Playful
**Good for:** kids, games, creator tools, events, food and drink brands with personality.
- **Type:** chunky rounded display with a clean text face. Pairings: Fredoka (G) + Inter (G) · Bricolage Grotesque (G) heavy + Figtree (G) · Clash Display (F) + Satoshi (F) · Gluten (G) for tiny accents only.
- **Scale:** body 17–18px, ratio 1.333–1.5 for display jumps, line-height 1.0–1.05 for display; letters can be individually coloured.
- **Palette:** 4–6 bright brand colours scattered across elements (not stacked as adjacent stripes, which reads as a flag), a solid ink colour and a light base.
- **Shape and depth:** chunky 3D buttons (`box-shadow: 0 6px 0 <edge>`, pressing down on click), stickers with tilts, thick outlines.
- **Texture:** doodles via CSS masks so they recolour, confetti on success moments.
- **Imagery:** characters, mascots, illustrated scenes.
- **Motion:** squash and stretch (`scaleX .6→1.1, scaleY 1.25→.9`, then settle with `elastic.out(1, .5)`), `back.out(2–3)` pops, sticker slaps with ±14° rotation, wiggles on hover.
- **Avoid:** motion on every element at once; illegible display fonts for body text.

## 6. Brutalist / Raw
**Good for:** creative studios, culture, music, fashion-adjacent brands, zines, manifestos.
- **Type:** grotesk at extreme sizes, or mono everything. Pairings: Space Grotesk (G) + Space Mono (G) · Archivo (G) wide and condensed widths · Familjen Grotesk (G) + JetBrains Mono (G) · Cabinet Grotesk (F).
- **Scale:** dramatic contrast. Body 16px against display up to 20–25vw. Ratio 1.5–1.618 at the top steps. All caps allowed for display.
- **Palette:** black, white and one loud colour (acid green, safety orange, pure red), or the raw system colours.
- **Shape and depth:** 0 radius, thick borders (2–3px), hard offset shadows (`6px 6px 0`), visible grid lines, overlapping elements.
- **Texture:** halftone, photocopy noise, marquees, stamps.
- **Imagery:** high-contrast black-and-white, cut-outs, scans.
- **Motion:** abrupt and confident. Hard cuts, `steps()` glitches, lift + hard-shadow hovers, marquees, text that scrambles and decodes.
- **Avoid:** accidental ugliness (broken alignment that isn't deliberate); unreadable contrast.

## 7. Luxury Minimal
**Good for:** hospitality, fashion, jewellery, real estate, high-end services, architecture.
- **Type:** refined serif or light wide sans, lots of tracking on small caps. Pairings: Cormorant Garamond (G) + Jost (G) · Libre Caslon Display (G) + Inter (G) light · Italiana (G) + Montserrat (G) light · Sentient (F) + Switzer (F).
- **Scale:** body 16–17px at weight 300–400, ratio 1.333–1.414, display 64–120px at light weights. Kickers in uppercase at +0.2 to +0.3em.
- **Palette:** ivory, stone, charcoal, black; one metallic or deep accent (champagne, bronze, bottle green) used rarely.
- **Shape and depth:** square corners, hairlines, almost no shadow; generous margins (section padding 160–240px on desktop).
- **Texture:** large photography carries the page; subtle grain at most.
- **Imagery:** full-bleed, slow, art-directed; portrait ratios (4:5) on mobile.
- **Motion:** slow and silky. Image reveals with `clip-path` over 1.4–2s, slow scale (1.08→1 over 2–3s), gentle parallax, cursor-following image previews on lists. No bounce.
- **Avoid:** busy layouts, many colours, playful easing, discount-style badges.

## 8. Warm Crafted
**Good for:** restaurants, cafés, bakeries, local businesses, makers, outdoor and travel brands.
- **Type:** characterful serif or slab with a warm sans; a hand-script accent only for one or two words. Pairings: Recoleta-style feel via Fraunces (G, soft + wonky axes) + Work Sans (G) · Zilla Slab (G) + Karla (G) · DM Serif Display (G) + DM Sans (G) · Caveat (G) for handwritten notes.
- **Scale:** body 17–18px, ratio 1.25–1.333, display 56–96px.
- **Palette:** earthy, food-adjacent (terracotta, olive, mustard, cream, deep brown), sampled from the business's real photos.
- **Shape and depth:** medium radii (8–14px), paper and card textures, tape and sticker details, slight rotations.
- **Texture:** paper grain, illustrated borders, stamps, menus that look printed.
- **Imagery:** real photos of the food, place and people, warm grade. Never stock.
- **Motion:** friendly and grounded. 0.7–1.1s `power3.out`, items that "place down" with a small rotation, a menu or map as the signature scene, hours and "open now" indicators that pulse gently.
- **Avoid:** tech-startup gradients; hiding the address, hours or booking under animation.

## 9. Tactile Product
**Good for:** productivity tools, finance apps, hardware, premium utilities, anything that wants to feel like a physical object.
- **Type:** precise sans with a warm serif for numerals or quotes. Pairings: DM Sans (G) + Fraunces (G) numerals · Hanken Grotesk (G) + Newsreader (G) · Manrope (G) + JetBrains Mono (G).
- **Scale:** body 16–17px, ratio 1.25, display 56–96px, tabular numerals everywhere numbers change.
- **Palette:** stone or paper neutrals with one brass, amber or indigo accent; an optional night mode section.
- **Shape and depth:** keycaps and wells. Layered shadows with an inset top highlight, an inset bottom hairline and outer shadows (`--raise`, `--key`, `--well` tokens). 10–16px radii, pressed states that move down 1–2px.
- **Texture:** fine grain, embossed or debossed text, engraved rules.
- **Imagery:** recreated product UI with real interactions, device frames.
- **Motion:** physical. Presses, toggles that click into place, rings and gauges that fill, counters, orbit or carousel motion with depth (scale, blur and opacity by distance).
- **Avoid:** mixing glass, neumorphism and flat in one page; skeuomorphism heavy enough to hurt legibility.

---

## Blending rules
- Take **type and palette** from one direction and **motion** from another, never type from two.
- Keep **one depth language** per site (flat, soft, hard offset, glass or tactile).
- If sub-pages (case studies, products) each wear their own brand, the shell (nav, footer, the main pages) stays in the main direction, so the site still feels like one place.


---

<!-- references/typography.md -->

# Typography

Type does most of the work of looking expensive. Good type with no animation beats great animation on bad type, every time.

**Contents:** Choosing families · Pairing · Scale ratios · Fluid sizes · Size targets · Line-height · Tracking · Measure · Weights · Details that read as craft · Hierarchy recipe · Loading · Type in motion · Audit

---

## Choosing families

Give each family a job:
- **Display:** headlines and big numbers. It carries personality.
- **Text:** paragraphs and UI. It carries legibility.
- **Mono (optional):** labels, code, data, technical eyebrows.
- **Accent (optional):** a serif italic or script for one or two words per heading. It is never used for whole sentences.

Most sites need two families plus an optional mono. Editorial sites can use three. If one family has the widths, weights and optical sizes you need, use it alone.

Match the classification to the voice:

| Voice | Classification | Free examples |
|---|---|---|
| Neutral, modern, precise | Neo-grotesk | Inter, Inter Tight, Geist, Switzer (F), IBM Plex Sans |
| Modern with character | Grotesque with quirks | Space Grotesk, Bricolage Grotesque, Familjen Grotesk, Schibsted Grotesk, Cabinet Grotesk (F) |
| Confident, geometric | Geometric sans | Satoshi (F), General Sans (F), Outfit, Plus Jakarta Sans, Manrope |
| Warm, human | Humanist sans | Source Sans 3, Work Sans, Karla, Figtree, Hanken Grotesk |
| Friendly, soft | Rounded | Nunito, Quicksand, Fredoka |
| Literary, premium | Transitional / modern serif | Fraunces, Newsreader, Source Serif 4, Libre Caslon, Erode (F), Sentient (F) |
| Fashion, luxury | Didone / display serif | Playfair Display, DM Serif Display, Cormorant Garamond, Italiana |
| Expressive accent | Serif italic | Instrument Serif, Fraunces Italic, Newsreader Italic |
| Sturdy, grounded | Slab | Zilla Slab, Roboto Slab, Arvo |
| Technical | Mono | JetBrains Mono, Geist Mono, IBM Plex Mono, DM Mono, Space Mono |

(G = Google Fonts unless marked F = Fontshare.)

Prefer **variable fonts**: one file, every weight, and an optical-size axis on families like Fraunces, Newsreader and Inter 4.

## Pairing

- **Contrast in structure, harmony in proportion.** Pair a serif with a sans, or a wide face with a narrow one, but choose faces with similar x-heights so they sit together on a line.
- **One face talks, the other listens.** The display face can be loud; the text face should disappear.
- **Never pair two similar sans faces** (e.g. Inter + Roboto). It reads as a mistake.
- **Accent words:** a serif italic inside a sans headline, sized up `1.05–1.15em` to match the sans x-height, sometimes in the accent colour. Use it once or twice per heading at most.
- **System stacks** are a valid choice for speed and native feel: `system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`; `ui-serif, Georgia, serif`; `ui-monospace, SFMono-Regular, Menlo, monospace`. Use `ui-serif` first when the product is an Apple app; it gives you New York.

## Scale ratios

Pick a ratio for the text steps by surface, and treat display sizes as separate, deliberate jumps:

| Ratio | Name | Use for |
|---|---|---|
| 1.125 | Major second | Dense app UI, dashboards |
| 1.2 | Minor third | Product UI, docs |
| 1.25 | Major third | General marketing, most sites |
| 1.333 | Perfect fourth | Editorial, marketing with impact |
| 1.414–1.5 | Augmented fourth / fifth | Poster-like display steps |
| 1.618 | Golden | Top display steps only |

Typical steps from a 17px base at 1.25: 13.6 (small) · 17 (body) · 21 (h4) · 26.6 (h3) · 33 (h2) · 41.5 (h1). Then a display step at 2–4× h1, set by eye.

## Fluid sizes

Use `clamp()` with `rem` + `vw`, so sizes scale with the viewport *and* still respond to browser zoom:

```
slope     = (maxPx - minPx) / (maxVw - minVw)
intercept = minPx - slope * minVw
font-size: clamp(minPx/16 rem, intercept/16 rem + slope*100 vw, maxPx/16 rem)
```

Example (body 16→18px between 360 and 1440px): slope = 2/1080 = 0.00185; intercept = 16 − 0.00185 × 360 = 15.33px → `clamp(1rem, 0.958rem + 0.185vw, 1.125rem)`.

For hero display type, cap by height too, so short laptops don't overflow: `clamp(3.5rem, min(10vw, 17svh), 11.5rem)`.

## Size targets

| Role | Phone | Desktop |
|---|---|---|
| Body (marketing) | 16–17px | 17–19px |
| Body (app UI) | 15–16px | 14–16px |
| Small / meta | 13–14px | 13–14px |
| Uppercase labels / eyebrows | 11–12px | 11–13px |
| H3 | 20–22px | 24–30px |
| H2 | 28–34px | 40–64px |
| H1 | 36–44px | 56–96px |
| Hero display | 44–64px | 88–184px |
| Big numbers / stats | 40–56px | 64–120px |

Never go below 12px for anything meant to be read, or below 16px for form inputs on iOS (smaller inputs make Safari zoom in).

## Line-height

| Size | Line-height |
|---|---|
| Display (>64px) | 0.86–1.0 |
| H1–H2 | 1.0–1.15 |
| H3–H4 | 1.2–1.3 |
| Body | 1.5–1.7 (longer lines need more) |
| UI text | 1.4–1.5 |
| Uppercase labels | 1.1–1.3 |

Use unitless values. Display type below 1.0 needs `padding-bottom: .08em` on clipped reveal wrappers so descenders survive.

## Tracking (letter-spacing)

The bigger and heavier the type, the tighter it should be. The smaller and the more capitals, the looser:

| Case | Tracking |
|---|---|
| Display 800–900 weight | −0.045 to −0.065em |
| Display 400–700 | −0.02 to −0.04em |
| H2–H3 | −0.01 to −0.03em |
| Body | 0 (fonts are spaced for it) |
| Small text (<14px) | +0.005 to +0.01em |
| Uppercase labels | +0.06 to +0.16em (luxury up to +0.3em) |
| Mono labels | +0.04 to +0.12em |

Keep a short list of tracking tokens (e.g. `--track-display`, `--track-head`, `--track-label`). Twelve slightly different values is drift.

## Measure (line length)

- Body: 60–75 characters (`max-width: 65ch`). Hard limits: 45–90ch.
- Lead paragraphs: 50–60ch at a larger size.
- Headlines: 12–20 characters per line reads as designed; use `text-wrap: balance`.
- Captions and side notes: 30–45ch.

## Weights

- Load only the weights you use (check that every `font-weight` in the CSS exists in what you load; missing weights get synthesised and look smeared).
- 3–4 weights per family is plenty: e.g. 400 text, 500 UI, 600–700 headings, 800–900 display.
- Hierarchy needs a visible weight gap: at least 200 units between body and headings, or a family change.
- Light weights (300) only at large sizes or on luxury directions, never for small grey text.

## Details that read as craft

- `text-wrap: balance` on headings, `text-wrap: pretty` on paragraphs (no orphans).
- `font-variant-numeric: tabular-nums` on counters, prices in tables, timers and stats, so digits don't jitter. Old-style numerals (`oldstyle-nums`) in editorial body text.
- `font-optical-sizing: auto` for variable fonts with an `opsz` axis.
- `font-feature-settings`: turn on the font's nicer alternates where they exist (`ss01`, `cv11` for Inter's single-storey a, `case` for punctuation that sits right next to capitals).
- `-webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale` on light-on-dark text.
- `hanging-punctuation: first` (Safari) for pull quotes; or a negative text-indent on opening quotes.
- Links: `text-underline-offset: .2em; text-decoration-thickness: 1px` (or `from-font`), and a colour shift on hover.
- `hyphens: auto` with a correct `lang` attribute for narrow columns in long-word languages.
- Curly quotes, real apostrophes, en and em dashes: flag straight quotes in the log. Typographic fixes inside copy are still the owner's call.
- Uppercase only for short labels; never for paragraphs.
- `::selection` in the brand accent with readable ink.

## Hierarchy recipe

Each level should differ from its neighbours by at least **two** of: size, weight, colour, case, family. A typical marketing stack:

1. **Eyebrow:** 11–12px, uppercase, +0.12em, mono or sans, accent or muted colour.
2. **Headline:** display family, 2–4× body size, tight tracking, ink colour, balanced wrap.
3. **Lead:** 1.15–1.3× body, secondary ink, 50–60ch.
4. **Body:** text family, primary or secondary ink.
5. **Meta:** small, muted, often tabular.

## Loading

- One font source. Self-host (best) or a single CDN; preconnect if using a CDN.
- `preload` the one or two files used above the fold (`<link rel="preload" as="font" type="font/woff2" crossorigin>`).
- `font-display: swap` for display and body (or `optional` for body when layout stability matters most).
- Prevent layout shift with **fallback metric overrides**: an `@font-face` for a local fallback with `size-adjust`, `ascent-override`, `descent-override` and `line-gap-override` tuned to the web font. Tools: Capsize, Fontaine; `next/font` and Astro's font tooling do it automatically.
- Subset to the languages you need. Aim for ≤4 font files on first paint.
- Re-measure scroll animations after fonts load (`document.fonts.ready`); text width changes move trigger positions.

## Type in motion

- Split into letters only at display sizes, and only for one or two headings per page. Split body text into words at most, and only for reading-paced reveals.
- Keep words unbreakable when splitting (`inline-block; white-space: nowrap` word wrappers).
- Keep the accessible name: `aria-label` on the parent with the full text, `aria-hidden` on the spans.
- Release `will-change` after one-off reveals; hundreds of promoted letters cost memory.
- Animating `letter-spacing` or `font-size` causes layout work. Use it only on a small, contained element, as a deliberate moment.

## Audit

```bash
grep -rhoE "font-family:[^;]+" src | sort | uniq -c | sort -rn | head      # stacks repeated instead of tokenised
grep -rhoE 'font-weight:\s*[0-9]+' src | sort | uniq -c                      # compare with weights you load
grep -rhoE 'font-size:\s*[0-9.]+(px|rem)' src | sort | uniq -c | sort -rn    # size sprawl (more than ~10 distinct = no scale)
grep -rhoE 'letter-spacing:\s*-?[0-9.]+em' src | sort | uniq -c | sort -rn   # tracking sprawl
grep -rhoE 'line-height:\s*[0-9.]+' src | sort | uniq -c | sort -rn
```


---

<!-- references/layout-and-scale.md -->

# Layout and scale

Consistent sizing is invisible when it's right and nags when it's wrong. Use a small number of sizes, and make the relationships between them deliberate.

## Spacing scale

Base 4px, mostly 8px steps:

`4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96 · 128 · 160`

- **Proximity:** space inside a group < space between groups < space between sections. Aim for roughly 1 : 2 : 4 (e.g. 12px between a label and its title, 24px between title and body, 48–64px between blocks, 96–160px between sections).
- **Section padding** is fluid: `--section-y: clamp(72px, 10vw, 160px)`. Luxury and editorial go larger (up to 240px); dense SaaS goes smaller (64–112px).
- **Vary the rhythm.** Alternate dense and airy sections; give a full-bleed "breather" every 2–3 sections. Identical padding everywhere is a sign of a template.

## Containers and gutters

| Container | Width | Use for |
|---|---|---|
| Text | 60–75ch (≈ 640–720px) | Articles, long body copy |
| Content | 1080–1280px | Most sections |
| Wide | 1360–1440px | Hero, galleries, product shots |
| Full bleed | 100vw | Colour blocks, images, marquees |

Gutters: `--gutter: clamp(16px, 4vw, 48px)`, i.e. 16–20px on phones, 24–32px on tablets, 32–64px on desktop. Use the same gutter for the nav, sections and footer, so edges line up all the way down the page.

## Grid

- 12 columns on desktop, 8 on tablet, 4 on phone; column gap 16–32px.
- Prefer **asymmetric splits** (5/7, 4/8, 7/5) over 6/6 for text + media; they feel composed.
- Break the grid on purpose once or twice per page (an image bleeding off the edge, a huge number hanging into the margin). Breaking it everywhere is chaos; never breaking it is a template.
- Use container queries (`container-type: inline-size`, `cqw` units) for components that appear at several widths; media queries for page layout.

## The first screen

- Show what this is, why it matters, and one primary action, plus a visible hint that there's more (the next section peeking in, a tilted band, an overlapping device, a masked fade at the bottom).
- Use `svh` / `dvh` for full-height sections on mobile (`100vh` jumps with the address bar).
- Don't put the whole page's message above the fold. It's the trailer, not the film.

## Radius

Radius is personality. Choose one scale and stick to it:

| Personality | Radii |
|---|---|
| Swiss, brutalist, luxury, editorial | 0–4px |
| Neutral product | 6–10px |
| Friendly, soft | 14–24px |
| Chips, tags, primary buttons (optional) | 999px |

Nested corners: **inner radius = outer radius − padding**, or rounded cards inside rounded cards look wrong.

## Elevation (pick one depth language)

| Language | Recipe | Fits |
|---|---|---|
| Flat + hairlines | `1px` borders at 8–12% ink, no shadows | Swiss, editorial, luxury |
| Soft | layered shadow: `0 1px 2px rgb(0 0 0/.06), 0 8px 24px rgb(0 0 0/.08)` | Friendly, product |
| Hard offset | `6px 6px 0 var(--ink)`, element lifts `translate(-4px,-4px)` on hover | Brutalist, playful |
| Glow | `0 0 40px color-mix(in srgb, var(--accent) 30%, transparent)` | Cinematic dark |
| Glass | `backdrop-filter: blur(12–20px) saturate(160–190%)`, inner 1px ring, translucent fill | Floating chrome only (nav, toasts, pills) |
| Tactile | inset top highlight + inset bottom hairline + outer shadows | Tactile product |

Mixing languages (glass cards beside neumorphic buttons beside flat panels) is the fastest way to look incoherent. Tokenise the offsets and blur values.

## Touch and interaction sizes

- Tap targets ≥ 44×44px (WCAG 2.5.8 minimum is 24px; Apple says 44, Material 48). Expand hit areas with padding or `::after`, not bigger visuals.
- Buttons: height 40–48px desktop, 44–52px mobile; horizontal padding ≈ 1.25–1.75× the height's half.
- Inputs: ≥ 44px tall, 16px+ text on iOS.
- Icons: size to the text they sit with (1–1.25em). One icon set, one stroke width (1.5–2px at 24px).

## Imagery

- Pick 2–3 aspect ratios and reuse them: 16:9 (wide), 4:3 or 3:2 (content), 1:1 (avatars, grids), 4:5 (portrait, great on phones).
- Always set `aspect-ratio` or width/height to prevent layout shift; `object-fit: cover` with a deliberate `object-position`.
- Art-direct with `<picture>`: a different crop for phones, not just a smaller file.
- Hero images: `fetchpriority="high"` and preloaded; everything else `loading="lazy"`.
- Treat photos consistently (same grade, same duotone, same rounding).

## Breakpoints

Content decides, but keep them as tokens and use only those: typically `640 / 768 / 1024 / 1280`, plus one "pin" breakpoint for motion (desktop pins above ~900px wide *and* below ~1300px tall; phones and very tall windows get loops). The JS pin media query and the CSS pinned layout must use the same numbers.

## Density by surface

| Surface | Body | Spacing feel |
|---|---|---|
| Marketing | 17–19px | Airy, large section gaps |
| App / dashboard | 14–16px | Compact (4/8/12 inside components), consistent rows |
| Docs | 16–18px | Text container, generous line-height |
| E-commerce grid | 14–16px | Tight grid, generous product page |

## Z-index scale

`--z-bg: -1 · --z-base: 0 · --z-raised: 10 · --z-sticky: 50 · --z-nav: 100 · --z-overlay: 200 · --z-toast: 300`. Local stacking inside a component can use 1–3. Nothing else.


---

<!-- references/color.md -->

# Colour

Colour should mean something. A small set of roles, used consistently, looks more expensive than a big palette used freely.

## Roles, not hexes

Components only ever use roles:

| Role | Purpose |
|---|---|
| `--c-bg` | Page background |
| `--c-surface`, `--c-surface-2` | Raised areas (cards, panels, menus) |
| `--c-ink`, `--c-ink-2`, `--c-ink-3` | Text: primary, secondary, muted |
| `--c-line`, `--c-line-2` | Borders and dividers |
| `--c-accent` | Primary action and brand highlight |
| `--c-accent-ink` | Text on top of the accent |
| `--c-accent-soft` | Tinted backgrounds for the accent (`color-mix` 10–16%) |
| `--c-ok`, `--c-warn`, `--c-danger`, `--c-info` | States |
| `--c-focus` | Focus ring (often the accent) |

Light "acts" or sub-brands override these roles inside a scope. They never add new literals.

## Building ramps

Build each hue as an 11-step ramp (50–950) in **OKLCH**, which keeps lightness steps perceptually even:
- Lightness from about 0.98 (50) to 0.18 (950).
- Chroma peaks around steps 400–600 and drops towards both ends, so the extremes don't look neon or muddy.
- Keep the hue constant, or shift it slightly (warmer in the darks for warm brands).

```css
--brand-500: oklch(0.62 0.19 255);
--brand-100: oklch(0.94 0.04 255);
--brand-900: oklch(0.26 0.08 255);
```

**Tinted neutrals:** give the greys a hint of the brand hue (chroma 0.005–0.02). Pure grey next to a coloured brand looks unfinished.

## Contrast

- WCAG AA: 4.5:1 for body text, 3:1 for large text (≥24px, or ≥18.66px bold) and for UI parts (input borders, icons, focus rings).
- Aim higher for body (7:1 is comfortable). Secondary text is where sites usually fail; check `--c-ink-2` and `--c-ink-3` on every surface they appear on.
- Never rely on colour alone for state; pair it with an icon, text or shape.

## Accent budget

- Roughly 60% base, 30% supporting neutrals or surfaces, 10% accent.
- One accent for actions. A second accent only with a clear job (e.g. highlights in content vs buttons).
- Multi-colour brands: scatter the colours across elements. Stacking them as adjacent parallel bands reads as a flag. Do it only when that's the point.

## Dark mode and dark designs

- Don't invert. Build a separate set of roles.
- Surfaces get *lighter* as they rise (elevation = lightness), instead of relying on shadows.
- Lower the accent's chroma slightly on dark backgrounds, or it vibrates.
- Off-black and off-white (`#0a0a0a` / `#f0f0f0`) are easier on the eyes for large areas; pure black is fine for cinematic, OLED-first designs.
- Set `color-scheme: dark` so form controls and scrollbars match.
- Respect `prefers-color-scheme` if the site offers both; let a stored choice override it.

## Gradients, glows and texture

- Interpolate in OKLCH to avoid muddy middles: `linear-gradient(in oklch, var(--a), var(--b))`.
- Prefer radial "light sources" behind content to big diagonal rainbow gradients.
- Glows: `color-mix(in srgb, var(--c-accent) 30–40%, transparent)` as `box-shadow` or `text-shadow` on one element per viewport.
- Grain: an inline SVG `feTurbulence` tile as a data-URI at 3–8% effective opacity. Check it's actually visible, or it's wasted bytes.

## Brand skins (sub-pages with their own identity)

```css
.skin-acme { --c-bg: #0c2748; --c-ink: #f4f7ff; --c-accent: #6fa8ff; --font-display: 'Bricolage Grotesque', sans-serif; }
body:has(.skin-acme) { --c-accent: #6fa8ff; } /* so the nav, progress bar and selection outside the scope follow */
```

Also set `<meta name="theme-color">` for the page, and check that the scroll-progress bar, nav tint, `::selection` and focus ring all read the role tokens.

## Audit

```bash
grep -rhoE '#[0-9a-fA-F]{6}\b' src | sort | uniq -c | sort -rn | head -25   # repeated literals → token candidates
grep -rhoE 'rgba?\([^)]*\)' src | sort | uniq -c | sort -rn | head -25
grep -rn 'color-mix\|oklch' src | wc -l
```

Look for near-duplicates (`#F5F1E8` vs `#F2F0EB`, `#FFB000` vs `#FFB648`) with no reason to differ, and for brand values that disagree between a data file and the page that uses them.


---

<!-- references/motion.md -->

# Motion

The menu of techniques, ranked by how much each one defines the feel, with working values. Values are written for GSAP + ScrollTrigger, but the ideas translate to any library (see the adapters in `motion-kernel.md`).

- **Primary:** signature techniques. A marketing page needs one or two.
- **Secondary:** supporting polish that makes the primaries feel deliberate.
- **Tertiary:** details nobody consciously notices. They're why the site feels expensive rather than just "animated". Make them your default way of writing code.

**Contents:** Five ideas · Personality tables · Section transitions · Primary · Secondary · Tertiary · Using the catalog

---

## Five ideas underneath everything

1. **The background is a stage; the content performs on it.** Themes can be fixed layers that change *under* normally scrolling content, so scrolling feels like travelling between worlds.
2. **Every boundary gets its own transition.** Repeating one transition is what makes sites feel templated.
3. **State is a 0..1 number on a CSS custom property.** The library tweens `--p`, `--on`, `--done`, `--draw`; CSS turns them into visuals with `calc()` and `color-mix()`. Scrubbing backwards is free.
4. **One timeline, two drivers.** Each scene is written once as a paused timeline. Desktop scrubs it with a pin; phones loop it in real time while it's on screen.
5. **The finished state ships in HTML.** JS only adds hidden "from" states after the library loads. Nothing can get stuck invisible.

## Personality tables

| Token | Calm / editorial | Playful | Technical | Cinematic |
|---|---|---|---|---|
| Reveal | `y 22, 1.6s, power2.out` | `y 30, .7s, back.out(1.6)` | `y 20, .7s, power3.out` | `y 32, .95s, power3.out` |
| Headline | words fade 1.4s, stagger .08 | letters pop `back.out(2)`, stagger .03 | letters `power3.out .8s`, stagger .02 | letters rise from mask `power4.out 1.05s`, stagger .022, rotate 5° |
| Pop | none, use a fade | `back.out(2.4)` + squash/stretch | `back.out(1.4)` | `back.out(1.7)` |
| Scrub smoothing | 1–1.5 | .4 | .5 | .5–.7 (edges that track scroll: `true`) |
| Element stagger | .15–.22 | .05–.07 | .05–.08 | .08–.12 |
| Hover | 0.6s, no overshoot | springy (`cubic-bezier(.34,1.56,.64,1)`) | 0.15–0.25s | lift + shadow or glow, `cubic-bezier(.16,1,.3,1)` 0.45s |
| Ambient loops | slow drift 14–22s | bobs 3–6s | data ticks, flow dashes | starfields, comets, marquees 38–70s |

Keep at most three overshoot strengths per site (e.g. soft 1.3, normal 1.7, big 2.4). Drifting to a dozen different values is noise.

---

## Section transitions

Choose per boundary. Never use the same one twice in a row on a page.

| Transition | How | Feels |
|---|---|---|
| **Diagonal wipe** | A full-screen layer rotated by `atan2(h*0.3, w)` with an inner layer counter-rotated by the same amount, so the content stays still while a diagonal edge sweeps. Scrub `true` (1:1, no lag), `ease: 'none'`, repaint on refresh. Transform-only, so it stays smooth. | Physical, dynamic |
| **Paper edge + scan line** | On each scroll update: `clip-path: inset(${clamp(section.top, 0, innerHeight)}px 0 0 0)` on a fixed layer; a 2px line with a soft halo rides the edge and fades. | A sheet printing or sliding up |
| **Circular iris** | `clip-path: circle(0% at 50% 100%) → circle(150% at 50% 100%)`, `scrub: .5`. | A bloom; soft |
| **Hard colour-block cut** | Full-bleed sections in contrasting colours, with a "breather" band between dense ones. | Editorial, confident |
| **Background colour tween** | During a pinned scene, tween the section background from one palette to the next in the same beat as the content changes. | A brand or mood shift |
| **Curtain lift** | The next section is `position: sticky; top: 0` underneath; the current one scrolls away like a card. | Layered, deck-of-cards |
| **Horizontal hand-off** | A pinned horizontal strip; the last panel's colour becomes the next section's background. | Journey |
| **Horizon split** | A pseudo-element from mid-section downwards paints a second palette (day/night, before/after) behind content. | Narrative contrast |
| **Brand hand-off panel** | The end of the page shows a panel in the *next* page's colours (next case study, next product). | Leaving into somewhere |
| **Reduced motion** | Same palettes, switched discretely at `top 55%` via a toggle instead of animated. | Story kept, motion removed |

Implementation pattern: a fixed `.themes` layer (`position: fixed; inset: 0; z-index: -1`) holding one hidden layer per act; a `has-themes` class on `<html>` turns it on only when JS is running; without it, each section paints its own background.

---

## PRIMARY

**P1. Hero as an opening title sequence.** One timeline with overlapping cue points, not chained delays:
- Panels or images clip open (`clipPath: inset(100% 0 0 0) → inset(0)`, 1.2s `expo.out`, stagger .09).
- Art settles (`yPercent 18, scale 1.08 → 0, 1`, 1.6s). Then `clearProps: 'transform'` so hover transforms are free afterwards.
- Headline letters rise from a mask (`yPercent 110`, 1s `power4.out`, stagger .03) at t≈0.45.
- Body and CTAs fade up (`y 16`, .7s, stagger .04) at t≈0.9.

On scroll (desktop), the hero dismantles in reverse with `scrub: .5`. Use `fromTo` + `immediateRender: false` so an early scroll doesn't capture a half-finished intro.

**P2. The next section peeks in.** The first screen must never look like the whole page:
- A band or marquee starts tilted (−4° to −6°) and lifted so about two-thirds of it sticks up above the fold. It straightens to 0° as you scroll (`scrub: true`, function-valued lift with `invalidateOnRefresh`).
- Or the hero bottom dissolves: `mask-image: linear-gradient(to bottom, #000 58%, transparent 97%)`.
- Or a device overlaps the next section with a negative margin.

**P3. Letter-rise headlines.**
- Split into word wrappers (`inline-block; overflow: hidden; white-space: nowrap`) holding character spans.
- Tween: `yPercent 110–118, rotate 5–7°, opacity 0` → rest; 1.05–1.3s, `power4.out` or `expo.out`, stagger .022–.04; trigger `top 88%`, once.
- Word padding `.06em .02em .12em` with matching negative margins keeps descenders and italics unclipped.
- Variant for a final call to action: random rotation ±15°, `y 40`, stagger .015.

**P4. Reading-paced sentence.** Words start at `opacity .13` and light up in order: `stagger .1–.12, ease: 'none'`, `scrub: .5`, `top 80% → bottom 45%`. A highlight underline or accent bar draws at the end of the same timeline. Calm brands: stagger .5, `scrub: 1.2`, with a slow parallax image behind.

**P5. Pinned product story.**
- `build()` returns a paused timeline.
- Desktop: `ScrollTrigger.create({ trigger, start: 'top top', end: '+=200–260%', pin, scrub: .6, animation: tl, anticipatePin: 1 })`.
- Phones and very tall windows: wrap it in `timeline({ repeat: -1, repeatDelay: 1 }).add(tl.tweenFromTo(0, tl.duration(), { ease: 'none' }))` and play it only while visible.
- Text that can't be tweened (phase labels, counts) is derived from the playhead in `onUpdate`, guarded so it only writes on change.
- Finish with an empty hold tween (`tl.to({}, { duration: .9 })`) so the final state stays on screen.

Story ideas by domain:
- SaaS: problem → product working → result.
- Restaurant: ingredients → dish → table.
- Agency: brief → process → launch.
- Nonprofit: one person's story with numbers rising.
- E-commerce: product exploded into parts, then reassembled.
- Service: before → during → after.

**P6. State as 0..1 custom properties.**
- Tween `--p`, `--on`, `--ok`, `--draw`.
- CSS: `scaleX(var(--p))`, `color-mix(in srgb, var(--c-danger) calc(var(--bad)*100%), var(--c-ok))`, `stroke-dashoffset: calc(100 - var(--p)*100)` on a `pathLength="100"` path, `background-size: calc(var(--m)*100%) 100%` for highlighter sweeps.
- Register the ones you animate with `@property` when you need real interpolation of colours or angles.

**P7. Living recreations instead of screenshots.** Rebuild the product's UI (or the menu, the booking form, the dashboard) in HTML/CSS and let it act:
- **Typing:** tween a counter and slice a string, writing only when the length changes. It's scrub-safe and reversible. Stream AI replies word by word.
- **Fake taps:** add a pressed class for about 220ms plus a soft "finger" dot that scales up and fades.
- **Toasts** that pop with `back.out(1.7)` and auto-dismiss. Kill previous tweens first so they don't stack.
- **Ambient UI events:** counters, clock changes, typing indicators, a notification that buzzes (`x: 5, .06s, repeat: 5, yoyo`).
- **Playback:** play once on scroll-in plus a **Replay** button calling the same idempotent `play()` (reset, kill, rebuild).
- **Honesty:** label it "Recreated with demo data" when it isn't the live product.

**P8. Sub-pages wear their subject's brand.** A scoped token override per product or case study, including the browser chrome: scroll-progress bar, nav tint, `theme-color`, `::selection`. Section labels use that brand's idiom (mono tags, numerals, lowercase voice).

**P9. Pinned horizontal strip.** `x: () => -(track.scrollWidth - track.clientWidth)`, `end: () => '+=' + distance`, `scrub: .6`, `invalidateOnRefresh`. Inside, per-panel triggers use `containerAnimation` (visual slides in `x 140 → 0` between `left 95%` and `left 40%`, text rises). Each panel can re-theme itself via custom properties.

**P10. Morph and before/after.**
- **Word morph:** shared letters glide between two words. Measure `offsetLeft` deltas after fonts load and add an arc (up with `sine.out`, down with `sine.in`). Dropped letters fall with rotation and blur; new letters drop in.
- **Before/after wipe:** `clip-path: inset(0 0 0 100%) → inset(0)` with a glowing handle sliding in sync.

**P11. Interactive panel sets.**
- **Accordion row:** hovered panel `flex-grow: 1.7–2.7`, others shrink, `.8s` ease-out.
- **Chamfered corners** that flip on hover (`clip-path: polygon()` morph).
- **Light edge:** a conic gradient travelling around a 1px ring via a registered `@property --angle`.
- **Media:** desaturated at rest, full colour on hover.
- **Spotlight:** a pointer-following `radial-gradient(circle at var(--mx) var(--my))`.
- **Titles:** text that scrambles and resolves on hover *and* focus.
- **Details:** revealed with `grid-template-rows: 0fr → 1fr`.

**P12. Exploded layers.** The same component rendered as N stacked slices (`translateZ(calc(var(--i) * var(--gap)))` in `perspective: ~1900px`), scrubbed apart via `--rx`, `--rz`, `--gap`. Hovering a layer name highlights its slice.

**P13. One DOM, many styles.** A single mock whose every visual property is a custom property per `[data-style]`. A universal transition (~.65s) morphs radius, shadow, font and blur together as the visitor scrolls or clicks through styles.

---

## SECONDARY

- **Multi-speed parallax:** `data-speed` per element (0.6–2) → `y: -speed*260, rotate: speed*50`, scrubbed. If the intro uses `y`, do parallax on `yPercent` so they never fight.
- **Seeded procedural decoration:** stars, stripes, shapes from a seeded random generator (e.g. `seed = seed * 16807 % 2147483647`), so it's identical on every build. Use one generator per use.
- **Knock-out halo instead of a card:** `background: var(--c-bg); box-shadow: 0 0 0 18px var(--c-bg)` behind text over busy art.
- **Counters:** proxy tween `{ v: 0 } → target`, 1.2–1.9s `power3.out`, formatted with `toLocaleString`, `tabular-nums`, trigger `top 90%`, once. Render the start value in HTML so it never flashes final → 0.
- **Nav that adapts:** sections declare `data-nav-theme="light|dark"`; a trigger at the nav's height flips the nav colours. Glass background after ~24px of scroll. The nav wrapper is `pointer-events: none` with links set to `auto`, so the empty bar never blocks clicks.
- **Magnetic primary button:** quick setters on `x` and `y` at about 0.2–0.3 of the pointer offset, fine pointers only, created after the intro finishes.
- **Tilt + spotlight cards:** `rotationX/Y` ±5–6° with quick setters, a lift of −8px, and a pointer spotlight whose strength is a tweened `--lit`. Perspective on the parent.
- **Deal-in cards:** `y 100, rotationX -34°, rotationZ [-4, 0, 4]`, origin bottom centre, 1.3s `expo.out`, stagger .12, then `clearProps: 'transform'`.
- **Self-drawing lines:** SVG `pathLength="1"`, `stroke-dashoffset 1 → 0`. Connector paths can be built at runtime from measured element centres and redrawn on refresh.
- **Sticky step viewer:** the active step is computed from positions (the last step whose top is above a line at about 55% of the viewport), never from enter/leave events alone. The step number rolls like a slot machine; art enters and exits in the scroll direction.
- **Hover languages** (pick one):
  - lift + hard shadow (`translate(-4px,-4px)` + `6px 6px 0`)
  - soft lift (`translateY(-4px)` + bigger soft shadow)
  - glow
  - chunky 3D press (`0 6px 0 edge` → `0 1px 0` on active)
- **Gated autoplay:** loops run only while visible, optionally only after the first scroll, and stop when the visitor takes control. Videos: poster, `preload="none"`, paused off-screen, with a manual play button if autoplay is refused.
- **Wrapper vs inner:** the library animates the wrapper and the CSS loop animates the inner element, so they never fight over one `transform`.
- **Container-query mock UIs:** size everything in `cqw` (or `--u: calc(100cqw / 1100)`), so a fake UI scales as one object.
- **Marquees:**
  - Duplicate the set and mark the second `aria-hidden`; animate `translateX(-50%)` linearly over 38–70s.
  - Fade the edges with a mask; alternate outline and solid words; pause on hover.
  - Reduced motion makes it a scrollable row instead.
- **Strike-throughs and highlighter sweeps** driven by a 0..1 variable, `power2.inOut`, .45–1.1s.
- **Squash and stretch** for playful brands; **confetti** for real success moments only (budgeted particle count, stops when empty).

## TERTIARY

- **Grain** via an inline SVG `feTurbulence` data-URI at 3–8% effective opacity.
- **A difference-blend wordmark** (`mix-blend-mode: difference`) spanning differently coloured panels. Its parent must not create a stacking context.
- **`clearProps` after intros**, `immediateRender: false` on chained `fromTo` tweens, function-valued positions with `invalidateOnRefresh`.
- **Loader hygiene:**
  - Lag smoothing off, so loops keep real time.
  - Ignore mobile resize for iOS address-bar jumps.
  - A debounced refresh after `load` and `document.fonts.ready`.
  - Wait for fonts (capped at ~1.8s) before measuring text.
- **Intro gate:** an inline head script hides only the hero parts, with a 2.5–3.5s failsafe. JS removes the class in the same tick it sets the from-states, and skips the intro if the failsafe already fired.
- **Negative animation delays** to desync identical loops.
- **Typography:** `tabular-nums`, `text-wrap: balance | pretty`, `::selection`, `theme-color`.
- **Hairline separators** with `box-shadow` (no layout shift).
- **An occasional glint:** a skewed sheen whose keyframes rest for 70% of a ~4s cycle.
- **Rotating circular stamps:** `textPath` with `textLength` matched to the circumference (2πr).
- **A comet on a closed path:** `pathLength="1000"`, `stroke-dasharray: 70 930`, dashoffset to −1000 on a loop, plus a blurred twin for glow.
- **`overflow-x: clip`** (not `hidden`) on wide sections, so sticky and pinned children still work.
- **Pin robustness:**
  - `anticipatePin`, and init in DOM order.
  - Stage sizes computed from viewport height, so scenes always fit.
  - A short-laptop media query (`min-width: 901px and max-height: 860px`) to compact titles.
- **Accessible demos:** `role="img"` + a descriptive label + `aria-hidden` internals, or real controls with real state. `aria-live` on narrated status lines.
- **Recolourable assets:** `background: var(--c-accent); mask: url(icon.svg) center/contain`.
- **Copy buttons** that fall back to selecting the text if the clipboard API fails.
- **Reduced motion still tells the story:** themes switch discretely, marquees scroll, demos show their final frame, and controls jump to the end.

---

## Using the catalog

- Per marketing page:
  - one primary as the signature
  - one transition per act change
  - 3–5 secondaries
  - tertiaries everywhere by default
- Don't put a pinned scene, a marquee, a parallax field and a decode effect in the same viewport. One loud idea, quiet support.
- When the owner names a reference site, describe its moves in this vocabulary so you can say exactly what you're borrowing.
- App UIs take only the secondary micro-interactions (hover, press, state changes at 120–250ms) and none of the scroll scenes.


---

<!-- references/motion-kernel.md -->

# Motion kernel

A small, portable layer that every animated block goes through: one loader for all pages, reduced-motion handling, refresh after fonts, text splitters, reveal helpers, pin media queries and a block registry. It has been used in production; adapt the file layout to the project.

Default stack: GSAP 3 + ScrollTrigger (free for all uses, including commercial). If the project already uses something else, keep these contracts on top of it; see "Stack adapters" at the end.

## Contracts

1. **Markup:** each animated block has `data-fx="<name>"` on its root. Effects only query inside their root.
2. **Finished state by default:** CSS renders the final, readable frame. JS adds `.is-live` (animated layout) and `.is-pinned` (pinned layout) only when it takes over.
3. **Registry:** `FX[name] = (el, m) => void | (() => void)`. Blocks run in DOM order (pins measure correctly), each inside try/catch (one broken effect never takes the page down).
4. **Reduced motion:** `loadMotion()` resolves `null`. The page stays in its finished state. **Interactive controls (Replay, toggles, tabs) must still work**: wire them before the motion check and make them jump to the final state.
5. **One timeline, two drivers:** scenes are a `build()` returning a paused timeline; desktop pins and scrubs it, phones loop it while visible.
6. **State lives in 0..1 custom properties** that CSS turns into visuals.

## `motion/core.ts`

```ts
// Shared motion kernel. Everything is visible without JS; hidden "from" states are only set after GSAP loads.
import type { gsap as GSAP } from 'gsap';
import type { ScrollTrigger as ST } from 'gsap/ScrollTrigger';

export type Gsap = typeof GSAP;
export type Motion = { gsap: Gsap; ScrollTrigger: typeof ST; refresh: () => void };

let loading: Promise<Motion | null> | null = null;
let timer: number | undefined;

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export const finePointer = () => matchMedia('(pointer: fine)').matches;

/** Desktop pins and scrubs; phones and very tall windows get self-playing loops. Keep in sync with --bp-* tokens. */
export const PIN_MEDIA = {
  desk: '(min-width: 901px) and (max-height: 1300px)',
  loop: '(max-width: 900px), (min-height: 1301px)',
};

export function loadMotion(): Promise<Motion | null> {
  if (reducedMotion()) return Promise.resolve(null);
  loading ??= (async () => {
    try {
      const { gsap } = await import('gsap');
      const { ScrollTrigger } = await import('gsap/ScrollTrigger');
      gsap.registerPlugin(ScrollTrigger);
      gsap.ticker.lagSmoothing(0); // loops stay on real time after a long frame
      ScrollTrigger.config({ ignoreMobileResize: true }); // iOS address bar
      const refresh = () => {
        clearTimeout(timer);
        timer = window.setTimeout(() => { ScrollTrigger.sort(); ScrollTrigger.refresh(); }, 200);
      };
      // The dynamic import may resolve after `load` fired, so check readyState instead of only listening.
      if (document.readyState === 'complete') refresh(); else addEventListener('load', refresh);
      document.fonts?.ready.then(refresh);
      if (import.meta.env?.DEV) Object.assign(window, { __gsap: gsap, __st: ScrollTrigger });
      return { gsap, ScrollTrigger, refresh };
    } catch {
      return null;
    }
  })();
  return loading;
}

/** Wait for fonts (capped) before measuring text positions. */
export const fontsReady = (cap = 1800) =>
  Promise.race([document.fonts?.ready ?? Promise.resolve(), new Promise((r) => setTimeout(r, cap))]);

/** Split into clipped words of characters for rise-in titles. Keeps nested inline elements and an accessible name. */
export function splitChars(el: HTMLElement): HTMLElement[] {
  if (el.dataset.split) return [...el.querySelectorAll<HTMLElement>('.fx-ch')];
  el.dataset.split = 'chars';
  el.setAttribute('aria-label', (el.textContent ?? '').replace(/\s+/g, ' ').trim());
  const chars: HTMLElement[] = [];
  const walk = (node: HTMLElement) => {
    [...node.childNodes].forEach((n) => {
      if (n instanceof HTMLElement) return walk(n);
      if (n.nodeType !== Node.TEXT_NODE) return;
      const frag = document.createDocumentFragment();
      (n.textContent ?? '').split(/(\s+)/).forEach((part) => {
        if (!part) return;
        if (/^\s+$/.test(part)) return frag.appendChild(document.createTextNode(' '));
        const word = document.createElement('span');
        word.className = 'fx-w';
        word.setAttribute('aria-hidden', 'true');
        [...part].forEach((c) => {
          const ch = document.createElement('span');
          ch.className = 'fx-ch';
          ch.textContent = c;
          word.appendChild(ch);
          chars.push(ch);
        });
        frag.appendChild(word);
      });
      node.replaceChild(frag, n);
    });
  };
  walk(el);
  return chars;
}

/** Wrap words in spans; code, links, strong and mark stay atomic. */
export function splitWords(el: HTMLElement): HTMLElement[] {
  if (el.dataset.split) return [...el.querySelectorAll<HTMLElement>('.fx-wd')];
  el.dataset.split = 'words';
  const out: HTMLElement[] = [];
  const walk = (node: Node) => {
    [...node.childNodes].forEach((n) => {
      if (n.nodeType === Node.TEXT_NODE) {
        const frag = document.createDocumentFragment();
        (n.textContent ?? '').split(/(\s+)/).forEach((part) => {
          if (!part) return;
          if (/^\s+$/.test(part)) return frag.appendChild(document.createTextNode(part));
          const s = document.createElement('span');
          s.className = 'fx-wd';
          s.textContent = part;
          frag.appendChild(s);
          out.push(s);
        });
        node.replaceChild(frag, n);
      } else if (n instanceof HTMLElement) {
        if (n.matches('code, a, strong, mark')) { n.classList.add('fx-wd'); out.push(n); }
        else walk(n);
      }
    });
  };
  walk(el);
  return out;
}

/** Setter that types an element's text from 0 (empty) to 1 (full). Scrub-safe; writes only on change. */
export function typer(el: HTMLElement) {
  const full = el.dataset.text ?? el.textContent ?? '';
  el.dataset.text = full;
  let last = -1;
  return (p: number) => {
    const n = Math.round(full.length * Math.min(1, Math.max(0, p)));
    if (n !== last) { last = n; el.textContent = full.slice(0, n); }
  };
}

/** One-off reveal trigger that still plays if a jump skips past it. */
export const once = (trigger: Element | string | null, start = 'top 85%') => ({
  trigger: trigger ?? undefined, start, once: true, toggleActions: 'play play play play',
});

/** Play a timeline only while its element is on screen. */
export function playInView(m: Motion, el: Element, tl: { play(): unknown; pause(): unknown }, start = 'top 85%') {
  m.ScrollTrigger.create({ trigger: el, start, end: 'bottom 10%', onToggle: (s) => (s.isActive ? tl.play() : tl.pause()) });
}

/** Hand CSS centring (translate -50% -50%) and rotate over to GSAP before it bakes them into pixels. */
export function adopt(m: Motion, els: HTMLElement[], vars: Record<string, unknown> = {}) {
  els.forEach((el) => { el.style.translate = 'none'; el.style.rotate = 'none'; });
  m.gsap.set(els, { xPercent: -50, yPercent: -50, ...vars });
}

/** Pointer-driven 3D tilt, fine pointers only. Target must not have a CSS transform transition. */
export function tilt(m: Motion, area: HTMLElement, target: HTMLElement, max = 6) {
  if (!finePointer()) return;
  const rx = m.gsap.quickTo(target, 'rotationX', { duration: 0.7, ease: 'power3' });
  const ry = m.gsap.quickTo(target, 'rotationY', { duration: 0.7, ease: 'power3' });
  area.addEventListener('pointermove', (e) => {
    const r = area.getBoundingClientRect();
    ry(((e.clientX - r.left) / r.width - 0.5) * max * 2);
    rx(-((e.clientY - r.top) / r.height - 0.5) * max * 1.5);
  });
  area.addEventListener('pointerleave', () => { rx(0); ry(0); });
}

/** Release will-change after a one-off intro so hundreds of split chars don't keep compositor layers. */
export const settle = (els: Element[]) => () => els.forEach((e) => ((e as HTMLElement).style.willChange = 'auto'));
```

## `motion/index.ts`: registry

```ts
import { loadMotion, type Motion } from './core';
import { hero } from './hero';
import { reveal, heading, words } from './sections';
// import set pieces…

type Fx = (el: HTMLElement, m: Motion) => void;
const FX: Record<string, Fx> = { hero, reveal, heading, words /*, 'product-demo': productDemo … */ };
// Effects that must work without motion (tabs, toggles, replay buttons that jump to the end).
const BASIC: Record<string, (el: HTMLElement) => void> = {};

export async function initMotion() {
  const blocks = [...document.querySelectorAll<HTMLElement>('[data-fx]')];
  blocks.forEach((el) => BASIC[el.dataset.fx ?? '']?.(el));
  const m = await loadMotion();
  if (!m) { document.documentElement.classList.remove('x-intro'); return; }
  for (const el of blocks) {
    try { FX[el.dataset.fx ?? '']?.(el, m); }
    catch (err) { if (import.meta.env?.DEV) console.error(`[fx] ${el.dataset.fx}`, err); }
  }
  m.refresh();
}
```

Call `initMotion()` once from the shared layout, so every page uses the same loader.

## Intro gate (inline in `<head>`)

```html
<script is:inline>
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const h = document.documentElement;
    h.classList.add('x-intro');
    setTimeout(() => h.classList.remove('x-intro'), 2600); // failsafe if JS never arrives
  }
</script>
<style>.x-intro [data-intro] { opacity: 0; }</style>
```

The hero effect removes `x-intro` **in the same tick** it sets its from-states. If the class is already gone (the failsafe fired), skip the intro rather than flash and replay.

## Dual-driver scene template

```ts
import { PIN_MEDIA, playInView, type Motion } from './core';

export function productDemo(el: HTMLElement, m: Motion) {
  const { gsap, ScrollTrigger } = m;
  const q = <T extends Element = HTMLElement>(s: string) => el.querySelector<T>(s)!;
  el.classList.add('is-live');

  function build() {
    const tl = gsap.timeline({ paused: true, defaults: { ease: 'power3.out' } });
    // Beats: tween 0..1 custom properties and transforms only.
    tl.fromTo(el, { '--p': 0 }, { '--p': 1, duration: 3, ease: 'none' }, 0);
    // …
    tl.to({}, { duration: 0.9 }); // hold the final state for the last stretch of scroll
    // Text/classes that can't be tweened: derive from the playhead, guarded.
    let last = -1;
    tl.eventCallback('onUpdate', () => {
      const k = Math.min(2, Math.floor(tl.time() / 3.6));
      if (k !== last) { last = k; q('.phase').textContent = `Phase ${k + 1}/3`; }
    });
    return tl;
  }

  gsap.matchMedia().add(PIN_MEDIA, (ctx) => {
    if (ctx.conditions?.desk) {
      el.classList.add('is-pinned');
      ScrollTrigger.create({
        trigger: el, start: 'top top', end: '+=240%', pin: q('.pin'),
        scrub: 0.6, animation: build(), anticipatePin: 1, refreshPriority: 1,
      });
      return () => el.classList.remove('is-pinned');
    }
    const tl = build();
    const loop = gsap.timeline({ paused: true, repeat: -1, repeatDelay: 1 });
    loop.add(tl.tweenFromTo(0, tl.duration(), { ease: 'none' }));
    playInView(m, el, loop, 'top 80%');
  });
}
```

## Standard section effects (`sections.ts`)

Values come from the motion tokens (`MOTION.md`); these are the defaults for a cinematic personality.

```ts
import { once, settle, splitChars, splitWords, type Motion } from './core';
type Fx = (el: HTMLElement, m: Motion) => void;

export const heading: Fx = (el, { gsap }) => {
  const chars = splitChars(el);
  gsap.from(chars, { yPercent: 115, rotate: 5, opacity: 0, duration: 1.05, ease: 'power4.out',
    stagger: 0.022, scrollTrigger: once(el, 'top 88%'), onComplete: settle(chars) });
};

export const reveal: Fx = (el, { ScrollTrigger, gsap }) => {
  const items = [...el.querySelectorAll('[data-reveal]')];
  ScrollTrigger.batch(items, { start: 'top 90%', once: true,
    onEnter: (b) => gsap.from(b, { y: 32, opacity: 0, duration: 0.95, ease: 'power3.out', stagger: 0.1, overwrite: true }) });
};

export const words: Fx = (el, { gsap }) => {
  const w = splitWords(el);
  gsap.set(w, { opacity: 0.13 });
  gsap.to(w, { opacity: 1, duration: 0.3, stagger: 0.1, ease: 'none',
    scrollTrigger: { trigger: el, start: 'top 80%', end: 'bottom 45%', scrub: 0.5 } });
};
```

## Act transitions

- **Diagonal wipe:** see `motion.md` § Section transitions. Paint function bound to the ScrollTrigger `onUpdate` and `onRefresh`, `scrub: true`.
- **Paper edge:** `clip-path: inset(${clamp(rect.top)}px 0 0 0)` on `onUpdate/onRefresh/onLeave/onLeaveBack`.
- **Iris:** `fromTo(layer, { clipPath: 'circle(0% at 50% 100%)' }, { clipPath: 'circle(150% at 50% 100%)', ease: 'none', scrollTrigger: { start: 'top bottom', end: 'top 12%', scrub: 0.5 } })`.
- **Reduced motion:** don't skip the theme change; switch it discretely with a ScrollTrigger `onToggle` at `top 55%`.

## Rules learned the hard way

- Never put a CSS `transition: transform` on an element GSAP drives every frame (mushy tilt), and remember GSAP's inline transform overrides CSS `:hover { transform }`. Put hover transforms on an inner element.
- Prefer `transform` / `opacity` / `clip-path`. Avoid tweening `left/top/width/height/letter-spacing`; if a story needs it, keep it to small stages.
- Use `yPercent` for parallax when the intro uses `y`, so they don't fight.
- Pin lengths derived from content (`() => '+=' + dist()`) feel consistent across screens; fixed `+=3000` doesn't.
- Time-based, not frame-based: rAF effects must use elapsed time (a 16-frame decode is 2× faster on 120Hz).
- Pause every infinite loop off-screen (ScrollTrigger `onToggle` or IntersectionObserver) and in hidden tabs.
- If the site later adds client-side navigation (view transitions), every effect must return a cleanup and the registry must revert a `gsap.context()` per page.

## Stack adapters

The contracts stay the same everywhere: finished state in HTML, one loader, a registry of blocks, dual-driver scenes, 0..1 custom properties, controls that work under reduced motion.

| Stack | Where the kernel lives | Notes |
|---|---|---|
| Plain HTML / static | `/js/motion/*.js` as ES modules, one `<script type="module">` in the layout | Same code without types. Load GSAP from npm via a bundler, or a pinned CDN version. |
| Astro | `src/motion/`, called from a `<script>` in the base layout | Astro bundles and dedupes the script. With `<ClientRouter />`, re-run `initMotion()` on `astro:page-load` and revert a `gsap.context()` on `astro:before-swap`. |
| Next.js / React | `lib/motion/`; blocks become components using `useGSAP()` from `@gsap/react` (scoped, auto-cleanup) | Mark animated components `'use client'`. Render the finished state on the server. For page transitions, revert contexts on unmount. Framer Motion / Motion is fine for micro-interactions; use ScrollTrigger for pins and scrubs. |
| Vue / Nuxt | `composables/useMotion.ts`; set up in `onMounted`, `ctx.revert()` in `onUnmounted` | Client-only plugin for the loader in Nuxt (`.client.ts`). |
| Svelte / SvelteKit | An action (`use:fx={'reveal'}`) that returns `destroy` | Gate on `browser`; keep the SSR output in its finished state. |
| WordPress / Shopify themes | Theme JS bundle enqueued once; `data-fx` attributes in templates or blocks | Respect the theme editor: re-init on section load events (`shopify:section:load`). No heavy scenes on product grids or checkout. |
| Webflow / no-code | Custom code embed in the site footer; `data-fx` as custom attributes | Keep Webflow's own interactions off for the same elements to avoid double animation. |
| CSS only (no JS budget) | `animation-timeline: view()` / `scroll()` for reveals and progress bars, `@starting-style` for entrances, View Transitions API for page changes | Wrap in `@supports (animation-timeline: view())` so unsupported browsers keep the finished state. Pins and complex scenes still need JS. |

Smooth scrolling (e.g. Lenis) is optional. If you add it, drive ScrollTrigger from it (`lenis.on('scroll', ScrollTrigger.update)`), respect reduced motion by not enabling it, and never hijack scroll on app or docs pages.


---

<!-- references/components.md -->

# Components: the craft details

For each common component: what "default" looks like, and the details that make it feel finished. Pick the ones that fit the direction. Every value comes from tokens.

## Navigation
- Same gutter as the page; logo left, 3–6 plain-language links, one primary action.
- Transparent over the hero, then a glass or solid bar after ~24px of scroll, with a 0.3s transition of background, border and blur.
- Colour adapts to the section underneath (`data-nav-theme` on sections, flipped by a scroll trigger at the nav's height).
- Wrapper `pointer-events: none`, children `auto`, so the empty bar never blocks clicks.
- Optional thin scroll-progress bar in the accent colour (animate `transform: scaleX()`, not `width`).
- Mobile: a full-screen or sheet menu with staggered links; `aria-expanded` on the toggle; body scroll locked while open; Escape closes it.
- `scroll-margin-top` on anchor targets equal to the nav height.

## Hero
- One promise (headline), one line of support, one primary and at most one secondary action, and one visual proof (product, place, person, result).
- An opening sequence (see `motion.md` P1) and a visible hint of the next section.
- Display type capped by viewport height so short laptops don't overflow.
- Two CTAs with different personalities: a filled primary and a quieter secondary (ghost, text link, or an object-like card such as tabs peeking out of a folder).

## Buttons
- At least four states: rest, hover, focus-visible, active, plus disabled or loading where relevant.
- Hover does more than change colour: lift, shadow change, an arrow that nudges (`translate(3px,-3px)`), a fill that sweeps.
- Active presses down (`translateY(1px)` or a smaller shadow).
- Focus ring: `outline: 2px solid var(--c-focus); outline-offset: 3px`, the same everywhere.
- Loading keeps the width (swap the label for a spinner in the same box).
- Icon buttons have an accessible name.

## Cards and features (alternatives to the bordered grid)
- **Poster tiles:** big type, a colour or image fill, and real hover behaviour (lift + shadow, chamfer morph, image zoom with colour returning).
- **Accordion row:** panels share a row; the hovered one grows.
- **Knock-out text** directly on the art, with no container at all.
- **Numbered editorial list:** large numerals, hairline rules, generous space.
- **Living demo per feature:** each feature shows itself working (a typing input, a counter, a toggle) instead of an icon.
- **Deal-in entrance** (rotationX from below, staggered) with `clearProps` afterwards.
- If you do use bordered cards, vary their sizes (bento layout) and give them a hover state with depth.

## Social proof
- Logos: a single-colour (ink at 50–70%) row or slow marquee with edge masks; full colour on hover is optional.
- Testimonials: a real photo, name, role and company; one big quote rather than six small ones; highlight a key phrase with a sweep.
- Numbers: big tabular numerals that count up once, with a unit and a one-line source.
- Case snippets: before → after, with the number that changed.

## Pricing
- 2–4 plans; recommend one visually (scale, border, badge), not with a neon glow.
- Prices in tabular numerals; a monthly/yearly toggle with a sliding thumb and an animated price change (counter or flip).
- Feature lists aligned row by row across plans; ticks and crosses with accessible text.
- The FAQ answers the objections you see in the pricing copy (flag any conflicts in the log).

## Forms
- Labels always visible (no placeholder-only fields); 44px+ inputs; 16px+ text.
- Inline validation on blur with a clear message and an icon, not just a red border.
- Success state as a moment: a check that draws itself, a message, the next step.
- Submit buttons show progress and prevent double submission.

## FAQ / accordions
- `<details>`/`<summary>`, or buttons with `aria-expanded`.
- Animate height with `grid-template-rows: 0fr → 1fr` (no JS height measuring).
- A rotating plus/chevron; one open at a time only if the content is long.

## Media
- Product shots in device frames that match the product (phone, browser, desktop app). One frame component, parameterised.
- Video: poster image, `muted playsinline loop`, `preload="none"` below the fold, paused off-screen, never autoplaying with sound.
- Galleries: consistent ratios, a horizontal snap rail on phones (`scroll-snap-type: x mandatory` + `scroll-padding`), offset items for rhythm on desktop.

## Calls to action and endings
- The last screen is a moment, not a dead stop: a big final headline (a different reveal energy, e.g. random letter rotation), the primary action, and a hand-off (next case study in its own colours, a booking strip, a newsletter).
- Repeat the primary CTA every 2–3 sections on long pages, styled consistently.

## Footer
- Same gutter and grid as the page; grouped links; contact details in plain text (addresses and hours for local businesses, never hidden behind animation).
- Legal links, copyright with the current year generated, not hard-coded.
- Optional: a huge wordmark or a closing marquee as the last visual beat.

## Empty, loading and error states (apps and forms)
- Skeletons that match the real layout; a subtle shimmer (1.4–1.6s linear sweep) that stops under reduced motion.
- Empty states with an illustration or icon, one sentence and one action.
- Errors in plain language, with what to do next.

## Accessibility baseline for every component
- A visible focus state equivalent to every hover state.
- Keyboard operable: Tab order follows the visual order; Escape closes overlays.
- Real elements first (`button`, `a`, `details`, `dialog`), ARIA only to fill gaps.
- Motion respects `prefers-reduced-motion`; auto-advancing content has a pause or stops on interaction.


---

<!-- references/design-system.md -->

# Design system

The site has to be coherent underneath the motion: one set of tokens, a small motion vocabulary, shared components, and two short docs that explain them. This file has the token template, the commands that find drift, and the doc templates.

## Token template

Replace the values with the chosen direction's; keep the role names. Tailwind v4 projects can declare these in `@theme`; CSS-in-JS projects can export the same names from a theme object. Either way, one source of truth.

```css
:root {
  /* Colour roles: no raw colours outside this file (see color.md) */
  --c-bg: oklch(0.99 0.004 85);   --c-surface: oklch(0.97 0.006 85);  --c-surface-2: oklch(0.94 0.008 85);
  --c-ink: oklch(0.2 0.01 85);    --c-ink-2: oklch(0.42 0.01 85);     --c-ink-3: oklch(0.58 0.01 85);
  --c-line: oklch(0.2 0.01 85 / .12);  --c-line-2: oklch(0.2 0.01 85 / .22);
  --c-accent: oklch(0.6 0.18 255);     --c-accent-ink: oklch(0.99 0 0);
  --c-accent-soft: color-mix(in oklch, var(--c-accent) 14%, transparent);
  --c-ok: oklch(0.68 0.16 150);  --c-warn: oklch(0.78 0.15 80);  --c-danger: oklch(0.6 0.2 25);
  --c-focus: var(--c-accent);

  /* Type (see typography.md) */
  --font-display: 'Fraunces', ui-serif, Georgia, serif;
  --font-text: 'Inter', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
  --fs-display: clamp(3.5rem, min(10vw, 17svh), 11rem);
  --fs-h1: clamp(2.5rem, 1.9rem + 2.6vw, 5.5rem);
  --fs-h2: clamp(2rem, 1.6rem + 1.8vw, 4rem);
  --fs-h3: clamp(1.375rem, 1.25rem + .5vw, 1.875rem);
  --fs-lead: clamp(1.125rem, 1.05rem + .35vw, 1.375rem);
  --fs-body: clamp(1rem, .958rem + .185vw, 1.125rem);
  --fs-small: .875rem;  --fs-label: .75rem;
  --lh-display: .92; --lh-head: 1.1; --lh-body: 1.6;
  --track-display: -0.045em;  --track-head: -0.02em;  --track-label: 0.12em;
  --measure: 65ch;

  /* Space and layout (see layout-and-scale.md) */
  --sp-1: 4px; --sp-2: 8px; --sp-3: 12px; --sp-4: 16px; --sp-5: 24px; --sp-6: 32px;
  --sp-7: 48px; --sp-8: 64px; --sp-9: 96px; --sp-10: 128px;
  --section-y: clamp(72px, 10vw, 160px);
  --gutter: clamp(16px, 4vw, 48px);
  --wrap: 1200px; --wrap-wide: 1440px; --wrap-text: 680px;

  /* Shape and depth: one depth language */
  --r-1: 4px; --r-2: 8px; --r-3: 16px; --r-pill: 999px;
  --shadow-1: 0 1px 2px rgb(0 0 0 / .06), 0 8px 24px rgb(0 0 0 / .08);
  --shadow-2: 0 2px 4px rgb(0 0 0 / .06), 0 20px 48px rgb(0 0 0 / .12);

  /* Layers */
  --z-bg: -1; --z-base: 0; --z-raised: 10; --z-sticky: 50; --z-nav: 100; --z-overlay: 200; --z-toast: 300;

  /* Motion (CSS side; mirror in motion/tokens.ts) */
  --ease-out: cubic-bezier(.16, 1, .3, 1);
  --ease-in-out: cubic-bezier(.65, 0, .35, 1);
  --ease-spring: cubic-bezier(.34, 1.56, .64, 1);
  --dur-1: .15s; --dur-2: .3s; --dur-3: .5s; --dur-4: .8s;
}

/* Breakpoints are tokens too (documented here, used in media queries and in PIN_MEDIA):
   --bp-sm 640 · --bp-md 768 · --bp-pin 900 · --bp-lg 1024 · --bp-xl 1280 */

@media (prefers-reduced-motion: reduce) {
  :root { --dur-1: 0s; --dur-2: 0s; --dur-3: 0s; --dur-4: 0s; }
}
```

Mirror the motion tokens in JS so CSS and the animation library speak the same language:

```ts
// motion/tokens.ts: values per personality in motion.md
export const T = {
  reveal: { y: 32, duration: 0.95, ease: 'power3.out' },
  heading: { yPercent: 115, rotate: 5, duration: 1.05, ease: 'power4.out', stagger: 0.022 },
  pop: { soft: 'back.out(1.3)', normal: 'back.out(1.7)', big: 'back.out(2.4)' },
  scrub: { edge: true, scene: 0.6, soft: 1 },
  start: { reveal: 'top 88%', scene: 'top 75%' },
};
```

## Sub-brand skins

A product or case-study page overrides roles inside a scope, never with literals in components:

```css
.skin-acme { --c-bg: #0c2748; --c-ink: #f4f7ff; --c-accent: #6fa8ff; --font-display: 'Bricolage Grotesque', sans-serif; }
body:has(.skin-acme) { --c-accent: #6fa8ff; } /* so the nav, progress bar and ::selection outside the scope follow */
```

Elements outside the scoped element can't see its custom properties, which is why chrome (scroll-progress bar, nav) needs the `body:has()` lift. Also set the page's `<meta name="theme-color">`.

## Audit inventory

Run during the look-first phase (adjust paths and extensions to the stack). Any count above zero outside the token file is drift worth logging.

```bash
EXT='--include=*.css --include=*.scss --include=*.astro --include=*.tsx --include=*.jsx --include=*.vue --include=*.svelte --include=*.html --include=*.liquid --include=*.php'
# raw colours outside tokens, and the most repeated ones (token candidates)
grep -rnoE '#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)' src $EXT | grep -v tokens | wc -l
grep -rhoE '#[0-9a-fA-F]{6}\b' src $EXT | sort | uniq -c | sort -rn | head -20
# motion vocabulary size
grep -rhoE 'cubic-bezier\([^)]*\)' src $EXT | sort | uniq -c | sort -rn
grep -rhoE "(back|elastic)\.out\([^)]*\)" src | sort | uniq -c
grep -rhoE '@keyframes [A-Za-z0-9_-]+' src $EXT | sort        # same job, different names?
# type, radius, layers, breakpoints sprawl
grep -rhoE 'font-family:[^;]+' src $EXT | sort | uniq -c | sort -rn | head
grep -rhoE 'font-weight:\s*[0-9]+' src $EXT | sort | uniq -c    # compare with weights actually loaded
grep -rhoE 'font-size:\s*[0-9.]+(px|rem)' src $EXT | sort | uniq -c | sort -rn | head -20
grep -rhoE 'border-radius:\s*[0-9]+px' src $EXT | sort | uniq -c | sort -rn
grep -rhoE 'z-index:\s*-?[0-9]+' src $EXT | sort | uniq -c | sort -rn
grep -rhoE '\((max|min)-width:\s*[0-9]+px\)' src $EXT | sort | uniq -c | sort -rn
# risky motion
grep -rnE 'transition:\s*all' src $EXT
grep -rn "import('gsap')\|registerPlugin\|from 'gsap'" src | wc -l   # bootstraps (should be one)
# accessibility basics present at all?
grep -rnE ':focus-visible|::selection|prefers-reduced-motion|skip' src $EXT | wc -l
```

Then read for what grep can't find:
- Brand values that disagree between a data/config file and the page.
- Repeated component families (several chip, pill, phone-frame, pulse-dot or replay-button implementations).
- Components that nothing imports.
- Pages loading their own copies of fonts or the motion library.
- Duplicate layout chrome (two footers).
- Dead ternaries and leftovers.

Log each finding with file:line.

## `DESIGN.md` template

```markdown
# Design system: <site>

## Direction
<preset or blend, two sentences>

## Principles
- <3–5 lines, e.g. "Type does the work; colour means something; one depth language.">

## Tokens
Source of truth: `<path>/tokens.css`. Components use roles only.
| Role | Token | Value | Use for |
|---|---|---|---|

## Type
| Role | Family / weight | Size token | Line-height / tracking | Use for |

## Layout
Containers, gutters, grid, section rhythm, breakpoints.

## Acts (marketing pages)
| Act | Palette roles | Texture | Type voice |

## Components
For each: purpose, anatomy, states (rest / hover / focus / active / disabled / loading), motion tokens, do / don't.

## Sub-brand skins
How a page overrides roles; which chrome follows.

## Do / don't
```

## `MOTION.md` template

```markdown
# Motion: <site>

## Personality
<one line> → tokens in `motion/tokens.ts` and `tokens.css`.

## Vocabulary
| Job | Values | How to use |
|---|---|---|
| Reveal | … | `data-reveal` |
| Headline | … | `data-fx="heading"` |
| Pop | soft / normal / big | |
| Scrub | edge / scene / soft | |

## Kernel
`motion/core.ts` API and the `data-fx` registry (list every registered effect and what it does).

## Page plans
### <page>
| Section | World | Enters via | Signature motion | Phone fallback |

## Adding a scene
1. Markup ships the finished state; add `data-fx="<name>"`.
2. `build()` → paused timeline using tokens and 0..1 custom properties.
3. Desktop: pin + scrub. Phones and tall windows: loop while visible.
4. Controls work under reduced motion (jump to the end).
5. Run the QA checklist.

## Reduced motion
What changes and what stays.
```


---

<!-- references/qa-checklist.md -->

# QA checklist

Run it in a real browser before calling anything done. Share screenshots as proof; never ask the owner to check for you.

## Viewports and modes

| Pass | Setup | Looking for |
|---|---|---|
| Desktop | 1440×900 | Pins feel right, transitions land, nothing overlaps the nav |
| Short laptop | 1280×720 | Pinned stages fit the viewport, titles don't overflow |
| Phone | 375×812 | Loops instead of pins, no horizontal scroll, tap targets ≥ 44px, hover-only info visible |
| Tall window | 1440×1600 | Loop mode kicks in, no half-height pins, nothing left hidden |
| Reduced motion | emulate `prefers-reduced-motion: reduce` | Finished frames visible, themes still change (discretely), **every control still works** |
| No JS | disable JavaScript | Full page readable, intro gate removed by the failsafe or never hidden |
| Slow device | 4× CPU throttle | No scrub lag on edges that should track 1:1, loops don't stall |

## Every page

- [ ] Console clean (no errors, no GSAP "target not found" warnings).
- [ ] Nothing stays invisible: scroll fast top→bottom, jump to anchors, reload mid-page, then look for elements stuck at `opacity: 0`.
- [ ] No flash: hero content doesn't appear, vanish, then animate in (needs the intro gate). Counters don't show the final number then reset to 0.
- [ ] `ScrollTrigger.refresh` runs after fonts and images (resize the window mid-page; pins and wipes must re-measure).
- [ ] Each marketing page has at least one pinned/scrubbed scene on desktop with a phone loop equivalent (app, docs and checkout pages excepted).
- [ ] Each act boundary uses its planned transition; no two consecutive boundaries share a grammar.
- [ ] The first screen shows the next section peeking in.
- [ ] Infinite loops pause off-screen and in hidden tabs.
- [ ] Animations use transform/opacity/clip-path; any layout-property tween is on a small stage and justified.
- [ ] No CSS `transition: transform` on elements GSAP drives each frame; hover transforms aren't overridden by GSAP inline styles.
- [ ] `will-change` only where needed, released after one-off intros.
- [ ] Copy is unchanged versus before (diff the text content if you touched templates).

## Design system

- [ ] No raw colours, font stacks, beziers, z-indexes or breakpoints outside the token files (rerun the audit inventory greps).
- [ ] Brand skins also recolour the scroll-progress bar, nav, `theme-color` and `::selection`.
- [ ] Brand values in data files match the page (accent, fonts, light/dark).
- [ ] Every font weight used is actually loaded; one font host, preconnected.
- [ ] Repeated component families consolidated (chips, pills, phone frames, pulse dots, replay buttons) or logged.
- [ ] `DESIGN.md` and `MOTION.md` updated with anything new.

## Accessibility

- [ ] Global `:focus-visible` ring; every hover effect has a focus equivalent.
- [ ] Split headings have `aria-label` with the full text; split spans `aria-hidden`.
- [ ] Animated demos: `role="img"` with a descriptive label, or real controls with real state (`aria-pressed`, `aria-selected`, `aria-checked`).
- [ ] Auto-advancing content (carousels, rotators) has a pause or stops on interaction (WCAG 2.2.2).
- [ ] `aria-live` regions exist (not `hidden`) before they announce.
- [ ] `scroll-margin-top` on anchor targets so the nav doesn't cover them; skip link present.

## Common failure modes (check for each one)

1. **Hero flash:** `gsap.from` after a dynamic import shows content, hides it, then animates. Fix: intro gate class + failsafe.
2. **Dead buttons under reduced motion:** Replay / Generate / toggle handlers attached *after* `if (reduce) return`. Fix: wire controls first, make them jump to the final state.
3. **`load` listener after an awaited import** never fires because `load` already happened. Fix: check `document.readyState`, plus `document.fonts.ready`.
4. **Every page reinventing the basics:** several motion-library bootstraps, several counter implementations, several reveal attributes, a dozen overshoot values, half a dozen chip components. Fix: one kernel, one token set, shared components.
5. **Hard-coded literals beside tokens:** the same accent hex pasted 25 times and the signature bezier 16 times, even though tokens for both exist.
6. **Font weight 900 used, 400–800 loaded:** display type rendered synthetic.
7. **Accent skin not reaching chrome:** progress bar outside the themed scope; data-file accent different from the page's.
8. **Mushy tilt:** CSS `transition: transform .5s` on an element GSAP updates every frame.
9. **Frame-based effects:** a 16-frame text decode ran twice as fast on 120Hz screens.
10. **Ambient effects ignoring reduced motion:** particle canvas and cursor glow ran forever, animating `left/top`, even in hidden tabs.
11. **Tall-screen policy that disabled all motion** for real users on portrait monitors (meant for screenshots). Fix: loop mode, not no-motion.
12. **Dead legacy code** (unused components, about 55% of a global stylesheet) shipped and confused later edits. Log it; delete with approval.
13. **Legal pages with two footers** because a layout rendered its own and didn't hide the global one.
