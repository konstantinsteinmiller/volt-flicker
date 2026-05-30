import { ref, computed, watch, type Ref, type ComputedRef } from 'vue'
import { saveDataVersion, flushSaveNow } from '@/use/useSaveStatus'
import { getState, setState, epicancerState } from '@/use/useEpicState'
import { STAGE_KEY, BEST_SCORE_KEY, UPGRADES_KEY } from '@/keys'
import useEpicConfig from '@/use/useEpicConfig'

// ─── Stage / progression model ──────────────────────────────────────────────
//
// Stage 1 clears at 200 tiles; each subsequent stage needs +100 more
// (300, 400, …). Reaching the target = a win; the player advances to the next
// stage on their next run. Stage, best score, lifetime games and max-stage all
// live as fields inside the single `epicancer_state` blob.

const GAMES_PLAYED_KEY = 'epic_games_played'
const MAX_STAGE_KEY = 'epic_max_stage'

/** Tiles required to clear a given stage. */
export const tilesToClear = (stage: number): number => 200 + (Math.max(1, stage) - 1) * 100

// ─── Upgrade catalogue ────────────────────────────────────────────────────
//
// Permanent, coin-bought boosts that deepen the meta loop. Each value is read
// via `upgradedValue(id)` = base + level * perLevel.

export interface UpgradeDef {
  id: string
  maxLevel: number
  base: number
  perLevel: number
  costBase: number
  costGrowth: number
  /** Stage the upgrade unlocks at (1 = available from the start). */
  unlockStage: number
}

export const UPGRADES: ReadonlyArray<UpgradeDef> = [
  // +0.75s to EVERY power-up's duration per level.
  { id: 'powerupDuration', maxLevel: 6, base: 0, perLevel: 0.75, costBase: 150, costGrowth: 1.55, unlockStage: 1 },
  // Coin-magnet pickup radius multiplier (+0.25× per level over the base 1×).
  { id: 'magnetRange', maxLevel: 5, base: 1, perLevel: 0.25, costBase: 200, costGrowth: 1.6, unlockStage: 1 },
  // Coins earned per pickup (base 1, +1 per level).
  { id: 'coinValue', maxLevel: 5, base: 1, perLevel: 1, costBase: 250, costGrowth: 1.7, unlockStage: 2 },
  // Item-box frequency: lower spacing → more boxes. Stored as "boxes-per-100
  // tiles" bonus; consumed by the spawn director. Base 0, +1 per level.
  { id: 'itemLuck', maxLevel: 5, base: 0, perLevel: 1, costBase: 300, costGrowth: 1.7, unlockStage: 3 }
] as const

interface UpgradeState { levels: Record<string, number> }

const readNumber = (key: string, fallback: number): number => {
  const v = getState<unknown>(key)
  if (v === undefined || v === null) return fallback
  const n = typeof v === 'number' ? v : parseInt(String(v), 10)
  return Number.isFinite(n) ? n : fallback
}

const loadUpgrades = (): UpgradeState => {
  const v = getState<Partial<UpgradeState> | null>(UPGRADES_KEY, null)
  const levels: Record<string, number> = {}
  if (v && v.levels && typeof v.levels === 'object') {
    for (const def of UPGRADES) {
      const lvl = (v.levels as Record<string, unknown>)[def.id]
      if (typeof lvl === 'number' && Number.isFinite(lvl)) {
        levels[def.id] = Math.max(0, Math.min(def.maxLevel, Math.floor(lvl)))
      }
    }
  }
  return { levels }
}

const stage: Ref<number> = ref(Math.max(1, readNumber(STAGE_KEY, 1)))
const bestScore: Ref<number> = ref(readNumber(BEST_SCORE_KEY, 0))
const gamesPlayed: Ref<number> = ref(readNumber(GAMES_PLAYED_KEY, 0))
const maxStage: Ref<number> = ref(Math.max(1, readNumber(MAX_STAGE_KEY, stage.value)))
const upgrades: Ref<UpgradeState> = ref(loadUpgrades())

