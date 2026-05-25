<script setup lang="ts">
import {ref, computed, watch, onMounted, onUnmounted, nextTick} from 'vue'
import type {Ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {useRouter} from 'vue-router'
import {isDebug} from '@/use/useMatch'
import {testStage, setTestStage} from '@/use/useCustomStages'
import {getState, setState} from '@/use/useMawState'
import useMawGame from '@/use/useMawGame'
import useMawConfig from '@/use/useMawConfig'
import useMawCampaign from '@/use/useMawCampaign'
import useMawProgress, {
  levelOf,
  activeChainLevel,
  adjustActiveChainLevel,
  hasBrokenFromObstacle,
  chainUpgradeFirstGameCount,
  chainScrollLessonLearnt,
  chainScrollHintShownCount,
  markChainScrollHintShown,
  ensureChainScrollBaseline,
  gamesPlayedTotal,
  upgradeCost,
  chainLengthForLevel,
  chainLiveHintSeen,
  markChainLiveHintSeen,
  hasDiedToStone,
  diedToCrystalCount,
  rapidDeathLifeOfferRedeemed,
  markRapidDeathLifeOfferRedeemed,
  splashDeathCount,
  UPGRADES
} from '@/use/useMawProgress'
import useSounds, {useMusic, type LoopHandle} from '@/use/useSound'
import {schedulePreloadOnIdle} from '@/use/useSoundPreload'
import {useScreenshake} from '@/use/useScreenshake'
import useUser from '@/use/useUser'
import useBottomSafe from '@/use/useBottomSafe'
import {isMobilePortrait, isMobileLandscape, isGameDistribution, isGameMonetize} from '@/use/useUser'
import useCheats from '@/use/useCheats'
import {spawnCoinExplosion} from '@/use/useCoinExplosion'
import {stopGameplay, startGameplay, triggerHappytime} from '@/use/useCrazyGames'
import {gamePixHappyMoment} from '@/utils/gamepixPlugin'
import {isInterstitialReady, showMidgameAd, isRewardedReady, showRewardedAd, isAdsBlocked} from '@/use/useAds'
import {isGamePaused} from '@/use/useGamePause'
import {isAnyModalOpen} from '@/use/useModalState'
import SpeedrunButton from '@/components/organisms/SpeedrunButton.vue'
import {
  ghostStateAt,
  hasGhostForStage,
  ghostBestTime,
  liveRunStartMs
} from '@/use/useMawGhost'

import StageBadge from '@/components/StageBadge.vue'
import LifeBadge from '@/components/atoms/LifeBadge.vue'
import CoinBadge from '@/components/organisms/CoinBadge.vue'
import TreasureChest from '@/components/organisms/TreasureChest.vue'
import DailyRewards from '@/components/organisms/DailyRewards.vue'
import BattlePass from '@/components/organisms/BattlePass.vue'
import AdRewardButton from '@/components/organisms/AdRewardButton.vue'
import OptionsModal from '@/components/organisms/OptionsModal.vue'
//- The crest-styled SpinnerAchievementsModal supersedes the original
//- AchievementsModal — it shows the same data through the spin-and-mow
//- claim system, just wrapped in nicer artwork.
import AchievementsModal from '@/components/organisms/SpinnerAchievementsModal.vue'
import UpgradesModal from '@/components/organisms/UpgradesModal.vue'
import FIconButton from '@/components/atoms/FIconButton.vue'
import FMuteButton from '@/components/atoms/FMuteButton.vue'
import FReward from '@/components/atoms/FReward.vue'
import IconCoin from '@/components/icons/IconCoin.vue'
import IconMovie from '@/components/icons/IconMovie.vue'

import {
  countdownText,
  runCountdown,
  cancelCountdown
} from '@/use/useMeteorIntro'
import {
  precomputeMeteorShower,
  startMeteorShower,
  stopMeteorShower,
  renderMeteorShower
} from '@/use/useMeteorShower'
import {
  drawIsland,
  drawIslandPlatformBounds,
  drawRobotHitBoxes,
  drawRobot,
  drawCoin,
  drawObstacle,
  drawGrassBlade,
  drawExitPole,
  drawDecor
} from '@/use/useMawArt'

useCheats()

const router = useRouter()
// Strict gate: only surface the editor button when the explicit `isDebug`
// flag is on (env VITE_APP_DEBUG=true OR `localStorage.debug='true'` in a
// non-prod build). Dev mode alone is no longer sufficient — the button
// shouldn't show up for casual local-dev sessions.
const showEditorEntry = computed(() => isDebug.value)
const isTestingStage = computed(() => testStage.value !== null)
const goToEditor = () => {
  router.push('/editor')
}
const exitTestStage = () => {
  setTestStage(null)
  router.push('/editor')
}

const {t} = useI18n()
const {playSound, playLoop} = useSounds()
const {startBattleMusic, stopBattleMusic} = useMusic()

// ─── Chain whir loop ────────────────────────────────────────────────────
// Continuous mow-robot sound that plays for the duration of an active
// attempt. Stops on game-over / idle / pause / spotlight, restarts on
// resume. Volume is intentionally low (-24 dB-ish ratio) so it sits
// under the battle music without masking grass-cut variants.
let chainLoop: LoopHandle | null = null
const stopChainLoop = () => {
  if (chainLoop) {
    chainLoop.stop()
    chainLoop = null
  }
}
const startChainLoop = () => {
  if (chainLoop) return
  chainLoop = playLoop('mow-loop', 0.035)
}
onUnmounted(() => stopChainLoop())
const {shakeStyle} = useScreenshake()
const {} = useUser()

const {
  phase,
  gameResult,
  lossReason,
  life,
  maxLife,
  cleared,
  coins,
  anchorPos,
  swingPos,
  swingAngle,
  anchorIsLeft,
  cameraPos,
  stage,
  islands,
  initGame,
  startMatch,
  tick,
  swapAnchor,
  updateCamera,
  continueAfterDeath,
  chainLength,
  isOverIsland,
  isPaused,
  isInvincible,
  isRapidDeath,
  lastClearedTimeMs,
  lastClearedWasBest,
  lastClearedPrevBestMs,
  poleCut,
  reqsMet
} = useMawGame()

const {coins: coinTotal, spendCoins, addCoins} = useMawConfig()
const {currentStageId, currentStage, stageReinitSignal, resetCampaign, isLastStage} = useMawCampaign()
const {buyUpgrade, pendingAchClaims} = useMawProgress()

// ─── Speedrun timer + ghost replay ──────────────────────────────────────
// `liveElapsedMs` is the wall-clock time since the current attempt's
// `startMatch()`. Updated every animation frame from the existing
// renderLoop (no extra rAF) so the SpeedrunButton timer reads live.
const liveElapsedMs = ref(0)

/** Best-time readout for the current stage, surfaced in the win modal. */
const stageBestTimeMs = computed(() => ghostBestTime(currentStageId.value))
const formatTimeMs = (ms: number | null): string => {
  if (ms === null || ms <= 0) return '—'
  const s = Math.floor(ms / 1000)
  const tenth = Math.floor((ms % 1000) / 100)
  return `${s}.${tenth}s`
}

// ─── MOW-A-HERO completion ──────────────────────────────────────────────
// Fires when the player wins the very last stage of the 20-stage
// campaign. Shows a separate fancy reward screen with a celebration
// sound + CG SDK happytime (CG builds only — already gated by
// triggerHappytime), and offers a "Play from Stage 1" button that
// rewinds the campaign without touching upgrades / coins.
const showHeroReward = ref(false)
const onRestartCampaign = () => {
  showHeroReward.value = false
  resetCampaign()
}

// Chain-length quick-adjust HUD buttons — let the player dial the live
// chain reach up/down without re-buying upgrades, so they can pick the
// right swing radius for small islands vs wide gaps.
const purchasedChainLevel = computed(() => levelOf('chainLength'))
const liveChainLevel = computed(() => activeChainLevel.value ?? purchasedChainLevel.value)
const canChainUp = computed(() => liveChainLevel.value < purchasedChainLevel.value)
const canChainDown = computed(() => liveChainLevel.value > 0)
const onChainPlus = () => {
  if (!chainLiveHintSeen.value) markChainLiveHintSeen()
  adjustActiveChainLevel(1)
}
const onChainMinus = () => {
  if (!chainLiveHintSeen.value) markChainLiveHintSeen()
  adjustActiveChainLevel(-1)
}

// ─── Onboarding hints ───────────────────────────────────────────────────
// "Upgrade Sharper Saw to Lv 1" — fires after the player's first death to
// an obstacle (stump / boulder) and stays visible until they actually buy
// the upgrade. Shown both as a small tooltip during the battle phase and
// inside the loss-reward modal.
const showSharperSawHint = computed(() =>
  hasBrokenFromObstacle.value && levelOf('sawDamage') < 1
)

// "Upgrade Sharper Saws to Lv 3" — fires from either of two triggers:
//   1. The player has actually died to a stone/boulder obstacle (the
//      most direct "you need this" signal). Stays on until they hit
//      Lv 3, the tier that breaks stones.
//   2. Or — even without a stone death — they're already at Lv 1+ and
//      sitting on enough coins for the Lv 2→3 upgrade (threshold 600
//      matches `costBase(200) × (2+1)`), so the hint also nudges
//      pre-emptive savers.
// Shown during gameplay (below the chain-scroll hint) and on the loss
// screen.
const SAW_LV3_HINT_COIN_THRESHOLD = 600
const showSharperSawLv3Hint = computed(() => {
  const tier = levelOf('sawDamage')
  if (tier >= 3) return false
  if (hasDiedToStone.value) return true
  return tier >= 1 && coinTotal.value >= SAW_LV3_HINT_COIN_THRESHOLD
})

// "Upgrade Sharper Saws to Lv 6 (crystals)" — fires after the player
// has died to a crystal obstacle TWICE. The first crystal death is
// usually a "what was that?" surprise; by the second, they need the
// nudge. Stays on until they actually hit Lv 6 (the tier that
// pulverises crystals). Shown in the same slots as the Lv 3 hint.
const SAW_LV6_DEATH_THRESHOLD = 2
const showSharperSawLv6Hint = computed(() =>
  diedToCrystalCount.value >= SAW_LV6_DEATH_THRESHOLD
  && levelOf('sawDamage') < 6
)

// "Longer Chain" onboarding cadence — splash deaths only.
//   • 10 splashes  → quiet HUD/lose-screen hint suggesting the upgrade.
//   • 20 splashes  → escalate: force-open the Upgrades modal with the
//     chain row spotlighted, top up with 200 coins if needed.
// Both halves clear once chainLength reaches Lv 2 (the user's defined
// success state).
const LONGER_CHAIN_HINT_SPLASHES = 10
const LONGER_CHAIN_SPOTLIGHT_SPLASHES = 20
const LONGER_CHAIN_COIN_GRANT = 200
const showLongerChainHint = computed(() =>
  splashDeathCount.value >= LONGER_CHAIN_HINT_SPLASHES
  && levelOf('chainLength') < 2
)
const chainSplashSpotlightArmed = computed(() =>
  splashDeathCount.value >= LONGER_CHAIN_SPOTLIGHT_SPLASHES
  && levelOf('chainLength') < 2
)

// "Click/tap to move" — first-two-stages onboarding for the anchor-swap
// mechanic. Pinned to the screen centre, ~15% up from the bottom edge —
// camera-stable so the player's eye doesn't have to track the robot to
// read it. Copy is platform-aware: mobile gets "Tap", desktop "Click".
const showClickToMoveHint = computed(() =>
  currentStageId.value <= 2 && phase.value === 'playing'
)
const isTouchDevice = computed(() => isMobilePortrait.value || isMobileLandscape.value)
const clickToMoveLabel = computed(() =>
  isTouchDevice.value ? t('maw.clickToMoveTouch') : t('maw.clickToMoveDesktop')
)

// ─── Desktop scroll-hint ──────────────────────────────────────────────
// Desktop detection — a fine pointer + hover capability rules out
// touch-only devices. Set on mount because device characteristics don't
// change during a session.
const isDesktop: Ref<boolean> = ref(false)
onMounted(() => {
  isDesktop.value =
    typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(hover: hover) and (pointer: fine)').matches
  // SFX preload runs on the first idle slot after the gameplay scene has
  // painted. Pushes ~16 ogg decodes off the critical path so the splash
  // hides as fast as possible; by the time the player swings the chain
  // into the first grass blade, every cut/hit sample is cached.
  schedulePreloadOnIdle()
})

/** Decided at game-start (via `evaluateChainScrollHint`) — whether THIS
 *  attempt should display the chain-scroll onboarding hint. The hint
 *  shows on every 2nd attempt after the chain upgrade unlocks, and is
 *  only visible for the first `HINT_VISIBLE_MS` of gameplay each time
 *  (after that it auto-hides so it doesn't crowd the screen for the
 *  rest of the round). */
const HINT_VISIBLE_MS = 5000
const showChainScrollHintThisGame = ref(false)
const chainScrollHintWithShine = ref(false)
const chainScrollHintExpired = ref(false)
let chainScrollHintTimer: ReturnType<typeof setTimeout> | null = null

const evaluateChainScrollHint = () => {
  if (chainScrollHintTimer != null) {
    clearTimeout(chainScrollHintTimer)
    chainScrollHintTimer = null
  }
  showChainScrollHintThisGame.value = false
  chainScrollHintWithShine.value = false
  chainScrollHintExpired.value = false
  if (!isDesktop.value) return
  // Gate on the player actually OWNING the chain upgrade rather than on
  // the historical baseline — otherwise players who upgraded before the
  // hint code shipped (so their baseline was never stamped) would never
  // see the hint. `ensureChainScrollBaseline` lazily stamps `now` if the
  // baseline is still null, so the cadence kicks off from this attempt.
  if (levelOf('chainLength') < 1) return
  ensureChainScrollBaseline()
  const baseline = chainUpgradeFirstGameCount.value ?? gamesPlayedTotal.value
  const since = gamesPlayedTotal.value - baseline
  if (since < 0) return
  // Cadence: every 2nd attempt after the chain upgrade unlocks
  // (including the very first). The hint then auto-hides after
  // HINT_VISIBLE_MS so it stays out of the way for the rest of play.
  if (since % 2 !== 0) return
  showChainScrollHintThisGame.value = true
  chainScrollHintWithShine.value = chainScrollHintShownCount.value === 0
  markChainScrollHintShown()
  chainScrollHintTimer = setTimeout(() => {
    chainScrollHintExpired.value = true
    chainScrollHintTimer = null
  }, HINT_VISIBLE_MS)
}

// Keep the lesson-learnt counter alive on the imports (it might come
// back to gate cadence in a future tuning pass), but the current cadence
// is unconditional every-2nd.
void chainScrollLessonLearnt

const showChainScrollHint = computed(() =>
  showChainScrollHintThisGame.value
  && !chainScrollHintExpired.value
  && phase.value === 'playing'
)

// ─── Sharper-Saw spotlight ────────────────────────────────────────────
// Tutorial gate that fires the moment the player has enough coins to
// afford Sharper Saws Lv 1 AND hasn't bought it yet. While active, the
// whole scene freezes (paused tick, muted battle music) and only the
// HUD's upgrade button is reachable — bouncing under a dim overlay so
// the player can't miss it. Closing the modal without buying re-arms
// the spotlight; buying clears the condition for good.
const sawSpotlightArmed = computed(() =>
  levelOf('sawDamage') === 0
  && coinTotal.value >= upgradeCost('sawDamage')
)
/** Spotlight visual + button bounce. Hidden while the upgrades modal is
 *  open (the modal itself takes over the foreground), but the underlying
 *  `sawSpotlightArmed` state keeps gameplay paused. */
const showSawSpotlight = computed(() =>
  sawSpotlightArmed.value && !showUpgrades.value
)
/** True whenever the saw upgrade is being forced — restricts the
 *  upgrades modal to only the Sharper-Saw row. */
const forceSawUpgradeOnly = computed(() => sawSpotlightArmed.value)

// Single resolver for the UpgradesModal's `restrict-to-id` prop. The saw
// spotlight takes priority over the chain-splash spotlight if both arm
// at once — saw blocks more obvious gameplay progression (the player
// can't cut anything), so it deserves the first slot.
const restrictedUpgradeId = computed<string | null>(() =>
  sawSpotlightArmed.value ? 'sawDamage'
    : chainSplashSpotlightArmed.value ? 'chainLength'
      : null
)

// ─── Chain-adjust ("live chain") spotlight ────────────────────────────
// Fires once the player has bought Longer Chain Lv 2 — that's the point
// where the +1 / -1 in-HUD buttons start mattering for tackling tight
// vs wide stages. Pauses the game with a focused overlay on the buttons
// until the player taps either one, after which the hint is dismissed
// for good (`chainLiveHintSeen` is persisted). The saw spotlight has
// priority — if both would arm at the same time, we hold the chain
// hint until the saw one is cleared.
const chainLiveSpotlightArmed = computed(() =>
  !chainLiveHintSeen.value
  && purchasedChainLevel.value >= 2
  && phase.value === 'playing'
  && !sawSpotlightArmed.value
)
const showChainLiveSpotlight = computed(() =>
  chainLiveSpotlightArmed.value && !showUpgrades.value
)

// NOTE: the combined pause/music watcher lives further down — after the
// modal refs (showOptions / showAch / showUpgrades / showReward / etc.)
// so it can include them in `anyPauseSignal`. Defining it here would
// hit the modal refs in the TDZ at watch-registration time.

// ─── Mouse-wheel chain-length adjust ──────────────────────────────────
// Accumulate wheel deltas so a single light scroll-flick doesn't blast
// through every chain tier — the threshold gives the player one tier per
// "notch" on a typical mouse wheel and one tier per ~10cm of trackpad
// gesture. Direction: scroll UP (negative deltaY) = longer chain, DOWN
// = shorter, matching the natural "more / less" association.
let wheelAccumulator = 0
const WHEEL_THRESHOLD = 80
const onWheel = (e: WheelEvent) => {
  // Only active during gameplay AND when the player has at least one
  // chain upgrade to step between. The cadence-hint logic doesn't gate
  // this, but it's pointless before any upgrade exists.
  if (phase.value !== 'playing') return
  if (purchasedChainLevel.value < 1) return
  e.preventDefault()
  wheelAccumulator += e.deltaY
  while (Math.abs(wheelAccumulator) >= WHEEL_THRESHOLD) {
    const dir: 1 | -1 = wheelAccumulator > 0 ? -1 : 1
    adjustActiveChainLevel(dir, 'scroll')
    wheelAccumulator -= dir > 0 ? -WHEEL_THRESHOLD : WHEEL_THRESHOLD
  }
}

// ─── Modals & UI flags ───────────────────────────────────────────────────
const showOptions: Ref<boolean> = ref(false)
const showAch: Ref<boolean> = ref(false)
const showUpgrades: Ref<boolean> = ref(false)
const showReward: Ref<boolean> = ref(false)
/** Continue-after-death prompt — only shown for "broke" deaths when the
 *  active build has rewarded ads filled and the per-session 15s cooldown
 *  has elapsed since the last offer. */
const showContinueOffer: Ref<boolean> = ref(false)
const isAdInFlight: Ref<boolean> = ref(false)
const CONTINUE_AD_COOLDOWN_MS = 15_000
let lastContinueOfferAt = 0

// ─── Combined pause / music gate ─────────────────────────────────────────
// Any spotlight OR any modal (Upgrades / Achievements / Options / Reward
// / HeroReward / Continue-offer) pauses the game and stops the battle
// music. Closing them all resumes both — but only if we're still on the
// live `playing` phase, so the game-over screens don't restart music as
// the player closes a stacked modal. Single watcher = no risk of two
// watchers fighting over `isPaused` / music state.
const anyModalOpen = computed(() =>
  showOptions.value
  || showAch.value
  || showUpgrades.value
  || showReward.value
  || showHeroReward.value
  || showContinueOffer.value
)
const anyPauseSignal = computed(() =>
  sawSpotlightArmed.value
  || chainLiveSpotlightArmed.value
  || chainSplashSpotlightArmed.value
  || anyModalOpen.value
)
watch(anyPauseSignal, (paused, prev) => {
  if (paused && !prev) {
    isPaused.value = true
    stopBattleMusic()
    // Drama stinger ONLY when a spotlight arms — opening a normal HUD
    // modal (Upgrades / Achievements / Options) pauses silently so the
    // UX feels responsive rather than dramatic.
    if (sawSpotlightArmed.value || chainLiveSpotlightArmed.value) {
      playSound('reward-continue', 0.12)
    }
  } else if (!paused && prev) {
    isPaused.value = false
    // Restart music only if we're back in a live match — otherwise the
    // game-over / idle screen would start the loop unprompted.
    if (phase.value === 'playing') startBattleMusic()
  }
})

// Auto-open the Upgrades modal the moment the chain-splash spotlight
// arms (player has splashed ≥ 20 times and chainLength is still < Lv 2).
// A coin top-up is granted upfront if they can't afford even Lv 0 → 1,
// so the modal is never a tease — the player can always click Buy.
// `restrictedUpgradeId` already routes the modal to the chain row, and
// the pause watcher above handles isPaused + music.
watch(chainSplashSpotlightArmed, (armed) => {
  if (!armed) return
  const cost = upgradeCost('chainLength')
  if (coinTotal.value < cost) {
    // Grant 200 (the user-defined floor) OR enough to make the next
    // tier purchasable — whichever is larger. Avoids the edge case
    // where the next-tier cost has already drifted past 200.
    const needed = cost - coinTotal.value
    addCoins(Math.max(LONGER_CHAIN_COIN_GRANT, needed))
  }
  showUpgrades.value = true
})

// ─── Coin badge target ───────────────────────────────────────────────────
const coinBadgeRef = ref<{ rootEl: HTMLElement | null } | null>(null)
const coinBadgeEl = computed(() => coinBadgeRef.value?.rootEl ?? null)
const rewardCoinRef = ref<HTMLElement | null>(null)

const fireCoinExplosion = (sourceEl: HTMLElement | null) => {
  if (sourceEl && coinBadgeEl.value) {
    spawnCoinExplosion({sourceEl, targetEl: coinBadgeEl.value})
  }
}

// ─── Canvas ──────────────────────────────────────────────────────────────
const canvasRef = ref<HTMLCanvasElement | null>(null)
const canvasWidth = ref(0)
const canvasHeight = ref(0)
const uiBtnScale = computed(() => Math.min(2, Math.max(1, canvasWidth.value / 1000)))

// World→screen zoom — kept in sync with the same formula `paint()` uses
// to set the canvas ctx scale, so the CSS water background can match the
// world transform exactly.
const cameraZoom = computed(() =>
  Math.min(1.3, Math.max(0.7, Math.min(canvasWidth.value, canvasHeight.value) / 800))
)

/** Anchor the tiled water bitmap to world (0, 0) and scale it with the
 *  current zoom — the CSS layer then visually scrolls in lockstep with
 *  the canvas as the camera moves, so islands no longer "float" over a
 *  static background. The browser still does the tiling on the GPU
 *  fast path; we just shift its origin per frame. */
const waterBgStyle = computed(() => {
  const z = cameraZoom.value
  const tile = 512 * z
  return {
    backgroundSize: `${tile}px ${tile}px`,
    backgroundPositionX: `${canvasWidth.value / 2 - z * cameraPos.value.x}px`,
    backgroundPositionY: `${canvasHeight.value / 2 - z * cameraPos.value.y}px`
  }
})

const updateCanvasSize = () => {
  const c = canvasRef.value
  if (!c) return
  const vv = window.visualViewport
  canvasWidth.value = vv?.width ?? window.innerWidth
  canvasHeight.value = vv?.height ?? window.innerHeight
  // Backing store is sized in DEVICE pixels (CSS × DPR), CSS size stays
  // in layout pixels so the canvas still fills the viewport. Without
  // this, the browser bilinearly upscales every frame at display time
  // and the grass tufts / chain edges look pixelated on retina screens
  // (DPR 2–3 is typical on phones). Capped at 3 so we don't burn
  // memory on >3x devices — diminishing returns past that.
  const dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1))
  c.width = Math.round(canvasWidth.value * dpr)
  c.height = Math.round(canvasHeight.value * dpr)
  c.style.width = canvasWidth.value + 'px'
  c.style.height = canvasHeight.value + 'px'
  // Keep the meteor-shower trail buffer in step with the live canvas.
  // (CSS pixels — it draws into the same scaled ctx in `paint()`.)
  precomputeMeteorShower(canvasWidth.value, canvasHeight.value)
}

