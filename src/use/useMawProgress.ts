import { ref, computed, watch, type Ref } from 'vue'
import { saveDataVersion } from '@/use/useSaveStatus'
import { UPGRADES_KEY } from '@/keys'
import { getState, setState } from '@/use/useMawState'

/**
 * Player upgrades + achievements + life storage.
 * Centralised so multiple components (UpgradesModal, AchievementsModal,
 * the gameplay scene) share one reactive source of truth.
 */

export type UpgradeId = 'maxLife' | 'chainLength' | 'sawDamage' | 'coinMagnetMs' | 'rotationSpeed'

export interface UpgradeDef {
  id: UpgradeId
  name: string
  description: string
  base: number
  /** Linear cost: base * (currentLevel + 1). */
  costBase: number
  perLevel: number
  unit: string
  maxLevel: number
}

export const UPGRADES: UpgradeDef[] = [
  { id: 'maxLife',       name: 'Reinforced Frame',  description: 'Survive more bumps before breaking down.',  base: 2,    costBase: 60,  perLevel: 1,    unit: 'life',     maxLevel: 8 },
  { id: 'chainLength',   name: 'Longer Chain',      description: 'Increase reach so harder islands are within leap distance.', base: 96,   costBase: 80,  perLevel: 8,    unit: 'px',       maxLevel: 8 },
  { id: 'sawDamage',     name: 'Sharper Saws',      description: 'Cut trees from Lv. 2, stones from Lv. 4, crystals from Lv. 6.', base: 0, costBase: 200, perLevel: 1, unit: 'lvl', maxLevel: 6 },
  { id: 'coinMagnetMs',  name: 'Coin Magnet',       description: 'Coins auto-collect faster after they drop.', base: 500,  costBase: 50,  perLevel: -50,  unit: 'ms',       maxLevel: 6 },
  { id: 'rotationSpeed', name: 'Tuned Gearbox',     description: 'Spin faster — cover ground sooner.',          base: 1.0,  costBase: 70,  perLevel: 0.1,  unit: '×',        maxLevel: 6 }
]

interface UpgradeState {
  levels: Partial<Record<UpgradeId, number>>
}

const defaultState = (): UpgradeState => ({ levels: {} })

const loadState = (): UpgradeState => {
  const v = getState<Partial<UpgradeState> | null>(UPGRADES_KEY, null)
  if (v && typeof v === 'object') return { levels: v.levels ?? {} }
  return defaultState()
}

const state: Ref<UpgradeState> = ref(loadState())

watch(saveDataVersion, () => {
  state.value = loadState()
})

const persist = () => {
  setState(UPGRADES_KEY, state.value)
}

export const levelOf = (id: UpgradeId): number => state.value.levels[id] ?? 0

export const upgradedValue = (id: UpgradeId): number => {
  const def = UPGRADES.find(u => u.id === id)
  if (!def) return 0
  return def.base + def.perLevel * levelOf(id)
}

export const upgradeCost = (id: UpgradeId): number => {
  const def = UPGRADES.find(u => u.id === id)
  if (!def) return Number.POSITIVE_INFINITY
  return Math.round(def.costBase * (levelOf(id) + 1))
}

// ─── Achievements ──────────────────────────────────────────────────────────
const ACH_KEY = 'spinner_achievements'

export interface AchievementDef {
  id: string
  name: string
  description: string
  /** Coins awarded when this achievement is first claimed. */
  reward: number
  /** Predicate over the live progress map below. */
  goal: number
  metric: AchievementMetric
}

