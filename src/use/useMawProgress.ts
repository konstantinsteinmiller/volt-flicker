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
  // Sharper Saws leads the list — it's the gate that unlocks the whole
  // obstacle-cutting fantasy and the first upgrade the tutorial drives
  // the player toward.
  { id: 'sawDamage',     name: 'Sharper Saws',      description: 'Cut trees from Lv. 1, stones from Lv. 3, crystals from Lv. 6, Liberty statues from Lv. 8.', base: 0, costBase: 200, perLevel: 1, unit: 'lvl', maxLevel: 8 },
  { id: 'maxLife',       name: 'Reinforced Frame',  description: 'Survive more bumps before breaking down.',  base: 2,    costBase: 60,  perLevel: 1,    unit: 'life',     maxLevel: 8 },
  { id: 'chainLength',   name: 'Longer Chain',      description: 'Increase reach so harder islands are within leap distance. Levels 9 and 10 are end-game goals.', base: 96,   costBase: 80,  perLevel: 8,    unit: 'px',       maxLevel: 10 },
  { id: 'coinMagnetMs',  name: 'Coin Magnet',       description: 'Coins auto-collect faster after they drop.', base: 500,  costBase: 50,  perLevel: -50,  unit: 'ms',       maxLevel: 6 },
  // Tuned Gearbox has no real ceiling — once past level 6 it stops
  // affecting gameplay balance and only matters for speedrun bragging
  // rights. The cost curve goes exponential past level 5 (see
  // `upgradeCost` below) so any further upgrades effectively require
  // a watch-ad sequence. Hard cap at 99 just to keep the integer math
  // from blowing up over a long-lived save.
  { id: 'rotationSpeed', name: 'Tuned Gearbox',     description: 'Spin faster — cover ground sooner. Levels past 6 are speedrun-only.', base: 1.0,  costBase: 70,  perLevel: 0.1,  unit: '×',        maxLevel: 99 }
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

// ─── Active chain-length cap ───────────────────────────────────────────────
// Players can dial the live chain length DOWN below their purchased level
// when small islands need tighter swings, and back up later. Caps at the
// purchased level so it never grants reach you haven't paid for.
// `null` = use the purchased level (no cap).
const ACTIVE_CHAIN_KEY = 'spinner_active_chain_level'
const readActiveChain = (): number | null => {
  const v = getState<unknown>(ACTIVE_CHAIN_KEY, null)
  return (typeof v === 'number' && Number.isFinite(v)) ? Math.max(0, Math.floor(v)) : null
}
export const activeChainLevel: Ref<number | null> = ref(readActiveChain())

watch(saveDataVersion, () => {
  activeChainLevel.value = readActiveChain()
})

const persistActiveChain = () => {
  setState(ACTIVE_CHAIN_KEY, activeChainLevel.value)
}

/** Live (capped) level for chainLength; identity for every other upgrade.
 *  Used by `upgradedValue` so the chain shrinks/grows on demand without
 *  touching the purchased-upgrade ledger. */
export const effectiveLevelOf = (id: UpgradeId): number => {
  const purchased = levelOf(id)
  if (id === 'chainLength' && activeChainLevel.value !== null) {
    return Math.min(purchased, Math.max(0, activeChainLevel.value))
  }
  return purchased
}

export const upgradedValue = (id: UpgradeId): number => {
  const def = UPGRADES.find(u => u.id === id)
  if (!def) return 0
  return def.base + def.perLevel * effectiveLevelOf(id)
}

/** Compute chain reach (px) for a given chain level without consulting
 *  live upgrade state. Used by the ghost replay so its silhouette swings
 *  at the chain length the player had when each anchor was stamped,
 *  independent of any upgrades bought since. */
export const chainLengthForLevel = (level: number): number => {
  const def = UPGRADES.find(u => u.id === 'chainLength')
  if (!def) return 0
  return def.base + def.perLevel * Math.max(0, level)
}

