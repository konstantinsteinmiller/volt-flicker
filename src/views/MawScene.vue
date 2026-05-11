<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import type { Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { isDebug } from '@/use/useMatch'
import { testStage, setTestStage } from '@/use/useCustomStages'
import { getState, setState } from '@/use/useMawState'
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
  upgradeCost
} from '@/use/useMawProgress'
import useSounds, { useMusic, type LoopHandle } from '@/use/useSound'
import { schedulePreloadOnIdle } from '@/use/useSoundPreload'
import { useScreenshake } from '@/use/useScreenshake'
import useUser from '@/use/useUser'
import useBottomSafe from '@/use/useBottomSafe'
import { isMobilePortrait, isMobileLandscape } from '@/use/useUser'
import useCheats from '@/use/useCheats'
import { spawnCoinExplosion } from '@/use/useCoinExplosion'
import { stopGameplay, startGameplay, triggerHappytime } from '@/use/useCrazyGames'
import { isInterstitialReady, showMidgameAd, isRewardedReady, showRewardedAd } from '@/use/useAds'
import SpeedrunButton from '@/components/organisms/SpeedrunButton.vue'
import {
  ghostAnchorAt,
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
//- AchievementsModal — it shows the same data through the maw-it-down
//- claim system, just wrapped in nicer artwork.
import AchievementsModal from '@/components/organisms/SpinnerAchievementsModal.vue'
import UpgradesModal from '@/components/organisms/UpgradesModal.vue'
import FIconButton from '@/components/atoms/FIconButton.vue'
import FMuteButton from '@/components/atoms/FMuteButton.vue'
import FReward from '@/components/atoms/FReward.vue'
import IconCoin from '@/components/icons/IconCoin.vue'

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

const { t } = useI18n()
const { playSound, playLoop } = useSounds()
const { startBattleMusic, stopBattleMusic } = useMusic()

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
const { shakeStyle } = useScreenshake()
const { } = useUser()

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
  lastClearedTimeMs,
  lastClearedWasBest,
  lastClearedPrevBestMs,
  poleCut,
  reqsMet
} = useMawGame()

const { coins: coinTotal, spendCoins, addCoins } = useMawConfig()
const { currentStageId, currentStage, stageReinitSignal, resetCampaign, isLastStage } = useMawCampaign()
const { } = useMawProgress()

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
const onChainPlus = () => adjustActiveChainLevel(1)
const onChainMinus = () => adjustActiveChainLevel(-1)

// ─── Onboarding hints ───────────────────────────────────────────────────
// "Upgrade Sharper Saw to Lv 1" — fires after the player's first death to
// an obstacle (stump / boulder) and stays visible until they actually buy
// the upgrade. Shown both as a small tooltip during the battle phase and
// inside the loss-reward modal.
const showSharperSawHint = computed(() =>
  hasBrokenFromObstacle.value && levelOf('sawDamage') < 1
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
  isTouchDevice.value ? 'Tap to move' : 'Click / Space to move'
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

watch(sawSpotlightArmed, (armed) => {
  if (armed) {
    isPaused.value = true
    stopBattleMusic()
    // Drama stinger the moment the spotlight conditions arm — clear
    // audible cue that the player has earned a "you must upgrade
    // before you continue" beat.
    playSound('reward-continue', 0.12)
  } else {
    isPaused.value = false
    // Restart music only if we're back in a live match — otherwise the
    // game-over / idle screen would start the loop unprompted.
    if (phase.value === 'playing') startBattleMusic()
  }
})

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

// ─── Coin badge target ───────────────────────────────────────────────────
const coinBadgeRef = ref<{ rootEl: HTMLElement | null } | null>(null)
const coinBadgeEl = computed(() => coinBadgeRef.value?.rootEl ?? null)
const rewardCoinRef = ref<HTMLElement | null>(null)

const fireCoinExplosion = (sourceEl: HTMLElement | null) => {
  if (sourceEl && coinBadgeEl.value) {
    spawnCoinExplosion({ sourceEl, targetEl: coinBadgeEl.value })
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
  c.width = canvasWidth.value
  c.height = canvasHeight.value
  // Keep the meteor-shower trail buffer in step with the live canvas.
  precomputeMeteorShower(canvasWidth.value, canvasHeight.value)
}

const { bottomGapPx, scheduleBottomMeasure } = useBottomSafe()

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
    triggerHappytime()
  })
}