export type AchievementMetric = 'totalGrass' | 'totalCoins' | 'maxStage' | 'gamesPlayed' | 'gamesWon' | 'stumpsDestroyed'

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first-cut',        name: 'First Cut',         description: 'Maw your first 10 grass blades.',  reward: 25,  goal: 10,    metric: 'totalGrass' },
  { id: 'green-thumb',      name: 'Green Thumb',       description: 'Maw 250 grass blades total.',     reward: 100, goal: 250,   metric: 'totalGrass' },
  { id: 'lawn-tycoon',      name: 'Lawn Tycoon',       description: 'Maw 2,500 grass blades total.',   reward: 500, goal: 2500,  metric: 'totalGrass' },
  { id: 'coin-hoarder',     name: 'Coin Hoarder',      description: 'Earn 1,000 coins lifetime.',      reward: 100, goal: 1000,  metric: 'totalCoins' },
  { id: 'tycoon',           name: 'Tycoon',            description: 'Earn 10,000 coins lifetime.',     reward: 1000,goal: 10000, metric: 'totalCoins' },
  { id: 'survivor',         name: 'Survivor',          description: 'Reach stage 5.',                  reward: 75,  goal: 5,     metric: 'maxStage' },
  { id: 'territorial',      name: 'Territorial',       description: 'Reach stage 10.',                 reward: 200, goal: 10,    metric: 'maxStage' },
  { id: 'lumberjack',       name: 'Lumberjack',        description: 'Cut 5 tree stumps.',              reward: 150, goal: 5,     metric: 'stumpsDestroyed' },
  { id: 'persistent',       name: 'Persistent',        description: 'Play 25 games.',                  reward: 100, goal: 25,    metric: 'gamesPlayed' },
  { id: 'champion',         name: 'Champion',          description: 'Win 10 stages.',                  reward: 250, goal: 10,    metric: 'gamesWon' }
]

interface AchState {
  totals: Record<AchievementMetric, number>
  claimed: string[]
}

const defaultAch = (): AchState => ({
  totals: {
    totalGrass: 0,
    totalCoins: 0,
    maxStage: 1,
    gamesPlayed: 0,
    gamesWon: 0,
    stumpsDestroyed: 0
  },
  claimed: []
})

const loadAch = (): AchState => {
  const v = getState<Partial<AchState> | null>(ACH_KEY, null)
  if (v && v.totals) {
    return { totals: { ...defaultAch().totals, ...v.totals }, claimed: v.claimed ?? [] }
  }
  return defaultAch()
}

const ach: Ref<AchState> = ref(loadAch())

watch(saveDataVersion, () => {
  ach.value = loadAch()
})

const persistAch = () => {
  setState(ACH_KEY, ach.value)
}

const recordMetric = (metric: AchievementMetric, delta: number) => {
  if (metric === 'maxStage') {
    ach.value.totals[metric] = Math.max(ach.value.totals[metric], delta)
  } else {
    ach.value.totals[metric] = Math.max(0, Math.floor(ach.value.totals[metric] + delta))
  }
  persistAch()
}

const isAchUnlocked = (id: string): boolean => {
  const def = ACHIEVEMENTS.find(a => a.id === id)
  if (!def) return false
  return ach.value.totals[def.metric] >= def.goal
}

const isAchClaimed = (id: string): boolean => ach.value.claimed.includes(id)

const claimAchievement = (id: string): number => {
  const def = ACHIEVEMENTS.find(a => a.id === id)
  if (!def) return 0
  if (!isAchUnlocked(id) || isAchClaimed(id)) return 0
  ach.value.claimed = [...ach.value.claimed, id]
  persistAch()
  return def.reward
}

const pendingAchClaims = computed(() =>
  ACHIEVEMENTS.filter(a => isAchUnlocked(a.id) && !isAchClaimed(a.id)).length
)

const useMawProgress = () => {
  return {
    // Upgrades
    upgrades: state,
    levelOf,
    upgradedValue,
    upgradeCost,
    buyUpgrade: (id: UpgradeId): boolean => {
      const def = UPGRADES.find(u => u.id === id)
      if (!def) return false
      const lvl = levelOf(id)
      if (lvl >= def.maxLevel) return false
      state.value.levels = { ...state.value.levels, [id]: lvl + 1 }
      persist()
      return true
    },

    // Achievements
    achievements: ach,
    recordMetric,
    isAchUnlocked,
    isAchClaimed,
    claimAchievement,
    pendingAchClaims
  }
}

export default useMawProgress
