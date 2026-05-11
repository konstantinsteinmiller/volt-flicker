import type { MawIsland, Obstacle, StageBiome } from '@/use/useMawCampaign'
import { getShapeData, islandPolygonWorld } from '@/use/useIslandShapes'
import { getCachedImage } from '@/use/useAssets'

/**
 * Programmatic canvas art helpers — drawn in pure 2D so the project ships
 * without any sprite sheets. Each function paints one piece of the world
 * at world-space coordinates; the caller is responsible for transforming
 * the camera. See `art-todo-gamedesign.md` for the inventory of pieces queued up
 * for art replacement.
 */

const TWO_PI = Math.PI * 2

// Rounded-rect helper since Canvas2D's roundRect is still missing in some
// older WebKit builds we need to support.
const rrect = (
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number
) => {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.lineTo(x + w - rr, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr)
  ctx.lineTo(x + w, y + h - rr)
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h)
  ctx.lineTo(x + rr, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr)
  ctx.lineTo(x, y + rr)
  ctx.quadraticCurveTo(x, y, x + rr, y)
  ctx.closePath()
}

// ─── Water — CSS-backed wrapper, not painted on the canvas ─────────────
// The water tile is set as a `background-image: repeat` on the canvas
// wrapper divs in MawScene and LevelEditor. The browser tiles the
// bitmap at the layer level — GPU-composited, no seams from canvas
// bilinear edge-AA, and the canvas paint loop has zero per-frame water
// cost. The canvas itself stays transparent on top of it (each frame
// starts with `clearRect`), so islands / robot / coins composite over
// the tiled water that's already painted by the browser.

// ─── Island ──────────────────────────────────────────────────────────────
const biomeColors = (biome: StageBiome): { soil: string; grassDark: string; grassLight: string; ring: string } => {
  switch (biome) {
    case 'wheat':
      return { soil: '#a5722d', grassDark: '#d6b443', grassLight: '#f0d870', ring: '#7a4f1a' }
    case 'flower':
      return { soil: '#7d4524', grassDark: '#62b357', grassLight: '#94d68a', ring: '#4a2a14' }
    case 'rocky':
      return { soil: '#6b6258', grassDark: '#7d8f4a', grassLight: '#a4b86a', ring: '#3e3a32' }
    case 'boss':
      return { soil: '#4a1818', grassDark: '#3a6b2a', grassLight: '#6cab4f', ring: '#2c0a0a' }
    case 'forest':
    default:
      return { soil: '#7d4524', grassDark: '#3f8f2c', grassLight: '#5cd16d', ring: '#3a2010' }
  }
}

// Island art is sourced from per-shape bitmaps; the renderer overlays the
// bitmap so its grass cap aligns with the shape's playable polygon (see
// `useIslandShapes.ts`). For the brief moment before the bitmap decodes,
// we paint the fallback polygon in the biome's grass colour so the player
// isn't staring at empty water under their robot.
const ISLAND_IMG_SRC: Record<'round' | 'square', string> = {
  round: '/images/props/island-round-short-cliff_512x512.webp',
  square: '/images/props/island-square_512x512.webp'
}

const islandImages: Record<'round' | 'square', HTMLImageElement | null> = {
  round: null,
  square: null
}
const getIslandImage = (shape: 'round' | 'square'): HTMLImageElement => {
  if (!islandImages[shape]) islandImages[shape] = getCachedImage(ISLAND_IMG_SRC[shape])
  return islandImages[shape]!
}

export const drawIsland = (ctx: CanvasRenderingContext2D, isle: MawIsland & { biome?: StageBiome }) => {
  const shape = getShapeData(isle.shape)
  const imgW = isle.radius * shape.wPerRadius
  const imgH = isle.radius * shape.hPerRadius
  const img = getIslandImage(isle.shape)
  if (img.complete && img.naturalWidth > 0) {
    ctx.drawImage(
      img,
      isle.cx - imgW * shape.cxNorm,
      isle.cy - imgH * shape.cyNorm,
      imgW,
      imgH
    )
    return
  }
  // Pre-decode fallback — paint the polygon in the biome's grass colour
  // so the cleared counter doesn't appear to float over open water.
  const colors = biomeColors(((isle as any).biome) ?? 'forest')
  ctx.fillStyle = colors.grassDark
  ctx.beginPath()
  const poly = islandPolygonWorld(isle.shape, isle.cx, isle.cy, isle.radius)
  for (let i = 0; i < poly.length; i++) {
    const [wx, wy] = poly[i]!
    if (i === 0) ctx.moveTo(wx, wy)
    else ctx.lineTo(wx, wy)
  }
  ctx.closePath()
  ctx.fill()
}

