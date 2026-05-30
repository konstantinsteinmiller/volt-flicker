// ─── Canvas renderer + VFX for Epicancer ───────────────────────────────────
//
// Pure drawing layer. Reads the module-singleton `game` snapshot from
// `useEpicGame` and the active power-up from `usePowerups`; owns NO game logic.
// All pixel geometry / isometric projection lives here.
//
// The diamond floor uses the square `grid-tile-*` textures projected into iso
// diamonds. Projecting per tile every frame (rotate + squash) is expensive, so
// each tile variant is pre-rendered ONCE into an offscreen diamond canvas and
// blitted axis-aligned thereafter. The cache rebuilds when the tile size
// changes (resize / orientation change).

import { prependBaseUrl } from '@/utils/function'
import { resourceCache } from '@/use/useAssets'
import { game, C_MAX, DROP_MS, TELEPORT_SLOW_MS, type ObstacleKind, type FxEvent } from '@/use/useEpicGame'
import { activePowerup } from '@/use/usePowerups'

const FLOOR_VARIANTS = [
  'images/props/grid-tile-1.webp',
  'images/props/grid-tile-2.webp',
  'images/props/grid-tile-3.webp',
  'images/props/grid-tile-4.webp',
  'images/props/grid-tile-5.webp'
]
const SPECIAL_VARIANTS = [
  'images/props/grid-tile-special-1.webp',
  'images/props/grid-tile-special-2.webp',
  'images/props/grid-tile-special-3.webp'
]
const COIN_SRC = 'images/props/coin_128x128.webp'
const BOX_SRC = 'images/props/box_256x256.webp'
const BOULDER_SRC = 'images/props/boulder_256x256.webp'
const ITEM_BOX_SRC = 'images/props/item-box-single_256y256.webp'
const ITEM_SPARKLE_SRC = 'images/props/item-box-sparkles_256y256.webp'
const VORTEX_SRC = 'images/props/vortex_256x256.webp'
const LAVA_SRC = 'images/props/lava_256x256.webp'
const SPIKE_SRC = 'images/props/spiky-pole_256x256.webp'
const LIBERTY_CAT_SRC = 'images/props/liberty-cat.webp'
const BALL_SKIN_SRC = 'images/models/ball-eye-texture.webp'
const WINGS_SRC = 'images/props/wings_260x108.webp'

const TILE_SRCS = [
  ...FLOOR_VARIANTS, ...SPECIAL_VARIANTS,
  COIN_SRC, BOX_SRC, BOULDER_SRC, ITEM_BOX_SRC, ITEM_SPARKLE_SRC, VORTEX_SRC, LAVA_SRC, SPIKE_SRC, LIBERTY_CAT_SRC,
  BALL_SKIN_SRC, WINGS_SRC
]

const getImg = (src: string): HTMLImageElement => {
  let img = resourceCache.images.get(src)
  if (!img) {
    img = new Image()
    img.src = prependBaseUrl(src)
    resourceCache.images.set(src, img)
  }
  return img
}
const ready = (img: HTMLImageElement): boolean => img.complete && img.naturalWidth > 0

const loadImage = (src: string): Promise<void> =>
  new Promise<void>((resolve) => {
    const img = getImg(src)
    if (ready(img)) { resolve(); return }
    const done = () => { img.removeEventListener('load', done); img.removeEventListener('error', done); resolve() }
    img.addEventListener('load', done, { once: true })
    img.addEventListener('error', done, { once: true })
  })

/** Decode every grid-tile + coin sprite before first paint (asset preloader). */
export const warmTileImages = async (): Promise<void> => {
  await Promise.allSettled(TILE_SRCS.map(loadImage))
}

// ─── Geometry ───────────────────────────────────────────────────────────────

interface Geometry { halfW: number; halfH: number; offsetX: number; tileW: number; tileH: number }
let geo: Geometry = { halfW: 40, halfH: 24, offsetX: 0, tileW: 80, tileH: 48 }

/** Recompute tile geometry for a viewport. Returns true when it changed. */
export const configureGeometry = (w: number, h: number): boolean => {
  const halfW = Math.min((w * 0.92) / C_MAX, h * 0.11)
  const halfH = halfW * 0.6
  const tileW = halfW * 2
  const tileH = halfH * 2
  const offsetX = (w - C_MAX * halfW) / 2
  const changed = Math.abs(halfW - geo.halfW) > 0.5
  geo = { halfW, halfH, offsetX, tileW, tileH }
  if (changed) diamondCache.clear()
  return changed
}

const hash = (c: number, r: number): number => ((c * 73856093) ^ (r * 19349663)) >>> 0
const project = (c: number, r: number, camOffsetY: number): { x: number; y: number } => ({
  x: c * geo.halfW + geo.offsetX,
  y: r * geo.halfH + camOffsetY
})

// ─── Pre-rendered diamond tile cache ────────────────────────────────────────

const diamondCache = new Map<string, HTMLCanvasElement>()

const buildDiamond = (src: string): HTMLCanvasElement | null => {
  const img = getImg(src)
  if (!ready(img)) return null
  const cv = document.createElement('canvas')
  const w = Math.ceil(geo.tileW) + 2
  const hh = Math.ceil(geo.tileH) + 2
  cv.width = w
  cv.height = hh
  const cx = cv.getContext('2d')
  if (!cx) return null
  cx.translate(w / 2, hh / 2)
  cx.scale(1, geo.tileH / geo.tileW)
  cx.rotate(Math.PI / 4)
  const side = (geo.tileW / Math.SQRT2) * 1.03 // slight overdraw kills hairline seams
  cx.drawImage(img, -side / 2, -side / 2, side, side)
  return cv
}

const getDiamond = (src: string): HTMLCanvasElement | null => {
  const cached = diamondCache.get(src)
  if (cached) return cached
  const built = buildDiamond(src)
  if (built) diamondCache.set(src, built)
  return built
}

const variantFor = (c: number, r: number): string => {
  const hh = hash(c, r)
  if (hh % 13 === 0) return SPECIAL_VARIANTS[hh % SPECIAL_VARIANTS.length]!
  return FLOOR_VARIANTS[hh % FLOOR_VARIANTS.length]!
}

// ─── Vector primitives ──────────────────────────────────────────────────────

const diamondPath = (ctx: CanvasRenderingContext2D, x: number, y: number, hw: number, hh: number): void => {
  ctx.beginPath()
  ctx.moveTo(x, y - hh)
  ctx.lineTo(x + hw, y)
  ctx.lineTo(x, y + hh)
  ctx.lineTo(x - hw, y)
  ctx.closePath()
}

const drawFloorTile = (ctx: CanvasRenderingContext2D, c: number, r: number, x: number, y: number): void => {
  const dia = getDiamond(variantFor(c, r))
  if (dia) {
    ctx.drawImage(dia, x - dia.width / 2, y - dia.height / 2)
  } else {
    // Procedural fallback: alternating blue checker like the reference.
    const light = ((c + r) >> 1) % 2 === 0
    ctx.fillStyle = light ? '#8fd0e8' : '#6fb8d8'
    diamondPath(ctx, x, y, geo.halfW, geo.halfH)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'
    ctx.lineWidth = 1
    ctx.stroke()
  }
}

