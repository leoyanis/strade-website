// /llms.txt: a plain-text map of the site for AI assistants (https://llmstxt.org).
// Built from the same data as the pages, so it stays current on its own.
import type { APIRoute } from 'astro';
import { SITE } from '../data/site';
import { PROJECTS } from '../data/work';
import { RESOURCES } from '../data/resources';
import { abs } from '../data/seo';

export const GET: APIRoute = () => {
  const work = PROJECTS.map(
    (p) => `- [${p.name}](${abs(`/work/${p.slug}`)}): ${p.summary} (${p.kind === 'product' ? 'own product' : 'client work'}, ${p.year}, ${p.status})`,
  );
  const free = RESOURCES.filter((r) => r.published).map(
    (r) => `- [${r.title}](${abs(`/free/${r.slug}`)}): ${r.summary.trim()}`,
  );

  const body = `# ${SITE.name}

> ${SITE.name} builds apps, automations and AI tools for founders and businesses, at a fixed price, and the client owns the code. ${SITE.tagline}

He works through ${SITE.company}. Languages: English, German, Spanish, Romanian.

- Book a call: ${SITE.booking}
- Email: ${SITE.email}
- Instagram: ${SITE.instagram}
- LinkedIn: ${SITE.linkedin}

## Work

${work.join('\n')}

## Free resources

${free.join('\n')}

## Pages

- [Home](${abs('/')}): who Yanis is, how he works, featured case studies
- [All work](${abs('/work')}): every project, shipped and in progress
- [Free stuff](${abs('/free')}): Claude skills, prompts and templates he gives away
- [Contact](${abs('/contact')}): book a call or send an email
`;

  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
