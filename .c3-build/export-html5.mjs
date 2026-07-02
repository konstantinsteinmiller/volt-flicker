// export-html5.mjs — self-contained HTML5 export of the Prism engine.
//
// The Prism engine (.c3-build/run/prism/*.js) is fully self-contained: it
// synthesises its own audio via the Web Audio API and fetches no external
// assets, so the entire playable game is just two files:
//   dist/index.html        — loads the bundle with a RELATIVE <script src>
//   dist/prism-bundle.js    — the whole engine (built by bundle.mjs)
// A relative src means the build works under ANY base path, including the
// GitHub Pages subpath https://<user>.github.io/volt-flicker/ .
//
// Run: node .c3-build/export-html5.mjs   (or: npm run build:construct-crazygames)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { deflateRawSync } from 'node:zlib';

const DIR = dirname(fileURLToPath(import.meta.url));

// Rebundle the engine to completion (child process so bundle.mjs's async main()
// is fully flushed before we read its output — importing it would race).
console.log('[export] bundling engine (bundle.mjs)…');
execFileSync(process.execPath, [join(DIR, 'bundle.mjs')], { stdio: 'inherit' });

const bundle = readFileSync(join(DIR, 'run', 'prism-bundle.js'));

const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover" />
<meta name="theme-color" content="#070b16" />
<meta name="description" content="Volt Flicker — an OVERPOWERED arcade action game." />
<title>Volt Flicker</title>
<link rel="icon" href="data:," />
<style>
  :root{color-scheme:dark}
  html,body{margin:0;height:100%;overflow:hidden;background:#070b16}
  *{-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent}
</style></head>
<body>
  <!-- The engine appends its own #prism-canvas and boots on DOMContentLoaded. -->
  <script src="prism-bundle.js"></script>
</body></html>
`;

// The output is a fixed, always-overwritten set of files (index.html,
// prism-bundle.js, the zip), so we just ensure the dir exists rather than
// nuking it — a hard rm EPERMs on Windows if a static server holds the dir.
const DIST = join(DIR, 'dist');
mkdirSync(DIST, { recursive: true });
writeFileSync(join(DIST, 'index.html'), html);
writeFileSync(join(DIST, 'prism-bundle.js'), bundle);

// ── zip (deflate) the build, for portal uploads (CrazyGames/itch/…) ─────────
function crc32(b) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) { c ^= b[i]; for (let j = 0; j < 8; j++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0); } return (c ^ 0xffffffff) >>> 0; }
function zipDeflate(entries, outPath) {
  const parts = [], cd = []; let off = 0;
  for (const e of entries) {
    const nm = Buffer.from(e.name, 'utf8'), comp = deflateRawSync(e.data, { level: 9 }), crc = crc32(e.data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(8, 8);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(e.data.length, 22); lh.writeUInt16LE(nm.length, 26);
    parts.push(lh, nm, comp);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(8, 10);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(e.data.length, 24); ch.writeUInt16LE(nm.length, 28); ch.writeUInt32LE(off, 42);
    cd.push(ch, nm); off += 30 + nm.length + comp.length;
  }
  let cdSize = 0; for (const c of cd) cdSize += c.length;
  const eo = Buffer.alloc(22);
  eo.writeUInt32LE(0x06054b50, 0); eo.writeUInt16LE(entries.length, 8); eo.writeUInt16LE(entries.length, 10); eo.writeUInt32LE(cdSize, 12); eo.writeUInt32LE(off, 16);
  writeFileSync(outPath, Buffer.concat([...parts, ...cd, eo]));
}
zipDeflate(
  [{ name: 'index.html', data: Buffer.from(html, 'utf8') }, { name: 'prism-bundle.js', data: bundle }],
  join(DIST, 'VoltFlicker-html5.zip')
);

console.log('[export] dist -> .c3-build/dist/ (index.html + prism-bundle.js, ' + (bundle.length / 1024 | 0) + 'KB)');
console.log('[export] zip  -> .c3-build/dist/VoltFlicker-html5.zip');