/** Debug overlay: dashed yellow outline of each island's playable area.
 *  Both shapes trace the polygon extracted from their bitmap (or the
 *  fallback polygon until the bitmap decodes) — once the mask is
 *  available, the outline follows the scalloped grass-edge exactly, so
 *  what the player sees as green is exactly what they can anchor on.
 *  Gated by `isDebug` in MawScene. */
export const drawIslandPlatformBounds = (
  ctx: CanvasRenderingContext2D,
  isle: MawIsland
) => {
  ctx.save()
  ctx.strokeStyle = '#ffe066'
  ctx.lineWidth = 2
  ctx.setLineDash([8, 6])
  ctx.beginPath()
  const poly = islandPolygonWorld(isle.shape, isle.cx, isle.cy, isle.radius)
  for (let i = 0; i < poly.length; i++) {
    const [wx, wy] = poly[i]!
    if (i === 0) ctx.moveTo(wx, wy)
    else ctx.lineTo(wx, wy)
  }
  ctx.closePath()
  ctx.stroke()
  ctx.restore()
}

// ─── Grass blade — atlased ───────────────────────────────────────────────
//
// Each blade in a stage used to construct 1-7 paths and 1-7 fill/stroke
// calls per frame, on top of a `Math.sin` evaluation. A populated stage
// has hundreds of blades, so the cost ran into thousands of draw calls
// per frame — enough to drop the game into the 24-fps zone whenever the
// camera entered a dense field.
//
// Optimisation: pre-render 4 variants × 8 sway frames per biome into an
// offscreen atlas once, lazily, on first use. Each call to
// `drawGrassBlade` collapses to a single `ctx.drawImage` slicing the
// right cell. Per-blade phase offset over the global frame counter keeps
// adjacent blades from animating in lockstep — the field still reads as
// a sea of independently-swaying tufts even though only 32 unique cells
// exist per biome.
//
// Memory: 4 × 22 × 8 × 36 × 4 bytes ≈ 25 KB per biome. Five biomes total
// ≈ 125 KB — negligible against the savings on the GPU/Canvas pipeline.

const GRASS_VARIANTS = 4
const GRASS_FRAMES = 16
/** Logical (world-space) dimensions of one cell. */
const GRASS_CELL_W = 22
const GRASS_CELL_H = 36
/** Position of the blade root inside its (logical-space) cell. */
const GRASS_ANCHOR_X = 11
const GRASS_ANCHOR_Y = 26
/** Bake the atlas at 2× device pixels so the bitmap stays crisp when the
 *  world transform zooms in/out. The cell footprint is unchanged — only
 *  the number of pixels in the atlas doubles. */
const GRASS_DPR = 2
/** Frame duration in ms. 16 frames × 90 ms ≈ 1.44 s full sway cycle —
 *  visibly fluid; the previous 270 ms-per-frame stepping read as slow-mo
 *  because each pose held for a third of a second. */
const GRASS_FRAME_MS = 90
/** Per-variant scale tweak — gives the field organic size variety without
 *  breaking the hit-test (the anchor stays at the same world position). */
const VARIANT_SCALES: readonly number[] = [0.88, 1.0, 1.08, 0.95]

const grassAtlases = new Map<StageBiome, HTMLCanvasElement>()

/** Per-biome grass-tuft bitmap. Forest / rocky / boss share the green
 *  blades tuft; wheat gets the golden ears; flower gets the reed/cattail
 *  tuft. Each bitmap is anchored at its base-centre — the stems converge
 *  near (image_w / 2, image_h * 0.86) in all three sources, so the sway
 *  atlas can use one shared anchor offset. */
const GRASS_BITMAP_SRCS: Record<StageBiome, string> = {
  forest: '/images/props/blades-of-grass_128x128.webp',
  rocky: '/images/props/blades-of-grass_128x128.webp',
  boss: '/images/props/blades-of-grass_128x128.webp',
  wheat: '/images/props/wheat_128x128.webp',
  flower: '/images/props/reed_128x128.webp'
}
const grassBitmaps = new Map<StageBiome, HTMLImageElement>()
const getGrassBitmap = (biome: StageBiome): HTMLImageElement => {
  let img = grassBitmaps.get(biome)
  if (!img) {
    img = getCachedImage(GRASS_BITMAP_SRCS[biome])
    grassBitmaps.set(biome, img)
  }
  return img
}

