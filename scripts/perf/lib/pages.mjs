// The pages the harness knows. Sections are the homepage's acts; case studies use auto-discovery
// (main > section and friends, see inpage.js) so new sections show up without touching this file.
export const PAGES = {
  home: {
    path: '/',
    // in page order: each frame is counted in the section that holds the screen's centre line
    sections: ['#hero', '#mq-atlas', '#mq-vaultt', '#mq-endless-pursuit', '#act-stripes', '#act-free', '#act-blueprint', '#act-west', '#finale', '#site-footer'],
    interact: true,
    files: ['src/pages/index.astro', 'src/scripts', 'src/components/atlas', 'src/components/home', 'src/components/vaultt', 'src/components/ep', 'src/components/free-act', 'src/components/west', 'src/components/space', 'src/layouts/Base.astro'],
  },
  atlas: { path: '/work/atlas' },
  vaultt: { path: '/work/vaultt' },
  'endless-pursuit': { path: '/work/endless-pursuit' },
  fallow: { path: '/work/fallow' },
  kleus: { path: '/work/kleus' },
  noteless: { path: '/work/noteless' },
  'outreach-crm': { path: '/work/outreach-crm' },
  playivity: { path: '/work/playivity' },
  sequenced: { path: '/work/sequenced' },
  youcook: { path: '/work/youcook' },
  work: { path: '/work' },
  free: { path: '/free' },
  // a long plain page served by the harness itself: what the browser and the harness cost with no site code
  control: { path: '/__perf/control', sections: ['main'] },
};
// the code each case study runs (for the scrub list)
for (const k of ['atlas', 'vaultt', 'endless-pursuit', 'fallow', 'kleus', 'noteless', 'outreach-crm', 'playivity', 'sequenced', 'youcook']) {
  PAGES[k].files = [`src/pages/work/${k}.astro`, `src/components/case/${k}`, 'src/layouts/Base.astro', ...(k === 'atlas' ? ['src/scripts', 'src/components/atlas'] : []), ...(k === 'vaultt' ? ['src/components/vaultt'] : []), ...(k === 'endless-pursuit' ? ['src/components/ep'] : [])];
}
export const CASE_STUDIES = ['atlas', 'vaultt', 'endless-pursuit', 'fallow', 'kleus', 'noteless', 'outreach-crm', 'playivity', 'sequenced', 'youcook'];
