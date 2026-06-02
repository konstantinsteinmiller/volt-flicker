// ─── Canvas renderer + VFX for Epicrolla ───────────────────────────────────
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
const ITEM_BOX_SRC = 'images/props/item-box-single_256x256.webp'
const ITEM_SPARKLE_SRC = 'images/props/item-box-sparkles_256x256.webp'
const VORTEX_SRC = 'images/props/vortex_256x256.webp'
const LAVA_SRC = 'images/props/lava_256x256.webp'
const SPIKE_SRC = 'images/props/spiky-pole_256x256.webp'
const LIBERTY_CAT_SRC = 'images/props/liberty-cat.webp'
const BALL_SKIN_SRC = 'images/models/ball-eye-texture.webp'
const WINGS_SRC = 'images/props/wings_260x108.webp'
// 2×2 destructible crate-pile prop.
const CRATE_PILE_SRC = 'images/props/crate-pile_512x512.webp'
// Rift tiles that replace the procedural pit: a single diamond rift for an
// isolated hole, and a 1×2 (two-tile) rift shared by a diagonally-adjacent pair.
const RIFT_SRC = 'images/props/rift_256x256.webp'
const RIFT2_SRC = 'images/props/rift-2-vert-tiles_256x512.webp'

// Gameplay sprites drawn in the renderer's per-frame hot path — decoded before
// first paint so the field never flashes a procedural fallback. The ball SKIN
// is NOT here: only the player's currently-equipped skin is hot-path critical
// (warmed separately by the asset preloader); the rest decode in the background
// after sounds. `BALL_SKIN_SRC` stays as the renderer's default-fallback src.
const TILE_SRCS = [
  ...FLOOR_VARIANTS, ...SPECIAL_VARIANTS,
  COIN_SRC, BOX_SRC, BOULDER_SRC, ITEM_BOX_SRC, ITEM_SPARKLE_SRC, VORTEX_SRC, LAVA_SRC, SPIKE_SRC, LIBERTY_CAT_SRC,
  WINGS_SRC, CRATE_PILE_SRC, RIFT_SRC, RIFT2_SRC
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

/** Decode every grid-tile + gameplay prop before first paint (asset preloader). */
export const warmTileImages = async (): Promise<void> => {
  await Promise.allSettled(TILE_SRCS.map(loadImage))
}

/** Decode arbitrary images THROUGH the renderer's own cache (raw-src keyed, the
 *  same key `getImg` reads), so a warmed sprite is actually a cache HIT when the
 *  renderer draws it. Used by the asset preloader to warm the selected ball skin
 *  in the hot path and the remaining skins in the background. */
export const warmImages = async (srcs: ReadonlyArray<string>): Promise<void> => {
  await Promise.allSettled(srcs.map(loadImage))
}

// ─── Geometry ───────────────────────────────────────────────────────────────

interface Geometry { halfW: number; halfH: number; offsetX: number; tileW: number; tileH: number }
let geo: Geometry = { halfW: 40, halfH: 24, offsetX: 0, tileW: 80, tileH: 48 }

// ─── Best-tile "ghost line" (roadmap #2) ────────────────────────────────────
// A faint dashed marker across the row the personal best reached, shown on the
// idle / lose screen so the player can see the line to beat. Score counts
// diamonds entered going UP from r=0, so the best line sits at row -bestTiles.
let ghostBestTiles = 0
export const setGhostBest = (tiles: number): void => {
  ghostBestTiles = Number.isFinite(tiles) && tiles > 0 ? Math.floor(tiles) : 0
}
const drawGhostLine = (
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  camOffsetY: number
): void => {
  if (ghostBestTiles <= 0 || game.phase === 'playing') return
  const y = -ghostBestTiles * geo.halfH + camOffsetY
  if (!Number.isFinite(y) || y < -40 || y > h + 40) return
  ctx.save()
  ctx.globalAlpha = 0.5
  ctx.strokeStyle = '#ffe066'
  ctx.lineWidth = 2
  ctx.setLineDash([10, 8])
  ctx.beginPath()
  ctx.moveTo(0, y)
  ctx.lineTo(w, y)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.globalAlpha = 0.9
  ctx.fillStyle = '#ffe066'
  ctx.font = '700 12px system-ui, sans-serif'
  ctx.textBaseline = 'bottom'
  ctx.fillText('BEST \u00b7 ' + ghostBestTiles, 10, y - 4)
  ctx.restore()
}

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

// ─── Rift tiles (bitmap replacements for the procedural pit) ─────────────────
//
// A hole renders as the cracked-rift artwork instead of the plain dark pit:
//   • an isolated hole (no diagonally-adjacent hole) → the single diamond rift;
//   • a diagonally-adjacent PAIR → the 1×2 rift sprite, projected across both
//     diamonds and rotated to the pair's axis. The pairing is computed once per
//     frame (`planRifts`); only the pair's root cell draws the shared sprite.

/** Single-diamond rift: same square→diamond projection as a floor tile. Falls
 *  back to the procedural pit until the bitmap has decoded. */
const drawRift = (ctx: CanvasRenderingContext2D, x: number, y: number): void => {
  const dia = getDiamond(RIFT_SRC)
  if (dia) ctx.drawImage(dia, x - dia.width / 2, y - dia.height / 2)
  else drawHole(ctx, x, y)
}

/** Build (and cache) the 1×2 rift projected across two diamonds along one
 *  diagonal. `rotSign` +1 → the "/" axis (up-right/down-left); −1 → the "\" axis
 *  (up-left/down-right). The 256×512 source is drawn as a 1-wide × 2-tall block
 *  so each half lands on one diamond; the result is centred in the canvas. */
const getRiftDouble = (rotSign: 1 | -1): HTMLCanvasElement | null => {
  const key = rotSign > 0 ? '__rift2_pos' : '__rift2_neg'
  const cached = diamondCache.get(key)
  if (cached) return cached
  const img = getImg(RIFT2_SRC)
  if (!ready(img)) return null
  const cw = Math.ceil(geo.tileW * 2) + 2
  const ch = Math.ceil(geo.tileH * 2) + 2
  const cv = document.createElement('canvas')
  cv.width = cw
  cv.height = ch
  const cx = cv.getContext('2d')
  if (!cx) return null
  cx.translate(cw / 2, ch / 2)
  cx.scale(1, geo.tileH / geo.tileW)
  cx.rotate(rotSign * (Math.PI / 4))
  const side = (geo.tileW / Math.SQRT2) * 1.03
  cx.drawImage(img, -side / 2, -side, side, side * 2)
  diamondCache.set(key, cv)
  return cv
}

/** Draw the shared 1×2 rift for a pair: `(dc, dr)` is the partner diamond's
 *  offset from this root (one of ±1,±1). The sprite is centred on the midpoint
 *  between the two diamonds. */
const drawRiftDouble = (ctx: CanvasRenderingContext2D, x: number, y: number, dc: number, dr: number): void => {
  // (+1,+1)/(-1,-1) lie on the "\" axis (rotSign −1); (+1,-1)/(-1,+1) on "/".
  const rotSign: 1 | -1 = dc === dr ? -1 : 1
  const cv = getRiftDouble(rotSign)
  if (!cv) { drawRift(ctx, x, y); return }
  const mx = x + (dc * geo.halfW) / 2
  const my = y + (dr * geo.halfH) / 2
  ctx.drawImage(cv, mx - cv.width / 2, my - cv.height / 2)
}

/** What to draw for each visible hole this frame: a single rift, the shared 1×2
 *  rift (the pair's root → partner offset), or nothing (a paired-away member,
 *  covered by its root's sprite). Greedy diagonal pairing over a deterministic
 *  order so each pair is drawn exactly once. */
type RiftPlan = Map<string, 'single' | 'skip' | { dc: number; dr: number }>
// Diagonal partner search order (upper diagonals first so a pile of holes pairs
// upward consistently).
const RIFT_PAIR_DIRS = [[1, -1], [-1, -1], [1, 1], [-1, 1]] as const
const planRifts = (): RiftPlan => {
  const plan: RiftPlan = new Map()
  const holes: Array<[number, number, string]> = []
  for (const cell of game.cells.values()) {
    if (cell.kind === 'hole') holes.push([cell.c, cell.r, `${cell.c},${cell.r}`])
  }
  // Deterministic order: by row then column, so pairing is stable frame-to-frame.
  holes.sort((a, b) => a[1] - b[1] || a[0] - b[0])
  const claimed = new Set<string>()
  const isHole = (k: string): boolean =>
    game.cells.get(k)?.kind === 'hole'
  for (const [c, r, key] of holes) {
    if (claimed.has(key)) continue
    let paired = false
    for (const [dc, dr] of RIFT_PAIR_DIRS) {
      const pk = `${c + dc},${r + dr}`
      if (!claimed.has(pk) && isHole(pk)) {
        plan.set(key, { dc, dr })
        plan.set(pk, 'skip')
        claimed.add(key)
        claimed.add(pk)
        paired = true
        break
      }
    }
    if (!paired) { plan.set(key, 'single'); claimed.add(key) }
  }
  return plan
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

/** 2×2 crate-pile prop: a single large sprite anchored on the bottom-front
 *  diamond (x, y), rising up to cover the 4-cell cluster. Drawn ONCE per pile
 *  from its anchor cell (see the obstacle pass). */
const drawCratePile = (ctx: CanvasRenderingContext2D, x: number, y: number): void => {
  // Wide contact shadow under the 2×2 footprint.
  ctx.fillStyle = 'rgba(0,0,0,0.32)'
  ctx.beginPath()
  ctx.ellipse(x, y + geo.halfH * 0.2, geo.halfW * 1.12, geo.halfH * 0.78, 0, 0, Math.PI * 2)
  ctx.fill()
  const img = getImg(CRATE_PILE_SRC)
  if (!ready(img)) return
  const w = geo.tileW * 1.32
  const h = w * (img.naturalHeight / img.naturalWidth)
  // Base rests a touch in front of the bottom diamond's centre; the pile rises
  // up over the back cells of the cluster.
  ctx.drawImage(img, x - w / 2, y + geo.halfH * 0.5 - h, w, h)
}

/** Iso obstacle — all kinds are bitmap props now. `jitter` (per-cell, ~0.9–1.1)
 *  varies box/boulder size so the field doesn't look uniform. */
/** Source bitmap backing each obstacle kind (used by both the live renderer and
 *  the shatter snapshot). */
const obstacleSrc = (kind: ObstacleKind): string => {
  if (kind === 'stone') return BOULDER_SRC
  if (kind === 'pyramid') return SPIKE_SRC
  if (kind === 'libertyCat') return LIBERTY_CAT_SRC
  if (kind === 'crate') return CRATE_PILE_SRC
  return BOX_SRC // box + wall both use the box art
}

const drawObstacle = (
  ctx: CanvasRenderingContext2D,
  kind: ObstacleKind,
  x: number,
  y: number,
  jitter = 1,
  googly?: { mood: BoulderMood; lookX: number; lookY: number; now: number }
): void => {
  if (kind === 'box') { drawSpriteProp(ctx, BOX_SRC, x, y, 0.9 * jitter); return }
  if (kind === 'crate') { drawCratePile(ctx, x, y); return }
  if (kind === 'stone') {
    drawSpriteProp(ctx, BOULDER_SRC, x, y, jitter)
    // Googly eyes ride on the boulder's upper face, pupils tracking the ball.
    // They go wide-and-scared when the ball is bearing down on this stone. The
    // anchor is derived from the SPRITE's actual drawn bounds (width = tileW*0.63,
    // height = width × the bitmap's aspect ratio) so the eyes sit on the rock at
    // any per-cell jitter, not floating above it.
    if (googly) {
      const w = geo.tileW * 0.63 * jitter
      const img = getImg(BOULDER_SRC)
      const h = ready(img) ? w * (img.naturalHeight / img.naturalWidth) : w
      const bottom = y + geo.halfH * 0.42
      const eyesCy = bottom - h * 0.52    // ~52% up the boulder = its upper face
      drawGooglyEyes(ctx, x, eyesCy, w, googly.mood, googly.lookX, googly.lookY, googly.now)
    }
    return
  }
  // The old grey procedural block read poorly next to holes — use the box art.
  if (kind === 'wall') { drawSpriteProp(ctx, BOX_SRC, x, y, 1.035 * jitter); return }
  // Liberty Cat → its own upright sprite (late-game spiky-pole replacement).
  if (kind === 'libertyCat') { drawSpriteProp(ctx, LIBERTY_CAT_SRC, x, y, 1.0); return }
  // Pyramid → spiky-pole sprite (the bitmap is already upright; just scale to fit).
  drawSpriteProp(ctx, SPIKE_SRC, x, y, 1.0)
}

type BoulderMood = 'normal' | 'scared' | 'happy'

/** A boulder's googly face: animated eyes, eyebrows and a stone-crack mouth that
 *  re-shape AND move per mood. Pure-canvas, fully procedural.
 *   • normal — eyes track the ball, slow idle blink, gently bobbing flat brows,
 *     a neutral jagged crack mouth.
 *   • scared — wide eyes + pinpoint shaking pupils, trembling worried "/\" brows,
 *     a chattering open oval mouth (all jitter per-frame). Held 1.5s on a crash.
 *   • happy  — squashed "^_^" smiling eyes (upper lid arcs down over the eye),
 *     bouncing raised brows, rosy cheeks, and a wide grin that pulses; used on
 *     nearby boulders after the player dies. */
const drawGooglyEyes = (
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  bodyW: number,
  mood: BoulderMood,
  lookX: number,
  lookY: number,
  now: number
): void => {
  const scared = mood === 'scared'
  const happy = mood === 'happy'
  const ink = '#1a1410'
  const inkR = Math.max(1, bodyW * 0.012)
  const gap = bodyW * 0.221                           // eye spacing (closer together)
  const eyeR = bodyW * (scared ? 0.168 : 0.1395)     // base white radius (bigger when scared)

  // ── Shared animation drivers ──
  // Scared: fast nervous tremble (shared by pupils, brows, mouth).
  const trem = bodyW * 0.022
  const tremX = scared ? Math.sin(now / 40) * trem : 0
  const tremY = scared ? Math.cos(now / 33) * trem : 0
  // Happy: a gentle bounce so the whole face feels alive/giddy.
  const bounce = happy ? Math.sin(now / 180) : 0
  // Normal: slow idle blink — eyes briefly close every few seconds.
  const blink = (!scared && !happy) ? Math.max(0, Math.sin(now / 1500) - 0.94) / 0.06 : 0 // 0..1 pulse

  // ── Eyes ──
  const len = Math.hypot(lookX, lookY) || 1
  const dirX = happy ? 0 : lookX / len
  const dirY = happy ? -0.4 : lookY / len

  for (const side of [-1, 1] as const) {
    const ex = cx + side * gap
    const ey = cy + (happy ? bounce * bodyW * 0.01 : 0)

    if (happy) {
      // Smiling "^_^" eye: a downward-curving upper-lid arc (closed-happy look),
      // drawn as a thick stroke. The arc deepens with the bounce so it "laughs".
      const half = eyeR * 1.05
      const lift = eyeR * (0.55 + bounce * 0.08)
      ctx.beginPath()
      ctx.moveTo(ex - half, ey + eyeR * 0.18)
      ctx.quadraticCurveTo(ex, ey - lift, ex + half, ey + eyeR * 0.18)
      ctx.lineWidth = Math.max(2, bodyW * 0.03)
      ctx.strokeStyle = ink
      ctx.lineCap = 'round'
      ctx.stroke()
      continue
    }

    // White — vertically squashed during a blink (normal) so the lid "closes".
    const ry = eyeR * 1.12 * (1 - blink * 0.85)
    ctx.beginPath()
    ctx.ellipse(ex, ey, eyeR, Math.max(eyeR * 0.12, ry), 0, 0, Math.PI * 2)
    ctx.fillStyle = '#ffffff'
    ctx.fill()
    ctx.lineWidth = inkR
    ctx.strokeStyle = 'rgba(0,0,0,0.55)'
    ctx.stroke()

    if (blink > 0.5) continue // pupil hidden mid-blink

    // Pupil — pinpoint + jitter when scared, otherwise tracks the ball.
    const pupilR = eyeR * (scared ? 0.32 : 0.52)
    const maxShift = eyeR - pupilR - bodyW * 0.012
    const px = ex + dirX * maxShift + tremX
    const py = ey + dirY * maxShift + tremY
    ctx.beginPath(); ctx.arc(px, py, pupilR, 0, Math.PI * 2)
    ctx.fillStyle = '#111418'; ctx.fill()
    // Catch-light.
    ctx.beginPath(); ctx.arc(px - pupilR * 0.3, py - pupilR * 0.3, pupilR * 0.34, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fill()
  }

  // ── Rosy cheeks (happy only) — under the eyes, sells the smile ──
  if (happy) {
    ctx.fillStyle = 'rgba(255,120,110,0.45)'
    for (const side of [-1, 1] as const) {
      ctx.beginPath()
      ctx.ellipse(cx + side * gap * 1.05, cy + eyeR * 0.95, eyeR * 0.4, eyeR * 0.26, 0, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // ── Eyebrows (all moods, animated) ──
  ctx.strokeStyle = ink
  ctx.lineWidth = Math.max(1.5, bodyW * 0.024)
  ctx.lineCap = 'round'
  const bw = eyeR * 0.95
  for (const side of [-1, 1] as const) {
    const ex = cx + side * gap
    ctx.beginPath()
    if (scared) {
      // Trembling worried "/\" — inner end lower than outer, jittering.
      const browY = cy - eyeR * 1.6 + tremY * 0.6
      ctx.moveTo(ex - side * bw * 0.5 + tremX * 0.4, browY - bw * 0.30)
      ctx.lineTo(ex + side * bw * 0.5 + tremX * 0.4, browY + bw * 0.20)
    } else if (happy) {
      // High, lively arch that bobs up with the bounce.
      const browY = cy - eyeR * 2.05 - bounce * bodyW * 0.018
      ctx.moveTo(ex - bw * 0.55, browY + bw * 0.18)
      ctx.quadraticCurveTo(ex, browY - bw * 0.45, ex + bw * 0.55, browY + bw * 0.18)
    } else {
      // Neutral flat brow with a slow, subtle idle bob.
      const browY = cy - eyeR * 1.5 + Math.sin(now / 900 + side) * bodyW * 0.006
      ctx.moveTo(ex - bw * 0.5, browY + bw * 0.05)
      ctx.lineTo(ex + bw * 0.5, browY - bw * 0.05)
    }
    ctx.stroke()
  }

  // ── Mouth: a stone crack that re-shapes AND animates per mood ──
  ctx.strokeStyle = ink
  ctx.lineWidth = Math.max(1.5, bodyW * 0.022)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  const mouthW = gap * 1.2
  if (scared) {
    // Chattering open "oh no" — an oval whose height pulses fast + jitters.
    const mouthY = cy + eyeR * 1.95 + tremY * 0.5
    const chatter = 0.5 + 0.5 * Math.abs(Math.sin(now / 70))
    ctx.beginPath()
    ctx.ellipse(cx + tremX * 0.5, mouthY, mouthW * 0.3, eyeR * (0.28 + chatter * 0.5), 0, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(20,18,14,0.55)'; ctx.fill()
    ctx.stroke()
  } else if (happy) {
    // Wide upward grin that pulses with the bounce; jagged so it reads as stone.
    const mouthY = cy + eyeR * 1.9
    const grin = eyeR * (0.5 + (bounce + 1) * 0.12)
    ctx.beginPath()
    ctx.moveTo(cx - mouthW * 0.55, mouthY - eyeR * 0.12)
    ctx.lineTo(cx - mouthW * 0.2, mouthY + grin)
    ctx.lineTo(cx + mouthW * 0.18, mouthY + grin * 1.05)
    ctx.lineTo(cx + mouthW * 0.55, mouthY - eyeR * 0.14)
    ctx.stroke()
  } else {
    // Neutral jagged horizontal crack (a slight zig-zag, no curve).
    const mouthY = cy + eyeR * 1.85
    ctx.beginPath()
    ctx.moveTo(cx - mouthW * 0.5, mouthY - eyeR * 0.06)
    ctx.lineTo(cx - mouthW * 0.15, mouthY + eyeR * 0.1)
    ctx.lineTo(cx + mouthW * 0.18, mouthY - eyeR * 0.08)
    ctx.lineTo(cx + mouthW * 0.5, mouthY + eyeR * 0.06)
    ctx.stroke()
  }
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

const drawItemBox = (ctx: CanvasRenderingContext2D, x: number, y: number, now: number, seed = 0, lucky = false): void => {
  const bob = Math.sin(now / 260 + seed) * geo.halfH * 0.2
  const cy = y - geo.tileH * 0.5 + bob
  const base = geo.tileW * 0.624 // 20% smaller so the sparkles read clearly
  const wobble = 0.975 + Math.sin(now / 320 + seed) * 0.025 // gentle 95%→100%→95% breathing

  // Glow halo. A LUCKY box telegraphs its rare double-duration drop with
  // expanding rainbow-hued pulse rings radiating outward (no flat ellipse).
  if (lucky) {
    ctx.save()
    ctx.globalCompositeOperation = 'lighter' // additive — rings glow, don't muddy
    const PERIOD = 1100 // ms for one pulse ring to expand + fade
    const RINGS = 3     // staggered rings in flight at once
    for (let i = 0; i < RINGS; i++) {
      const t = (((now / PERIOD) + i / RINGS) % 1) // 0→1 life of this ring
      const rr = base * (0.5 + t * 1.3)            // expand outward from the box
      const fade = (1 - t) * 0.7                   // fade as it grows
      if (fade <= 0) continue
      // Cycle the hue over time + per ring so it sweeps the rainbow.
      const hue = (now / 12 + seed * 60 + i * 120) % 360
      ctx.globalAlpha = fade
      ctx.strokeStyle = `hsl(${hue}, 100%, 60%)`
      ctx.lineWidth = Math.max(1.5, base * 0.12 * (1 - t))
      ctx.beginPath(); ctx.arc(x, cy, rr, 0, Math.PI * 2); ctx.stroke()
    }
    // Soft rainbow core glow so the box centre reads as special too.
    const coreHue = (now / 12 + seed * 60) % 360
    const cg = ctx.createRadialGradient(x, cy, 2, x, cy, base * 0.8)
    cg.addColorStop(0, `hsla(${coreHue}, 100%, 65%, 0.55)`)
    cg.addColorStop(1, `hsla(${coreHue}, 100%, 65%, 0)`)
    ctx.globalAlpha = 1
    ctx.fillStyle = cg
    ctx.beginPath(); ctx.arc(x, cy, base * 0.8, 0, Math.PI * 2); ctx.fill()
    ctx.restore()
  } else {
    const glow = ctx.createRadialGradient(x, cy, 2, x, cy, base * 0.95)
    glow.addColorStop(0, 'rgba(255,255,255,0.5)')
    glow.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = glow
    ctx.beginPath(); ctx.arc(x, cy, base * 0.95, 0, Math.PI * 2); ctx.fill()
  }

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
  // The swirl art reads as pulling INWARD only when spun the matching way; the
  // previous sign rotated it against the swirl, so it looked like it was pushing
  // out. Negate to match the vortex texture's swirl direction.
  ctx.rotate(-dir * (now / speed) + phase)
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
const drawLava = (ctx: CanvasRenderingContext2D, c: number, r: number, x: number, y: number, now: number): void => {
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
  // Spawn drifting steam from this (live) lava cell. Called every frame the cell
  // is drawn; the spawner self-throttles. A destroyed lava cell stops being drawn
  // → stops spawning, while already-airborne puffs finish rising and fade.
  spawnLavaSteam(c, r, x, y, now)
}

// ─── Lava steam / fog ───────────────────────────────────────────────────────
//
// Soft puffs that rise + fade above each live lava field. Emitted only while the
// lava cell is being drawn (i.e. still exists); once the lava is destroyed it's
// no longer in `game.cells`, so no new puffs spawn and the field stops steaming.
interface SteamPuff { x: number; y: number; bornAt: number; life: number; r0: number; drift: number; seed: number }
const steamPuffs: SteamPuff[] = []
// Last-spawn game-clock per lava cell key, so each field emits at a steady, low
// rate regardless of frame rate / how many cells are on screen.
const lastSteamAt = new Map<string, number>()
const STEAM_INTERVAL_MS = 420  // one puff per cell roughly every ~0.4s
const STEAM_LIFE_MS = 3400     // slower drift → longer, lazier life
const STEAM_MAX = 90           // hard cap so the array can't grow unbounded

const spawnLavaSteam = (c: number, r: number, x: number, y: number, now: number): void => {
  const key = `${c},${r}`
  const last = lastSteamAt.get(key) ?? -Infinity
  if (now - last < STEAM_INTERVAL_MS) return
  // Prune stale per-cell timers so the map can't grow unbounded over a long run
  // (cells scroll off + are culled; their keys would otherwise linger forever).
  if (lastSteamAt.size > 64) {
    for (const [k, t] of lastSteamAt) if (now - t > STEAM_INTERVAL_MS * 4) lastSteamAt.delete(k)
  }
  lastSteamAt.set(key, now)
  if (steamPuffs.length >= STEAM_MAX) steamPuffs.shift()
  steamPuffs.push({
    x: x + (Math.random() - 0.5) * geo.halfW * 0.55,
    y: y - geo.halfH * 0.1,
    bornAt: now,
    life: STEAM_LIFE_MS * (0.8 + Math.random() * 0.4),
    r0: geo.halfW * (0.16 + Math.random() * 0.08), // small puff to start
    drift: (Math.random() - 0.5) * geo.halfW * 0.35, // gentle horizontal sway target
    seed: Math.random() * 6.283
  })
}

/** Draw + age all live steam puffs. Each rises, expands, and fades over its
 *  lifetime; expired puffs are culled. Drawn on top of the floor so the fog
 *  reads above the lava but under props/ball. */
const drawLavaSteam = (ctx: CanvasRenderingContext2D, now: number): void => {
  if (steamPuffs.length === 0) return
  ctx.save()
  for (let i = steamPuffs.length - 1; i >= 0; i--) {
    const p = steamPuffs[i]!
    const t = (now - p.bornAt) / p.life
    if (t >= 1) { steamPuffs.splice(i, 1); continue }
    // Rise only ~half a grid tile high (was 1.6 tiles), and slower — it hovers
    // just over its own lava cell instead of streaming up the screen.
    const rise = geo.tileH * 0.5 * t
    const sway = Math.sin(now / 700 + p.seed) * p.drift * t
    const radius = p.r0 * (1 + t * 1.0)              // gentle expansion
    // Reddish, more opaque so it reads as heat-haze rising off the lava.
    const alpha = (t < 0.2 ? t / 0.2 : 1 - (t - 0.2) / 0.8) * 0.5
    const px = p.x + sway
    const py = p.y - rise
    const g = ctx.createRadialGradient(px, py, 0, px, py, radius)
    g.addColorStop(0, `rgba(255,120,70,${alpha})`)
    g.addColorStop(0.6, `rgba(220,90,55,${alpha * 0.6})`)
    g.addColorStop(1, 'rgba(200,80,50,0)')
    ctx.fillStyle = g
    ctx.beginPath(); ctx.arc(px, py, radius, 0, Math.PI * 2); ctx.fill()
  }
  ctx.restore()
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

// ─── Stage-start drop-in bounce ─────────────────────────────────────────────
//
// On every stage (re)load the ball falls in from two ball-heights up and bounces
// for ~600ms before settling — a small "ready!" attention grab. Driven by
// performance.now() (NOT game.clock, which is frozen while the run is idle).
const DROP_IN_MS = 600
let dropInStart = -Infinity
/** Trigger the drop-in bounce; called from `resetForStage`. Also clears any
 *  lingering lava steam AND the boulder fright state from the previous stage so
 *  the fresh field starts dry and calm. */
export const triggerBallDropIn = (): void => {
  dropInStart = performance.now()
  steamPuffs.length = 0
  lastSteamAt.clear()
  bouldersFrightened = false
  crashDeathAt = 0
  boulderScaredUntil.clear()
}

// ─── Boulder collective fright (googly-eye reaction) ────────────────────────
//
// When ANY stone/box is destroyed on-screen, every googly-eyed boulder visible
// gets scared and STAYS scared until the player dies (which resets the stage via
// `triggerBallDropIn`). Detected from the obstacle `'shatter'` FX the game emits
// on every destruction (invuln smash, Push Force, Rolling Boulder, Racer). We
// latch on a freshly-spawned shatter event rather than re-arming every frame.
let bouldersFrightened = false
// performance.now() of the frame the ball blew up (crash death). The boulder the
// ball crashed INTO stays scared for CRASH_SCARE_MS after that even though the
// player is dead, so the terrified face is actually readable; the OTHER boulders
// go happy immediately. 0 = no crash this run.
let crashDeathAt = 0
const CRASH_SCARE_MS = 1500
// Per-cell scared hold: keyed `c,r` → performance.now() until which that boulder
// stays scared. Set when the ball is closing on it so a brief approach-fright
// lingers a beat instead of flickering off the instant the ball moves on.
const boulderScaredUntil = new Map<string, number>()
const CLOSE_SCARE_HOLD_MS = 600

/** Penner easeOutBounce: 0 (just dropped) → 1 (settled), with 3 diminishing
 *  bounces — the canonical bounce-landing curve. */
const easeOutBounce = (t: number): number => {
  const n1 = 7.5625, d1 = 2.75
  if (t < 1 / d1) return n1 * t * t
  if (t < 2 / d1) { t -= 1.5 / d1; return n1 * t * t + 0.75 }
  if (t < 2.5 / d1) { t -= 2.25 / d1; return n1 * t * t + 0.9375 }
  t -= 2.625 / d1; return n1 * t * t + 0.984375
}

/** Current drop-in vertical lift in px (negative = airborne, 0 = settled). */
const dropInLift = (now: number): number => {
  const t = (now - dropInStart) / DROP_IN_MS
  if (t < 0 || t >= 1) return 0
  const fall = geo.halfH * 1.05 * 4 // two ball-heights (diameter × 2)
  return -fall * (1 - easeOutBounce(t))
}

const drawBall = (ctx: CanvasRenderingContext2D, x: number, y: number, now: number, dropT = 0, lift = 0): void => {
  const baseRadius = geo.halfH * 1.05
  // While dropping the ball sinks below the surface, shrinks, and fades out as
  // it disappears into the pit. The hole's front lip (drawn afterwards) hides
  // its lower half so it reads as falling in rather than floating across.
  const radius = baseRadius * (1 - 0.6 * dropT)
  // `lift` (px, negative = airborne) is the stage-start drop-in bounce offset —
  // the ball falls in from above and bounces before settling. Applied to the
  // ball body + shadow scale only, so the contact shadow stays on the tile.
  const cy = y - baseRadius * 0.75 + dropT * baseRadius * 1.9 + lift
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

  // Soft contact shadow on the tile — fades away as the ball leaves the surface,
  // and shrinks/dims while the ball is airborne during the drop-in bounce.
  const airT = Math.min(1, -lift / (baseRadius * 4)) // 0 grounded → 1 at apex
  const shadowScale = 1 - 0.45 * airT
  ctx.fillStyle = `rgba(0,0,0,${0.28 * (1 - dropT) * (1 - 0.5 * airT)})`
  ctx.beginPath(); ctx.ellipse(x, y + geo.halfH * 0.15, radius * 0.8 * shadowScale, radius * 0.4 * shadowScale, 0, 0, Math.PI * 2); ctx.fill()

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

// ─── Wings shatter (tears the angel-wings sprite into flying wedges) ─────────
//
// When a held Second Chance is spent, the wings break apart with the same
// pie-wedge tear language as the ball/obstacle death. Snapshots the WINGS_SRC
// bitmap at its on-ball draw size into an offscreen canvas, then slices it.
const WINGS_SHARD_COUNT = 10
const WINGS_SHATTER_MS = 700
let wingsShatter: BallShatter | null = null
let prevWingsBreakAt = 0

/** Render the wings sprite centred into a square offscreen canvas so it can be
 *  sliced into shards. `radius` is the ball radius (wings are radius*3.4 wide). */
const renderWingsSnapshot = (radius: number): { canvas: HTMLCanvasElement; size: number } | null => {
  const img = getImg(WINGS_SRC)
  if (!ready(img)) return null
  const w = radius * 3.4
  const h = w * (img.naturalHeight / img.naturalWidth)
  const size = Math.ceil(Math.max(w, h)) + 6
  const cv = document.createElement('canvas')
  cv.width = size; cv.height = size
  const cx = cv.getContext('2d')
  if (!cx) return null
  const c = size / 2
  cx.drawImage(img, c - w / 2, c - h / 2, w, h)
  return { canvas: cv, size }
}

const spawnWingsShatter = (x: number, y: number, radius: number, now: number): void => {
  const snap = renderWingsSnapshot(radius)
  if (!snap) return
  const shards: BallShard[] = []
  const N = WINGS_SHARD_COUNT
  // The wedge radius spans the (wider) wings snapshot, not the ball.
  const wedgeR = snap.size / 2
  for (let i = 0; i < N; i++) {
    const a0 = (i / N) * Math.PI * 2
    const a1 = ((i + 1) / N) * Math.PI * 2
    const mid = (a0 + a1) / 2
    shards.push({
      a0, a1,
      // Bias the spread sideways so feathers scatter outward like wings, not up.
      fly: mid + (Math.random() - 0.5) * 0.6,
      dist: wedgeR * (1.6 + Math.random() * 2.2),
      rot: (Math.random() - 0.5) * 0.8,
      spin: (Math.random() - 0.5) * 7
    })
  }
  wingsShatter = { canvas: snap.canvas, size: snap.size, x, y, radius: wedgeR, bornAt: now, shards }
}

/** Draw the active wings-shatter shards for this frame; clears when expired. */
const drawWingsShatter = (ctx: CanvasRenderingContext2D, now: number): void => {
  if (!wingsShatter) return
  const t = (now - wingsShatter.bornAt) / WINGS_SHATTER_MS
  if (t >= 1) { wingsShatter = null; return }
  const ease = 1 - (1 - t) * (1 - t)
  const { canvas, size, x, y, radius, shards } = wingsShatter
  const half = size / 2
  for (const s of shards) {
    const dist = s.dist * ease
    const px = x + Math.cos(s.fly) * dist
    const py = y + Math.sin(s.fly) * dist * 0.72 + t * t * radius * 1.2 // gentle gravity
    const scale = 1 - 0.5 * t
    ctx.save()
    ctx.globalAlpha = Math.max(0, 1 - t)
    ctx.translate(px, py)
    ctx.rotate(s.rot + s.spin * t)
    ctx.scale(scale, scale)
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

  // Latch the collective boulder fright: an obstacle `'shatter'` FX present in
  // the live list means a box/stone/… was just destroyed on screen → every
  // googly boulder stays scared until the next stage reset (`triggerBallDropIn`,
  // which fires on death/restart and clears the flag). Once latched it stays on,
  // so we stop scanning; the FX list is culled within ~900ms regardless.
  if (!bouldersFrightened) {
    for (const fx of game.fx) {
      if (fx.kind === 'shatter') { bouldersFrightened = true; break }
    }
  }

  const camOffsetY = h * 0.64 - game.ballR * geo.halfH
  const ballPos = project(game.ballC, game.ballR, camOffsetY)
  const ballY = ballPos.y - geo.halfH * 1.05 * 0.75

  const rTop = Math.floor((-geo.tileH - camOffsetY) / geo.halfH) - 1
  const rBottom = Math.ceil((h + geo.tileH - camOffsetY) / geo.halfH) + 1

  // Rift bitmap layout for this frame's holes (single vs. shared 1×2 pair).
  const riftPlan = planRifts()

  // Pass 1 — floor + holes (back to front).
  for (let r = rTop; r <= rBottom; r++) {
    for (let c = 0; c <= C_MAX; c++) {
      if (((c + r) & 1) !== 0) continue
      const { x, y } = project(c, r, camOffsetY)
      const cell = game.cells.get(`${c},${r}`)
      if (cell && cell.kind === 'hole') {
        const plan = riftPlan.get(`${c},${r}`)
        if (plan === 'skip') { /* covered by its pair root's shared sprite */ }
        else if (plan && typeof plan === 'object') drawRiftDouble(ctx, x, y, plan.dc, plan.dr)
        else drawRift(ctx, x, y)
      }
      else if (cell && cell.kind === 'lava') drawLava(ctx, c, r, x, y, now)
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
        // Crate-pile: one sprite covers all four cells. Draw it ONLY from the
        // bottom-front anchor cell (the front-most, so it sorts on top of the
        // back members) and skip the other three.
        if (k === 'crate') {
          if (cell.crateBC !== c || cell.crateBR !== r) continue
          drawables.push({ r, fn: () => drawCratePile(ctx, x, y) })
          continue
        }
        const jitter = 1 + ((hash(c, r) % 21) - 10) / 100 // ±10% per-cell size variance
        // Stones get a googly face that follows the ball. Mood:
        //  • happy  — the player has died (boulder survived → relieved/gleeful),
        //  • scared — the ball is bearing down on this stone (next target, closing
        //    in — about to crash / get pushed/smashed) OR any obstacle was just
        //    destroyed on screen (`bouldersFrightened`, held until the next reset),
        //  • normal — otherwise.
        let googly: { mood: BoulderMood; lookX: number; lookY: number; now: number } | undefined
        if (k === 'stone') {
          const bp = project(game.ballC, game.ballR, camOffsetY)
          const key = `${c},${r}`
          // Scared while the ball is rolling AT this stone, up to TWO tiles away
          // along the current heading — not only once it's about to crash. That
          // covers the immediate target (1 tile) AND the predicted next landing
          // one hop further (bouncing off the field edges), giving the player a
          // long lead to witness its fear of being collided with. A short hold
          // (CLOSE_SCARE_HOLD_MS) keeps the fright from flickering as it passes.
          const closingTarget = game.target.c === c && game.target.r === r
          let predC = game.target.c + game.dir
          if (predC < 0 || predC > C_MAX) predC = game.target.c - game.dir // edge bounce
          const closingNext = predC === c && game.target.r - 1 === r
          const closing = closingTarget || closingNext
          if (closing && game.phase === 'playing') {
            boulderScaredUntil.set(key, now + CLOSE_SCARE_HOLD_MS)
            // Prune expired holds so the map can't grow as cells scroll off.
            if (boulderScaredUntil.size > 48) {
              for (const [k, t] of boulderScaredUntil) if (t <= now) boulderScaredUntil.delete(k)
            }
          }
          const heldScared = (boulderScaredUntil.get(key) ?? 0) > now
          // Is this the boulder the ball just crashed into? (Its cell sits within
          // ~1 tile of the ball's final resting position.) That one stays scared
          // through CRASH_SCARE_MS after death; the rest celebrate.
          const isCrashVictim = crashDeathAt > 0
            && Math.abs(game.ballC - c) <= 1.2 && Math.abs(game.ballR - r) <= 1.2
          let mood: BoulderMood
          if (game.phase === 'dead') {
            mood = (isCrashVictim && now - crashDeathAt < CRASH_SCARE_MS) ? 'scared' : 'happy'
          } else {
            mood = (heldScared || bouldersFrightened) ? 'scared' : 'normal'
          }
          // Per-boulder animation desync so the faces don't move in lockstep: a
          // stable per-cell phase (it starts slightly later) plus a shortened
          // cycle (up to 30% faster). Only the ANIMATION clock is varied — the
          // mood + pupil aim still use the real `now`.
          const aseed = hash(c, r)
          const animPhase = aseed % 2000                            // 0..2000ms later start
          const animLen = 1 - (((aseed >>> 11) % 1000) / 1000) * 0.3 // 0.70..1.0× length
          const animNow = (now + animPhase) / animLen
          googly = { mood, lookX: bp.x - x, lookY: (bp.y - geo.tileH * 0.5) - y, now: animNow }
        }
        const g = googly
        drawables.push({ r, fn: () => drawObstacle(ctx, k, x, y, jitter, g) })
      } else if (cell.kind === 'coin' && !cell.collected) {
        drawables.push({ r: r + 0.1, fn: () => drawCoinSprite(ctx, x, y - geo.tileH * 0.4 + Math.sin(now / 240 + c) * geo.halfH * 0.15, geo.halfW * 0.7) })
      } else if (cell.kind === 'item') {
        const seed = (hash(c, r) % 997) / 159
        const lucky = cell.lucky === true
        drawables.push({ r: r + 0.1, fn: () => drawItemBox(ctx, x, y, now, seed, lucky) })
      }
    }
  }
  const dropT = game.dropping ? Math.min(1, game.dropClock / DROP_MS) : 0

  // The frame the ball blows up on an obstacle/lava: snapshot it and spawn the
  // tear-apart shards (matches the ball geometry used in `drawBall`).
  const deathRadius = geo.halfH * 1.05
  const deathCy = ballPos.y - deathRadius * 0.75
  if (game.exploded && !prevExploded) {
    spawnBallShatter(ballPos.x, deathCy, deathRadius, now)
    // Mark the crash so the boulder the ball hit holds its terrified face for
    // CRASH_SCARE_MS (the player is dead, but we keep that one scared a beat so
    // the reaction reads) — the surrounding boulders flip to happy immediately.
    crashDeathAt = now
  }
  prevExploded = game.exploded

  // The frame a held Second Chance is spent: tear the angel wings apart.
  if (game.wingsBreakAt !== prevWingsBreakAt) {
    if (game.wingsBreakAt !== 0) spawnWingsShatter(ballPos.x, deathCy, deathRadius, now)
    prevWingsBreakAt = game.wingsBreakAt
  }

  // Stage-start drop-in bounce — suppressed while sinking into a hole or after
  // a blow-up so it never fights those animations.
  const lift = (game.dropping || game.exploded) ? 0 : dropInLift(now)

  // Renders the player ball, with the pit-clip applied while it's dropping.
  const paintBall = (): void => {
    if (!game.dropping) { drawBall(ctx, ballPos.x, ballPos.y, now, dropT, lift); return }
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
  drawGhostLine(ctx, w, h, camOffsetY) // best-tile marker (#2)
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

  // Lava steam — drifts up above the field + props (spawned in `drawLava`).
  drawLavaSteam(ctx, now)

  if (inTeleportSlow) {
    drawTeleportSpotlight(ctx, w, h, ballPos.x, ballPos.y - geo.halfH * 1.05 * 0.75)
    if (ballIsDrawable) paintBall()
    drawTeleportBlinks(ctx, ballPos.x, ballPos.y - geo.halfH * 1.05 * 0.75, now, slowLeft)
  }

  // Tear-apart shards of the destroyed ball (under the explosion FX).
  drawBallShatter(ctx, now)
  // Tear-apart shards of broken angel wings (spent Second Chance).
  drawWingsShatter(ctx, now)

  // Pass 3 — FX on top.
  for (const fx of game.fx) drawFx(ctx, fx, camOffsetY, ballPos.x, ballY, now)

  // Pass 4 — full-screen "juice" overlays (roadmap #14).
  drawSpeedLines(ctx, w, h, now)
  drawPowerupPulse(ctx, w, h)
}

// ─── Speed lines (roadmap #14) ───────────────────────────────────────────────
//
// Above a speed threshold, faint vertical streaks rush down the screen edges to
// sell velocity. Intensity (count + opacity) scales with how fast the ball is
// going; nothing draws at calm speeds so slow play stays clean.
const SPEED_LINE_MIN = 5.2 // diamonds/sec before any streaks appear
const SPEED_LINE_MAX = 8   // matches MAX_SPEED — full intensity
const drawSpeedLines = (ctx: CanvasRenderingContext2D, w: number, h: number, now: number): void => {
  if (game.phase !== 'playing') return
  const frac = (game.speed - SPEED_LINE_MIN) / (SPEED_LINE_MAX - SPEED_LINE_MIN)
  if (frac <= 0) return
  const intensity = Math.min(1, frac)
  const count = Math.round(4 + intensity * 8)
  const lineH = h * (0.12 + intensity * 0.12)
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.strokeStyle = `rgba(255,255,255,${0.05 + intensity * 0.12})`
  ctx.lineWidth = 2
  for (let i = 0; i < count; i++) {
    // Deterministic per-streak x near the left/right margins; scroll downward.
    const seed = i * 97.13
    const side = i % 2 === 0 ? 0 : 1
    const margin = w * 0.16
    const x = side === 0
      ? (seed % margin)
      : w - (seed % margin)
    const speedPx = h * (0.6 + intensity) // px/sec scroll
    const yStart = ((now / 1000 * speedPx + seed * 7) % (h + lineH)) - lineH
    ctx.beginPath()
    ctx.moveTo(x, yStart)
    ctx.lineTo(x, yStart + lineH)
    ctx.stroke()
  }
  ctx.restore()
}

// ─── Power-up pickup chromatic pulse (roadmap #14) ───────────────────────────
//
// A brief RGB-split vignette flash radiating from the screen edges the instant a
// power-up is grabbed (`game.powerupFlashAt`). Hue sweeps over the short life so
// it reads as a chromatic pop, not a flat colour.
const POWERUP_PULSE_MS = 320
const drawPowerupPulse = (ctx: CanvasRenderingContext2D, w: number, h: number): void => {
  if (!game.powerupFlashAt) return
  const age = game.clock - game.powerupFlashAt
  if (age < 0 || age > POWERUP_PULSE_MS) return
  const t = age / POWERUP_PULSE_MS // 0 → 1
  const alpha = (1 - t) * 0.5
  const hue = (t * 300) % 360
  const cx = w / 2, cy = h / 2
  const inner = Math.min(w, h) * (0.35 + t * 0.15)
  const outer = Math.hypot(w, h) / 2
  const g = ctx.createRadialGradient(cx, cy, inner, cx, cy, outer)
  g.addColorStop(0, `hsla(${hue}, 100%, 60%, 0)`)
  g.addColorStop(1, `hsla(${hue}, 100%, 60%, ${alpha})`)
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
  ctx.restore()
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