const drawBladeIntoAtlas = (
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  biome: StageBiome,
  variant: number,
  sway: number
) => {
  ctx.save()
  ctx.translate(ox + GRASS_ANCHOR_X, oy + GRASS_ANCHOR_Y)
  ctx.scale(VARIANT_SCALES[variant]!, VARIANT_SCALES[variant]!)
  // The tuft's base in each source bitmap sits at ~(64, 110) of 128² —
  // we display a 28×28 patch in cell-space (visually equivalent to the
  // previous procedural blade) and rotate around the root by sway·0.07
  // rad to fake the wind without baking N rotated copies.
  const img = getGrassBitmap(biome)
  if (img.complete && img.naturalWidth > 0) {
    const w = 28
    const h = 28
    const rootX = w * 0.5
    const rootY = h * (110 / 128)
    ctx.rotate(sway * 0.07)
    ctx.drawImage(img, -rootX, -rootY, w, h)
  }
  ctx.restore()
}

const buildGrassAtlas = (biome: StageBiome): HTMLCanvasElement => {
  const canvas = document.createElement('canvas')
  canvas.width = GRASS_CELL_W * GRASS_VARIANTS * GRASS_DPR
  canvas.height = GRASS_CELL_H * GRASS_FRAMES * GRASS_DPR
  const c = canvas.getContext('2d')
  if (!c) return canvas
  // Pre-scale the context so `drawBladeIntoAtlas` can keep using logical
  // (cell-space) coordinates — the same units `drawGrassBlade` later uses
  // when slicing the atlas back into the world.
  c.scale(GRASS_DPR, GRASS_DPR)
  for (let v = 0; v < GRASS_VARIANTS; v++) {
    for (let f = 0; f < GRASS_FRAMES; f++) {
      // Each variant gets its own sway-phase shift so blades sharing a
      // frame index but different variants don't move in unison — the
      // field reads as four interleaved animations.
      const phase = (f / GRASS_FRAMES) * TWO_PI + v * (Math.PI * 0.5)
      const sway = Math.sin(phase) * 1.5
      drawBladeIntoAtlas(c, v * GRASS_CELL_W, f * GRASS_CELL_H, biome, v, sway)
    }
  }
  return canvas
}

const getGrassAtlas = (biome: StageBiome): HTMLCanvasElement | null => {
  let atlas = grassAtlases.get(biome)
  if (atlas) return atlas
  // Can't bake until the source bitmap has decoded — defer the bake (and
  // any blade draws) for ~1 frame instead of caching an empty atlas.
  const img = getGrassBitmap(biome)
  if (!img.complete || img.naturalWidth === 0) return null
  atlas = buildGrassAtlas(biome)
  grassAtlases.set(biome, atlas)
  return atlas
}

export const drawGrassBlade = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  biome: StageBiome,
  seed: number
) => {
  const atlas = getGrassAtlas(biome)
  if (!atlas) return
  const variant = ((seed % GRASS_VARIANTS) + GRASS_VARIANTS) % GRASS_VARIANTS
  // Per-blade frame offset so adjacent blades within the same variant
  // are at different points in the sway cycle. Mask down to the live
  // frame count's range — `& 0xf` is plenty for 12 frames.
  const phaseOffset = (seed * 17) & 0xf
  const frame = (Math.floor(performance.now() / GRASS_FRAME_MS) + phaseOffset) % GRASS_FRAMES
  // Source rect in atlas pixels (DPR-scaled), destination in world units.
  ctx.drawImage(
    atlas,
    variant * GRASS_CELL_W * GRASS_DPR,
    frame * GRASS_CELL_H * GRASS_DPR,
    GRASS_CELL_W * GRASS_DPR,
    GRASS_CELL_H * GRASS_DPR,
    Math.round(x - GRASS_ANCHOR_X),
    Math.round(y - GRASS_ANCHOR_Y),
    GRASS_CELL_W,
    GRASS_CELL_H
  )
}

// ─── Static obstacle / coin bitmaps ──────────────────────────────────────
//
// drawCoin / stump / boulder used to build a fresh radial gradient (and a
// half-dozen path operations) on every call. Per-frame that's hundreds of
// kilobytes of CPU work for the gradient interpolation tables alone. Bake
// each shape into an offscreen canvas once; subsequent draws are a single
// drawImage. The offscreen is 2× DPR so it stays crisp under the world
// transform's zoom range.