const drawHole = (ctx: CanvasRenderingContext2D, x: number, y: number): void => {
  // Dark pit with an inner falloff so it reads as bottomless.
  const grad = ctx.createRadialGradient(x, y, geo.halfH * 0.2, x, y, geo.halfW)
  grad.addColorStop(0, '#05070d')
  grad.addColorStop(0.7, '#0a1020')
  grad.addColorStop(1, '#13243f')
  diamondPath(ctx, x, y, geo.halfW, geo.halfH)
  ctx.fillStyle = grad
  ctx.fill()
  ctx.strokeStyle = 'rgba(0,0,0,0.6)'
  ctx.lineWidth = 2
  ctx.stroke()
}

/** Bitmap prop sitting on the diamond at (x, y): a contact shadow plus the
 *  sprite grounded so its base rests on the tile and it rises upward. */
const drawSpriteProp = (ctx: CanvasRenderingContext2D, src: string, x: number, y: number, scale = 1): void => {
  // Soft contact shadow first so the prop reads as standing on the tile.
  ctx.fillStyle = 'rgba(0,0,0,0.3)'
  ctx.beginPath(); ctx.ellipse(x, y + geo.halfH * 0.18, geo.halfW * 0.66, geo.halfH * 0.42, 0, 0, Math.PI * 2); ctx.fill()
  const img = getImg(src)
  if (!ready(img)) return
  // Keep the prop inside its own diamond footprint (it overflowed at ~tileW).
  const w = geo.tileW * 0.63 * scale
  const h = w * (img.naturalHeight / img.naturalWidth)
  // Anchor the sprite's bottom a touch in front of the diamond centre.
  ctx.drawImage(img, x - w / 2, y + geo.halfH * 0.42 - h, w, h)
}

/** Iso obstacle — all kinds are bitmap props now. `jitter` (per-cell, ~0.9–1.1)
 *  varies box/boulder size so the field doesn't look uniform. */
/** Source bitmap backing each obstacle kind (used by both the live renderer and
 *  the shatter snapshot). */
const obstacleSrc = (kind: ObstacleKind): string => {
  if (kind === 'stone') return BOULDER_SRC
  if (kind === 'pyramid') return SPIKE_SRC
  if (kind === 'libertyCat') return LIBERTY_CAT_SRC
  return BOX_SRC // box + wall both use the box art
}

const drawObstacle = (ctx: CanvasRenderingContext2D, kind: ObstacleKind, x: number, y: number, jitter = 1): void => {
  if (kind === 'box') { drawSpriteProp(ctx, BOX_SRC, x, y, 0.9 * jitter); return }
  if (kind === 'stone') { drawSpriteProp(ctx, BOULDER_SRC, x, y, jitter); return }
  // The old grey procedural block read poorly next to holes — use the box art.
  if (kind === 'wall') { drawSpriteProp(ctx, BOX_SRC, x, y, 1.035 * jitter); return }
  // Liberty Cat → its own upright sprite (late-game spiky-pole replacement).
  if (kind === 'libertyCat') { drawSpriteProp(ctx, LIBERTY_CAT_SRC, x, y, 1.0); return }
  // Pyramid → spiky-pole sprite (the bitmap is already upright; just scale to fit).
  drawSpriteProp(ctx, SPIKE_SRC, x, y, 1.0)
}

/** Small sparkle particles emitting from an item box — each fades in fast,
 *  grows from 80%→110%, then fades out shrinking ~10% near the end. Phases are
 *  derived deterministically from the box `seed` so they don't reset per frame. */
const drawItemSparkles = (ctx: CanvasRenderingContext2D, x: number, cy: number, base: number, now: number, seed: number): void => {
  const img = getImg(ITEM_SPARKLE_SRC)
  if (!ready(img)) return
  // The sparkle bitmap is a full overlay that frames the whole box, so draw ONE
  // copy centred on the box (matching its footprint) and pulse its opacity +
  // scale for a twinkle. The previous version scattered six tiny copies of the
  // entire overlay around the rim, which were too small/faint to read at all.
  const pulse = 0.6 + 0.4 * (0.5 + 0.5 * Math.sin(now / 240 + seed)) // 0.6 → 1.0
  const breathe = 1.06 + Math.sin(now / 300 + seed * 1.3) * 0.06     // size twinkle
  const w = base * 1.25 * breathe
  const h = w * (img.naturalHeight / img.naturalWidth)
  ctx.globalAlpha = pulse
  ctx.drawImage(img, x - w / 2, cy - h / 2, w, h)
  ctx.globalAlpha = 1
}

const drawItemBox = (ctx: CanvasRenderingContext2D, x: number, y: number, now: number, seed = 0): void => {
  const bob = Math.sin(now / 260 + seed) * geo.halfH * 0.2
  const cy = y - geo.tileH * 0.5 + bob
  const base = geo.tileW * 0.624 // 20% smaller so the sparkles read clearly
  const wobble = 0.975 + Math.sin(now / 320 + seed) * 0.025 // gentle 95%→100%→95% breathing

  // Glow halo.
  const glow = ctx.createRadialGradient(x, cy, 2, x, cy, base * 0.95)
  glow.addColorStop(0, 'rgba(255,255,255,0.5)')
  glow.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = glow
  ctx.beginPath(); ctx.arc(x, cy, base * 0.95, 0, Math.PI * 2); ctx.fill()

  // Box sprite (wobbling), with a procedural fallback before the bitmap decodes.
  const img = getImg(ITEM_BOX_SRC)
  if (ready(img)) {
    const w = base * wobble
    const h = w * (img.naturalHeight / img.naturalWidth)
    ctx.drawImage(img, x - w / 2, cy - h / 2, w, h)
  } else {
    const s = base * 0.5 * wobble
    const grad = ctx.createLinearGradient(x - s, cy - s, x + s, cy + s)
    grad.addColorStop(0, '#ff4d8d'); grad.addColorStop(0.5, '#ffd23f'); grad.addColorStop(1, '#3fa9ff')
    ctx.fillStyle = grad
    ctx.beginPath(); ctx.roundRect(x - s, cy - s, s * 2, s * 2, s * 0.3); ctx.fill()
  }

  // Magical sparkles emitting from the box.
  drawItemSparkles(ctx, x, cy, base, now, seed)
}

/** Spinning vortex drawn on top of a normal grid tile — squashed to the iso
 *  plane and rotated over time to read as a swirling teleport portal. `seed`
 *  (per-cell hash) randomises spin direction, speed and start angle so no two
 *  portals look in lock-step. */
