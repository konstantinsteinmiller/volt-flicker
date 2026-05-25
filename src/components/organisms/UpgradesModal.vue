<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import FModal from '@/components/molecules/FModal.vue'
import IconCoin from '@/components/icons/IconCoin.vue'
import IconMovie from '@/components/icons/IconMovie.vue'
import useMawProgress, { UPGRADES, maxStageReached } from '@/use/useMawProgress'
import useMawConfig from '@/use/useMawConfig'
import { stopGameplay } from '@/use/useCrazyGames'
import useSounds from '@/use/useSound.ts'
import { isRewardedReady, showRewardedAd } from '@/use/useAds'
import { getState, setState } from '@/use/useMawState'

const props = defineProps<{
  modelValue: boolean
  /** When set, only the upgrade with this id is purchasable; every other
   *  row renders disabled. Used by the Sharper-Saw tutorial spotlight to
   *  funnel the player into buying that upgrade before anything else. */
  restrictToId?: string | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
}>()

const { t } = useI18n()
const { upgrades, levelOf, upgradedValue, upgradeCost, buyUpgrade } = useMawProgress()
const { coins, spendCoins } = useMawConfig()
const { playSound } = useSounds()

watch(() => props.modelValue, (open) => {
  if (open) stopGameplay()
})

/** Per-upgrade value formatting. The Longer Chain shows reach as a
 *  percentage gain over its baseline so the player reads it as a power
 *  curve rather than as a raw pixel length. The saw upgrade's value is
 *  redundant with the level badge ("Lv.2 / 2 lvl") so the line is
 *  suppressed entirely. */
interface FormattedValue { text: string; suppress?: boolean }
const formatValue = (id: string, base: number, value: number, unit: string): FormattedValue => {
  if (id === 'chainLength') {
    const pct = Math.round((value / base - 1) * 100)
    return { text: `+${pct}% reach` }
  }
  if (id === 'sawDamage') return { text: '', suppress: true }
  if (unit === '×') return { text: `${value.toFixed(2)} ${unit}` }
  return { text: `${value.toFixed(0)} ${unit}` }
}

const cards = computed(() => UPGRADES.map(u => {
  const lvl = levelOf(u.id)
  const cost = upgradeCost(u.id)
  const value = upgradedValue(u.id)
  const spotlightLock = props.restrictToId != null && props.restrictToId !== u.id
  // Stage gate — Coin Magnet / Tuned Gearbox stay locked until the
  // player has reached Stage 7. Reported via the saved `maxStage`
  // metric so a Mow-a-Hero campaign restart doesn't re-lock them.
  const stageLocked = u.minStage != null && maxStageReached.value < u.minStage
  return {
    ...u,
    level: lvl,
    cost,
    value,
    formatted: formatValue(u.id, u.base, value, u.unit),
    maxed: lvl >= u.maxLevel,
    affordable: coins.value >= cost,
    /** Either the tutorial spotlight restriction OR the per-upgrade
     *  stage gate. Both keep the row un-buyable; the template
     *  distinguishes them so the stage gate can show "Unlocks at
     *  Stage N" instead of the spotlight's grey-out. */
    locked: spotlightLock || stageLocked,
    stageLocked,
    minStage: u.minStage
  }
}))

const onBuy = (id: string) => {
  const card = cards.value.find(c => c.id === id)
  if (!card || card.maxed || !card.affordable || card.locked) return
  if (!spendCoins(card.cost)) return
  buyUpgrade(card.id as any)
  playSound('level-up', 0.08)
}

// ─── Watch-ad upgrade path ─────────────────────────────────────────────
// Each upgrade row has a second button: spend a rewarded video instead
// of coins. To stop ad-spam, all ad-buys share a 30-second cooldown —
// timestamped in localStorage so a refresh can't shortcut it. Button
// state walks through "ready → cooldown countdown → ready" each cycle.
const REWARDED_UPGRADE_COOLDOWN_MS = 30_000
const REWARDED_UPGRADE_LAST_KEY = 'spinner_rewarded_upgrade_last_at'

