// Tiny CORS-enabled static server for serving the latest .c3p to the Construct editor
// running in the automation browser. https editor.construct.net -> http://localhost is
// allowed by Chromium (localhost is treated as potentially-trustworthy, not mixed-content).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize } from 'node:path';

const DIR = dirname(fileURLToPath(import.meta.url));
const PORT = 8347;

const handler = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  try {
    const name = decodeURIComponent((req.url || '/').split('?')[0].replace(/^\//, '')) || 'PlatformTest.c3p';
    const path = normalize(join(DIR, name));
    if (!path.startsWith(DIR)) { res.writeHead(403).end('forbidden'); return; }
    const data = await readFile(path);
    res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
    res.end(data);
  } catch (e) {
    res.writeHead(404).end('not found: ' + e.message);
  }
};
// Bind both IPv4 and IPv6 loopback explicitly, since "localhost" can resolve to either.
createServer(handler).listen(PORT, '127.0.0.1', () => console.log('c3p server on http://127.0.0.1:' + PORT));
createServer(handler).listen(PORT, '::1', () => console.log('c3p server on http://[::1]:' + PORT));
