<script setup lang="ts">
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import FModal from '@/components/molecules/FModal.vue'
import IconCoin from '@/components/icons/IconCoin.vue'
import useEpicSkins, { SKINS, skinCost, type SkinRarity } from '@/use/useEpicSkins'
import { prependBaseUrl } from '@/utils/function'
import useSounds from '@/use/useSound'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>()

const { t } = useI18n()
const { playSound } = useSounds()
const skinsApi = useEpicSkins()

const isOpen = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v)
})

// Clear the "NEW!" badges once the player has actually opened the shop.
watch(isOpen, (open) => {
  if (open) skinsApi.markAllSeen()
})

// Rarity → card-border colour. Common = muted, rare = blue, epic = purple.
const RARITY_BORDER: Record<SkinRarity, string> = {
  common: 'border-white/25',
  rare: 'border-sky-400',
  epic: 'border-purple-400'
}

interface SkinView {
  id: string
  name: string
  preview: string
  owned: boolean
  selected: boolean
  canBuy: boolean
  locked: boolean
  isNew: boolean
  rarity: SkinRarity
  unlockStage: number
  cost: number
}

const cards = computed<SkinView[]>(() =>
  SKINS.map((s) => ({
    id: s.id,
    name: s.name,
    preview: prependBaseUrl(s.src),
    owned: skinsApi.isOwned(s.id),
    selected: skinsApi.isSelected(s.id),
    canBuy: skinsApi.canBuy(s.id),
    locked: skinsApi.isLocked(s.id),
    isNew: skinsApi.isNew(s.id),
    rarity: s.rarity ?? 'common',
    unlockStage: s.unlockStage ?? 0,
    cost: skinCost(s.id)
  }))
)

const onCardAction = (id: string): void => {
  const api = skinsApi
  if (api.isLocked(id)) { playSound('barricade', 0.04); return }
  if (api.isSelected(id)) return
  if (api.isOwned(id)) {
    if (api.selectSkin(id)) playSound('anchor-swap', 0.05)
    return
  }
  if (api.buySkin(id)) playSound('level-up', 0.06)
  else playSound('barricade', 0.04)
}
</script>

<template lang="pug">
  FModal(v-model="isOpen" :title="t('skins.title')")
    div.flex.flex-col.gap-2.p-2
      p.text-center.text-white.game-text.opacity-80(class="text-xs sm:text-sm") {{ t('skins.subtitle') }}
      div.grid.gap-2(class="grid-cols-2 sm:grid-cols-3")
        div.skin-card.relative.flex.flex-col.items-center.gap-1.rounded-xl.border-2.p-2(
          v-for="card in cards"
          :key="card.id"
          class="bg-black/30"
          :class="card.selected ? 'border-yellow-300' : RARITY_BORDER[card.rarity]"
        )
          //- "NEW!" flag for a freshly-unlocked / never-seen skin.
          div.absolute.z-10.rounded-full.border.font-black.game-text.text-white.uppercase(
            v-if="card.isNew"
            class="-top-1 -left-1 px-1.5 py-0.5 text-[8px] bg-rose-500 border-white"
          ) {{ t('skins.new') }}
          //- Rarity tag (rare / epic only — common needs no callout).
          div.absolute.z-10.rounded-full.font-black.game-text.uppercase(
            v-if="card.rarity !== 'common'"
            class="-top-1 -right-1 px-1.5 py-0.5 text-[8px] border border-white"
            :class="card.rarity === 'epic' ? 'bg-purple-500 text-white' : 'bg-sky-500 text-white'"
          ) {{ t('skins.rarity.' + card.rarity) }}
          //- Texture preview as a sphere-ish disc. The badge lives on this
          //- (non-clipping) wrapper, NOT inside the clipped image circle, so it
          //- overlaps the skin instead of being cut off. (Slash-opacity utilities
          //- like `border-black/40` must live in `class=""` — Pug's dot-class
          //- shorthand chokes on the `/` and dumps the rest as literal text.)
          div.relative(class="w-14 h-14 sm:w-16 sm:h-16")
            div.rounded-full.overflow-hidden.border-2.w-full.h-full(class="border-black/40")
              img.w-full.h-full.object-cover(:src="card.preview" alt="" :class="card.locked ? 'grayscale' : ''")
            //- Stage-lock overlay: grey scrim + padlock until the gate is met.
            div.absolute.inset-0.flex.items-center.justify-center.rounded-full(
              v-if="card.locked"
              class="bg-black/60"
            )
              svg(viewBox="0 0 24 24" class="w-6 h-6 text-white" fill="currentColor")
                path(d="M12 2 a5 5 0 0 0 -5 5 v3 H6 a2 2 0 0 0 -2 2 v7 a2 2 0 0 0 2 2 h12 a2 2 0 0 0 2 -2 v-7 a2 2 0 0 0 -2 -2 h-1 V7 a5 5 0 0 0 -5 -5 Z M9 10 V7 a3 3 0 0 1 6 0 v3 Z")
            //- Equipped check badge — over the image, clear of the clip.
            div.absolute.flex.items-center.justify-center.rounded-full.border-2.shadow(
              v-if="card.selected"
              class="w-5 h-5 top-0 right-0 bg-emerald-500 border-white"
            )
              span.text-white.font-black(class="text-[10px]") ✓
          div.font-black.game-text.text-white(class="text-xs sm:text-sm") {{ card.name }}
          //- Action: locked / equipped / equip / buy.
          div.text-center.text-white.game-text.opacity-70(v-if="card.locked" class="text-[10px] sm:text-xs") {{ t('skins.locked', { n: card.unlockStage }) }}
          template(v-else)
            div.text-center.text-emerald-300.font-black.game-text(v-if="card.selected" class="text-[10px] sm:text-xs") {{ t('skins.equipped') }}
            button.cursor-pointer.transition-transform.flex.items-center.justify-center.gap-1.rounded-lg.border-2.px-3(
              v-else
              class="py-1 active:scale-95 hover:scale-[103%] bg-gradient-to-b from-[#ffcd00] to-[#f7a000] border-[#0f1a30] disabled:opacity-50 disabled:grayscale"
              :disabled="!card.owned && !card.canBuy"
              @click="onCardAction(card.id)"
            )
              template(v-if="card.owned")
                span.font-black.game-text.text-white(class="text-xs") {{ t('skins.equip') }}
              template(v-else)
                IconCoin(class="w-4 h-4 text-yellow-100")
                span.font-black.game-text.text-white(class="text-sm") {{ card.cost }}
</template>

<style scoped lang="sass">
.skin-card
  transition: all 0.15s ease
</style>
