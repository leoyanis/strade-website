// Every project shown on /work and the homepage.
// Order here is the order on the site. `featured` projects get the large cards.
//
// Rules (see memory: website-brand-decisions):
// - Never name the end client of the white-label outreach build.
// - Never list leads that did not close.

export type Status = 'Live' | 'Work in progress' | 'In build' | 'Delivered' | 'Handover' | 'Launching';

export interface Brand {
  bg: string;
  surface: string;
  text: string;
  muted: string;
  accent: string;
  /** CSS font-family stacks. Fonts are loaded from `fontsHref` on the project page. */
  display: string;
  body: string;
  fontsHref?: string;
  /** Light pages flip the nav to dark ink. */
  light?: boolean;
  logo?: string;
}

export interface Project {
  slug: string;
  /** Main quests get the big branded treatment. Side quests share a themed template. */
  tier: 'main' | 'side';
  brand: Brand;
  name: string;
  /** Who it was for. Own products say "My product". */
  client: string;
  kind: 'client' | 'product';
  year: string;
  status: Status;
  featured?: boolean;
  /** One line for cards and meta descriptions. */
  summary: string;
  /** Accent used for card glow and page highlights. */
  accent: string;
  /** Image cover, or a built-in illustration when there is nothing public to show. */
  cover:
    | { type: 'image'; src: string; fit?: 'cover' | 'contain'; bg?: string; position?: string }
    | { type: 'mock'; mock: 'crm' | 'stories' };
  tags: string[];
  metrics?: { value: string; label: string }[];
  problem: string;
  built: string[];
  how: string;
  outcome?: string;
  gallery?: { src: string; alt: string; wide?: boolean }[];
  links?: { label: string; href: string }[];
  testimonial?: { quote: string; name: string; role: string; photo?: string; href?: string };
}

/** One Vaultt figure: `value` drives a counter, `display` is the finished text, `exact` the raw count behind it. */
export interface VaulttNumber {
  value: number;
  decimals: number;
  prefix?: string;
  suffix: string;
  display: string;
  label: string;
  exact?: number;
}

/**
 * Every Vaultt number on the site lives here (homepage section, wheel card, metrics, case study),
 * so a number changes in one edit. Read-only from Vaultt's production database on 2026-11-07 and
 * rounded down, never up. Exception: `builders` is Yanis's headline figure (23.7k, confirmed by Yanis
 * 2026-11-07); the users table held 13,239 accounts that day (`accounts`).
 * It sits above PROJECTS because the Vaultt entry reads it.
 */
export const VAULTT_NUMBERS = {
  asOf: '2026-11-07',
  builders: { value: 23.7, decimals: 1, suffix: 'k', display: '23.7k', label: 'builders' },
  projects: { value: 1200, decimals: 0, suffix: '+', display: '1,200+', label: 'projects shared', exact: 1270 },
  feedback: { value: 3000, decimals: 0, suffix: '+', display: '3,000+', label: 'feedback messages', exact: 3100 },
  connections: { value: 1500, decimals: 0, suffix: '+', display: '1,500+', label: 'connection requests', exact: 1567 },
  views: { value: 24.9, decimals: 1, suffix: 'k', display: '24.9k', label: 'project views', exact: 24937 },
  applications: { value: 10500, decimals: 0, suffix: '+', display: '10,500+', label: 'job applications', exact: 10584 },
  nationalities: { value: 100, decimals: 0, suffix: '+', display: '100+', label: 'nationalities', exact: 120 },
  universities: { value: 300, decimals: 0, suffix: '+', display: '300+', label: 'universities', exact: 308 },
  accounts: 13239,
  builderProfiles: 13197,
  likes: 2455,
  feedbackThreads: 1570,
  connectionsAccepted: 579,
  connectionsPending: 983,
  /** Projects by the category their builder picked: the top twelve, so they sum to less than `projects.exact`. */
  categories: [
    { name: 'Creative Arts', count: 249 },
    { name: 'Game Development', count: 242 },
    { name: 'Software Development', count: 197 },
    { name: 'Marketing', count: 62 },
    { name: 'Sciences and Research', count: 51 },
    { name: 'App Development', count: 39 },
    { name: 'Analytics', count: 38 },
    { name: 'Entrepreneurship', count: 30 },
    { name: 'Data Analytics', count: 24 },
    { name: 'Content Creation', count: 23 },
    { name: 'Film', count: 22 },
    { name: 'Web App Development', count: 20 },
  ],
};

