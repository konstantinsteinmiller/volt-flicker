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

const TILE_SRCS = [
  ...FLOOR_VARIANTS, ...SPECIAL_VARIANTS,
  COIN_SRC, BOX_SRC, BOULDER_SRC, ITEM_BOX_SRC, ITEM_SPARKLE_SRC, VORTEX_SRC, LAVA_SRC, SPIKE_SRC
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
const drawObstacle = (ctx: CanvasRenderingContext2D, kind: ObstacleKind, x: number, y: number, jitter = 1): void => {
  if (kind === 'box') { drawSpriteProp(ctx, BOX_SRC, x, y, 0.9 * jitter); return }
  if (kind === 'stone') { drawSpriteProp(ctx, BOULDER_SRC, x, y, jitter); return }
  // The old grey procedural block read poorly next to holes — use the box art.
  if (kind === 'wall') { drawSpriteProp(ctx, BOX_SRC, x, y, 1.035 * jitter); return }
  // Pyramid → spiky-pole sprite (the bitmap is already upright; just scale to fit).
  drawSpriteProp(ctx, SPIKE_SRC, x, y, 1.0)
}

/** Small sparkle particles emitting from an item box — each fades in fast,
 *  grows from 80%→110%, then fades out shrinking ~10% near the end. Phases are
 *  derived deterministically from the box `seed` so they don't reset per frame. */
const drawItemSparkles = (ctx: CanvasRenderingContext2D, x: number, cy: number, base: number, now: number, seed: number): void => {
  const img = getImg(ITEM_SPARKLE_SRC)
  if (!ready(img)) return
  const N = 6
  const period = 820
  for (let i = 0; i < N; i++) {
    const ph = ((now + i * (period / N) + seed * 137) % period) / period // 0..1 life
    const fadeIn = Math.min(1, ph / 0.18)               // fast fade-in
    const fadeOut = ph > 0.55 ? Math.max(0, 1 - (ph - 0.55) / 0.45) : 1
    const grow = 0.8 + ph * 0.3                          // 0.8 → 1.1
    const shrink = ph > 0.85 ? 1 - ((ph - 0.85) / 0.15) * 0.1 : 1 // shrink 10% at the end
    // Spread the sparkles around the box rim so they read clearly against it.
    const ang = seed * 1.7 + i * (Math.PI * 2 / N) + now / 1400
    const sx = x + Math.cos(ang) * base * 0.62
    const sy = cy + Math.sin(ang) * base * 0.42
    const sz = base * 0.5 * grow * shrink
    ctx.globalAlpha = fadeIn * fadeOut
    ctx.drawImage(img, sx - sz / 2, sy - sz / 2, sz, sz)
  }
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
  // Another 10% smaller (~0.72), plus a breathing pulse between 95% and 100%.
  const pulse = 0.975 + Math.sin(now / 480 + seed) * 0.025
  const s = geo.tileW * 0.72 * pulse
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

/** White angel wings with a thick black outline, drawn BEHIND the ball, to mark
 *  a banked Second Chance. One feathered wing is built then mirrored. Gently
 *  flaps over time. Programmatic placeholder until real wing art lands. */
const drawAngelWings = (ctx: CanvasRenderingContext2D, x: number, cy: number, radius: number, now: number): void => {
  const flap = Math.sin(now / 260) * 0.12
  const drawWing = (dir: 1 | -1): void => {
    ctx.save()
    ctx.translate(x + dir * radius * 0.55, cy - radius * 0.1)
    ctx.scale(dir, 1)
    ctx.rotate(-0.35 + flap)
    // Wing silhouette: a curved spine with three feather scallops.
    const u = radius * 1.5
    ctx.beginPath()
    ctx.moveTo(0, -u * 0.1)
    ctx.quadraticCurveTo(u * 0.55, -u * 0.62, u * 1.05, -u * 0.5) // top edge sweep out
    ctx.quadraticCurveTo(u * 0.78, -u * 0.2, u * 0.95, -u * 0.05) // feather 1
    ctx.quadraticCurveTo(u * 0.66, u * 0.06, u * 0.82, u * 0.22)  // feather 2
    ctx.quadraticCurveTo(u * 0.5, u * 0.28, u * 0.6, u * 0.42)    // feather 3
    ctx.quadraticCurveTo(u * 0.25, u * 0.4, 0, u * 0.2)           // bottom back to root
    ctx.closePath()
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#000000'
    ctx.lineWidth = radius * 0.16        // thick black outline
    ctx.stroke()
    ctx.fillStyle = '#ffffff'
    ctx.fill()
    // Inner feather lines for a touch of definition.
    ctx.strokeStyle = 'rgba(0,0,0,0.45)'
    ctx.lineWidth = radius * 0.05
    ctx.beginPath()
    ctx.moveTo(u * 0.1, u * 0.02); ctx.quadraticCurveTo(u * 0.5, -u * 0.18, u * 0.92, -u * 0.42)
    ctx.stroke()
    ctx.restore()
  }
  drawWing(-1)
  drawWing(1)
}

const POWERUP_COLOR: Record<string, string> = {
  invuln: '#ffd23f', magnet: '#3fa9ff', dodge: '#37e0a0', slowmo: '#b06bff', push: '#ff7a3f'
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

  // Motion trail + aura belong to the rolling ball, not the falling one.
  if (dropT === 0) {
    // Motion trail — faint ghosts trailing opposite the heading.
    const trailDx = -game.dir * geo.halfW * 0.5
    const trailDy = geo.halfH * 0.5
    for (let i = 3; i >= 1; i--) {
      ctx.globalAlpha = 0.10 * i
      ctx.fillStyle = invuln ? '#fff2a8' : '#7fe6a0'
      ctx.beginPath(); ctx.arc(x + trailDx * i * 0.6, cy + trailDy * i * 0.3, radius * (1 - i * 0.12), 0, Math.PI * 2); ctx.fill()
    }
    ctx.globalAlpha = 1

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

    // Second Chance held: white angel wings (thick black outline) behind the
    // ball so the player can see a spare life is banked.
    if (game.secondChance) drawAngelWings(ctx, x, cy, radius, now)
  }

  ctx.save()
  ctx.globalAlpha = alpha

  // Soft contact shadow on the tile — fades away as the ball leaves the surface.
  ctx.fillStyle = `rgba(0,0,0,${0.28 * (1 - dropT)})`
  ctx.beginPath(); ctx.ellipse(x, y + geo.halfH * 0.15, radius * 0.8, radius * 0.4, 0, 0, Math.PI * 2); ctx.fill()

  // Ball body — radial gradient sphere.
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