const SPRITE_DPR = 2
const COIN_IMG_SRC = '/images/props/coin_128x128.webp'
const COIN_W = 24
const COIN_H = 24
const COIN_AX = 12
const COIN_AY = 12
const STUMP_W = 60
const STUMP_H = 60
const STUMP_AX = 30
const STUMP_AY = 28
const BOULDER_W = 70
const BOULDER_H = 54
const BOULDER_AX = 32
const BOULDER_AY = 28
const CRYSTAL_W = 44
const CRYSTAL_H = 44
const CRYSTAL_AX = 22
const CRYSTAL_AY = 22
// Liberty cat — TALL statue with a base. Anchor at the base centre so
// `(ob.x, ob.y)` lands on the ground, and the cat rises 110 wu above.
const LIBERTY_W = 70
const LIBERTY_H = 112
const LIBERTY_AX = 35
const LIBERTY_AY = 100
// Liberty trash — pure-cosmetic litter pile, no collision. Anchor at
// the centre of the bitmap.
const LIB_TRASH_W = 56
const LIB_TRASH_H = 36
const LIB_TRASH_AX = 28
const LIB_TRASH_AY = 22

const makeSprite = (
  w: number, h: number, ax: number, ay: number,
  draw: (c: CanvasRenderingContext2D) => void
): HTMLCanvasElement => {
  const canvas = document.createElement('canvas')
  canvas.width = w * SPRITE_DPR
  canvas.height = h * SPRITE_DPR
  const c = canvas.getContext('2d')
  if (!c) return canvas
  c.scale(SPRITE_DPR, SPRITE_DPR)
  // Translate so (0, 0) inside the draw callback is the world-anchor of
  // the sprite — the same coordinate the renderer later passes for
  // (ob.x, ob.y) when blitting back into the world.
  c.translate(ax, ay)
  draw(c)
  return canvas
}

let coinImage: HTMLImageElement | null = null
const getCoinImage = (): HTMLImageElement => {
  if (!coinImage) coinImage = getCachedImage(COIN_IMG_SRC)
  return coinImage
}

const STUMP_IMG_SRC = '/images/props/tree-stump_256x256.webp'
let stumpSprite: HTMLCanvasElement | null = null
const getStumpSprite = (): HTMLCanvasElement | null => {
  if (stumpSprite) return stumpSprite
  const img = getCachedImage(STUMP_IMG_SRC)
  if (!img.complete || img.naturalWidth === 0) return null
  stumpSprite = makeSprite(STUMP_W, STUMP_H, STUMP_AX, STUMP_AY, (c) => {
    c.drawImage(img, -STUMP_AX, -STUMP_AY, STUMP_W, STUMP_H)
  })
  return stumpSprite
}

const BOULDER_IMG_SRC = '/images/props/stone_256x256.webp'
let boulderSprite: HTMLCanvasElement | null = null
const getBoulderSprite = (): HTMLCanvasElement | null => {
  if (boulderSprite) return boulderSprite
  const img = getCachedImage(BOULDER_IMG_SRC)
  if (!img.complete || img.naturalWidth === 0) return null
  boulderSprite = makeSprite(BOULDER_W, BOULDER_H, BOULDER_AX, BOULDER_AY, (c) => {
    c.drawImage(img, -BOULDER_AX, -BOULDER_AY, BOULDER_W, BOULDER_H)
  })
  return boulderSprite
}

const CRYSTAL_IMG_SRC = '/images/props/crystal-white_256x256.webp'
let crystalSprite: HTMLCanvasElement | null = null
const getCrystalSprite = (): HTMLCanvasElement | null => {
  if (crystalSprite) return crystalSprite
  const img = getCachedImage(CRYSTAL_IMG_SRC)
  if (!img.complete || img.naturalWidth === 0) return null
  crystalSprite = makeSprite(CRYSTAL_W, CRYSTAL_H, CRYSTAL_AX, CRYSTAL_AY, (c) => {
    c.drawImage(img, -CRYSTAL_AX, -CRYSTAL_AY, CRYSTAL_W, CRYSTAL_H)
  })
  return crystalSprite
}

const LIBERTY_IMG_SRC = '/images/props/liberty-cat.webp'
let libertySprite: HTMLCanvasElement | null = null
const getLibertySprite = (): HTMLCanvasElement | null => {
  if (libertySprite) return libertySprite
  const img = getCachedImage(LIBERTY_IMG_SRC)
  if (!img.complete || img.naturalWidth === 0) return null
  libertySprite = makeSprite(LIBERTY_W, LIBERTY_H, LIBERTY_AX, LIBERTY_AY, (c) => {
    c.drawImage(img, -LIBERTY_AX, -LIBERTY_AY, LIBERTY_W, LIBERTY_H)
  })
  return libertySprite
}

