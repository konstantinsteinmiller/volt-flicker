<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'

import useEpicGame from '@/use/useEpicGame'
import useEpicConfig from '@/use/useEpicConfig'
import { drawScene, configureGeometry } from '@/use/useEpicArt'
import { powerupFraction } from '@/use/usePowerups'
import useEpicProgress from '@/use/useEpicProgress'
import useBattlePass from '@/use/useBattlePass'
import { useMusic } from '@/use/useSound'
import useSounds from '@/use/useSound'
import { useScreenshake } from '@/use/useScreenshake'
import { isGamePaused } from '@/use/useGamePause'
import { isMobilePortrait } from '@/use/useUser'
import { spawnCoinExplosion } from '@/use/useCoinExplosion'
import {
  isInterstitialReady,
  isRewardedReady,
  showMidgameAd,
  showRewardedAd
} from '@/use/useAds'

import StageBadge from '@/components/StageBadge.vue'
import ScoreBadge from '@/components/atoms/ScoreBadge.vue'
import PowerupBanner from '@/components/atoms/PowerupBanner.vue'
import CoinBadge from '@/components/organisms/CoinBadge.vue'
import FMuteButton from '@/components/atoms/FMuteButton.vue'
import FReward from '@/components/atoms/FReward.vue'
import DailyRewards from '@/components/organisms/DailyRewards.vue'
import AdRewardButton from '@/components/organisms/AdRewardButton.vue'
import BattlePass from '@/components/organisms/BattlePass.vue'
import OptionsModal from '@/components/organisms/OptionsModal.vue'
import EpicUpgradesModal from '@/components/organisms/EpicUpgradesModal.vue'
import IconCoin from '@/components/icons/IconCoin.vue'
import IconMovie from '@/components/icons/IconMovie.vue'

const { t } = useI18n()
const epic = useEpicGame()
const {
  phase, score, gameResult, lossCause, coinsThisRun, lastWinReward,
  stageTarget, resetForStage, begin, flip, step, revive
} = epic
const progress = useEpicProgress()
const { addCoins } = useEpicConfig()
const { awardCampaignWin } = useBattlePass()
const { startBattleMusic, stopBattleMusic } = useMusic()
const { playSound } = useSounds()
const { shakeStyle } = useScreenshake()

// ─── Canvas + render loop ─────────────────────────────────────────────────
const canvasRef = ref<HTMLCanvasElement | null>(null)
let ctx: CanvasRenderingContext2D | null = null
let rafId = 0
let lastT = 0
let cssW = 0
let cssH = 0

const resize = (): void => {
  const canvas = canvasRef.value
  if (!canvas) return
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  cssW = window.innerWidth
  cssH = window.innerHeight
  canvas.width = Math.round(cssW * dpr)
  canvas.height = Math.round(cssH * dpr)
  canvas.style.width = cssW + 'px'
  canvas.style.height = cssH + 'px'
  ctx = canvas.getContext('2d')
  ctx?.setTransform(dpr, 0, 0, dpr, 0, 0)
  configureGeometry(cssW, cssH)
}

const loop = (t: number): void => {
  rafId = requestAnimationFrame(loop)
  const dt = lastT ? Math.min(t - lastT, 60) : 16
  lastT = t
  if (!isGamePaused.value && phase.value === 'playing') step(dt)
  else step(0) // keep render position fresh without advancing the clock
  if (ctx) drawScene(ctx, cssW, cssH, performance.now())
}

// ─── Input ────────────────────────────────────────────────────────────────
const onPointerDown = (e: PointerEvent): void => {
  e.preventDefault()
  if (showResult.value || showSecondChance.value) return
  if (phase.value === 'idle') begin()
  else if (phase.value === 'playing') flip()
}
const onKey = (e: KeyboardEvent): void => {
  if (e.code !== 'Space' && e.code !== 'ArrowUp' && e.code !== 'Enter') return
  const tgt = e.target
  if (tgt instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(tgt.tagName)) return
  e.preventDefault()
  if (showResult.value || showSecondChance.value) return
  if (phase.value === 'idle') begin()
  else if (phase.value === 'playing') flip()
}