const refresh = (): void => {
  stage.value = Math.max(1, readNumber(STAGE_KEY, stage.value))
  bestScore.value = readNumber(BEST_SCORE_KEY, bestScore.value)
  gamesPlayed.value = readNumber(GAMES_PLAYED_KEY, gamesPlayed.value)
  maxStage.value = Math.max(1, readNumber(MAX_STAGE_KEY, maxStage.value))
  upgrades.value = loadUpgrades()
}
watch(saveDataVersion, refresh)
watch(epicancerState, refresh, { deep: false })

// ─── Public reactive surface (also consumed by gamepixPlugin) ───────────────

/** Lifetime number of runs started. Used for the GamePix happy-moment cadence
 *  and leaderboard score posting. */
export const gamesPlayedTotal: ComputedRef<number> = computed(() => gamesPlayed.value)
/** Highest stage the player has ever reached — GamePix level metric. */
export const maxStageReached: ComputedRef<number> = computed(() => maxStage.value)

export const levelOf = (id: string): number => upgrades.value.levels[id] ?? 0

export const upgradedValue = (id: string): number => {
  const def = UPGRADES.find((u) => u.id === id)
  if (!def) return 0
  return def.base + levelOf(id) * def.perLevel
}

export const upgradeCost = (id: string): number => {
  const def = UPGRADES.find((u) => u.id === id)
  if (!def) return Infinity
  const lvl = levelOf(id)
  if (lvl >= def.maxLevel) return Infinity
  return Math.round(def.costBase * Math.pow(def.costGrowth, lvl))
}

const persistUpgrades = (): void => setState(UPGRADES_KEY, upgrades.value)

export default function useEpicProgress() {
  const { coins, spendCoins } = useEpicConfig()

  const isUnlocked = (id: string): boolean => {
    const def = UPGRADES.find((u) => u.id === id)
    return !!def && maxStage.value >= def.unlockStage
  }

  const canBuy = (id: string): boolean => {
    const def = UPGRADES.find((u) => u.id === id)
    if (!def) return false
    if (!isUnlocked(id)) return false
    if (levelOf(id) >= def.maxLevel) return false
    return coins.value >= upgradeCost(id)
  }

  const buyUpgrade = (id: string): boolean => {
    if (!canBuy(id)) return false
    const cost = upgradeCost(id)
    if (!spendCoins(cost)) return false
    const next: UpgradeState = { levels: { ...upgrades.value.levels } }
    next.levels[id] = levelOf(id) + 1
    upgrades.value = next
    persistUpgrades()
    void flushSaveNow()
    return true
  }

  /** Advance to the next stage (on a win). Persists immediately. */
  const advanceStage = (): void => {
    stage.value += 1
    setState(STAGE_KEY, stage.value)
    if (stage.value > maxStage.value) {
      maxStage.value = stage.value
      setState(MAX_STAGE_KEY, maxStage.value)
    }
    void flushSaveNow()
  }

  /** Count a started run (battle-pass + happy-moment cadence). */
  const recordGamePlayed = (): void => {
    gamesPlayed.value += 1
    setState(GAMES_PLAYED_KEY, gamesPlayed.value)
  }

  /** Record a finished run's score; updates the personal best. */
  const recordScore = (score: number): boolean => {
    if (!Number.isFinite(score) || score <= bestScore.value) return false
    bestScore.value = Math.floor(score)
    setState(BEST_SCORE_KEY, bestScore.value)
    void flushSaveNow()
    return true
  }

  return {
    stage,
    bestScore,
    gamesPlayed,
    maxStage,
    upgrades,
    coins,
    tilesToClear,
    isUnlocked,
    canBuy,
    buyUpgrade,
    advanceStage,
    recordGamePlayed,
    recordScore,
    levelOf,
    upgradedValue,
    upgradeCost,
    UPGRADES
  }
}