const readLastAdAt = (): number => {
  const v = getState<unknown>(REWARDED_UPGRADE_LAST_KEY, 0)
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

const lastRewardedAdAt = ref<number>(readLastAdAt())
const tickNow = ref(Date.now())
let cooldownTickId: number | null = null

onMounted(() => {
  // 250 ms tick is plenty for a second-resolution countdown.
  cooldownTickId = window.setInterval(() => { tickNow.value = Date.now() }, 250)
})
onUnmounted(() => {
  if (cooldownTickId != null) {
    window.clearInterval(cooldownTickId)
    cooldownTickId = null
  }
})

const adCooldownRemainingMs = computed(() =>
  Math.max(0, REWARDED_UPGRADE_COOLDOWN_MS - (tickNow.value - lastRewardedAdAt.value))
)
const adCooldownSeconds = computed(() => Math.ceil(adCooldownRemainingMs.value / 1000))
const isAdCooldownActive = computed(() => adCooldownRemainingMs.value > 0)
const isAdButtonUsable = computed(() => isRewardedReady.value && !isAdCooldownActive.value)

let adInFlight = false
const onWatchAdForUpgrade = async (id: string) => {
  if (adInFlight || !isAdButtonUsable.value) return
  const card = cards.value.find(c => c.id === id)
  if (!card || card.maxed || card.locked) return
  adInFlight = true
  try {
    const granted = await showRewardedAd()
    if (!granted) return
    buyUpgrade(card.id as any)
    playSound('level-up', 0.08)
    // Stamp the cooldown only on a SUCCESSFUL grant — a no-fill / closed
    // ad shouldn't penalise the player. Mirrored to localStorage so a
    // refresh respects the timer.
    lastRewardedAdAt.value = Date.now()
    setState(REWARDED_UPGRADE_LAST_KEY, lastRewardedAdAt.value)
  } finally {
    adInFlight = false
  }
}
</script>

<template lang="pug">
  FModal(
    :model-value="modelValue"
    :title="t('upgrades.title')"
    @update:model-value="emit('update:modelValue', $event)"
  )
    div.flex.flex-col.gap-2.p-2
      p.text-center.text-white.game-text(class="text-xs sm:text-sm opacity-80") {{ t('upgrades.subtitle') }}
      div.flex.flex-col.gap-2
        div.upgrade-card(
          v-for="card in cards"
          :key="card.id"
          :class="{ 'upgrade-card-locked': card.locked, 'upgrade-card-stage-locked': card.stageLocked, 'upgrade-card-spotlight': card.locked === false && restrictToId === card.id }"
        )
          div.flex.flex-col.gap-1.flex-1
            div.flex.items-center.gap-2.flex-wrap
              span.font-black.game-text.text-white(class="text-sm sm:text-base") {{ t(card.nameKey) }}
              span.font-bold.text-yellow-200.game-text(class="text-[10px]") {{ t('upgrades.level', { n: card.level }) }}
              //- Stage-lock chip. Renders ONLY while the upgrade is
              //- gated — once unlocked we drop the badge entirely so
              //- the row reads the same as any other.
              span.stage-lock-chip(v-if="card.stageLocked")
                | {{ t('upgrades.unlocksAtStage', { n: card.minStage }) }}
            span.text-white.game-text(class="text-[10px] sm:text-xs opacity-70") {{ t(card.descKey) }}
            span.text-cyan-200.game-text(
              v-if="!card.formatted.suppress"
              class="text-[9px] sm:text-[10px]"
            ) {{ card.formatted.text }}
          div.flex.flex-col.items-center.gap-1.shrink-0(class="ml-2 min-w-20")
            div.flex.items-center(class="gap-0.5" v-if="!card.maxed")
              IconCoin(class="w-4 h-4 text-yellow-300")
              span.font-black.game-text.text-yellow-100(class="text-xs") {{ card.cost }}
            button.upgrade-btn(
              v-if="!card.maxed"
              :disabled="!card.affordable || card.locked"
              @click="onBuy(card.id)"
            ) {{ t('upgrades.buy') }}
            //- Alternative: rewarded-ad path. Hidden when the upgrade is
            //- maxed, or when the SDK never had a rewarded ready in the
            //- first place (no point teasing a button that can't fire).
            //- During the 30 s shared cooldown the button stays visible
            //- but shows the remaining seconds and is :disabled.
            button.upgrade-ad-btn(
              v-if="!card.maxed && (isRewardedReady || isAdCooldownActive)"
              :disabled="!isAdButtonUsable || card.locked"
              @click="onWatchAdForUpgrade(card.id)"
              :title="isAdCooldownActive ? `Available in ${adCooldownSeconds}s` : 'Watch a short ad to upgrade'"
            )
              span(v-if="isAdCooldownActive") {{ adCooldownSeconds }}s
              IconMovie(v-else class="w-5 h-5 mx-auto")
            span.font-black.game-text.text-yellow-300(v-else-if="card.maxed" class="text-xs") {{ t('upgrades.maxedOut') }}
</template>

<style scoped lang="sass">
.upgrade-card
  display: flex
  align-items: center
  gap: 0.5rem
  padding: 0.4rem 0.5rem
  border-radius: 0.5rem
  background: rgba(0, 0, 0, 0.4)
  border: 2px solid rgba(255, 255, 255, 0.15)

  // Dimmed when the tutorial spotlight is forcing a specific upgrade.
  &.upgrade-card-locked
    opacity: 0.35
    filter: grayscale(0.5)
    pointer-events: none

  // Slightly less aggressive grey-out for stage-locked rows — the
  // upgrade is meaningfully visible so the player can preview what's
  // coming, but the buttons stay disabled.
  &.upgrade-card-stage-locked
    opacity: 0.55
    filter: grayscale(0.3)

  // Highlight ring on the unrestricted row to draw the eye.
  &.upgrade-card-spotlight
    border-color: #ffd84d
    box-shadow: 0 0 14px rgba(255, 216, 77, 0.55)

// Small chip badge next to the upgrade name when it's gated by stage
// progression. Cyan tint mirrors the existing "live value" line color
// so the locked tier still feels informational rather than alarming.
.stage-lock-chip
  padding: 0.05rem 0.4rem
  border-radius: 999px
  background: rgba(20, 60, 100, 0.7)
  border: 1px solid rgba(140, 220, 255, 0.55)
  color: #aee5ff
  font-size: 0.6rem
  font-weight: 800
  letter-spacing: 0.04em
  text-transform: uppercase
  white-space: nowrap

.upgrade-btn
  padding: 0.25rem 0.6rem
  border-radius: 0.5rem
  font-weight: 900
  font-size: 0.7rem
  text-transform: uppercase
  cursor: pointer
  background: linear-gradient(180deg, #50aaff, #2266ff)
  border: 2px solid #0f1a30
  color: white
  text-shadow: 1px 1px 0 #000
  transition: transform 0.1s ease

  &:hover:not(:disabled)
    transform: scale(1.05)

  &:disabled
    opacity: 0.5
    cursor: not-allowed
    background: #444

  &:active:not(:disabled)
    transform: scale(0.95)

// Watch-ad alternative — visually distinct (green) so the player reads
// it as "different path to upgrade", not "redundant button".
.upgrade-ad-btn
  margin-top: 0.2rem
  padding: 0.2rem 0.55rem
  border-radius: 0.5rem
  font-weight: 900
  font-size: 0.65rem
  text-transform: uppercase
  cursor: pointer
  background: linear-gradient(180deg, #4ade80, #15803d)
  border: 2px solid #0c2616
  color: white
  text-shadow: 1px 1px 0 #000
  transition: transform 0.1s ease, filter 0.1s ease
  white-space: nowrap

  &:hover:not(:disabled)
    transform: scale(1.05)
    filter: brightness(1.08)

  &:disabled
    opacity: 0.5
    cursor: not-allowed
    background: #444

  &:active:not(:disabled)
    transform: scale(0.95)
</style>