const drawPortal = (ctx: CanvasRenderingContext2D, x: number, y: number, now: number, seed = 0): void => {
  const glow = ctx.createRadialGradient(x, y, 2, x, y, geo.halfW)
  glow.addColorStop(0, 'rgba(140,100,255,0.55)')
  glow.addColorStop(1, 'rgba(140,100,255,0)')
  ctx.fillStyle = glow
  diamondPath(ctx, x, y, geo.halfW, geo.halfH); ctx.fill()
  const img = getImg(VORTEX_SRC)
  if (!ready(img)) return
  const dir = (seed & 1) ? 1 : -1            // spin clockwise or counter
  const speed = 520 + (seed % 420)           // per-portal spin rate
  const phase = (seed % 628) / 100           // per-portal start angle (rad)
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(1, geo.tileH / geo.tileW) // lie flat on the ground plane
  ctx.rotate(dir * (now / speed) + phase)
  // Shrunk another 10% (~0.65) so the swirl art never clips the tile edge,
  // plus a breathing pulse between 95% and 100%.
  const pulse = 0.975 + Math.sin(now / 480 + seed) * 0.025
  const s = geo.tileW * 0.648 * pulse
  ctx.globalAlpha = 0.95
  ctx.drawImage(img, -s / 2, -s / 2, s, s)
  ctx.restore()
  ctx.globalAlpha = 1
}

/** Lava field tile — the bitmap rotated 45° + iso-squashed so the square art
 *  fills the diamond exactly like the floor tiles do, with a hot glow on top. */
const drawLava = (ctx: CanvasRenderingContext2D, x: number, y: number, now: number): void => {
  const img = getImg(LAVA_SRC)
  if (ready(img)) {
    ctx.save()
    ctx.translate(x, y)
    ctx.scale(1, geo.tileH / geo.tileW)
    ctx.rotate(Math.PI / 4) // align the square art to the iso diamond
    const side = (geo.tileW / Math.SQRT2) * 1.03 // slight overdraw kills seams
    ctx.drawImage(img, -side / 2, -side / 2, side, side)
    ctx.restore()
  } else {
    // Procedural fallback: a glowing orange diamond.
    diamondPath(ctx, x, y, geo.halfW, geo.halfH)
    ctx.fillStyle = '#d2461b'
    ctx.fill()
  }
  // Pulsing heat glow.
  const pulse = 0.35 + Math.sin(now / 260) * 0.12
  const glow = ctx.createRadialGradient(x, y, 2, x, y, geo.halfW)
  glow.addColorStop(0, `rgba(255,150,40,${pulse})`)
  glow.addColorStop(1, 'rgba(255,90,20,0)')
  ctx.fillStyle = glow
  diamondPath(ctx, x, y, geo.halfW, geo.halfH); ctx.fill()
}

