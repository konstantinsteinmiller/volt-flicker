// Heavy stage construction — pulled out of `useMawCampaign.ts` so it can
// ship as its own dynamic-import chunk. Loading the campaign module no
// longer triggers any per-stage build work; callers ask for a stage by id
// via `ensureStage(id)` in `useMawCampaign`, which lazy-loads THIS module
// the first time and then caches each built stage.
//
// Time-to-first-gameplay impact: building all 20 stages used to run at
// module-evaluation of `useMawCampaign`. Each stage runs hundreds of
// grass-blade samples through polygon hit-tests + RNG, so on a mid-tier
// mobile that's ~30-80 ms of CPU work blocking the splash. With the
// split, only stage 1 builds before first paint (gated through the
// asset preloader); subsequent stages build during the previous stage's
// gameplay (preload-on-entry).

import { islandEdgeAlong, sampleInsideIsland } from '@/use/useIslandShapes'
import type { MawIsland, MawStage, Obstacle, StageBiome } from '@/use/useStageMeta'

const edgeRadius = (r: number, shape: 'round' | 'square', angle: number): number =>
  islandEdgeAlong(shape, r, angle)

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

interface StageParams {
  tiers: number
  islandRadiusRange: [number, number]
  obstacleBudget: { stumps: number; boulders: number; crystals: number }
  sideBranches: number
  pathTurnAmplitude: number
  forceRound: boolean
  targetClears: number
  rewardWin: number
  movingSideBranches: number
  movingMainIslands: number
  waterGap: number
  movingAmplitude: number
  movingLayout: 'spread' | 'cluster' | 'all'
}

