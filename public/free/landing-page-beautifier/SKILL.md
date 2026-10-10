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