const {bottomGapPx, scheduleBottomMeasure} = useBottomSafe()

// ─── Game flow ───────────────────────────────────────────────────────────
/** Kick off the meteor-intro sequence. Extracted so the ad-break path can
 *  fall through to it after the midgame ad finishes (or after we discover
 *  the ad isn't actually available). */
const startMeteorIntro = () => {
  phase.value = 'meteor_intro'
  precomputeMeteorShower(canvasWidth.value, canvasHeight.value)
  startMeteorShower()
  startBattleMusic()
  runCountdown(() => {
    stopMeteorShower()
    startMatch()
  })
}

// GameDistribution + GameMonetize relocate the interstitial: instead of the
// attempt-start cadence other builds use, those two portals fire it only when
// the player clicks "continue" on the win/lose reward screen (see `beginPlay`'s
// `fromReward` path). The ad plays during the transition into the next attempt,
// so it never covers the reward screen or live gameplay.
const isWinLoseScreenAdBuild = isGameDistribution || isGameMonetize

const beginPlay = async (fromReward = false) => {
  // Re-entrancy guard. `beginPlay` can be triggered by the idle-screen
  // click, the auto-fire timeout, the loss-reward "continue" button, AND
  // the post-attempt cadence — drop the call if a run is already mid-flight.
  if (
    phase.value === 'playing'
    || phase.value === 'meteor_intro'
    || phase.value === 'ad_break'
  ) return
  initGame()

  // Interstitial cadence — two placement strategies:
  //   • GameDistribution + GameMonetize fire the interstitial ONLY when the
  //     player clicked "continue" on the win/lose reward screen (`fromReward`).
  //     The ad then plays during the transition into the next attempt — after
  //     the player has seen and dismissed the reward — in its own `ad_break`
  //     phase, so it never covers the reward screen or live gameplay.
  //     SDK-throttled: the ~2-min frequency cap folded into
  //     `isInterstitialReady` caps it to ~one ad per cooldown window.
  //   • Every other build keeps the attempt-start cadence: every 3rd attempt
  //     OR every 5th 'broke' loss (the breakdown counter is bumped in the loss
  //     watcher). Whichever counter tripped resets; the other keeps counting
  //     so the two cadences stay independent.
  let shouldShowAd = false
  if (isWinLoseScreenAdBuild) {
    shouldShowAd = fromReward && isInterstitialReady.value
  } else {
    bumpAdCounter()
    const triggerByAttempts = battlesSinceAd.value >= 3
    const triggerByBreakdowns = breakdownsSinceAd.value >= BREAKDOWN_AD_THRESHOLD
    if (triggerByAttempts || triggerByBreakdowns) {
      if (triggerByAttempts) resetAdCounter()
      if (triggerByBreakdowns) resetBreakdownAdCounter()
      shouldShowAd = isInterstitialReady.value
    }
  }
  if (shouldShowAd) {
    phase.value = 'ad_break'
    try {
      // The game is held paused for the FULL ad duration: `showMidgameAd`
      // flips `isAdShowing` (→ `isGamePaused`) synchronously before awaiting,
      // and both GD + GameMonetize resolve only once the ad CLOSES — so the
      // render loop's `tick` stays frozen underneath the ad.
      await showMidgameAd()
    } catch { /* SDK error → fall through to gameplay */
    }
    // If the player navigated away (route change / unmount), the phase
    // ref will have been reinitialised — bail rather than racing the
    // next mount's start.
    if (phase.value !== 'ad_break') return
    // GameDistribution + GameMonetize: after the post-reward interstitial
    // closes, drop back to the idle "tap to start" screen instead of
    // auto-starting the match. The tap that dismissed the ad (or any stray
    // tap as it closes) would otherwise bleed straight into a live match —
    // the "unintentional game start after the win/lose screen is gone" the
    // player reported. `initGame()` above already reset the board, so the
    // next deliberate tap (idle @click → `beginPlay()`) starts cleanly.
    if (isWinLoseScreenAdBuild) {
      phase.value = 'idle'
      return
    }
  }
  // Meteor shower + 3-2-1 countdown removed from the entry path — they
  // were padding game-entry. `startMeteorIntro` / `runCountdown` are
  // intentionally kept in the codebase in case they come back for a
  // boss-stage flourish later. For now: snap straight into gameplay.
  evaluateChainScrollHint()
  startBattleMusic()
  startMatch()
}

