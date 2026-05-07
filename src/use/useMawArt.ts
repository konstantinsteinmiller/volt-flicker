import type { MawIsland, Obstacle, StageBiome } from '@/use/useMawCampaign'

/**
 * Programmatic canvas art helpers — drawn in pure 2D so the project ships
 * without any sprite sheets. Each function paints one piece of the world
 * at world-space coordinates; the caller is responsible for transforming
 * the camera. See `art-todo.md` for the inventory of pieces queued up
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

// ─── Water — a tiled wave pattern keyed off camera position ─────────────
export const drawWater = (
  ctx: CanvasRenderingContext2D,
  cameraX: number,
  cameraY: number,
  worldW: number,
  worldH: number
) => {
  const cellSize = 96
  const startX = Math.floor((cameraX - worldW / 2) / cellSize) * cellSize
  const startY = Math.floor((cameraY - worldH / 2) / cellSize) * cellSize
  const endX = startX + worldW + cellSize * 2
  const endY = startY + worldH + cellSize * 2

  ctx.fillStyle = '#3aa6c4'
  ctx.fillRect(startX, startY, endX - startX, endY - startY)

  // Wave streaks — every cell's two arcs share a single beginPath so the
  // GPU sees ONE stroke command for the entire visible field instead of
  // ~250 per frame. Each `moveTo` starts a new sub-path within the same
  // path, which is exactly what we want here.
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)'
  ctx.lineWidth = 4
  ctx.lineCap = 'round'
  ctx.beginPath()
  for (let yy = startY; yy < endY; yy += cellSize) {
    for (let xx = startX; xx < endX; xx += cellSize) {
      const off = ((xx * 17 + yy * 31) % 64) - 32
      ctx.moveTo(xx + 12 + off * 0.4, yy + 28)
      ctx.quadraticCurveTo(xx + cellSize / 2, yy + 14, xx + cellSize - 12, yy + 28)
      ctx.moveTo(xx + 18 + off * 0.2, yy + 64)
      ctx.quadraticCurveTo(xx + cellSize / 2, yy + 50, xx + cellSize - 18, yy + 64)
    }
  }
  ctx.stroke()

  // Sparkles — same trick, one fill for every cell.
  ctx.fillStyle = 'rgba(255, 255, 255, 0.55)'
  ctx.beginPath()
  for (let yy = startY; yy < endY; yy += cellSize) {
    for (let xx = startX; xx < endX; xx += cellSize) {
      const sparkleX = xx + ((xx * 7 + yy * 11) % cellSize)
      const sparkleY = yy + ((xx * 5 + yy * 13) % cellSize)
      ctx.moveTo(sparkleX + 1.5, sparkleY)
      ctx.arc(sparkleX, sparkleY, 1.5, 0, TWO_PI)
    }
  }
  ctx.fill()
}

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

export const drawIsland = (ctx: CanvasRenderingContext2D, isle: MawIsland & { biome?: StageBiome }) => {
  const colors = biomeColors(((isle as any).biome) ?? 'forest')

  // Drop shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)'
  if (isle.shape === 'round') {
    ctx.beginPath()
    ctx.ellipse(isle.cx + 4, isle.cy + 8, isle.radius + 4, isle.radius * 0.55 + 4, 0, 0, TWO_PI)
    ctx.fill()
  } else {
    rrect(ctx, isle.cx - isle.radius - 4, isle.cy - isle.radius * 0.55 - 4, (isle.radius + 4) * 2, (isle.radius * 0.55 + 4) * 2, 18)
    ctx.fill()
  }

  // Soil base
  ctx.fillStyle = colors.soil
  if (isle.shape === 'round') {
    ctx.beginPath()
    ctx.arc(isle.cx, isle.cy + 6, isle.radius, 0, TWO_PI)
    ctx.fill()
  } else {
    rrect(ctx, isle.cx - isle.radius, isle.cy - isle.radius + 6, isle.radius * 2, isle.radius * 2, 22)
    ctx.fill()
  }

  // Grass cap
  const grassGradient = ctx.createRadialGradient(isle.cx, isle.cy - isle.radius * 0.4, 10, isle.cx, isle.cy, isle.radius)
  grassGradient.addColorStop(0, colors.grassLight)
  grassGradient.addColorStop(1, colors.grassDark)
  ctx.fillStyle = grassGradient
  if (isle.shape === 'round') {
    ctx.beginPath()
    ctx.arc(isle.cx, isle.cy, isle.radius, 0, TWO_PI)
    ctx.fill()
  } else {
    rrect(ctx, isle.cx - isle.radius, isle.cy - isle.radius, isle.radius * 2, isle.radius * 2, 18)
    ctx.fill()
  }

  // Grass edge tufts — small darker arcs around the perimeter to suggest
  // depth without needing a sprite sheet. All tufts share a single
  // beginPath so the rim renders in one stroke instead of N (~30 per
  // round island).
  ctx.strokeStyle = colors.ring
  ctx.lineWidth = 3
  ctx.lineCap = 'round'
  if (isle.shape === 'round') {
    const steps = Math.floor(isle.radius / 8)
    ctx.beginPath()
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * TWO_PI
      const ex = isle.cx + Math.cos(a) * (isle.radius - 1)
      const ey = isle.cy + Math.sin(a) * (isle.radius - 1)
      const tx = isle.cx + Math.cos(a) * (isle.radius + 5)
      const ty = isle.cy + Math.sin(a) * (isle.radius + 5)
      ctx.moveTo(ex, ey)
      ctx.lineTo(tx, ty)
    }
    ctx.stroke()
  }
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
  const colors = biomeColors(biome)
  if (biome === 'wheat') {
    ctx.fillStyle = colors.grassLight
    ctx.strokeStyle = '#5a3a14'
    ctx.lineWidth = 1.2
    ctx.beginPath()
    ctx.moveTo(0, 8)
    ctx.lineTo(sway, -4)
    ctx.lineTo(sway + 2, -10)
    ctx.lineTo(sway - 2, -10)
    ctx.lineTo(sway, -4)
    ctx.stroke()
    ctx.beginPath()
    ctx.ellipse(sway, -12, 3, 5, 0, 0, TWO_PI)
    ctx.fill()
  } else if (biome === 'flower') {
    ctx.fillStyle = colors.grassDark
    ctx.beginPath()
    ctx.moveTo(0, 6)
    ctx.lineTo(sway, -4)
    ctx.lineTo(sway + 1, -4)
    ctx.lineTo(1, 6)
    ctx.fill()
    // Per-variant petal hue — atlas can only cache deterministic colours,
    // so the previous per-blade `seed * 73 % 360` collapses to one of
    // four fixed hues across the field.
    const hueSeed = (variant * 73) % 360
    ctx.fillStyle = `hsl(${hueSeed}, 80%, 65%)`
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TWO_PI
      ctx.beginPath()
      ctx.ellipse(sway + Math.cos(a) * 3, -6 + Math.sin(a) * 3, 2.4, 2.4, 0, 0, TWO_PI)
      ctx.fill()
    }
    ctx.fillStyle = '#ffd55a'
    ctx.beginPath()
    ctx.arc(sway, -6, 1.5, 0, TWO_PI)
    ctx.fill()
  } else {
    ctx.strokeStyle = colors.grassDark
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(0, 4)
    ctx.lineTo(sway, -6)
    ctx.stroke()
    ctx.strokeStyle = colors.grassLight
    ctx.beginPath()
    ctx.moveTo(-2, 4)
    ctx.lineTo(sway - 2, -4)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(2, 4)
    ctx.lineTo(sway + 2, -4)
    ctx.stroke()
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

const getGrassAtlas = (biome: StageBiome): HTMLCanvasElement => {
  let atlas = grassAtlases.get(biome)
  if (!atlas) {
    atlas = buildGrassAtlas(biome)
    grassAtlases.set(biome, atlas)
  }
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

let coinSprite: HTMLCanvasElement | null = null
const getCoinSprite = (): HTMLCanvasElement => {
  if (coinSprite) return coinSprite
  coinSprite = makeSprite(COIN_W, COIN_H, COIN_AX, COIN_AY, (c) => {
    const grad = c.createRadialGradient(-2, -2, 1, 0, 0, 8)
    grad.addColorStop(0, '#fff7b0')
    grad.addColorStop(1, '#b8860b')
    c.fillStyle = grad
    c.beginPath()
    c.arc(0, 0, 8, 0, TWO_PI)
    c.fill()
    c.strokeStyle = '#5a3408'
    c.lineWidth = 1.5
    c.stroke()
    c.fillStyle = '#5a3408'
    c.font = 'bold 10px sans-serif'
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.fillText('$', 0, 1)
  })
  return coinSprite
}

let stumpSprite: HTMLCanvasElement | null = null
const getStumpSprite = (): HTMLCanvasElement => {
  if (stumpSprite) return stumpSprite
  stumpSprite = makeSprite(STUMP_W, STUMP_H, STUMP_AX, STUMP_AY, (c) => {
    c.fillStyle = '#3a1e0d'
    c.beginPath()
    c.ellipse(3, 6, 22, 12, 0, 0, TWO_PI)
    c.fill()
    c.fillStyle = '#7a4a1f'
    c.beginPath()
    c.arc(0, 0, 22, 0, TWO_PI)
    c.fill()
    c.strokeStyle = '#5a341a'
    c.lineWidth = 1.5
    c.beginPath()
    for (const r of [6, 12, 17]) {
      c.moveTo(r, 0)
      c.arc(0, 0, r, 0, TWO_PI)
    }
    c.stroke()
    c.fillStyle = '#a76b32'
    c.beginPath()
    c.arc(-2, -2, 3, 0, TWO_PI)
    c.fill()
  })
  return stumpSprite
}

let boulderSprite: HTMLCanvasElement | null = null
const getBoulderSprite = (): HTMLCanvasElement => {
  if (boulderSprite) return boulderSprite
  boulderSprite = makeSprite(BOULDER_W, BOULDER_H, BOULDER_AX, BOULDER_AY, (c) => {
    const grad = c.createRadialGradient(-8, -8, 4, 0, 0, 28)
    grad.addColorStop(0, '#9aa1a6')
    grad.addColorStop(1, '#3e4448')
    c.fillStyle = '#1a1c1e'
    c.beginPath()
    c.ellipse(4, 8, 30, 14, 0, 0, TWO_PI)
    c.fill()
    c.fillStyle = grad
    c.beginPath()
    c.arc(0, 0, 28, 0, TWO_PI)
    c.fill()
    c.fillStyle = 'rgba(255,255,255,0.18)'
    c.beginPath()
    c.arc(-8, -8, 6, 0, TWO_PI)
    c.fill()
    c.strokeStyle = '#1a1c1e'
    c.lineWidth = 2
    c.beginPath()
    c.moveTo(-12, 4)
    c.lineTo(6, -2)
    c.stroke()
  })
  return boulderSprite
}

// ─── Obstacles ───────────────────────────────────────────────────────────
export const drawObstacle = (ctx: CanvasRenderingContext2D, ob: Obstacle) => {
  if (ob.type === 'crystal') {
    // Teal-violet gem cluster — a tall central facet plus two side shards.
    const t = performance.now() * 0.003 + ob.x * 0.01
    const sparkle = 0.6 + Math.sin(t) * 0.3
    // Drop shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)'
    ctx.beginPath()
    ctx.ellipse(ob.x + 2, ob.y + 18, 18, 5, 0, 0, TWO_PI)
    ctx.fill()
    // Central facet
    const grad = ctx.createLinearGradient(ob.x - 8, ob.y - 18, ob.x + 8, ob.y + 14)
    grad.addColorStop(0, '#d4f7ff')
    grad.addColorStop(0.4, '#5fd8ff')
    grad.addColorStop(1, '#1f6e9e')
    ctx.fillStyle = grad
    ctx.strokeStyle = '#0a3a5a'
    ctx.lineWidth = 1.6
    ctx.beginPath()
    ctx.moveTo(ob.x, ob.y - 18)
    ctx.lineTo(ob.x + 9, ob.y - 4)
    ctx.lineTo(ob.x + 6, ob.y + 14)
    ctx.lineTo(ob.x - 6, ob.y + 14)
    ctx.lineTo(ob.x - 9, ob.y - 4)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    // Side shards
    const shardGrad = ctx.createLinearGradient(ob.x - 18, ob.y - 4, ob.x + 18, ob.y + 12)
    shardGrad.addColorStop(0, '#a8e9ff')
    shardGrad.addColorStop(1, '#1e547a')
    ctx.fillStyle = shardGrad
    ctx.beginPath()
    ctx.moveTo(ob.x - 16, ob.y - 2)
    ctx.lineTo(ob.x - 8, ob.y - 8)
    ctx.lineTo(ob.x - 6, ob.y + 12)
    ctx.lineTo(ob.x - 14, ob.y + 12)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(ob.x + 16, ob.y - 2)
    ctx.lineTo(ob.x + 8, ob.y - 8)
    ctx.lineTo(ob.x + 6, ob.y + 12)
    ctx.lineTo(ob.x + 14, ob.y + 12)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    // Highlight stripe
    ctx.fillStyle = `rgba(255, 255, 255, ${0.35 * sparkle})`
    ctx.beginPath()
    ctx.moveTo(ob.x - 3, ob.y - 14)
    ctx.lineTo(ob.x + 1, ob.y - 14)
    ctx.lineTo(ob.x + 3, ob.y + 8)
    ctx.lineTo(ob.x - 1, ob.y + 8)
    ctx.closePath()
    ctx.fill()
  } else if (ob.type === 'stump') {
    const sprite = getStumpSprite()
    ctx.drawImage(
      sprite,
      0, 0, STUMP_W * SPRITE_DPR, STUMP_H * SPRITE_DPR,
      Math.round(ob.x - STUMP_AX), Math.round(ob.y - STUMP_AY), STUMP_W, STUMP_H
    )
  } else {
    const sprite = getBoulderSprite()
    ctx.drawImage(
      sprite,
      0, 0, BOULDER_W * SPRITE_DPR, BOULDER_H * SPRITE_DPR,
      Math.round(ob.x - BOULDER_AX), Math.round(ob.y - BOULDER_AY), BOULDER_W, BOULDER_H
    )
  }
}

// ─── Coin ────────────────────────────────────────────────────────────────
export const drawCoin = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
  const sprite = getCoinSprite()
  ctx.drawImage(
    sprite,
    0, 0, COIN_W * SPRITE_DPR, COIN_H * SPRITE_DPR,
    Math.round(x - COIN_AX), Math.round(y - COIN_AY), COIN_W, COIN_H
  )
}

// ─── Exit pole (golf-style flag) ─────────────────────────────────────────
/**
 * The exit pole. Touching it with the chain after `targetClears` is met
 * finishes the stage. It can be cut visually (flag droops + pole leans)
 * but still works as an exit either way. `reqsMet` flips the flag from
 * red to green so the player knows when they can leave.
 */