const drawCoinSprite = (ctx: CanvasRenderingContext2D, x: number, y: number, size: number, alpha = 1): void => {
  const img = getImg(COIN_SRC)
  ctx.globalAlpha = alpha
  if (ready(img)) {
    ctx.drawImage(img, x - size / 2, y - size / 2, size, size)
  } else {
    ctx.fillStyle = '#ffd23f'
    ctx.beginPath(); ctx.arc(x, y, size / 2, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = '#b8860b'; ctx.lineWidth = 2; ctx.stroke()
  }
  ctx.globalAlpha = 1
}

/** Angel-wings sprite drawn BEHIND the ball to mark a banked Second Chance.
 *  Centred on the ball with a gentle flapping "breath" (vertical squash); draws
 *  nothing until the bitmap decodes. */
const drawAngelWings = (ctx: CanvasRenderingContext2D, x: number, cy: number, radius: number, now: number): void => {
  const img = getImg(WINGS_SRC)
  if (!ready(img)) return
  const w = radius * 3.4
  const h = w * (img.naturalHeight / img.naturalWidth)
  // Subtle flap: the wings squash/stretch vertically a touch over time.
  const flap = 1 + Math.sin(now / 240) * 0.08
  const fh = h * flap
  ctx.drawImage(img, x - w / 2, cy - fh * 0.5, w, fh)
}

const POWERUP_COLOR: Record<string, string> = {
  invuln: '#ffd23f', magnet: '#3fa9ff', dodge: '#37e0a0', slowmo: '#b06bff', push: '#ff7a3f'
}

// ─── 3D rolling-ball renderer ──────────────────────────────────────────────
//
// A single ball image is treated as an equirectangular SURFACE texture and
// sphere-mapped in real time. The trick that sells "real 3D object": the
// LIGHTING (highlight + terminator) is baked into screen space and stays fixed,
// while the TEXTURE scrolls around a horizontal axis as the ball travels — so
// it reads as a solid sphere rolling forward, with no per-skin spritesheets.
//
// Per-pixel sphere math (UV + Lambert + specular) is precomputed ONCE into a
// fixed-resolution LUT; each frame only adds a rolling phase to the longitude,
// samples the texture, and blits the small buffer scaled to the display size —
// so cost is constant regardless of how big the ball draws.
//
// IMPORTANT: the source should be a FLAT, BORDERLESS, roughly-seamless square
// texture (just the surface pattern). A painted-on rim/outline or baked
// highlight will smear across the face as it rolls — the rim + shine here are
// generated procedurally instead.
const BALL_LUT_RES = 96            // internal sphere buffer (px); blitted scaled
const BALL_ROLL_PER_TILE = 1.6     // radians of roll per row travelled
// How many times the texture wraps around the rolling longitude. 2 = a copy on
// the FRONT and a copy on the BACK of the sphere (so a motif faces you twice per
// revolution); 1 = a single image around the whole globe.
const BALL_TEX_REPEAT = 2

interface BallLut {
  res: number
  aBase: Float32Array  // longitude around the (horizontal) roll axis, rad
  vTex: Float32Array   // latitude → texture v (0..1)
  shade: Float32Array  // baked ambient+diffuse (0..1)
  spec: Float32Array   // baked specular white add (0..1)
  cover: Float32Array  // edge coverage / AA (0..1), 0 outside the disc
}

// One LUT per (res, roll-axis angle). The iso heading is only ever up-left or
// up-right, so this caches just a couple of entries for the life of the page.
const ballLutCache = new Map<string, BallLut>()

const getBallLut = (res: number, rollAngle: number): BallLut => {
  // Quantise the angle so tiny float drift doesn't spawn extra LUTs.
  const key = `${res}:${Math.round(rollAngle * 100)}`
  let lut = ballLutCache.get(key)
  if (!lut) { lut = buildBallLut(res, rollAngle); ballLutCache.set(key, lut) }
  return lut
}

/**
 * Build the sphere LUT for a given roll-axis tilt. `rollAngle` rotates the axis
 * the texture spins around so the surface scrolls along the travel direction;
 * 0 = scroll straight up (roll axis = screen X). The LIGHTING is computed from
 * the UN-rotated screen normal, so the highlight stays fixed in screen space
 * while only the texture mapping tilts.
 */
const buildBallLut = (res: number, rollAngle = 0): BallLut => {
  const n = res * res
  const aBase = new Float32Array(n)
  const vTex = new Float32Array(n)
  const shade = new Float32Array(n)
  const spec = new Float32Array(n)
  const cover = new Float32Array(n)
  // Fixed light: top-left, slightly toward the viewer.
  let Lx = -0.5, Ly = -0.62, Lz = 0.6
  const ll = Math.hypot(Lx, Ly, Lz); Lx /= ll; Ly /= ll; Lz /= ll
  const cosA = Math.cos(rollAngle), sinA = Math.sin(rollAngle)
  const R = res / 2
  for (let py = 0; py < res; py++) {
    for (let px = 0; px < res; px++) {
      const i = py * res + px
      const nx = (px + 0.5 - R) / R
      const ny = (py + 0.5 - R) / R
      const r2 = nx * nx + ny * ny
      if (r2 > 1) { cover[i] = 0; continue }
      const nz = Math.sqrt(1 - r2) // surface normal z (toward viewer)
      // Rotate the screen normal into the roll-axis frame for TEXTURE coords
      // only. The roll axis lies along (cosA, sinA); the perpendicular drives
      // the rolling longitude, the along-axis component is the latitude.
      const rx = nx * cosA + ny * sinA
      const ry = -nx * sinA + ny * cosA
      aBase[i] = Math.atan2(ry, nz)
      vTex[i] = 0.5 - Math.asin(rx < -1 ? -1 : rx > 1 ? 1 : rx) / Math.PI
      // Lighting uses the untouched screen normal → highlight stays put.
      const diff = Math.max(0, nx * Lx + ny * Ly + nz * Lz)
      shade[i] = 0.3 + 0.7 * diff
      spec[i] = Math.pow(diff, 24) * 0.95
      const edgePx = (1 - Math.sqrt(r2)) * R
      cover[i] = edgePx < 1.5 ? Math.max(0, edgePx / 1.5) : 1
    }
  }
  return { res, aBase, vTex, shade, spec, cover }
}

let ballTex: { w: number; h: number; data: Uint8ClampedArray } | null = null
// Active ball-skin texture path. Defaults to the historical eye skin; the scene
// pushes the player's equipped skin via `setBallSkin`, which invalidates the
// decoded buffer so the next frame re-samples from the new texture.
let ballSkinSrc = BALL_SKIN_SRC

/** Swap the rolling ball's surface texture. Invalidates the decoded buffer so
 *  the next `getBallTexture()` re-decodes from `src`. No-op if unchanged. */
export const setBallSkin = (src: string): void => {
  if (src === ballSkinSrc) return
  ballSkinSrc = src
  ballTex = null
}

/** Decode the active ball skin to a sampled pixel buffer (cached until the skin
 *  changes via `setBallSkin`). */
const getBallTexture = (): { w: number; h: number; data: Uint8ClampedArray } | null => {
  if (ballTex) return ballTex
  const img = getImg(ballSkinSrc)
  if (!ready(img)) return null
  const tw = 192, th = 192
  const cv = document.createElement('canvas'); cv.width = tw; cv.height = th
  const cx = cv.getContext('2d', { willReadFrequently: true })
  if (!cx) return null
  cx.drawImage(img, 0, 0, tw, th)
  try {
    ballTex = { w: tw, h: th, data: cx.getImageData(0, 0, tw, th).data }
  } catch { return null } // tainted canvas (won't happen for same-origin assets)
  return ballTex
}

let ballOutCanvas: HTMLCanvasElement | null = null
let ballOutCtx: CanvasRenderingContext2D | null = null
let ballOutImage: ImageData | null = null

/** Sphere-map + roll the skin into `ctx` at (cx, cy) with display `radius`.
 *  `phase` is the rolling longitude (rad); `rollAngle` tilts the roll axis so
 *  the surface scrolls along the travel direction. Returns false (drawing
 *  nothing) when the skin isn't decoded yet, so the caller can fall back to the
 *  procedural ball. Treats the sphere as solid (ignores source alpha) so a skin
 *  with transparent corners still renders a full ball. */
const drawRollingBall = (ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, phase: number, rollAngle = 0): boolean => {
  const tex = getBallTexture()
  if (!tex) return false
  const lut = getBallLut(BALL_LUT_RES, rollAngle)
  const res = BALL_LUT_RES
  if (!ballOutCanvas || !ballOutCtx || !ballOutImage) {
    ballOutCanvas = document.createElement('canvas')
    ballOutCanvas.width = res; ballOutCanvas.height = res
    ballOutCtx = ballOutCanvas.getContext('2d')
    if (!ballOutCtx) return false
    ballOutImage = ballOutCtx.createImageData(res, res)
  }
  const out = ballOutImage.data
  const { data: src, w: tw, h: th } = tex
  const inv2pi = 1 / (Math.PI * 2)
  const n = res * res
  for (let i = 0; i < n; i++) {
    const o = i * 4
    const cov = lut.cover[i]!
    if (cov <= 0) { out[o + 3] = 0; continue }
    let u = (lut.aBase[i]! + phase) * inv2pi * BALL_TEX_REPEAT
    u -= Math.floor(u) // wrap (repeated) longitude 0..1
    let sx = (u * tw) | 0; if (sx >= tw) sx = tw - 1
    let sy = (lut.vTex[i]! * th) | 0; if (sy >= th) sy = th - 1
    const s = (sy * tw + sx) * 4
    const sh = lut.shade[i]!
    const sp = lut.spec[i]! * 255
    out[o] = Math.min(255, src[s]! * sh + sp)
    out[o + 1] = Math.min(255, src[s + 1]! * sh + sp)
    out[o + 2] = Math.min(255, src[s + 2]! * sh + sp)
    out[o + 3] = (cov * 255) | 0
  }
  ballOutCtx.putImageData(ballOutImage, 0, 0)
  ctx.imageSmoothingEnabled = true
  ctx.drawImage(ballOutCanvas, cx - radius, cy - radius, radius * 2, radius * 2)
  // Subtle dark rim to seat the silhouette against the floor.
  ctx.strokeStyle = 'rgba(0,0,0,0.28)'
  ctx.lineWidth = Math.max(1, radius * 0.06)
  ctx.beginPath(); ctx.arc(cx, cy, radius - ctx.lineWidth * 0.4, 0, Math.PI * 2); ctx.stroke()
  return true
}

const drawBall = (ctx: CanvasRenderingContext2D, x: number, y: number, now: number, dropT = 0): void => {
  const baseRadius = geo.halfH * 1.05
  // While dropping the ball sinks below the surface, shrinks, and fades out as
  // it disappears into the pit. The hole's front lip (drawn afterwards) hides
  // its lower half so it reads as falling in rather than floating across.
  const radius = baseRadius * (1 - 0.6 * dropT)
  const cy = y - baseRadius * 0.75 + dropT * baseRadius * 1.9
  let alpha = dropT < 0.7 ? 1 : Math.max(0, 1 - (dropT - 0.7) / 0.3)
  // After spending a Second Chance the ball blinks for a beat.
  if (game.secondChanceBlinkUntil > game.clock) {
    alpha *= 0.35 + 0.65 * Math.abs(Math.sin(now / 70))
  }
  const pType = activePowerup.value?.type ?? null
  const invuln = pType === 'invuln'

  // The power-up aura belongs to the rolling ball, not the falling one. (The
  // green motion-trail ghosts were removed — they clashed with applied skins.)
  if (dropT === 0) {
    // Power-up aura ring.
    if (pType) {
      const aura = POWERUP_COLOR[pType] ?? '#ffffff'
      const pulse = 1 + Math.sin(now / 120) * 0.12
      const ag = ctx.createRadialGradient(x, cy, radius * 0.6, x, cy, radius * 2 * pulse)
      ag.addColorStop(0, aura + 'cc')
      ag.addColorStop(1, aura + '00')
      ctx.fillStyle = ag
      ctx.beginPath(); ctx.arc(x, cy, radius * 2 * pulse, 0, Math.PI * 2); ctx.fill()
    }

  }

  ctx.save()
  ctx.globalAlpha = alpha

  // Soft contact shadow on the tile — fades away as the ball leaves the surface.
  ctx.fillStyle = `rgba(0,0,0,${0.28 * (1 - dropT)})`
  ctx.beginPath(); ctx.ellipse(x, y + geo.halfH * 0.15, radius * 0.8, radius * 0.4, 0, 0, Math.PI * 2); ctx.fill()

  // Ball body — 3D sphere-mapped rolling skin; the roll phase advances with how
  // far up the field the ball has travelled. Falls back to a procedural gradient
  // sphere until the skin texture is decoded.
  const rollPhase = -game.ballR * BALL_ROLL_PER_TILE
  // Tilt the roll axis so the surface scrolls along the screen-space travel
  // direction (up-left for dir −1, up-right for dir +1) instead of always north.
  // The heading projects to a screen delta of (dir·halfW, −halfH).
  const rollAngle = Math.atan2(game.dir * geo.halfW, geo.halfH)
  const rolled = drawRollingBall(ctx, x, cy, radius, rollPhase, rollAngle)
  if (!rolled) {
    const baseHi = invuln ? '#fff6b0' : '#aef5b8'
    const baseLo = invuln ? '#ffb300' : '#21a84a'
    const g = ctx.createRadialGradient(x - radius * 0.35, cy - radius * 0.4, radius * 0.15, x, cy, radius)
    g.addColorStop(0, baseHi)
    g.addColorStop(1, baseLo)
    ctx.fillStyle = g
    ctx.beginPath(); ctx.arc(x, cy, radius, 0, Math.PI * 2); ctx.fill()
    ctx.lineWidth = 2
    ctx.strokeStyle = invuln ? '#fff7cf' : '#0d6b2c'
    ctx.stroke()
    // Top shine.
    ctx.fillStyle = 'rgba(255,255,255,0.55)'
    ctx.beginPath(); ctx.ellipse(x - radius * 0.32, cy - radius * 0.4, radius * 0.28, radius * 0.16, -0.5, 0, Math.PI * 2); ctx.fill()
  }
  // Invuln tint over the rolled skin so the power-up still reads.
  if (rolled && invuln) {
    ctx.save()
    ctx.globalCompositeOperation = 'source-atop'
    ctx.globalAlpha = 0.35
    ctx.fillStyle = '#ffd23f'
    ctx.beginPath(); ctx.arc(x, cy, radius, 0, Math.PI * 2); ctx.fill()
    ctx.restore()
  }

  // Second Chance held: angel wings drawn IN FRONT of the ball so a spare life
  // is clearly visible. (Kept off the drop animation so they don't fall too.)
  if (game.secondChance && dropT === 0) drawAngelWings(ctx, x, cy, radius, now)

  // Invulnerable star sparkles.
  if (invuln && dropT === 0) {
    for (let i = 0; i < 3; i++) {
      const a = now / 200 + (i * Math.PI * 2) / 3
      const sx = x + Math.cos(a) * radius * 1.5
      const sy = cy + Math.sin(a) * radius * 1.5
      drawStar(ctx, sx, sy, radius * 0.22, '#fff7cf')
    }
  }

  ctx.restore()
}

const drawStar = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void => {
  ctx.save(); ctx.translate(x, y); ctx.fillStyle = color; ctx.beginPath()
  for (let i = 0; i < 5; i++) {
    const a = (i * 2 * Math.PI) / 5 - Math.PI / 2
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r)
    const a2 = a + Math.PI / 5
    ctx.lineTo(Math.cos(a2) * r * 0.45, Math.sin(a2) * r * 0.45)
  }
  ctx.closePath(); ctx.fill(); ctx.restore()
}