/** One kind of project on Vaultt: a few of the top categories folded together, so every chart on the
 *  site groups projects the same way (the homepage stacks and the case study's squares). */
export interface VaulttKind { id: 'art' | 'code' | 'games' | 'sci' | 'biz' | 'other'; label: string; short: string; n: number }

/**
 * The twelve biggest categories folded into five kinds, plus `other` (every project outside those twelve),
 * so the six add up to all 1,270 projects. Art and film 294, Code 256, Games 242, Science and data 113,
 * Business 92, Other kinds 273 (2026-11-07). A chart that shows fewer kinds sums the rest itself and
 * says so in its label ("Everything else"), never reusing a name for a different count.
 */
export const VAULTT_KINDS: VaulttKind[] = (() => {
  const count = (name: string) => VAULTT_NUMBERS.categories.find((c) => c.name === name)?.count ?? 0;
  const sum = (...names: string[]) => names.reduce((s, n) => s + count(n), 0);
  const top = VAULTT_NUMBERS.categories.reduce((s, c) => s + c.count, 0);
  return [
    { id: 'art', label: 'Art & film', short: 'Art & film', n: sum('Creative Arts', 'Film', 'Content Creation') },
    { id: 'code', label: 'Code', short: 'Code', n: sum('Software Development', 'App Development', 'Web App Development') },
    { id: 'games', label: 'Games', short: 'Games', n: count('Game Development') },
    { id: 'sci', label: 'Science & data', short: 'Science', n: sum('Sciences and Research', 'Analytics', 'Data Analytics') },
    { id: 'biz', label: 'Business', short: 'Business', n: sum('Marketing', 'Entrepreneurship') },
    { id: 'other', label: 'Other kinds', short: 'Other', n: (VAULTT_NUMBERS.projects.exact ?? top) - top },
  ];
})();

/** Where Vaultt lives. All four returned 200 on 2026-11-07; the iPhone app is out of beta. */
export const VAULTT_LINKS = {
  appStore: 'https://apps.apple.com/gb/app/vaultt/id6738582949',
  playStore: 'https://play.google.com/store/apps/details?id=io.studentventure.app',
  // the marketing site
  web: 'https://vaultt.io',
  // the web app itself
  app: 'https://platform.vaultt.io',
};