// ─── HUD state ──────────────────────────────────────────────────────────────
const showOptions = ref(false)
const showUpgrades = ref(false)
const showResult = ref(false)
const showSecondChance = ref(false)
const isAdInFlight = ref(false)
const coinBadgeRef = ref<InstanceType<typeof CoinBadge> | null>(null)
const coinBadgeEl = computed<HTMLElement | null>(() => coinBadgeRef.value?.rootEl ?? null)

const bannerFraction = ref(0)
let bannerTimer = 0

const showHint = computed(() => phase.value === 'playing')
const hintText = computed(() => isMobilePortrait.value ? t('hints.tapToTurn') : t('hints.clickToTurn'))
const startText = computed(() => isMobilePortrait.value ? t('startTouch') : t('startDesktop'))

// 2× reward button cooldown (30s after use), shared across win + lose screens.
const SECOND_CHANCE_COOLDOWN = 30_000
const TWO_X_COOLDOWN = 30_000
let lastSecondChanceAt = 0
let twoXReadyAt = 0
const twoXUsed = ref(false)
const tickNow = ref(Date.now())

const runTotalCoins = computed(() => coinsThisRun.value + (gameResult.value === 'win' ? lastWinReward.value : 0))
const twoXAvailable = computed(() =>
  !twoXUsed.value && isRewardedReady.value && tickNow.value >= twoXReadyAt && runTotalCoins.value > 0
)
const secondChanceEligible = (): boolean =>
  isRewardedReady.value && Date.now() - lastSecondChanceAt > SECOND_CHANCE_COOLDOWN

// ─── Result / death / win flow ──────────────────────────────────────────────
const onDeath = async (): Promise<void> => {
  stopBattleMusic()
  await wait(450)
  if (phase.value !== 'dead') return // revived already (shouldn't happen here)
  if (secondChanceEligible()) {
    lastSecondChanceAt = Date.now()
    showSecondChance.value = true
  } else {
    void presentLoseScreen()
  }
}

const onAcceptContinue = async (): Promise<void> => {
  if (isAdInFlight.value) return
  isAdInFlight.value = true
  showSecondChance.value = false
  try {
    const ok = await showRewardedAd()
    if (ok) {
      revive()
      startBattleMusic()
    } else {
      await presentLoseScreen()
    }
  } finally {
    isAdInFlight.value = false
  }
}

const onSkipContinue = (): void => {
  showSecondChance.value = false
  void presentLoseScreen()
}

const presentLoseScreen = async (): Promise<void> => {
  twoXUsed.value = false
  showResult.value = true
  void grantRunCoins()
  // 500ms after the lose screen shows: mute + request interstitial, then resume.
  await wait(500)
  if (isInterstitialReady.value) {
    await showMidgameAd()
  }
  startBattleMusic()
}

const onWin = async (): Promise<void> => {
  awardCampaignWin()
  twoXUsed.value = false
  showResult.value = true
  void grantRunCoins()
  playSound('celebration-3', 0.08)
}

const onTwoX = async (): Promise<void> => {
  if (isAdInFlight.value || !twoXAvailable.value) return
  isAdInFlight.value = true
  try {
    const bonus = runTotalCoins.value
    const ok = await showRewardedAd()
    if (ok) {
      addCoins(bonus)
      twoXUsed.value = true
      twoXReadyAt = Date.now() + TWO_X_COOLDOWN
      const el = rewardCoinRef.value
      if (el && coinBadgeEl.value) spawnCoinExplosion({ sourceEl: el, targetEl: coinBadgeEl.value, count: 26 })
    }
  } finally {
    isAdInFlight.value = false
  }
}

const rewardCoinRef = ref<HTMLElement | null>(null)

