import { getCachedImage } from '@/use/useAssets'

/**
 * Pixel-precise island shape extraction.
 *
 * Each island art bitmap has a green grass cap and a brown cliff under
 * it. The playable area = the green region. Approximating that as an
 * ellipse or a hand-traced polygon was visibly off (the grass has
 * scalloped edges and a front overhang that bulges past any smooth
 * curve), and the chain-anchor hit-test felt wrong because of it.
 *
 * This module loads each island bitmap, flood-fills the green region
 * from a known-interior seed, and produces:
 *   - a Uint8Array mask of every walkable pixel — used for O(1)
 *     pixel-perfect anchor hit-tests
 *   - a 128-vertex radial polygon tracing the boundary — used for the
 *     dashed debug outline and the path-generator's edge-along-ray
 *     spacing
 *   - footprint constants (image width/height per island radius,
 *     plus the world anchor in image-norm) so the renderer can
 *     overlay the bitmap on the island centre at the right scale
 *
 * Async timing:
 *   The mask is unavailable until the bitmap decodes (~1 frame). Each
 *   shape ships with a hand-traced fallback polygon so the engine has
 *   coherent geometry at module-init time (stage layouts are baked
 *   then). Runtime queries (isOverIsland, debug outline) silently
 *   swap to the pixel-perfect mask once it's ready — no observable
 *   pop on the user's end because the fallback already approximates
 *   the silhouette closely.
 */

export type IslandShape = 'round' | 'square'

interface ShapeConfig {
  src: string
  /** Image-pixel coord guaranteed to be inside the green grass. The
   *  flood-fill starts here and stops at non-green / transparent. */
  seed: [number, number]
}

const SHAPE_CONFIG: Record<IslandShape, ShapeConfig> = {
  round: { src: '/images/props/island-round-short-cliff_512x512.webp', seed: [256, 200] },
  square: { src: '/images/props/island-square_512x512.webp', seed: [256, 180] }
}

export interface ShapeData {
  /** Boundary polygon in normalized image space (0..1), traced from the
   *  bitmap (or hand-approximated for the pre-load fallback). 128 verts
   *  when extracted, ~14 verts in the fallback. */
  polygon: ReadonlyArray<readonly [number, number]>
  /** Image-norm anchor — where world (isle.cx, isle.cy) maps to. Equals
   *  the mask centroid when extracted from the bitmap. */
  cxNorm: number
  cyNorm: number
  /** World image-width / island radius, so polygon rx = isle.radius. */
  wPerRadius: number
  /** World image-height / island radius. Matches the image's natural
   *  aspect so the bitmap isn't distorted on render. */
  hPerRadius: number
  /** Per-pixel walkable mask, indexed `[x + y * imageW]`. Null until
   *  the bitmap decodes — callers fall back to `polygon` until then. */
  mask: Uint8Array | null
  imageW: number
  imageH: number
}

// ─── Fallback polygons (used until the bitmap finishes decoding) ────────

const FALLBACK_ROUND: ShapeData = {
  polygon: [
    [0.50, 0.10], [0.72, 0.14], [0.89, 0.24], [0.95, 0.38],
    [0.89, 0.52], [0.79, 0.61], [0.61, 0.65], [0.50, 0.66],
    [0.39, 0.65], [0.21, 0.61], [0.11, 0.52], [0.05, 0.38],
    [0.11, 0.24], [0.28, 0.14]
  ],
  cxNorm: 0.5, cyNorm: 0.38,
  wPerRadius: 2.222, hPerRadius: 2.1,
  mask: null, imageW: 512, imageH: 512
}

const FALLBACK_SQUARE: ShapeData = {
  polygon: [
    [0.06, 0.14], [0.20, 0.10], [0.50, 0.10], [0.80, 0.10], [0.94, 0.14],
    [0.94, 0.35], [0.94, 0.55], [0.90, 0.62], [0.75, 0.68],
    [0.50, 0.70], [0.25, 0.68], [0.10, 0.62], [0.06, 0.55], [0.06, 0.35]
  ],
  cxNorm: 0.5, cyNorm: 0.40,
  wPerRadius: 2.276, hPerRadius: 2.276,
  mask: null, imageW: 512, imageH: 512
}