const LIB_TRASH_IMG_SRC = '/images/props/liberty-trash.webp'
let libTrashImage: HTMLImageElement | null = null
const getLibTrashImage = (): HTMLImageElement => {
  if (!libTrashImage) libTrashImage = getCachedImage(LIB_TRASH_IMG_SRC)
  return libTrashImage
}

// ─── Obstacles ───────────────────────────────────────────────────────────
export const drawObstacle = (ctx: CanvasRenderingContext2D, ob: Obstacle) => {
  if (ob.type === 'crystal') {
    const sprite = getCrystalSprite()
    if (sprite) {
      ctx.drawImage(
        sprite,
        0, 0, CRYSTAL_W * SPRITE_DPR, CRYSTAL_H * SPRITE_DPR,
        Math.round(ob.x - CRYSTAL_AX), Math.round(ob.y - CRYSTAL_AY), CRYSTAL_W, CRYSTAL_H
      )
    }
  } else if (ob.type === 'stump') {
    const sprite = getStumpSprite()
    if (sprite) {
      ctx.drawImage(
        sprite,
        0, 0, STUMP_W * SPRITE_DPR, STUMP_H * SPRITE_DPR,
        Math.round(ob.x - STUMP_AX), Math.round(ob.y - STUMP_AY), STUMP_W, STUMP_H
      )
    }
  } else if (ob.type === 'liberty') {
    const sprite = getLibertySprite()
    if (sprite) {
      ctx.drawImage(
        sprite,
        0, 0, LIBERTY_W * SPRITE_DPR, LIBERTY_H * SPRITE_DPR,
        Math.round(ob.x - LIBERTY_AX), Math.round(ob.y - LIBERTY_AY), LIBERTY_W, LIBERTY_H
      )
    }
  } else {
    const sprite = getBoulderSprite()
    if (sprite) {
      ctx.drawImage(
        sprite,
        0, 0, BOULDER_W * SPRITE_DPR, BOULDER_H * SPRITE_DPR,
        Math.round(ob.x - BOULDER_AX), Math.round(ob.y - BOULDER_AY), BOULDER_W, BOULDER_H
      )
    }
  }
}

// ─── Decor (cosmetic, no collision) ───────────────────────────────────
/** Renders one cosmetic prop at its world position. Decor lives on the
 *  `MawIsland.decor` array; no hit-test, no coin payout, just art. */
export const drawDecor = (ctx: CanvasRenderingContext2D, type: string, x: number, y: number) => {
  if (type === 'libertyTrash') {
    const img = getLibTrashImage()
    if (!img.complete || img.naturalWidth === 0) return
    ctx.drawImage(
      img,
      Math.round(x - LIB_TRASH_AX), Math.round(y - LIB_TRASH_AY),
      LIB_TRASH_W, LIB_TRASH_H
    )
  }
}

// ─── Coin ────────────────────────────────────────────────────────────────
export const drawCoin = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
  const img = getCoinImage()
  if (!img.complete || img.naturalWidth === 0) return
  ctx.drawImage(
    img,
    Math.round(x - COIN_AX), Math.round(y - COIN_AY),
    COIN_W, COIN_H
  )
}

// ─── Exit pole (golf-style flag) ─────────────────────────────────────────
// The exit pole is the bitmap at `/images/props/pole_256x256.webp`. The
// world anchor (x, y) maps to the base/cup of the pole (image-norm
// (0.51, 0.90)), so the pole rises 72 world units above the anchor and
// the cup sits ~8 below — matching the previous procedural footprint.
// A pulsing green halo behind the flag fires when `reqsMet` is true to
// telegraph "touch me to win"; `cut` is now purely a gameplay-side flag
// (the chain has touched me at least once) with no visual effect on the
// pole, since the bitmap is static.
const EXIT_POLE_SRC = '/images/props/pole_256x256.webp'
const EXIT_POLE_W = 80
const EXIT_POLE_H = 80
const EXIT_POLE_AX_NORM = 0.51
const EXIT_POLE_AY_NORM = 0.90

let exitPoleImage: HTMLImageElement | null = null
const getExitPoleImage = (): HTMLImageElement => {
  if (!exitPoleImage) exitPoleImage = getCachedImage(EXIT_POLE_SRC)
  return exitPoleImage
}

