<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import FModal from '@/components/molecules/FModal.vue'
import IconCoin from '@/components/icons/IconCoin.vue'
import useEpicProgress, { UPGRADES, levelOf, upgradeCost } from '@/use/useEpicProgress'
import useSounds from '@/use/useSound'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>()

const { t } = useI18n()
const { playSound } = useSounds()
const progress = useEpicProgress()

const isOpen = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v)
})

interface CardView {
  id: string
  level: number
  maxLevel: number
  cost: number
  unlocked: boolean
  canBuy: boolean
  maxed: boolean
  unlockStage: number
}

const cards = computed<CardView[]>(() =>
  UPGRADES.map((u) => {
    const level = levelOf(u.id)
    return {
      id: u.id,
      level,
      maxLevel: u.maxLevel,
      cost: upgradeCost(u.id),
      unlocked: progress.isUnlocked(u.id),
      canBuy: progress.canBuy(u.id),
      maxed: level >= u.maxLevel,
      unlockStage: u.unlockStage
    }
  })
)

const buy = (id: string): void => {
  if (progress.buyUpgrade(id)) {
    playSound('level-up', 0.06)
  } else {
    playSound('barricade', 0.04)
  }
}
</script>

<template lang="pug">
  FModal(v-model="isOpen" :title="t('upgrades.title')")
    div.flex.flex-col.gap-2.p-2
      p.text-center.text-white.game-text.opacity-80(class="text-xs sm:text-sm") {{ t('upgrades.subtitle') }}
      div.flex.flex-col.gap-2
        div.upgrade-card.flex.items-center.gap-3.rounded-xl.border-2.p-2.text-left(
          v-for="card in cards"
          :key="card.id"
          class="bg-black/30 border-white/15"
          :class="{ 'opacity-60': !card.unlocked }"
        )
          //- Level pips
          div.flex.flex-col.items-center.gap-1.shrink-0(class="w-12")
            span.font-black.game-text.text-yellow-200(class="text-xs") {{ t('upgrades.level', { n: card.level }) }}
            div.flex(class="gap-0.5")
              span.rounded-full(
                v-for="i in card.maxLevel"
                :key="i"
                class="w-1.5 h-1.5"
                :class="i <= card.level ? 'bg-yellow-300' : 'bg-white/25'"
              )
          //- Name + description
          div.flex-1.min-w-0
            div.font-black.game-text.text-white(class="text-sm sm:text-base") {{ t('upgrades.names.' + card.id) }}
            div.text-white.game-text.opacity-70.leading-tight(class="text-[10px] sm:text-xs") {{ t('upgrades.descriptions.' + card.id) }}
          //- Action
          div.shrink-0
            div.text-center.text-white.game-text.opacity-70(v-if="!card.unlocked" class="text-[10px]") {{ t('upgrades.unlocksAtStage', { n: card.unlockStage }) }}
            div.text-center.text-emerald-300.font-black.game-text(v-else-if="card.maxed" class="text-xs") {{ t('upgrades.maxedOut') }}
            button.cursor-pointer.transition-transform.flex.items-center.gap-1.rounded-lg.border-2.px-3(
              v-else
              class="py-1.5 active:scale-95 hover:scale-[103%] bg-gradient-to-b from-[#ffcd00] to-[#f7a000] border-[#0f1a30] disabled:opacity-50 disabled:grayscale"
              :disabled="!card.canBuy"
              @click="buy(card.id)"
            )
              IconCoin(class="w-4 h-4 text-yellow-100")
              span.font-black.game-text.text-white(class="text-sm") {{ card.cost }}
</template>

<style scoped lang="sass">
.upgrade-card
  transition: all 0.15s ease
</style>
