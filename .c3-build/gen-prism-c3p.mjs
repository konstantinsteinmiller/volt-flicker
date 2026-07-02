// gen-prism-c3p.mjs — wrap run/prism-bundle.js into a SCRIPT-ONLY volt-flicker
// project (VoltFlicker.c3p). No objects, no events, no behaviors → no Free-Edition
// limit is touched. The engine boots from `runOnStartup` (scripts/prism.js).
//
// The .c3p is a ZIP (STORE method, forward-slash paths), project.c3proj first.
// Icons are generated PNGs (RGBA via node:zlib) so the project is self-contained.
//
// Usage: node .c3-build/gen-prism-c3p.mjs [outDirRoot]
//   default output: .c3-build/VoltFlicker.c3p
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { deflateSync } from 'node:zlib';

const DIR = dirname(fileURLToPath(import.meta.url));

// ── CRC32 (shared by PNG + ZIP) ─────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

// ── PNG encoder (solid bg + cyan diamond) ───────────────────────────────
const pngChunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const body = Buffer.concat([t, data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
};
const pngIcon = (size) => {
  const W = size, H = size;
  const raw = Buffer.alloc((W * 4 + 1) * H);
  const cx = W / 2, cy = H / 2, r = W * 0.34;
  let o = 0;
  for (let y = 0; y < H; y++) {
    raw[o++] = 0; // filter: none
    for (let x = 0; x < W; x++) {
      const dxn = Math.abs(x + 0.5 - cx) / r, dyn = Math.abs(y + 0.5 - cy) / r;
      const inDiamond = dxn + dyn <= 1;
      const inner = dxn + dyn <= 0.5;
      let R = 14, G = 17, B = 22;          // #0e1116 bg
      if (inDiamond) { R = 51; G = 230; B = 255; }   // cyan
      if (inner) { R = 234; G = 252; B = 255; }       // hot center
      raw[o++] = R; raw[o++] = G; raw[o++] = B; raw[o++] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', deflateSync(raw)), pngChunk('IEND', Buffer.alloc(0))]);
};

// ── ZIP (STORE) writer ──────────────────────────────────────────────────
const zipStore = (entries) => {
  const locals = [], central = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8');
    const data = e.data;
    const crc = crc32(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0, 6);
    lh.writeUInt16LE(0, 8); lh.writeUInt16LE(0, 10); lh.writeUInt16LE(0, 12);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(name.length, 26); lh.writeUInt16LE(0, 28);
    const local = Buffer.concat([lh, name, data]);
    locals.push(local);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0, 8); ch.writeUInt16LE(0, 10); ch.writeUInt16LE(0, 12); ch.writeUInt16LE(0, 14);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(name.length, 28); ch.writeUInt16LE(0, 30); ch.writeUInt16LE(0, 32);
    ch.writeUInt16LE(0, 34); ch.writeUInt16LE(0, 36); ch.writeUInt32LE(0, 38);
    ch.writeUInt32LE(offset, 42);
    central.push(Buffer.concat([ch, name]));
    offset += local.length;
  }
  const localBlob = Buffer.concat(locals);
  const centralBlob = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(0, 4); eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBlob.length, 12); eocd.writeUInt32LE(localBlob.length, 16); eocd.writeUInt16LE(0, 20);
  return Buffer.concat([localBlob, centralBlob, eocd]);
};

const sid = () => Math.floor(100000000000000 + Math.random() * 899999999999999);