export const drawExitPole = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  _cut: boolean,
  reqsMet: boolean
) => {
  // Green halo behind the flag when the player can win — pulses so it
  // reads as "active" even when stationary on the screen edge.
  if (reqsMet) {
    const pulse = 0.55 + Math.sin(performance.now() * 0.006) * 0.25
    const flagX = x
    const flagY = y - EXIT_POLE_H * 0.65
    const grad = ctx.createRadialGradient(flagX, flagY, 4, flagX, flagY, 40)
    grad.addColorStop(0, `rgba(120, 255, 160, ${pulse})`)
    grad.addColorStop(1, 'rgba(120, 255, 160, 0)')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(flagX, flagY, 40, 0, TWO_PI)
    ctx.fill()
  }

  const img = getExitPoleImage()
  if (!img.complete || img.naturalWidth === 0) return
  ctx.drawImage(
    img,
    x - EXIT_POLE_W * EXIT_POLE_AX_NORM,
    y - EXIT_POLE_H * EXIT_POLE_AY_NORM,
    EXIT_POLE_W, EXIT_POLE_H
  )
}

// ─── Robot (two gears + chain) ───────────────────────────────────────────
const drawGear = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: 'orange' | 'teal',
  rotation: number
) => {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(rotation)

  const grad = ctx.createRadialGradient(-radius * 0.3, -radius * 0.3, 2, 0, 0, radius)
  if (color === 'orange') {
    grad.addColorStop(0, '#ffb56b')
    grad.addColorStop(1, '#c8430b')
  } else {
    grad.addColorStop(0, '#7fffd9')
    grad.addColorStop(1, '#0e7d80')
  }

  // Teeth
  ctx.fillStyle = '#1a1a1a'
  const teeth = 16
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * TWO_PI
    ctx.save()
    ctx.rotate(a)
    ctx.fillRect(-3, -radius - 6, 6, 8)
    ctx.restore()
  }

  // Body
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.arc(0, 0, radius, 0, TWO_PI)
  ctx.fill()
  ctx.strokeStyle = '#1a1a1a'
  ctx.lineWidth = 2
  ctx.stroke()

  // Inner hub
  ctx.fillStyle = '#1a1a1a'
  ctx.beginPath()
  ctx.arc(0, 0, radius * 0.4, 0, TWO_PI)
  ctx.fill()

  // Hub dots — small accent
  ctx.fillStyle = color === 'orange' ? '#ffb56b' : '#7fffd9'
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TWO_PI
    const r = radius * 0.55
    ctx.beginPath()
    ctx.arc(Math.cos(a) * r, Math.sin(a) * r, 2.3, 0, TWO_PI)
    ctx.fill()
  }

  ctx.restore()
}

const drawChainSegment = (
  ctx: CanvasRenderingContext2D,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  side: 1 | -1
) => {
  const dx = bx - ax
  const dy = by - ay
  const len = Math.hypot(dx, dy) || 1
  const nx = -dy / len
  const ny = dx / len
  const offset = 11 * side
  const x1 = ax + nx * offset
  const y1 = ay + ny * offset
  const x2 = bx + nx * offset
  const y2 = by + ny * offset

  ctx.strokeStyle = '#1a1a1a'
  ctx.lineWidth = 6
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.stroke()

  // Spike-saw teeth: small triangles outward from the chain pointing away
  // from the chord. All teeth share a single beginPath so the chain
  // renders as one fill + one stroke, not 2 × segs separate calls.
  const segs = Math.max(8, Math.floor(len / 14))
  ctx.fillStyle = '#222'
  ctx.strokeStyle = '#000'
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let i = 0; i < segs; i++) {
    const t = (i + 0.5) / segs
    const px = x1 + (x2 - x1) * t
    const py = y1 + (y2 - y1) * t
    ctx.moveTo(px - dx / len * 4, py - dy / len * 4)
    ctx.lineTo(px + nx * 6 * side, py + ny * 6 * side)
    ctx.lineTo(px + dx / len * 4, py + dy / len * 4)
    ctx.closePath()
  }
  ctx.fill()
  ctx.stroke()
}

// ─── Bitmap robot art ─────────────────────────────────────────────────────
// Two chain art variants — both share the same 256-px-tall canvas and a
// matching 80-px-wide rounded end-cap on each side; the long variant
// has a wider middle so the 3-slice stretch doesn't visibly elongate the
// body once the player buys chain-length upgrades. Selected per-frame
// by drawRobot's `chainLevel` parameter.
interface ChainArt {
  src: string
  /** Source width in pixels. */
  total: number
  /** Width of each rounded end-cap slice in source pixels — same in both
   *  variants so the in-world end-cap render size and hole alignment
   *  don't shift when we swap art. */
  endW: number
}