// ─── FX rendering ───────────────────────────────────────────────────────────

const drawFx = (ctx: CanvasRenderingContext2D, fx: FxEvent, camOffsetY: number, ballX: number, ballY: number, now: number): void => {
  const life = (game.clock - fx.bornAt)
  const { x, y } = project(fx.c, fx.r, camOffsetY)
  switch (fx.kind) {
    case 'coin': {
      // Coin shrinks + flies into the ball.
      const t = Math.min(1, life / 420)
      const cx = x + (ballX - x) * (t * t)
      const cy = (y - geo.tileH * 0.4) + (ballY - (y - geo.tileH * 0.4)) * (t * t)
      drawCoinSprite(ctx, cx, cy, geo.halfW * 0.7 * (1 - t * 0.7), 1 - t)
      break
    }
    case 'pop': {
      const t = Math.min(1, life / 600)
      const n = 9
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2
        const d = t * geo.tileW * 1.1
        ctx.globalAlpha = 1 - t
        ctx.fillStyle = fx.color ?? '#ff5a3c'
        ctx.beginPath(); ctx.arc(x + Math.cos(a) * d, (y - geo.tileH * 0.5) + Math.sin(a) * d * 0.6, geo.halfH * 0.3 * (1 - t), 0, Math.PI * 2); ctx.fill()
      }
      ctx.globalAlpha = 1
      break
    }
    case 'push': {
      const t = Math.min(1, life / 500)
      ctx.save(); ctx.globalAlpha = 1 - t
      ctx.translate(x + game.dir * geo.tileW * t, y - geo.tileH * 0.5 - t * geo.tileH)
      ctx.rotate(t * 4 * game.dir)
      ctx.fillStyle = fx.color ?? '#ff7a3f'
      const s = geo.halfW * 0.5
      ctx.fillRect(-s, -s, s * 2, s * 2)
      ctx.restore(); ctx.globalAlpha = 1
      break
    }
    case 'item':
    case 'sparkle': {
      const t = Math.min(1, life / 500)
      ctx.globalAlpha = 1 - t
      const n = fx.kind === 'item' ? 8 : 4
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + now / 300
        const d = t * geo.tileW
        drawStar(ctx, x + Math.cos(a) * d, (y - geo.tileH * 0.5) + Math.sin(a) * d * 0.6, geo.halfH * 0.3 * (1 - t), fx.color ?? '#ffffff')
      }
      ctx.globalAlpha = 1
      break
    }
    case 'explode': {
      // High-fidelity ball blow-up: white-hot core, fireball, gravity-driven
      // debris, spark streaks, staggered shockwaves and lingering smoke.
      const ex = x
      const ey = y - geo.tileH * 0.5
      const TW = geo.tileW
      const dur = 620
      const t = Math.min(1, life / dur)
      const seed = fx.bornAt
      const rnd = (i: number): number => {
        const v = Math.sin(seed * 0.013 + i * 12.9898) * 43758.5453
        return v - Math.floor(v)
      }

      // 1) White-hot core flash (very fast).
      const ft = Math.min(1, life / 140)
      if (ft < 1) {
        ctx.globalAlpha = 1 - ft
        const cr = TW * (0.3 + ft * 0.6)
        const cg = ctx.createRadialGradient(ex, ey, 0, ex, ey, cr)
        cg.addColorStop(0, '#ffffff')
        cg.addColorStop(0.5, '#fff1c2')
        cg.addColorStop(1, 'rgba(255,200,120,0)')
        ctx.fillStyle = cg
        ctx.beginPath(); ctx.arc(ex, ey, cr, 0, Math.PI * 2); ctx.fill()
      }

      // 2) Fireball body.
      ctx.globalAlpha = (1 - t) * 0.9
      const fr = TW * (0.25 + t * 0.85)
      const fb = ctx.createRadialGradient(ex, ey, fr * 0.1, ex, ey, fr)
      fb.addColorStop(0, '#fff1a0')
      fb.addColorStop(0.45, fx.color ?? '#ff7a1f')
      fb.addColorStop(0.8, '#d12c1a')
      fb.addColorStop(1, 'rgba(120,20,10,0)')
      ctx.fillStyle = fb
      ctx.beginPath(); ctx.arc(ex, ey, fr, 0, Math.PI * 2); ctx.fill()

      // 3) Gravity-driven debris shards.
      const N = 20
      for (let i = 0; i < N; i++) {
        const a = rnd(i) * Math.PI * 2
        const sp = 0.7 + rnd(i + 99) * 0.9
        const d = t * TW * 1.6 * sp
        const px = ex + Math.cos(a) * d
        const py = ey + Math.sin(a) * d * 0.62 + t * t * TW * 0.55 // gravity arc
        const sz = geo.halfH * 0.38 * (1 - t) * (0.5 + rnd(i + 7))
        ctx.globalAlpha = 1 - t
        ctx.fillStyle = i % 3 === 0 ? '#ffffff' : i % 3 === 1 ? '#ffd23f' : (fx.color ?? '#ff6a2a')
        ctx.save(); ctx.translate(px, py); ctx.rotate(a + t * 6 * sp)
        ctx.fillRect(-sz / 2, -sz / 2, sz, sz)
        ctx.restore()
      }

      // 4) Spark streaks.
      ctx.globalAlpha = 1 - Math.min(1, life / 360)
      ctx.strokeStyle = '#fff3b0'
      ctx.lineWidth = 2
      for (let i = 0; i < 8; i++) {
        const a = rnd(i + 33) * Math.PI * 2
        const d0 = t * TW * 0.5
        const d1 = t * TW * 1.25
        ctx.beginPath()
        ctx.moveTo(ex + Math.cos(a) * d0, ey + Math.sin(a) * d0 * 0.62)
        ctx.lineTo(ex + Math.cos(a) * d1, ey + Math.sin(a) * d1 * 0.62)
        ctx.stroke()
      }

      // 5) Staggered shockwave rings.
      for (let k = 0; k < 3; k++) {
        const rt = Math.min(1, (life - k * 70) / (dur * 0.7))
        if (rt <= 0 || rt >= 1) continue
        ctx.globalAlpha = (1 - rt) * 0.7
        ctx.strokeStyle = k === 0 ? '#ffffff' : '#ffb066'
        ctx.lineWidth = 3 * (1 - rt)
        ctx.beginPath(); ctx.ellipse(ex, ey, TW * 0.6 * rt + 6, TW * 0.6 * rt * 0.62 + 4, 0, 0, Math.PI * 2); ctx.stroke()
      }

      // 6) Lingering smoke puffs that rise + fade.
      const st = Math.min(1, life / 850)
      for (let i = 0; i < 5; i++) {
        const a = rnd(i + 200) * Math.PI * 2
        const d = st * TW * 0.5 * (0.4 + rnd(i + 5))
        const sx = ex + Math.cos(a) * d
        const sy = ey + Math.sin(a) * d * 0.5 - st * TW * 0.3
        const sr = TW * 0.16 * (0.6 + st)
        ctx.globalAlpha = (1 - st) * 0.32
        ctx.fillStyle = '#5a5550'
        ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2); ctx.fill()
      }

      ctx.globalAlpha = 1
      break
    }
    case 'portal': {
      const t = Math.min(1, life / 500)
      const py = y - geo.tileH * 0.25
      ctx.globalAlpha = 1 - t
      ctx.strokeStyle = fx.color ?? '#9a6bff'
      ctx.lineWidth = 3
      for (let k = 0; k < 3; k++) {
        const rr = t * geo.tileW * 0.7 + k * 6
        ctx.beginPath(); ctx.ellipse(x, py, rr, rr * 0.6, 0, 0, Math.PI * 2); ctx.stroke()
      }
      ctx.globalAlpha = 1
      break
    }
    case 'shatter': {
      // Tear the destroyed OBSTACLE sprite into flying pie-wedge shards — the
      // same per-sprite death language as the ball's death shatter. Fired when an
      // obstacle is broken by invuln or shoved by the push power-up. Lava is never
      // destructible, so it never reaches this path.
      drawObstacleShards(ctx, fx, x, y - geo.tileH * 0.5, now)
      break
    }
  }
}