// Bank the run's coins (collected + win reward) to the wallet only now, on the
// result screen, and fly them into the CoinBadge with a CoinExplosion. The 2×
// rewarded button (onTwoX) banks a second copy on top to double them.
const grantRunCoins = async (): Promise<void> => {
  const total = runTotalCoins.value
  if (total <= 0) return
  addCoins(total)
  await nextTick()
  const el = rewardCoinRef.value
  if (el && coinBadgeEl.value) {
    spawnCoinExplosion({ sourceEl: el, targetEl: coinBadgeEl.value, count: Math.min(40, 12 + Math.round(total / 4)) })
  }
}

const onResultContinue = (): void => {
  if (isAdInFlight.value) return
  showResult.value = false
  resetForStage()
  startBattleMusic()
}

const fireCoinExplosion = (sourceEl: HTMLElement): void => {
  if (coinBadgeEl.value) spawnCoinExplosion({ sourceEl, targetEl: coinBadgeEl.value })
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

watch(phase, (p, prev) => {
  if (p === 'playing' && prev !== 'playing') startBattleMusic()
  if (p === 'dead' && prev === 'playing') void onDeath()
  if (p === 'won' && prev === 'playing') void onWin()
})

// ─── Lifecycle ──────────────────────────────────────────────────────────────
onMounted(() => {
  resetForStage()
  nextTick(resize)
  window.addEventListener('resize', resize)
  window.addEventListener('keydown', onKey)
  rafId = requestAnimationFrame(loop)
  bannerTimer = window.setInterval(() => {
    bannerFraction.value = powerupFraction(epic.clock())
    tickNow.value = Date.now()
  }, 100)
})
onUnmounted(() => {
  cancelAnimationFrame(rafId)
  window.removeEventListener('resize', resize)
  window.removeEventListener('keydown', onKey)
  clearInterval(bannerTimer)
  stopBattleMusic()
})
</script>

<template lang="pug">
  div.epic-arena.relative.w-screen.overflow-hidden(class="h-screen h-dvh bg-[#0a1224]")
    canvas(
      ref="canvasRef"
      class="block touch-none absolute inset-0"
      :style="shakeStyle"
      @pointerdown="onPointerDown"
      @contextmenu.prevent
    )

    //- HUD overlay (non-interactive except where re-enabled)
    div.absolute.inset-0.pointer-events-none
      //- Top bar: StageBadge (left) + CoinBadge (right)
      div.flex.justify-between.items-start(
        class="p-2"
        :style="{\
          paddingTop: 'calc(0.5rem + env(safe-area-inset-top, 0px))',\
          paddingLeft: 'calc(0.5rem + env(safe-area-inset-left, 0px))',\
          paddingRight: 'calc(0.5rem + env(safe-area-inset-right, 0px))'\
        }"
      )
        StageBadge(
          :stage-id="progress.stage.value"
          :cleared="score"
          :target="stageTarget"
        )
        CoinBadge(ref="coinBadgeRef")

      //- Center-top big score
      div.absolute.left-0.right-0.flex.justify-center(
        class="z-[5]"
        :style="{ top: 'calc(3.2rem + env(safe-area-inset-top, 0px))' }"
      )
        ScoreBadge(v-if="phase === 'playing' || phase === 'dead'" :score="score")

      //- Tap-to-start prompt
      div.absolute.inset-0.flex.items-center.justify-center.z-10(
        v-if="phase === 'idle'"
        class="pointer-events-none"
      )
        div.text-center
          div.text-white.font-black.uppercase.tracking-wider.animate-pulse.game-text(
            class="text-3xl sm:text-5xl mb-2"
          ) {{ startText }}
          div.text-white.italic.game-text(class="text-sm sm:text-lg opacity-60") {{ t('startSubhint') }}

      //- "Tap/Click to change direction" hint (just below the score)
      Transition(name="fade")
        div.absolute.left-0.right-0.flex.justify-center.z-10(
          v-if="showHint"
          :style="{ top: 'calc(8.5rem + env(safe-area-inset-top, 0px))' }"
        )
          div.text-white.italic.game-text.opacity-70(class="text-xs sm:text-sm px-3 py-1 rounded-full bg-black/30") {{ hintText }}

      //- Active power-up banner (bottom-center, above the button rows)
      div.absolute.left-0.right-0.flex.justify-center(
        :style="{ bottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))' }"
      )
        PowerupBanner(:fraction="bannerFraction")

      //- Bottom-left: mute + settings + meta buttons
      div.absolute.pointer-events-auto.z-50.flex.flex-col.items-start.gap-1(
        :style="{\
          bottom: 'calc(0.5rem + env(safe-area-inset-bottom, 0px))',\
          left: 'calc(0.5rem + env(safe-area-inset-left, 0px))'\
        }"
      )
        FMuteButton
        button.cursor-pointer.transition-transform.mb-1(
          class="hover:scale-[103%] active:scale-90"
          @click="showOptions = true"
        )
          div.relative
            div.absolute.inset-0.translate-y-1.rounded-lg(class="bg-[#102e7a]")
            div.relative.rounded-lg.border-2.flex.items-center.justify-center.p-2(
              class="bg-gradient-to-b from-[#50aaff] to-[#2266ff] border-[#0f1a30]"
            )
              svg(viewBox="0 0 24 24" class="w-7 h-7 text-white" fill="currentColor")
                path(d="M12 4 a1 1 0 0 1 1 1 v1.6 a6 6 0 0 1 1.8 0.7 l1.1 -1.1 a1 1 0 0 1 1.4 1.4 l -1.1 1.1 a6 6 0 0 1 0.7 1.8 H18 a1 1 0 1 1 0 2 h-1.6 a6 6 0 0 1 -0.7 1.8 l1.1 1.1 a1 1 0 0 1 -1.4 1.4 l-1.1 -1.1 a6 6 0 0 1 -1.8 0.7 V18 a1 1 0 1 1 -2 0 v -1.6 a6 6 0 0 1 -1.8 -0.7 l-1.1 1.1 a1 1 0 0 1 -1.4 -1.4 l1.1 -1.1 a6 6 0 0 1 -0.7 -1.8 H6 a1 1 0 1 1 0 -2 h1.6 a6 6 0 0 1 0.7 -1.8 L7.2 7.6 a1 1 0 0 1 1.4 -1.4 l1.1 1.1 a6 6 0 0 1 1.8 -0.7 V5 a1 1 0 0 1 1 -1 Z M12 9 a3 3 0 1 0 0 6 a3 3 0 0 0 0 -6 Z")
        div.flex.items-end(class="gap-0 sm:gap-2")
          DailyRewards(@coins-awarded="fireCoinExplosion")
          AdRewardButton(@coins-awarded="fireCoinExplosion")
          BattlePass(@coins-awarded="fireCoinExplosion")

      //- Bottom-right: upgrades
      div.absolute.pointer-events-auto.z-50.flex.flex-col.items-end.gap-2(
        :style="{\
          bottom: 'calc(0.5rem + env(safe-area-inset-bottom, 0px))',\
          right: 'calc(0.5rem + env(safe-area-inset-right, 0px))'\
        }"
      )
        button.cursor-pointer.transition-transform(
          class="hover:scale-[103%] active:scale-90"
          @click="showUpgrades = true"
        )
          div.relative
            div.absolute.inset-0.translate-y-1.rounded-lg(class="bg-[#102e7a]")
            div.relative.rounded-lg.border-2.flex.items-center.justify-center.p-2(
              class="bg-gradient-to-b from-[#50aaff] to-[#2266ff] border-[#0f1a30]"
            )
              svg(viewBox="0 0 24 24" class="w-7 h-7 text-white" fill="currentColor")
                path(d="M4 14 L12 6 L20 14 H15 V20 H9 V14 Z" stroke="black" stroke-width="0.8")

    //- Second-chance overlay (watch ad & continue / skip)
    Transition(name="fade")
      div.fixed.inset-0.flex.items-center.justify-center.backdrop-blur-md.p-4(
        v-if="showSecondChance"
        class="z-[110] bg-black/70"
        :style="{\
          paddingTop: 'calc(1rem + env(safe-area-inset-top, 0px))',\
          paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))'\
        }"
      )
        div.flex.flex-col.items-center.gap-4.rounded-2xl.border-2.shadow-2xl(
          class="bg-gradient-to-b from-[#1a1f3a] to-[#0a0e22] border-yellow-300 px-6 py-5 max-w-sm"
        )
          div.font-black.uppercase.tracking-wider.game-text.text-yellow-300(class="text-2xl sm:text-3xl") {{ t('secondChance.title') }}
          div.text-white.game-text.text-center.opacity-80(class="text-sm sm:text-base") {{ t('secondChance.body') }}
          button.cursor-pointer.transition-transform.flex.items-center.justify-center.gap-2(
            class="w-full px-4 py-2 rounded-lg bg-gradient-to-b from-emerald-400 to-emerald-700 border-2 border-emerald-200 text-white font-black uppercase game-text hover:scale-[103%] active:scale-95 disabled:opacity-50 disabled:cursor-wait"
            :disabled="isAdInFlight"
            @click="onAcceptContinue"
          )
            IconMovie(class="w-5 h-5 shrink-0")
            span {{ t('secondChance.watch') }}
          button.cursor-pointer.transition-transform(
            class="w-full px-4 py-2 rounded-lg bg-slate-700 border-2 border-slate-500 text-white font-bold uppercase game-text hover:scale-[103%] active:scale-95 disabled:opacity-50"
            :disabled="isAdInFlight"
            @click="onSkipContinue"
          ) {{ t('secondChance.skip') }}

    //- Win / Lose result overlay
    FReward(
      v-model="showResult"
      :show-continue="!isAdInFlight"
      @continue="onResultContinue"
    )
      template(#ribbon)
        span.text-white.font-black.uppercase.italic.game-text(class="sm:text-2xl") {{ t('rewards') }}
      div.flex.flex-col.items-center.gap-4
        div.font-black.uppercase.tracking-wider.game-text(
          class="text-3xl sm:text-5xl"
          :class="gameResult === 'win' ? 'text-green-400' : 'text-red-400'"
        ) {{ gameResult === 'win' ? t('result.win') : t('result.lose') }}
        div.text-white.game-text.text-center.opacity-80(
          v-if="gameResult === 'lose'"
          class="text-sm sm:text-base"
        ) {{ lossCause === 'hole' ? t('result.fell') : t('result.crashed') }}
        //- Tiles travelled this run
        div.flex.items-center.gap-2.text-white.game-text(class="text-base sm:text-lg")
          span.opacity-70.uppercase.tracking-wider.text-xs {{ t('result.tiles') }}
          span.font-black.text-yellow-200(class="text-xl sm:text-2xl") {{ score }}
        //- Coins collected (+ win reward)
        div.flex.flex-col.items-center.gap-1(ref="rewardCoinRef")
          div.flex.items-center.gap-3
            IconCoin(class="w-8 h-8 text-yellow-300")
            span.text-yellow-400.font-black.game-text(class="text-2xl sm:text-4xl") +{{ runTotalCoins }}
          div.text-white.game-text.opacity-70(v-if="gameResult === 'win'" class="text-xs") {{ t('result.winReward', { n: lastWinReward }) }}
        //- 2× rewarded button
        button.cursor-pointer.transition-transform.flex.items-center.justify-center.gap-2(
          v-if="twoXAvailable"
          class="px-5 py-2 rounded-xl bg-gradient-to-b from-[#ffcd00] to-[#f7a000] border-2 border-[#0f1a30] text-white font-black uppercase game-text hover:scale-[103%] active:scale-95 disabled:opacity-50"
          :disabled="isAdInFlight"
          @click="onTwoX"
        )
          IconMovie(class="w-5 h-5 shrink-0")
          span {{ t('result.double') }}

    OptionsModal(:is-open="showOptions" @close="showOptions = false")
    EpicUpgradesModal(v-model="showUpgrades")
</template>

<style scoped lang="sass">
.fade-enter-active, .fade-leave-active
  transition: opacity 0.3s ease
.fade-enter-from, .fade-leave-to
  opacity: 0
</style>
