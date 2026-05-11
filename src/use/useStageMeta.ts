// Synchronous stage metadata.
//
// The actual stage construction (`buildStage` + grass-sampling + polygon
// hit-tests) lives in `useStageBuilder.ts`, which is loaded lazily via
// dynamic-import from `useMawCampaign.ts`. This module stays tiny so it can
// be statically imported anywhere without dragging the builder onto the
// hot path — names, count, biome/boss helpers, and the small motion-math
// helper are all that boot-time code actually needs.

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
  ax: number
  ay: number
  bx: number
  by: number
  periodMs: number
  phase?: number
}

export interface MawIsland {
  cx: number
  cy: number
  radius: number
  shape: 'round' | 'square'
  grass: Array<[number, number]>
  obstacles: Obstacle[]
  decor?: Decor[]
  motion?: MovementSpec
}

export interface MawStage {
  id: number
  name: string
  biome: StageBiome
  targetClears: number
  rewardWin: number
  rewardLose: number
  chainLength: number
  islands: MawIsland[]
  isBoss: boolean
  exitX: number
  exitY: number
}

/** Hand-picked names per stage — indexed by `id - 1`. Bosses sit at 10/15/20. */
export const STAGE_NAMES: readonly string[] = [
  'First Cuts',
  'Easy Meadow',
  'Lone Stump',
  'Stump Field',
  'Forest Edge',
  'First Boulders',
  'Stone Trail',
  'Wheat Drift',
  'Golden Path',
  'Threshing Titan',
  'Shifting Furrows',
  'Crystal Harvest',
  'Triple Bloom',
  'Wandering Petals',
  'Cluster Bloom',
  'Prism Drift',
  'Four-in-Bloom',
  'Crystal Garden',
  'Garden Tide',
  'Maw of the Garden'
] as const

export const STAGE_COUNT = STAGE_NAMES.length

export const isBossStage = (id: number): boolean =>
  id === 10 || id === 15 || id === 20

export const stageBiomeFor = (id: number): StageBiome =>
  id <= 5 ? 'forest' : id <= 12 ? 'wheat' : 'flower'

/** Returns the live position of an island at time `nowMs` (perf clock) given
 *  its motion spec. Ping-pongs A↔B with the spec's period + phase. Tiny so
 *  it lives in the sync metadata module — gameplay tick reads this every
 *  frame and shouldn't pay a dynamic-import cost. */
export const motionPositionAt = (m: MovementSpec, nowMs: number): { x: number; y: number } => {
  const phase = m.phase ?? 0
  const t = ((nowMs / m.periodMs) + phase) % 1
  const p = t < 0.5 ? t * 2 : 2 - t * 2
  return {
    x: m.ax + (m.bx - m.ax) * p,
    y: m.ay + (m.by - m.ay) * p
  }
}