// ─── Obstacle shatter (tears a destroyed obstacle sprite into flying wedges) ──
//
// Snapshots the obstacle bitmap into an offscreen canvas keyed by kind, then
// slices it into pie wedges that fly outward, spin, fall and fade — reusing the
// ball-shatter idea so a smashed box/stone/etc. visibly breaks apart.
const OBSTACLE_SHARD_COUNT = 9
const OBSTACLE_SHATTER_MS = 620
const obstacleSnapshots = new Map<string, HTMLCanvasElement>()

const obstacleSnapshot = (kind: ObstacleKind, size: number): HTMLCanvasElement | null => {
  // Key by size too so a resize (new tile width) re-renders at the right scale.
  const key = `${kind}:${size}`
  const cached = obstacleSnapshots.get(key)
  if (cached) return cached
  const cv = document.createElement('canvas')
  cv.width = size; cv.height = size
  const cx = cv.getContext('2d')
  if (!cx) return null
  // Reuse the live obstacle renderer. `drawObstacle` paints the sprite around a
  // point `geo.tileH * 0.5` ABOVE the passed (x, y) tile-centre, so offset the
  // draw origin down by that much to land the sprite at the canvas centre. If
  // the bitmap isn't decoded yet we skip caching so a later call can retry.
  if (!ready(getImg(obstacleSrc(kind)))) return null
  drawObstacle(cx, kind, size / 2, size / 2 + geo.tileH * 0.5)
  obstacleSnapshots.set(key, cv)
  return cv
}