const movingCounts = (id: number, isBoss: boolean) => {
  if (isBoss) {
    if (id === 10) return { side: 1, main: 3 }
    if (id === 15) return { side: 2, main: 4 }
    if (id === 20) return { side: 2, main: 6 }
    return { side: 1, main: 3 }
  }
  if (id === 2 || id === 3) return { side: 1, main: 0 }
  if (id < 6) return { side: 0, main: 0 }
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

const STAGE_DEFAULTS = {
  waterGap: 60,
  movingAmplitude: 24,
  movingLayout: 'spread' as const
}

const stageParams = (id: number, isBoss: boolean): StageParams => {
  const moving = movingCounts(id, isBoss)
  if (isBoss) {
    if (id === 10) return {
      tiers: 8, islandRadiusRange: [108, 132],
      obstacleBudget: { stumps: 4, boulders: 3, crystals: 1 },
      sideBranches: 2, pathTurnAmplitude: 0.7,
      forceRound: false, targetClears: 260, rewardWin: 600,
      movingSideBranches: moving.side, movingMainIslands: moving.main,
      waterGap: 64, movingAmplitude: 28, movingLayout: 'spread'
    }
    if (id === 15) return {
      tiers: 10, islandRadiusRange: [95, 120],
      obstacleBudget: { stumps: 6, boulders: 5, crystals: 4 },
      sideBranches: 3, pathTurnAmplitude: 0.85,
      forceRound: false, targetClears: 420, rewardWin: 1200,
      movingSideBranches: moving.side, movingMainIslands: moving.main,
      waterGap: 74, movingAmplitude: 32, movingLayout: 'cluster'
    }
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
  if (id <= 9) {
    const local = id - 3
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
    tiers: 11, islandRadiusRange: [82, 105],
    obstacleBudget: { stumps: 7, boulders: 6, crystals: 6 },
    sideBranches: 3, pathTurnAmplitude: 0.82,
    forceRound: false, targetClears: 380, rewardWin: 1000,
    movingSideBranches: moving.side, movingMainIslands: moving.main,
    waterGap: 82, movingAmplitude: 32, movingLayout: 'all'
  }
  return {
    tiers: 8, islandRadiusRange: [92, 118],
    obstacleBudget: { stumps: 4, boulders: 3, crystals: 3 },
    sideBranches: 2, pathTurnAmplitude: 0.7,
    forceRound: false, targetClears: 240, rewardWin: 500,
    movingSideBranches: moving.side, movingMainIslands: moving.main,
    ...STAGE_DEFAULTS
  }
}

export const buildStage = (
  id: number,
  name: string,
  biome: StageBiome,
  isBoss: boolean
): MawStage => {
  const rng = seededRng(id * 9301 + 49297)
  const params = stageParams(id, isBoss)
  const chainLength = 96
  const rewardLose = Math.max(5, Math.round(params.rewardWin * 0.08))

  const WATER_GAP = params.waterGap

  const islands: MawIsland[] = []
  const homeR = 200
  const homeObstacles: Obstacle[] = (!isBoss && id >= 3)
    ? [{ type: 'stump', x: -110, y: -70 }]
    : []
  islands.push(buildIsland(0, 0, homeR, 'round', isBoss ? 0 : 2, homeObstacles, rng))

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
    islands.push(buildIsland(curX, curY, r, shape, 18, [], rng))
    path.push({ cx: curX, cy: curY, r, shape, angle: curAngle })
    curR = r
    prevShape = shape
  }

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
  for (let s = 0; s < params.movingSideBranches && s < params.sideBranches; s++) {
    const isle = islands[sideStartIdx + s]
    const angle = sideBranchAngles[s]
    if (isle && angle !== undefined) attachMotion(isle, angle, 50)
  }
  const interior: number[] = []
  for (let k = 1; k < params.tiers; k++) interior.push(k)
  let mainSlots: number[] = []
  if (params.movingLayout === 'all') {
    mainSlots = interior.slice()
  } else if (params.movingMainIslands > 0 && interior.length > 0) {
    const n = Math.min(params.movingMainIslands, interior.length)
    if (params.movingLayout === 'cluster') {
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

  const exit = path[path.length - 1]!
  const exitX = exit.cx
  const exitY = exit.cy

  interface Slot { idx: number; isSide: boolean }
  const slots: Slot[] = []
  for (let k = 1; k < path.length - 1; k++) slots.push({ idx: k, isSide: false })
  for (let k = 0; k < params.sideBranches; k++) slots.push({ idx: sideStartIdx + k, isSide: true })

  const queue: Array<{ type: Obstacle['type']; preferSide: boolean }> = []
  for (let k = 0; k < params.obstacleBudget.crystals; k++) queue.push({ type: 'crystal', preferSide: true })
  for (let k = 0; k < params.obstacleBudget.boulders; k++) queue.push({ type: 'boulder', preferSide: false })
  for (let k = 0; k < params.obstacleBudget.stumps; k++) queue.push({ type: 'stump', preferSide: false })

  const perIsleBudgets = new Map<number, { stumps: number; boulders: number; crystals: number }>()
  const ensureBudget = (idx: number) => {
    let b = perIsleBudgets.get(idx)
    if (!b) { b = { stumps: 0, boulders: 0, crystals: 0 }; perIsleBudgets.set(idx, b) }
    return b
  }
  for (let pass = 0; queue.length > 0; pass++) {
    const order = slots.slice().sort((a, b) => {
      const aSide = a.isSide ? 0 : 1
      const bSide = b.isSide ? 0 : 1
      return (aSide - bSide) + (rng() - 0.5)
    })
    let placedAny = false
    for (const slot of order) {
      if (queue.length === 0) break
      let pickIdx = queue.findIndex(q => q.preferSide === slot.isSide)
      if (pickIdx < 0) pickIdx = 0
      const item = queue[pickIdx]!
      const b = ensureBudget(slot.idx)
      b[(item.type + 's') as 'stumps' | 'boulders' | 'crystals'] += 1
      queue.splice(pickIdx, 1)
      placedAny = true
    }
    if (!placedAny) break
  }

  for (const [idx, budget] of perIsleBudgets) {
    const isle = islands[idx]
    if (!isle) continue
    const exitPole = (idx === path.length - 1) ? { x: exitX, y: exitY } : null
    const placed = placeObstaclesOnIsland(
      isle.cx, isle.cy, isle.radius, isle.shape,
      budget, exitPole, rng
    )
    if (placed.length > 0) {
      islands[idx] = buildIsland(
        isle.cx, isle.cy, isle.radius, isle.shape,
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
