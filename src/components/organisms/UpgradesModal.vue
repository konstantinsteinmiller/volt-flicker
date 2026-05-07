<script setup lang="ts">
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import FModal from '@/components/molecules/FModal.vue'
import IconCoin from '@/components/icons/IconCoin.vue'
import useMawProgress, { UPGRADES } from '@/use/useMawProgress'
import useMawConfig from '@/use/useMawConfig'
import { stopGameplay } from '@/use/useCrazyGames'
import useSounds from '@/use/useSound.ts'

const props = defineProps<{
  modelValue: boolean
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
  return {
    ...u,
    level: lvl,
    cost,
    value,
    formatted: formatValue(u.id, u.base, value, u.unit),
    maxed: lvl >= u.maxLevel,
    affordable: coins.value >= cost
  }
}))

const onBuy = (id: string) => {
  const card = cards.value.find(c => c.id === id)
  if (!card || card.maxed || !card.affordable) return
  if (!spendCoins(card.cost)) return
  buyUpgrade(card.id as any)
  playSound('reward-continue', 0.06)
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
        )
          div.flex.flex-col.gap-1.flex-1
            div.flex.items-center.gap-2
              span.font-black.game-text.text-white(class="text-sm sm:text-base") {{ card.name }}
              span.font-bold.text-yellow-200.game-text(class="text-[10px]") {{ t('upgrades.level', { n: card.level }) }}
            span.text-white.game-text(class="text-[10px] sm:text-xs opacity-70") {{ card.description }}
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
              :disabled="!card.affordable"
              @click="onBuy(card.id)"
            ) {{ t('upgrades.buy') }}
            span.font-black.game-text.text-yellow-300(v-else class="text-xs") {{ t('upgrades.maxedOut') }}
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
</style>