const drawObstacleShards = (ctx: CanvasRenderingContext2D, fx: FxEvent, x: number, y: number, now: number): void => {
  const kind = fx.obstacle
  if (!kind) return
  const t = Math.min(1, (game.clock - fx.bornAt) / OBSTACLE_SHATTER_MS)
  if (t >= 1) return
  const size = Math.ceil(geo.tileW) + 6
  const snap = obstacleSnapshot(kind, size)
  if (!snap) return
  const half = size / 2
  const radius = half
  const ease = 1 - (1 - t) * (1 - t)
  // Deterministic per-shard scatter from the fx birth time so it's stable.
  const seed = fx.bornAt
  const rnd = (i: number): number => {
    const v = Math.sin(seed * 0.017 + i * 12.9898) * 43758.5453
    return v - Math.floor(v)
  }
  const N = OBSTACLE_SHARD_COUNT
  for (let i = 0; i < N; i++) {
    const a0 = (i / N) * Math.PI * 2
    const a1 = ((i + 1) / N) * Math.PI * 2
    const mid = (a0 + a1) / 2
    const fly = mid + (rnd(i) - 0.5) * 0.5
    const dist = radius * (1.6 + rnd(i + 9) * 2.2) * ease
    const px = x + Math.cos(fly) * dist
    const py = y + Math.sin(fly) * dist * 0.72 + t * t * radius * 1.6 // gravity
    const scale = 1 - 0.5 * t
    ctx.save()
    ctx.globalAlpha = Math.max(0, 1 - t)
    ctx.translate(px, py)
    ctx.rotate((rnd(i + 3) - 0.5) * 0.6 + (rnd(i + 5) - 0.5) * 6 * t)
    ctx.scale(scale, scale)
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.arc(0, 0, radius + 1, a0, a1)
    ctx.closePath()
    ctx.clip()
    ctx.drawImage(snap, -half, -half)
    ctx.restore()
  }
}

// ─── Death shatter (tears the ball image into flying wedges) ────────────────
//
// When the ball blows up on an obstacle/lava we snapshot its CURRENT appearance
// (whatever skin, roll phase + lighting) into an offscreen canvas, then draw it
// as N pie-wedge shards that fly outward, spin, shrink, and fade — a per-skin
// death animation with zero spritesheets. Works for any future ball skin.
const BALL_SHARD_COUNT = 11
const BALL_SHATTER_MS = 950

interface BallShard { a0: number; a1: number; fly: number; dist: number; rot: number; spin: number }
interface BallShatter {
  canvas: HTMLCanvasElement
  size: number
  x: number
  y: number
  radius: number
  bornAt: number
  shards: BallShard[]
}
let ballShatter: BallShatter | null = null
let prevExploded = false

/** Render just the ball body (current skin + roll) centred into an offscreen
 *  canvas, so it can be sliced into shards. */
const renderBallSnapshot = (radius: number): HTMLCanvasElement | null => {
  const size = Math.ceil(radius * 2) + 6
  const cv = document.createElement('canvas')
  cv.width = size; cv.height = size
  const cx = cv.getContext('2d')
  if (!cx) return null
  const c = size / 2
  const rollPhase = -game.ballR * BALL_ROLL_PER_TILE
  const rollAngle = Math.atan2(game.dir * geo.halfW, geo.halfH)
  if (!drawRollingBall(cx, c, c, radius, rollPhase, rollAngle)) {
    // Procedural fallback sphere (skin not decoded yet).
    const g = cx.createRadialGradient(c - radius * 0.35, c - radius * 0.4, radius * 0.15, c, c, radius)
    g.addColorStop(0, '#aef5b8'); g.addColorStop(1, '#21a84a')
    cx.fillStyle = g
    cx.beginPath(); cx.arc(c, c, radius, 0, Math.PI * 2); cx.fill()
  }
  return cv
}

const spawnBallShatter = (x: number, y: number, radius: number, now: number): void => {
  const cv = renderBallSnapshot(radius)
  if (!cv) return
  const shards: BallShard[] = []
  const N = BALL_SHARD_COUNT
  for (let i = 0; i < N; i++) {
    const a0 = (i / N) * Math.PI * 2
    const a1 = ((i + 1) / N) * Math.PI * 2
    const mid = (a0 + a1) / 2
    shards.push({
      a0, a1,
      fly: mid + (Math.random() - 0.5) * 0.5,          // outward, slight jitter
      dist: radius * (2.2 + Math.random() * 2.6),
      rot: (Math.random() - 0.5) * 0.6,
      spin: (Math.random() - 0.5) * 6
    })
  }
  ballShatter = { canvas: cv, size: cv.width, x, y, radius, bornAt: now, shards }
}

/** Draw the active shatter shards for this frame; clears itself when expired. */
const drawBallShatter = (ctx: CanvasRenderingContext2D, now: number): void => {
  if (!ballShatter) return
  const t = (now - ballShatter.bornAt) / BALL_SHATTER_MS
  if (t >= 1) { ballShatter = null; return }
  const ease = 1 - (1 - t) * (1 - t) // easeOut for the outward spread
  const { canvas, size, x, y, radius, shards } = ballShatter
  const half = size / 2
  for (const s of shards) {
    const dist = s.dist * ease
    const px = x + Math.cos(s.fly) * dist
    const py = y + Math.sin(s.fly) * dist * 0.72 + t * t * radius * 1.6 // gravity pull-down
    const scale = 1 - 0.55 * t                                          // shrink
    ctx.save()
    ctx.globalAlpha = Math.max(0, 1 - t)                                // fade
    ctx.translate(px, py)
    ctx.rotate(s.rot + s.spin * t)
    ctx.scale(scale, scale)
    // Clip to this shard's pie wedge of the original ball disc.
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.arc(0, 0, radius + 1, s.a0, s.a1)
    ctx.closePath()
    ctx.clip()
    ctx.drawImage(canvas, -half, -half)
    ctx.restore()
  }
}

// ─── Main draw ──────────────────────────────────────────────────────────────

interface Drawable { r: number; fn: () => void }

/** Render one frame. `w`/`h` are CSS pixels; the scene scales the context by
 *  dpr before calling so all geometry stays in CSS-pixel space. */