// Drive the chain-whir loop off `phase` + `isPaused` + the global pause gate.
// Started on the first frame of any `'playing'` state; stopped on any other
// phase, when the saw-spotlight pause flips on (pause watch below), OR while
// an ad / tab-hide holds `isGamePaused`. Stopping the LOOP (not just freezing
// the ctx) means an early ad gate-drop can't let the whir resume under the ad;
// it's recreated when `isGamePaused` clears and play continues.
watch([phase, isPaused, isGamePaused], ([p, paused, gamePaused]) => {
  if (p === 'playing' && !paused && !gamePaused) startChainLoop()
  else stopChainLoop()
}, {immediate: true})

watch(phase, (p) => {
  if (p === 'game_over') {
    stopBattleMusic()
    if (gameResult.value === 'win') {
      // Campaign clear — final stage win triggers the MOW-A-HERO Hall of
      // Fame reward instead of the standard per-stage reward modal.
      // `advanceStage()` (in useMawGame.onWin) stops incrementing past
      // STAGES.length, so currentStageId stays parked on the final stage
      // and `isLastStage` is still true at this point.
      if (isLastStage.value && !testStage.value) {
        showHeroReward.value = true
        // Celebration: the win stinger fires at full reward volume
        // (`onWin` also fires `win` at 0.18, but the second hit on the
        // MOW-A-HERO path emphasises the final-boss moment) plus the
        // CG SDK happytime (a no-op on non-CG builds).
        playSound('win', 0.22)
        triggerHappytime()
        gamePixHappyMoment()
        return
      }
      // Per-stage win screen — celebrate the level clear with the CG SDK
      // happytime / GamePix happy-moment (no-ops on other platforms).
      showReward.value = true
      triggerHappytime()
      gamePixHappyMoment()
      nextTick(() => fireCoinExplosion(rewardCoinRef.value))
      return
    }
    // Loss path — play the per-reason death sound, then decide between
    // the continue-offer modal and the standard loss-reward modal.
    //
    // The continue-offer is shown when EITHER:
    //   • the ad path is eligible — "broke" deaths only (a splash drops
    //     the player over open water and the ad SDK still has the same
    //     15s cooldown gate it always did), OR
    //   • the coin-revive path is eligible — player has ≥ REVIVE_COIN_COST
    //     coins. Available for BOTH death types so late-game players
    //     have something to spend their stockpile on. Coin cooldown is
    //     implicit (the cost is a natural throttle).
    playSound(lossReason.value === 'splashed' ? 'water-splash' : 'chainsaw-break', 0.12)
    // Breakdown ad cadence — bumps only on 'broke' deaths. Drives the
    // second-channel interstitial trigger evaluated in `beginPlay`.
    if (lossReason.value === 'broke') bumpBreakdownAdCounter()
    // Both revive paths (watch-ad + coin spend) are now offered for
    // BOTH death types. `continueAfterDeath` handles each correctly —
    // a 'broke' death tops up life + cools-down obstacles, a 'splashed'
    // death teleports the anchor back to the last safe island.
    const adEligible =
      isRewardedReady.value
      && (Date.now() - lastContinueOfferAt) >= CONTINUE_AD_COOLDOWN_MS
    const coinEligible = coinTotal.value >= REVIVE_COIN_COST
    if (adEligible || coinEligible) {
      showContinueOffer.value = true
    } else {
      showReward.value = true
    }
  }
})

// Lose-screen stinger — fires once when the FReward overlay opens on a
// loss. Delayed 200ms so it lands just after the per-reason death sound
// (chainsaw-break / water-splash) instead of stacking on the same frame.
watch(showReward, (open) => {
  if (open && gameResult.value === 'lose') {
    setTimeout(() => playSound('lose', 0.12), 200)
  }
})

watch(stageReinitSignal, () => {
  initGame()
})

const onContinue = async () => {
  // Soft confirmation chime — fires once when the player accepts the
  // reward CTA (tap / click / Space / Enter on the FReward overlay).
  playSound('reward-continue', 0.08)
  showReward.value = false
  // Kick off the next attempt. `fromReward = true` marks this as the
  // post-reward continue — the only point at which GameDistribution /
  // GameMonetize fire their interstitial (in the `ad_break` phase, after the
  // player has dismissed the reward screen). Other builds run their own
  // attempt-start cadence inside `beginPlay` regardless of this flag.
  beginPlay(true)
}

/** Player accepts the watch-ad continue offer. After the ad we revive the run
 *  with full life (back at the last safe anchor for a splash death). The revive
 *  is deliberately NOT gated on the strict rewarded-completion grant — see the
 *  body for why — so only a detected ad-blocker falls through to the regular
 *  loss-reward modal. The 15s cooldown timer is stamped regardless so a quick
 *  re-death can't immediately re-prompt the player. */
const onAcceptContinueAd = async () => {
  if (isAdInFlight.value) return
  isAdInFlight.value = true
  lastContinueOfferAt = Date.now()
  // Dismiss the prompt BEFORE the ad shows — its full-screen blurred backdrop
  // (z-[110]) otherwise sits on top of the ad iframe. After the ad we either
  // resume the run or fall through to the standard loss-reward modal.
  showContinueOffer.value = false
  try {
    const granted = await showRewardedAd()
    // Revive the player after the ad. We intentionally do NOT gate this revive
    // on the strict "watched-to-completion" grant: across portals the rewarded
    // SDKs report that completion signal unreliably (the completion event races
    // the show-promise resolution — e.g. GameDistribution's
    // SDK_REWARDED_WATCH_COMPLETE, GameMonetize's ALL_ADS_COMPLETED), which left
    // players who actually watched the ad stranded on the loss screen. For this
    // ephemeral second-chance revive we resume whenever the ad ran and wasn't
    // blocked; only a detected ad-blocker withholds it (and `showRewardedAd`
    // surfaces the AdsBlockedModal). Permanent rewards (coins / upgrades / the
    // rapid-death life offer) keep the strict `granted` gate.
    if (granted || !isAdsBlocked.value) {
      const resumed = continueAfterDeath()
      if (resumed) {
        startBattleMusic()
        return
      }
    }
    // Ad-blocked, or the run wasn't in a revivable state — fall through to the
    // standard loss-reward modal so the death isn't swept under the rug.
    showReward.value = true
  } finally {
    isAdInFlight.value = false
  }
}