export const drawExitPole = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  cut: boolean,
  reqsMet: boolean
) => {
  const poleHeight = 56
  const baseY = y + 4
  const topY = y - poleHeight
  const lean = cut ? 0.35 : 0
  const topX = x + Math.sin(lean) * poleHeight
  const topYAdj = baseY - Math.cos(lean) * poleHeight

  // Cup at the base (golf hole).
  ctx.fillStyle = '#1a0e05'
  ctx.beginPath()
  ctx.ellipse(x, baseY, 11, 4, 0, 0, TWO_PI)
  ctx.fill()
  ctx.strokeStyle = '#0a0502'
  ctx.lineWidth = 1.5
  ctx.stroke()

  // Pole body.
  ctx.strokeStyle = '#e8e2d3'
  ctx.lineWidth = 4
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(x, baseY)
  ctx.lineTo(topX, topYAdj)
  ctx.stroke()
  // Subtle dark side for depth.
  ctx.strokeStyle = '#7c7368'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(x + 1.5, baseY - 2)
  ctx.lineTo(topX + 1.5, topYAdj + 2)
  ctx.stroke()

  // Glow when requirements are met (telegraphs the win).
  if (reqsMet) {
    const pulse = 0.55 + Math.sin(performance.now() * 0.006) * 0.25
    const grad = ctx.createRadialGradient(topX, topYAdj, 4, topX, topYAdj, 32)
    grad.addColorStop(0, `rgba(120, 255, 160, ${pulse})`)
    grad.addColorStop(1, 'rgba(120, 255, 160, 0)')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(topX, topYAdj, 32, 0, TWO_PI)
    ctx.fill()
  }

  // Flag.
  const flagFill = reqsMet ? '#3ad36b' : '#f24a3a'
  const flagShade = reqsMet ? '#1f8a44' : '#a0231a'
  ctx.fillStyle = flagFill
  ctx.strokeStyle = flagShade
  ctx.lineWidth = 1.5
  if (cut) {
    // Droopy flag — folds down past the top of the pole.
    ctx.beginPath()
    ctx.moveTo(topX, topYAdj)
    ctx.lineTo(topX + 14, topYAdj + 18)
    ctx.lineTo(topX - 1, topYAdj + 9)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
  } else {
    // Triangular flag flapping in the wind.
    const wave = Math.sin(performance.now() * 0.005) * 2
    ctx.beginPath()
    ctx.moveTo(topX, topYAdj)
    ctx.lineTo(topX + 22, topYAdj + 6 + wave)
    ctx.lineTo(topX, topYAdj + 14)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
  }

  // Top knob.
  ctx.fillStyle = '#f8df7e'
  ctx.beginPath()
  ctx.arc(topX, topYAdj - 1, 2.6, 0, TWO_PI)
  ctx.fill()
  ctx.strokeStyle = '#7a5b1e'
  ctx.lineWidth = 1
  ctx.stroke()
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

export const drawRobot = (
  ctx: CanvasRenderingContext2D,
  anchor: { x: number; y: number },
  swing: { x: number; y: number },
  swingAngle: number,
  anchorIsLeft: boolean = true
) => {
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