const CHAIN_ART_SHORT: ChainArt = {
  src: '/images/props/chain_256x256.webp',
  total: 256,
  endW: 80
}
const CHAIN_ART_LONG: ChainArt = {
  src: '/images/props/chain_450x256.webp',
  total: 450,
  endW: 80
}
const ROBOT_GEAR_SRC = '/images/props/gear_256x256.webp'

const CHAIN_SRC_HEIGHT = 256

/** Each end-cap renders at exactly the gear's hit footprint so the link
 *  hole sits over the gear with no offset shimmer when the chain stretches. */
const CHAIN_END_WORLD_W = 64
/** Vertical chain thickness in world. Tuned so the chain content (which
 *  fills roughly the middle 150 px of the 256-px-tall source) reads at
 *  a similar girth to the previous procedural two-line chain. */
const CHAIN_WORLD_H = 60

/** Gear visual diameter in world. Matches `GEAR_HIT_RADIUS = 32` × 2 in
 *  `useMawGame.ts`, so the dashed debug ring lines up exactly with the
 *  bitmap teeth tips. */
const GEAR_WORLD_D = 64

const chainImages = new Map<string, HTMLImageElement>()
const getChainArtImage = (art: ChainArt): HTMLImageElement => {
  let img = chainImages.get(art.src)
  if (!img) {
    img = getCachedImage(art.src)
    chainImages.set(art.src, img)
  }
  return img
}

let gearImage: HTMLImageElement | null = null
const getGearImage = (): HTMLImageElement => {
  if (!gearImage) gearImage = getCachedImage(ROBOT_GEAR_SRC)
  return gearImage
}

const drawRobotBitmap = (
  ctx: CanvasRenderingContext2D,
  anchor: { x: number; y: number },
  swing: { x: number; y: number },
  swingAngle: number,
  chainImg: HTMLImageElement,
  chainArt: ChainArt,
  gearImg: HTMLImageElement
) => {
  const dx = swing.x - anchor.x
  const dy = swing.y - anchor.y
  const angle = Math.atan2(dy, dx)
  const distance = Math.hypot(dx, dy)

  // ─── Chain (3-slice) ──────────────────────────────────────────────────
  ctx.save()
  ctx.translate((anchor.x + swing.x) / 2, (anchor.y + swing.y) / 2)
  ctx.rotate(angle)
  const halfD = distance / 2
  const halfEnd = CHAIN_END_WORLD_W / 2
  const halfH = CHAIN_WORLD_H / 2
  const srcMidX = chainArt.endW
  const srcMidW = chainArt.total - 2 * chainArt.endW
  const srcRightX = chainArt.total - chainArt.endW

  // Left end-cap — centred on the anchor gear at (-halfD, 0) in local space.
  ctx.drawImage(
    chainImg,
    0, 0, chainArt.endW, CHAIN_SRC_HEIGHT,
    -halfD - halfEnd, -halfH, CHAIN_END_WORLD_W, CHAIN_WORLD_H
  )
  // Middle — stretches across the gap when the gears are further apart
  // than the two end caps combined. When they're closer (shouldn't happen
  // in normal play), we skip drawing it to avoid a flipped slice.
  const midWorldW = distance - CHAIN_END_WORLD_W
  if (midWorldW > 0) {
    ctx.drawImage(
      chainImg,
      srcMidX, 0, srcMidW, CHAIN_SRC_HEIGHT,
      -halfD + halfEnd, -halfH, midWorldW, CHAIN_WORLD_H
    )
  }
  // Right end-cap — centred on the swing gear at (+halfD, 0).
  ctx.drawImage(
    chainImg,
    srcRightX, 0, chainArt.endW, CHAIN_SRC_HEIGHT,
    halfD - halfEnd, -halfH, CHAIN_END_WORLD_W, CHAIN_WORLD_H
  )
  ctx.restore()

  // ─── Gears ────────────────────────────────────────────────────────────
  // Anchor stays still — that's the visual cue for "this is the pivot".
  // The swing gear rotates at swingAngle*4 so the saw teeth spin around
  // the orbit, reading as motion even when the player isn't swapping.
  ctx.save()
  ctx.translate(anchor.x, anchor.y)
  ctx.drawImage(
    gearImg,
    -GEAR_WORLD_D / 2, -GEAR_WORLD_D / 2,
    GEAR_WORLD_D, GEAR_WORLD_D
  )
  ctx.restore()

  ctx.save()
  ctx.translate(swing.x, swing.y)
  ctx.rotate(swingAngle * 4)
  ctx.drawImage(
    gearImg,
    -GEAR_WORLD_D / 2, -GEAR_WORLD_D / 2,
    GEAR_WORLD_D, GEAR_WORLD_D
  )
  ctx.restore()
}

