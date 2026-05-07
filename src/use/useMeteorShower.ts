// ─── Meteor Shower (precomputed, GPU-friendly) ─────────────────────────────
//
// Plays a brief, dense storm of small fast meteors during the 3-2-1
// stage-start countdown. Performance design:
//
//  • Particles live in `Float32Array` parallel arrays so the per-frame
//    inner loop touches no allocations and stays cache-friendly.
//  • An offscreen "trail" canvas is the actual render target. Each frame
//    we fade it down by ~22% and draw the new meteor heads on top, then
//    `drawImage` the trail buffer onto the live canvas in a single call.
//    The visible long, smooth trails are an artifact of the fade — no
//    per-meteor stroke / per-segment shader work involved.
//  • The particle pool is regenerated only when the canvas size or the
//    orientation changes. Stage-to-stage re-entries reuse the same pool.
//  • Color is an orange/yellow gradient so the meteors read as burning
//    atmospheric entry, not generic sparks.
//
// Public API:
//   precomputeMeteorShower(w, h)  — call on resize / orientation change
//   startMeteorShower()           — kick off (called by useNexusGame on countdown)
//   stopMeteorShower()            — fade out + clear
//   isMeteorShowerActive          — reactive flag
//   renderMeteorShower(ctx)       — one frame; cheap

import { ref } from 'vue'

const POOL_SIZE = 320
// Particle parallel arrays — Float32Array for speed; no object churn.
const px = new Float32Array(POOL_SIZE)
const py = new Float32Array(POOL_SIZE)
const pvx = new Float32Array(POOL_SIZE)
const pvy = new Float32Array(POOL_SIZE)
const psize = new Float32Array(POOL_SIZE)
// Hue index 0..1 → orange-burn palette
const phue = new Float32Array(POOL_SIZE)

let trailCanvas: HTMLCanvasElement | null = null
let trailCtx: CanvasRenderingContext2D | null = null
let cachedW = 0
let cachedH = 0
let initialized = false

let startedAt = 0
let runningSec = 0
const SHOWER_DURATION_SEC = 2.4
/** Effective duration for the *current* shower run. Set on each
 *  `startMeteorShower` call so the caller can shorten the flourish on
 *  no-countdown stage starts (every-other-game quick start). */
let activeDurationSec = SHOWER_DURATION_SEC
export const isMeteorShowerActive = ref(false)

// Pre-generated gradient stops — sampled once into a plain RGBA-string lookup
// table so the inner loop never builds template strings.
const COLOR_STOPS = 24
const colorTable: string[] = []
for (let i = 0; i < COLOR_STOPS; i++) {
  // 0 → bright white-yellow head, 1 → deep ember orange
  const t = i / (COLOR_STOPS - 1)
  const r = Math.round(255)
  const g = Math.round(220 - t * 130)
  const b = Math.round(120 - t * 110)
  colorTable.push(`rgb(${r},${g},${b})`)
}
const sampleColor = (h: number) => {
  const idx = Math.max(0, Math.min(COLOR_STOPS - 1, Math.floor(h * COLOR_STOPS)))
  return colorTable[idx]!
}

/**
 * (Re)allocate the offscreen trail canvas and randomize the particle pool
 * for the given canvas dimensions. Idempotent if dimensions match the
 * cached pair — calling on every frame is safe but unnecessary.
 */
export const precomputeMeteorShower = (w: number, h: number) => {
  if (w <= 0 || h <= 0) return
  if (initialized && w === cachedW && h === cachedH) return
  if (!trailCanvas) trailCanvas = document.createElement('canvas')
  trailCanvas.width = Math.max(1, Math.round(w))
  trailCanvas.height = Math.max(1, Math.round(h))
  trailCtx = trailCanvas.getContext('2d')
  if (!trailCtx) return
  trailCtx.fillStyle = 'rgba(0,0,0,1)'
  trailCtx.fillRect(0, 0, trailCanvas.width, trailCanvas.height)
  cachedW = w
  cachedH = h
  // Radial shower: spawn each meteor on a ring around the center
  // (where the 3-2-1 / GO countdown text sits) and aim it outward toward
  // the viewport edges. Ring radius scales with the viewport — 15% of the
  // smaller dimension — so the shower keeps the same visual proportion on
  // both phones and desktop. ±10px jitter for a hint of depth.
  const cx = w * 0.5
  const cy = h * 0.5
  const reach = Math.sqrt(cx * cx + cy * cy)
  // Slightly faster than viewport-half/sec so most particles cross the
  // edge during the shower window rather than slow-draining.
  const baseSpeed = reach / 1.6
  const ringRadius = Math.min(w, h) * 0.15
  for (let i = 0; i < POOL_SIZE; i++) {
    const angle = Math.random() * Math.PI * 2
    const startRadius = ringRadius + (Math.random() - 0.5) * 20
    const speed = baseSpeed * (0.75 + Math.random() * 0.55)
    px[i] = cx + Math.cos(angle) * startRadius
    py[i] = cy + Math.sin(angle) * startRadius
    pvx[i] = Math.cos(angle) * speed
    pvy[i] = Math.sin(angle) * speed
    psize[i] = 0.55 + Math.random() * 1.4
    phue[i] = Math.random()
  }
  initialized = true
}

