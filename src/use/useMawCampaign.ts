import { ref, computed, watch, type Ref } from 'vue'
import { saveDataVersion } from '@/use/useSaveStatus'
import { STAGE_KEY } from '@/keys'
import { testStage, campaignOverrides } from '@/use/useCustomStages'
import { getState, setState } from '@/use/useMawState'
import { islandEdgeAlong, sampleInsideIsland } from '@/use/useIslandShapes'

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

/** Edge-distance along `angle` for any island. Each shape's playable
 *  area is the polygon traced from its bitmap (`useIslandShapes.ts`),
 *  so path spacing is direction-aware for both round and square. */
const edgeRadius = (r: number, shape: 'round' | 'square', angle: number): number => {
  return islandEdgeAlong(shape, r, angle)
}

const seededRng = (seed: number) => {
  let s = seed | 0
  return () => {
    s = (s * 1664525 + 1013904223) | 0
    return ((s >>> 0) % 1_000_000) / 1_000_000
  }
}

/** Min world-units a grass blade must sit from any obstacle on the same
 *  island, so the dense bitmap art (stump / boulder / crystal) isn't
 *  smothered in tuft sprites. Obstacle visual radii peak around 26 px,
 *  so 28 leaves a clean breathing margin. */
const BLADE_MIN_DIST_FROM_OBSTACLE = 28

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
    // Sample blades inside the shape's actual polygon. Reject samples
    // that land on top of an obstacle so the obstacle art stays readable.
    let placed: [number, number] | null = null
    for (let k = 0; k < 6 && !placed; k++) {
      const p = sampleInsideIsland(shape, cx, cy, radius, rng)
      if (!p) break
      let tooClose = false
      for (const ob of obstacles) {
        if (Math.hypot(p[0] - ob.x, p[1] - ob.y) < BLADE_MIN_DIST_FROM_OBSTACLE) {
          tooClose = true
          break
        }
      }
      if (!tooClose) placed = p
    }
    if (placed) grass.push(placed)
  }
  return { cx, cy, radius, shape, grass, obstacles }
}

/** Place obstacles inside an island's polygon, spread out and off-centre.
 *  Each candidate position must clear `minFromCenter` from the island's
 *  anchor (so obstacles don't crowd the chain spawn / exit pole) and
 *  `minBetween` from previously-placed obstacles on the same island. */
const placeObstaclesOnIsland = (
  cx: number, cy: number, radius: number,
  shape: 'round' | 'square',
  budget: { stumps: number; boulders: number; crystals: number },
  exitPole: { x: number; y: number } | null,
  rng: () => number
): Obstacle[] => {
  const types: Obstacle['type'][] = []
  for (let k = 0; k < budget.stumps; k++) types.push('stump')
  for (let k = 0; k < budget.boulders; k++) types.push('boulder')
  for (let k = 0; k < budget.crystals; k++) types.push('crystal')
  if (types.length === 0) return []
  const minFromCenter = radius * 0.3
  const minBetween = 56
  const minFromExit = 64
  const out: Obstacle[] = []
  for (const type of types) {
    for (let attempt = 0; attempt < 40; attempt++) {
      const p = sampleInsideIsland(shape, cx, cy, radius, rng)
      if (!p) break
      const [ox, oy] = p
      if (Math.hypot(ox - cx, oy - cy) < minFromCenter) continue
      if (exitPole && Math.hypot(ox - exitPole.x, oy - exitPole.y) < minFromExit) continue
      let tooClose = false
      for (const other of out) {
        if (Math.hypot(ox - other.x, oy - other.y) < minBetween) {
          tooClose = true
          break
        }
      }
      if (tooClose) continue
      out.push({ type, x: ox, y: oy })
      break
    }
  }
  return out
}

/**
 * Per-stage tuning. Difficulty grows along several axes — number of
 * main-path islands (= path length), island size (smaller = harder
 * landings), obstacle budget, side-branch count, path turn amplitude
 * (= how sharp the curve weaves). Obstacle types are introduced in step
 * with the saw-damage upgrade tiers in useMawProgress:
 *
 *   • stumps   from stage 3   (cuttable at saw lvl 2)
 *   • boulders from stage 6   (cuttable at saw lvl 4, otherwise hurt)
 *   • crystals from stage 13  (cuttable at saw lvl 6)
 *
 * Stages 1–2 are deliberately tame ("very easy" intro): all-round
 * islands, no obstacles, gentle curve, low clear target.
 */