const beginPlay = async () => {
  // Re-entrancy guard. `beginPlay` can be triggered by the idle-screen
  // click, the auto-fire timeout, the loss-reward "continue" button, AND
  // the post-attempt cadence — drop the call if a run is already mid-flight.
  if (
    phase.value === 'playing'
    || phase.value === 'meteor_intro'
    || phase.value === 'ad_break'
  ) return
  initGame()

  // Mid-attempt ad cadence: every 3rd attempt we run a midgame ad as its
  // own phase BEFORE gameplay. The counter bumps on every beginPlay
  // regardless of platform; the actual ad show is gated on
  // `isInterstitialReady` so a Noop / blocked / no-fill state silently
  // falls through.
  bumpAdCounter()
  if (battlesSinceAd.value >= 3) {
    resetAdCounter()
    if (isInterstitialReady.value) {
      phase.value = 'ad_break'
      try {
        await showMidgameAd()
      } catch { /* SDK error → fall through to gameplay */ }
      // If the player navigated away (route change / unmount), the phase
      // ref will have been reinitialised — bail rather than racing the
      // next mount's start.
      if (phase.value !== 'ad_break') return
    }
  }
  // Meteor shower + 3-2-1 countdown removed from the entry path — they
  // were padding game-entry. `startMeteorIntro` / `runCountdown` are
  // intentionally kept in the codebase in case they come back for a
  // boss-stage flourish later. For now: snap straight into gameplay.
  evaluateChainScrollHint()
  startBattleMusic()
  startMatch()
  triggerHappytime()
}

// Drive the chain-whir loop off `phase` + `isPaused`. Started on the
// first frame of any `'playing'` state, stopped on any other phase or
// when the saw-spotlight pause flips on (pause watch lives below).
watch([phase, isPaused], ([p, paused]) => {
  if (p === 'playing' && !paused) startChainLoop()
  else stopChainLoop()
}, { immediate: true })

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
        return
      }
      showReward.value = true
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
    const adEligible =
      lossReason.value === 'broke'
      && isRewardedReady.value
      && (Date.now() - lastContinueOfferAt) >= CONTINUE_AD_COOLDOWN_MS
    const coinEligible = coinTotal.value >= REVIVE_COIN_COST
    if (adEligible || coinEligible) {
      showContinueOffer.value = true
    } else {
      showReward.value = true
    }
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
  // Interstitial cadence is now driven from `beginPlay` at attempt start
  // (every 3rd attempt, in its own `ad_break` phase) — this handler just
  // dismisses the modal and kicks off the next attempt.
  beginPlay()
}

/** Player accepts the watch-ad continue offer. On a granted ad we resume
 *  the run with full life; on a refusal / no-fill we fall through to the
 *  regular loss-reward modal so the death isn't swept under the rug. The
 *  15s cooldown timer is stamped regardless of grant so a quick refusal
 *  can't immediately re-prompt the player. */
