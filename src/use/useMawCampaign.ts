import { ref, computed, watch, type Ref } from 'vue'
import { saveDataVersion } from '@/use/useSaveStatus'
import { STAGE_KEY } from '@/keys'
import { testStage, campaignOverrides } from '@/use/useCustomStages'
import { getState, setState } from '@/use/useMawState'
import { islandEdgeAlong, sampleInsideIsland } from '@/use/useIslandShapes'

export type StageBiome = 'forest' | 'wheat' | 'flower' | 'rocky' | 'boss'

export interface Obstacle {
  /** stump  — cuttable at saw Lv 1, damage 1
   *  boulder — cuttable at saw Lv 3, damage 2
   *  crystal — cuttable at saw Lv 6, damage 1
   *  liberty — cuttable at saw Lv 8, damage 2 (LIBERTY-CAT statue) */
  type: 'stump' | 'boulder' | 'crystal' | 'liberty'
  /** Game-space position relative to island origin. */
  x: number
  y: number
}

/** Cosmetic-only props (litter, signposts, fluff). No collision, no
 *  hit-test, no coin payout — just visual decoration tied to the
 *  island so it follows along on moving platforms. */
export interface Decor {
  type: 'libertyTrash'
  x: number
  y: number
}

/** Ping-pong motion path for an island. When attached to a `MawIsland`,
 *  the gameplay loop mutates the island's `cx`/`cy` each tick and
 *  translates its grass + obstacles by the same delta, so the whole
 *  platform slides along the A↔B path. */
export interface MovementSpec {
  /** Path endpoint A in absolute world coords. */
  ax: number
  ay: number
  /** Path endpoint B in absolute world coords. */
  bx: number
  by: number
  /** Time for one full A→B→A round trip, in milliseconds. */
  periodMs: number
  /** Starting offset along the cycle, 0..1. Lets neighbouring moving
   *  islands run out-of-phase so the field doesn't feel marching. */
  phase?: number
}

export interface MawIsland {
  /** Centre of the island in world coordinates. Mutates per tick on
   *  moving islands (see `motion`); static otherwise. */
  cx: number
  cy: number
  /** Half-extent (radius for round islands, half-side for square). */
  radius: number
  shape: 'round' | 'square'
  /** Pre-baked grass blade positions inside the island. Each tuple is [x,y]. */
  grass: Array<[number, number]>
  obstacles: Obstacle[]
  /** Cosmetic-only props (no collision). Optional so legacy saves /
   *  procedural stages without decor keep their existing shape. */
  decor?: Decor[]
  /** Optional ping-pong path. */
  motion?: MovementSpec
}

/** Returns the live position of an island at time `nowMs` ms (perf clock)
 *  given its motion spec. Ping-pongs A↔B with the spec's period + phase. */
