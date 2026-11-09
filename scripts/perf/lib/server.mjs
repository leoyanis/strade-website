// A small static server for the production build, close enough to Vercel for performance work:
// trailingSlash 'never' routing (/work/atlas -> work/atlas/index.html), brotli for text, Range requests for media
// (Chromium and WebKit both stream video with ranges), and the cache headers vercel.json sets. No dependencies.
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync, readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { brotliCompressSync, constants as zc } from 'node:zlib';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.map': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
  '.webmanifest': 'application/manifest+json',
  '.pdf': 'application/pdf',
};
const COMPRESS = new Set(['.html', '.css', '.js', '.mjs', '.json', '.svg', '.txt', '.xml', '.webmanifest', '.map']);

export function startServer({ root, port = 4397, host = '127.0.0.1', log = false } = {}) {
  if (!existsSync(root)) throw new Error(`build folder missing: ${root}`);
  const brCache = new Map();
  const resolve = (urlPath) => {
    let p = decodeURIComponent(urlPath.split('?')[0]);
    p = normalize(p).replace(/^(\.\.[/\\])+/, '');
    const cands = [join(root, p)];
    if (!extname(p)) cands.push(join(root, p, 'index.html'), join(root, `${p}.html`));
    for (const c of cands) {
      if (existsSync(c) && statSync(c).isFile()) return c;
    }
    return null;
  };
  const server = createServer((req, res) => {
    // the harness's control page: a long plain page, to measure what the browser and harness cost on their own
    if ((req.url || '').startsWith('/__perf/control')) {
      res.writeHead(200, { 'content-type': TYPES['.html'] });
      // 16 blocks (about 10,000 px at 1440 wide, the homepage's order of length); 60 made a control pass take
      // longer than the homepage itself
      const blocks = Array.from({ length: 16 }, (_, i) => `<section id="c${i}" style="height:600px;padding:40px;border-bottom:1px solid #333"><h2>Block ${i}</h2><p>${'Plain text for scrolling. '.repeat(40)}</p></section>`).join('');
      return res.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>control</title></head><body style="margin:0;background:#0b0b0d;color:#ddd;font:16px/1.5 system-ui"><main>${blocks}</main></body></html>`);
    }
    const file = resolve(req.url || '/');
    if (!file) {
      const nf = join(root, '404.html');
      res.writeHead(404, { 'content-type': TYPES['.html'] });
      return res.end(existsSync(nf) ? readFileSync(nf) : 'not found');
    }
    const ext = extname(file).toLowerCase();
    const type = TYPES[ext] || 'application/octet-stream';
    const st = statSync(file);
    const headers = { 'content-type': type, 'accept-ranges': 'bytes', 'last-modified': st.mtime.toUTCString() };
    // vercel.json sets a long cache for /fonts only; everything else gets Vercel's static default. (Each measured
    // context starts with an empty cache, so this only matters for repeat-visit checks.)
    headers['cache-control'] = req.url.startsWith('/fonts/') ? 'public, max-age=31536000, immutable' : 'public, max-age=0, must-revalidate';
    const ae = String(req.headers['accept-encoding'] || '');
    if (COMPRESS.has(ext) && ae.includes('br') && !req.headers.range) {
      const key = `${file}:${st.mtimeMs}`;
      let body = brCache.get(key);
      if (!body) {
        body = brotliCompressSync(readFileSync(file), { params: { [zc.BROTLI_PARAM_QUALITY]: 9 } });
        brCache.set(key, body);
      }
      headers['content-encoding'] = 'br';
      headers['content-length'] = body.length;
      headers.vary = 'accept-encoding';
      res.writeHead(200, headers);
      if (log) console.log(`200 br ${req.url}`);
      return res.end(req.method === 'HEAD' ? undefined : body);
    }
    const range = req.headers.range && /bytes=(\d*)-(\d*)/.exec(req.headers.range);
    if (range) {
      let start = range[1] === '' ? st.size - Number(range[2]) : Number(range[1]);
      let end = range[1] !== '' && range[2] !== '' ? Number(range[2]) : st.size - 1;
      if (range[1] === '') end = st.size - 1;
      start = Math.max(0, start);
      end = Math.min(st.size - 1, end);
      if (start > end) {
        res.writeHead(416, { 'content-range': `bytes */${st.size}` });
        return res.end();
      }
      headers['content-range'] = `bytes ${start}-${end}/${st.size}`;
      headers['content-length'] = end - start + 1;
      res.writeHead(206, headers);
      if (log) console.log(`206 ${req.url} ${start}-${end}`);
      if (req.method === 'HEAD') return res.end();
      return createReadStream(file, { start, end }).pipe(res);
    }
    headers['content-length'] = st.size;
    res.writeHead(200, headers);
    if (log) console.log(`200 ${req.url}`);
    if (req.method === 'HEAD') return res.end();
    createReadStream(file).pipe(res);
  });
  return new Promise((ok, fail) => {
    server.once('error', fail);
    server.listen(port, host, () => ok({ url: `http://${host}:${port}`, close: () => new Promise((r) => server.close(() => r())) }));
  });
}