export const drawRobot = (
  ctx: CanvasRenderingContext2D,
  anchor: { x: number; y: number },
  swing: { x: number; y: number },
  swingAngle: number,
  anchorIsLeft: boolean = true,
  /** Effective chain-length upgrade level. 0 → use the 256-wide short
   *  art (less compression at base reach); 1+ → use the 450-wide art
   *  whose longer middle slice prevents visible stretching once the
   *  player has bought any chain upgrade. */
  chainLevel: number = 0
) => {
  // Try the bitmap path first — once the chosen chain art + the gear
  // have decoded. If either is missing/still loading, fall through to
  // the original procedural draw so the player never sees a half-
  // rendered robot.
  const chainArt: ChainArt = chainLevel >= 1 ? CHAIN_ART_LONG : CHAIN_ART_SHORT
  const chainImg = getChainArtImage(chainArt)
  const gearImg = getGearImage()
  if (chainImg.complete && chainImg.naturalWidth > 0
    && gearImg.complete && gearImg.naturalWidth > 0) {
    drawRobotBitmap(ctx, anchor, swing, swingAngle, chainImg, chainArt, gearImg)
    return
  }

  // ─── Procedural fallback ──────────────────────────────────────────────
  const radius = 26

  // Chain — two parallel sides for the two-gear chain look.
  drawChainSegment(ctx, anchor.x, anchor.y, swing.x, swing.y, 1)
  drawChainSegment(ctx, anchor.x, anchor.y, swing.x, swing.y, -1)

  // The two gears are physical objects (orange + teal). Each click swaps
  // which one is rooted, so the colours travel with the gears, not with
  // the role. The currently-anchored gear renders without spin to read
  // as the pivot.
  const anchorColor: 'orange' | 'teal' = anchorIsLeft ? 'orange' : 'teal'
  const swingColor: 'orange' | 'teal' = anchorIsLeft ? 'teal' : 'orange'
  drawGear(ctx, anchor.x, anchor.y, radius, anchorColor, 0)
  drawGear(ctx, swing.x, swing.y, radius, swingColor, swingAngle * 4)
}

/** Debug overlay for the robot's cut/damage hit-test geometry. After the
 *  hit-test fix, the chain's effective shape is:
 *    • along the body — a rectangle of width 2·cutR around the segment
 *      between the gear centres
 *    • at each gear end — a circle of radius (cutR + 32) so anything
 *      visually touching the teeth (gear visual radius = 32) counts as
 *      "on the chain"
 *  We paint translucent layers per obstacle category (boulder 26,
 *  stump 22, crystal 18, grass 14) and a dashed yellow ring at the gear
 *  teeth-tip radius for visual reference. */
export const drawRobotHitBoxes = (
  ctx: CanvasRenderingContext2D,
  anchor: { x: number; y: number },
  swing: { x: number; y: number }
) => {
  const GEAR = 32
  const layers: ReadonlyArray<[number, string]> = [
    [26, 'rgba(255, 120, 120, 0.18)'], // boulder
    [22, 'rgba(220, 160, 120, 0.18)'], // stump
    [18, 'rgba(140, 200, 255, 0.20)'], // crystal
    [14, 'rgba(180, 255, 140, 0.30)']  // grass
  ]
  ctx.save()
  for (const [r, color] of layers) {
    // Rectangle body — butt caps so the rectangle ends square at the
    // gear centres; the endpoint circles below add the gear halo.
    ctx.lineCap = 'butt'
    ctx.strokeStyle = color
    ctx.lineWidth = r * 2
    ctx.beginPath()
    ctx.moveTo(anchor.x, anchor.y)
    ctx.lineTo(swing.x, swing.y)
    ctx.stroke()
    // Gear halo at each endpoint, radius cutR + GEAR.
    ctx.fillStyle = color
    for (const p of [anchor, swing]) {
      ctx.beginPath()
      ctx.arc(p.x, p.y, r + GEAR, 0, TWO_PI)
      ctx.fill()
    }
  }
  // Dashed yellow gear-edge ring so the player can see where the visual
  // teeth tips end vs the much wider hit halo.
  ctx.lineWidth = 1.5
  ctx.setLineDash([6, 4])
  ctx.strokeStyle = '#ffe066'
  for (const p of [anchor, swing]) {
    ctx.beginPath()
    ctx.arc(p.x, p.y, GEAR, 0, TWO_PI)
    ctx.stroke()
  }
  ctx.restore()
}
