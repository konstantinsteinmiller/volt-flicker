import { ref, computed, watch, type Ref } from 'vue'
import { saveDataVersion } from '@/use/useSaveStatus'
import { STAGE_KEY } from '@/keys'
import { testStage, campaignOverrides } from '@/use/useCustomStages'
import { getState, setState } from '@/use/useMawState'

export type StageBiome = 'forest' | 'wheat' | 'flower' | 'rocky' | 'boss'

export interface Obstacle {
  type: 'stump' | 'boulder' | 'crystal'
  /** Game-space position relative to island origin. */
  x: number
  y: number
}

export interface MawIsland {
  /** Center of the island in world coordinates. */
  cx: number
  cy: number
  /** Half-extent (radius for round islands, half-side for square). */
  radius: number
  shape: 'round' | 'square'
  /** Pre-baked grass blade positions inside the island. Each tuple is [x,y]. */
  grass: Array<[number, number]>
  obstacles: Obstacle[]
}

export interface MawStage {
  id: number
  name: string
  biome: StageBiome
  /** Number of coin-yielding mawables (grass / wheat blades) the player must clear to win. */
  targetClears: number
  /** Coins awarded when the stage is cleared. */
  rewardWin: number
  /** Coins awarded on death (small consolation). */
  rewardLose: number
  /** Distance between the two gears in pixels — also dictates the max gap the
   *  player can leap. Increases with stage to ramp difficulty. */
  chainLength: number
  islands: MawIsland[]
  isBoss: boolean
  /** Exit-pole world position. Touching with the chain after `targetClears`
   *  is met finishes the stage. The pole can be cut visually but still works. */
  exitX: number
  exitY: number
}

const seededRng = (seed: number) => {
  let s = seed | 0
  return () => {
    s = (s * 1664525 + 1013904223) | 0
    return ((s >>> 0) % 1_000_000) / 1_000_000
  }
}

const buildIsland = (
  cx: number,
  cy: number,
  radius: number,
  shape: 'round' | 'square',
  grassDensity: number,
  obstacles: Obstacle[],
  rng: () => number
): MawIsland => {
  const grass: Array<[number, number]> = []
  const count = Math.floor(grassDensity * (radius * radius) / 1500)
  for (let i = 0; i < count; i++) {
    let gx = 0
    let gy = 0
    if (shape === 'round') {
      const r = Math.sqrt(rng()) * (radius - 12)
      const a = rng() * Math.PI * 2
      gx = cx + Math.cos(a) * r
      gy = cy + Math.sin(a) * r
    } else {
      gx = cx + (rng() * 2 - 1) * (radius - 12)
      gy = cy + (rng() * 2 - 1) * (radius - 12)
    }
    grass.push([gx, gy])
  }
  return { cx, cy, radius, shape, grass, obstacles }
}

const buildStage = (
  id: number,
  name: string,
  biome: StageBiome,
  isBoss: boolean
): MawStage => {
  const rng = seededRng(id * 9301 + 49297)
  const chainLength = 70 + Math.min(120, id * 6)
  const targetClears = 60 + id * 15
  const rewardWin = 50 + id * 25
  const rewardLose = 5 + id * 2

  // Layout budget. The placement uses the baseline player chain (matches
  // the `chainLength` upgrade base in useMawProgress). Two islands are
  // reachable in one swap iff dist(centers) ≤ rA + chain + rB. We deliberately
  // leave a visible WATER_GAP < chain between consecutive island edges so
  // the chasm reads as platforming — the player must time the swing and
  // anchor near the edge to clear it, but it's always physically reachable.
  const PLAYER_CHAIN = 96
  const WATER_GAP = 60

  const islands: MawIsland[] = []
  // Home island — launching pad. Small grass patches so there's something
  // to nibble before swapping out.
  const homeR = 200
  islands.push(
    buildIsland(0, 0, homeR, 'round', isBoss ? 0 : 2, isBoss ? [] : [
      { type: 'stump', x: -150, y: -110 }
    ], rng)
  )

  // Serpentine main path leading to the exit. Each step's center-to-center
  // distance equals `prevR + thisR + WATER_GAP`, so consecutive islands are
  // always separated by visible water but always reachable.
  const tiers = Math.min(11, 5 + Math.floor(id / 4))
  const path: Array<{ cx: number; cy: number; r: number }> = [{ cx: 0, cy: 0, r: homeR }]
  let curX = 0
  let curY = 0
  let curR = homeR
  let curAngle = (id * 0.83 + 0.5) % (Math.PI * 2)
  for (let i = 0; i < tiers; i++) {
    const r = 90 + Math.floor(rng() * 35)
    // Serpentine: limited turn per step so the path winds rather than
    // doubling back on itself.
    curAngle += (rng() - 0.5) * 0.9
    const step = curR + r + WATER_GAP
    curX += Math.cos(curAngle) * step
    curY += Math.sin(curAngle) * step
    const shape: 'round' | 'square' = i % 2 === 0 ? 'round' : 'square'
    const obstacles: Obstacle[] = []
    if (i % 3 === 1 && id >= 2) {
      obstacles.push({ type: 'stump', x: curX + (rng() * 50 - 25), y: curY + (rng() * 50 - 25) })
    }
    if (i % 4 === 2 && id >= 3) {
      obstacles.push({ type: 'boulder', x: curX + (rng() * 60 - 30), y: curY + (rng() * 60 - 30) })
    }
    if (i % 5 === 3 && id >= 2) {
      obstacles.push({ type: 'crystal', x: curX + (rng() * 50 - 25), y: curY + (rng() * 50 - 25) })
    }
    islands.push(buildIsland(curX, curY, r, shape, 18, obstacles, rng))
    path.push({ cx: curX, cy: curY, r })
    curR = r
  }

  // Side branches for variety. Each branches off a path island at right
  // angles, again with a WATER_GAP gap, so the player can detour for extra
  // grass (and risk the swing back).
  const sideCount = 1 + Math.floor(id / 5)
  for (let s = 0; s < sideCount; s++) {
    const parentIdx = 1 + Math.floor(rng() * Math.max(1, path.length - 2))
    const parent = path[parentIdx]!
    const sideR = 80 + Math.floor(rng() * 25)
    const fromOriginAngle = Math.atan2(parent.cy, parent.cx)
    const sideAngle = fromOriginAngle + (rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2) + (rng() - 0.5) * 0.4
    const step = parent.r + sideR + WATER_GAP
    const cx = parent.cx + Math.cos(sideAngle) * step
    const cy = parent.cy + Math.sin(sideAngle) * step
    const obstacles: Obstacle[] = []
    if (s === 0 && id >= 4) obstacles.push({ type: 'crystal', x: cx, y: cy })
    islands.push(buildIsland(cx, cy, sideR, 'round', 20, obstacles, rng))
  }

  // Exit pole sits at the centre of the last main-path island.
  const exit = path[path.length - 1]!
  const exitX = exit.cx
  const exitY = exit.cy

  return {
    id, name, biome, targetClears, rewardWin, rewardLose, chainLength, islands, isBoss,
    exitX,
    exitY
  }
}