export const PROJECTS: Project[] = [
  {
    slug: 'atlas',
    tier: 'main',
    name: 'Atlas',
    client: 'Brandzey',
    kind: 'client',
    year: '2026 – now',
    status: 'Live',
    featured: true,
    summary: 'You film it, Atlas does the rest: it finds an idea that worked, writes it in your voice, edits the video and posts it. We build the app, the editing engine and the website.',
    accent: '#A795FF',
    brand: {
      bg: '#0B0B0D', surface: '#141418', text: '#F2F2F4', muted: '#8E8E98', accent: '#A795FF',
      display: "'Geist', 'Inter', system-ui, sans-serif",
      body: "'Geist', 'Inter', system-ui, sans-serif",
      fontsHref: 'https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700;800&family=Geist+Mono:wght@400;500&family=Instrument+Serif:ital@1&display=swap',
      logo: '/images/work/atlas/mark-white.svg',
    },
    cover: { type: 'image', src: '/images/work/atlas/og.webp', fit: 'contain', bg: '#0B0B0D' },
    tags: ['Claude', 'Remotion on AWS Lambda', 'Supabase', 'Vercel'],
    metrics: [
      { value: '2:07 → 0:51', label: 'a raw take in, a finished video out' },
      { value: '7', label: 'platforms posted to from one place' },
      { value: 'Live', label: 'since 1 October 2026, sign-ups open' },
    ],
    problem:
      "People who already post lose days to editing, and generic AI clip tools only chop podcasts and add captions, so everything looks like every other AI video. Brandzey wanted one place that goes from idea to script to finished edit to posted, in the creator's own style.",
    built: [
      'The editing engine: transcribe the take, cut retakes and silences, plan the edit with Claude and render it with Remotion on AWS Lambda',
      'Editing styles rebuilt from real videos that already worked, down to the pacing, zooms, headers and b-roll rhythm',
      'The Atlas agent: ideas scored against your own best posts, scripts in your voice, and a chat that changes the edit for you',
      'Carousel and story sequence builders that work from one prompt',
      'Posting and analytics for Instagram, TikTok, YouTube, LinkedIn, X, Threads and Facebook',
      'Sign-up, billing, onboarding and the marketing site, getatlas.site',
    ],
    how:
      'Atlas runs on Vercel and Supabase. Every edit is planned by Claude, checked against Atlas’s own rules, repaired once if it fails, and rendered by Remotion on AWS Lambda. The same rules gate every caption and graphic, so nothing that looks like AI slop reaches the creator.',
    outcome: 'Live for customers since 1 October 2026, and still being built out.',
    links: [{ label: 'getatlas.site', href: 'https://getatlas.site' }],
  },
  {
    slug: 'vaultt',
    tier: 'main',
    name: 'Vaultt',
    client: 'Liam Jeffery, Founder · formerly StudentVenture',
    kind: 'client',
    year: '2025 – now',
    status: 'Live',
    featured: true,
    summary: `The network for builders: post what you're making, get real feedback and find people to build with. ${VAULTT_NUMBERS.builders.display} builders, live on iPhone and Android.`,
    accent: '#6FA8FF',
    brand: {
      bg: '#0C2748', surface: '#0E2C52', text: '#E8F1FF', muted: '#8FA8CC', accent: '#6FA8FF',
      display: "'Bricolage Grotesque', 'Hanken Grotesk', system-ui, sans-serif",
      body: "'Hanken Grotesk', system-ui, sans-serif",
      fontsHref: 'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,600;12..96,700;12..96,800&family=Hanken+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap',
      logo: '/images/work/vaultt/icon.png',
    },
    // the case study's network radiating from the app icon (captured from /work/vaultt, invented people only)
    cover: { type: 'image', src: '/images/work/vaultt/cover-network.webp', fit: 'cover', bg: '#0C2748' },
    tags: ['Flutter', 'Supabase', 'Postgres', 'OpenAI', 'Next.js'],
    metrics: [
      { value: VAULTT_NUMBERS.builders.display, label: 'builders on the network' },
      { value: VAULTT_NUMBERS.projects.display, label: VAULTT_NUMBERS.projects.label },
      { value: VAULTT_NUMBERS.feedback.display, label: VAULTT_NUMBERS.feedback.label },
      { value: 'iOS + Android', label: 'native apps, live in both stores' },
    ],
    // problem, built, how and outcome are not rendered for Vaultt today (only the Atlas page reads them);
    // kept true to the new positioning so any future page or export can use them as they are
    problem:
      "People who make things (games, films, code, art) had no one place to show work in progress, get real feedback and find people to build with. Liam had the vision and the community. He didn't have someone to make every product and technical call and then ship it.",
    built: [
      "The app: post what you're making, get feedback in private threads, and find people to build with",
      'The Network map: your connections as a living graph that glows with how much you talk',
      'AI search that finds people by what they have made, not by keywords',
      "Native apps for iPhone (with Apple's Liquid Glass tab bar) and Android, and the web app",
      'An admin console and an accelerator intake form',
    ],
    how:
      'v1 went live in three months on FlutterFlow and Firebase as StudentVenture. As it grew I took it off FlutterFlow: one Flutter codebase for iPhone, Android and the web, with Supabase as the main database and Firebase for sign-in. Then it rebranded to Vaultt. I now work as fractional CTO.',
    outcome: `From an idea to native apps, a web app and ${VAULTT_NUMBERS.builders.display} builders, and still growing.`,
    // no gallery: the old one showed the CV-era v1 screens, and the case study draws its own pictures
    links: [
      { label: 'vaultt.io', href: VAULTT_LINKS.web },
      { label: 'Web app', href: VAULTT_LINKS.app },
      { label: 'App Store', href: VAULTT_LINKS.appStore },
      { label: 'Google Play', href: VAULTT_LINKS.playStore },
    ],
    testimonial: {
      quote:
        "Working with Yanis has been game-changing for the success of StudentVenture. From design to development, his quick understanding and execution have turned ideas into reality within months. It's truly unbelievable what he can accomplish. Thanks to him, StudentVenture is now both an app and a website. His communication, transparency, honesty, and exceptional talent make him the perfect addition to any team looking to build a product.",
      name: 'Liam Jeffery',
      role: 'Founder, Vaultt (formerly StudentVenture)',
      photo: '/images/liam-testimonial.jpg',
      href: 'https://www.linkedin.com/in/liam-jeffery/',
    },
  },
  {
    slug: 'youcook',
    tier: 'side',
    brand: { bg: '#FFFFFF', surface: '#FFF5F3', text: '#333333', muted: '#6b6b6b', accent: '#FF6B6B', display: "'Quicksand', system-ui, sans-serif", body: "'Quicksand', system-ui, sans-serif", fontsHref: 'https://fonts.googleapis.com/css2?family=Quicksand:wght@400;500;600;700&display=swap', light: true },
    name: 'YouCook',
    client: 'My product',
    kind: 'product',
    year: '2024 – 2025',
    status: 'Live',
    summary: 'An AI cooking app: snap your ingredients and get recipes, meal plans and shopping lists. Live on iOS and Android.',
    accent: '#F26B4F',
    cover: { type: 'image', src: '/images/work/youcook/panel.webp', fit: 'cover', bg: '#ffffff' },
    tags: ['Flutter', 'Firebase', 'OpenAI + Groq', 'RevenueCat'],
    problem: '"What can I cook with what I have?" is a daily question, and recipe sites answer it badly.',
    built: [
      'Photo or voice input for your ingredients, turned into recipes',
      'Weekly meal plans with automatic shopping lists',
      'Step-by-step cook mode with timers and reminders',
      'An AI chef chat for substitutions and tips',
    ],
    how:
      'One Flutter codebase on Firebase. Cloud Functions give every job its own model: Groq for fast recipe previews, OpenAI for steps and reading fridge photos, Whisper for voice. RevenueCat handles subscriptions. I designed, built, published and marketed it myself.',
    outcome:
      'Getting downloads was cheap: about £0.60 each on Meta ads. Getting people to pay was much harder. That lesson shapes how I scope every client product now: validate the moment someone pays before building everything around it.',
    gallery: [
      { src: '/images/work/youcook/g1.webp', alt: 'Recipe detail with nutrition' },
      { src: '/images/work/youcook/g2.webp', alt: 'AI chef tip chat' },
      { src: '/images/work/youcook/g3.webp', alt: 'Main menu with favourites' },
    ],
    links: [
      { label: 'youcookapp.com', href: 'https://youcookapp.com' },
      { label: 'App Store', href: 'https://apps.apple.com/app/youcook-personalized-recipes/id6677050461' },
      { label: 'Google Play', href: 'https://play.google.com/store/apps/details?id=com.strade.youcook' },
    ],
  },
  {
    slug: 'outreach-crm',
    tier: 'side',
    brand: { bg: '#F7F5F3', surface: '#FFFFFF', text: '#1F1B18', muted: '#6E6660', accent: '#5B5BF6', display: "'Inter', system-ui, sans-serif", body: "'Inter', system-ui, sans-serif", light: true },
    name: 'Outreach & CRM System',
    client: 'White-label, built with Matteo Caruso',
    kind: 'client',
    year: '2026',
    status: 'Handover',
    featured: true,
    summary: 'Replaced a spreadsheet outreach process with one app: find leads, email them from real mailboxes and catch every reply.',
    accent: '#5B5BF6',
    cover: { type: 'mock', mock: 'crm' },
    tags: ['Next.js', 'Supabase', 'Microsoft 365', 'pg_cron'],
    metrics: [
      { value: '130', label: 'automated tests on the sending engine' },
      { value: '~10 days', label: 'from scope to working app' },
      { value: '0', label: 'spreadsheets left' },
    ],
    problem:
      "A marketing team was running outreach from spreadsheets: finding leads by hand, copy-pasting emails and losing replies across inboxes. Matteo brought me in to build the system under his name. I work through him, so the client's name stays private.",
    built: [
      'Lead finder with filters, saved searches, CSV import and email verification',
      "Campaigns that combine a lead list, a multi-step sequence and a schedule, sent from the team's own Microsoft 365 mailboxes",
      'Daily send limits that ramp up slowly to protect deliverability',
      'Templates with variables and a live preview',
      'Automatic reply detection, a drag-and-drop pipeline and one inbox for every conversation',
    ],
    how:
      'Next.js on Supabase. The sending engine runs on a schedule inside the database, so nothing depends on someone keeping a laptop open. Credentials sit in an encrypted vault, and 130 tests cover the sending logic.',
  },
  {
    slug: 'playivity',
    tier: 'side',
    brand: { bg: '#FFFFFF', surface: '#F7F9FC', text: '#1D2340', muted: '#5C6488', accent: '#85D015', display: "'Fredoka', 'Inter', system-ui, sans-serif", body: "'Inter', system-ui, sans-serif", fontsHref: 'https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=Inter:wght@400;500;600&display=swap', light: true },
    name: 'Playivity',
    client: 'Playivity',
    kind: 'client',
    year: '2026',
    status: 'Delivered',
    featured: true,
    summary: 'One design system and a cast of animated characters for a kids’ activity platform used in schools.',
    accent: '#85D015',
    cover: { type: 'image', src: '/images/work/playivity/g1.webp', fit: 'contain', bg: '#FFFFFF' },
    tags: ['Figma', 'Design system', 'Motion', 'Handover'],
    metrics: [
      { value: '4', label: 'characters designed' },
      { value: '12', label: 'loop animations' },
      { value: '1', label: 'design system for every screen' },
    ],
    problem:
      'Playivity makes activity hardware and software for schools, for children aged 3 to 11. Over time the teacher dashboard and the admin area had drifted into two different products. Their engineers needed one source of truth to build from.',
    built: [
      'A unified design system: type, tokens and colour coding for activity levels',
      'Four "Pal" characters (Movi, Lexi, Emmi, Nexo) with 12 looping animations',
      'High-fidelity screens: school view, class view, Let’s Play, the 3.5" device screen and the "How did we do?" summary',
      'An engineering handover pack for their React and Rust team',
    ],
    how:
      'Everything was designed in Figma. The character animations were exported as MP4 and WebM through a small cleanup pipeline, so they drop straight into the product.',
    gallery: [
      { src: '/images/work/playivity/g1.webp', alt: 'The four Playivity Pals', wide: true },
      { src: '/images/work/playivity/g2.webp', alt: 'Organisation views', wide: true },
      { src: '/images/work/playivity/g3.webp', alt: 'Design tokens and icon set' },
    ],
  },
  {
    slug: 'sequenced',
    tier: 'side',
    brand: { bg: '#000000', surface: '#0B0B0B', text: '#FFFFFF', muted: '#9A9A9A', accent: '#FFBD59', display: "'Inter', system-ui, sans-serif", body: "'Inter', system-ui, sans-serif" },
    name: 'Sequenced',
    client: 'Danny Fresko, creative studio',
    kind: 'client',
    year: '2026',
    status: 'In build',
    summary: 'Designs Instagram story sequences in a studio’s house style, then exports them as editable layers for Canva.',
    accent: '#FFB648',
    cover: { type: 'mock', mock: 'stories' },
    tags: ['Next.js', 'Claude', 'pptx export', 'Canva'],
    metrics: [
      { value: '63', label: 'reference sequences analysed' },
      { value: '100%', label: 'editable in Canva' },
    ],
    problem:
      'Danny’s studio designs Instagram stories for about 25 clients. Every sequence is hand-built in Canva, and most of that time goes on layout rather than ideas. Generic AI design tools ignore the studio’s style.',
    built: [
      'Brief the pages and drop in photos',
      'AI picks a layout for each page from the studio’s own templates and fills in the copy and photos',
      'A design-check pass where the AI reviews the rendered pages and fixes overlaps, crops and contrast',
      'Export to an editable file where every text box, pill and photo is its own layer in Canva',
    ],
    how:
      'The AI never draws pixels. The layouts live in code, built from an analysis of 63 of the studio’s sequences, and the AI only chooses and fills them. That keeps a 10-page sequence on-brand, and a designer can still finish the last 10% by hand.',
  },
  {
    slug: 'kleus',
    tier: 'main',
    brand: { bg: '#F0EEE9', surface: '#F7F5F1', text: '#1B1A18', muted: '#6F6A62', accent: '#B87A1F', display: "'DM Sans', system-ui, sans-serif", body: "'DM Sans', system-ui, sans-serif", fontsHref: 'https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&family=Fraunces:opsz,wght@9..144,400;9..144,600&display=swap', light: true },
    name: 'Kleus',
    client: 'My product',
    kind: 'product',
    year: '2026',
    status: 'Live',
    summary: 'Turns the books, videos and podcasts you keep saving into 15-minute daily lessons, with a coach that checks in.',
    accent: '#B87A1F',
    cover: { type: 'image', src: '/images/work/kleus/panel.webp', fit: 'contain', bg: '#F0EEE9' },
    tags: ['Next.js', 'Supabase', 'Stripe', 'AI coaching'],
    problem:
      'Most people don’t fail to start learning. They fail to continue. Courses are passive, coaches are expensive, and the saved video stays saved.',
    built: [
      'Paste a book, PDF, YouTube video or podcast and get a learning plan',
      'Daily 15-minute lessons that end with you producing something instead of just reading',
      'Check-ins and slip recovery, so a missed day doesn’t become a missed month',
      'Subscriptions and billing',
    ],
    how: 'Built on Next.js and Supabase with Stripe billing. 1,400+ commits since June 2026.',
    links: [{ label: 'kleus.ai', href: 'https://www.kleus.ai' }],
  },
  {
    slug: 'endless-pursuit',
    tier: 'main',
    brand: { bg: '#121110', surface: '#1b1916', text: '#F3EEE4', muted: '#9a917f', accent: '#E8C784', display: "'Inter', system-ui, sans-serif", body: "'Inter', system-ui, sans-serif" },
    name: 'Endless Pursuit',
    client: 'Nickolas Lazarev, Founder',
    kind: 'client',
    year: '2026',
    status: 'Work in progress',
    featured: true,
    summary: 'A mobile app where ambitious people track their progress with a small circle that holds them accountable.',
    accent: '#E8C784',
    cover: { type: 'image', src: '/images/work/endless-pursuit/onboarding.webp', fit: 'contain', bg: '#121110' },
    tags: ['Flutter', 'Supabase', 'Realtime', 'iOS + Android'],
    metrics: [
      { value: 'iOS + Android', label: 'one codebase' },
      { value: 'Fixed scope', label: 'fixed price, fixed date' },
    ],
    problem:
      "Nickolas wanted an app for people who say they'll work on themselves and then don't. Tracking apps are lonely, and accountability groups live in messy group chats. The idea only works if logging takes seconds and your group can see whether you showed up.",
    built: [
      'Onboarding that drops you straight into your "tribe"',
      'One-tap logging for focus, training, food, sleep and reading',
      'A live "who showed up today" view, with streaks and a nudge button',
      'A group feed, privacy controls and a custom design system',
      'App settings the founder can change without a new release',
    ],
    how:
      'Before writing app code I built a clickable prototype of the whole app, so every screen was agreed up front. The app is Flutter for iOS and Android, on Supabase with live updates and row-level security.',
    links: [],
  },
  {
    slug: 'fallow',
    tier: 'side',
    brand: { bg: '#0F0C08', surface: '#1A150E', text: '#EDE3D1', muted: '#9C8E76', accent: '#C9A24A', display: "'Cormorant Garamond', Georgia, serif", body: "'Inter', system-ui, sans-serif", fontsHref: 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;1,400&display=swap' },
    name: 'Fallow',
    client: 'My product',
    kind: 'product',
    year: '2026',
    status: 'Launching',
    summary: 'A native iOS app blocker. Everything outside your daily free window stays locked, and you can’t talk your way out of it.',
    accent: '#C9A24A',
    cover: { type: 'image', src: '/images/work/fallow/field-2.webp', fit: 'cover', bg: '#0F0C08' },
    tags: ['Swift', 'Screen Time API', 'StoreKit', 'iOS'],
    problem:
      'Most app blockers have an "ignore for 15 minutes" button, which means they don’t really block anything. I wanted one where putting apps away is instant and taking them back costs you something.',
    built: [
      'A daily free window. Everything outside it is shielded',
      'Quick block for when you need quiet right now',
      'Cool-off locks: no deleting the app, no clock tricks',
      'Custom shield screens and in-app purchases',
    ],
    how:
      'Fully native Swift on Apple’s Screen Time frameworks (FamilyControls, ManagedSettings, DeviceActivity), with three app extensions next to the app. Apple only grants the Family Controls distribution entitlement after a manual review, and Fallow’s was approved.',
    gallery: [
      { src: '/images/work/fallow/g1.webp', alt: 'Quick block screen' },
      { src: '/images/work/fallow/g2.webp', alt: 'Schedule screen' },
      { src: '/images/work/fallow/g3.webp', alt: 'Lock settings' },
      { src: '/images/work/fallow/g4.webp', alt: 'Fallow brand screen' },
    ],
  },
  {
    slug: 'noteless',
    tier: 'side',
    brand: { bg: '#0E0E10', surface: '#17171A', text: '#E8E8ED', muted: '#8A8A93', accent: '#D4A574', display: "'Inter', system-ui, sans-serif", body: "'Inter', system-ui, sans-serif" },
    name: 'Noteless',
    client: 'My product',
    kind: 'product',
    year: '2024 – 2026',
    status: 'Live',
    summary: 'An AI notes app that grew from a smart notepad into an assistant that brainstorms with you and writes the notes itself.',
    accent: '#3B6BF8',
    cover: { type: 'image', src: '/images/work/noteless/cover.webp', fit: 'cover', bg: '#0e0e0e' },
    tags: ['Flutter', 'OpenAI', 'Anthropic', 'SQLite'],
    problem: 'Brainstorming produces scattered thoughts, and turning them into clean notes is a second job nobody does.',
    built: [
      'v1: AI rewrite and reorganise, image-to-text, speech-to-text and read-aloud',
      'v2: chat with an assistant while it writes and edits your notes for you',
      'Bring your own API key, with Anthropic, OpenAI and Kimi supported',
      'Token and cost tracking, so you always know what you’re spending',
    ],
    how:
      'v1 shipped on Android in 2024. v2 (2026) is a rebuild where the assistant edits notes through small, precise tools instead of rewriting whole documents. That keeps it fast and cheap.',
    gallery: [
      { src: '/images/work/noteless/g1.webp', alt: 'Chat that writes notes' },
      { src: '/images/work/noteless/g2.webp', alt: 'Generated go-to-market note' },
      { src: '/images/work/noteless/g4.webp', alt: 'v1 rewrite options' },
    ],
    links: [{ label: 'Google Play', href: 'https://play.google.com/store/apps/details?id=com.noteless' }],
  },
];

export const getProject = (slug: string) => PROJECTS.find((p) => p.slug === slug);

export const MAIN_QUESTS = ['atlas', 'vaultt', 'endless-pursuit', 'kleus'].map((s) => getProject(s)!);
export const SIDE_QUESTS = PROJECTS.filter((p) => p.tier === 'side');

/** Bragging numbers for the top of /work. Update by hand. */
export const STATS = [
  // Yanis approved both on 2026-11-07. Tokens: Claude Code's own /stats total to 5 Nov plus what the session
  // logs show since. Hours: the 2,043 he gave on 7 Oct plus 546 active session hours logged since then.
  { value: 112.5, suffix: 'B', decimals: 1, label: 'tokens through Claude' },
  { value: 2589, suffix: 'h', decimals: 0, label: 'in Claude Code' },
  { value: 200, prefix: '~', suffix: 'h', decimals: 0, label: 'in Codex' },
  // Yanis 2026-11-09, his words: "6+ figs made by my platforms" (Vaultt alone has made over six figures in revenue;
  // the other products' revenue is unknown, so the claim rests on Vaultt). Replaced the users stat. `static` keeps it
  // out of the count-up: counting 0 to 6 read "1+ figs", "2+ figs" on the way, which says something else. `unit`
  // renders small after the number: "6+ figs" at full size wrapped to two lines in the stat cells (and in /work's mono
  // it is a character wider than its column).
  { value: 6, suffix: '+', unit: 'figs', decimals: 0, label: 'made by my platforms', static: true },
];

/**
 * Honorable mentions, at the bottom of /work: things that are built but cannot be tried live (a private console, a
 * local tool, an app not in a store yet), each shown with a generated animation instead of a screenshot (`art` picks
 * it). Yanis picked the list on 2026-11-08. Rules: no links (nothing here opens for a visitor), no screenshots of a
 * private console, no real users' names or data. Facts come from the project inventory
 * (.scratch/inventory/projects.md, 2026-11-08) and Yanis's notes: anything they don't say stays out, so a line stays
 * plain rather than guess a number or a date.
 */
export interface HonorableMention {
  name: string;
  /** Where it stands, the card's first label: 'In build', 'Built', 'Live', 'Prototype', 'Parked'. */
  stage: string;
  /** What it is or where it runs, after the stage: 'iPhone', 'macOS', 'login only', a year. */
  kind: string;
  what: string;
  accent: string;
  art: 'orbit' | 'wave' | 'grid' | 'pulse' | 'bars' | 'stack';
}

export const HONORABLE_MENTIONS: HonorableMention[] = [
  {
    name: 'Liquid Orbit',
    stage: 'In build',
    kind: 'iPhone',
    what: 'A native iPhone satellite tracker, with the Earth and the Moon rendered in RealityKit and Metal.',
    accent: '#7CC4FF',
    art: 'orbit',
  },
  {
    name: 'Bloom',
    stage: 'Built',
    kind: 'macOS',
    what: 'Two Mac games made in Godot, Monolith and Farlands. Playable, never released.',
    accent: '#FF8FB8',
    art: 'grid',
  },
  {
    name: 'Endless Pursuit admin console',
    stage: 'Live',
    kind: 'login only',
    what: "The admin app behind Endless Pursuit: the app's settings, notifications, trophies, challenges and reports.",
    accent: '#E8C784',
    art: 'bars',
  },
  {
    name: 'Kleus Creators CRM',
    stage: 'Built',
    kind: 'private',
    what: 'A private workspace for reaching out to creators, with a lead finder built in.',
    accent: '#E0A458',
    art: 'pulse',
  },
  {
    name: 'HeyGen video console',
    stage: 'Prototype',
    kind: 'local',
    what: 'A Next.js playground for generating videos with HeyGen. An internal tool that runs locally, not hosted.',
    accent: '#A795FF',
    art: 'wave',
  },
  {
    name: 'Findo',
    stage: 'Parked',
    kind: '2025',
    what: 'A property platform built as three Next.js and Supabase apps. Parked.',
    accent: '#5FD3A2',
    art: 'stack',
  },
];