export const upgradeCost = (id: UpgradeId): number => {
  const def = UPGRADES.find(u => u.id === id)
  if (!def) return Number.POSITIVE_INFINITY
  const lvl = levelOf(id)
  const linear = def.costBase * (lvl + 1)
  // Tuned Gearbox special-case: past level 5 (i.e. the player has
  // already bought the first 6 tiers) the cost ramps geometrically so
  // each further level effectively requires the watch-ad path. The
  // gameplay impact above Lv 6 is cosmetic / speedrun-only, so making
  // it expensive doesn't hurt anyone except whales who want it.
  if (id === 'rotationSpeed' && lvl >= 5) {
    const ramp = Math.pow(2.5, lvl - 5)
    return Math.round(linear * ramp)
  }
  // Longer Chain levels 9 and 10 are intentional long-term goals: the
  // first 8 tiers stay on the linear curve (so the gameplay-critical
  // reach gains stay affordable), then the cost ramps hard so the last
  // two levels become a coin-hoarding aspiration rather than a routine
  // purchase.
  if (id === 'chainLength' && lvl >= 8) {
    const ramp = Math.pow(5, lvl - 7)
    return Math.round(linear * ramp)
  }
  return Math.round(linear)
}

// ─── First-death-from-obstacle flag ───────────────────────────────────────
// Set the first time the player loses to a stump / boulder (life ran out).
// Used by MawScene to display a one-time onboarding hint ("upgrade Sharper
// Saw to Lv 2") on the lose screen and during battle until the player
// actually buys saw level 2.
const BROKEN_FROM_OBSTACLE_KEY = 'spinner_first_broken_from_obstacle'
export const hasBrokenFromObstacle: Ref<boolean> = ref(
  Boolean(getState<boolean>(BROKEN_FROM_OBSTACLE_KEY, false))
)
watch(saveDataVersion, () => {
  hasBrokenFromObstacle.value = Boolean(getState<boolean>(BROKEN_FROM_OBSTACLE_KEY, false))
})
export const markBrokenFromObstacle = () => {
  if (hasBrokenFromObstacle.value) return
  hasBrokenFromObstacle.value = true
  setState(BROKEN_FROM_OBSTACLE_KEY, true)
}

/** Step the active chain-length level up/down by 1, clamped to
 *  [0, purchased]. `source` is recorded so we can tell scroll-driven
 *  adjustments apart from the HUD-button taps — the lesson-learnt logic
 *  for the desktop scroll hint only counts scroll uses. */
export const adjustActiveChainLevel = (
  delta: 1 | -1,
  source: 'button' | 'scroll' = 'button'
): number => {
  const purchased = levelOf('chainLength')
  const current = activeChainLevel.value ?? purchased
  const next = Math.max(0, Math.min(purchased, current + delta))
  if (next !== current) {
    activeChainLevel.value = next
    persistActiveChain()
    if (source === 'scroll') recordChainScrollUse()
  }
  return next
}

// ─── Chain-scroll desktop-onboarding hint ─────────────────────────────────
// State + helpers driving the "scroll to increase/decrease the chain
// length" hint on desktop. Three signals get tracked:
//   • chainUpgradeFirstGameCount — the gamesPlayed total at the moment
//     the player buys their first chainLength upgrade. The hint cadence
//     keys off this baseline so it starts on the very first attempt
//     after the upgrade unlocks.
//   • chainScrollUseCount — counts SCROLL-driven adjustments only. Once
//     it crosses CHAIN_SCROLL_LEARNT_THRESHOLD, the hint is considered
//     "learnt" and drops to a slower cadence.
//   • chainScrollHintShownCount — total hint impressions. The first
//     one renders with a shine; subsequent ones don't.
const CHAIN_UPGRADE_FIRST_GAME_KEY = 'spinner_chain_upgrade_first_game'
const CHAIN_SCROLL_USE_KEY = 'spinner_chain_scroll_use_count'
const CHAIN_SCROLL_HINT_SHOWN_KEY = 'spinner_chain_scroll_hint_shown'
const CHAIN_SCROLL_LEARNT_THRESHOLD = 3