const shapeData: Record<IslandShape, ShapeData> = {
  round: FALLBACK_ROUND,
  square: FALLBACK_SQUARE
}

// ─── Mask extraction ────────────────────────────────────────────────────

/** A pixel counts as walkable grass when it's opaque, dominantly green,
 *  and bright enough to be the lit grass-cap rather than the dark border
 *  outline. Tuned against both island bitmaps; the flood-fill from an
 *  interior seed also stops us from picking up unrelated green pixels. */
const isWalkablePixel = (px: Uint8ClampedArray, idx: number): boolean => {
  const o = idx * 4
  const a = px[o + 3]!
  if (a < 80) return false
  const r = px[o]!
  const g = px[o + 1]!
  const b = px[o + 2]!
  return g > r * 1.05 && g > b * 1.05 && g > 60
}

interface MaskResult {
  mask: Uint8Array
  W: number
  H: number
  minX: number; minY: number; maxX: number; maxY: number
  cx: number; cy: number
}

const extractMask = (img: HTMLImageElement, seed: [number, number]): MaskResult | null => {
  const W = img.naturalWidth
  const H = img.naturalHeight
  if (!W || !H) return null
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(img, 0, 0)
  let data: ImageData
  try {
    data = ctx.getImageData(0, 0, W, H)
  } catch {
    // Cross-origin / private-mode tainting; nothing we can do.
    return null
  }
  const pixels = data.data
  const mask = new Uint8Array(W * H)
  // Iterative flood-fill — recursion blows the stack on 512² images.
  const stack: number[] = [seed[0] + seed[1] * W]
  while (stack.length > 0) {
    const i = stack.pop()!
    if (mask[i]) continue
    if (!isWalkablePixel(pixels, i)) continue
    mask[i] = 1
    const y = (i / W) | 0
    const x = i - y * W
    if (x > 0) stack.push(i - 1)
    if (x < W - 1) stack.push(i + 1)
    if (y > 0) stack.push(i - W)
    if (y < H - 1) stack.push(i + W)
  }
  let minX = W, minY = H, maxX = 0, maxY = 0
  let cxSum = 0, cySum = 0, count = 0
  for (let y = 0; y < H; y++) {
    const row = y * W
    for (let x = 0; x < W; x++) {
      if (mask[row + x]) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
        cxSum += x
        cySum += y
        count++
      }
    }
  }
  if (count === 0) return null
  return {
    mask, W, H, minX, minY, maxX, maxY,
    cx: cxSum / count,
    cy: cySum / count
  }
}

/** Radial trace from the mask centroid — for each of N evenly spaced
 *  angles, walk outward until the ray leaves the mask, then record the
 *  last walkable point. Works because the grass region is star-shaped
 *  relative to its centroid (every ray crosses the boundary exactly
 *  once). 128 rays resolves the scalloped edges nicely without bloating
 *  the polygon. */
const RAY_COUNT = 128
const tracePolygonRadial = (
  mask: Uint8Array, W: number, H: number,
  centerX: number, centerY: number
): Array<[number, number]> => {
  const poly: Array<[number, number]> = []
  const maxT = Math.max(W, H)
  for (let i = 0; i < RAY_COUNT; i++) {
    const angle = (i / RAY_COUNT) * Math.PI * 2
    const dx = Math.cos(angle)
    const dy = Math.sin(angle)
    let lastX = centerX
    let lastY = centerY
    for (let t = 0.5; t < maxT; t += 0.5) {
      const x = centerX + dx * t
      const y = centerY + dy * t
      const px = x | 0
      const py = y | 0
      if (px < 0 || px >= W || py < 0 || py >= H) break
      if (mask[px + py * W]) {
        lastX = x
        lastY = y
      } else {
        break
      }
    }
    poly.push([lastX, lastY])
  }
  return poly
}