const onAcceptContinueAd = async () => {
  if (isAdInFlight.value) return
  isAdInFlight.value = true
  lastContinueOfferAt = Date.now()
  try {
    const granted = await showRewardedAd()
    if (granted) {
      const resumed = continueAfterDeath()
      if (resumed) {
        showContinueOffer.value = false
        startBattleMusic()
        return
      }
    }
    // Ad not granted (skipped / no-fill / blocked) OR continue refused —
    // fall through to the standard loss-reward modal.
    showContinueOffer.value = false
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
 *  can render its own visible/disabled state. */
const continueAdAvailable = computed(() =>
  lossReason.value === 'broke'
  && isRewardedReady.value
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

// ─── Ad cadence ──────────────────────────────────────────────────────────
const AD_KEY = 'ca_battles_since_ad'
const readBattlesSinceAd = (): number => {
  const v = getState<unknown>(AD_KEY)
  if (typeof v === 'number' && Number.isFinite(v)) return v
  const n = parseInt(String(v ?? ''), 10)
  return Number.isFinite(n) ? n : 0
}
const battlesSinceAd: Ref<number> = ref(readBattlesSinceAd())
const bumpAdCounter = () => {
  battlesSinceAd.value += 1
  setState(AD_KEY, battlesSinceAd.value)
}
const resetAdCounter = () => {
  battlesSinceAd.value = 0
  setState(AD_KEY, 0)
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
    if (isle.decor) {
      for (const d of isle.decor) {
        if (d.x < viewMinX || d.x > viewMaxX || d.y < viewMinY || d.y > viewMaxY) continue
        drawDecor(ctx, d.type, d.x, d.y)
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
    const ghostA = ghostAnchorAt(currentStageId.value, liveElapsedMs.value)
    if (ghostA) {
      // Ghost swing — anchor + base chain reach + slowly rotating angle
      // so the chain doesn't sit perfectly still on a stationary anchor.
      const tSec = liveElapsedMs.value / 1000
      const ghostAngle = tSec * 2.1
      const ghostSwing = {
        x: ghostA.x + Math.cos(ghostAngle) * chainLength.value,
        y: ghostA.y + Math.sin(ghostAngle) * chainLength.value
      }
      ctx.save()
      ctx.globalAlpha = 0.32
      drawRobot(ctx, ghostA, ghostSwing, ghostAngle, true, liveChainLevel.value)
      ctx.restore()
    }
  }

  // 4. Robot
  if (phase.value !== 'idle') {
    drawRobot(ctx, anchorPos.value, swingPos.value, swingAngle.value, anchorIsLeft.value, liveChainLevel.value)
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

onMounted(() => {
  updateCanvasSize()
  scheduleBottomMeasure()
  window.addEventListener('resize', onViewportChange)
  window.addEventListener('orientationchange', onViewportChange)
  window.visualViewport?.addEventListener('resize', onViewportChange)
  window.addEventListener('keydown', onKeyDown)

  initGame()
  raf = requestAnimationFrame(renderLoop)

  // Start on first interaction — players land into the menu state with the
  // game world rendered so the "tap to start" CTA explains the loop without
  // a full-screen tutorial.
  startGameplay()
  // Auto-fire the meteor intro after a short beat so players who don't tap
  // still see the countdown and play.
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
        div.saw-spotlight-arrow Upgrade now! →

    //- Centre-bottom stack for the onboarding pills: click-to-move and,
    //- on desktop, the chain-scroll hint stacked under it. Pinned to the
    //- screen so the player's eye doesn't track the robot to read them.
    div.onboarding-hints.pointer-events-none.absolute(
      v-if="showClickToMoveHint || showChainScrollHint"
    )
      Transition(name="fade")
        div.click-to-move-hint(v-if="showClickToMoveHint") {{ clickToMoveLabel }}
      Transition(name="fade")
        div.chain-scroll-hint(
          v-if="showChainScrollHint"
          :class="{ shine: chainScrollHintWithShine }"
        ) Scroll to increase / decrease chain length

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
              span.font-bold.uppercase.tracking-wider(class="text-[10px] text-yellow-300") Tip
              span.game-text(class="text-xs sm:text-sm") Upgrade Sharper Saw to Lv 1 to cut tree stumps

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
            //- Disabled if there's nothing to step into.
            div.mt-4.flex.items-center.gap-1.pointer-events-auto(v-if="purchasedChainLevel > 0")
              button.chain-adjust-btn(
                type="button"
                :disabled="!canChainDown"
                @click="onChainMinus"
                :title="`Shorter chain (Lv. ${liveChainLevel} / ${purchasedChainLevel})`"
              )
                svg(viewBox="0 0 24 24" class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round")
                  path(d="M9.5 6.5 L7 9 a3.5 3.5 0 0 0 5 5 l1-1")
                  path(d="M14.5 17.5 L17 15 a3.5 3.5 0 0 0 -5 -5 l-1 1")
                span.text-xs.font-black.game-text -1
              button.chain-adjust-btn(
                type="button"
                :disabled="!canChainUp"
                @click="onChainPlus"
                :title="`Longer chain (Lv. ${liveChainLevel} / ${purchasedChainLevel})`"
              )
                svg(viewBox="0 0 24 24" class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round")
                  path(d="M9.5 6.5 L7 9 a3.5 3.5 0 0 0 5 5 l1-1")
                  path(d="M14.5 17.5 L17 15 a3.5 3.5 0 0 0 -5 -5 l-1 1")
                span.text-xs.font-black.game-text +1

      //- Center: Tap-to-start / countdown / target counter
      div.absolute.flex.items-center.justify-center(class="inset-0 z-[10] pointer-events-none")
        div(
          v-if="phase === 'idle'"
          class="text-center pointer-events-auto cursor-pointer"
          @click="beginPlay"
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
        ) ✎ Editor
        button.px-3.py-1.rounded.font-bold.text-xs.shadow-lg(
          v-else
          class="bg-yellow-500 hover:bg-yellow-400 active:scale-95 text-black"
          @click="exitTestStage"
        ) ◀ Back to Editor

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
          button.cursor-pointer.transition-transform(
            v-if="continueAdAvailable"
            class="w-full px-4 py-2 rounded-lg bg-gradient-to-b from-emerald-400 to-emerald-700 border-2 border-emerald-200 text-white font-black uppercase game-text hover:scale-[103%] active:scale-95 disabled:opacity-50 disabled:cursor-wait"
            :disabled="isAdInFlight"
            @click="onAcceptContinueAd"
          ) ▶ {{ t('maw.watchAdAndContinue') }}
          //- Coin-revive path — available for BOTH death types. Splash
          //- deaths use the pre-splash safe anchor in `continueAfterDeath`.
          button.cursor-pointer.transition-transform.flex.items-center.justify-center.gap-2(
            v-if="continueCoinAvailable"
            class="w-full px-4 py-2 rounded-lg bg-gradient-to-b from-amber-400 to-amber-700 border-2 border-amber-200 text-white font-black uppercase game-text hover:scale-[103%] active:scale-95 disabled:opacity-50 disabled:cursor-wait"
            :disabled="isAdInFlight"
            @click="onAcceptContinueCoins"
          )
            IconCoin(class="w-5 h-5")
            span Continue · {{ REVIVE_COIN_COST }}
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
            span.opacity-70.uppercase.tracking-wider.text-xs Time
            span.font-mono.font-black.text-yellow-200(class="text-base sm:text-xl") {{ formatTimeMs(lastClearedTimeMs) }}
          div.flex.items-center.gap-2(v-if="stageBestTimeMs !== null")
            span.opacity-70.uppercase.tracking-wider.text-xs Best
            span.font-mono.font-black(
              class="text-base sm:text-xl"
              :class="lastClearedWasBest ? 'text-emerald-300' : 'text-white'"
            ) {{ formatTimeMs(stageBestTimeMs) }}
          div.text-emerald-300.font-black.game-text.tracking-wide(
            v-if="lastClearedWasBest && lastClearedPrevBestMs !== null"
            class="text-sm sm:text-base"
          ) 🎉 New record! (was {{ formatTimeMs(lastClearedPrevBestMs) }})
          div.text-emerald-300.font-black.game-text.tracking-wide(
            v-else-if="lastClearedWasBest"
            class="text-sm sm:text-base"
          ) 🎉 First clear — set the bar!
        //- Sharper-saw onboarding hint — only on the lose screen, only
        //- until the player has actually bought saw level 2.
        div.saw-hint-banner.pointer-events-none(
          v-if="gameResult === 'lose' && showSharperSawHint"
          class="!max-w-xs"
        )
          span.font-bold.uppercase.tracking-wider(class="text-[10px] text-yellow-300") Tip
          span.game-text(class="text-xs sm:text-sm") Upgrade Sharper Saw to Lv 1 to cut tree stumps
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
      :restrict-to-id="forceSawUpgradeOnly ? 'sawDamage' : null"
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
        span.text-white.font-black.uppercase.italic.game-text(class="sm:text-2xl") MOW-A-HERO
      div.hero-reward.flex.flex-col.items-center.gap-4.text-center
        div.font-black.uppercase.tracking-wider.game-text.text-yellow-300(class="text-3xl sm:text-5xl")
          | Congratulations!
        div.text-white.game-text(class="text-base sm:text-lg max-w-md leading-snug")
          | You have completed every course and are a true
          span.text-yellow-300.font-black  MOW-A-HERO
          | .
          br
          | Your name will enter the Hall of Fame.
        button.hero-reward-btn(
          class="cursor-pointer active:scale-95 transition-transform"
          @click="onRestartCampaign"
        ) ▶ Play from Stage 1 again
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

// Chain-length quick adjust buttons — match the secondary-square-btn
// palette but compact, since they live in the HUD's right column.
.chain-adjust-btn
  display: inline-flex
  align-items: center
  gap: 0.15rem
  padding: 0.25rem 0.45rem
  border-radius: 0.5rem
  border: 2px solid #0f1a30
  background: linear-gradient(180deg, #50aaff, #2266ff)
  color: white
  text-shadow: 1px 1px 0 #000
  cursor: pointer
  transition: transform 0.08s ease, filter 0.08s ease

  &:hover:not(:disabled)
    filter: brightness(1.08)
    transform: scale(1.04)

  &:active:not(:disabled)
    transform: scale(0.94)

  &:disabled
    opacity: 0.45
    cursor: not-allowed
    filter: grayscale(0.4)

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