const readNum = (k: string): number | null => {
  const v = getState<unknown>(k, null)
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

export const chainUpgradeFirstGameCount: Ref<number | null> = ref(readNum(CHAIN_UPGRADE_FIRST_GAME_KEY))
export const chainScrollUseCount: Ref<number> = ref(readNum(CHAIN_SCROLL_USE_KEY) ?? 0)
export const chainScrollHintShownCount: Ref<number> = ref(readNum(CHAIN_SCROLL_HINT_SHOWN_KEY) ?? 0)

watch(saveDataVersion, () => {
  chainUpgradeFirstGameCount.value = readNum(CHAIN_UPGRADE_FIRST_GAME_KEY)
  chainScrollUseCount.value = readNum(CHAIN_SCROLL_USE_KEY) ?? 0
  chainScrollHintShownCount.value = readNum(CHAIN_SCROLL_HINT_SHOWN_KEY) ?? 0
})

/** True once the player has nudged the chain via scroll enough times
 *  that we stop nagging on every cadence cycle. */
export const chainScrollLessonLearnt = computed(() =>
  chainScrollUseCount.value >= CHAIN_SCROLL_LEARNT_THRESHOLD
)

function recordChainScrollUse() {
  chainScrollUseCount.value += 1
  setState(CHAIN_SCROLL_USE_KEY, chainScrollUseCount.value)
}

export const markChainScrollHintShown = () => {
  chainScrollHintShownCount.value += 1
  setState(CHAIN_SCROLL_HINT_SHOWN_KEY, chainScrollHintShownCount.value)
}

/** Called by `buyUpgrade` when chainLength first reaches level 1, so the
 *  hint cadence has a baseline to count attempts from. */
const recordFirstChainUpgrade = (gamesPlayedAtPurchase: number) => {
  if (chainUpgradeFirstGameCount.value !== null) return
  chainUpgradeFirstGameCount.value = gamesPlayedAtPurchase
  setState(CHAIN_UPGRADE_FIRST_GAME_KEY, gamesPlayedAtPurchase)
}

/** Public version of the above. Used by MawScene to retroactively stamp
 *  the baseline for players who already owned the chain upgrade before
 *  the hint-cadence code shipped — without this, their baseline stays
 *  null and the scroll hint never fires. Idempotent. */
export const ensureChainScrollBaseline = () => {
  if (chainUpgradeFirstGameCount.value !== null) return
  recordFirstChainUpgrade(ach.value.totals.gamesPlayed)
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

export type AchievementMetric =
  | 'totalGrass'
  | 'totalCoins'
  | 'maxStage'
  | 'gamesPlayed'
  | 'gamesWon'
  | 'stumpsDestroyed'
  | 'bouldersDestroyed'
  | 'crystalsDestroyed'
  | 'libertiesDestroyed'
  /** Number of times the player set a new best time on any stage. */
  | 'newRecordsSet'
  /** Cleared a stage in under 10 seconds (count of such clears). */
  | 'subTenSecondWins'
  /** Best (= lowest) clear time the player has set on any single stage,
   *  in seconds, rounded down. Stored as Math.floor(60 - secs) so the
   *  metric is "higher = better" like every other counter — when a 12 s
   *  clear lands, the metric goes to 48; a 6 s clear pushes it to 54. */
  | 'bestSecondsFloor'

export const ACHIEVEMENTS: AchievementDef[] = [
  // Cutting / lifetime totals
  { id: 'first-cut',        name: 'First Cut',         description: 'Maw your first 10 grass blades.',  reward: 25,  goal: 10,    metric: 'totalGrass' },
  { id: 'green-thumb',      name: 'Green Thumb',       description: 'Maw 250 grass blades total.',     reward: 100, goal: 250,   metric: 'totalGrass' },
  { id: 'lawn-tycoon',      name: 'Lawn Tycoon',       description: 'Maw 2,500 grass blades total.',   reward: 500, goal: 2500,  metric: 'totalGrass' },
  { id: 'lumberjack',       name: 'Lumberjack',        description: 'Cut 5 tree stumps.',              reward: 150, goal: 5,     metric: 'stumpsDestroyed' },
  { id: 'stone-crusher',    name: 'Stone Crusher',     description: 'Crush 50 stones.',                reward: 400, goal: 50,    metric: 'bouldersDestroyed' },
  { id: 'crystal-pulverizer', name: 'Crystal Pulverizer', description: 'Pulverize 100 crystals.',      reward: 800, goal: 100,   metric: 'crystalsDestroyed' },
  { id: 'pawberty-wrecker', name: '20 Paw-berty statues destroyed', description: 'Topple 20 Liberty-cat statues.', reward: 1500, goal: 20, metric: 'libertiesDestroyed' },
  // Economy / progression
  { id: 'coin-hoarder',     name: 'Coin Hoarder',      description: 'Earn 1,000 coins lifetime.',      reward: 100, goal: 1000,  metric: 'totalCoins' },
  { id: 'tycoon',           name: 'Tycoon',            description: 'Earn 10,000 coins lifetime.',     reward: 1000,goal: 10000, metric: 'totalCoins' },
  { id: 'survivor',         name: 'Survivor',          description: 'Reach stage 5.',                  reward: 75,  goal: 5,     metric: 'maxStage' },
  { id: 'territorial',      name: 'Territorial',       description: 'Reach stage 10.',                 reward: 200, goal: 10,    metric: 'maxStage' },
  { id: 'persistent',       name: 'Persistent',        description: 'Play 25 games.',                  reward: 100, goal: 25,    metric: 'gamesPlayed' },
  { id: 'champion',         name: 'Champion',          description: 'Win 10 stages.',                  reward: 250, goal: 10,    metric: 'gamesWon' },
  // Speedrun
  { id: 'speed-demon',      name: 'Speed Demon',       description: 'Set a new best time on 5 stages.', reward: 300, goal: 5,    metric: 'newRecordsSet' },
  { id: 'time-trial-pro',   name: 'Time Trial Pro',    description: 'Set 15 new best times across your runs.', reward: 750, goal: 15, metric: 'newRecordsSet' },
  { id: 'sub-ten-hero',     name: 'Sub-Ten Hero',      description: 'Clear any stage in under 10 seconds.', reward: 500, goal: 1,  metric: 'subTenSecondWins' },
  { id: 'lightning-mawer',  name: 'Lightning Mawer',   description: 'Clear a stage in under 6 seconds (60 - sec ≥ 54).', reward: 1000, goal: 54, metric: 'bestSecondsFloor' }
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
    stumpsDestroyed: 0,
    bouldersDestroyed: 0,
    crystalsDestroyed: 0,
    libertiesDestroyed: 0,
    newRecordsSet: 0,
    subTenSecondWins: 0,
    bestSecondsFloor: 0
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
  // `maxStage` and `bestSecondsFloor` are "running maxima" — callers
  // pass the candidate value (not a delta) and we only adopt it if it
  // beats the existing record.
  if (metric === 'maxStage' || metric === 'bestSecondsFloor') {
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

/** Cumulative gamesPlayed metric exposed at the module level so consumers
 *  outside the `useMawProgress()` factory (e.g. MawScene's onboarding
 *  hint logic) can subscribe without instantiating the factory. */
export const gamesPlayedTotal = computed(() => ach.value.totals.gamesPlayed)

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
      // Stamp the games-played counter the very first time the player
      // buys the chain-length upgrade — that's the cadence baseline for
      // the desktop scroll hint in MawScene.
      if (id === 'chainLength' && lvl === 0 && chainUpgradeFirstGameCount.value === null) {
        recordFirstChainUpgrade(ach.value.totals.gamesPlayed)
      }
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
