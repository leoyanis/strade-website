import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://strade.tech',
  vite: {
    plugins: [tailwindcss()],
    cacheDir: './node_modules/.vite',
  },
  integrations: [sitemap()],
});