/**
 * Kick off the shower. `durationMultiplier` defaults to 1 (the canonical
 * 2.4s flourish that pairs with the 3-2-1-GO countdown). Pass a smaller
 * value (e.g. 0.5) for stage starts that skip the countdown — same
 * particle pool, just stops sooner so gameplay isn't gated on a long
 * intro the player has already seen.
 */
export const startMeteorShower = (durationMultiplier = 1) => {
  if (!initialized) return
  startedAt = performance.now()
  runningSec = 0
  activeDurationSec = SHOWER_DURATION_SEC * Math.max(0, durationMultiplier)
  isMeteorShowerActive.value = true
  // Reset the trail buffer to opaque black so the first frame doesn't show
  // ghost trails from a previous stage.
  if (trailCtx && trailCanvas) {
    trailCtx.fillStyle = 'rgba(0,0,0,1)'
    trailCtx.fillRect(0, 0, trailCanvas.width, trailCanvas.height)
  }
}

export const stopMeteorShower = () => {
  isMeteorShowerActive.value = false
  if (trailCtx && trailCanvas) {
    trailCtx.fillStyle = 'rgba(0,0,0,1)'
    trailCtx.fillRect(0, 0, trailCanvas.width, trailCanvas.height)
  }
}

/**
 * Draw one frame of the shower onto the live canvas context. No-op when
 * inactive — safe to call from the regular render loop unconditionally.
 */
export const renderMeteorShower = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
  if (!isMeteorShowerActive.value) return
  if (!initialized || w !== cachedW || h !== cachedH) precomputeMeteorShower(w, h)
  if (!trailCtx || !trailCanvas) return

  const now = performance.now()
  const dt = Math.min(0.05, (now - startedAt - runningSec * 1000) / 1000)
  runningSec = (now - startedAt) / 1000

  // Auto-stop after the shower finishes (uses the per-run duration so
  // shortened starts cut off at the right time).
  if (runningSec >= activeDurationSec) {
    stopMeteorShower()
    return
  }

  // 1. Fade trail buffer — exponential decay produces a natural smooth tail.
  trailCtx.globalCompositeOperation = 'destination-out'
  trailCtx.fillStyle = 'rgba(0,0,0,0.18)'
  trailCtx.fillRect(0, 0, cachedW, cachedH)
  trailCtx.globalCompositeOperation = 'lighter'

  // 2. Advance + draw heads. Particles that exit the viewport recycle to a
  // fresh ring start with a randomized outward direction so the shower
  // sustains a continuous radial sweep for the whole duration.
  const wrapMargin = 60
  const cx = cachedW * 0.5
  const cy = cachedH * 0.5
  const reach = Math.sqrt(cx * cx + cy * cy)
  const baseSpeed = reach / 1.6
  const ringRadius = Math.min(cachedW, cachedH) * 0.15
  for (let i = 0; i < POOL_SIZE; i++) {
    const vx = pvx[i] as number
    const vy = pvy[i] as number
    let x = (px[i] as number) + vx * dt
    let y = (py[i] as number) + vy * dt
    if (
      x < -wrapMargin || x > cachedW + wrapMargin ||
      y < -wrapMargin || y > cachedH + wrapMargin
    ) {
      const angle = Math.random() * Math.PI * 2
      // Same 15vmin ring (with ±10px jitter) as the initial spawn — keeps
      // the emitter band consistent across the whole shower duration.
      const startRadius = ringRadius + (Math.random() - 0.5) * 20
      const speed = baseSpeed * (0.75 + Math.random() * 0.55)
      x = cx + Math.cos(angle) * startRadius
      y = cy + Math.sin(angle) * startRadius
      pvx[i] = Math.cos(angle) * speed
      pvy[i] = Math.sin(angle) * speed
    }
    px[i] = x
    py[i] = y
    trailCtx.fillStyle = sampleColor(phue[i] as number)
    trailCtx.beginPath()
    trailCtx.arc(x, y, psize[i] as number, 0, Math.PI * 2)
    trailCtx.fill()
  }

  trailCtx.globalCompositeOperation = 'source-over'

  // 3. Composite onto the live canvas. Using `lighter` so the trails layer
  // additively over the existing star-field background instead of erasing it.
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.drawImage(trailCanvas, 0, 0)
  ctx.restore()
}
