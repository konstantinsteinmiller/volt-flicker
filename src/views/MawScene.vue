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
import useMawProgress from '@/use/useMawProgress'
import useSounds, { useMusic } from '@/use/useSound'
import { useScreenshake } from '@/use/useScreenshake'
import useUser from '@/use/useUser'
import useBottomSafe from '@/use/useBottomSafe'
import { isMobilePortrait } from '@/use/useUser'
import useCheats from '@/use/useCheats'
import { spawnCoinExplosion } from '@/use/useCoinExplosion'
import { stopGameplay, startGameplay, triggerHappytime } from '@/use/useCrazyGames'
import { isInterstitialReady, showMidgameAd, isRewardedReady, showRewardedAd } from '@/use/useAds'

import StageBadge from '@/components/StageBadge.vue'
import LifeBadge from '@/components/atoms/LifeBadge.vue'
import CoinBadge from '@/components/organisms/CoinBadge.vue'
import TreasureChest from '@/components/organisms/TreasureChest.vue'
import DailyRewards from '@/components/organisms/DailyRewards.vue'
import BattlePass from '@/components/organisms/BattlePass.vue'
import AdRewardButton from '@/components/organisms/AdRewardButton.vue'
import OptionsModal from '@/components/organisms/OptionsModal.vue'
import AchievementsModal from '@/components/organisms/AchievementsModal.vue'
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
  drawWater,
  drawRobot,
  drawCoin,
  drawObstacle,
  drawGrassBlade,
  drawExitPole
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
const { playSound } = useSounds()
const { startBattleMusic, stopBattleMusic } = useMusic()
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
  poleCut,
  reqsMet
} = useMawGame()

const { coins: coinTotal } = useMawConfig()
const { currentStageId, currentStage, stageReinitSignal } = useMawCampaign()
const { } = useMawProgress()

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
  // own phase BEFORE the meteor shower. The counter bumps on every
  // beginPlay regardless of platform; the actual ad show is gated on
  // `isInterstitialReady` so a Noop / blocked / no-fill state silently
  // falls through to the countdown.
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
      // next mount's intro sequence.
      if (phase.value !== 'ad_break') return
    }
  }
  startMeteorIntro()
}

watch(phase, (p) => {
  if (p === 'game_over') {
    stopBattleMusic()
    if (gameResult.value === 'win') {
      showReward.value = true
      nextTick(() => fireCoinExplosion(rewardCoinRef.value))
      return
    }
    // Loss path — only the "broke" death (life ran out from obstacle hits)
    // is eligible for a watch-ad continue. Splash deaths drop the player
    // over open water with nowhere to stand on resume.
    const eligible =
      lossReason.value === 'broke'
      && isRewardedReady.value
      && (Date.now() - lastContinueOfferAt) >= CONTINUE_AD_COOLDOWN_MS
    if (eligible) {
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

  // World transform: center on cameraPos.
  ctx.save()
  ctx.translate(w / 2, h / 2)
  // Slight zoom so islands feel inhabited but the chain reach is visible.
  const zoom = Math.min(1.3, Math.max(0.7, Math.min(w, h) / 800))
  ctx.scale(zoom, zoom)
  ctx.translate(-cameraPos.value.x, -cameraPos.value.y)

  // 1. Water (full-screen tiled background)
  drawWater(ctx, cameraPos.value.x, cameraPos.value.y, w / zoom, h / zoom)

  // 2. Islands (draw each — order: shadow, body, grass tufts on borders, obstacles, alive grass blades, robot)
  for (const isle of islands.value) {
    drawIsland(ctx, isle)
  }

  for (const isle of islands.value) {
    for (const ob of isle.obstacles) {
      drawObstacle(ctx, ob)
    }
    for (const idx of isle.aliveGrass) {
      const [gx, gy] = isle.grass[idx]!
      drawGrassBlade(ctx, gx, gy, stage.value.biome, idx)
    }
  }

  // 3. Coins
  for (const coin of coins.value) {
    drawCoin(ctx, coin.x, coin.y)
  }

  // 3b. Exit pole — drawn before the robot so the chain visibly passes
  // over it when cutting it down.
  drawExitPole(ctx, stage.value.exitX, stage.value.exitY, poleCut.value, reqsMet.value)

  // 4. Robot
  if (phase.value !== 'idle') {
    drawRobot(ctx, anchorPos.value, swingPos.value, swingAngle.value, anchorIsLeft.value)
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
  div.maw-arena.relative.w-screen.overflow-hidden.flex.items-center.justify-center(
    class="bg-[#0d2a18] h-screen h-dvh"
  )
    canvas(
      ref="canvasRef"
      @pointerdown="onPointerDown"
      @contextmenu="onContextMenu"
      class="block touch-none"
      :style="shakeStyle"
    )

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

        div.flex.flex-col.items-end.gap-2
          CoinBadge(ref="coinBadgeRef")
          TreasureChest(:target-el="coinBadgeEl")

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
        class="ui-stack-br fixed pointer-events-auto z-50 flex flex-col items-end gap-2"
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
          button.secondary-square-btn(@click="showUpgrades = true" class="cursor-pointer hover:scale-[103%] active:scale-90 transition-transform")
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
          button.cursor-pointer.transition-transform(
            class="w-full px-4 py-2 rounded-lg bg-gradient-to-b from-emerald-400 to-emerald-700 border-2 border-emerald-200 text-white font-black uppercase game-text hover:scale-[103%] active:scale-95 disabled:opacity-50 disabled:cursor-wait"
            :disabled="isAdInFlight"
            @click="onAcceptContinueAd"
          ) ▶ {{ t('maw.watchAdAndContinue') }}
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
    )
</template>

<style scoped lang="sass">
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
