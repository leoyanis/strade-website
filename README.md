# strade.tech — Yanis Schweizer

Personal-brand site: homepage, the quest log (`/work`), a branded case study per project (`/work/<slug>`), and free resources for the Instagram DM automation (`/free/<slug>`). Astro 6 + GSAP. Deployed on Vercel.

## Run it

Needs Node 22+ (`nvm use 22`).

```sh
npm install
npm run dev      # http://localhost:4321
npm run build    # static build into dist/
npm run og       # regenerate link-preview images in public/og/
```

## Where things live

| What | File |
| --- | --- |
| Links (cal.com booking, Instagram, LinkedIn, email), tagline | `src/data/site.ts` |
| Every project: facts, metrics, brand colours, main/side quest, bragging stats | `src/data/work.ts` |
| Free resources (DM landing pages) | `src/data/resources.ts` (+ files in `public/free/<slug>/`) |
| Homepage, top to bottom: space (the hero's wheel of cards), the work in its own worlds (Atlas, Vaultt, Endless Pursuit), stripes (side quests), the black hole (free stuff), blueprint (Kleus, how I work, the numbers), the Wild West (about), finale | `src/pages/index.astro`, `src/styles/home.css`; each world's parts in `src/components/<world>/` (`space`, `atlas`, `vaultt`, `ep`, `free-act`, `west`) |
| Quest log | `src/pages/work/index.astro`, `src/components/QuestPanel.astro`, `src/styles/quests.css` |
| Branded case studies | `src/pages/work/<slug>.astro` (+ `src/components/case/<slug>/`) |
| Nav, footer, SEO tags | `src/layouts/Base.astro` (nav styles: `src/styles/nav.css`) |
| The night sky behind every regular page, and behind the footer on case studies (the homepage's sky as one still frame) | `src/components/space/page-sky.ts` (where it goes), `src/components/space/still-sky.ts` (the frame, built in idle slices; its look is copied from `starfield.ts`, so change both), mounted by `Base.astro`, styled in `src/styles/portfolio.css` |
| Redirects (old URLs) | `vercel.json` |

## Add a free resource (for a DM keyword)

1. Put any files in `public/free/<slug>/`.
2. Add an entry to `RESOURCES` in `src/data/resources.ts` (copy `ship-safe`). Set `keyword` to the word people comment, and the page will greet them with it.
3. Set `published: true`. Drafts only show in `npm run dev`.
4. Run `npm run og <slug>` to make its link preview, then deploy.
5. Point the DM automation at `https://strade.tech/free/<slug>`.

## Add or update a project

- Edit its entry in `src/data/work.ts` (`tier: 'main' | 'side'`, `status`, `metrics`, `brand`…). The quest log, homepage tiles, "next quest" links and previews all read from it.
- A new project also needs a page at `src/pages/work/<slug>.astro`. Copy a side-quest page as a starting point.
- Things that are built but can't be tried live (a private console, a local tool, an app not out yet) go in `HONORABLE_MENTIONS` in the same file. They render under "Honorable mentions" at the bottom of /work with a generated animation, never a link or a screenshot.
- Bragging numbers (tokens, Claude Code hours, users) are in `STATS`.

Run `npm run og` after changes so link previews stay current.

## Rules baked into the content

- Yanis is the face. The company name (Strade SMIP SRL) only appears in the footer and on legal pages.
- The white-label outreach build never names the end client. Matteo Caruso may be named.
- Leads that didn't close are never shown as work.

## The nav

No bar. The logo and the links each sit on a soft pool (a tint plus an 8px backdrop blur under one eased mask, so no edges) that fades in once the page is scrolled. Phones get the tint only. Markup and script: `src/layouts/Base.astro`. Styles: `src/styles/nav.css`.

- Each corner takes a tone from the band under it: `dark` is light ink on a dark pool, `light` is dark ink on a light pool. With no band, the page's `navTheme` applies.
- Tag a section that is lighter or darker than its page with `data-nav-theme="light"` or `"dark"`. A corner's text (the logo; Results to the Instagram icon) turns light when the band is under both of its ends, and dark when either end is over dark, unless over 58% of the words sit on light: a dark pool spilling onto light reads as a shadow, a light one spilling onto dark as a glow. `"busy"` (a picture, a screenshot) keeps the tone and makes the pool stronger while it passes.
- Book a call carries its own fill, so it takes the tone of the band under the pill itself. A text link that sits mostly past a card's edge takes its own ink, and the pool stops short of it.
- A pool only lies on its own tone: where a fair share of it beyond the text (above, below, or either side) sits on another tone, that edge is pulled in to the text (`data-cut`, eased). Over a band with an opaque background colour the pool takes that colour, a shade deeper under light ink, so a coloured card or section gets a shadow in its own hue instead of a black or white patch.
- Sections inside shared components go in the page's `navBands` prop instead, as `{ selector: tone }`. `'auto'` reads the background colour for the tone. `{ tone, inset }` adds an invisible marker box, for a band that a pseudo-element paints (kleus). Add `media: '(max-width: …)'` to either form for a band that only counts at some sizes.
- Scripts can override the bands: `body[data-nav-force="light|dark"]` for both corners (the homepage finale's circle wipe), `body[data-nav-force-l|r]` for one corner and `body[data-nav-force-p]` for Book a call (the homepage stripes wipe, `index.astro`). Remove the attribute to hand the nav back. A forced corner keeps its whole pool unless the script also says what it paints: `nav.toneAt = (x, y) => 'light' | 'dark' | null` plus a `nav:paint` event on `#site-nav` whenever it changes (the stripes wipe does), so the cuts follow the wipe's edge.
- Retint a page by setting the custom properties on `#site-nav` (`--pool-dark`, `--pool-light`, `--ink-on-light`, `--nav-accent` and others), as `vaultt.astro` does.
- Anything sticky right under the nav must cover the top 64px itself (see the end of `src/pages/free/[slug].astro`), or whatever scrolls behind shows between the links.

## The work's backdrops (homepage)

Only the backgrounds change as if the page were not scrolling; the content scrolls as usual (`src/scripts/backdrops.ts`; layers in `src/styles/home.css` and `src/components/vaultt/vaultt-home.css`).

- Each act's world is a fixed full-screen layer in `.themes`: `.theme--atlas` (Atlas's near-black, carried on under the act's own in-section world `.h-aw`, which still rises out of the sky while the card lands), `.theme--vaultt` (VaulttWorld: navy and the network) and `.theme--ep` (Endless Pursuit's black). When the scroll passes a switch point the next one fades in over the one before, in place, in 0.7 s (timed, not scrubbed), and fades back on the way up. No section edge travels up the screen, and the incoming world always fades in over an opaque one, so the sky never shows through.
- Switch points: Atlas to Vaultt where the intro starts to come in, as Atlas's last line leaves the top (never while more than a trace of the sky shows at Atlas's top); Vaultt to Endless Pursuit where the jobs' hold ends (they have turned to Applied and start to leave with the page). Both come from `marks()` in `src/components/vaultt/vaultt-home.ts`, measured from the layout, so a longer act above moves them.
- Vaultt's foreground is a stage fixed to the screen (`.vx__stage`, only under `html.vx-stage`, set by an inline script in `VaulttHome.astro`) that shows one panel at a time: the intro (copy and phones), builders, projects, jobs. Everything on it follows the scroll and nothing plays on its own (Yanis, 2026-11-08: no guided scrolling anywhere). Each panel gets a switch and then a hold (`vaultt-home.css` `--vx-switch` and `--vx-hold`, matching `SWITCH` and `HOLD` in `vaultt-home.ts`: 30% and 36% of a screen, 28% and 30% on phones, so the act is about 2.6 screens on a desktop and 2.3 on a phone; it must never look like a long scroll). Across a switch the panel showing slides up and scatters while the next rises from about 10% above the bottom and gathers, scrubbed: a page stopped half way leaves both half way, and scrolling back runs it backwards. Across a hold the panel stays put while its own moments run with the scroll (the fan opening, projects loosening, the last job turning to Applied), done before the hold ends. After the jobs' hold their panel moves up 1:1 with the page while Endless Pursuit comes up under it. The network's hub never moves. Without JS the panels sit one after another in the page.
- The sky sleeps from where Atlas's near-black covers the screen until the stripes act does (`sky.hide()`, driven by `backdrops.ts`; these acts have no `sky.cover()`). Vaultt's network runs only while its world is shown and holds its last frame while it fades.
- Endless Pursuit (`src/components/ep/ep-section.ts`, the star sky): at its switch the black comes in faster (0.5 s) and the star field fades in right after it, spread over the screen at full strength (`ep-section.ts` `show()`, called by `backdrops.ts`). From the switch the field gathers into the ∞ with the scroll (`from()`), until the scroll at which everything is centred, where the ∞'s outline glow (the gold wash) blooms in, timed (`stars.bloom()`). The star canvas sits in a sticky one-screen frame (`.ep3-sky__pin`) inside a box sized by `place()`: it holds still like a background from a little above the switch until everything is centred, then scrolls away with the words and the phone. Its z-index is under Vaultt's section (`.vx` is 3), so the field passes behind the leaving jobs. The swarm runs only while that frame is on screen and the world is showing. The phone assembles over a longer stretch (`asmAt()`): the layers stay apart while it crosses the screen and close up just past the middle.
- Reduced motion and `?still`: the same switch points, the worlds change at once, every item is simply there (Vaultt's panels swap at once half way through each switch, and the jobs still leave with the page); Endless Pursuit's ∞ is formed and still, and its glow comes in at once when everything is centred.
- Dev only: `window.__bg` (the switch points, the world, ScrollTrigger) and `window.__vx` (Vaultt's panels, points `T` and state: each panel's v, offset and moments) for screenshot scripts.

## Performance

The site has a lot of motion over fixed full-screen layers, so frame time is easy to lose. Measure before and after any change to a section, and prove with screenshots that nothing visible moved.

### The harness

`scripts/perf/` holds a performance harness: Playwright driven from Node. Playwright is not a dependency; the harness loads the copy npx cached, or `PERF_PLAYWRIGHT=<path to a playwright package>`. Chromium and WebKit must be installed in `~/Library/Caches/ms-playwright`.

```sh
node scripts/perf/run.mjs build                       # the production build + a source-mapped twin, each with its own Vite cache
node scripts/perf/run.mjs measure --name before --pages home --repeat 3
node scripts/perf/run.mjs measure --name after  --pages home --repeat 3
node scripts/perf/run.mjs compare before after        # .scratch/perf/after/compare-before.md
node scripts/perf/run.mjs brief after --vs before     # one table per page and profile, every cell "before -> after"
node scripts/perf/run.mjs shots --name shots-before   # screenshots at fixed scroll positions, ffmpeg contact sheets
node scripts/perf/run.mjs diff shots-before shots-after
```

- Profiles: `desktop` (Chromium 1440x900 @2x), `desktop-4x` (the same, CPU 4x slower), `phone-4x` (Chromium 390x844 @3x, touch, CPU 4x slower), `safari` (WebKit 1440x900 @2x) and `iphone` (WebKit, iPhone 15). WebKit runs on the Mac's GPU, so read it for Safari's engine costs, not as an iPhone's frame rate.
- Passes: `load` (bytes by type before and after a full scroll, LCP, TBT, CLS, audio before the first press), `scroll` (a steady trackpad-speed scroll and a fling, frame times per section), `trace` (style, layout, paint, GPU and forced layouts per section, mapped to `src/` lines), `inval` (what changed every frame), `layers`, `idle` (10 s at rest per section), `interact` (wheel drag, card hover, See our work, pointer through Vaultt and EP).
- Results go to `.scratch/perf/<run>/` (raw JSON, `summary.md`). The `control` page (`--pages control`) is a plain page served by the harness: its numbers are the noise floor of the machine at that moment. Other sessions running on the Mac move every number; compare runs taken at similar load averages (printed at the top of each summary).
- `--target dev` measures the dev server on :4321. The run is marked INVALID when the dev server's optimized deps are stale.
- Experiments: `--inject-css` / `--inject-js scripts/perf/experiments/<x>` switch one suspect off (or try a candidate fix) to measure what it costs. They never go in `src/`.

### Proving nothing visible changed

`shots` fakes the clock and seeds `Math.random`, so two runs on the same build match: the worst shot of a same-build repeat differs by 1 or 2 levels in a few hundred pixels (PSNR above 90 dB). Anything clearly above that is a change, or one of the timing effects below. Modes:

- Sequential (default): one page scrolled through every position, like a visitor. A loop that only runs near its section reaches each position with its own history, so moving a loop's start point shows up here even when every frame it draws is right.
- `--fresh`: a new page for every position (`--only 4,6,8` picks positions). Separates a real change from a different history.
- `--step-clock`: the fake clock moves one frame at a time with a real frame after each, so observer callbacks and real-time clocks (a CSS animation that picks which video plays, an IntersectionObserver that starts a loop) land at the same fake time in both builds. About ten times slower: use it with `--only` on the shots that differ.
- `--offline`: only the local server answers. The web fonts come from fonts.bunny.net, and whether the Inter weights have landed when a shot is taken decides which face the Vaultt maps' canvas labels show (each map redraws once every weight it draws with is in, `network.ts`).

Two builds that differ only in how much work a frame costs can disagree in sequential mode for those timing reasons alone; a shot counts as changed only if it still differs with `--step-clock` (and `--offline` where web fonts are involved). `--inject-css` also works on `shots`, to check a candidate fix before it goes in `src/`.

Targets: desktop 99% of frames under 16.7 ms, p99 under 20 ms, no frame over 50 ms after load; 4x CPU and phones p95 under 16.7 ms and no long task over 50 ms while scrolling; main thread under 5% busy at rest; nothing below the fold downloads before it is near.

### Rules for new sections

1. Animate only `transform` and `opacity` on anything big. An animated `filter`, `box-shadow`, `clip-path`, mask, `backdrop-filter`, SVG filter, `width`/`height`/`top`/`left` or `background-position` repaints every frame. In Safari, filters and SVG filters are the most expensive of all, and a static filter is redone whenever anything painted next to it changes.
2. Never read layout (`getBoundingClientRect`, `offset*`, `scrollHeight`, `getComputedStyle`, `window.scrollY` after a write, and `innerWidth`/`innerHeight` on phones) in a scroll handler, `onUpdate` or a rAF loop. Measure on resize and on `ScrollTrigger` refresh, keep document coordinates, and subtract the scroll. If a frame must read layout, do every read before the first write.
3. Never write styles inside a `scroll` listener: every listener after it (ScrollTrigger's own scroll read among them) then pays a forced style recalc and layout. Read in the listener, write in the next `requestAnimationFrame`.
4. Every loop (rAF, canvas, video) runs only while its element can be seen: an IntersectionObserver, `visibilitychange`, and the opaque layers that cover it. A loop drawing under an opaque layer is the same waste as one drawing off screen. If its state must keep its history (a simulation, a network), keep it ticking and skip only the draw.
5. An infinite CSS animation keeps the whole page rendering every frame, even off screen or under a clip. Pause it with `animation-play-state` unless its element is on screen (`data-offscreen-pause` on a section does this, from Base.astro). Finite animations that play once at load must not sit inside such a section.
6. A CSS custom property set every frame restyles every descendant: set it on the smallest element that uses it.
7. Canvases: cap `devicePixelRatio` at 2, keep a pixel budget, use pre-drawn sprites, no `shadowBlur`, no gradients created per frame, resize only on resize. Each `drawImage` has a fixed cost in Chromium: a few thousand per frame (the EP star field) is what holds a section at 60 fps on a 120 Hz screen.
8. Give SVG filters a region as tight as the effect (the default and generous percentages filter several times the pixels), and keep the region past the blur's reach (about 3 standard deviations plus the stroke) so the output stays the same. In Safari an SVG filter over something that moves is redone every frame.
9. `will-change` only on what moves continuously, never on hundreds of elements. The homepage has about 250 composited layers. Adding or removing a layer can change how its neighbours rasterize (one extra layer in WebKit moved the Atlas editor's timeline thumbnails), so check shots after any layer change.
10. When a `gsap.set` or tween of a pixel property is replaced by a direct style write, round like GSAP's `autoRound` (whole CSS pixels), or the element lands a device pixel away.
11. Images below the fold get `loading="lazy"`, `decoding="async"` and `width`/`height`. Videos get `preload="none"` and a poster, and play only while visible.
12. No sound is fetched or decoded before the visitor reaches for it. Endless Pursuit loads its 16 sounds on the first pointer over the section, touch or keyboard focus inside it, never on approach; a press that beats the decode still plays if its sound lands within 120 ms.
13. Builds never share `node_modules/.vite` with the dev server: a build there breaks a running `astro dev` (it answers 504 for gsap until restarted).

## Vaultt section fonts

The homepage's Vaultt section (`src/components/vaultt/`) sets its type in vaultt.io's two fonts, self-hosted as subsets (no Google stylesheet for them on the homepage). `vaultt-home.css` defines both with `@font-face` (`url('./fonts/...')`, so Astro hashes them; `font-display: swap`), and only the homepage loads that file. The case study `/work/vaultt` still loads Google's full faces through its own link.

- `bricolage-vaultt.woff2` (about 17 KB): Bricolage Grotesque with only the glyphs the section sets in it (the name, the tagline, the numbers) plus every digit and `. , k +`.
- `hanken-vaultt.woff2` (about 23 KB): Hanken Grotesk, Basic Latin (U+0020 to U+007E) plus U+2019, so new copy never falls outside it.
- Both stay variable (Bricolage: `opsz` and `wght`; Hanken: `wght`) and keep every layout feature.

```sh
sh scripts/fonts/subset-vaultt.sh             # regenerate both (sources default to .scratch/downloads/fonts/, Google's latin faces)
node scripts/fonts/check-vaultt.mjs           # every character the section sets is in its subset (dev server on :4321)
node scripts/fonts/check-vaultt.mjs --build-dir .scratch/<build>   # the same against a production build it serves itself
```

The check opens `/?still` at desktop and phone widths, groups every rendered character in `#mq-vaultt` by its font family, compares the Bricolage and Hanken ones with each subset's cmap (fontTools), and exits 1 naming any missing character. Text set in Inter (the drawn app cards, canvas labels) is listed, not checked. After changing the section's Bricolage copy or a `VAULTT_NUMBERS` value with a new symbol, add the characters to `BRIC` in the subset script, rerun it, then the check.
