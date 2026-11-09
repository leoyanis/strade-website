// Maps bundle positions (trace stack frames, LoAF char positions) back to src/ file:line.
// Frame rates are measured on the plain build (.scratch/build-perf); the attribution build
// (scripts/perf/astro.maps.config.mjs -> .scratch/build-perf-maps) is the same code plus source maps. A served
// chunk is matched to its mapped twin by content (its bytes equal the twin minus the sourceMappingURL line), so
// a chunk whose source changed between the two builds is left unmapped instead of being mapped wrongly.
// source-map-js is already in node_modules (postcss depends on it), so this adds no dependency.
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const sha = (s) => createHash('sha1').update(s).digest('hex');
// only the comment line: the code before it keeps its own trailing newline, like the plain build's file
const stripMapComment = (code) => code.replace(/\/\/# sourceMappingURL=[^\n]*\n?$/, '');

export function makeResolver(root, servedDir, mapsDir) {
  let SMC;
  try {
    SMC = createRequire(join(root, 'package.json'))('source-map-js').SourceMapConsumer;
  } catch {
    return null;
  }
  if (!mapsDir || !existsSync(join(mapsDir, '_astro'))) return null;
  // content hash -> mapped twin
  const twins = new Map();
  for (const f of readdirSync(join(mapsDir, '_astro'))) {
    if (!f.endsWith('.js')) continue;
    const p = join(mapsDir, '_astro', f);
    if (!existsSync(`${p}.map`)) continue;
    twins.set(sha(stripMapComment(readFileSync(p, 'utf8'))), p);
  }
  const cache = new Map();
  const load = (url) => {
    const m = /\/(_astro\/[^?#]+\.js)/.exec(url || '');
    if (!m) return null;
    if (cache.has(m[1])) return cache.get(m[1]);
    let v = null;
    const served = join(servedDir, m[1]);
    if (existsSync(served)) {
      const code = readFileSync(served, 'utf8');
      const twin = twins.get(sha(stripMapComment(code)));
      if (twin) {
        const starts = [0];
        for (let i = 0; i < code.length; i++) if (code.charCodeAt(i) === 10) starts.push(i + 1);
        v = { starts, smc: new SMC(JSON.parse(readFileSync(`${twin}.map`, 'utf8'))) };
      }
    }
    cache.set(m[1], v);
    return v;
  };
  const short = (src) => String(src || '').replace(/^.*?\/(src|node_modules)\//, '$1/').replace(/\?astro&type=script.*$/, ' <script>');
  const fmt = (p) => (p && p.source ? `${short(p.source)}:${p.line}${p.name ? ` (${p.name})` : ''}` : null);
  return {
    has: (url) => !!load(url),
    // line 1-based, column 0-based, as the trace's stack frames report them (checked against the bundle text)
    at(url, line, column) {
      const v = load(url);
      if (!v || line == null) return null;
      return fmt(v.smc.originalPositionFor({ line: Number(line), column: Number(column || 0) }));
    },
    // LoAF sourceCharPosition: an offset into the whole file
    char(url, pos) {
      const v = load(url);
      if (!v || pos == null || pos < 0) return null;
      let lo = 0;
      let hi = v.starts.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (v.starts[mid] <= pos) lo = mid;
        else hi = mid - 1;
      }
      return fmt(v.smc.originalPositionFor({ line: lo + 1, column: pos - v.starts[lo] }));
    },
  };
}