const tryExtract = (shape: IslandShape) => {
  const config = SHAPE_CONFIG[shape]
  const img = getCachedImage(config.src)
  if (!img.complete || img.naturalWidth === 0) return
  const result = extractMask(img, config.seed)
  if (!result) return
  const { mask, W, H, minX, maxX, cx, cy } = result
  const polyPx = tracePolygonRadial(mask, W, H, cx, cy)
  // Image footprint: polygon rx (image pixels) maps to isle.radius.
  // hPerRadius preserves the bitmap's natural aspect so it doesn't get
  // squashed on render.
  const rxPx = (maxX - minX) / 2
  shapeData[shape] = {
    polygon: polyPx.map(([x, y]) => [x / W, y / H] as [number, number]),
    cxNorm: cx / W,
    cyNorm: cy / H,
    wPerRadius: W / rxPx,
    hPerRadius: H / rxPx,
    mask,
    imageW: W,
    imageH: H
  }
}

const initShape = (shape: IslandShape) => {
  const config = SHAPE_CONFIG[shape]
  const img = getCachedImage(config.src)
  if (img.complete && img.naturalWidth > 0) {
    tryExtract(shape)
  } else {
    img.addEventListener('load', () => tryExtract(shape), { once: true })
  }
}

initShape('round')
initShape('square')

// ─── Public API ─────────────────────────────────────────────────────────

export const getShapeData = (shape: IslandShape): ShapeData => shapeData[shape]

/** Point-in-island hit-test. Uses the pixel-perfect mask when the
 *  bitmap has decoded; falls back to the hand-traced polygon otherwise.
 *  Either way the geometry is keyed to the same world anchor / footprint
 *  so the swap is invisible to the player. */
export const pointInIsland = (
  shape: IslandShape,
  x: number, y: number,
  cx: number, cy: number, radius: number
): boolean => {
  const d = shapeData[shape]
  const nx = (x - cx) / (radius * d.wPerRadius) + d.cxNorm
  const ny = (y - cy) / (radius * d.hPerRadius) + d.cyNorm
  if (d.mask) {
    const px = (nx * d.imageW) | 0
    const py = (ny * d.imageH) | 0
    if (px < 0 || px >= d.imageW || py < 0 || py >= d.imageH) return false
    return d.mask[px + py * d.imageW] === 1
  }
  return pointInPolygonNorm(d.polygon, nx, ny)
}

const pointInPolygonNorm = (
  poly: ReadonlyArray<readonly [number, number]>,
  nx: number, ny: number
): boolean => {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const vi = poly[i]!, vj = poly[j]!
    if (((vi[1] > ny) !== (vj[1] > ny))
      && (nx < (vj[0] - vi[0]) * (ny - vi[1]) / (vj[1] - vi[1]) + vi[0])) {
      inside = !inside
    }
  }
  return inside
}

/** Distance from the island's anchor to the polygon edge along `angle`
 *  (world-space radians). Used for path-generator spacing so that
 *  consecutive islands sit exactly `WATER_GAP` apart edge-to-edge along
 *  the travel direction — even when the polygon is scalloped. */
export const islandEdgeAlong = (
  shape: IslandShape, radius: number, angle: number
): number => {
  const d = shapeData[shape]
  const imgW = radius * d.wPerRadius
  const imgH = radius * d.hPerRadius
  const dx = Math.cos(angle) / imgW
  const dy = Math.sin(angle) / imgH
  const poly = d.polygon
  let minT = Infinity
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[j]!, b = poly[i]!
    const ex = b[0] - a[0]
    const ey = b[1] - a[1]
    const denom = dx * ey - dy * ex
    if (Math.abs(denom) < 1e-9) continue
    const dx0 = a[0] - d.cxNorm
    const dy0 = a[1] - d.cyNorm
    const t = (dx0 * ey - dy0 * ex) / denom
    const u = (dx0 * dy - dy0 * dx) / denom
    if (t > 0 && u >= 0 && u <= 1 && t < minT) minT = t
  }
  return Number.isFinite(minT) ? minT : radius
}