export const motionPositionAt = (m: MovementSpec, nowMs: number): { x: number; y: number } => {
  const phase = m.phase ?? 0
  const t = ((nowMs / m.periodMs) + phase) % 1
  // 0..0.5 = A→B, 0.5..1 = B→A. Linear; the rounded ease at endpoints is
  // implicit in the trig the gear path uses, so a sharp pong reads fine.
  const p = t < 0.5 ? t * 2 : 2 - t * 2
  return {
    x: m.ax + (m.bx - m.ax) * p,
    y: m.ay + (m.by - m.ay) * p
  }
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
  // Per-type sampling margin — boulders are the widest sprite (70 wu)
  // so they need the biggest inset to keep the whole bitmap on the
  // green ground. Crystals are smallest; stumps in between. Liberty
  // statues are TALL (130 wu) so the top margin is the largest of all.
  const margins: Record<Obstacle['type'], { x: number; top: number; bot: number }> = {
    boulder: { x: 38, top: 48, bot: 64 },
    stump:   { x: 34, top: 44, bot: 60 },
    crystal: { x: 26, top: 38, bot: 56 },
    liberty: { x: 36, top: 78, bot: 60 }
  }
  for (const type of types) {
    for (let attempt = 0; attempt < 40; attempt++) {
      const p = sampleInsideIsland(shape, cx, cy, radius, rng, 24, margins[type])
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
  /** How many side branches start the round with a motion path attached.
   *  Stages 2-3 use this for the gameplay-preview teaser. */
  movingSideBranches: number
  /** How many non-home / non-exit main-path islands have motion. Stages
   *  6+ introduce moving platforms directly on the route to the pole. */
  movingMainIslands: number
  /** Edge-to-edge water gap between consecutive islands, world units.
   *  Base chain reach is 96 wu; with `movingAmplitude` the effective gap
   *  swings ±2·amp so this needs to leave headroom for that. */
  waterGap: number
  /** ±amplitude of moving-island motion (world units). The total motion
   *  span is 2·amplitude. Late stages crank this to force chain-length
   *  upgrades. */
  movingAmplitude: number
  /** How the `movingMainIslands` slots are arranged across the main
   *  path:
   *    'spread'  — evenly distributed (default; existing behaviour)
   *    'cluster' — the moving islands appear consecutively in the
   *                middle of the path (e.g. "3 in a row" puzzle)
   *    'all'     — EVERY interior main-path island moves, regardless of
   *                `movingMainIslands` (the count is ignored)
   */
  movingLayout: 'spread' | 'cluster' | 'all'
}

/** Moving-island counts per stage. Stages 2–3 host the gameplay-preview
 *  teaser on a side branch; 4–5 settle back; 6+ introduce moving
 *  platforms on the main route. Bosses (10/15/20) are the difficulty
 *  spikes — each one cranks moving counts hard. The campaign is exactly
 *  20 stages now, so the final boss caps the entire ramp. */
const movingCounts = (id: number, isBoss: boolean) => {
  if (isBoss) {
    if (id === 10) return { side: 1, main: 3 }
    if (id === 15) return { side: 2, main: 4 }
    if (id === 20) return { side: 2, main: 6 }
    return { side: 1, main: 3 }
  }
  if (id === 2 || id === 3) return { side: 1, main: 0 }
  if (id < 6) return { side: 0, main: 0 }
  // 6→1, 7→1, 8→2, 9→2, 11→3, 12→3, 13→3, 14→4, 16→5, 17→5, 18→5, 19→6
  // Hand-tuned per id below for a clean ramp into 10/15/20.
  if (id === 6) return { side: 0, main: 1 }
  if (id === 7) return { side: 0, main: 1 }
  if (id === 8) return { side: 1, main: 2 }
  if (id === 9) return { side: 1, main: 2 }
  if (id === 11) return { side: 1, main: 3 }
  if (id === 12) return { side: 1, main: 3 }
  if (id === 13) return { side: 2, main: 3 }
  if (id === 14) return { side: 2, main: 4 }
  if (id === 16) return { side: 2, main: 4 }
  if (id === 17) return { side: 2, main: 5 }
  if (id === 18) return { side: 2, main: 5 }
  if (id === 19) return { side: 2, main: 6 }
  return { side: 0, main: 0 }
}

/** Defaults shared across the gentler stages (1-9). Stages past 10
 *  override `waterGap` / `movingAmplitude` / `movingLayout` to crank
 *  the challenge curve. */
const STAGE_DEFAULTS = {
  waterGap: 60,
  movingAmplitude: 24,
  movingLayout: 'spread' as const
}

const stageParams = (id: number, isBoss: boolean): StageParams => {
  const moving = movingCounts(id, isBoss)
  if (isBoss) {
    if (id === 10) return {
      // First boss — first deep moving-island stretch. Wide platforms +
      // a single crystal introduce the "shiny obstacle" idea before the
      // crystal floods of stages 13+.
      tiers: 8, islandRadiusRange: [108, 132],
      obstacleBudget: { stumps: 4, boulders: 3, crystals: 1 },
      sideBranches: 2, pathTurnAmplitude: 0.7,
      forceRound: false, targetClears: 260, rewardWin: 600,
      movingSideBranches: moving.side, movingMainIslands: moving.main,
      waterGap: 64, movingAmplitude: 28, movingLayout: 'spread'
    }
    if (id === 15) return {
      // Mid-boss — three moving islands clustered in the middle of the
      // path so the player has to chain-time across them in sequence.
      // Crystals + boulders are abundant; gap pushes Lv 2 chain.
      tiers: 10, islandRadiusRange: [95, 120],
      obstacleBudget: { stumps: 6, boulders: 5, crystals: 4 },
      sideBranches: 3, pathTurnAmplitude: 0.85,
      forceRound: false, targetClears: 420, rewardWin: 1200,
      movingSideBranches: moving.side, movingMainIslands: moving.main,
      waterGap: 74, movingAmplitude: 32, movingLayout: 'cluster'
    }
    // Final boss (id === 20). MAW-A-HERO gate — EVERY interior main-
    // path island moves AND the gap is tight enough that the player
    // needs chainLength Lv 2+ just to cross at base reach (96 vs 86).
    return {
      tiers: 12, islandRadiusRange: [88, 115],
      obstacleBudget: { stumps: 8, boulders: 7, crystals: 7 },
      sideBranches: 4, pathTurnAmplitude: 0.95,
      forceRound: false, targetClears: 560, rewardWin: 2500,
      movingSideBranches: moving.side, movingMainIslands: moving.main,
      waterGap: 86, movingAmplitude: 40, movingLayout: 'all'
    }
  }
  if (id === 1) return {
    tiers: 4, islandRadiusRange: [115, 135],
    obstacleBudget: { stumps: 0, boulders: 0, crystals: 0 },
    sideBranches: 0, pathTurnAmplitude: 0.3,
    forceRound: true, targetClears: 30, rewardWin: 60,
    movingSideBranches: 0, movingMainIslands: 0,
    ...STAGE_DEFAULTS
  }
  if (id === 2) return {
    tiers: 5, islandRadiusRange: [110, 130],
    obstacleBudget: { stumps: 0, boulders: 0, crystals: 0 },
    sideBranches: 1,
    pathTurnAmplitude: 0.4,
    forceRound: true, targetClears: 50, rewardWin: 80,
    movingSideBranches: 1, movingMainIslands: 0,
    ...STAGE_DEFAULTS
  }
  if (id === 3) return {
    tiers: 5, islandRadiusRange: [105, 128],
    obstacleBudget: { stumps: 1, boulders: 0, crystals: 0 },
    sideBranches: 1, pathTurnAmplitude: 0.45,
    forceRound: false, targetClears: 70, rewardWin: 130,
    movingSideBranches: 1, movingMainIslands: 0,
    ...STAGE_DEFAULTS
  }
  // Forest mid (4–9): stumps appear at 3, boulders at 6, moving from 6.
  if (id <= 9) {
    const local = id - 3 // 1..6
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
      rewardWin: 110 + local * 30,
      movingSideBranches: moving.side,
      movingMainIslands: moving.main,
      ...STAGE_DEFAULTS
    }
  }
  // ─── Wheat / flower endgame (11-19) ───────────────────────────────
  // Hand-tuned per stage rather than a smooth formula — gives every
  // attempt a distinct flavour. Highlights:
  //   • 13 / 17 — "cluster" moving-island puzzles (3+ in a row)
  //   • 19    — "all" layout — every interior island moves
  //   • Crystals scale aggressively past 13 since the player has had
  //     plenty of time to buy saw Lv 6 by then
  //   • waterGap creeps from 62 → 82, forcing chain Lv 2+ by stage 18
  if (id === 11) return {
    tiers: 8, islandRadiusRange: [95, 120],
    obstacleBudget: { stumps: 3, boulders: 2, crystals: 1 },
    sideBranches: 2, pathTurnAmplitude: 0.62,
    forceRound: false, targetClears: 200, rewardWin: 360,
    movingSideBranches: moving.side, movingMainIslands: moving.main,
    waterGap: 64, movingAmplitude: 26, movingLayout: 'spread'
  }
  if (id === 12) return {
    tiers: 8, islandRadiusRange: [92, 118],
    obstacleBudget: { stumps: 4, boulders: 2, crystals: 2 },
    sideBranches: 2, pathTurnAmplitude: 0.65,
    forceRound: false, targetClears: 220, rewardWin: 420,
    movingSideBranches: moving.side, movingMainIslands: moving.main,
    waterGap: 66, movingAmplitude: 28, movingLayout: 'spread'
  }
  if (id === 13) return {
    tiers: 9, islandRadiusRange: [90, 115],
    obstacleBudget: { stumps: 4, boulders: 3, crystals: 3 },
    sideBranches: 2, pathTurnAmplitude: 0.68,
    forceRound: false, targetClears: 240, rewardWin: 480,
    movingSideBranches: moving.side, movingMainIslands: moving.main,
    waterGap: 68, movingAmplitude: 28, movingLayout: 'cluster'
  }
  if (id === 14) return {
    tiers: 9, islandRadiusRange: [88, 112],
    obstacleBudget: { stumps: 5, boulders: 3, crystals: 3 },
    sideBranches: 3, pathTurnAmplitude: 0.72,
    forceRound: false, targetClears: 270, rewardWin: 560,
    movingSideBranches: moving.side, movingMainIslands: moving.main,
    waterGap: 70, movingAmplitude: 30, movingLayout: 'spread'
  }
  if (id === 16) return {
    tiers: 10, islandRadiusRange: [88, 112],
    obstacleBudget: { stumps: 5, boulders: 4, crystals: 4 },
    sideBranches: 3, pathTurnAmplitude: 0.76,
    forceRound: false, targetClears: 300, rewardWin: 680,
    movingSideBranches: moving.side, movingMainIslands: moving.main,
    waterGap: 72, movingAmplitude: 30, movingLayout: 'spread'
  }
  if (id === 17) return {
    // "3-in-a-row" set piece — the cluster layout lines up 4 moving
    // platforms in succession, so the player has to time three swaps
    // through synced motion.
    tiers: 10, islandRadiusRange: [85, 108],
    obstacleBudget: { stumps: 6, boulders: 5, crystals: 5 },
    sideBranches: 3, pathTurnAmplitude: 0.78,
    forceRound: false, targetClears: 320, rewardWin: 760,
    movingSideBranches: moving.side, movingMainIslands: moving.main,
    waterGap: 76, movingAmplitude: 32, movingLayout: 'cluster'
  }
  if (id === 18) return {
    tiers: 11, islandRadiusRange: [85, 108],
    obstacleBudget: { stumps: 6, boulders: 5, crystals: 6 },
    sideBranches: 3, pathTurnAmplitude: 0.8,
    forceRound: false, targetClears: 350, rewardWin: 880,
    movingSideBranches: moving.side, movingMainIslands: moving.main,
    waterGap: 78, movingAmplitude: 34, movingLayout: 'spread'
  }
  if (id === 19) return {
    // "Everything moves" — EVERY interior main-path island has motion.
    // The pre-boss test of the player's chain reach AND their timing.
    tiers: 11, islandRadiusRange: [82, 105],
    obstacleBudget: { stumps: 7, boulders: 6, crystals: 6 },
    sideBranches: 3, pathTurnAmplitude: 0.82,
    forceRound: false, targetClears: 380, rewardWin: 1000,
    movingSideBranches: moving.side, movingMainIslands: moving.main,
    waterGap: 82, movingAmplitude: 32, movingLayout: 'all'
  }
  // Fallback for any id I haven't enumerated (shouldn't happen with
  // STAGES of length 20; here purely defensively for future expansion).
  return {
    tiers: 8, islandRadiusRange: [92, 118],
    obstacleBudget: { stumps: 4, boulders: 3, crystals: 3 },
    sideBranches: 2, pathTurnAmplitude: 0.7,
    forceRound: false, targetClears: 240, rewardWin: 500,
    movingSideBranches: moving.side, movingMainIslands: moving.main,
    ...STAGE_DEFAULTS
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
  // travel direction. Base chain reach is 96 wu; per-stage gaps go up
  // to 86 wu on the final boss, so chainLength upgrades become a real
  // requirement past stage 17.
  const WATER_GAP = params.waterGap

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
  const path: Array<{ cx: number; cy: number; r: number; shape: 'round' | 'square'; angle: number }> =
    [{ cx: 0, cy: 0, r: homeR, shape: 'round', angle: 0 }]
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
    path.push({ cx: curX, cy: curY, r, shape, angle: curAngle })
    curR = r
    prevShape = shape
  }

  // Side branches — small detour islands that yield extra grass (and
  // extra risk on the way back). Always round; spawn off the parent's
  // perpendicular so the branch reads as a side-step rather than a
  // continuation of the main path.
  const sideStartIdx = islands.length
  const sideBranchAngles: number[] = []
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
    sideBranchAngles.push(sideAngle)
  }

  // ─── Attach motion specs ────────────────────────────────────────────
  // Motion direction = perpendicular to the local travel axis, so the
  // platform slides side-to-side as the player approaches.
  //
  // Amplitudes:
  //   • side-branch teasers — wider swing (50 wu) because the gap to a
  //     side branch is non-critical and the bigger motion reads better
  //     as a "look at this!" demo
  //   • main-path moving islands — `params.movingAmplitude` so each
  //     stage can dial timing difficulty independently of `waterGap`
  // Period randomised per island in [2.2s, 4.4s] so neighbours don't
  // beat in unison.
  const attachMotion = (
    isle: MawIsland, travelAngle: number, amplitude: number
  ) => {
    const perp = travelAngle + Math.PI / 2 * (rng() < 0.5 ? 1 : -1)
    const dx = Math.cos(perp) * amplitude
    const dy = Math.sin(perp) * amplitude
    isle.motion = {
      ax: isle.cx - dx,
      ay: isle.cy - dy,
      bx: isle.cx + dx,
      by: isle.cy + dy,
      periodMs: 2200 + Math.floor(rng() * 2200),
      phase: rng()
    }
  }
  // Side branches — start at sideStartIdx, count = params.sideBranches.
  for (let s = 0; s < params.movingSideBranches && s < params.sideBranches; s++) {
    const isle = islands[sideStartIdx + s]
    const angle = sideBranchAngles[s]
    if (isle && angle !== undefined) attachMotion(isle, angle, 50)
  }
  // Main path layout — `params.movingLayout` controls the pattern:
  //   • 'all'     — every interior main-path island moves (`movingMainIslands`
  //                 is ignored). Reserved for the "everything moves" set
  //                 pieces on stage 19 and the final boss.
  //   • 'cluster' — the moving islands are placed CONSECUTIVELY in the
  //                 middle of the path, so the player has to chain
  //                 swap-timings ("3 in a row" puzzle).
  //   • 'spread'  — evenly distributed; the default behaviour.
  const interior: number[] = []
  for (let k = 1; k < params.tiers; k++) interior.push(k)
  let mainSlots: number[] = []
  if (params.movingLayout === 'all') {
    mainSlots = interior.slice()
  } else if (params.movingMainIslands > 0 && interior.length > 0) {
    const n = Math.min(params.movingMainIslands, interior.length)
    if (params.movingLayout === 'cluster') {
      // Centre the run inside the interior so it doesn't bunch against
      // the home or exit island.
      const startIdx = Math.max(0, Math.floor((interior.length - n) / 2))
      for (let j = 0; j < n; j++) mainSlots.push(interior[startIdx + j]!)
    } else {
      for (let j = 0; j < n; j++) {
        mainSlots.push(interior[Math.floor((j + 0.5) * interior.length / n)]!)
      }
    }
  }
  for (const pathIdx of mainSlots) {
    const isle = islands[pathIdx]
    const angle = path[pathIdx]!.angle
    if (isle) attachMotion(isle, angle, params.movingAmplitude)
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

// Campaign is now exactly 20 stages — stage 20 is the final boss; the
// MAW-A-HERO Hall-of-Fame reward screen fires when the player wins it.
export const STAGES: MawStage[] = Array.from({ length: 20 }, (_, i) => {
  const id = i + 1
  const isBoss = id === 10 || id === 15 || id === 20
  const biome: StageBiome = id <= 5
    ? 'forest'
    : id <= 12
      ? 'wheat'
      : 'flower'
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
