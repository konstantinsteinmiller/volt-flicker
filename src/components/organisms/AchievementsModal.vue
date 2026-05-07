<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import FModal from '@/components/molecules/FModal.vue'
import IconCoin from '@/components/icons/IconCoin.vue'
import useMawProgress, { ACHIEVEMENTS } from '@/use/useMawProgress'
import useMawConfig from '@/use/useMawConfig'
import { spawnCoinExplosion } from '@/use/useCoinExplosion'
import { stopGameplay } from '@/use/useCrazyGames'
import useSounds from '@/use/useSound.ts'

const props = defineProps<{
  modelValue: boolean
  /** Coin badge element to fly the coin VFX to. */
  targetEl?: HTMLElement | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
}>()

const { t } = useI18n()
const { achievements, isAchUnlocked, isAchClaimed, claimAchievement, pendingAchClaims } = useMawProgress()
const { addCoins } = useMawConfig()
const { playSound } = useSounds()

watch(() => props.modelValue, (open) => {
  if (open) stopGameplay()
})

const cards = computed(() => ACHIEVEMENTS.map(a => {
  const value = achievements.value.totals[a.metric] ?? 0
  return {
    ...a,
    progress: Math.min(value, a.goal),
    pct: Math.min(1, value / a.goal),
    unlocked: isAchUnlocked(a.id),
    claimed: isAchClaimed(a.id)
  }
}))

const onClaim = (id: string, sourceEl: EventTarget | null) => {
  const reward = claimAchievement(id)
  if (reward <= 0) return
  addCoins(reward)
  playSound('reward-continue', 0.06)
  if (sourceEl instanceof HTMLElement && props.targetEl) {
    spawnCoinExplosion({ sourceEl, targetEl: props.targetEl })
  }
}
</script>

<template lang="pug">
  FModal(
    :model-value="modelValue"
    :title="t('achievements.title')"
    @update:model-value="emit('update:modelValue', $event)"
  )
    div.flex.flex-col.gap-2.p-2
      p.text-center.text-white.game-text(class="text-xs sm:text-sm opacity-80") {{ t('achievements.subtitle') }}
      div.flex.flex-col.gap-2
        div.ach-card(
          v-for="card in cards"
          :key="card.id"
          :class="{ 'is-unlocked': card.unlocked, 'is-claimed': card.claimed }"
        )
          div.flex.flex-col.gap-1.flex-1
            span.font-black.game-text.text-white(class="text-sm sm:text-base") {{ card.name }}
            span.text-white.game-text(class="text-[10px] sm:text-xs opacity-70") {{ card.description }}
            div.relative.h-2.rounded-full.overflow-hidden.border(class="bg-black/40 border-white/20")
              div.h-full.bg-gradient-to-r.from-yellow-300.to-yellow-500(:style="{ width: card.pct * 100 + '%' }")
            span.text-white.game-text(class="text-[9px] opacity-70") {{ t('achievements.progress', { current: card.progress, goal: card.goal }) }}
          div.flex.flex-col.items-center.gap-1.shrink-0(class="ml-2")
            div.flex.items-center(class="gap-0.5")
              IconCoin(class="w-4 h-4 text-yellow-300")
              span.font-black.game-text.text-yellow-100(class="text-xs") {{ card.reward }}
            button.claim-btn(
              :disabled="!card.unlocked || card.claimed"
              @click="onClaim(card.id, $event.currentTarget)"
            ) {{ card.claimed ? t('achievements.claimed') : t('achievements.claim') }}
</template>

<style scoped lang="sass">
.ach-card
  display: flex
  align-items: center
  gap: 0.5rem
  padding: 0.4rem 0.5rem
  border-radius: 0.5rem
  background: rgba(0, 0, 0, 0.4)
  border: 2px solid rgba(255, 255, 255, 0.15)

  &.is-unlocked:not(.is-claimed)
    border-color: #fcd34d
    box-shadow: 0 0 8px rgba(252, 211, 77, 0.3)

  &.is-claimed
    opacity: 0.55

.claim-btn
  padding: 0.25rem 0.6rem
  border-radius: 0.5rem
  font-weight: 900
  font-size: 0.7rem
  text-transform: uppercase
  cursor: pointer
  background: linear-gradient(180deg, #ffcd00, #f7a000)
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
</style>