const STAGE_NAME_POOL = [
  'meadow', 'glade', 'orchard', 'pasture', 'fairway', 'farmstead', 'wheatfield', 'sunHollow',
  'lilyBank', 'cloverPatch', 'cornerLot', 'eastBend', 'streamRow', 'pebbleNook', 'thornHill'
]

export const STAGES: MawStage[] = Array.from({ length: 30 }, (_, i) => {
  const id = i + 1
  const isBoss = id % 10 === 0
  const biome: StageBiome = id <= 5
    ? 'forest'
    : id <= 12
      ? 'wheat'
      : id <= 20
        ? 'flower'
        : 'rocky'
  return buildStage(
    id,
    isBoss ? 'overgrownTitan' : (STAGE_NAME_POOL[i % STAGE_NAME_POOL.length] ?? 'meadow'),
    biome,
    isBoss
  )
})

const readStoredStage = (): number => {
  const v = getState<unknown>(STAGE_KEY)
  if (v === undefined || v === null) return 1
  const n = typeof v === 'number' ? v : parseInt(String(v), 10)
  if (!Number.isFinite(n)) return 1
  return Math.max(1, Math.min(STAGES.length, n))
}

const currentStageId: Ref<number> = ref(readStoredStage())

const persistStage = (id: number) => {
  setState(STAGE_KEY, id)
}

watch(saveDataVersion, () => {
  currentStageId.value = readStoredStage()
})

const currentStage = computed<MawStage>(() => {
  // Resolution order: editor test stage → user override for this slot →
  // built-in procedural stage. Keeping the override layer separate from the
  // procedural array means clearing an override transparently restores the
  // original gameplay.
  if (testStage.value) return testStage.value
  const override = campaignOverrides.value[currentStageId.value]
  if (override) return override
  return STAGES[currentStageId.value - 1] ?? STAGES[0]!
})
const isLastStage = computed(() => currentStageId.value >= STAGES.length)

const stageReinitSignal = ref(0)

export default function useMawCampaign() {
  const advanceStage = () => {
    if (currentStageId.value < STAGES.length) {
      currentStageId.value += 1
      persistStage(currentStageId.value)
      stageReinitSignal.value++
    }
  }

  const resetCampaign = () => {
    currentStageId.value = 1
    persistStage(1)
    stageReinitSignal.value++
  }

  /** Jump to an arbitrary stage. Persists, fires the reinit signal so
   *  MawScene rebuilds the world geometry, and clamps to the valid range.
   *  Used by the dev cheat (ctrl+shift+N) and by the editor's
   *  "Test In-Game" path. */
  const setStageId = (id: number) => {
    const next = Math.max(1, Math.min(STAGES.length, Math.floor(id)))
    if (next === currentStageId.value) {
      // Same id — still bump the reinit signal so the active gameplay
      // resets to a fresh layout (useful when the cheat is used to
      // restart the current stage cleanly).
      stageReinitSignal.value++
      return
    }
    currentStageId.value = next
    persistStage(next)
    stageReinitSignal.value++
  }

  return {
    currentStage,
    currentStageId,
    isLastStage,
    advanceStage,
    resetCampaign,
    setStageId,
    stageReinitSignal
  }
}
