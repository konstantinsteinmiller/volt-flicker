// bundle.mjs — concat the ES modules (dependency order) into ONE classic-script
// IIFE: strip single-line `import …` lines and the `export ` keyword (symbols
// are uniquely named across modules, so flattening is safe). Output is the
// volt-flicker script `run/prism-bundle.js`. Run `node --check` on it afterwards.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const DIR = dirname(fileURLToPath(import.meta.url));
const SRC = join(DIR, 'run', 'prism');
const OUT = join(DIR, 'run', 'prism-bundle.js');

// dependency order (leaves first)
const ORDER = [
  'tuning.js', 'core.js', 'levels.js', 'world.js', 'player.js',
  'enemies.js', 'skills.js', 'juice.js', 'audio.js', 'render.js', 'ui.js', 'editor.js', 'game.js', 'c3-entry.js'
];

const strip = (code) =>
  code.split('\n')
    .filter((l) => !/^\s*import\s.+from\s+['"].+['"];?\s*$/.test(l) && !/^\s*import\s+['"].+['"];?\s*$/.test(l))
    .map((l) => l.replace(/^(\s*)export\s+(default\s+)?/, '$1'))
    .join('\n');

const main = async () => {
  let body = '';
  for (const f of ORDER) {
    const code = await readFile(join(SRC, f), 'utf8');
    body += `\n// ── ${f} ──────────────────────────────────────────────\n` + strip(code) + '\n';
  }
  const out =
`/* Prism Shift: OVERPOWERED — generated bundle. Do not edit by hand.
   Source: .c3-build/run/prism/*.js  →  rebuild with: node .c3-build/bundle.mjs */
(function(){
'use strict';
${body}
})();
`;
  await writeFile(OUT, out, 'utf8');
  console.log('bundled', ORDER.length, 'modules ->', OUT, `(${out.length} bytes)`);
};
main();
