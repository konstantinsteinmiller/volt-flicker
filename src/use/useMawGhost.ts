import { ref, computed, watch, type Ref } from 'vue'
import { getState, setState } from '@/use/useMawState'
import { saveDataVersion } from '@/use/useSaveStatus'

/**
 * Ghost-robot replay + per-stage speedrun records.
 *
 * Save-blob shape — `spinner_ghost_runs` key:
 *
 *   { [stageId: string]: { bestMs, swaps, schemaV } }
 *
 * `swaps` (schemaV=2) is a flat number array packed as quadruples:
 *
 *   [t0, x0, y0, c0,  t1, x1, y1, c1,  …]
 *
 *   - `t` is milliseconds since the round started (integer)
 *   - `x` / `y` are world coords (integer)
 *   - `c` is the effective chain LEVEL at the moment of the swap — used
 *     so the ghost's chain reach is frozen to what the player had then,
 *     independent of upgrades bought since
 *
 * Older saves (no schemaV, triples [t,x,y,…]) are still loaded; their
 * stamped chain level is reported as null and the replay falls back to
 * the live chain length until the player clears the stage again.
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
 *   At MAX_SWAPS_PER_STAGE = 80 swaps × 4 numbers × 20 stages ≈ 6 400
 *   numbers ≈ ~45 KB in JSON — well inside `localStorage`'s 5 MB budget.
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
  /** Packed swap log. Format depends on `schemaV`:
   *    - schemaV === 2 (current): `[t,x,y,c, t,x,y,c, …]` quadruples.
   *      `c` is the player's effective chain level at the moment of the
   *      swap; the renderer uses it to freeze the ghost's chain reach
   *      independent of any upgrades bought since recording.
   *    - schemaV missing / older: `[t,x,y, t,x,y, …]` triples (legacy).
   *      Loaded for back-compat; the replay falls back to the live
   *      chain length until the player re-clears the stage. */
  swaps: number[]
  /** Bumped to 2 once the recording includes per-anchor chain levels. */
  schemaV?: number
}

const CURRENT_SCHEMA_V = 2
const STRIDE = 4

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
        swaps: rec.swaps,
        schemaV: typeof rec.schemaV === 'number' ? rec.schemaV : undefined
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

export const ghostRunStartRecording = (
  stageId: number, anchorX: number, anchorY: number, chainLevel: number
) => {
  liveStageId = stageId
  liveStartMs = performance.now()
  liveSwaps = [0, Math.round(anchorX), Math.round(anchorY), Math.max(0, Math.floor(chainLevel))]
  liveRunStartMs.value = liveStartMs
}

export const ghostRunRecordSwap = (anchorX: number, anchorY: number, chainLevel: number) => {
  if (liveStageId === 0) return
  const t = Math.round(performance.now() - liveStartMs)
  liveSwaps.push(t, Math.round(anchorX), Math.round(anchorY), Math.max(0, Math.floor(chainLevel)))
  // Drop the oldest non-spawn entry when over the cap. Keeps the first
  // (spawn) anchor at index 0 so the trail still starts at home.
  while (liveSwaps.length / STRIDE > MAX_SWAPS_PER_STAGE) {
    liveSwaps.splice(STRIDE, STRIDE)
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
      swaps,
      schemaV: CURRENT_SCHEMA_V
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

/** Resolve the entry stride for a stored record. Legacy (pre-schemaV)
 *  recordings used triples; current recordings use quadruples so each
 *  anchor carries its chain level. */
const strideFor = (rec: RunRecord): 3 | 4 => rec.schemaV === CURRENT_SCHEMA_V ? STRIDE : 3

/** Ghost state at `elapsedMs` since round start. Snaps to the most recent
 *  recorded swap ≤ that time — anchors are step-funcs in real gameplay
 *  so no interpolation is needed. `chainLevel` is null for legacy triple
 *  recordings; the renderer falls back to live chain length in that case.
 *  Returns null if the stage has no recording yet. */
export const ghostStateAt = (
  stageId: number, elapsedMs: number
): { x: number; y: number; chainLevel: number | null } | null => {
  const rec = runs.value[stageId]
  if (!rec || !Array.isArray(rec.swaps)) return null
  const stride = strideFor(rec)
  const swaps = rec.swaps
  if (swaps.length < stride) return null
  let activeIdx = 0
  for (let i = 0; i + stride - 1 < swaps.length; i += stride) {
    if (swaps[i]! <= elapsedMs) activeIdx = i
    else break
  }
  return {
    x: swaps[activeIdx + 1]!,
    y: swaps[activeIdx + 2]!,
    chainLevel: stride === STRIDE ? swaps[activeIdx + 3]! : null
  }
}

/** Back-compat shim — returns just the anchor. Prefer `ghostStateAt`
 *  for new call-sites that also need the stamped chain level. */
export const ghostAnchorAt = (
  stageId: number, elapsedMs: number
): { x: number; y: number } | null => {
  const s = ghostStateAt(stageId, elapsedMs)
  return s ? { x: s.x, y: s.y } : null
}

export const hasGhostForStage = (stageId: number): boolean => {
  const r = runs.value[stageId]
  if (!r || !Array.isArray(r.swaps)) return false
  return r.swaps.length >= strideFor(r)
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
