// c3-entry.js — single boot path for BOTH targets. Creates a full-bleed canvas,
// starts the engine, installs the debug API. In volt-flicker the global
// `runOnStartup` exists (boot when the runtime is ready); in the standalone
// harness it doesn't, so we boot on DOMContentLoaded. The engine itself never
// touches any volt-flicker API, so identical code runs in both.

import { Game } from './game.js';

const startPrism = () => {
  if (window.__prismGame) return;
  const canvas = document.createElement('canvas');
  canvas.id = 'prism-canvas';
  // z-index must sit ABOVE volt-flicker's own runtime canvas/shell, or Preview shows
  // a blank C3 canvas over our game. A huge z-index guarantees we're on top in
  // both the harness (no other canvas) and inside volt-flicker.
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;display:block;z-index:2147483000;touch-action:none;background:#e9edf1';
  document.body.appendChild(canvas);
  const game = new Game(canvas);
  window.__prismGame = game;
  game.installDebugApi();
  game.boot(document.body);
};

if (typeof runOnStartup === 'function') {
  // volt-flicker: boot once the runtime is ready. Wrapped in try/catch so a boot
  // throw surfaces in the console instead of silently leaving a blank canvas.
  // eslint-disable-next-line no-undef
  runOnStartup(async () => {
    try { startPrism(); }
    catch (e) { console.error('[Prism] boot failed', e); }
  });
} else if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startPrism);
  else startPrism();
}