const main = async () => {
  const bundle = await readFile(join(DIR, 'run', 'prism-bundle.js'));

  const iconSizes = [16, 32, 64, 128, 256, 512];
  const iconItems = iconSizes.map((s) => ({ name: `icon-${s}.png`, type: 'image/png', sid: sid(), 'icon-info': { purpose: 'app-icon' } }));
  iconItems.push({ name: 'loading-logo.png', type: 'image/png', sid: sid(), 'icon-info': { purpose: 'loading-logo' } });

  const proj = {
    projectFormatVersion: 1,
    savedWithRelease: 48703,
    name: 'VoltFlicker',
    runtime: 'c3',
    useWorker: 'auto',
    bundleAddons: false,
    usedAddons: [],
    uniqueId: 'voltflicker1',
    objectTypes: { items: [], subfolders: [] },
    functionsName: 'Functions',
    autosaveData: null,
    containers: [],
    families: { items: [], subfolders: [] },
    layouts: { items: ['Game'], subfolders: [] },
    eventSheets: { items: ['Sheet1'], subfolders: [] },
    rootFileFolders: {
      script: { items: [{ name: 'prism.js', type: 'application/javascript', sid: sid(), 'file-info': { purpose: 'none' } }], subfolders: [] },
      sound: { items: [], subfolders: [] },
      music: { items: [], subfolders: [] },
      video: { items: [], subfolders: [] },
      font: { items: [], subfolders: [] },
      icon: { items: iconItems, subfolders: [] },
      general: { items: [], subfolders: [] }
    },
    timelines: { items: [], subfolders: [] },
    flowcharts: { items: [], subfolders: [] },
    models3d: { items: [], subfolders: [] },
    properties: {
      description: 'Project Volt-Flicker — JS-first Canvas2D engine hosted by volt-flicker.',
      version: '1.0.0.0', autoIncrementVersion: false,
      author: '', authorEmail: '', authorWebsite: '', appId: '',
      pixelRounding: false, zAxisScale: 'regular', fov: 0.7853981633974483,
      useLoaderLayout: false, fullscreenMode: 'letterbox-scale', fullscreenQuality: 'high',
      viewportFit: 'cover', backgroundColor: [0.91, 0.93, 0.945, 1], splashColor: [0.05, 0.07, 0.09, 1],
      useThemeColor: true, themeColor: [0.05, 0.07, 0.09, 1], orientations: 'any',
      webgpu: 'auto', multitexturing: 'auto', gpuPreference: 'high-performance',
      framerateMode: 'vsync', fixedFramerate: 60, sampling: 'trilinear', downscaling: 'medium',
      renderingMode: 'auto', anisotropicFiltering: 'auto', zNear: 1, zFar: 10000,
      maxSpriteSheetSize: 2048, loaderStyle: 'splash', preloadSounds: true,
      uidAllocationMode: 'increment', cordovaiOSScheme: 'app', cordovaAndroidScheme: 'https',
      exportFileStructure: 'folders', scriptsType: 'module'
    },
    viewportWidth: 1280, viewportHeight: 720, firstLayout: 'Game'
  };

  const layout = {
    name: 'Game',
    layers: [{
      name: 'Layer 0', overriden: 0, subLayers: [], instances: [],
      sid: sid(), effectTypes: [], isInitiallyVisible: true, isInitiallyInteractive: true,
      isHTMLElementsLayer: false, color: [1, 1, 1, 1], backgroundColor: [0.91, 0.93, 0.945, 1],
      isTransparent: true, sampling: 'auto', parallaxX: 1, parallaxY: 1, scaleRate: 1,
      forceOwnTexture: false, renderingMode: '2d', drawOrder: 'z-order', useRenderCells: false,
      blendMode: 'normal', zElevation: 0, global: false
    }],
    'scene-graphs-folder-root': { items: [], subfolders: [] },
    sid: sid(), 'nonworld-instances': [], effectTypes: [],
    width: 1280, height: 720, unboundedScrolling: false, sampling: 'auto',
    vpX: 0.5, vpY: 0.5, projection: 'perspective', eventSheet: 'Sheet1'
  };

  const sheet = { name: 'Sheet1', events: [], sid: sid() };

  const enc = (obj) => Buffer.from(JSON.stringify(obj, null, '\t'), 'utf8');
  const entries = [
    { name: 'project.c3proj', data: enc(proj) },           // must be first
    { name: 'layouts/Game.json', data: enc(layout) },
    { name: 'eventSheets/Sheet1.json', data: enc(sheet) },
    { name: 'scripts/prism.js', data: bundle }
  ];
  for (const s of iconSizes) entries.push({ name: `icons/icon-${s}.png`, data: pngIcon(s) });
  entries.push({ name: 'icons/loading-logo.png', data: pngIcon(256) });

  const zip = zipStore(entries);
  const out = join(DIR, 'VoltFlicker.c3p');
  await writeFile(out, zip);
  console.log('wrote', out, `(${zip.length} bytes, ${entries.length} files, bundle ${bundle.length}b)`);
};
main();
