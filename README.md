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
| Homepage (4 acts: space → stripes → blueprint → finale) | `src/pages/index.astro`, `src/styles/home.css` |
| Quest log | `src/pages/work/index.astro`, `src/components/QuestPanel.astro`, `src/styles/quests.css` |
| Branded case studies | `src/pages/work/<slug>.astro` (+ `src/components/case/<slug>/`) |
| Nav, footer, SEO tags | `src/layouts/Base.astro` |
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
- Old projects without a live site go in `ARCHIVED` in the same file. They render as "Archived" side quests with a generated animation.
- Bragging numbers (tokens, Claude Code hours, users) are in `STATS`.

Run `npm run og` after changes so link previews stay current.

## Rules baked into the content

- Yanis is the face. The company name (Strade SMIP SRL) only appears in the footer and on legal pages.
- The white-label outreach build never names the end client. Matteo Caruso may be named.
- Leads that didn't close are never shown as work.