export const drawScene = (ctx: CanvasRenderingContext2D, w: number, h: number, now: number): void => {
  ctx.clearRect(0, 0, w, h)

  const camOffsetY = h * 0.64 - game.ballR * geo.halfH
  const ballPos = project(game.ballC, game.ballR, camOffsetY)
  const ballY = ballPos.y - geo.halfH * 1.05 * 0.75

  const rTop = Math.floor((-geo.tileH - camOffsetY) / geo.halfH) - 1
  const rBottom = Math.ceil((h + geo.tileH - camOffsetY) / geo.halfH) + 1

  // Pass 1 — floor + holes (back to front).
  for (let r = rTop; r <= rBottom; r++) {
    for (let c = 0; c <= C_MAX; c++) {
      if (((c + r) & 1) !== 0) continue
      const { x, y } = project(c, r, camOffsetY)
      const cell = game.cells.get(`${c},${r}`)
      if (cell && cell.kind === 'hole') drawHole(ctx, x, y)
      else if (cell && cell.kind === 'lava') drawLava(ctx, x, y, now)
      else if (cell && cell.kind === 'portal') { drawFloorTile(ctx, c, r, x, y); drawPortal(ctx, x, y, now, hash(c, r)) }
      else drawFloorTile(ctx, c, r, x, y)
    }
  }

  // Pass 2 — depth-sorted props + the ball + fx.
  const drawables: Drawable[] = []
  for (let r = rTop; r <= rBottom; r++) {
    for (let c = 0; c <= C_MAX; c++) {
      if (((c + r) & 1) !== 0) continue
      const cell = game.cells.get(`${c},${r}`)
      if (!cell) continue
      const { x, y } = project(c, r, camOffsetY)
      if (cell.kind === 'obstacle' && cell.obstacle) {
        const k = cell.obstacle
        const jitter = 1 + ((hash(c, r) % 21) - 10) / 100 // ±10% per-cell size variance
        drawables.push({ r, fn: () => drawObstacle(ctx, k, x, y, jitter) })
      } else if (cell.kind === 'coin' && !cell.collected) {
        drawables.push({ r: r + 0.1, fn: () => drawCoinSprite(ctx, x, y - geo.tileH * 0.4 + Math.sin(now / 240 + c) * geo.halfH * 0.15, geo.halfW * 0.7) })
      } else if (cell.kind === 'item') {
        const seed = (hash(c, r) % 997) / 159
        drawables.push({ r: r + 0.1, fn: () => drawItemBox(ctx, x, y, now, seed) })
      }
    }
  }
  const dropT = game.dropping ? Math.min(1, game.dropClock / DROP_MS) : 0

  // The frame the ball blows up on an obstacle/lava: snapshot it and spawn the
  // tear-apart shards (matches the ball geometry used in `drawBall`).
  const deathRadius = geo.halfH * 1.05
  const deathCy = ballPos.y - deathRadius * 0.75
  if (game.exploded && !prevExploded) spawnBallShatter(ballPos.x, deathCy, deathRadius, now)
  prevExploded = game.exploded

  // Renders the player ball, with the pit-clip applied while it's dropping.
  const paintBall = (): void => {
    if (!game.dropping) { drawBall(ctx, ballPos.x, ballPos.y, now, dropT); return }
    // Falling into a hole: clip the ball to the pit opening plus everything
    // ABOVE it. The whole dark pit was filled in the floor pass, so the ball
    // shows in front of it (overlapping the back rim); the part that sinks
    // below the near (front) rim is clipped away, revealing the ground in
    // front of the hole — a perspective-correct "drop into the void".
    const hx = ballPos.x
    const hy = ballPos.y
    ctx.save()
    ctx.beginPath()
    ctx.moveTo(hx - geo.halfW, hy - geo.tileH * 3) // far above, left edge
    ctx.lineTo(hx + geo.halfW, hy - geo.tileH * 3) // far above, right edge
    ctx.lineTo(hx + geo.halfW, hy)                 // right rim vertex
    ctx.lineTo(hx, hy + geo.halfH)                 // front (near) rim vertex
    ctx.lineTo(hx - geo.halfW, hy)                 // left rim vertex
    ctx.closePath()
    ctx.clip()
    drawBall(ctx, ballPos.x, ballPos.y, now, dropT)
    ctx.restore()
  }

  // Post-teleport orientation slow-mo: dim the whole grid (~70%) EXCEPT a hole
  // punched around the ball, so the player instantly sees where they landed.
  const slowLeft = game.teleportSlowUntil - game.clock
  const inTeleportSlow = !game.exploded && slowLeft > 0

  const ballIsDrawable = !game.exploded
  // During slow-mo the ball is drawn AFTER the overlay (on top of the dim) so it
  // stays bright; otherwise it sorts into the depth list as usual.
  if (ballIsDrawable && !inTeleportSlow) {
    drawables.push({ r: game.ballR, fn: paintBall })
  }
  drawables.sort((a, b) => a.r - b.r)
  for (const d of drawables) d.fn()

  if (inTeleportSlow) {
    drawTeleportSpotlight(ctx, w, h, ballPos.x, ballPos.y - geo.halfH * 1.05 * 0.75)
    if (ballIsDrawable) paintBall()
    drawTeleportBlinks(ctx, ballPos.x, ballPos.y - geo.halfH * 1.05 * 0.75, now, slowLeft)
  }

  // Tear-apart shards of the destroyed ball (under the explosion FX).
  drawBallShatter(ctx, now)

  // Pass 3 — FX on top.
  for (const fx of game.fx) drawFx(ctx, fx, camOffsetY, ballPos.x, ballY, now)
}

/** Dim the whole viewport ~70% with a soft transparent hole cut around the
 *  ball, so the player ball pops while everything else recedes. */
const drawTeleportSpotlight = (ctx: CanvasRenderingContext2D, w: number, h: number, bx: number, by: number): void => {
  ctx.save()
  const hole = geo.tileW * 1.1
  // A radial gradient clamps to its end colour beyond the outer radius, so this
  // one fill dims the WHOLE screen to ~70% grey while staying clear over the
  // ball — no second fill needed (that would double-darken).
  const grad = ctx.createRadialGradient(bx, by, hole * 0.3, bx, by, hole)
  grad.addColorStop(0, 'rgba(40,44,52,0)')      // clear over the ball
  grad.addColorStop(1, 'rgba(40,44,52,0.7)')    // ~70% grey elsewhere
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, w, h)
  ctx.restore()
}

/** Three bright-yellow rings that blink outward around the ball during the
 *  post-teleport slow-mo, pointing the eye straight at the player. */
const drawTeleportBlinks = (ctx: CanvasRenderingContext2D, bx: number, by: number, now: number, slowLeft: number): void => {
  ctx.save()
  const fade = Math.min(1, slowLeft / 500) // ease the whole effect out in the last 0.5s
  for (let i = 0; i < 3; i++) {
    // Each ring blinks on a staggered ~360ms cycle.
    const phase = ((now + i * 120) % 360) / 360
    const r = geo.tileW * (0.45 + phase * 0.85)
    const alpha = (1 - phase) * fade
    ctx.globalAlpha = alpha
    ctx.strokeStyle = '#ffe23f'
    ctx.lineWidth = 4 * (1 - phase) + 1
    ctx.beginPath()
    ctx.ellipse(bx, by, r, r * 0.62, 0, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.globalAlpha = 1
  ctx.restore()
}