const onSkipContinueAd = () => {
  if (isAdInFlight.value) return
  // Stamp the cooldown so the player isn't re-prompted instantly if they
  // die again within 15s of an explicit skip.
  lastContinueOfferAt = Date.now()
  showContinueOffer.value = false
  showReward.value = true
}

// ─── Coin-revive (fair alternative to a rewarded ad) ────────────────────
// Spendable revive for late-game players sitting on a coin stockpile.
// Works for BOTH death types — including the previously-fatal splash —
// because `continueAfterDeath()` now puts the anchor back on the last
// safe island when reviving from a splash. Cost is sized to feel
// meaningful even after maxed upgrades but well within reach of anyone
// who's bought everything that matters.
const REVIVE_COIN_COST = 1000

/** Per-death eligibility flags surfaced to the template so each button
 *  can render its own visible/disabled state. The watch-ad path used to
 *  be gated to 'broke' deaths only — it now mirrors the coin path and is
 *  offered for splashed deaths too, since `continueAfterDeath` puts the
 *  anchor back on the last safe island in that case. */
const continueAdAvailable = computed(() =>
  isRewardedReady.value
  && (Date.now() - lastContinueOfferAt) >= CONTINUE_AD_COOLDOWN_MS
)
const continueCoinAvailable = computed(() => coinTotal.value >= REVIVE_COIN_COST)

const onAcceptContinueCoins = () => {
  if (isAdInFlight.value) return
  if (!continueCoinAvailable.value) return
  if (!spendCoins(REVIVE_COIN_COST)) return
  const resumed = continueAfterDeath()
  if (resumed) {
    showContinueOffer.value = false
    startBattleMusic()
    return
  }
  // continueAfterDeath rejected (state mismatch) — refund the coins so
  // the player isn't penalised for an engine-side bail.
  addCoins(REVIVE_COIN_COST)
  showContinueOffer.value = false
  showReward.value = true
}

// ─── Rapid-death "+1 Reinforced Frame" one-time bonus offer ───────────
// Surfaces an extra button on the FReward lose screen when the engine
// flags `isRapidDeath` (3 deaths in 10 s) AND the player hasn't already
// cashed in the bonus AND Reinforced Frame still has a tier to climb.
// Clicking → rewarded ad → if granted, free `buyUpgrade('maxLife')`
// and the persistent flag flips so the offer never returns.
const maxLifeDef = UPGRADES.find(u => u.id === 'maxLife')
const showRapidDeathLifeOffer = computed(() =>
  gameResult.value === 'lose'
  && isRapidDeath.value
  && !rapidDeathLifeOfferRedeemed.value
  && isRewardedReady.value
  && (maxLifeDef ? levelOf('maxLife') < maxLifeDef.maxLevel : false)
)
const isRapidDeathOfferInFlight: Ref<boolean> = ref(false)
const onAcceptRapidDeathLifeOffer = async () => {
  if (isRapidDeathOfferInFlight.value) return
  if (!showRapidDeathLifeOffer.value) return
  isRapidDeathOfferInFlight.value = true
  try {
    const granted = await showRewardedAd()
    if (!granted) return
    // Free upgrade — same code path as the in-menu watch-ad upgrade, but
    // without the 30 s shared cooldown (this is a one-shot bonus, not a
    // repeatable upgrade button).
    buyUpgrade('maxLife')
    playSound('level-up', 0.08)
    markRapidDeathLifeOfferRedeemed()
  } finally {
    isRapidDeathOfferInFlight.value = false
  }
}

// ─── Ad cadence ──────────────────────────────────────────────────────────
//
// Two independent counters drive the `ad_break` phase. Either one tripping
// fires the next interstitial; whichever fired resets to 0 (the other keeps
// counting so the cadences don't drift into lockstep). Both persist
// across sessions so a refresh between breakdowns doesn't reset the gate.
//
//   • `battlesSinceAd` — every attempt (win, lose, abort) bumps it.
//                        Fires at >= 3. The "regular" cadence.
//   • `breakdownsSince` — only 'broke' losses bump it (splash deaths and
//                        wins don't count). Fires at >= 5. Catches the
//                        player who keeps dying without finishing stages.
const AD_KEY = 'ca_battles_since_ad'
const BREAKDOWN_AD_KEY = 'ca_breakdowns_since_ad'
const BREAKDOWN_AD_THRESHOLD = 5
const readNumberKey = (key: string): number => {
  const v = getState<unknown>(key)
  if (typeof v === 'number' && Number.isFinite(v)) return v
  const n = parseInt(String(v ?? ''), 10)
  return Number.isFinite(n) ? n : 0
}
const battlesSinceAd: Ref<number> = ref(readNumberKey(AD_KEY))
const breakdownsSinceAd: Ref<number> = ref(readNumberKey(BREAKDOWN_AD_KEY))
const bumpAdCounter = () => {
  battlesSinceAd.value += 1
  setState(AD_KEY, battlesSinceAd.value)
}
const resetAdCounter = () => {
  battlesSinceAd.value = 0
  setState(AD_KEY, 0)
}
const bumpBreakdownAdCounter = () => {
  breakdownsSinceAd.value += 1
  setState(BREAKDOWN_AD_KEY, breakdownsSinceAd.value)
}
const resetBreakdownAdCounter = () => {
  breakdownsSinceAd.value = 0
  setState(BREAKDOWN_AD_KEY, 0)
}

// ─── Input ───────────────────────────────────────────────────────────────
//
// Anchor swap is the only player action. We accept pretty much any
// likely-meaningful input so the game stays playable on whatever device
// happens to be in the player's hands:
//   • Mouse — left or right click on the canvas (PointerEvent fires for
//     any button; the canvas suppresses the browser context menu for
//     right-click so the swap fires instead).
//   • Touch — same handler via PointerEvent.
//   • Keyboard — Space / Enter / WASD / Arrow keys.
const onPointerDown = (_e: PointerEvent) => {
  if (phase.value === 'idle' || phase.value === 'game_over') return
  if (phase.value === 'playing') swapAnchor()
}

const onContextMenu = (e: MouseEvent) => {
  // Right-click on the canvas should swap anchor like any other click —
  // prevent the browser context menu from intercepting it.
  e.preventDefault()
}

const SWAP_KEYS = new Set([
  'Space', 'Enter',
  'KeyW', 'KeyA', 'KeyS', 'KeyD',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'
])

const onKeyDown = (e: KeyboardEvent) => {
  if (!SWAP_KEYS.has(e.code)) return
  if (phase.value !== 'playing') return
  // Skip when focus is on a form element so the player can still type in
  // toolbar inputs (test stage name, options modal fields, etc.).
  const t = e.target
  if (t instanceof HTMLElement) {
    const tag = t.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable) return
  }
  e.preventDefault()
  swapAnchor()
}

// ─── Game loop (render + physics fused for simplicity) ───────────────────
let raf: number | null = null
let lastTime = 0
const renderLoop = (now: number) => {
  // Global pause gate — true whenever an ad is on-screen, the tab is
  // hidden, the platform SDK asked us to pause, or an app-side modal
  // acquired a pause. Keep the rAF heartbeat alive so we resume cleanly,
  // but skip simulation/render and reset `lastTime` so the first frame
  // after resume doesn't try to advance physics by the entire pause gap.
  if (isGamePaused.value) {
    lastTime = 0
    raf = requestAnimationFrame(renderLoop)
    return
  }

  const dt = lastTime === 0 ? 0 : Math.min(0.05, (now - lastTime) / 1000)
  lastTime = now

  if (phase.value === 'playing') {
    tick(dt)
  }

  // Speedrun + ghost timer — driven off the engine's `liveRunStartMs`
  // so the timer freezes on pause/loss and resets when a new attempt
  // begins, without any per-state plumbing.
  liveElapsedMs.value = liveRunStartMs.value > 0 && phase.value === 'playing'
    ? Math.max(0, now - liveRunStartMs.value)
    : 0

  // Smooth camera every frame so anchor swaps glide rather than snap.
  updateCamera(dt)

  paint()
  raf = requestAnimationFrame(renderLoop)
}

