import { ref, computed, watch, type Ref } from 'vue'
import { getState, setState } from '@/use/useMawState'
import { saveDataVersion } from '@/use/useSaveStatus'

/**
 * Ghost-robot replay + per-stage speedrun records.
 *
 * Save-blob shape — `spinner_ghost_runs` key:
 *
 *   { [stageId: string]: { bestMs: number | null, swaps: number[] } }
 *
 * `swaps` is a flat number array packed as triples:
 *
 *   [t0, x0, y0,  t1, x1, y1,  t2, x2, y2,  …]
 *
 *   - `t` is milliseconds since the round started (integer)
 *   - `x` / `y` are world coords (integer)
 *
 * Why this shape?
 *
 *   The anchor in Spin&Mow is a step function — it teleports on every
 *   swap and is otherwise static. Sampling per frame would record the
 *   same position 60 times a second; sampling on swap events alone
 *   captures the entire anchor trajectory with zero loss.
 *
 *   The swing gear is NOT recorded — its position is fully determined
 *   by `anchor + cos/sin(angle) * chainLength`, and the ghost replays
 *   it at the engine's base rotation speed. Skipping the swing log
 *   roughly halves the per-swap payload.
 *
 *   At MAX_SWAPS_PER_STAGE = 80 swaps × 3 numbers × 20 stages ≈ 4 800
 *   numbers ≈ ~35 KB in JSON — well inside `localStorage`'s 5 MB budget.
 *
 * Persistence is debounced through `setState`, same as every other write
 * the engine does, so live recording is essentially free at runtime.
 */

const GHOST_KEY = 'spinner_ghost_runs'
const SPEEDRUN_MODE_KEY = 'spinner_speedrun_mode'
/** Cap so a stage with pathological click-spam can't blow up the blob.
 *  A normal clear hits 20-40 swaps — 80 is comfortable headroom. */
const MAX_SWAPS_PER_STAGE = 80

interface RunRecord {
  /** Lowest cleared time for this stage, or null if never cleared. */
  bestMs: number | null
  /** Packed swap log `[t,x,y, t,x,y, …]` — integers only. The LATEST
   *  completed attempt, not the record-time attempt, so the ghost
   *  reflects how the player most recently played the stage. */
  swaps: number[]
}

// ─── Persistence (top-level so hot reload doesn't double-init) ──────────

const loadRuns = (): Record<number, RunRecord> => {
  const v = getState<Record<string, RunRecord> | null>(GHOST_KEY, null)
  if (!v || typeof v !== 'object') return {}
  const out: Record<number, RunRecord> = {}
  for (const k of Object.keys(v)) {
    const n = parseInt(k, 10)
    if (!Number.isFinite(n)) continue
    const rec = v[k]
    if (rec && Array.isArray(rec.swaps)) {
      out[n] = {
        bestMs: typeof rec.bestMs === 'number' ? rec.bestMs : null,
        swaps: rec.swaps
      }
    }
  }
  return out
}

const persistRuns = (data: Record<number, RunRecord>) => {
  setState(GHOST_KEY, data)
}

const runs: Ref<Record<number, RunRecord>> = ref(loadRuns())

watch(saveDataVersion, () => {
  runs.value = loadRuns()
})

// ─── Live recording state (per-attempt buffer) ──────────────────────────

let liveStageId = 0
let liveStartMs = 0
let liveSwaps: number[] = []
/** Mirror of `liveStartMs` exposed reactively so MawScene can drive the
 *  speedrun timer off a single source. `0` means no run is in progress. */
export const liveRunStartMs: Ref<number> = ref(0)

export const ghostRunStartRecording = (stageId: number, anchorX: number, anchorY: number) => {
  liveStageId = stageId
  liveStartMs = performance.now()
  liveSwaps = [0, Math.round(anchorX), Math.round(anchorY)]
  liveRunStartMs.value = liveStartMs
}

export const ghostRunRecordSwap = (anchorX: number, anchorY: number) => {
  if (liveStageId === 0) return
  const t = Math.round(performance.now() - liveStartMs)
  liveSwaps.push(t, Math.round(anchorX), Math.round(anchorY))
  // Drop the oldest non-spawn entry when over the cap. Keeps the first
  // (spawn) anchor at index 0 so the trail still starts at home.
  while (liveSwaps.length / 3 > MAX_SWAPS_PER_STAGE) {
    liveSwaps.splice(3, 3)
  }
}

export const ghostRunCommitWin = (stageId: number, elapsedMs: number) => {
  if (liveStageId === 0 || stageId !== liveStageId) return
  const swaps = liveSwaps.slice()
  const existing = runs.value[stageId]
  const prevBest = existing?.bestMs ?? null
  const isNewBest = prevBest === null || elapsedMs < prevBest
  runs.value = {
    ...runs.value,
    [stageId]: {
      bestMs: isNewBest ? Math.round(elapsedMs) : prevBest,
      swaps
    }
  }
  persistRuns(runs.value)
  ghostRunReset()
  return { isNewBest, prevBest, time: Math.round(elapsedMs) }
}

export const ghostRunReset = () => {
  liveStageId = 0
  liveStartMs = 0
  liveSwaps = []
  liveRunStartMs.value = 0
}

// ─── Queries used by MawScene's renderer + win modal ────────────────────

export const ghostBestTime = (stageId: number): number | null => {
  return runs.value[stageId]?.bestMs ?? null
}

const ghostSwapsForStage = (stageId: number): number[] | null => {
  return runs.value[stageId]?.swaps ?? null
}

/** Anchor of the ghost robot at `elapsedMs` since round start. Snaps to
 *  the most recent recorded swap ≤ that time — anchors are step-funcs
 *  in real gameplay so no interpolation is needed. Returns null if the
 *  stage has no recording yet. */
export const ghostAnchorAt = (
  stageId: number, elapsedMs: number
): { x: number; y: number } | null => {
  const swaps = ghostSwapsForStage(stageId)
  if (!swaps || swaps.length < 3) return null
  let activeIdx = 0
  for (let i = 0; i + 2 < swaps.length; i += 3) {
    if (swaps[i]! <= elapsedMs) activeIdx = i
    else break
  }
  return {
    x: swaps[activeIdx + 1]!,
    y: swaps[activeIdx + 2]!
  }
}

export const hasGhostForStage = (stageId: number): boolean => {
  const r = runs.value[stageId]
  return !!(r && Array.isArray(r.swaps) && r.swaps.length >= 3)
}

// ─── Speedrun toggle ────────────────────────────────────────────────────
// Persisted player preference: when true, gameplay surfaces a live
// timer + per-stage best, and the UI emphasises "beat your time".

const readSpeedrunMode = (): boolean => Boolean(getState<boolean>(SPEEDRUN_MODE_KEY, false))
export const speedrunMode: Ref<boolean> = ref(readSpeedrunMode())

watch(saveDataVersion, () => {
  speedrunMode.value = readSpeedrunMode()
})

export const toggleSpeedrunMode = (): boolean => {
  speedrunMode.value = !speedrunMode.value
  setState(SPEEDRUN_MODE_KEY, speedrunMode.value)
  return speedrunMode.value
}

/** Total clear count across all stages — handy for the "Hall of Fame"
 *  achievement and any speedrun-related onboarding. */
export const ghostRunCount = computed(() => Object.keys(runs.value).length)
