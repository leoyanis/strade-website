// Structured data (schema.org JSON-LD) shared across pages.
// Base.astro always emits the Person + WebSite + WebPage graph; pages add their own nodes.
import { SITE } from './site';
import type { Project } from './work';
import type { Resource } from './resources';

export const abs = (path: string) => `${SITE.url}${path === '/' ? '' : path}`;

export const PERSON_ID = `${SITE.url}/#person`;
export const WEBSITE_ID = `${SITE.url}/#website`;

export type Crumb = { name: string; path: string };

export const person = {
  '@type': 'Person',
  '@id': PERSON_ID,
  name: SITE.name,
  url: SITE.url,
  image: abs(SITE.portrait),
  email: `mailto:${SITE.email}`,
  jobTitle: 'Builder: apps, automations and AI tools',
  description: SITE.tagline,
  knowsLanguage: ['en', 'de', 'es', 'ro'],
  knowsAbout: ['App development', 'Automation', 'AI tools', 'Product design', 'Claude'],
  sameAs: [SITE.instagram, SITE.linkedin],
  worksFor: { '@type': 'Organization', name: SITE.company, url: SITE.url },
};

export const website = {
  '@type': 'WebSite',
  '@id': WEBSITE_ID,
  name: SITE.name,
  url: SITE.url,
  inLanguage: 'en',
  publisher: { '@id': PERSON_ID },
};

export const breadcrumbList = (crumbs: Crumb[]) => ({
  '@type': 'BreadcrumbList',
  itemListElement: crumbs.map((c, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    name: c.name,
    item: abs(c.path),
  })),
});

export const projectCrumbs = (p: Project): Crumb[] => [
  { name: 'Home', path: '/' },
  { name: 'Work', path: '/work' },
  { name: p.name, path: `/work/${p.slug}` },
];

export const projectSchema = (p: Project) => ({
  '@type': 'CreativeWork',
  '@id': `${abs(`/work/${p.slug}`)}#work`,
  name: p.name,
  description: p.summary,
  url: abs(`/work/${p.slug}`),
  image: abs(`/og/work-${p.slug}.png`),
  creator: { '@id': PERSON_ID },
  dateCreated: p.year.match(/\d{4}/)?.[0],
  keywords: p.tags.join(', '),
  ...(p.links?.length ? { sameAs: p.links.map((l) => l.href).filter((h) => h.startsWith('http')) } : {}),
});

export const resourceCrumbs = (r: Resource): Crumb[] => [
  { name: 'Home', path: '/' },
  { name: 'Free stuff', path: '/free' },
  { name: r.title, path: `/free/${r.slug}` },
];

export const resourceSchema = (r: Resource, image: string) => ({
  '@type': 'CreativeWork',
  '@id': `${abs(`/free/${r.slug}`)}#resource`,
  name: r.title,
  description: r.summary,
  url: abs(`/free/${r.slug}`),
  image: abs(image),
  genre: r.kind,
  datePublished: r.date,
  isAccessibleForFree: true,
  author: { '@id': PERSON_ID },
});