const paint = () => {
  const c = canvasRef.value
  if (!c) return
  const ctx = c.getContext('2d')
  if (!ctx) return
  const w = canvasWidth.value
  const h = canvasHeight.value
  // Baseline transform: device-pixel canvas, CSS-pixel coordinates.
  // `setTransform` wipes any leftover state from the previous frame
  // (cheaper than save/restore at the top level) and pre-multiplies by
  // DPR so every subsequent ctx.translate / ctx.scale lands in the
  // device-pixel grid. Without this, drawing at 1× world scale on a
  // 3× DPR phone leaves the browser to upscale at display time, which
  // is what made the grass + chain look pixelated.
  const dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1))
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)

  // World transform: center on cameraPos. `cameraZoom` is computed from
  // the same canvas-size formula and is also bound to the water-bg CSS,
  // so the two layers stay in lockstep.
  ctx.save()
  ctx.translate(w / 2, h / 2)
  const zoom = cameraZoom.value
  ctx.scale(zoom, zoom)
  ctx.translate(-cameraPos.value.x, -cameraPos.value.y)

  // 1. Water is painted by the browser as a CSS background-image on the
  //    `.maw-arena` wrapper div — see the template. The canvas stays
  //    transparent here (`clearRect` above) so the tiled water shows
  //    through.

  // ─── View-bounds culling ──────────────────────────────────────────────
  //
  // Without culling, paint() draws every island and every alive grass
  // blade on every frame regardless of whether they're visible. With
  // ~10 islands × hundreds of blades that's 2-3k drawImage calls per
  // frame even for a screen showing 2-3 islands. Culling drops the
  // unseen work; the camera-glide / screenshake stutter the player saw
  // was just frames where the visible band briefly contained more than
  // usual.
  const camX = cameraPos.value.x
  const camY = cameraPos.value.y
  // Half-extents of the visible region in world space, plus a margin so
  // partial-edge islands and tall blades aren't popped at the boundary.
  const VIEW_MARGIN = 80
  const halfW = w / zoom / 2 + VIEW_MARGIN
  const halfH = h / zoom / 2 + VIEW_MARGIN
  const viewMinX = camX - halfW
  const viewMaxX = camX + halfW
  const viewMinY = camY - halfH
  const viewMaxY = camY + halfH

  const visibleIslands = islands.value.filter(isle => {
    // Both island bitmaps include a cliff hanging ~1.4×r below the
    // polygon centre, so the cull margin runs that wide to keep the
    // bitmap on-screen while the playable polygon is still in view.
    const r = isle.radius * 1.4 + 24
    return (
      isle.cx + r >= viewMinX
      && isle.cx - r <= viewMaxX
      && isle.cy + r >= viewMinY
      && isle.cy - r <= viewMaxY
    )
  })

  // 2. Islands (draw each — order: shadow, body, grass tufts on borders, obstacles, alive grass blades, robot)
  for (const isle of visibleIslands) {
    drawIsland(ctx, isle)
  }

  for (const isle of visibleIslands) {
    for (const ob of isle.obstacles) {
      drawObstacle(ctx, ob)
    }
    // Cosmetic decor (e.g. liberty-trash) — drawn AFTER grass + obstacles
    // so it sits on top of the blades without being affected by cuts.
    // `d.x`/`d.y` are island-relative offsets (see `initIslands` in
    // useMawGame.ts) — adding isle.cx/cy on the fly means moving islands
    // carry their decor without per-tick translation.
    if (isle.decor) {
      for (const d of isle.decor) {
        const wx = isle.cx + d.x
        const wy = isle.cy + d.y
        if (wx < viewMinX || wx > viewMaxX || wy < viewMinY || wy > viewMaxY) continue
        drawDecor(ctx, d.type, wx, wy)
      }
    }
    for (const idx of isle.aliveGrass) {
      const [gx, gy] = isle.grass[idx]!
      // Per-blade culling — cheaper than a drawImage on something that
      // would be entirely outside the viewport.
      if (gx < viewMinX || gx > viewMaxX || gy < viewMinY || gy > viewMaxY) continue
      drawGrassBlade(ctx, gx, gy, stage.value.biome, idx)
    }
  }

  // Debug overlay: dashed yellow outline of each island's playable area
  // (anchors that land outside it splash the player). Toggle with the
  // "cmarc" cheat sequence — see useCheats.ts.
  if (isDebug.value) {
    for (const isle of visibleIslands) {
      drawIslandPlatformBounds(ctx, isle)
    }
  }

  // 3. Coins (always small, almost always near the player — no cull needed).
  for (const coin of coins.value) {
    drawCoin(ctx, coin.x, coin.y)
  }

  // 3b. Exit pole — drawn before the robot so the chain visibly passes
  // over it when cutting it down.
  drawExitPole(ctx, stage.value.exitX, stage.value.exitY, poleCut.value, reqsMet.value)

  // 3c. Ghost robot — replays the player's previous attempt at the
  // current stage. The recorded swap log only stores anchor positions;
  // the swing gear orbits at the engine's base speed so the silhouette
  // reads as "what you did" without bloating the save. Drawn before the
  // live robot so the player's current run sits on top.
  if (
    phase.value === 'playing'
    && hasGhostForStage(currentStageId.value)
    && liveElapsedMs.value > 0
  ) {
    const ghostState = ghostStateAt(currentStageId.value, liveElapsedMs.value)
    if (ghostState) {
      // Ghost chain reach is frozen to what the player had stamped at
      // each anchor swap — never the live upgrade value — so the ghost
      // doesn't mimic upgrades bought after the recording. Legacy
      // triple-format recordings (chainLevel === null) fall back to the
      // live values until the player re-clears the stage.
      const ghostLevel = ghostState.chainLevel ?? liveChainLevel.value
      const ghostReach = ghostState.chainLevel !== null
        ? chainLengthForLevel(ghostState.chainLevel)
        : chainLength.value
      const tSec = liveElapsedMs.value / 1000
      const ghostAngle = tSec * 2.1
      const ghostSwing = {
        x: ghostState.x + Math.cos(ghostAngle) * ghostReach,
        y: ghostState.y + Math.sin(ghostAngle) * ghostReach
      }
      ctx.save()
      ctx.globalAlpha = 0.32
      drawRobot(ctx, {x: ghostState.x, y: ghostState.y}, ghostSwing, ghostAngle, true, ghostLevel)
      ctx.restore()
    }
  }

  // 4. Robot
  if (phase.value !== 'idle') {
    // Spawn-shield blink: a 10 Hz square-wave alpha pulse during the
    // invincibility window so the player reads "I'm safe right now" at
    // a glance without obscuring the chain's swing path.
    const blinking = isInvincible.value
    if (blinking) {
      ctx.save()
      ctx.globalAlpha = (Math.floor(performance.now() / 100) % 2 === 0) ? 0.35 : 1
    }
    drawRobot(ctx, anchorPos.value, swingPos.value, swingAngle.value, anchorIsLeft.value, liveChainLevel.value)
    if (blinking) ctx.restore()
    // Debug overlay AFTER the gears so the hit-zone bands sit on top
    // and the visual-vs-hit gap is obvious.
    if (isDebug.value) {
      drawRobotHitBoxes(ctx, anchorPos.value, swingPos.value)
    }
  }

  ctx.restore()

  // 5. Meteor shower — drawn in screen space (outside the world transform)
  // by the shared precomputed-particle pool. Self no-ops when inactive.
  renderMeteorShower(ctx, w, h)
}

const onViewportChange = () => {
  updateCanvasSize()
  scheduleBottomMeasure()
}

// ─── CrazyGames gameplay lifecycle ──────────────────────────────────────────
//
// CG wants `gameplayStart()` the moment interactive play begins (the robot
// starts swinging — `phase === 'playing'`) and `gameplayStop()` whenever it's
// interrupted. A blocking modal is an interruption, so gameplay is "active"
// only while a match is running AND no modal is open. This single driver
// covers all three required edges:
//   • match start (phase → 'playing')      → gameplayStart
//   • modal opened (isAnyModalOpen → true) → gameplayStop
//   • modal closed (isAnyModalOpen → false, still playing) → gameplayStart
// Mid-game / rewarded ads flip `phase` to 'ad_break' (and the CG ad wrappers
// also bracket themselves), so they're covered too. `start/stopGameplay` are
// idempotent, so the watcher just mirrors the computed truth. No-op off CG.
const isGameplayActive = computed(() => phase.value === 'playing' && !isAnyModalOpen.value)
watch(isGameplayActive, (active) => {
  if (active) startGameplay()
  else stopGameplay()
}, {immediate: true})

onMounted(() => {
  updateCanvasSize()
  scheduleBottomMeasure()
  window.addEventListener('resize', onViewportChange)
  window.addEventListener('orientationchange', onViewportChange)
  window.visualViewport?.addEventListener('resize', onViewportChange)
  window.addEventListener('keydown', onKeyDown)

  initGame()
  raf = requestAnimationFrame(renderLoop)

  // NOTE: gameplayStart() is no longer fired here (that signalled CG at the
  // menu, before play began). The `isGameplayActive` watcher above fires it
  // when `phase` becomes 'playing' — i.e. the moment the robot starts
  // swinging — which is what CG wants.
  //
  // Auto-fire the intro after a short beat so players who don't tap still
  // drop into play (→ phase 'playing' → gameplayStart()).
  setTimeout(() => {
    if (phase.value === 'idle') beginPlay()
  }, 800)
})

onUnmounted(() => {
  window.removeEventListener('resize', onViewportChange)
  window.removeEventListener('orientationchange', onViewportChange)
  window.visualViewport?.removeEventListener('resize', onViewportChange)
  window.removeEventListener('keydown', onKeyDown)
  if (raf !== null) cancelAnimationFrame(raf)
  cancelCountdown()
  stopMeteorShower()
  stopBattleMusic()
  stopGameplay()
})

const showStartHint = computed(() =>
  phase.value === 'playing' && cleared.value === 0
)
</script>

