import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://www.strade.tech',
  // Canonicals have no trailing slash; Vercel redirects /work/ -> /work to match.
  trailingSlash: 'never',
  vite: {
    plugins: [tailwindcss()],
    // Only `astro dev` uses node_modules/.vite. A build writes <cacheDir>/deps as well, and one that replaced
    // the running dev server's pre-bundled deps left it answering 504 "Outdated Optimize Dep" for gsap (no
    // scroll motion) until restarted (2026-11-07). So builds, sync and check get their own folder. A second
    // `astro dev` in this folder would still share it: check work with a build, not another dev server.
    // STRADE_VITE_CACHE gives one build its own folder, so agents that build at the same time never race on it.
    cacheDir:
      process.env.STRADE_VITE_CACHE || (process.argv.includes('dev') ? './node_modules/.vite' : './node_modules/.vite-build'),
    // Pre-bundle every client dependency at dev startup. Without this the first page load discovers gsap and
    // the dev toolbar one by one, Vite re-bundles twice and reloads, and the toolbar's script then answers 504
    // until the next restart. gsap and gsap/ScrollTrigger are the only npm imports in client code, apart from the
    // private /vision pages: three (each addon is imported by its own path, so each is listed) and lil-gui.
    optimizeDeps: {
      include: [
        'gsap', 'gsap/ScrollTrigger', 'astro/runtime/client/dev-toolbar/entrypoint.js',
        'three', 'lil-gui',
        'three/addons/controls/OrbitControls.js', 'three/addons/environments/RoomEnvironment.js',
        'three/addons/geometries/RoundedBoxGeometry.js', 'three/addons/utils/BufferGeometryUtils.js',
        'three/addons/postprocessing/EffectComposer.js', 'three/addons/postprocessing/RenderPass.js',
        'three/addons/postprocessing/UnrealBloomPass.js', 'three/addons/postprocessing/OutputPass.js',
      ],
    },
  },
  // /vision pages are private, shared by link only: noindex (Base.astro) and left out of the sitemap
  integrations: [sitemap({ filter: (page) => !page.includes('/404') && !page.includes('/vision') })],
});
