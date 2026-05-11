// Campaign state + lazy-loaded stage cache.
//
// Stage construction lives in `useStageBuilder.ts`, which is loaded via
// dynamic-import the FIRST time `ensureStage()` is called. The builder
// chunk stays off the boot critical path entirely — only stage 1 builds
// before first paint (gated through the splash via `useAssets`), and
// subsequent stages preload during the previous stage's gameplay
// (`watch(currentStageId)` triggers `ensureStage(id + 1)` as soon as the
// player enters a new stage).
//
// Public API:
//   • `ensureStage(id)` — build + cache, async, idempotent.
//   • `getStage(id)`    — sync cache lookup, returns null on cache miss.
//   • `loadAllStages()` — bulk-load every stage; used by the level editor
//     and tests. Lazy by design — never called from the gameplay path.
//   • `currentStage`    — Ref<MawStage>; reads from cache. Returns a tiny
//     stub before stage 1 finishes building. The splash gates on stage 1
//     completion, so the stub is invisible to players in practice.
//   • `STAGE_COUNT` / `STAGE_NAMES` — re-exported from useStageMeta for
//     callers that just need the count or a stage name.
import { ref, computed, watch, type Ref } from 'vue'
import { saveDataVersion } from '@/use/useSaveStatus'
import { STAGE_KEY } from '@/keys'
import { testStage, campaignOverrides } from '@/use/useCustomStages'
import { getState, setState } from '@/use/useMawState'
import {
  STAGE_COUNT,
  STAGE_NAMES,
  isBossStage,
  stageBiomeFor,
  type MawStage
} from '@/use/useStageMeta'

// Re-export sync types/helpers so existing callers don't have to change
// their import path.
export { STAGE_COUNT, STAGE_NAMES, isBossStage, stageBiomeFor, motionPositionAt } from '@/use/useStageMeta'
export type {
  MawStage,
  MawIsland,
  Obstacle,
  Decor,
  MovementSpec,
  StageBiome
} from '@/use/useStageMeta'

// In-memory build cache. Stage objects are pure data once built — safe to
// share by reference across consumers (the gameplay loop clones grass +
// obstacle arrays before mutating in `useMawGame.initIslands`).
const stageCache = new Map<number, MawStage>()

// In-flight build promises so a second `ensureStage(id)` for the same id
// while the first is still resolving doesn't kick off two builds.
const pendingBuilds = new Map<number, Promise<MawStage | null>>()

// Cached builder module reference. The first `ensureStage` pays the
// dynamic-import cost; all subsequent calls reuse this handle.
let builderModule: typeof import('@/use/useStageBuilder') | null = null
const loadBuilder = async (): Promise<typeof import('@/use/useStageBuilder')> => {
  if (builderModule) return builderModule
  builderModule = await import('@/use/useStageBuilder')
  return builderModule
}

export const ensureStage = async (id: number): Promise<MawStage | null> => {
  if (id < 1 || id > STAGE_COUNT) return null
  const cached = stageCache.get(id)
  if (cached) return cached
  const pending = pendingBuilds.get(id)
  if (pending) return pending
  const promise = (async () => {
    const { buildStage } = await loadBuilder()
    const built = buildStage(id, STAGE_NAMES[id - 1]!, stageBiomeFor(id), isBossStage(id))
    stageCache.set(id, built)
    pendingBuilds.delete(id)
    // Bump the reinit signal so any consumer whose `currentStage` watcher
    // resolved against the stub before the build finished gets a chance
    // to rebuild its runtime state off the real stage.
    if (id === currentStageId.value) stageReinitSignal.value++
    return built
  })()
  pendingBuilds.set(id, promise)
  return promise
}

export const getStage = (id: number): MawStage | null => stageCache.get(id) ?? null

/** Build every stage in order. Used by the level editor's stage list and
 *  by tests. Awaiting this is fine off the critical path — the editor is
 *  its own route chunk, and the tests run in node where there's no splash
 *  to block. */
export const loadAllStages = async (): Promise<MawStage[]> => {
  const out: MawStage[] = []
  for (let i = 1; i <= STAGE_COUNT; i++) {
    const s = await ensureStage(i)
    if (s) out.push(s)
  }
  return out
}

const readStoredStage = (): number => {
  const v = getState<unknown>(STAGE_KEY)
  if (v === undefined || v === null) return 1
  const n = typeof v === 'number' ? v : parseInt(String(v), 10)
  if (!Number.isFinite(n)) return 1
  return Math.max(1, Math.min(STAGE_COUNT, n))
}

const currentStageId: Ref<number> = ref(readStoredStage())

const persistStage = (id: number) => {
  setState(STAGE_KEY, id)
}

watch(saveDataVersion, () => {
  currentStageId.value = readStoredStage()
})

// Minimal stub returned by `currentStage` before the real stage 1 finishes
// building. The splash blocks on `ensureStage(1)` via the asset preloader,
// so this stub never surfaces in normal play — it exists purely so the
// reactive `MawStage` shape stays non-null for early access during boot.
const STAGE_STUB: MawStage = {
  id: 0,
  name: '',
  biome: 'forest',
  targetClears: 1,
  rewardWin: 0,
  rewardLose: 0,
  chainLength: 96,
  islands: [{ cx: 0, cy: 0, radius: 200, shape: 'round', grass: [], obstacles: [] }],
  isBoss: false,
  exitX: 0,
  exitY: 0
}

const currentStage = computed<MawStage>(() => {
  if (testStage.value) return testStage.value
  const override = campaignOverrides.value[currentStageId.value]
  if (override) return override
  return stageCache.get(currentStageId.value) ?? STAGE_STUB
})
const isLastStage = computed(() => currentStageId.value >= STAGE_COUNT)

const stageReinitSignal = ref(0)

// Preload the current stage (in case the splash didn't gate on it, e.g.
// the player resumed at stage 7) and the NEXT stage so finishing the
// current run swaps in zero-delay. Fires immediately at module load
// and again whenever `currentStageId` changes.
watch(currentStageId, (id) => {
  void ensureStage(id)
  void ensureStage(id + 1)
}, { immediate: true })

export default function useMawCampaign() {
  const advanceStage = () => {
    if (currentStageId.value < STAGE_COUNT) {
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
   *  MawScene rebuilds the world geometry, and clamps to the valid range. */
  const setStageId = (id: number) => {
    const next = Math.max(1, Math.min(STAGE_COUNT, Math.floor(id)))
    if (next === currentStageId.value) {
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
    stageReinitSignal,
    ensureStage,
    getStage,
    loadAllStages
  }
}