/** Polygon vertices in world space for a given island — used by the
 *  debug outline and the editor's selection ring. */
export const islandPolygonWorld = (
  shape: IslandShape, cx: number, cy: number, radius: number
): Array<[number, number]> => {
  const d = shapeData[shape]
  const imgW = radius * d.wPerRadius
  const imgH = radius * d.hPerRadius
  return d.polygon.map(([nx, ny]) => [
    cx + (nx - d.cxNorm) * imgW,
    cy + (ny - d.cyNorm) * imgH
  ])
}

/** World-space margins applied to `sampleInsideIsland` so anchors stay
 *  on the FLAT top of the green silhouette, not in the scalloped
 *  overhang at the bottom or against the side-edge bumps. Defaults are
 *  tuned for grass blades; callers placing larger sprites (stumps,
 *  boulders, crystals) pass bigger numbers to keep the sprite body
 *  fully inside the visible ground surface. */
export interface SampleMargin {
  /** Horizontal margin from the polygon's left + right extremes. */
  x?: number
  /** Top margin — accounts for the grass blade's vertical extent above
   *  its anchor (~26 wu for a default cell). */
  top?: number
  /** Bottom margin — large by default to push anchors UP off the
   *  front-overhang scallops, which the polygon counts as walkable but
   *  visually drape over the cliff rock. */
  bot?: number
}

/** Rejection-sample one world-space point inside the polygon. Returns
 *  null on the rare miss; callers fall back to the island centre. */
export const sampleInsideIsland = (
  shape: IslandShape, cx: number, cy: number, radius: number,
  rng: () => number, attempts = 24,
  margin: SampleMargin = {}
): [number, number] | null => {
  const d = shapeData[shape]
  let minN = 1, maxN = 0, minM = 1, maxM = 0
  for (const v of d.polygon) {
    if (v[0] < minN) minN = v[0]
    if (v[0] > maxN) maxN = v[0]
    if (v[1] < minM) minM = v[1]
    if (v[1] > maxM) maxM = v[1]
  }
  const imgWWorld = radius * d.wPerRadius
  const imgHWorld = radius * d.hPerRadius
  // Default world-unit insets, calibrated against the round + square
  // bitmaps so a blade or small obstacle anchor at the inset boundary
  // still looks like it grows out of green grass — not the overhang.
  const mX = margin.x ?? 14
  const mTop = margin.top ?? 32
  const mBot = margin.bot ?? 52
  const insetXNorm = mX / imgWWorld
  const insetTopNorm = mTop / imgHWorld
  const insetBotNorm = mBot / imgHWorld
  const nLo = minN + insetXNorm
  const nHi = maxN - insetXNorm
  const mLo = minM + insetTopNorm
  const mHi = maxM - insetBotNorm
  if (nHi <= nLo || mHi <= mLo) return null
  for (let k = 0; k < attempts; k++) {
    const nx = nLo + rng() * (nHi - nLo)
    const ny = mLo + rng() * (mHi - mLo)
    let inside: boolean
    if (d.mask) {
      const px = (nx * d.imageW) | 0
      const py = (ny * d.imageH) | 0
      inside = px >= 0 && px < d.imageW && py >= 0 && py < d.imageH
        && d.mask[px + py * d.imageW] === 1
    } else {
      inside = pointInPolygonNorm(d.polygon, nx, ny)
    }
    if (inside) {
      return [
        cx + (nx - d.cxNorm) * imgWWorld,
        cy + (ny - d.cyNorm) * imgHWorld
      ]
    }
  }
  return null
}