interface StageParams {
  tiers: number
  /** Range of island radii on the main path; min and max in world units. */
  islandRadiusRange: [number, number]
  obstacleBudget: { stumps: number; boulders: number; crystals: number }
  sideBranches: number
  /** Per-step max swing of the path angle, radians. 0.3 ≈ gentle curve;
   *  0.9 ≈ tight zig-zag. */
  pathTurnAmplitude: number
  /** All-round islands until this id; mixed round/square thereafter. */
  forceRound: boolean
  targetClears: number
  rewardWin: number
}

const stageParams = (id: number, isBoss: boolean): StageParams => {
  if (isBoss) {
    if (id === 10) return {
      tiers: 7, islandRadiusRange: [110, 135],
      obstacleBudget: { stumps: 4, boulders: 1, crystals: 0 },
      sideBranches: 2, pathTurnAmplitude: 0.65,
      forceRound: false, targetClears: 220, rewardWin: 400
    }
    if (id === 20) return {
      tiers: 9, islandRadiusRange: [100, 130],
      obstacleBudget: { stumps: 4, boulders: 4, crystals: 2 },
      sideBranches: 3, pathTurnAmplitude: 0.8,
      forceRound: false, targetClears: 360, rewardWin: 800
    }
    return {
      tiers: 11, islandRadiusRange: [95, 125],
      obstacleBudget: { stumps: 5, boulders: 5, crystals: 5 },
      sideBranches: 4, pathTurnAmplitude: 0.9,
      forceRound: false, targetClears: 520, rewardWin: 1500
    }
  }
  if (id === 1) return {
    tiers: 4, islandRadiusRange: [115, 135],
    obstacleBudget: { stumps: 0, boulders: 0, crystals: 0 },
    sideBranches: 0, pathTurnAmplitude: 0.3,
    forceRound: true, targetClears: 30, rewardWin: 60
  }
  if (id === 2) return {
    tiers: 5, islandRadiusRange: [110, 130],
    obstacleBudget: { stumps: 0, boulders: 0, crystals: 0 },
    sideBranches: 0, pathTurnAmplitude: 0.4,
    forceRound: true, targetClears: 50, rewardWin: 80
  }
  // Forest mid (3–9): stumps appear at 3, boulders at 6, side branches at 4.
  if (id <= 9) {
    const local = id - 3 // 0..6
    return {
      tiers: 5 + Math.floor(local / 2),
      islandRadiusRange: [100, 125],
      obstacleBudget: {
        stumps: 1 + Math.min(3, local),
        boulders: id >= 6 ? Math.min(2, id - 5) : 0,
        crystals: 0
      },
      sideBranches: id >= 4 ? 1 : 0,
      pathTurnAmplitude: 0.45 + local * 0.04,
      forceRound: false,
      targetClears: 70 + local * 15,
      rewardWin: 110 + local * 30
    }
  }
  // Wheat / flower (11–19): crystals start at 13, side branches grow.
  if (id <= 19) {
    const local = id - 11 // 0..8
    return {
      tiers: 7 + Math.floor(local / 2),
      islandRadiusRange: [92, 118],
      obstacleBudget: {
        stumps: 3 + Math.floor(local / 2),
        boulders: 1 + Math.floor(local / 3),
        crystals: id >= 13 ? Math.min(3, Math.floor((id - 12) / 2)) : 0
      },
      sideBranches: 1 + Math.floor(local / 3),
      pathTurnAmplitude: 0.6 + local * 0.025,
      forceRound: false,
      targetClears: 170 + local * 18,
      rewardWin: 320 + local * 45
    }
  }
  // Rocky endgame (21–29): tighter, denser, more hostile.
  const local = id - 21 // 0..8
  return {
    tiers: 9 + Math.floor(local / 3),
    islandRadiusRange: [88, 112],
    obstacleBudget: {
      stumps: 4 + Math.floor(local / 3),
      boulders: 2 + Math.floor(local / 3),
      crystals: 2 + Math.floor(local / 4)
    },
    sideBranches: 2 + Math.floor(local / 4),
    pathTurnAmplitude: 0.78,
    forceRound: false,
    targetClears: 340 + local * 25,
    rewardWin: 850 + local * 70
  }
}