<template lang="pug">
  div.maw-arena.relative.w-screen.overflow-hidden.flex.items-center.justify-center.maw-water-bg(
    class="h-screen h-dvh"
    :style="waterBgStyle"
  )
    canvas(
      ref="canvasRef"
      @pointerdown="onPointerDown"
      @contextmenu="onContextMenu"
      @wheel.prevent="onWheel"
      class="block touch-none"
      :style="shakeStyle"
    )

    //- Click/tap to move — first-two-stages onboarding hint that tracks
    //- the robot in screen space (position computed from the live anchor
    //- + swing world coords). Outside the HUD wrapper so its `position:
    //- absolute` plays well with the canvas.
    //- Sharper-Saw spotlight overlay. Dims the whole scene; sits ABOVE
    //- the HUD so nothing else is interactable, but BELOW the bottom-
    //- right HUD column whose z-index gets bumped to `z-[120]` while
    //- the spotlight is up so the upgrade button stays reachable.
    Transition(name="fade")
      div.saw-spotlight-overlay.pointer-events-auto.fixed.inset-0(
        v-if="showSawSpotlight"
      )
        div.saw-spotlight-arrow {{ t('hints.sawSpotlightArrow') }}

    //- Chain-adjust ("live chain") spotlight — fires after the player
    //- reaches Longer Chain Lv 2. Dims the scene and points the player
    //- at the +1 / -1 buttons in the top-right HUD column. The chain-
    //- adjust-wrap below gets a z-index bump so it sits above this
    //- overlay; tapping either button clears the hint for good.
    Transition(name="fade")
      div.chain-live-spotlight-overlay.pointer-events-auto.fixed.inset-0(
        v-if="showChainLiveSpotlight"
      )
        div.chain-live-spotlight-arrow {{ t('hints.chainLiveSpotlight') }}
          span(v-if="!isMobilePortrait && !isMobileLandscape") Shortcut: Scroll
    //- Centre-bottom stack for the onboarding pills: click-to-move and,
    //- on desktop, the chain-scroll hint stacked under it. Pinned to the
    //- screen so the player's eye doesn't track the robot to read them.
    div.onboarding-hints.pointer-events-none.absolute(
      v-if="showClickToMoveHint || showChainScrollHint || (showSharperSawLv3Hint && phase === 'playing') || (showSharperSawLv6Hint && phase === 'playing') || (showLongerChainHint && phase === 'playing')"
    )
      Transition(name="fade")
        div.click-to-move-hint(v-if="showClickToMoveHint") {{ clickToMoveLabel }}
      Transition(name="fade")
        div.chain-scroll-hint(
          v-if="showChainScrollHint"
          :class="{ shine: chainScrollHintWithShine }"
        ) {{ t('hints.scrollChain') }}
      //- Sharper-Saws Lv 3 nudge — sits BELOW the scroll-hint so the
      //- chain tip stays the most-prominent hint, and only renders mid-
      //- battle (`phase === 'playing'`) so it doesn't ghost over the
      //- start / countdown overlays.
      Transition(name="fade")
        div.saw-lv3-hint(v-if="showSharperSawLv3Hint && phase === 'playing'") {{ t('hints.sawLv3') }}
      //- Sharper-Saws Lv 6 nudge — only after the player has crashed
      //- into crystals twice. Below the Lv 3 hint so the chain reads
      //- as a difficulty ladder.
      Transition(name="fade")
        div.saw-lv6-hint(v-if="showSharperSawLv6Hint && phase === 'playing'") {{ t('hints.sawLv6') }}
      //- Longer-Chain nudge: kicks in after 10 splash deaths, clears
      //- once chainLength reaches Lv 2. The companion spotlight (20
      //- splashes) auto-opens the upgrades modal, so this hint exists
      //- mostly to telegraph what's coming before the modal pops.
      Transition(name="fade")
        div.long-chain-hint(v-if="showLongerChainHint && phase === 'playing'") {{ t('hints.longerChain') }}

    //- HUD
    div.absolute.inset-0.pointer-events-none

      //- Top bar
      div.flex.justify-between.items-start(
        class="p-2 sm:p-2"
        :style="{\
          paddingTop: 'calc(0.5rem + env(safe-area-inset-top, 0px))',\
          paddingLeft: 'calc(0.5rem + env(safe-area-inset-left, 0px))',\
          paddingRight: 'calc(0.5rem + env(safe-area-inset-right, 0px))'\
        }"
      )
        div.flex.flex-col.items-start.gap-1
          StageBadge(
            :stage-id="currentStageId"
            :name="currentStage.name"
            :is-boss="currentStage.isBoss"
            :biome="currentStage.biome"
            :cleared="cleared"
            :target-clears="stage.targetClears"
          )
          //- Life pips, stacked under the stage badge.
          LifeBadge(:life="life" :max-life="maxLife")

          //- Onboarding tip: shown once the player dies to a stump/boulder
          //- until they buy Sharper Saw Lv 2. Quiet panel under the life
          //- pips so it's visible during gameplay without crowding the
          //- centre HUD.
          Transition(name="fade")
            div.saw-hint-banner.pointer-events-none(
              v-if="showSharperSawHint && phase === 'playing'"
            )
              span.font-bold.uppercase.tracking-wider(class="text-[10px] text-yellow-300") {{ t('tip') }}
              span.game-text(class="text-xs sm:text-sm") {{ t('hints.sawLv1') }}

        //- Top-right HUD: SpeedrunButton (with its own live timer
        //- underneath) sits LEFT of the CoinBadge, then the existing
        //- right-column stack continues from the badge downward.
        div.flex.items-start.gap-2.pointer-events-auto
          SpeedrunButton(
            :elapsed-ms="liveElapsedMs"
            :stage-id="currentStageId"
            :is-playing="phase === 'playing'"
          )
          div.flex.flex-col.items-end.gap-2
            CoinBadge(ref="coinBadgeRef")
            TreasureChest(:target-el="coinBadgeEl")

            //- Chain-length quick adjust: step the live chain reach
            //- up/down through the player's purchased upgrade tiers.
            //- +1 sits below the TreasureChest; -1 sits below +1 with a
            //- 0.75rem gap. The wrapper carries 1.5rem of padding as a
            //- safe-tap shield so a near-miss tap (or a disabled-button
            //- press at min/max chain) can't fall through to the canvas
            //- and accidentally swap-anchor the robot into the water.
            //- The wrap also pulls the layout back with a negative
            //- margin so the visual position stays close to the chest.
            div.chain-adjust-wrap.pointer-events-auto(
              v-if="purchasedChainLevel > 0"
              :class="{ 'chain-live-spotlight-lift': showChainLiveSpotlight }"
              @pointerdown.stop
            )
              button.chain-adjust-btn.mt-4(
                type="button"
                :disabled="!canChainUp"
                :class="{ 'chain-live-spotlight-bounce': showChainLiveSpotlight }"
                @click="onChainPlus"
                :title="`Longer chain (Lv. ${liveChainLevel} / ${purchasedChainLevel})`"
              ) +1
              button.chain-adjust-btn(
                type="button"
                :disabled="!canChainDown"
                :class="{ 'chain-live-spotlight-bounce': showChainLiveSpotlight }"
                @click="onChainMinus"
                :title="`Shorter chain (Lv. ${liveChainLevel} / ${purchasedChainLevel})`"
              ) -1

      //- Center: Tap-to-start / countdown / target counter
      div.absolute.flex.items-center.justify-center(class="inset-0 z-[10] pointer-events-none")
        div(
          v-if="phase === 'idle'"
          class="text-center pointer-events-auto cursor-pointer"
          @click="beginPlay()"
        )
          div.text-white.font-black.uppercase.tracking-wider.animate-pulse.game-text(
            class="text-3xl sm:text-5xl mb-2"
          ) {{ t('maw.tapToStart') }}
          div.text-white.italic.game-text(class="text-sm sm:text-lg opacity-60") {{ t('maw.startHint') }}

        div(
          v-else-if="phase === 'meteor_intro' && countdownText"
          class="text-center"
        )
          div.countdown-number.font-black.game-text.text-white(
            :key="countdownText"
            class="text-7xl sm:text-9xl"
          ) {{ countdownText }}

        //- Ad-break placeholder. Most providers (CrazyGames, GameDistribution)
        //- take over the page during a midgame ad — this overlay only really
        //- shows up when the SDK is mid-call but hasn't drawn its own
        //- chrome yet, and on the no-fill / silent paths where the phase
        //- still transitioned momentarily.
        div(
          v-else-if="phase === 'ad_break'"
          class="text-center pointer-events-none"
        )
          div.text-white.font-black.uppercase.tracking-widest.game-text.animate-pulse(
            class="text-xl sm:text-3xl"
          ) {{ t('maw.adPlaying') }}

        //- Hint above HUD when starting
        div(
          v-else-if="showStartHint"
          class="absolute"
          :style="{ top: 'calc(7rem + env(safe-area-inset-top, 0px))' }"
        )
          div.text-white.italic.game-text.opacity-70(class="text-xs sm:text-sm") {{ t('maw.tapAnchor') }}

      //- Editor entry button (debug-only) + Back-to-editor while a test
      //- stage is active. Pinned 50px lower than the coin/chest stack so it
      //- doesn't crowd the HUD elements above it.
      div(
        v-if="showEditorEntry || isTestingStage"
        class="absolute pointer-events-auto z-40"
        :style="{ top: 'calc(7rem + 50px + env(safe-area-inset-top, 0px))', right: 'calc(0.5rem + env(safe-area-inset-right, 0px))' }"
      )
        button.px-3.py-1.rounded.font-bold.text-xs.shadow-lg(
          v-if="!isTestingStage"
          class="bg-purple-600 hover:bg-purple-500 active:scale-95 text-white"
          @click="goToEditor"
        ) {{ t('editorOpen') }}
        button.px-3.py-1.rounded.font-bold.text-xs.shadow-lg(
          v-else
          class="bg-yellow-500 hover:bg-yellow-400 active:scale-95 text-black"
          @click="exitTestStage"
        ) {{ t('editorBack') }}

      //- Stage objective. The HUD top-bar now stacks the StageBadge and
      //- LifeBadge vertically; on portrait that pushes the natural
      //- objective slot ~5rem lower so it sits clear of the life pips.
      //- Landscape keeps the original tighter offset.
      div(
        v-if="phase === 'playing'"
        class="absolute pointer-events-none"
        :style="{ top: `calc(${isMobilePortrait ? '9.4rem' : '4.4rem'} + env(safe-area-inset-top, 0px))`, left: '50%', transform: 'translateX(-50%)' }"
      )
        div.flex.items-center.gap-2.px-3.py-1.rounded-full.border-2(class="border-white/20 bg-black/40")
          span.text-white.game-text.font-black(class="text-xs sm:text-sm")
            | {{ t('maw.targetClears', { n: stage.targetClears }) }}
          span.text-yellow-200.game-text.font-black(class="text-xs sm:text-sm")
            | {{ t('maw.remaining', { n: Math.max(0, stage.targetClears - cleared) }) }}

      //- Bottom-left buttons (mute + settings)
      div(
        v-if="phase !== 'meteor_intro'"
        class="ui-stack-bl fixed pointer-events-auto z-50 flex flex-col items-start gap-1"
        :style="{\
          bottom: `calc(0.5rem + env(safe-area-inset-bottom, 0px) + ${bottomGapPx}px)`,\
          left: 'calc(0.5rem + env(safe-area-inset-left, 0px))',\
          transform: `scale(${uiBtnScale})`,\
          transformOrigin: 'bottom left'\
        }"
      )
        FMuteButton
        button.settings-btn.cursor-pointer.transition-transform.mb-2(
          class="hover:scale-[103%] active:scale-90"
          @click="showOptions = true"
        )
          div.relative
            div.absolute.inset-0.translate-y-1.rounded-lg(class="bg-[#102e7a]")
            div.relative.rounded-lg.border-2.flex.items-center.justify-center.p-2(
              class="bg-gradient-to-b from-[#50aaff] to-[#2266ff] border-[#0f1a30]"
            )
              //- Programmatic gear icon
              svg(viewBox="0 0 24 24" class="w-7 h-7 text-white" fill="currentColor")
                path(d="M12 4 a1 1 0 0 1 1 1 v1.6 a6 6 0 0 1 1.8 0.7 l1.1 -1.1 a1 1 0 0 1 1.4 1.4 l -1.1 1.1 a6 6 0 0 1 0.7 1.8 H18 a1 1 0 1 1 0 2 h-1.6 a6 6 0 0 1 -0.7 1.8 l1.1 1.1 a1 1 0 0 1 -1.4 1.4 l-1.1 -1.1 a6 6 0 0 1 -1.8 0.7 V18 a1 1 0 1 1 -2 0 v -1.6 a6 6 0 0 1 -1.8 -0.7 l-1.1 1.1 a1 1 0 0 1 -1.4 -1.4 l1.1 -1.1 a6 6 0 0 1 -0.7 -1.8 H6 a1 1 0 1 1 0 -2 h1.6 a6 6 0 0 1 0.7 -1.8 L7.2 7.6 a1 1 0 0 1 1.4 -1.4 l1.1 1.1 a6 6 0 0 1 1.8 -0.7 V5 a1 1 0 0 1 1 -1 Z M12 9 a3 3 0 1 0 0 6 a3 3 0 0 0 0 -6 Z")

        div.flex.items-end(class="gap-0 sm:gap-2")
          DailyRewards(@coins-awarded="fireCoinExplosion")
          AdRewardButton(@coins-awarded="fireCoinExplosion")
          BattlePass(@coins-awarded="fireCoinExplosion")

      //- Bottom-right buttons: Achievements + Upgrades
      div(
        v-if="phase !== 'meteor_intro'"
        class="ui-stack-br fixed pointer-events-auto flex flex-col items-end gap-2"
        :class="showSawSpotlight ? 'z-[120]' : 'z-50'"
        :style="{\
          bottom: `calc(0.5rem + env(safe-area-inset-bottom, 0px) + ${bottomGapPx}px)`,\
          right: 'calc(0.5rem + env(safe-area-inset-right, 0px))',\
          transform: `scale(${uiBtnScale})`,\
          transformOrigin: 'bottom right'\
        }"
      )
        div.flex.items-end.gap-1
          //- Achievements
          button.secondary-square-btn(@click="showAch = true" class="cursor-pointer hover:scale-[103%] active:scale-90 transition-transform")
            div.relative
              div.absolute.inset-0.translate-y-1.rounded-lg(class="bg-[#102e7a]")
              div.relative.rounded-lg.border-2.flex.items-center.justify-center.p-2(
                class="bg-gradient-to-b from-[#50aaff] to-[#2266ff] border-[#0f1a30]"
              )
                //- Trophy icon
                svg(viewBox="0 0 24 24" class="w-7 h-7" fill="none" stroke="white" stroke-width="2" stroke-linejoin="round")
                  path(d="M7 4 H17 V8 a5 5 0 0 1 -10 0 Z")
                  path(d="M7 6 H4 a2 2 0 0 0 0 4 H7")
                  path(d="M17 6 H20 a2 2 0 0 1 0 4 H17")
                  path(d="M9 13 H15 V18 H9 Z" fill="rgba(255,255,255,0.25)")
                  path(d="M7 18 H17 V20 H7 Z" fill="white")
              //- Unclaimed-achievements badge — same pattern as the
              //- BattlePass crest (`top/right` with a small translate so
              //- it overhangs the button border). Hidden when there's
              //- nothing to claim.
              div.absolute.top-0.right-0.rounded-full.border-2.bg-red-500.border-white.text-white.font-black.game-text.flex.items-center.justify-center(
                v-if="pendingAchClaims > 0"
                class="-translate-y-1 translate-x-1 min-w-4 h-4 px-1 text-[10px] animate-pulse"
              ) {{ pendingAchClaims }}
          //- Upgrades
          button.secondary-square-btn(
            @click="showUpgrades = true"
            class="cursor-pointer hover:scale-[103%] active:scale-90 transition-transform"
            :class="{ 'saw-spotlight-bounce': showSawSpotlight }"
          )
            div.relative
              div.absolute.inset-0.translate-y-1.rounded-lg(class="bg-[#102e7a]")
              div.relative.rounded-lg.border-2.flex.items-center.justify-center.p-2(
                class="bg-gradient-to-b from-[#50aaff] to-[#2266ff] border-[#0f1a30]"
              )
                //- Up-arrow / upgrade icon
                svg(viewBox="0 0 24 24" class="w-7 h-7 text-white" fill="currentColor")
                  path(d="M4 14 L12 6 L20 14 H15 V20 H9 V14 Z" stroke="black" stroke-width="0.8")

    //- Continue-after-death prompt. Sits in front of the loss-reward
    //- modal — the watcher fires this OR the reward modal, never both,
    //- depending on rewarded-ad eligibility.
    Transition(name="fade")
      div.fixed.inset-0.flex.items-center.justify-center.backdrop-blur-md.p-4(
        v-if="showContinueOffer"
        class="z-[110] bg-black/70"
        :style="{\
          paddingTop: 'calc(1rem + env(safe-area-inset-top, 0px))',\
          paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))',\
          paddingLeft: 'calc(1rem + env(safe-area-inset-left, 0px))',\
          paddingRight: 'calc(1rem + env(safe-area-inset-right, 0px))'\
        }"
      )
        div.flex.flex-col.items-center.gap-4.rounded-2xl.border-2.shadow-2xl(
          class="bg-gradient-to-b from-[#1a1f3a] to-[#0a0e22] border-yellow-300 px-6 py-5 max-w-sm"
        )
          div.font-black.uppercase.tracking-wider.game-text.text-yellow-300(class="text-2xl sm:text-3xl") {{ t('maw.continueOfferTitle') }}
          div.text-white.game-text.text-center.opacity-80(class="text-sm sm:text-base") {{ t('maw.continueOfferBody') }}
          //- Watch-ad path — only offered for broke deaths and only
          //- when the rewarded SDK is ready + the 15s cooldown has
          //- elapsed (eligibility computed by `continueAdAvailable`).
          button.cursor-pointer.transition-transform.flex.items-center.justify-center.gap-2(
            v-if="continueAdAvailable"
            class="w-full px-4 py-2 rounded-lg bg-gradient-to-b from-emerald-400 to-emerald-700 border-2 border-emerald-200 text-white font-black uppercase game-text hover:scale-[103%] active:scale-95 disabled:opacity-50 disabled:cursor-wait"
            :disabled="isAdInFlight"
            @click="onAcceptContinueAd"
          )
            IconMovie(class="w-5 h-5 shrink-0")
            span {{ t('maw.watchAdAndContinue') }}
          //- Coin-revive path — available for BOTH death types. Splash
          //- deaths use the pre-splash safe anchor in `continueAfterDeath`.
          button.cursor-pointer.transition-transform.flex.items-center.justify-center.gap-2(
            v-if="continueCoinAvailable"
            class="w-full px-4 py-2 rounded-lg bg-gradient-to-b from-amber-400 to-amber-700 border-2 border-amber-200 text-white font-black uppercase game-text hover:scale-[103%] active:scale-95 disabled:opacity-50 disabled:cursor-wait"
            :disabled="isAdInFlight"
            @click="onAcceptContinueCoins"
          )
            IconCoin(class="w-5 h-5")
            span {{ t('maw.continueCoins', { n: REVIVE_COIN_COST }) }}
          button.cursor-pointer.transition-transform(
            class="w-full px-4 py-2 rounded-lg bg-slate-700 border-2 border-slate-500 text-white font-bold uppercase game-text hover:scale-[103%] active:scale-95 disabled:opacity-50"
            :disabled="isAdInFlight"
            @click="onSkipContinueAd"
          ) {{ t('maw.skipNoThanks') }}

    //- Reward / loss overlay
    FReward(
      v-model="showReward"
      :show-continue="true"
      @continue="onContinue"
    )
      template(#ribbon)
        span.text-white.font-black.uppercase.italic.game-text(class="sm:text-2xl") {{ t('rewards') }}
      div.flex.flex-col.items-center.gap-4
        div.font-black.uppercase.tracking-wider.game-text(
          class="text-3xl sm:text-5xl"
          :class="gameResult === 'win' ? 'text-green-400' : 'text-red-400'"
        ) {{ gameResult === 'win' ? t('maw.youWin') : t('maw.youLose') }}
        div.text-white.game-text.text-center(
          v-if="gameResult === 'lose'"
          class="text-sm sm:text-base opacity-80"
        ) {{ lossReason === 'splashed' ? t('maw.splashed') : t('maw.broke') }}
        //- Speedrun readout on win: current attempt time, best-ever
        //- time, and a "🎉 New record" callout when the current run
        //- beat the previous best.
        div.win-time-readout.flex.flex-col.items-center.gap-1(
          v-if="gameResult === 'win' && lastClearedTimeMs !== null"
        )
          div.flex.items-center.gap-2
            span.opacity-70.uppercase.tracking-wider.text-xs {{ t('speedrun.time') }}
            span.font-mono.font-black.text-yellow-200(class="text-base sm:text-xl") {{ formatTimeMs(lastClearedTimeMs) }}
          div.flex.items-center.gap-2(v-if="stageBestTimeMs !== null")
            span.opacity-70.uppercase.tracking-wider.text-xs {{ t('speedrun.best') }}
            span.font-mono.font-black(
              class="text-base sm:text-xl"
              :class="lastClearedWasBest ? 'text-emerald-300' : 'text-white'"
            ) {{ formatTimeMs(stageBestTimeMs) }}
          div.text-emerald-300.font-black.game-text.tracking-wide(
            v-if="lastClearedWasBest && lastClearedPrevBestMs !== null"
            class="text-sm sm:text-base"
          ) {{ t('speedrun.newRecord', { prev: formatTimeMs(lastClearedPrevBestMs) }) }}
          div.text-emerald-300.font-black.game-text.tracking-wide(
            v-else-if="lastClearedWasBest"
            class="text-sm sm:text-base"
          ) {{ t('speedrun.firstClear') }}
        //- Sharper-saw onboarding hint — only on the lose screen, only
        //- until the player has actually bought saw level 2.
        div.saw-hint-banner.pointer-events-none(
          v-if="gameResult === 'lose' && showSharperSawHint"
          class="!max-w-xs"
        )
          span.font-bold.uppercase.tracking-wider(class="text-[10px] text-yellow-300") Tip
          span.game-text(class="text-xs sm:text-sm") Upgrade Sharper Saw to Lv 1 to cut tree stumps
        //- Follow-up nudge: once they're at Lv 1 or 2 and have enough
        //- coins (or have died to a stone), point them at Lv 3 (the
        //- tier that breaks through stones). Same lose-screen slot as
        //- the Lv-1 hint above so the progression chain stays visible
        //- end-to-end.
        div.saw-hint-banner.pointer-events-none(
          v-if="gameResult === 'lose' && showSharperSawLv3Hint"
          class="!max-w-xs"
        )
          span.font-bold.uppercase.tracking-wider(class="text-[10px] text-yellow-300") {{ t('tip') }}
          span.game-text(class="text-xs sm:text-sm") {{ t('hints.sawLv3') }}
        //- Crystal nudge: after the player has crashed into crystals
        //- twice, escalate to "buy Lv 6 to pulverise them". Stays on the
        //- lose screen until they actually hit Lv 6.
        div.saw-hint-banner.pointer-events-none(
          v-if="gameResult === 'lose' && showSharperSawLv6Hint"
          class="!max-w-xs"
        )
          span.font-bold.uppercase.tracking-wider(class="text-[10px] text-yellow-300") {{ t('tip') }}
          span.game-text(class="text-xs sm:text-sm") {{ t('hints.sawLv6') }}
        //- Longer-Chain nudge on the lose screen — mirrors the gameplay
        //- hint so a player who drowns repeatedly sees the prompt in
        //- both contexts. The companion spotlight auto-opens the modal
        //- separately at 20 splashes.
        div.saw-hint-banner.pointer-events-none(
          v-if="gameResult === 'lose' && showLongerChainHint"
          class="!max-w-xs"
        )
          span.font-bold.uppercase.tracking-wider(class="text-[10px] text-cyan-200") {{ t('tip') }}
          span.game-text(class="text-xs sm:text-sm") {{ t('hints.longerChain') }}
        //- Rapid-death rescue: when the engine has just flagged 3 deaths
        //- in 10 s and the one-time bonus hasn't been claimed, surface a
        //- watch-ad button that buys a free Reinforced Frame level. Hides
        //- itself once claimed (persistent flag) or once the upgrade is
        //- maxed.
        button.rapid-death-life-offer.cursor-pointer.transition-transform.flex.items-center.justify-center.gap-2(
          v-if="showRapidDeathLifeOffer"
          :disabled="isRapidDeathOfferInFlight"
          @click="onAcceptRapidDeathLifeOffer"
        )
          span.text-xl ❤️
          span.game-text.font-black.uppercase {{ t('hints.rapidDeathLifeOffer') }}
        div.flex.items-center.gap-3(ref="rewardCoinRef")
          IconCoin(class="w-8 h-8 text-yellow-300")
          span.text-yellow-400.font-black.game-text(class="text-2xl sm:text-4xl") +{{ gameResult === 'win' ? stage.rewardWin : stage.rewardLose }}

    OptionsModal(
      :is-open="showOptions"
      @close="showOptions = false"
    )

    AchievementsModal(
      v-model="showAch"
      :target-el="coinBadgeEl"
    )

    UpgradesModal(
      v-model="showUpgrades"
      :restrict-to-id="restrictedUpgradeId"
    )

    //- MOW-A-HERO end-of-campaign reward. Replaces the normal win-FReward
    //- when the player finishes stage 20. Click / Space / Enter or the
    //- explicit button start the campaign over from stage 1 (upgrades
    //- and coins are untouched).
    FReward(
      v-model="showHeroReward"
      :show-continue="true"
      @continue="onRestartCampaign"
    )
      template(#ribbon)
        span.text-white.font-black.uppercase.italic.game-text(class="sm:text-2xl") {{ t('maw.mowAHero') }}
      div.hero-reward.flex.flex-col.items-center.gap-4.text-center
        div.font-black.uppercase.tracking-wider.game-text.text-yellow-300(class="text-3xl sm:text-5xl")
          | {{ t('maw.heroCongrats') }}
        div.text-white.game-text(class="text-base sm:text-lg max-w-md leading-snug")
          span {{ t('maw.heroSubtitle1') }}
          | &nbsp;
          span.text-yellow-300.font-black {{ t('maw.mowAHero') }}
          | .
          br
          span {{ t('maw.heroSubtitle2') }}
        button.hero-reward-btn(
          class="cursor-pointer active:scale-95 transition-transform"
          @click="onRestartCampaign"
        ) ▶ {{ t('maw.tapToStart') }}
</template>

<style scoped lang="sass">
// Browser-tiled water — no canvas draw cost, no bilinear seam.
.maw-water-bg
  background-color: #3aa6c4
  background-image: url('/images/props/water_512x512.webp')
  background-repeat: repeat
  background-size: 512px 512px

// Onboarding hint pill — "Upgrade Sharper Saw to Lv 1 to cut tree stumps".
// Subtle enough to ignore mid-fight, legible enough to read at a glance.
.saw-hint-banner
  display: flex
  align-items: center
  gap: 0.4rem
  padding: 0.3rem 0.55rem
  border-radius: 0.5rem
  border: 2px solid rgba(255, 220, 80, 0.45)
  background: rgba(15, 26, 48, 0.78)
  color: white
  max-width: 16rem
  line-height: 1.15
  text-shadow: 1px 1px 0 #000

// Rapid-death rescue button — emerald like the rest of the watch-ad
// CTAs (continue-after-death modal, in-menu upgrade ads) so the player
// reads it as the same "free with an ad" interaction pattern. Heart
// emoji telegraphs the reward without needing a second line of copy.
.rapid-death-life-offer
  margin-top: 0.25rem
  padding: 0.55rem 0.9rem
  border-radius: 0.6rem
  background: linear-gradient(180deg, #4ade80, #15803d)
  border: 2px solid #0c2616
  color: white
  font-weight: 900
  font-size: 0.78rem
  letter-spacing: 0.02em
  text-shadow: 1px 1px 0 #000
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.35)

  &:hover:not(:disabled)
    transform: scale(1.03)
    filter: brightness(1.07)

  &:active:not(:disabled)
    transform: scale(0.97)

  &:disabled
    opacity: 0.55
    cursor: wait

// MOW-A-HERO end-of-campaign reward — fancier than the per-stage win
// modal so the player feels the moment.
.hero-reward
  padding: 0 1rem

.hero-reward-btn
  margin-top: 0.5rem
  padding: 0.6rem 1.4rem
  border-radius: 999px
  font-weight: 900
  font-size: 1.05rem
  text-transform: uppercase
  letter-spacing: 0.04em
  color: #1a0e22
  background: linear-gradient(180deg, #ffe066, #f5b340)
  border: 3px solid #1a0e22
  text-shadow: 0 1px 0 rgba(255, 255, 255, 0.4)
  box-shadow: 0 0 24px rgba(255, 224, 102, 0.55), 0 4px 10px rgba(0, 0, 0, 0.4)
  animation: hero-reward-pulse 1.6s ease-in-out infinite

@keyframes hero-reward-pulse
  0%, 100%
    transform: scale(1)
    box-shadow: 0 0 24px rgba(255, 224, 102, 0.55), 0 4px 10px rgba(0, 0, 0, 0.4)
  50%
    transform: scale(1.04)
    box-shadow: 0 0 32px rgba(255, 224, 102, 0.85), 0 4px 14px rgba(0, 0, 0, 0.4)

// Sharper-Saw spotlight: full-screen dimmer + bouncing call-out. The
// HUD's bottom-right column gets a z-index bump in template-land while
// the spotlight is on, so the upgrade button sits ABOVE this overlay
// even though the overlay is positioned over the rest of the scene.
.saw-spotlight-overlay
  background: rgba(0, 0, 0, 0.62)
  z-index: 110
  display: flex
  align-items: center
  justify-content: center

.saw-spotlight-arrow
  position: absolute
  right: 6rem
  bottom: 5.5rem
  padding: 0.45rem 0.9rem
  border-radius: 999px
  background: rgba(15, 26, 48, 0.95)
  border: 2px solid #ffd84d
  color: #ffd84d
  font-weight: 900
  font-size: 1rem
  letter-spacing: 0.05em
  text-shadow: 1px 1px 0 #000
  white-space: nowrap
  animation: saw-spotlight-arrow-bob 0.9s ease-in-out infinite

// Bounce applied to the upgrade button itself while the spotlight is
// up — same hint-bounce feel as other "tap me" cues in the HUD.
.saw-spotlight-bounce
  animation: saw-spotlight-bounce 0.85s ease-in-out infinite
  filter: drop-shadow(0 0 12px rgba(255, 216, 77, 0.7))

@keyframes saw-spotlight-bounce
  0%, 100%
    transform: translateY(0) scale(1)
  50%
    transform: translateY(-10px) scale(1.06)

@keyframes saw-spotlight-arrow-bob
  0%, 100%
    transform: translateX(0)
  50%
    transform: translateX(8px)

// Chain-adjust spotlight: same full-screen dimmer + bounce pattern as
// the Sharper-Saw one, but anchored at the top-right HUD (where the
// +1 / -1 buttons live). `lift` is applied to the wrap itself so the
// stacked buttons rise above the overlay together.
.chain-live-spotlight-overlay
  background: rgba(0, 0, 0, 0.62)
  z-index: 110
  display: flex
  align-items: center
  justify-content: center

// Positioned to the LEFT of the +1 / -1 buttons in the top-right HUD
// column. `right` clears the buttons (chain-adjust-wrap sits at
// right ≈ 0.5rem with two ~2.75rem buttons + 1.5rem padding); `top`
// aligns roughly with the button stack below the CoinBadge and
// TreasureChest. The arrow tip on the message points → straight at
// the buttons.
.chain-live-spotlight-arrow
  position: absolute
  top: 11rem
  right: 5.25rem
  padding: 0.7rem 1rem
  border-radius: 16px
  background: rgba(15, 26, 48, 0.96)
  border: 2px solid #ffd84d
  color: #ffd84d
  font-weight: 800
  font-size: 0.95rem
  line-height: 1.35
  letter-spacing: 0.02em
  text-shadow: 1px 1px 0 #000
  text-align: right
  max-width: min(22rem, 60vw)
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45)
  animation: chain-live-arrow-pulse 1.3s ease-in-out infinite

.chain-live-spotlight-lift
  position: relative
  z-index: 130
  filter: drop-shadow(0 0 14px rgba(255, 216, 77, 0.75))

.chain-live-spotlight-bounce
  animation: saw-spotlight-bounce 0.85s ease-in-out infinite

@keyframes chain-live-arrow-pulse
  0%, 100%
    transform: scale(1)
  50%
    transform: scale(1.04)

// Camera-stable onboarding pills container. Pinned to the screen centre
// ~15 % up from the bottom edge so it never moves with the robot.
.onboarding-hints
  z-index: 30
  left: 50%
  bottom: 15%
  transform: translateX(-50%)
  display: flex
  flex-direction: column
  align-items: center
  gap: 0.4rem

// "Click / tap to move" pill.
.click-to-move-hint
  padding: 0.25rem 0.6rem
  border-radius: 999px
  background: rgba(0, 0, 0, 0.65)
  border: 2px solid rgba(255, 255, 255, 0.35)
  color: white
  font-weight: 700
  font-size: 0.85rem
  text-shadow: 1px 1px 0 #000
  letter-spacing: 0.02em
  white-space: nowrap

// "Scroll to increase / decrease chain length" desktop hint, stacked
// directly under the click-to-move pill. The `.shine` modifier flips on
// for the FIRST impression after the chain upgrade unlocks — a soft
// highlight sweeps across so the new shortcut is unmissable.
.chain-scroll-hint
  padding: 0.25rem 0.6rem
  border-radius: 999px
  background: rgba(0, 0, 0, 0.7)
  border: 2px solid rgba(120, 200, 255, 0.45)
  color: white
  font-weight: 700
  font-size: 0.8rem
  text-shadow: 1px 1px 0 #000
  letter-spacing: 0.02em
  white-space: nowrap
  position: relative
  overflow: hidden

  &.shine::before
    content: ''
    position: absolute
    inset: 0
    background: linear-gradient(120deg, transparent 30%, rgba(255, 255, 255, 0.55) 50%, transparent 70%)
    transform: translateX(-100%)
    animation: chain-scroll-shine 2.2s ease-in-out infinite
    pointer-events: none

@keyframes chain-scroll-shine
  0%
    transform: translateX(-100%)
  60%
    transform: translateX(100%)
  100%
    transform: translateX(100%)

// "Upgrade Sharper Saws to Lv 3" pill — same family as the chain-scroll
// hint but tinted yellow so the two stack without looking identical.
// Sits at the bottom of the onboarding-hints column on the gameplay
// HUD; the lose-screen copy reuses the .saw-hint-banner style for the
// modal context.
.saw-lv3-hint
  padding: 0.25rem 0.7rem
  border-radius: 999px
  background: rgba(0, 0, 0, 0.7)
  border: 2px solid rgba(255, 216, 77, 0.55)
  color: #ffd84d
  font-weight: 800
  font-size: 0.8rem
  text-shadow: 1px 1px 0 #000
  letter-spacing: 0.02em
  white-space: nowrap

// Cyan-tinted to read as "next tier up" relative to the yellow Lv 3
// hint above it. The text is a full sentence so we allow wrapping
// rather than forcing a single line that runs off-screen on phones.
.saw-lv6-hint
  padding: 0.3rem 0.75rem
  border-radius: 14px
  background: rgba(0, 0, 0, 0.72)
  border: 2px solid rgba(140, 220, 255, 0.6)
  color: #aee5ff
  font-weight: 800
  font-size: 0.78rem
  line-height: 1.3
  text-shadow: 1px 1px 0 #000
  letter-spacing: 0.02em
  text-align: center
  max-width: min(22rem, 86vw)

// "Upgrade Longer Chains" splash-death nudge. Sits at the bottom of the
// gameplay hint stack. Shares the cyan family with the chain-scroll
// hint above it so the player reads them as a related concept group.
.long-chain-hint
  padding: 0.3rem 0.75rem
  border-radius: 14px
  background: rgba(0, 0, 0, 0.72)
  border: 2px solid rgba(120, 200, 255, 0.55)
  color: #b8e6ff
  font-weight: 800
  font-size: 0.78rem
  line-height: 1.3
  text-shadow: 1px 1px 0 #000
  letter-spacing: 0.02em
  text-align: center
  max-width: min(22rem, 86vw)

// Chain-length quick adjust — a vertical +1 / -1 stack that sits in
// the right HUD column below the TreasureChest. The wrap carries a
// 1.5rem padding "tap shield": pointer events anywhere inside that
// box stick to the wrap instead of falling through to the canvas
// behind, so a fat-finger tap (or a press on a disabled button at
// min/max chain) can never swap-anchor the robot into the water.
// Negative margin cancels the padding for layout purposes so the
// stack still hugs the right edge of the column.
.chain-adjust-wrap
  display: flex
  flex-direction: column
  align-items: flex-end
  gap: 0.75rem
  padding: 1.5rem
  margin: -1.5rem
  // Touch-action `none` so the OS doesn't intercept the tap with a
  // scroll/zoom gesture before our click handler runs.
  touch-action: none

.chain-adjust-btn
  display: flex
  align-items: center
  justify-content: center
  // Quadratic buttons, sized for confident thumb taps. Desktop gets
  // 2.75rem (44px); mobile gets 3.5rem (56px) — the latter is what
  // Apple/Google both recommend as the floor for touch targets.
  width: 2.75rem
  height: 2.75rem
  //border-radius: 0.6rem
  //border: 2px solid #0f1a30
  // Bitmap "increase" art layered under a translucent blue tint so the
  // image carries the visual flavour while the +1 / -1 label stays
  // legible on top. The gradient fallback keeps a readable button if
  // the asset 404s on a slow / blocked network.
  //background-color: #2266ff
  background-image: url('/images/props/increase_256x256.webp')
  background-size: cover, contain
  background-repeat: no-repeat, no-repeat
  background-position: center, center
  background-clip: padding-box
  color: white
  font-size: 1.05rem
  font-weight: 900
  letter-spacing: 0.02em
  // Heavier shadow so the digit reads against the busy bitmap behind.
  text-shadow: 1px 1px 0 #000, 0 0 4px #000
  cursor: pointer
  transition: transform 0.08s ease, filter 0.08s ease
  // Re-assert pointer-events on disabled state. Browsers default
  // `<button disabled>` to `pointer-events: none`, which lets the tap
  // pass through to the canvas (= swap-anchor into water). Keeping
  // events on means the disabled button absorbs the press silently.
  user-select: none

  @media (max-width: 640px)
    width: 3.5rem
    height: 3.5rem
    font-size: 1.3rem
    border-radius: 0.75rem

  &:hover:not(:disabled)
    filter: brightness(1.08)
    transform: scale(1.04)

  &:active:not(:disabled)
    transform: scale(0.94)

  &:disabled
    opacity: 0.45
    cursor: not-allowed
    filter: grayscale(0.4)
    pointer-events: auto

.countdown-number
  display: inline-block
  text-shadow: 0 0 24px rgba(255, 200, 0, 0.85), 0 0 6px rgba(255, 255, 255, 0.6), 0 4px 0 #000
  animation: countdown-pop 600ms ease-out forwards
  will-change: transform, opacity

@keyframes countdown-pop
  0%
    transform: scale(0.4)
    opacity: 0
  20%
    transform: scale(1)
    opacity: 1
  100%
    transform: scale(2.6)
    opacity: 0
</style>
