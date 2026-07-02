// CORS-enabled static server for the Prism Shift dev pipeline.
//
// Serves the whole `.c3-build/` tree on :8347 so both work:
//   • the standalone dev HARNESS at  http://localhost:8347/run/
//   • the generated project at        http://localhost:8347/PrismShift.c3p
//
// Why hostname `localhost` (not 127.0.0.1): the volt-flicker editor's CSP allows
// `connect-src http://localhost:*` but NOT the literal `127.0.0.1`, and the
// editor fetch-override rig must reach us by hostname. `localhost` can resolve
// to either stack, so we bind BOTH 127.0.0.1 and ::1.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize, extname } from 'node:path';

const DIR = dirname(fileURLToPath(import.meta.url));
const PORT = 8347;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.c3p': 'application/octet-stream'
};

const handler = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  try {
    let name = decodeURIComponent((req.url || '/').split('?')[0]);
    name = name.replace(/^\/+/, '') || 'run/index.html'; // root → the playable game
    let path = normalize(join(DIR, name));
    if (!path.startsWith(DIR)) { res.writeHead(403).end('forbidden'); return; }

    // Directory → serve its index.html (so /run/ works).
    try {
      const s = await stat(path);
      if (s.isDirectory()) path = join(path, 'index.html');
    } catch { /* fall through to readFile which 404s */ }

    const data = await readFile(path);
    const type = TYPES[extname(path).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type });
    res.end(data);
  } catch (e) {
    res.writeHead(404).end('not found: ' + e.message);
  }
};

createServer(handler).listen(PORT, '127.0.0.1', () => console.log('prism server on http://localhost:' + PORT + '  (run/ harness + .c3p)'));
createServer(handler).listen(PORT, '::1', () => { /* dual-stack; localhost may resolve to ::1 */ });