const buildStage = (
  id: number,
  name: string,
  biome: StageBiome,
  isBoss: boolean
): MawStage => {
  const rng = seededRng(id * 9301 + 49297)
  const params = stageParams(id, isBoss)
  // Stage chainLength is no longer read by gameplay (the live chain length
  // comes from the upgrade), but keep the field populated for editor /
  // export tooling that might surface it.
  const chainLength = 96
  const rewardLose = Math.max(5, Math.round(params.rewardWin * 0.08))

  // Layout budget. Two islands are always reachable in one swap because
  // we leave exactly WATER_GAP between the two polygon edges along the
  // travel direction — well under the player's base 96-unit chain.
  const WATER_GAP = 60

  const islands: MawIsland[] = []
  // Home island — launching pad. No obstacle on tutorial stages so the
  // player can practise swinging without taking a hit on their very first
  // arc; from stage 3 onward the home stump telegraphs that obstacles
  // exist on subsequent islands.
  const homeR = 200
  const homeObstacles: Obstacle[] = (!isBoss && id >= 3)
    ? [{ type: 'stump', x: -110, y: -70 }]
    : []
  islands.push(buildIsland(0, 0, homeR, 'round', isBoss ? 0 : 2, homeObstacles, rng))

  // Serpentine main path. The last island hosts the exit pole; obstacles
  // are queued up and distributed across the non-exit islands at the end
  // of this loop so the budget is honoured stage-wide rather than tied to
  // a per-island modulo (which used to make late-stage islands always
  // obstacle-free in odd configurations).
  const path: Array<{ cx: number; cy: number; r: number; shape: 'round' | 'square' }> =
    [{ cx: 0, cy: 0, r: homeR, shape: 'round' }]
  let curX = 0, curY = 0, curR = homeR
  let prevShape: 'round' | 'square' = 'round'
  let curAngle = (id * 0.83 + 0.5) % (Math.PI * 2)
  const [rMin, rMax] = params.islandRadiusRange
  const turnSwing = params.pathTurnAmplitude
  for (let i = 0; i < params.tiers; i++) {
    const r = rMin + Math.floor(rng() * (rMax - rMin + 1))
    curAngle += (rng() - 0.5) * 2 * turnSwing
    const shape: 'round' | 'square' = params.forceRound
      ? 'round'
      : (i % 2 === 0 ? 'round' : 'square')
    const step =
      edgeRadius(curR, prevShape, curAngle)
      + edgeRadius(r, shape, curAngle)
      + WATER_GAP
    curX += Math.cos(curAngle) * step
    curY += Math.sin(curAngle) * step
    // Obstacles deferred — see distribution loop below.
    islands.push(buildIsland(curX, curY, r, shape, 18, [], rng))
    path.push({ cx: curX, cy: curY, r, shape })
    curR = r
    prevShape = shape
  }

  // Side branches — small detour islands that yield extra grass (and
  // extra risk on the way back). Always round; spawn off the parent's
  // perpendicular so the branch reads as a side-step rather than a
  // continuation of the main path.
  const sideStartIdx = islands.length
  for (let s = 0; s < params.sideBranches; s++) {
    const parentIdx = 1 + Math.floor(rng() * Math.max(1, path.length - 2))
    const parent = path[parentIdx]!
    const sideR = 82 + Math.floor(rng() * 22)
    const fromOriginAngle = Math.atan2(parent.cy, parent.cx)
    const sideAngle = fromOriginAngle
      + (rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2)
      + (rng() - 0.5) * 0.4
    const step =
      edgeRadius(parent.r, parent.shape, sideAngle)
      + edgeRadius(sideR, 'round', sideAngle)
      + WATER_GAP
    const cx = parent.cx + Math.cos(sideAngle) * step
    const cy = parent.cy + Math.sin(sideAngle) * step
    islands.push(buildIsland(cx, cy, sideR, 'round', 20, [], rng))
  }

  // Exit pole sits at the centre of the last main-path island.
  const exit = path[path.length - 1]!
  const exitX = exit.cx
  const exitY = exit.cy

  // ─── Distribute the obstacle budget across non-exit islands ─────────
  // Pool: every main-path island except home + exit, plus side branches.
  // Each island gets a varied subset of (stumps, boulders, crystals)
  // until the budget is exhausted; positions are picked off-centre via
  // `placeObstaclesOnIsland`. Side branches host crystals first when
  // available so the optional-detour reward feels worth the trip.
  interface Slot { idx: number; isSide: boolean }
  const slots: Slot[] = []
  for (let k = 1; k < path.length - 1; k++) slots.push({ idx: k, isSide: false })
  for (let k = 0; k < params.sideBranches; k++) slots.push({ idx: sideStartIdx + k, isSide: true })

  const queue: Array<{ type: Obstacle['type']; preferSide: boolean }> = []
  for (let k = 0; k < params.obstacleBudget.crystals; k++) queue.push({ type: 'crystal', preferSide: true })
  for (let k = 0; k < params.obstacleBudget.boulders; k++) queue.push({ type: 'boulder', preferSide: false })
  for (let k = 0; k < params.obstacleBudget.stumps; k++) queue.push({ type: 'stump', preferSide: false })

  // Round-robin so each island gets at most one obstacle on the first
  // pass. Subsequent passes pile additional obstacles onto the same
  // islands once every slot has had a chance.
  const perIsleBudgets = new Map<number, { stumps: number; boulders: number; crystals: number }>()
  const ensureBudget = (idx: number) => {
    let b = perIsleBudgets.get(idx)
    if (!b) { b = { stumps: 0, boulders: 0, crystals: 0 }; perIsleBudgets.set(idx, b) }
    return b
  }
  for (let pass = 0; queue.length > 0; pass++) {
    // Shuffle slot order each pass so consecutive passes don't all hit
    // the same islands first. Side-preferring obstacles try side slots
    // ahead of main-path slots.
    const order = slots.slice().sort((a, b) => {
      const aSide = a.isSide ? 0 : 1
      const bSide = b.isSide ? 0 : 1
      return (aSide - bSide) + (rng() - 0.5)
    })
    let placedAny = false
    for (const slot of order) {
      if (queue.length === 0) break
      // Prefer queue items whose preferSide matches this slot.
      let pickIdx = queue.findIndex(q => q.preferSide === slot.isSide)
      if (pickIdx < 0) pickIdx = 0
      const item = queue[pickIdx]!
      const b = ensureBudget(slot.idx)
      b[(item.type + 's') as 'stumps' | 'boulders' | 'crystals'] += 1
      queue.splice(pickIdx, 1)
      placedAny = true
    }
    if (!placedAny) break // shouldn't happen, but guards against infinite loop
  }

  for (const [idx, budget] of perIsleBudgets) {
    const isle = islands[idx]
    if (!isle) continue
    const exitPole = (idx === path.length - 1) ? { x: exitX, y: exitY } : null
    const placed = placeObstaclesOnIsland(
      isle.cx, isle.cy, isle.radius, isle.shape,
      budget, exitPole, rng
    )
    // Re-build the island with obstacles + grass-blade obstacle avoidance,
    // since blades were laid down in the first pass without knowing
    // about the obstacles yet.
    if (placed.length > 0) {
      islands[idx] = buildIsland(
        isle.cx, isle.cy, isle.radius, isle.shape,
        // Pull the original grass density from how `buildIsland` was
        // called above — main path = 18, side branch = 20. We don't
        // store density on the island itself, so re-derive from index.
        idx >= sideStartIdx ? 20 : 18,
        placed,
        rng
      )
    }
  }

  return {
    id, name, biome,
    targetClears: params.targetClears,
    rewardWin: params.rewardWin,
    rewardLose,
    chainLength,
    islands, isBoss,
    exitX, exitY
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
