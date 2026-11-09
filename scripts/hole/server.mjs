// A small local server for the offline black hole renderer: it serves the renderer's page and modules from
// scripts/hole/, and takes frames and data back from the page as plain binary POSTs.
//
// Why a server and not page.evaluate: a 4K frame is 33 MB (packed 10-bit RGB, 4 bytes a pixel), and Playwright
// moves evaluate results as JSON. Tried base64 through evaluate first in the earlier prototype harness: a few
// hundred ms a frame just to serialise. A fetch() POST to localhost moves the bytes as they are.
//
// Used by render.mjs (frames go to ffmpeg's stdin) and physics.mjs (float maps go to files for the Python check).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json' };

/**
 * Starts the server on 127.0.0.1 (a free port unless one is given).
 * root: the folder served for GET requests (scripts/hole/).
 * onPost(kind, query, buffer): called for POST /frame and POST /data with the whole body; the response is sent
 * when the promise it returns settles, so a page that awaits its fetch() is held back while ffmpeg catches up.
 */
export function startServer({ root, onPost, port = 0 }) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (req.method === 'POST') {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', async () => {
        try {
          await onPost(url.pathname.slice(1), url.searchParams, Buffer.concat(chunks));
          res.writeHead(200, { 'content-type': 'text/plain' });
          res.end('ok');
        } catch (e) {
          res.writeHead(500, { 'content-type': 'text/plain' });
          res.end(String(e && e.stack ? e.stack : e));
        }
      });
      return;
    }
    // GET: files under root only (no "..")
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'page.html';
    const file = path.join(root, rel);
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => resolve({ port: server.address().port, close: () => new Promise((r) => server.close(r)) }));
  });
}
