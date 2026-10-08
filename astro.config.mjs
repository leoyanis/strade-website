import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://www.strade.tech',
  // Canonicals have no trailing slash; Vercel redirects /work/ -> /work to match.
  trailingSlash: 'never',
  vite: {
    plugins: [tailwindcss()],
    cacheDir: './node_modules/.vite',
  },
  integrations: [sitemap({ filter: (page) => !page.includes('/404') })],
});
